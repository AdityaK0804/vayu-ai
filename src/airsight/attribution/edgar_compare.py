"""Source attribution prototype.

WARNING: This is an evidence-backed prioritisation prototype, not court-ready
liability tracking. It compares static emissions inventory (EDGAR) fractions
with simplistic proxy signals derived from panel features.

Outputs cosine similarity and MAE between the two fraction vectors.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error


def normalize_fractions(row: pd.Series, cols: list[str]) -> np.ndarray:
    """Normalize a set of values to sum to 1."""
    vals = row[cols].fillna(0).values.astype(float)
    total = vals.sum()
    if total == 0:
        return np.ones(len(cols)) / len(cols)
    return vals / total


def cosine_similarity(u: np.ndarray, v: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    dot = np.dot(u, v)
    norm = np.linalg.norm(u) * np.linalg.norm(v)
    if norm == 0:
        return 0.0
    return float(dot / norm)


def run_attribution_comparison(panel: pd.DataFrame) -> dict:
    """Compare EDGAR sector fractions to a proxy fraction vector.

    Parameters
    ----------
    panel : pd.DataFrame
        Must have static features merged (e.g. edgar_Power_pm25, fire_frp_sum_25km).

    Returns
    -------
    dict
        Evaluation metrics and station-level comparison records.
    """
    # Required EDGAR sectors
    edgar_cols = [
        "edgar_Power_pm25",
        "edgar_Industry_pm25",
        "edgar_Transport_pm25",
        "edgar_agriculture_pm25",
        "edgar_residential_pm25",
    ]
    missing = [c for c in edgar_cols if c not in panel.columns]
    if missing:
        raise ValueError(f"Missing EDGAR columns: {missing}. Run features_static first.")

    # We evaluate at the station level by taking the mean of temporal proxy signals
    # over the entire dataset, comparing to static EDGAR.
    agg_dict = {c: "first" for c in edgar_cols}
    if "fire_frp_sum_25km" in panel.columns:
        agg_dict["fire_frp_sum_25km"] = "mean"
        
    stations = panel.groupby("station_id").agg(agg_dict).reset_index()

    records = []
    total_mae = []
    total_cos = []

    for _, row in stations.iterrows():
        sid = row["station_id"]

        # 1. EDGAR Fractions
        edgar_fracs = normalize_fractions(row, edgar_cols)
        edgar_dict = dict(zip([c.split("_")[1] for c in edgar_cols], edgar_fracs))
        top_edgar = max(edgar_dict, key=edgar_dict.get)

        # 2. Proxy Fractions
        # Simple heuristic prototype:
        # - Base industrial/power on EDGAR shares (could be replaced by satellite NO2 in future)
        power = row["edgar_Power_pm25"]
        industry = row["edgar_Industry_pm25"]
        
        # - Agriculture / biomass proxy boosted by mean FIRMS fire activity
        fire_mean = row.get("fire_frp_sum_25km", 0.0)
        # Add a scaled baseline + fire boost to proxy agriculture/residential
        agri = row["edgar_agriculture_pm25"] + (fire_mean * 0.1)
        res = row["edgar_residential_pm25"]
        
        # - Transport default (could use TomTom data here in the future)
        trans = row["edgar_Transport_pm25"]

        proxy_vals = pd.Series([power, industry, trans, agri, res])
        proxy_fracs = normalize_fractions(proxy_vals, [0, 1, 2, 3, 4])
        proxy_dict = dict(zip([c.split("_")[1] for c in edgar_cols], proxy_fracs))
        top_proxy = max(proxy_dict, key=proxy_dict.get)

        # Metrics
        mae = float(mean_absolute_error(edgar_fracs, proxy_fracs))
        cos = cosine_similarity(edgar_fracs, proxy_fracs)
        
        total_mae.append(mae)
        total_cos.append(cos)

        records.append({
            "station_id": sid,
            "top_edgar_sector": top_edgar,
            "top_proxy_sector": top_proxy,
            "cosine_similarity": cos,
            "mae": mae,
            "edgar_fractions": edgar_dict,
            "proxy_fractions": proxy_dict,
        })

    return {
        "disclaimer": "WARNING: This is an evidence-backed prioritisation prototype, not court-ready liability tracking.",
        "mean_mae": float(np.mean(total_mae)),
        "mean_cosine_similarity": float(np.mean(total_cos)),
        "stations": records,
    }
