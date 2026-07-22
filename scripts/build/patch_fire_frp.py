"""Patch fire_frp onto existing processed/*_features.parquet without full re-harmonize.

Uses the same add_fire_frp logic as 10_harmonize.py.

Run:  python scripts/build/patch_fire_frp.py
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, get_cities, ok, say, warn  # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "hz", Path(__file__).parent / "10_harmonize.py"
)
hz = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(hz)


def main() -> None:
    print("=" * 80)
    print("PATCH fire_frp onto processed feature tables")
    print("=" * 80)
    # reset fire cache
    hz._FIRE_CACHE = None

    for city in get_cities(include_optional=True):
        p = DATA / "processed" / f"{city['id']}_features.parquet"
        if not p.exists():
            warn(f"{city['id']}: no features parquet, skip")
            continue
        df = pd.read_parquet(p)
        # drop old placeholder columns
        for c in ("fire_frp", "fire_count"):
            if c in df.columns:
                df = df.drop(columns=[c])
        df = hz.add_fire_frp(df, city)
        df.to_parquet(p, index=False)
        nn = df["fire_frp"].notna().mean() * 100 if "fire_frp" in df.columns else 0
        pos = (df["fire_frp"].fillna(0) > 0).mean() * 100
        ok(f"{city['id']}: fire_frp non-null {nn:.1f}%  FRP>0 {pos:.1f}%  -> {p.name}")

    print()
    ok("done — retrain models to pick up fire_frp (08_tighten_champion.py)")


if __name__ == "__main__":
    main()
