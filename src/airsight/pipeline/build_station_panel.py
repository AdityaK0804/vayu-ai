"""Build the per-city station panel — CPCB hourly data, normalised and enriched.

CLI usage::

    python -m airsight.pipeline.build_station_panel --city korba
    python -m airsight.pipeline.build_station_panel               # all cities

Outputs (per city):
    outputs/reports/station_panel_<city>.parquet
    outputs/reports/station_panel_<city>_quality.json
"""

from __future__ import annotations

import argparse
import json
import sys

import pandas as pd

from airsight.config import OUTPUTS, load_cities
from airsight.io.cpcb import load_cpcb_city


def _build_one(city_id: str) -> None:
    """Build station panel for a single city."""
    print(f"\n{'='*60}")
    print(f"  Building station panel: {city_id}")
    print(f"{'='*60}")

    df = load_cpcb_city(city_id)
    if df.empty:
        print(f"  [!] Skipping {city_id} — no data.")
        return

    out_dir = OUTPUTS / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)

    # ---- Write parquet (fall back to CSV if pyarrow not available) ----
    parquet_path = out_dir / f"station_panel_{city_id}.parquet"
    try:
        df.to_parquet(parquet_path, index=False, engine="pyarrow")
        print(f"  [OK] {parquet_path}  ({len(df):,} rows)")
    except Exception as exc:
        csv_path = out_dir / f"station_panel_{city_id}.csv"
        df.to_csv(csv_path, index=False)
        print(f"  [!] Parquet failed ({exc}); wrote CSV instead: {csv_path}")

    # ---- Quality report ----
    ts_col = df["timestamp"].dropna()
    n_stations = df["station_id"].nunique()

    pm25_total = len(df)
    pm25_missing = int(df["pm25"].isna().sum()) if "pm25" in df.columns else pm25_total

    quality = {
        "city_id": city_id,
        "rows": len(df),
        "stations_count": n_stations,
        "station_ids": sorted(df["station_id"].unique().tolist()),
        "date_range": {
            "min": str(ts_col.min()) if len(ts_col) else None,
            "max": str(ts_col.max()) if len(ts_col) else None,
        },
        "pm25_missing_pct": round(100.0 * pm25_missing / pm25_total, 2)
            if pm25_total else None,
        "columns": sorted(df.columns.tolist()),
    }

    quality_path = out_dir / f"station_panel_{city_id}_quality.json"
    with open(quality_path, "w") as fh:
        json.dump(quality, fh, indent=2, default=str)
    print(f"  [OK] {quality_path}")

    # Print summary
    print(f"\n  Summary for {city_id}:")
    print(f"    Rows:            {quality['rows']:,}")
    print(f"    Stations:        {quality['stations_count']}")
    print(f"    Date range:      {quality['date_range']['min']} -> "
          f"{quality['date_range']['max']}")
    print(f"    PM2.5 missing:   {quality['pm25_missing_pct']}%")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build CPCB station panel (normalised hourly Parquet)."
    )
    parser.add_argument(
        "--city",
        type=str,
        default=None,
        help="City ID (e.g. korba). Omit to build all cities with stations.",
    )
    args = parser.parse_args()

    if args.city:
        _build_one(args.city)
    else:
        for city in load_cities(include_optional=True):
            if city.get("has_stations"):
                _build_one(city["id"])

    print("\nDone.")


if __name__ == "__main__":
    main()
