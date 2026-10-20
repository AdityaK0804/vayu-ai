import numpy as np
import pandas as pd

from airsight.models.registry import predict_frame


class _Const:
    def __init__(self, v):
        self.v = v

    def predict(self, x):
        return np.full(len(x), self.v)


def _bundle(transform):
    return {"version": "t", "features": ["a"], "target_transform": transform, "calibration": {},
            "p10": {"model": _Const(np.log1p(10.0))}, "p50": {"model": _Const(np.log1p(20.0))},
            "p90": {"model": _Const(np.log1p(40.0))}}


def test_log1p_bundle_maps_back_to_ugm3():
    out = predict_frame(_bundle("log1p"), pd.DataFrame({"a": [1.0, 2.0]}))
    assert np.allclose(out["p10"], 10.0) and np.allclose(out["p50"], 20.0) and np.allclose(out["p90"], 40.0)


def test_untransformed_bundle_unchanged():
    out = predict_frame(_bundle("none"), pd.DataFrame({"a": [1.0]}))
    assert np.isclose(out["p50"].iloc[0], np.log1p(20.0))
