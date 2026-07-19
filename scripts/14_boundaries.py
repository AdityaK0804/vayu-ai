import json
import topojson
import geopandas as gpd
from shapely.geometry import Point
import yaml
import csv
from common import DATA, ROOT

# Use relative paths from common.py
topo_path = DATA / "boundaries" / "chhattisgarh.topo.json"
geojson_path = DATA / "boundaries" / "cg_divisions.geojson"

# Load topojson and convert to geojson
raw = json.load(open(topo_path))
obj = list(raw["objects"])[0]
gj = json.loads(topojson.Topology(raw, object_name=obj).to_geojson())

# Save to cg_divisions.geojson
geojson_path.parent.mkdir(parents=True, exist_ok=True)
json.dump(gj, open(geojson_path, "w"))

print(gpd.read_file(geojson_path))   # 5 rows, EPSG:4326

# Load cities to map them
with open(ROOT / "config" / "cities.yaml") as f:
    cfg = yaml.safe_load(f)

gdf = gpd.GeoDataFrame.from_features(gj["features"])

mappings = []
for city in cfg["cities"]:
    name = city["name"]
    p = Point(city["lon"], city["lat"])
    division = None
    for i, row in gdf.iterrows():
        if row["geometry"].contains(p):
            division = row["division"]
            break
    if not division:
        # Fallback to closest division if point falls exactly on a boundary or slightly outside
        min_dist = float('inf')
        for i, row in gdf.iterrows():
            dist = row["geometry"].distance(p)
            if dist < min_dist:
                min_dist = dist
                division = row["division"]
    mappings.append({"city": name, "admin": division})

# Save to data/boundaries/city_to_admin.csv and also data/city_to_admin.csv to be safe
for out_path in [DATA / "boundaries" / "city_to_admin.csv", DATA / "city_to_admin.csv"]:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["city", "admin"])
        writer.writeheader()
        writer.writerows(mappings)
    print(f"Saved mapping to {out_path}")