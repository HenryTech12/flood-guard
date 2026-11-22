"""Terrain + 2022 flood history → base_risk_score per zone (0..1).

    base = 0.4 · (1 − elevation_norm) + 0.2 · (1 − slope_norm) + 0.4 · flood_overlap_2022

  elevation_norm  zone mean elevation (Copernicus GLO-30), min–max normalised across zones
  slope_norm      zone mean slope / 10°, capped at 1 (flat = water collects)
  flood_overlap   share of the zone flagged as flooded by sentinel1_flood.flood_image

Output: public/data/zone_base_risk.json. Re-run `npm run db:seed` afterwards.

    python geo/dem_risk.py --project my-ee-project
"""
from __future__ import annotations

import argparse
import os

import ee

from common import DATA, aoi_for, init_ee, load_zones, now_iso, write_json
from sentinel1_flood import dem_image, flood_image


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--project")
    p.add_argument("--zones", default=os.path.join(DATA, "zones.geojson"))
    p.add_argument("--pre", nargs=2, default=["2022-01-15", "2022-03-15"])
    p.add_argument("--flood", nargs=2, default=["2022-10-05", "2022-10-20"])
    p.add_argument("--out", default=os.path.join(DATA, "zone_base_risk.json"))
    a = p.parse_args()

    init_ee(a.project)
    zones, feats = load_zones(a.zones)
    aoi = aoi_for(zones)
    dem = dem_image(aoi)
    slope = ee.Terrain.slope(dem)
    flood = flood_image(aoi, tuple(a.pre), tuple(a.flood)).unmask(0)
    stack = dem.rename("elev").addBands(slope.rename("slope")).addBands(flood.rename("flood"))

    stats = stack.reduceRegions(collection=zones, reducer=ee.Reducer.mean(), scale=30).getInfo()["features"]
    rows = {s["properties"]["id"]: s["properties"] for s in stats}
    elevs = [rows[f["properties"]["id"]]["elev"] for f in feats]
    lo, hi = min(elevs), max(elevs)

    out = {}
    for f in feats:
        zid = f["properties"]["id"]
        r = rows[zid]
        elev_norm = 0.0 if hi == lo else (r["elev"] - lo) / (hi - lo)
        slope_norm = min(1.0, (r["slope"] or 0) / 10.0)
        overlap = float(r["flood"] or 0)
        base = 0.4 * (1 - elev_norm) + 0.2 * (1 - slope_norm) + 0.4 * overlap
        out[zid] = {
            "base_risk_score": round(max(0.0, min(1.0, base)), 3),
            "mean_elevation_m": round(r["elev"], 1),
            "mean_slope_deg": round(r["slope"], 2),
            "flood_overlap_2022": round(overlap, 3),
            "historically_flooded": overlap > 0.05,
        }
        print(f"{zid:12s} elev {r['elev']:6.1f} m  slope {r['slope']:4.1f}°  flooded {overlap:5.1%}  → base {base:.2f}")

    write_json(
        a.out,
        {
            "synthetic": False,
            "source": "Copernicus GLO-30 DEM + Sentinel-1 2022 flood overlap via Google Earth Engine",
            "generated_at": now_iso(),
            "method": "base = 0.4·(1 − elev_norm) + 0.2·(1 − slope_norm) + 0.4·flood_overlap_2022",
            "zones": out,
        },
    )


if __name__ == "__main__":
    main()
