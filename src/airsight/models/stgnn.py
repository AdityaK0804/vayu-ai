"""Spatio-Temporal Graph Neural Network (STGNN) prototype for Vayu PM2.5.

Why STGNN (vs pure LGBM tabular)
--------------------------------
LightGBM treats each station-hour as an independent row. Air pollution is
**transported**: an upwind industrial cell contaminates downwind neighbours over
hours. An STGNN encodes that physics as a graph:

* **Nodes**  = H3 cells (or stations projected into cells)
* **Edges**  = H3 k-ring adjacency, optionally *directed by wind*
              (upwind → downwind gets higher weight)
* **Time**   = GRU (or LSTM) over a lookback window of node features
* **Space**  = Graph convolution mixes neighbour messages each step

This module is a **research prototype** coexisting with the production LGBM /
CatBoost path. It does not replace bake JSON until validated on LOSO metrics.

Dependencies (optional extra ``stgnn``)
--------------------------------------
  pip install torch torch-geometric

Without them, import still works for graph builders; model forward raises a
clear InstallError.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Sequence

import numpy as np

try:
    import h3
except ImportError as e:  # pragma: no cover
    raise ImportError("h3 is required: pip install h3") from e

# ---------------------------------------------------------------------------
# Optional deep-learning stack
# ---------------------------------------------------------------------------

_TORCH_ERR: str | None = None
try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    _HAS_TORCH = True
except ImportError as e:  # pragma: no cover
    torch = None  # type: ignore
    nn = None  # type: ignore
    F = None  # type: ignore
    _HAS_TORCH = False
    _TORCH_ERR = str(e)

try:
    from torch_geometric.nn import GCNConv  # type: ignore

    _HAS_PYG = True
except ImportError:  # pragma: no cover
    GCNConv = None  # type: ignore
    _HAS_PYG = False


class InstallError(RuntimeError):
    """Raised when torch / torch_geometric are missing for a model op."""


def require_torch() -> None:
    if not _HAS_TORCH:
        raise InstallError(
            "PyTorch is required for STGNN.\n"
            "  pip install torch\n"
            f"Original error: {_TORCH_ERR}"
        )
    if not _HAS_PYG:
        raise InstallError(
            "PyTorch Geometric is required for STGNN.\n"
            "  pip install torch-geometric\n"
            "See https://pytorch-geometric.readthedocs.io/en/latest/install/installation.html"
        )


# ---------------------------------------------------------------------------
# H3 graph construction
# ---------------------------------------------------------------------------


def _grid_disk(cell: str, k: int = 1) -> list[str]:
    """H3 neighbours (v3/v4 compatible)."""
    try:
        return list(h3.grid_disk(cell, k))  # v4
    except AttributeError:
        return list(h3.k_ring(cell, k))  # v3


def _cell_latlng(cell: str) -> tuple[float, float]:
    try:
        lat, lng = h3.cell_to_latlng(cell)  # v4
        return float(lat), float(lng)
    except AttributeError:
        lat, lng = h3.h3_to_geo(cell)  # v3
        return float(lat), float(lng)


@dataclass(frozen=True)
class H3Graph:
    """Static spatial graph over a set of H3 cells."""

    cells: list[str]
    edge_index: np.ndarray  # shape (2, E) int64
    edge_weight: np.ndarray  # shape (E,) float32
    cell_to_idx: dict[str, int]

    @property
    def num_nodes(self) -> int:
        return len(self.cells)


def build_h3_graph(
    cells: Sequence[str],
    *,
    k_ring: int = 1,
    wind_u: float | None = None,
    wind_v: float | None = None,
    wind_boost: float = 1.5,
    self_loops: bool = True,
) -> H3Graph:
    """Build an H3 adjacency graph, optionally wind-directed.

    Parameters
    ----------
    cells:
        Unique H3 cell ids (same resolution).
    k_ring:
        Neighbourhood radius (1 = immediate hex neighbours).
    wind_u, wind_v:
        Wind components in m/s (meteorological: u=eastward, v=northward).
        When set, edges aligned with the wind vector get ``wind_boost`` weight;
        edges against the wind get ``1/wind_boost``.
    wind_boost:
        Multiplier for downwind edges (>1).
    self_loops:
        Add identity edges (helps GCN retain self state).

    Notes
    -----
    Wind is treated as **spatially uniform** for the prototype. A production
    STGNN would attach per-edge wind from the met grid at each timestep.
    """
    uniq = list(dict.fromkeys(cells))
    cell_to_idx = {c: i for i, c in enumerate(uniq)}
    cell_set = set(uniq)

    src: list[int] = []
    dst: list[int] = []
    wts: list[float] = []

    # unit wind vector (if provided)
    wind_vec: np.ndarray | None = None
    if wind_u is not None and wind_v is not None:
        wv = np.array([float(wind_u), float(wind_v)], dtype=np.float64)
        nrm = np.linalg.norm(wv)
        if nrm > 1e-6:
            wind_vec = wv / nrm

    for c in uniq:
        i = cell_to_idx[c]
        lat_i, lon_i = _cell_latlng(c)
        for nb in _grid_disk(c, k_ring):
            if nb == c or nb not in cell_set:
                continue
            j = cell_to_idx[nb]
            weight = 1.0
            if wind_vec is not None:
                lat_j, lon_j = _cell_latlng(nb)
                # approximate local tangent: Δeast, Δnorth in degrees
                d_east = (lon_j - lon_i) * np.cos(np.deg2rad((lat_i + lat_j) / 2))
                d_north = lat_j - lat_i
                edge_vec = np.array([d_east, d_north], dtype=np.float64)
                en = np.linalg.norm(edge_vec)
                if en > 1e-12:
                    edge_vec /= en
                    # positive cos ⇒ neighbour is downwind of c
                    cos = float(np.dot(wind_vec, edge_vec))
                    weight = wind_boost if cos > 0.15 else (1.0 / wind_boost if cos < -0.15 else 1.0)
            src.append(i)
            dst.append(j)
            wts.append(weight)

        if self_loops:
            src.append(i)
            dst.append(i)
            wts.append(1.0)

    if not src:
        # degenerate single-node graph
        src, dst, wts = [0], [0], [1.0]

    edge_index = np.asarray([src, dst], dtype=np.int64)
    edge_weight = np.asarray(wts, dtype=np.float32)
    return H3Graph(cells=uniq, edge_index=edge_index, edge_weight=edge_weight, cell_to_idx=cell_to_idx)


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

if _HAS_TORCH:

    class GraphGRUCell(nn.Module):
        """One temporal step: GCN mix → GRU update (T-GCN style)."""

        def __init__(self, in_dim: int, hidden_dim: int) -> None:
            super().__init__()
            require_torch()
            self.gcn = GCNConv(in_dim + hidden_dim, hidden_dim)
            self.gru = nn.GRUCell(hidden_dim, hidden_dim)

        def forward(
            self,
            x_t: "torch.Tensor",
            h: "torch.Tensor",
            edge_index: "torch.Tensor",
            edge_weight: "torch.Tensor | None",
        ) -> "torch.Tensor":
            # x_t: (N, F), h: (N, H)
            g_in = torch.cat([x_t, h], dim=-1)
            g_out = self.gcn(g_in, edge_index, edge_weight=edge_weight)
            g_out = F.relu(g_out)
            return self.gru(g_out, h)


    class STGNN(nn.Module):
        """Spatio-temporal GNN for multi-horizon PM2.5 on an H3 graph.

        Input tensor layout
        -------------------
        x : (batch, T, N, F)
            batch graphs (usually 1 for city-scale), lookback T, N nodes, F feats
        edge_index : (2, E)
        edge_weight : (E,) optional

        Output
        ------
        y_hat : (batch, N, H)
            H forecast horizons (e.g. +1h..+24h) of PM2.5 per node
        """

        def __init__(
            self,
            in_features: int,
            hidden_dim: int = 64,
            n_horizons: int = 24,
            n_layers: int = 2,
            dropout: float = 0.1,
        ) -> None:
            super().__init__()
            require_torch()
            self.in_features = in_features
            self.hidden_dim = hidden_dim
            self.n_horizons = n_horizons

            self.input_proj = nn.Linear(in_features, hidden_dim)
            # Stacked GraphGRU layers — each step feeds projected (or prior hidden) features
            self.cells = nn.ModuleList(
                [GraphGRUCell(hidden_dim, hidden_dim) for _ in range(n_layers)]
            )
            self.dropout = nn.Dropout(dropout)
            self.head = nn.Sequential(
                nn.Linear(hidden_dim, hidden_dim),
                nn.ReLU(),
                nn.Dropout(dropout),
                nn.Linear(hidden_dim, n_horizons),
            )

        def forward(
            self,
            x: "torch.Tensor",
            edge_index: "torch.Tensor",
            edge_weight: "torch.Tensor | None" = None,
        ) -> "torch.Tensor":
            # x: (B, T, N, F)
            if x.dim() != 4:
                raise ValueError(f"expected x (B,T,N,F), got {tuple(x.shape)}")
            b, t_len, n, _f = x.shape
            if b != 1:
                # prototype: batch by looping (city graphs are one-at-a-time)
                outs = [
                    self.forward(x[i : i + 1], edge_index, edge_weight) for i in range(b)
                ]
                return torch.cat(outs, dim=0)

            h = x.new_zeros(n, self.hidden_dim)
            for t in range(t_len):
                xt = self.input_proj(x[0, t])  # (N, H)
                xt = self.dropout(xt)
                for cell in self.cells:
                    h = cell(xt, h, edge_index, edge_weight)
                    xt = h  # stack layers in time
            y = self.head(h)  # (N, horizons)
            return y.unsqueeze(0)  # (1, N, H)


    def stgnn_loss(
        y_hat: "torch.Tensor",
        y_true: "torch.Tensor",
        mask: "torch.Tensor | None" = None,
    ) -> "torch.Tensor":
        """Masked MSE over nodes × horizons."""
        err = (y_hat - y_true) ** 2
        if mask is not None:
            err = err * mask
            denom = mask.sum().clamp_min(1.0)
            return err.sum() / denom
        return err.mean()

else:  # pragma: no cover
    STGNN = None  # type: ignore
    stgnn_loss = None  # type: ignore


# ---------------------------------------------------------------------------
# Synthetic demo data (smoke tests without full CPCB panels)
# ---------------------------------------------------------------------------


def make_synthetic_stgnn_batch(
    n_nodes: int = 24,
    t_lookback: int = 12,
    n_horizons: int = 6,
    n_features: int = 4,
    seed: int = 7,
) -> dict[str, Any]:
    """Build a tiny wind-biased H3-like graph with random walk PM series.

    Uses real H3 cells around Korba so neighbour topology is valid.
    """
    rng = np.random.default_rng(seed)
    # Seed cell ~ Korba
    try:
        origin = h3.latlng_to_cell(22.36, 82.75, 7)
        cells = list(_grid_disk(origin, 2))[:n_nodes]
    except Exception:
        origin = h3.geo_to_h3(22.36, 82.75, 7)
        cells = list(_grid_disk(origin, 2))[:n_nodes]
    while len(cells) < n_nodes:
        cells.append(cells[-1])

    graph = build_h3_graph(cells[:n_nodes], k_ring=1, wind_u=2.0, wind_v=-1.0)

    # Features: [pm_lag0, temp, wind_speed, sin_hod] over time
    t_total = t_lookback + n_horizons
    pm = rng.normal(40.0, 8.0, size=(t_total, graph.num_nodes)).astype(np.float32)
    # simple diffusion: average with neighbours each step
    for t in range(1, t_total):
        nxt = pm[t - 1].copy()
        for e in range(graph.edge_index.shape[1]):
            i, j = int(graph.edge_index[0, e]), int(graph.edge_index[1, e])
            if i != j:
                nxt[j] += 0.05 * graph.edge_weight[e] * pm[t - 1, i]
        pm[t] = 0.85 * pm[t - 1] + 0.15 * nxt + rng.normal(0, 0.5, size=nxt.shape)

    feats = np.zeros((t_lookback, graph.num_nodes, n_features), dtype=np.float32)
    for t in range(t_lookback):
        feats[t, :, 0] = pm[t]
        feats[t, :, 1] = 28.0 + rng.normal(0, 1, size=graph.num_nodes)
        feats[t, :, 2] = 2.5
        feats[t, :, 3] = np.sin(2 * np.pi * (t % 24) / 24)

    target = np.stack([pm[t_lookback + h] for h in range(n_horizons)], axis=-1)  # (N, H)

    return {
        "graph": graph,
        "x": feats[np.newaxis, ...],  # (1, T, N, F)
        "y": target[np.newaxis, ...],  # (1, N, H)
        "meta": {
            "n_nodes": graph.num_nodes,
            "t_lookback": t_lookback,
            "n_horizons": n_horizons,
            "n_features": n_features,
        },
    }


def train_stgnn_demo(
    *,
    epochs: int = 40,
    lr: float = 1e-3,
    hidden_dim: int = 32,
    seed: int = 0,
    device: str | None = None,
) -> dict[str, Any]:
    """End-to-end smoke train on synthetic batch. Returns metrics + model state path info."""
    require_torch()
    assert STGNN is not None and stgnn_loss is not None

    torch.manual_seed(seed)
    batch = make_synthetic_stgnn_batch(seed=seed)
    graph: H3Graph = batch["graph"]
    x = torch.tensor(batch["x"])  # (1,T,N,F)
    y = torch.tensor(batch["y"])  # (1,N,H)

    dev = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
    x, y = x.to(dev), y.to(dev)
    edge_index = torch.tensor(graph.edge_index, dtype=torch.long, device=dev)
    edge_weight = torch.tensor(graph.edge_weight, dtype=torch.float32, device=dev)

    model = STGNN(
        in_features=batch["meta"]["n_features"],
        hidden_dim=hidden_dim,
        n_horizons=batch["meta"]["n_horizons"],
        n_layers=2,
    ).to(dev)
    opt = torch.optim.Adam(model.parameters(), lr=lr)

    history: list[float] = []
    model.train()
    for ep in range(epochs):
        opt.zero_grad()
        y_hat = model(x, edge_index, edge_weight)
        loss = stgnn_loss(y_hat, y)
        loss.backward()
        opt.step()
        history.append(float(loss.detach().cpu()))

    model.eval()
    with torch.no_grad():
        y_hat = model(x, edge_index, edge_weight)
        final = float(stgnn_loss(y_hat, y).cpu())
        rmse = float(torch.sqrt(((y_hat - y) ** 2).mean()).cpu())

    return {
        "device": str(dev),
        "epochs": epochs,
        "loss_history": history,
        "final_mse": final,
        "final_rmse": rmse,
        "n_params": sum(p.numel() for p in model.parameters()),
        "graph_nodes": graph.num_nodes,
        "graph_edges": int(graph.edge_index.shape[1]),
        "model": model,
        "batch_meta": batch["meta"],
    }


__all__ = [
    "H3Graph",
    "STGNN",
    "InstallError",
    "build_h3_graph",
    "make_synthetic_stgnn_batch",
    "require_torch",
    "stgnn_loss",
    "train_stgnn_demo",
    "_HAS_TORCH",
    "_HAS_PYG",
]
