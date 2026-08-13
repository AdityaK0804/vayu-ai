#!/usr/bin/env python3
"""DuckDB-backed H3 spatial aggregation for Project Vayu / AirSight.

Why DuckDB (vs pandas-only spatial joins)
-----------------------------------------
- Columnar execution + predicate pushdown over Parquet/CSV without loading
  entire frames into RAM.
- SQL group-bys over millions of station-hours stay in-process (no Spark).
- H3 cell IDs are just strings — perfect partition/group keys once assigned.
- We still use `h3-py` for cell assignment (stable v3/v4 API), then let DuckDB
  do the heavy aggregations and Parquet writes.

This script is an **optimized path** for common pipeline steps:
  1) Point observations (lat/lon + value) → H3 cell
  2) Aggregate mean/count per cell (optionally per hour)
  3) Write GeoParquet-friendly flat Parquet under data/processed/duckdb/

It can run on real city feature parquets under data/grid/ or on a synthetic
demo if those files are missing (so CI/local can smoke-test without full data).

Usage
-----
  python scripts/pipeline_optimized.py
  python scripts/pipeline_optimized.py --city korba --res 8
  python scripts/pipeline_optimized.py --input data/grid/korba.parquet --lat-col lat --lon-col lon
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

# repo root on path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import DATA, ensure, ok, say, warn  # type: ignore

try:
    import duckdb
except ImportError as e:  # pragma: no cover
    raise SystemExit(
        "duckdb is required. Install with:\n"
        "  pip install duckdb\n"
        "or add duckdb>=1.0 to requirements.txt / requirements-backend.txt"
    ) from e

try:
    import h3
except ImportError as e:  # pragma: no cover
    raise SystemExit("h3 is required: pip install h3") from e


OUT_DIR = DATA / "processed" / "duckdb"


def _latlng_to_cell(lat: float, lon: float, res: int) -> str | None:
    """H3 v3/v4 compatible cell id; None if coords invalid."""
    if lat is None or lon is None:
        return None
    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (TypeError, ValueError):
        return None
    if not (-90.0 <= lat_f <= 90.0 and -180.0 <= lon_f <= 180.0):
        return None
    try:
        return h3.latlng_to_cell(lat_f, lon_f, res)  # v4
    except AttributeError:
        return h3.geo_to_h3(lat_f, lon_f, res)  # v3
    except Exception:
        return None


def _pick_col(cols: list[str], candidates: list[str]) -> str | None:
    lower = {c.lower(): c for c in cols}
    for name in candidates:
        if name.lower() in lower:
            return lower[name.lower()]
    return None


def _register_h3(con: duckdb.DuckDBPyConnection, res: int) -> None:
    def h3_cell(lat: float | None, lon: float | None) -> str | None:
        return _latlng_to_cell(lat, lon, res)

    # DuckDB Python UDF — explicit types (API varies slightly by version)
    try:
        con.create_function("h3_cell", h3_cell, ["DOUBLE", "DOUBLE"], "VARCHAR")
    except TypeError:
        con.create_function("h3_cell", h3_cell, return_type="VARCHAR")


def _connect() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(database=":memory:")
    # Prefer threads for multi-core laptops
    con.execute("PRAGMA threads=4")
    return con


def load_or_demo(
    con: duckdb.DuckDBPyConnection,
    input_path: Path | None,
    city: str | None,
    lat_col: str | None,
    lon_col: str | None,
    val_col: str | None,
) -> tuple[str, str, str, str]:
    """Create view `obs` and return (lat, lon, val, source_label)."""
    path = input_path
    if path is None and city:
        cand = DATA / "grid" / f"{city}.parquet"
        if cand.exists():
            path = cand

    if path is not None and path.exists():
        say(f"reading {path}")
        # DuckDB can scan parquet/csv directly
        if path.suffix.lower() == ".csv":
            con.execute(
                f"CREATE OR REPLACE VIEW raw AS SELECT * FROM read_csv_auto('{path.as_posix()}')"
            )
        else:
            con.execute(
                f"CREATE OR REPLACE VIEW raw AS SELECT * FROM read_parquet('{path.as_posix()}')"
            )
        cols = [r[0] for r in con.execute("DESCRIBE raw").fetchall()]
        lat = lat_col or _pick_col(cols, ["lat", "latitude", "y", "station_lat"])
        lon = lon_col or _pick_col(cols, ["lon", "lng", "longitude", "x", "station_lon"])
        val = val_col or _pick_col(
            cols, ["pm25", "pm2_5", "PM2.5", "value", "pm25_ug_m3", "display_pm25"]
        )
        if not lat or not lon:
            raise SystemExit(
                f"Could not detect lat/lon columns in {path}. "
                f"Found: {cols}. Pass --lat-col / --lon-col."
            )
        if not val:
            # constant 1 → cell occupancy counts still useful
            warn("no value column found — using 1.0 as val (counts only)")
            con.execute(
                f"""
                CREATE OR REPLACE VIEW obs AS
                SELECT CAST({lat} AS DOUBLE) AS lat,
                       CAST({lon} AS DOUBLE) AS lon,
                       1.0::DOUBLE AS val
                FROM raw
                WHERE {lat} IS NOT NULL AND {lon} IS NOT NULL
                """
            )
            val = "val"
        else:
            con.execute(
                f"""
                CREATE OR REPLACE VIEW obs AS
                SELECT CAST({lat} AS DOUBLE) AS lat,
                       CAST({lon} AS DOUBLE) AS lon,
                       CAST({val} AS DOUBLE) AS val
                FROM raw
                WHERE {lat} IS NOT NULL AND {lon} IS NOT NULL
                  AND {val} IS NOT NULL
                """
            )
            val = "val"
        return "lat", "lon", val, path.name

    # Synthetic demo for empty checkouts
    warn("no input parquet found — generating synthetic Chhattisgarh demo points")
    con.execute(
        """
        CREATE OR REPLACE VIEW obs AS
        SELECT * FROM (VALUES
          (22.3595, 82.7501, 48.0),
          (22.3610, 82.7480, 52.0),
          (21.2514, 81.6296, 41.0),
          (21.1900, 81.2800, 38.0),
          (19.0748, 82.0080, 22.0),
          (23.1200, 83.2000, 28.0)
        ) AS t(lat, lon, val)
        """
    )
    return "lat", "lon", "val", "synthetic_demo"


def aggregate_h3(
    con: duckdb.DuckDBPyConnection,
    res: int,
    out_path: Path,
) -> int:
    """Assign H3 cells and write aggregated parquet. Returns row count."""
    _register_h3(con, res)
    ensure(out_path.parent)

    # Materialize cells then aggregate — keeps UDF cost explicit
    t0 = time.perf_counter()
    con.execute(
        """
        CREATE OR REPLACE TABLE cells AS
        SELECT
          h3_cell(lat, lon) AS h3_cell,
          lat, lon, val
        FROM obs
        WHERE h3_cell(lat, lon) IS NOT NULL
        """
    )
    n_pts = con.execute("SELECT COUNT(*) FROM cells").fetchone()[0]
    say(f"points mapped to H3 r{res}: {n_pts}")

    con.execute(
        f"""
        COPY (
          SELECT
            h3_cell,
            COUNT(*)::BIGINT AS n_obs,
            AVG(val)::DOUBLE AS val_mean,
            MIN(val)::DOUBLE AS val_min,
            MAX(val)::DOUBLE AS val_max,
            STDDEV_SAMP(val)::DOUBLE AS val_std,
            {res}::INTEGER AS h3_res
          FROM cells
          GROUP BY h3_cell
          ORDER BY n_obs DESC
        ) TO '{out_path.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)
        """
    )
    n_cells = con.execute(
        f"SELECT COUNT(*) FROM read_parquet('{out_path.as_posix()}')"
    ).fetchone()[0]
    dt = time.perf_counter() - t0
    ok(f"wrote {n_cells} H3 cells → {out_path} ({dt:.3f}s)")
    return int(n_cells)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="DuckDB + H3 optimized aggregation for Vayu")
    p.add_argument("--city", default=None, help="city id under data/grid/<city>.parquet")
    p.add_argument("--input", type=Path, default=None, help="explicit CSV/Parquet path")
    p.add_argument("--res", type=int, default=8, help="H3 resolution (default 8 ≈ city block)")
    p.add_argument("--lat-col", default=None)
    p.add_argument("--lon-col", default=None)
    p.add_argument("--val-col", default=None)
    p.add_argument(
        "--out",
        type=Path,
        default=None,
        help="output parquet (default data/processed/duckdb/h3_agg_<tag>.parquet)",
    )
    args = p.parse_args(argv)

    con = _connect()
    lat, lon, val, tag = load_or_demo(
        con, args.input, args.city, args.lat_col, args.lon_col, args.val_col
    )
    say(f"obs columns: {lat},{lon},{val} · source={tag}")

    safe_tag = Path(tag).stem.replace(" ", "_")
    out = args.out or (OUT_DIR / f"h3_agg_{safe_tag}_r{args.res}.parquet")
    aggregate_h3(con, args.res, out)

    # Preview
    preview = con.execute(
        f"""
        SELECT h3_cell, n_obs, round(val_mean, 2) AS val_mean
        FROM read_parquet('{out.as_posix()}')
        ORDER BY n_obs DESC
        LIMIT 5
        """
    ).fetchdf()
    say("top cells:")
    print(preview.to_string(index=False))
    con.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
