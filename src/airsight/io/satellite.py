"""Satellite data loader.

Loads MODIS AOD, Sentinel-5P NO2, and Sentinel-5P SO2 data from ``data/satellite/<channel>/<city_id>/*.csv``.
Returns empty DataFrames gracefully if folders/files are missing.
"""

from __future__ import annotations

import logging
from pathlib import Path
import pandas as pd

from airsight.config import DATA

logger = logging.getLogger(__name__)

SATELLITE_COLUMNS = ["cell_id", "date", "mean"]

# Physically plausible ranges after scaling (DATA-05). Values outside are
# cloud/ice/retrieval artefacts that slipped through, or unscaled exports.
VALID_RANGE: dict[str, tuple[float, float]] = {
    "aod": (0.0, 5.0),            # unitless AOD at 550 nm
    "no2": (-5e-5, 1e-3),         # mol/m^2 tropospheric column (small negatives = noise)
    "so2": (-1e-3, 5e-2),         # mol/m^2
}
MODIS_AOD_SCALE = 0.001


def qa_filter(df: pd.DataFrame, channel: str) -> tuple[pd.DataFrame, dict[str, int]]:
    """Scale, range-mask and de-duplicate one channel's rows.

    * MODIS AOD exported without the 0.001 scale factor (values > 5) is scaled.
    * Values outside :data:`VALID_RANGE` become NaN (masked, not clipped).
    * Duplicate ``(cell_id, date)`` rows from overlapping exports are averaged.
    """
    out = df.copy()
    out["mean"] = pd.to_numeric(out["mean"], errors="coerce")
    stats = {"n_in": int(len(out)), "scaled": 0, "masked": 0, "duplicates": 0}
    if channel == "aod":
        raw = out["mean"] > VALID_RANGE["aod"][1]
        if raw.mean() > 0.5:  # whole export is unscaled integers
            out["mean"] = out["mean"] * MODIS_AOD_SCALE
            stats["scaled"] = int(len(out))
    lo, hi = VALID_RANGE[channel]
    bad = out["mean"].notna() & ((out["mean"] < lo) | (out["mean"] > hi))
    stats["masked"] = int(bad.sum())
    out.loc[bad, "mean"] = float("nan")
    before = len(out)
    out = out.groupby(["cell_id", "date"], as_index=False)["mean"].mean()
    stats["duplicates"] = int(before - len(out))
    if stats["masked"] or stats["duplicates"] or stats["scaled"]:
        logger.info("satellite QA %s: %s", channel, stats)
    return out, stats


def load_satellite(city_id: str, channel: str) -> pd.DataFrame:
    """Load satellite data for a given city and channel (aod, no2, so2)."""
    if channel not in ("aod", "no2", "so2"):
        raise ValueError(f"Invalid channel: {channel}. Expected aod, no2, or so2.")

    channel_dir = DATA / "satellite" / channel / city_id
    if not channel_dir.exists():
        logger.warning(f"Satellite channel directory missing: {channel_dir}")
        return pd.DataFrame(columns=SATELLITE_COLUMNS)

    csv_files = list(channel_dir.glob("*.csv"))
    if not csv_files:
        logger.warning(f"No satellite CSV files found in {channel_dir}")
        return pd.DataFrame(columns=SATELLITE_COLUMNS)

    frames = []
    for path in csv_files:
        try:
            # The GEE export columns: cell_id, date, mean
            df = pd.read_csv(path, parse_dates=["date"])
            for col in SATELLITE_COLUMNS:
                if col not in df.columns:
                    df[col] = float("nan")
            frames.append(df[SATELLITE_COLUMNS])
        except Exception as e:
            logger.error(f"Error reading satellite file {path.name}: {e}")

    if not frames:
        return pd.DataFrame(columns=SATELLITE_COLUMNS)

    combined = pd.concat(frames, ignore_index=True)
    combined, _ = qa_filter(combined, channel)
    combined.sort_values(["cell_id", "date"], inplace=True)
    return combined.reset_index(drop=True)
