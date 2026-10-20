import pandas as pd
from airsight.models import registry as r


def test_clean_bundle_loads_with_fitted_calibration():
    b = r.load_artifacts("clean_20261020", 24)
    assert float(b["calibration"]["scale"]) > 0
    row = pd.DataFrame([{f: 1.0 for f in b["features"]}])
    out = r.predict_frame(b, row)
    assert (out["p10"] <= out["p50"]).all() and (out["p50"] <= out["p90"]).all()
