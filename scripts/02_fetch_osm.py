"""
STEP 2 — OpenStreetMap: road network + POIs + industrial land.

WHY:
  roads      -> traffic attribution (road density per H3 cell)
  hospitals  -> vulnerability layer (Business Impact = 25% of the score)
  schools    -> vulnerability layer
  industrial -> source registry for the Enforcement agent
  kilns      -> India-specific unregulated PM source (bonus if present)

RUN:   python scripts/02_fetch_osm.py
       python scripts/02_fetch_osm.py --cities korba
NEEDS: pip install osmnx geopandas   (no API key, no signup)

OUTPUT: data/osm/roads/<city>/roads.graphml + road_edges.geojson
        data/osm/pois/<city>/{hospitals,schools,industrial,stacks,kilns}.geojson
"""
import argparse

from common import DATA, get_cities, ensure, ok, say, warn

# Road importance weights -> a motorway pollutes far more than a lane.
# Used later: road_density(cell) = sum(edge_length * weight) for edges in cell.
ROAD_WEIGHTS = {
    "motorway": 4.0, "motorway_link": 3.5,
    "trunk": 3.5, "trunk_link": 3.0,
    "primary": 3.0, "primary_link": 2.5,
    "secondary": 2.0, "secondary_link": 1.8,
    "tertiary": 1.5, "tertiary_link": 1.3,
    "residential": 1.0, "unclassified": 0.8, "service": 0.5,
}

POI_TAGS = {
    "hospitals":  {"amenity": ["hospital", "clinic"]},
    "schools":    {"amenity": ["school", "college", "kindergarten"]},
    "industrial": {"landuse": "industrial"},
    "stacks":     {"man_made": ["works", "chimney"]},
    "kilns":      {"man_made": "kiln"},
}


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


def get_tight_bbox(city):
    """Find a tight bbox around the stations for the city, or city center if none."""
    pts = station_points(city["id"])
    if pts:
        lats = [p[1] for p in pts]
        lons = [p[2] for p in pts]
        min_lat, max_lat = min(lats), max(lats)
        min_lon, max_lon = min(lons), max(lons)
        buffer = 0.05  # approx 5.5 km buffer around stations
        return [min_lon - buffer, min_lat - buffer, max_lon + buffer, max_lat + buffer]
    else:
        lat, lon = city["lat"], city["lon"]
        buffer = 0.05  # approx 5.5 km buffer around city center
        return [lon - buffer, lat - buffer, lon + buffer, lat + buffer]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cities", nargs="*", default=None)
    args = ap.parse_args()

    try:
        import osmnx as ox
        try:
            ox.settings.timeout = 20
            ox.settings.requests_timeout = 20
        except AttributeError:
            try:
                ox.config(timeout=20)
            except Exception:
                pass
    except ImportError:
        warn("pip install osmnx geopandas --break-system-packages")
        return

    print("\n=== STEP 2: OpenStreetMap (no signup) ===\n")

    for city in get_cities(only=args.cities):
        cid, name = city["id"], city["name"]
        print(f"\n--- {name} ({cid}) ---")
        W, S, E, N = get_tight_bbox(city)

        # ---- roads ----
        rdir = ensure(DATA / "osm" / "roads" / cid)
        try:
            say(f"fetching roads via tight bbox {W:.3f},{S:.3f},{E:.3f},{N:.3f} (faster and localized)")
            try:
                G = ox.graph_from_bbox(bbox=(W, S, E, N), network_type="drive")
            except TypeError:
                G = ox.graph_from_bbox(N, S, E, W, network_type="drive")  # osmnx <2.0
            
            ox.save_graphml(G, rdir / "roads.graphml")
            edges = ox.graph_to_gdfs(G, nodes=False)

            def w(h):
                if isinstance(h, list):
                    h = h[0]
                return ROAD_WEIGHTS.get(h, 1.0)

            edges["road_weight"] = edges["highway"].apply(w)
            keep = [c for c in ["highway", "length", "road_weight", "geometry"] if c in edges.columns]
            edges[keep].to_file(rdir / "road_edges.geojson", driver="GeoJSON")
            ok(f"roads.graphml + road_edges.geojson  ({len(edges)} edges)")
        except Exception as e:
            warn(f"roads failed for {cid}: {e}")

        # ---- POIs ----
        pdir = ensure(DATA / "osm" / "pois" / cid)
        for label, tags in POI_TAGS.items():
            try:
                say(f"fetching POI: {label}")
                try:
                    gdf = ox.features_from_bbox(bbox=(W, S, E, N), tags=tags)
                except TypeError:
                    gdf = ox.features_from_bbox(N, S, E, W, tags=tags)

                if len(gdf) == 0:
                    say(f"{label}: none found")
                    continue
                # GeoJSON can't hold list-valued OSM columns -> stringify.
                gdf = gdf.applymap(lambda v: ", ".join(map(str, v)) if isinstance(v, list) else v)
                gdf = gdf.reset_index()
                gdf.to_file(pdir / f"{label}.geojson", driver="GeoJSON")
                ok(f"{label}.geojson  ({len(gdf)})")
            except Exception as e:
                warn(f"{label} failed: {e}")

        # ---- city boundary (fallback if ward shapefiles are a dead end) ----
        try:
            b = ox.geocode_to_gdf(f"{name}, Chhattisgarh, India")
            ensure(DATA / "boundaries").joinpath(f"{cid}.geojson").write_text(b.to_json())
            ok("boundary.geojson")
        except Exception as e:
            warn(f"boundary failed: {e}")

    print("\n=== DONE. Next: python scripts/03_fetch_sources.py ===\n")


if __name__ == "__main__":
    main()
