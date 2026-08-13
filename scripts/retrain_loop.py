#!/usr/bin/env python3
"""Scheduled champion/challenger retrain stub (logs metrics; optional MLflow).

  python scripts/retrain_loop.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "src")]

from airsight.models.ensemble import ModelCard, drift_alert, psi, should_promote

log = logging.getLogger("vayu.retrain")


def _try_mlflow_log(params: dict, metrics: dict, artifact_dir: Path) -> str | None:
    try:
        import mlflow

        mlflow.set_experiment("vayu-retrain")
        with mlflow.start_run(run_name=f"retrain-{datetime.now(timezone.utc):%Y%m%dT%H%M}"):
            mlflow.log_params(params)
            mlflow.log_metrics(metrics)
            if artifact_dir.exists():
                mlflow.log_artifacts(str(artifact_dir))
            return mlflow.active_run().info.run_id if mlflow.active_run() else None
    except Exception as exc:
        log.info("mlflow skipped: %s", exc)
        return None


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--champion-mae", type=float, default=12.0)
    p.add_argument("--challenger-mae", type=float, default=11.0)
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    champion = ModelCard(name="lgbm", version="champ", mae=args.champion_mae, rmse=18.0, path="models/champ")
    challenger = ModelCard(name="stgnn+resid", version="chall", mae=args.challenger_mae, rmse=17.0, path="models/chall")
    promote = should_promote(challenger, champion)
    log.info("promote=%s champ_mae=%.3f chall_mae=%.3f", promote, champion.mae, challenger.mae)

    # fake feature drift demo
    import numpy as np

    base = np.random.normal(40, 10, size=500)
    live = np.random.normal(42, 12, size=500)
    p = psi(base, live)
    alert = drift_alert(p, mae_now=challenger.mae, mae_base=champion.mae)
    log.info("drift %s", alert)

    out = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "promote": promote,
        "champion": champion.__dict__,
        "challenger": challenger.__dict__,
        "drift": alert,
    }
    dest = ROOT / "outputs" / "retrain_last.json"
    if not args.dry_run:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(out, indent=2), encoding="utf-8")
        run_id = _try_mlflow_log(
            {"champion": champion.version, "challenger": challenger.version},
            {"champ_mae": champion.mae, "chall_mae": challenger.mae, "psi": p},
            dest.parent,
        )
        out["mlflow_run_id"] = run_id
        dest.write_text(json.dumps(out, indent=2), encoding="utf-8")
        log.info("wrote %s", dest)
    else:
        print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
