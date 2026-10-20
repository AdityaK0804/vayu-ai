"""Download the FIRMS standard-processing archive over the live FIRMS bbox.

Uses the same sensors as live ingest (NRT -> SP equivalents) and the bbox in
config/live_sources.yaml (firms.state_bbox), so training and serving see the
same spatial extent. Requires FIRMS_MAP_KEY (free).

    python scripts/fetch_firms_archive.py --start 2022-07-25 --end 2025-12-31
"""
from __future__ import annotations

import argparse, os, sys, time
from datetime import date, timedelta
from pathlib import Path

import httpx, yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from airsight.live.fires import FIRMS_BASE, SENSORS, _bbox_param  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", required=True)
    ap.add_argument("--end", required=True)
    ap.add_argument("--out", default="/workspace/vayu-data/fetched/firms")
    a = ap.parse_args()
    cfg = yaml.safe_load((ROOT / "config" / "live_sources.yaml").read_text())["firms"]
    area = _bbox_param(cfg["state_bbox"])
    key = os.environ["FIRMS_MAP_KEY"]
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    d0, d1 = date.fromisoformat(a.start), date.fromisoformat(a.end)
    with httpx.Client(timeout=120) as c:
        for nrt in SENSORS:
            sp = nrt.replace("_NRT", "_SP")
            d = d0
            while d <= d1:
                n = min(5, (d1 - d).days + 1)
                f = out / f"{sp}_{d.isoformat()}_{n}.csv"
                if not f.exists():
                    for attempt in range(8):
                        try:
                            r = c.get(f"{FIRMS_BASE}/{key}/{sp}/{area}/{n}/{d.isoformat()}")
                        except httpx.HTTPError as exc:
                            print("retry", sp, d, type(exc).__name__, flush=True); time.sleep(10); continue
                        if r.status_code == 200 and r.text.startswith("latitude"):
                            f.write_text(r.text); break
                        # FIRMS: 5000 transactions / 10 min per MAP_KEY.
                        time.sleep(60 if "transaction limit" in r.text else 5 * (attempt + 1))
                    else:
                        print("FAIL", sp, d, flush=True)
                d += timedelta(days=n)
            print("done", sp, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
