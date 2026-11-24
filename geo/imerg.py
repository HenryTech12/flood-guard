"""NASA GPM IMERG rainfall → per-zone accumulated rainfall time series.

Output: public/data/imerg_2022_zones.json (same schema the app seeds from):
    {"synthetic": false, "interval_hours": 3, "start": ISO, "zones": {zone_id: [mm, ...]}}

    python geo/imerg.py --project my-ee-project
    python geo/imerg.py --project my-ee-project --start 2022-09-20 --end 2022-10-16 --interval-hours 3

Data: NASA GPM IMERG Final Run V07 (Earth Engine "NASA/GPM_L3/IMERG_V07"), half-hourly
precipitation rate in mm/hr at 0.1°. Each half-hour image contributes rate × 0.5 h.
Zones are smaller than one IMERG pixel, so neighbouring zones share values — the
zone-to-zone differences come from pixel edges, and terrain drives the rest of the risk.
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
from collections import defaultdict

import ee

from common import DATA, init_ee, load_zones, now_iso, write_json

COLLECTION = "NASA/GPM_L3/IMERG_V07"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--project", help="Earth Engine Cloud project id (or EE_PROJECT env)")
    p.add_argument("--zones", default=os.path.join(DATA, "zones.geojson"))
    p.add_argument("--start", default="2022-09-20")
    p.add_argument("--end", default="2022-10-16")
    p.add_argument("--interval-hours", type=int, default=3)
    p.add_argument("--out", default=os.path.join(DATA, "imerg_2022_zones.json"))
    a = p.parse_args()

    init_ee(a.project)
    zones, feats = load_zones(a.zones)
    start = dt.datetime.fromisoformat(a.start).replace(tzinfo=dt.timezone.utc)
    end = dt.datetime.fromisoformat(a.end).replace(tzinfo=dt.timezone.utc)
    n = int((end - start).total_seconds() // (a.interval_hours * 3600))
    print(f"IMERG {a.start} → {a.end}: {n} intervals × {len(feats)} zones")

    col = ee.ImageCollection(COLLECTION).select("precipitation").filterDate(a.start, a.end)
    ee_start = ee.Date(a.start)

    def interval(i):
        t0 = ee_start.advance(ee.Number(i).multiply(a.interval_hours), "hour")
        t1 = t0.advance(a.interval_hours, "hour")
        # mm/hr × 0.5 h per half-hourly image → mm in the interval
        img = col.filterDate(t0, t1).sum().multiply(0.5).rename("mm")
        return img.set("i", i)

    images = ee.ImageCollection(ee.List.sequence(0, n - 1).map(interval))
    table = images.map(
        lambda img: img.reduceRegions(collection=zones, reducer=ee.Reducer.mean(), scale=11132).map(lambda f: f.set("i", img.get("i")))
    ).flatten()

    rows = table.getInfo()["features"]
    series: dict[str, list[float]] = defaultdict(lambda: [0.0] * n)
    for r in rows:
        props = r["properties"]
        mm = props.get("mean")
        series[props["id"]][int(props["i"])] = round(float(mm), 2) if mm is not None else 0.0

    write_json(
        a.out,
        {
            "synthetic": False,
            "source": f"NASA GPM IMERG Final Run V07 ({COLLECTION}) via Google Earth Engine, zone-mean accumulations",
            "generated_at": now_iso(),
            "units": "mm per interval",
            "interval_hours": a.interval_hours,
            "start": start.isoformat().replace("+00:00", "Z"),
            "zones": {f["properties"]["id"]: series[f["properties"]["id"]] for f in feats},
        },
    )
    peak = {z: max((sum(v[i : i + 24 // a.interval_hours]) for i in range(len(v))), default=0) for z, v in series.items()}
    print("max 24h rainfall (mm):", {z: round(m) for z, m in peak.items()})


if __name__ == "__main__":
    main()
