"""Shared helpers for the FloodGuard Earth Engine scripts.

Authentication (once per machine):
    pip install -r geo/requirements.txt
    earthengine authenticate
Then pass your Google Cloud project registered for Earth Engine (noncommercial tier):
    python geo/imerg.py --project my-ee-project
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
from typing import Any

import ee

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA = os.path.join(ROOT, "public", "data")


def init_ee(project: str | None) -> None:
    project = project or os.environ.get("EE_PROJECT")
    try:
        ee.Initialize(project=project)
    except Exception as exc:  # noqa: BLE001 - surface a friendly message
        sys.exit(
            f"Earth Engine init failed: {exc}\n"
            "Run `earthengine authenticate` and pass --project <your-ee-project> (or set EE_PROJECT)."
        )


def load_zones(path: str) -> tuple[ee.FeatureCollection, list[dict[str, Any]]]:
    """Read public/data/zones.geojson (written by `npm run data:synthetic`) into Earth Engine."""
    with open(path, encoding="utf-8") as fh:
        gj = json.load(fh)
    feats = gj["features"]
    fc = ee.FeatureCollection([ee.Feature(ee.Geometry(f["geometry"]), {"id": f["properties"]["id"]}) for f in feats])
    return fc, feats


def aoi_for(zones: ee.FeatureCollection, buffer_m: int = 3000) -> ee.Geometry:
    return zones.geometry().bounds().buffer(buffer_m).bounds()


def write_json(path: str, data: Any, indent: int | None = 1) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=indent)
        fh.write("\n")
    print(f"wrote {os.path.relpath(path, ROOT)}")


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
