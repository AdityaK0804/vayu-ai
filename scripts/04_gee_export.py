"""
STEP 4 — Google Earth Engine: MODIS AOD + Sentinel-5P NO2/SO2 + Dynamic World.

WHY THIS IS THE WHOLE PROJECT:
  With 2-3 CPCB stations per city the model is spatially BLIND.
  Satellite gives wall-to-wall coverage -> this is the "virtual sensor" engine
  that lets you forecast JAGDALPUR, which has zero ground sensors.
  No satellite = no zero-station reveal = no Innovation score.

SETUP (do this FIRST, approval can lag):
  1. https://earthengine.google.com/ -> sign up (free, non-commercial)
  2. Create a Google Cloud project, register it for Earth Engine
  3. pip install earthengine-api --break-system-packages
  4. earthengine authenticate
  5. export EE_PROJECT=your-project-id

RUN (start with stations - it's fast, proves auth works):
  python scripts/04_gee_export.py --mode stations --cities korba
  python scripts/04_gee_export.py --mode grid --cities korba --h3-res 7
  python scripts/04_gee_export.py --mode landuse --cities korba

TWO MODES, AND WHY:
  stations -> samples at CPCB station points only. Tiny + fast (minutes).
              Feeds the TEMPORAL model. Do this first.
  grid     -> samples at H3 cell centroids across the bbox. Big + slow (hours).
              Feeds the SPATIAL model + the Jagdalpur reveal.
              WARNING: res 8 x 4 years x whole bbox = millions of rows and GEE
              will time out. Default res 7 is deliberate - satellite is coarse
              anyway (S5P is ~3.5x5.5km native), so sampling finer than the
              sensor is false precision. Upsample to res 8 in harmonisation.

OUTPUT: exports land in your Google Drive folder "AirSight_exports" as CSV.
        Download them into data/satellite/<channel>/<city>/
"""
import argparse
import os
import sys

from common import get_cities, ok, say, warn

# OFFL = offline/reprocessed = the historical archive. NRTI = near-real-time only
# (last few days). For 2021-2024 you MUST use OFFL.
CHANNELS = {
    "aod": {
        "collection": "MODIS/061/MCD19A2_GRANULES",
        "band": "Optical_Depth_055",
        "scale": 1000,
        "note": "best satellite proxy for surface PM2.5; daily 1km; from 2000",
    },
    "no2": {
        "collection": "COPERNICUS/S5P/OFFL/L3_NO2",
        "band": "NO2_column_number_density",
        "scale": 1000,
        "note": "traffic/combustion proxy; from Jul 2018",
    },
    "so2": {
        "collection": "COPERNICUS/S5P/OFFL/L3_SO2",
        "band": "SO2_column_number_density",
        "scale": 1000,
        "note": "coal/industry proxy - BIG for Korba; from Jul 2018",
    },
}


def h3_centroids(bbox, res):
    """H3 cells covering bbox -> [(h3, lat, lon)]."""
    import h3
    W, S, E, N = bbox
    poly = {"type": "Polygon", "coordinates": [[
        [W, S], [W, N], [E, N], [E, S], [W, S]]]}
    try:                                   # h3 v4
        cells = h3.geo_to_cells(poly, res)
        return [(c, *h3.cell_to_latlng(c)) for c in cells]
    except AttributeError:                 # h3 v3
        gj = {"type": "Polygon", "coordinates": [[
            [S, W], [N, W], [N, E], [S, E], [S, W]]]}
        cells = h3.polyfill(gj, res, geo_json_conformant=False)
        return [(c, *h3.h3_to_geo(c)) for c in cells]


def station_points(city_id):
    """Read config/stations.csv -> points for this city."""
    import csv
    from common import ROOT
    p = ROOT / "config" / "stations.csv"
    if not p.exists():
        return []
    out = []
    with open(p) as f:
        for row in csv.DictReader(l for l in f if not l.startswith("#")):
            if row.get("city_id") == city_id and row.get("latitude"):
                try:
                    out.append((row["station_id"], float(row["latitude"]), float(row["longitude"])))
                except ValueError:
                    continue
    return out


def build_fc(ee, points):
    return ee.FeatureCollection([
        ee.Feature(ee.Geometry.Point([lon, lat]), {"cell_id": cid})
        for cid, lat, lon in points
    ])


def export_channel(ee, city, fc, ch_key, year, tag):
    ch = CHANNELS[ch_key]
    start = ee.Date(f"{year}-01-01")
    end = ee.Date(f"{year+1}-01-01")

    col = (ee.ImageCollection(ch["collection"])
           .filterDate(start, end)
           .filterBounds(ee.Geometry.Rectangle(city["bbox"]))
           .select(ch["band"]))

    n_days = end.difference(start, "day")
    days = ee.List.sequence(0, n_days.subtract(1))

    def per_day(d):
        d0 = start.advance(ee.Number(d), "day")
        daily = col.filterDate(d0, d0.advance(1, "day"))
        img = ee.Image(ee.Algorithms.If(daily.size().gt(0),
                                        daily.mean(),
                                        ee.Image.constant(0).rename(ch["band"]).selfMask()))
        sampled = img.reduceRegions(collection=fc,
                                    reducer=ee.Reducer.mean(),
                                    scale=ch["scale"])
        return sampled.map(lambda f: f.set("date", d0.format("YYYY-MM-dd")))

    table = ee.FeatureCollection(days.map(per_day)).flatten()

    desc = f"airsight_{ch_key}_{city['id']}_{tag}_{year}"
    task = ee.batch.Export.table.toDrive(
        collection=table,
        description=desc[:100],
        folder="AirSight_exports",
        fileNamePrefix=desc,
        fileFormat="CSV",
        selectors=["cell_id", "date", "mean"],
    )
    task.start()
    return desc


def export_landuse(ee, city, fc):
    """Dynamic World built-up fraction per cell, per year.
    built-up CHANGE between years = our honest construction-activity proxy,
    because construction permits are not open data in Chhattisgarh."""
    out = []
    for year in (2021, 2024):
        col = (ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
               .filterDate(f"{year}-01-01", f"{year+1}-01-01")
               .filterBounds(ee.Geometry.Rectangle(city["bbox"])))
        img = col.select(["built", "trees", "grass", "bare", "crops"]).mean()
        sampled = img.reduceRegions(collection=fc, reducer=ee.Reducer.mean(), scale=10)
        desc = f"airsight_landuse_{city['id']}_{year}"
        ee.batch.Export.table.toDrive(
            collection=sampled, description=desc[:100],
            folder="AirSight_exports", fileNamePrefix=desc, fileFormat="CSV",
        ).start()
        out.append(desc)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["stations", "grid", "landuse"], default="stations")
    ap.add_argument("--cities", nargs="*", default=["korba"])
    ap.add_argument("--channels", nargs="*", default=["aod", "no2", "so2"])
    ap.add_argument("--h3-res", type=int, default=7,
                    help="7 (~5km, default, safe) or 8 (~1km, WILL be slow/may time out)")
    ap.add_argument("--years", nargs="*", type=int, default=None)
    args = ap.parse_args()

    try:
        import ee
    except ImportError:
        warn("pip install earthengine-api --break-system-packages")
        sys.exit(1)

    project = os.environ.get("EE_PROJECT")
    try:
        ee.Initialize(project=project) if project else ee.Initialize()
    except Exception as e:
        warn(f"EE init failed: {e}")
        warn("Run:  earthengine authenticate     and   export EE_PROJECT=your-project-id")
        sys.exit(1)
    ok(f"Earth Engine ready (project={project or 'default'})")

    print(f"\n=== STEP 4: GEE export | mode={args.mode} ===\n")

    for city in get_cities(only=args.cities):
        print(f"\n--- {city['name']} ---")

        if args.mode == "stations":
            pts = station_points(city["id"])
            if not pts:
                warn(f"no stations in config/stations.csv for {city['id']}")
                if not city["has_stations"]:
                    say("(expected - this is the zero-station city. Use --mode grid.)")
                continue
            fc = build_fc(ee, pts)
            say(f"{len(pts)} station points")
            tag = "stations"
        elif args.mode == "grid":
            cells = h3_centroids(city["bbox"], args.h3_res)
            say(f"{len(cells)} H3 cells at res {args.h3_res}")
            if len(cells) > 3000:
                warn("that's a lot of cells - GEE may time out. Consider --h3-res 7.")
            fc = build_fc(ee, cells)
            tag = f"grid{args.h3_res}"
        else:  # landuse
            cells = h3_centroids(city["bbox"], args.h3_res)
            fc = build_fc(ee, cells)
            for d in export_landuse(ee, city, fc):
                ok(f"queued {d}")
            continue

        years = args.years or list(range(int(city["start_date"][:4]),
                                         int(city["end_date"][:4]) + 1))
        for ch in args.channels:
            if ch not in CHANNELS:
                warn(f"unknown channel {ch}")
                continue
            for y in years:
                if ch in ("no2", "so2") and y < 2019:
                    say(f"skip {ch} {y} (Sentinel-5P starts Jul 2018)")
                    continue
                d = export_channel(ee, city, fc, ch, y, tag)
                ok(f"queued {d}")

    print("""
=== EXPORTS QUEUED ===
  Watch them:  https://code.earthengine.google.com/tasks
  They land in Google Drive -> folder "AirSight_exports"
  Download CSVs into: data/satellite/<channel>/<city>/

  Grid exports can take 30min-several hours. START THEM NOW and do other
  steps while they run. Do NOT sit and watch.
""")


if __name__ == "__main__":
    main()
