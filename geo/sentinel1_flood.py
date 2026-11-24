"""Sentinel-1 SAR change detection → 2022 flood extent polygons.

Method (simple, explainable, standard UN-SPIDER style):
  1. Sentinel-1 GRD, IW mode, VV polarisation (backscatter in dB), both orbits.
  2. Reference = median of the dry season (pre window); flood = median of the flood window.
  3. Speckle: 50 m focal median on both.
  4. Flooded where backscatter dropped by > 3 dB AND flood image < -15 dB (open water is dark).
  5. Remove permanent/seasonal water (JRC Global Surface Water seasonality ≥ 10 months).
  6. Remove steep terrain (Copernicus GLO-30 slope ≥ 5°) — radar shadow, not water.
  7. Remove specks (< 8 connected pixels), vectorise at 30 m, simplify.

Output: public/data/flood_extent_2022.geojson — one MultiPolygon feature (app schema).

    python geo/sentinel1_flood.py --project my-ee-project
"""
from __future__ import annotations

import argparse
import os

import ee

from common import DATA, aoi_for, init_ee, load_zones, now_iso, write_json

DIFF_DB = -3.0
WATER_DB = -15.0
MAX_SLOPE_DEG = 5
MIN_PIXELS = 8


def dem_image(aoi: ee.Geometry) -> ee.Image:
    dem = ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").filterBounds(aoi).mosaic()
    return dem.setDefaultProjection(ee.Projection("EPSG:4326").atScale(30))


def flood_image(aoi: ee.Geometry, pre: tuple[str, str], flood: tuple[str, str]) -> ee.Image:
    s1 = (
        ee.ImageCollection("COPERNICUS/S1_GRD")
        .filterBounds(aoi)
        .filter(ee.Filter.eq("instrumentMode", "IW"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
        .select("VV")
    )
    before = s1.filterDate(*pre).median().focal_median(50, "circle", "meters").clip(aoi)
    after = s1.filterDate(*flood).median().focal_median(50, "circle", "meters").clip(aoi)
    water = after.subtract(before).lt(DIFF_DB).And(after.lt(WATER_DB))

    gsw = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("seasonality")
    water = water.where(gsw.gte(10), 0)

    slope = ee.Terrain.slope(dem_image(aoi))
    water = water.updateMask(slope.lt(MAX_SLOPE_DEG))
    water = water.updateMask(water.connectedPixelCount(25, True).gte(MIN_PIXELS))
    return water.selfMask().rename("flood")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--project")
    p.add_argument("--zones", default=os.path.join(DATA, "zones.geojson"))
    p.add_argument("--pre", nargs=2, default=["2022-01-15", "2022-03-15"], metavar=("START", "END"))
    p.add_argument("--flood", nargs=2, default=["2022-10-05", "2022-10-20"], metavar=("START", "END"))
    p.add_argument("--observed-at", default="2022-10-10T05:30:00Z", help="timestamp the extent represents")
    p.add_argument("--out", default=os.path.join(DATA, "flood_extent_2022.geojson"))
    a = p.parse_args()

    init_ee(a.project)
    zones, _ = load_zones(a.zones)
    aoi = aoi_for(zones)
    img = flood_image(aoi, tuple(a.pre), tuple(a.flood))

    vectors = img.reduceToVectors(
        geometry=aoi, scale=30, geometryType="polygon", eightConnected=True, labelProperty="flood", maxPixels=1e10, bestEffort=True
    ).map(lambda f: f.simplify(maxError=20))
    area_km2 = img.multiply(ee.Image.pixelArea()).reduceRegion(ee.Reducer.sum(), aoi, 30, maxPixels=1e10).get("flood")

    feats = vectors.getInfo()["features"]
    polys = []
    for f in feats:
        g = f["geometry"]
        if g["type"] == "Polygon":
            polys.append(g["coordinates"])
        elif g["type"] == "MultiPolygon":
            polys.extend(g["coordinates"])
    km2 = (area_km2.getInfo() or 0) / 1e6
    print(f"{len(polys)} flood polygons, {km2:.2f} km²")

    write_json(
        a.out,
        {
            "type": "FeatureCollection",
            "synthetic": False,
            "source": "Copernicus Sentinel-1 GRD (VV) change detection via Google Earth Engine; JRC GSW permanent water and Copernicus GLO-30 slope masks",
            "generated_at": now_iso(),
            "observed_at": a.observed_at,
            "pre_window": a.pre,
            "flood_window": a.flood,
            "area_km2": round(km2, 3),
            "features": [
                {
                    "type": "Feature",
                    "properties": {"id": "s1-2022-10", "label": f"Sentinel-1 flood extent {a.flood[0]}–{a.flood[1]}"},
                    "geometry": {"type": "MultiPolygon", "coordinates": polys},
                }
            ],
        },
        indent=None,
    )


if __name__ == "__main__":
    main()
