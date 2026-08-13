"""ML models — baselines (persistence, CAMS), LightGBM temporal, STGNN prototype."""

from airsight.models.stgnn import (  # noqa: F401
    H3Graph,
    STGNN,
    build_h3_graph,
    train_stgnn_demo,
)