import numpy as np
import pandas as pd

from airsight.features import fire_upwind as fu

P = dict(window_h=24, radius_km=100, sector_deg=90)
LAT0, LON0 = 21.25, 81.63


def _fires():
    return pd.DataFrame({
        "ts": ["2025-11-01T10:00:00Z", "2025-11-01T10:00:00Z", "2025-11-01T11:00:00Z",
               "2025-11-01T09:00:00Z", "2025-10-30T09:00:00Z", "2025-11-01T09:00:00Z"],
        # north 0.3 deg (~33 km); same spot again (dedupe -> max); south; far north; old
        "lat": [LAT0 + 0.3, LAT0 + 0.3, LAT0 - 0.3, LAT0 + 3.0, LAT0 + 0.3, LAT0 + 0.31],
        "lon": [LON0, LON0, LON0, LON0, LON0, LON0],
        "frp": [10.0, 25.0, 40.0, 99.0, 50.0, 5.0],
    })


def test_sector_window_radius_and_dedupe():
    t = ["2025-11-01T12:00:00Z"]
    # Wind from north (0 deg): north fires within 100 km in last 24 h; same spot keeps max (25).
    assert fu.upwind_frp(_fires(), LAT0, LON0, t, [0.0], **P)[0] == 25.0 + 5.0
    # Wind from south: only the southern fire.
    assert fu.upwind_frp(_fires(), LAT0, LON0, t, [180.0], **P)[0] == 40.0
    # Full circle: all near, in-window fires.
    assert fu.upwind_frp(_fires(), LAT0, LON0, t, [0.0], **{**P, "sector_deg": 360})[0] == 70.0


def test_no_fires_is_zero_and_missing_wind_is_nan():
    t = ["2025-11-01T12:00:00Z"]
    assert fu.upwind_frp(_fires().iloc[:0], LAT0, LON0, t, [0.0], **P)[0] == 0.0
    assert np.isnan(fu.upwind_frp(_fires(), LAT0, LON0, t, [np.nan], **P)[0])


def test_params_come_from_config():
    p = fu.params()
    assert set(p) == {"window_h", "radius_km", "sector_deg"}
