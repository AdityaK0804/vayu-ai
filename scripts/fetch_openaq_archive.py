"""Re-acquire station-years from the OpenAQ AWS open-data archive (no key).

s3://openaq-data-archive/records/csv.gz/locationid=<id>/year=<y>/month=<mm>/
Writes data/openaq_archive/<station_id>_<year>.csv (UTC hour, pm25 µg/m³).
Station ids/years come from config/data_quarantine.yaml; OpenAQ ids from
config/cpcb_stations.csv.

    python scripts/fetch_openaq_archive.py
"""
from __future__ import annotations

import gzip, io, re, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx, pandas as pd, yaml

ROOT = Path(__file__).resolve().parents[1]
BUCKET = "https://openaq-data-archive.s3.amazonaws.com"
OUT = ROOT / "data" / "openaq_archive"


def list_keys(client, prefix):
    keys, token = [], None
    while True:
        params = {"list-type": "2", "prefix": prefix}
        if token:
            params["continuation-token"] = token
        r = client.get(BUCKET + "/", params=params)
        r.raise_for_status()
        keys += re.findall(r"<Key>([^<]+)</Key>", r.text)
        m = re.search(r"<NextContinuationToken>([^<]+)</NextContinuationToken>", r.text)
        if not m:
            return keys
        token = m.group(1)


def fetch(client, key):
    r = client.get(f"{BUCKET}/{key}")
    r.raise_for_status()
    return pd.read_csv(io.BytesIO(gzip.decompress(r.content)))


def station_year(client, pool, oid, year):
    keys = [k for m in range(1, 13) for k in list_keys(client, f"records/csv.gz/locationid={oid}/year={year}/month={m:02d}/")]
    frames = [f for f in pool.map(lambda k: fetch(client, k), keys) if len(f)]
    if not frames:
        return pd.DataFrame(columns=["ts", "pm25"]), len(keys)
    df = pd.concat(frames)
    df = df[df["parameter"].str.lower().isin(["pm25", "pm2.5"])]
    # OpenAQ `datetime` is the period end with offset; convert to UTC hour start.
    ts = pd.to_datetime(df["datetime"], utc=True) - pd.Timedelta(hours=1)
    out = pd.DataFrame({"ts": ts.dt.floor("h"), "pm25": pd.to_numeric(df["value"], errors="coerce")})
    out = out.groupby("ts", as_index=False)["pm25"].mean()
    return out, len(keys)


def main() -> int:
    q = yaml.safe_load((ROOT / "config" / "data_quarantine.yaml").read_text())
    ids = pd.read_csv(ROOT / "config" / "cpcb_stations.csv").set_index("station_id")["openaq_id"]
    OUT.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=60, headers={"User-Agent": "vayu-backend/1.0"}) as client, ThreadPoolExecutor(32) as pool:
        for item in q["quarantine"]:
            sid = item["station_id"]
            for year in range(int(item["start"][:4]), int(item["end"][:4])):
                df, nfiles = station_year(client, pool, int(ids[sid]), year)
                df.to_csv(OUT / f"{sid}_{year}.csv", index=False)
                print(sid, year, "files", nfiles, "pm25_hours", int(df["pm25"].notna().sum()), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
