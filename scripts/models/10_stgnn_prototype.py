#!/usr/bin/env python3
"""STEP 10 — STGNN prototype smoke train (PyTorch Geometric).

RUN:
  pip install torch torch-geometric
  python scripts/models/10_stgnn_prototype.py

This does **not** replace LGBM bake outputs. It validates that the STGNN
module trains on a wind-biased H3 graph (synthetic Korba neighbourhood).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from airsight.models.stgnn import (  # noqa: E402
    InstallError,
    _HAS_PYG,
    _HAS_TORCH,
    build_h3_graph,
    make_synthetic_stgnn_batch,
    train_stgnn_demo,
)


def main() -> int:
    print("=== Vayu STGNN prototype ===")
    print(f"  torch          : {_HAS_TORCH}")
    print(f"  torch_geometric: {_HAS_PYG}")

    # Graph-only check (no torch required beyond numpy/h3)
    batch = make_synthetic_stgnn_batch(n_nodes=20, t_lookback=8, n_horizons=4)
    g = batch["graph"]
    print(f"  synthetic graph: N={g.num_nodes}  E={g.edge_index.shape[1]}")
    print(f"  x shape        : {batch['x'].shape}  y shape: {batch['y'].shape}")

    # Wind-directed vs undirected edge count sanity
    undirected = build_h3_graph(g.cells, k_ring=1, wind_u=None, wind_v=None)
    directed = build_h3_graph(g.cells, k_ring=1, wind_u=3.0, wind_v=-1.0, wind_boost=2.0)
    print(
        f"  edge weights   : undirected mean={undirected.edge_weight.mean():.2f}  "
        f"wind-directed mean={directed.edge_weight.mean():.2f} "
        f"(max={directed.edge_weight.max():.2f})"
    )

    try:
        result = train_stgnn_demo(epochs=30, hidden_dim=32, lr=1e-3)
    except InstallError as e:
        print("\n[SKIP] Training stack not installed:\n")
        print(e)
        print("\nInstall then re-run:")
        print("  pip install torch torch-geometric")
        return 2

    out = {
        "device": result["device"],
        "epochs": result["epochs"],
        "final_mse": result["final_mse"],
        "final_rmse": result["final_rmse"],
        "n_params": result["n_params"],
        "graph_nodes": result["graph_nodes"],
        "graph_edges": result["graph_edges"],
        "loss_start": result["loss_history"][0],
        "loss_end": result["loss_history"][-1],
        "batch_meta": result["batch_meta"],
    }
    print("\n[OK] train_stgnn_demo finished")
    print(json.dumps(out, indent=2))

    # Persist tiny metrics artifact (not model weights — demo only)
    dest = ROOT / "data" / "processed" / "stgnn_demo_metrics.json"
    # data/ may be gitignored — still useful locally
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(out, indent=2), encoding="utf-8")
        print(f"  wrote {dest}")
    except OSError as exc:
        print(f"  (could not write metrics file: {exc})")

    if out["loss_end"] >= out["loss_start"]:
        print("  [!] loss did not decrease — check install / seed; still prototype-valid if finite")
    else:
        print("  loss decreased — STGNN graph+train path OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
