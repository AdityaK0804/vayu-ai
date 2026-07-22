"""
Data loader — reads the 4 NASA-POWER CSVs, 3 FIRMS fire CSVs, and the
healthcare facility register, then merges them into a single wide-format
DataFrame suitable for ML training.

Columns produced per row (one row = one district × one date):
    district, division, lat, lon, date,
    temperature, rainfall, humidity, ghi,
    fire_count, fire_frp_sum, fire_frp_max, fire_brightness_max, fire_confidence_mean,
    healthcare_facility_count
"""

from __future__ import annotations
import pandas as pd
import numpy as np
from pathlib import Path

DATASET_DIR = Path(__file__).resolve().parents[2] / "dataset"

CSV_FILES = {
    "temperature": "cg_TEMPERATURE_1984_2024.csv",
    "rainfall":    "cg_RAINFALL_1984_2024.csv",
    "humidity":    "cg_HUMIDITY_1984_2024.csv",
    "ghi":         "cg_GHI_1984_2024.csv",
}

FIRMS_FILES = [
    "cg_FIRMS_MODIS_20001101_20260313.csv",
    "cg_FIRMS_VIIRS_SNPP_20001101_20260313.csv",
    "cg_FIRMS_VIIRS_NOAA20_20001101_20260313.csv",
]

HEALTHCARE_FILE = "all.csv"

# District centroids (from climate CSVs) for nearest-district assignment
_DISTRICT_CENTROIDS: dict[str, tuple[float, float]] = {
    "Balod": (20.7322, 81.2063), "Baloda Bazar": (21.6555, 82.1597),
    "Balrampur": (23.1040, 83.5900), "Bastar": (19.1280, 81.9474),
    "Bemetara": (21.7148, 81.5327), "Bijapur": (18.8376, 80.7595),
    "Bilaspur": (22.0797, 82.1391), "Dantewada": (18.8994, 81.3479),
    "Dhamtari": (20.7073, 81.5491), "Durg": (21.1904, 81.2849),
    "Gariaband": (20.6333, 82.0500), "Janjgir-Champa": (22.0115, 82.5769),
    "Jashpur": (22.8868, 84.1412), "Kabirdham": (22.0120, 81.2680),
    "Kanker": (20.2727, 81.4897), "Kondagaon": (19.5952, 81.6626),
    "Korba": (22.3595, 82.7501), "Koriya": (23.2985, 82.5713),
    "Mahasamund": (21.1078, 82.0957), "Mungeli": (22.0633, 81.6849),
    "Narayanpur": (19.6974, 81.2387), "Raigarh": (21.8974, 83.3950),
    "Raipur": (21.2514, 81.6296), "Rajnandgaon": (21.0972, 81.0289),
    "Sukma": (18.3912, 81.6600), "Surajpur": (23.2218, 82.8720),
    "Surguja": (23.1179, 83.0971),
}


def load_single_csv(name: str, filename: str) -> pd.DataFrame:
    """Load one climate-parameter CSV and return a slim DataFrame."""
    path = DATASET_DIR / filename
    df = pd.read_csv(
        path,
        usecols=["district", "division", "lat", "lon", "date", "value"],
        parse_dates=["date"],
    )
    df = df.rename(columns={"value": name})
    return df


def _nearest_district(lat: float, lon: float) -> str:
    """Map a lat/lon point to the nearest district centroid."""
    best, best_d = "Raipur", float("inf")
    for name, (clat, clon) in _DISTRICT_CENTROIDS.items():
        d = (lat - clat) ** 2 + (lon - clon) ** 2
        if d < best_d:
            best, best_d = name, d
    return best


def load_firms_data() -> pd.DataFrame:
    """
    Load all 3 FIRMS CSVs, assign each fire point to the nearest district,
    and aggregate to daily district-level fire stats.

    Returns DataFrame with columns:
        district, date, fire_count, fire_frp_sum, fire_frp_max,
        fire_brightness_max, fire_confidence_mean
    """
    parts = []
    for fname in FIRMS_FILES:
        path = DATASET_DIR / fname
        if not path.exists():
            continue
        # Use common columns across MODIS / VIIRS
        cols_available = pd.read_csv(path, nrows=0).columns.tolist()
        use_cols = ["latitude", "longitude", "acq_date", "frp"]
        # brightness column differs: 'brightness' (MODIS) vs 'bright_ti4' (VIIRS)
        bright_col = "brightness" if "brightness" in cols_available else "bright_ti4"
        use_cols.append(bright_col)
        # confidence column
        if "confidence" in cols_available:
            use_cols.append("confidence")

        df = pd.read_csv(path, usecols=use_cols, low_memory=False)
        df = df.rename(columns={bright_col: "brightness"})
        df["acq_date"] = pd.to_datetime(df["acq_date"], errors="coerce")
        df["frp"] = pd.to_numeric(df["frp"], errors="coerce").fillna(0)
        df["brightness"] = pd.to_numeric(df["brightness"], errors="coerce").fillna(0)
        if "confidence" in df.columns:
            df["confidence"] = pd.to_numeric(df["confidence"], errors="coerce").fillna(0)
        else:
            df["confidence"] = 50.0  # default mid-confidence
        parts.append(df)

    if not parts:
        return pd.DataFrame()

    fires = pd.concat(parts, ignore_index=True)
    fires = fires.dropna(subset=["latitude", "longitude", "acq_date"])

    # Assign each fire point to nearest district
    fires["district"] = fires.apply(
        lambda r: _nearest_district(r["latitude"], r["longitude"]), axis=1
    )

    # Aggregate per district per day
    daily = (
        fires.groupby(["district", "acq_date"])
        .agg(
            fire_count=("frp", "size"),
            fire_frp_sum=("frp", "sum"),
            fire_frp_max=("frp", "max"),
            fire_brightness_max=("brightness", "max"),
            fire_confidence_mean=("confidence", "mean"),
        )
        .reset_index()
        .rename(columns={"acq_date": "date"})
    )
    return daily


def load_healthcare_counts() -> pd.DataFrame:
    """
    Load healthcare facility register and count facilities per district.
    Returns DataFrame with columns: district, healthcare_facility_count
    """
    path = DATASET_DIR / HEALTHCARE_FILE
    if not path.exists():
        return pd.DataFrame(columns=["district", "healthcare_facility_count"])

    df = pd.read_csv(path, usecols=["District_name"], low_memory=False)
    # Standardise district names to title case
    df["district"] = df["District_name"].str.strip().str.title()

    # Map to our canonical district names (fuzzy match by containment)
    canonical = list(_DISTRICT_CENTROIDS.keys())
    name_map: dict[str, str] = {}
    for raw in df["district"].unique():
        raw_lower = str(raw).lower()
        for c in canonical:
            if c.lower() in raw_lower or raw_lower in c.lower():
                name_map[raw] = c
                break

    df["district"] = df["district"].map(name_map)
    df = df.dropna(subset=["district"])

    counts = df.groupby("district").size().reset_index(name="healthcare_facility_count")
    return counts


def load_climate_data(
    start_year: int | None = None,
    end_year: int | None = None,
    include_fires: bool = True,
    include_healthcare: bool = True,
) -> pd.DataFrame:
    """
    Load all 4 climate CSVs, optionally merge FIRMS fire data and healthcare
    counts, and return a wide DataFrame.

    Parameters
    ----------
    start_year : restrict to >= this year
    end_year   : restrict to <= this year
    include_fires : merge daily fire aggregates (default True)
    include_healthcare : merge facility counts per district (default True)
    """
    frames = {}
    for name, filename in CSV_FILES.items():
        frames[name] = load_single_csv(name, filename)

    # Merge climate on the shared keys
    base = frames["temperature"]
    for name in ["rainfall", "humidity", "ghi"]:
        base = base.merge(
            frames[name][["district", "date", name]],
            on=["district", "date"],
            how="inner",
        )

    base["date"] = pd.to_datetime(base["date"])
    base = base.sort_values(["district", "date"]).reset_index(drop=True)

    if start_year is not None:
        base = base[base["date"].dt.year >= start_year]
    if end_year is not None:
        base = base[base["date"].dt.year <= end_year]

    # Merge FIRMS fire data (left join — days without fires get 0)
    if include_fires:
        print("  Loading FIRMS fire data ...")
        fire_df = load_firms_data()
        if not fire_df.empty:
            fire_df["date"] = pd.to_datetime(fire_df["date"])
            base = base.merge(fire_df, on=["district", "date"], how="left")
            fire_cols = ["fire_count", "fire_frp_sum", "fire_frp_max",
                         "fire_brightness_max", "fire_confidence_mean"]
            base[fire_cols] = base[fire_cols].fillna(0)
            print(f"  Merged {len(fire_df):,} fire-day records")

    # Merge healthcare facility counts (static per district)
    if include_healthcare:
        hc = load_healthcare_counts()
        if not hc.empty:
            base = base.merge(hc, on="district", how="left")
            base["healthcare_facility_count"] = base["healthcare_facility_count"].fillna(0).astype(int)
            print(f"  Merged healthcare counts for {len(hc)} districts")

    return base.reset_index(drop=True)


def get_districts(df: pd.DataFrame) -> list[str]:
    return sorted(df["district"].unique().tolist())


if __name__ == "__main__":
    df = load_climate_data(start_year=2015)
    print(f"\nLoaded {len(df):,} rows  |  {df['district'].nunique()} districts")
    print(f"Date range: {df['date'].min().date()} -> {df['date'].max().date()}")
    print(f"Columns ({len(df.columns)}): {list(df.columns)}")
    print(df.head())
    print("\nColumn types:")
    print(df.dtypes)
    print(f"\nFire columns sample (non-zero):")
    fire_rows = df[df["fire_count"] > 0]
    print(f"  {len(fire_rows):,} rows with fire detections")
    if len(fire_rows) > 0:
        print(fire_rows[["district", "date", "fire_count", "fire_frp_sum"]].head(10))
