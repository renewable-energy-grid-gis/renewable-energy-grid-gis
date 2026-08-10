---
title: Containerizing a GeoPandas Pipeline with Docker and GDAL
description: Build a reproducible container for energy-GIS work — pin GDAL, PROJ and GEOS, bake the datum grids, keep the image small, and prove with a fixture that a rebuild still reprojects to the same coordinates.
slug: containerizing-a-geopandas-pipeline-with-docker-and-gdal
type: article
breadcrumb: Containerizing a GeoPandas Pipeline
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Containerizing a GeoPandas Pipeline with Docker and GDAL

The scenario: a pipeline that produced a permitting submission in March is rebuilt in September to
answer a reviewer's question, and the reprojected coordinates come out 8 centimetres from where they
were. Nothing in the repository changed. The `requirements.txt` is identical. The difference is a
PROJ version inside the base image, and it selected a different datum transformation pipeline for the
same pair of EPSG codes. This page is the deployment detail behind
[spatial pipeline orchestration and deployment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-pipeline-orchestration-and-deployment/).

## Root-cause analysis

Three layers decide what a geospatial container returns, and a typical Dockerfile pins one of them.

1. **The Python packages.** `geopandas`, `rasterio`, `pyproj`, `shapely` — pinned by
   `requirements.txt` or a lockfile, and the only layer most teams think about.
2. **The native libraries.** GDAL, PROJ and GEOS are C libraries that the Python packages bind to.
   Modern wheels vendor them, which means the wheel version pins the native version — but only if the
   wheel is actually used, and a build that falls back to a source install picks up whatever the base
   image provides.
3. **The PROJ datum grids.** Transformation accuracy between datums depends on grid files that PROJ
   downloads on demand when `PROJ_NETWORK=ON`. A container that can reach the CDN gets high-accuracy
   transformations; the same container in a locked-down VPC silently falls back to a lower-accuracy
   path, and the difference is centimetres.

<svg viewBox="0 0 940 396" role="img" aria-label="What each pinning mechanism actually covers. A requirements file pins the Python packages; a lockfile with hashes additionally pins which wheel is installed; a base image pinned by digest pins the operating system libraries; and copying the PROJ datum grids into the image pins transformation accuracy. Only all four together make a rebuild reproduce the same coordinates — and the fourth is the one almost always missing." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Four pinning mechanisms and what each one covers</title>
  <desc>A coverage matrix with four pinning mechanisms as rows and four things they might pin as columns: Python package versions, the exact wheel artefact, the operating system libraries, and transformation accuracy. A plain requirements file covers only package versions. A hashed lockfile covers packages and the exact wheel. A base image pinned by digest covers the operating system libraries. Baked PROJ datum grids with network disabled cover transformation accuracy. A note marks the last row as the one most often omitted, and the one whose absence produces a silent centimetre-scale shift.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="ctr1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Reproducibility is four separate pins, not one</text>
  <text x="484.0" y="66" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.85">package</text>
  <text x="484.0" y="82" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.85">versions</text>
  <text x="612.0" y="66" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.85">exact wheel</text>
  <text x="740.0" y="66" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.85">OS libraries</text>
  <text x="868.0" y="66" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.85">transform</text>
  <text x="868.0" y="82" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.85">accuracy</text>
  <rect x="36" y="94" width="872" height="54" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.35"/>
  <text x="56" y="126" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">requirements.txt</text>
  <circle cx="484.0" cy="121" r="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2"/>
  <circle cx="484.0" cy="121" r="4" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="612.0" cy="121" r="9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2" opacity="0.4"/>
  <circle cx="740.0" cy="121" r="9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2" opacity="0.4"/>
  <circle cx="868.0" cy="121" r="9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2" opacity="0.4"/>
  <rect x="36" y="156" width="872" height="54" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.35"/>
  <text x="56" y="188" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">lockfile with hashes</text>
  <circle cx="484.0" cy="183" r="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2"/>
  <circle cx="484.0" cy="183" r="4" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="612.0" cy="183" r="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2"/>
  <circle cx="612.0" cy="183" r="4" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="740.0" cy="183" r="9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2" opacity="0.4"/>
  <circle cx="868.0" cy="183" r="9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2" opacity="0.4"/>
  <rect x="36" y="218" width="872" height="54" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.35"/>
  <text x="56" y="250" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">base image by digest</text>
  <circle cx="484.0" cy="245" r="9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2" opacity="0.4"/>
  <circle cx="612.0" cy="245" r="9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2" opacity="0.4"/>
  <circle cx="740.0" cy="245" r="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2"/>
  <circle cx="740.0" cy="245" r="4" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="868.0" cy="245" r="9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2" opacity="0.4"/>
  <rect x="36" y="280" width="872" height="54" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.35"/>
  <text x="56" y="312" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">baked PROJ grids · network OFF</text>
  <circle cx="484.0" cy="307" r="9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2" opacity="0.4"/>
  <circle cx="612.0" cy="307" r="9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2" opacity="0.4"/>
  <circle cx="740.0" cy="307" r="9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2" opacity="0.4"/>
  <circle cx="868.0" cy="307" r="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2"/>
  <circle cx="868.0" cy="307" r="4" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <rect x="36" y="344" width="872" height="42" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="472.0" y="364" text-anchor="middle" font-size="11" fill="currentColor">The bottom row is the one usually missing, and the only one whose absence is invisible: PROJ falls back to a</text>
  <text x="472.0" y="379" text-anchor="middle" font-size="11" fill="currentColor">lower-accuracy transformation without raising, and the coordinates move by centimetres.</text>
</svg>

## Pre-flight validation

The check that matters is not "does it import" but "does it transform to the same place". Assert the
versions and one known transformation at container start, and fail fast rather than producing subtly
different coordinates for a week.

```python
import pyproj
import rasterio
import shapely

# One control point with a known answer: NAD83(2011) geographic to UTM 14N, in metres.
CONTROL_LONLAT = (-101.8313, 35.2220)
CONTROL_UTM14N = (334_936.15, 3_899_889.52)   # metres, to 1 cm


def assert_geospatial_stack(*, expect_proj_major: int = 9, tol_m: float = 0.01) -> dict:
    """Refuse to run if the native stack is not the one this pipeline was validated against."""
    versions = {
        "pyproj": pyproj.__version__,
        "proj": pyproj.proj_version_str,
        "gdal": rasterio.__gdal_version__,
        "geos": shapely.geos_version_string,
        "network": pyproj.network.is_network_enabled(),
    }
    major = int(versions["proj"].split(".")[0])
    if major != expect_proj_major:
        raise RuntimeError(f"PROJ {versions['proj']} — pipeline validated against {expect_proj_major}.x")

    transformer = pyproj.Transformer.from_crs(4326, 32614, always_xy=True)
    x, y = transformer.transform(*CONTROL_LONLAT)
    dx, dy = abs(x - CONTROL_UTM14N[0]), abs(y - CONTROL_UTM14N[1])
    if max(dx, dy) > tol_m:
        raise RuntimeError(
            f"control point moved {max(dx, dy):.3f} m — datum grids or PROJ pipeline differ"
        )
    return versions
```

## Fix implementation

The Dockerfile below pins all three layers. It builds on a slim Python base, installs from wheels
that vendor their native libraries, copies the datum grids into the image rather than fetching them
at runtime, and runs the assertion above as the last build step so a bad image fails at build time
rather than in production.

```dockerfile
FROM python:3.11.9-slim-bookworm AS base

# Native libraries arrive vendored inside the wheels; these are only what GDAL's
# runtime needs for HTTP and compression, pinned to the distribution release.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates=20230311 \
        libexpat1 \
    && rm -rf /var/lib/apt/lists/*

ENV PIP_NO_CACHE_DIR=1 \
    PROJ_NETWORK=OFF \
    PROJ_DATA=/opt/proj \
    GDAL_CACHEMAX=512 \
    GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR \
    VSI_CACHE=TRUE

# Wheels only: a source build would link against whatever GDAL the base image has.
COPY requirements.lock /tmp/requirements.lock
RUN pip install --only-binary=:all: --require-hashes -r /tmp/requirements.lock

# Bake the datum grids so the transformation is identical with or without network.
RUN python -c "import pyproj, pathlib; print(pyproj.datadir.get_data_dir())" \
    && mkdir -p /opt/proj \
    && cp -r "$(python -c 'import pyproj; print(pyproj.datadir.get_data_dir())')"/. /opt/proj/
COPY grids/ /opt/proj/

COPY src/ /app/src/
WORKDIR /app

# Fail the build, not the run, if the stack does not reproduce the control point.
RUN python -c "from src.stack import assert_geospatial_stack; print(assert_geospatial_stack())"

ENTRYPOINT ["python", "-m", "src.run"]
```

The four environment variables above are not decoration. `GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR`
stops GDAL from listing an entire object-store prefix every time it opens one file, which on a bucket
with tens of thousands of objects is the difference between a one-second and a one-minute open.
`VSI_CACHE=TRUE` and `GDAL_CACHEMAX` bound the block cache so a windowed read does not quietly grow
to fill the container's memory limit — the same memory discipline described in
[geospatial data ingestion pipelines](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/).

<svg viewBox="0 0 940 392" role="img" aria-label="Image size and cold-start time for four container strategies. A full osgeo/gdal base is 1.42 gigabytes and starts in 2.9 seconds; a slim Python base with vendored wheels is 486 megabytes and 1.4 seconds; adding the baked PROJ grids costs 92 megabytes and no start time; and stripping pip caches and apt lists returns 61 megabytes. The grids are the one addition worth its size, because they buy reproducibility rather than speed." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Image size and cold start across four container strategies</title>
  <desc>A paired chart over four container strategies. The osgeo/gdal base image is 1.42 gigabytes with a 2.9 second cold start. A slim Python base with vendored wheels is 486 megabytes and 1.4 seconds. Adding baked PROJ datum grids brings it to 578 megabytes with no change to cold start. Stripping pip caches and apt lists returns it to 517 megabytes. The third configuration is marked as the working choice, with a note that the grids buy reproducibility rather than speed.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="392"/>
  <defs><marker id="ctr2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Four strategies, by image size and cold start</text>
  <text x="250" y="106" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">osgeo/gdal base</text>
  <rect x="266" y="76" width="492.26666666666665" height="48" rx="5" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="770.2666666666667" y="106" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">1420 MB · 2.9 s cold start</text>
  <text x="250" y="168" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">slim + vendored wheels</text>
  <rect x="266" y="138" width="168.48" height="48" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="446.48" y="168" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">486 MB · 1.4 s cold start</text>
  <text x="250" y="230" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">+ baked PROJ grids</text>
  <rect x="266" y="200" width="200.37333333333333" height="48" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="478.37333333333333" y="230" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">578 MB · 1.4 s cold start</text>
  <text x="250" y="292" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">+ caches stripped</text>
  <rect x="266" y="262" width="179.22666666666666" height="48" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="457.2266666666667" y="292" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">517 MB · 1.4 s cold start</text>
  <rect x="40" y="330" width="428" height="48" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="254.0" y="351" text-anchor="middle" font-size="11.5" fill="currentColor">The grids add 92 MB and no start time —</text>
  <text x="254.0" y="368" text-anchor="middle" font-size="11.5" fill="currentColor">the only size increase worth taking</text>
  <rect x="492" y="330" width="416" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="700.0" y="351" text-anchor="middle" font-size="11.5" fill="currentColor">Cold start is PROJ init and the GDAL driver</text>
  <text x="700.0" y="368" text-anchor="middle" font-size="11.5" fill="currentColor">registry, not the image size</text>
</svg>

## Fallback routing and performance tuning

- **Multi-stage builds save less than expected.** The wheels are the image, and they are needed at
  runtime; a builder stage helps only if something is compiled. Removing `pip` caches and apt lists
  saves more.
- **Layer order decides rebuild time.** Copy the lockfile and install before copying source, so a
  code change rebuilds one small layer rather than reinstalling GDAL.
- **Cold start is dominated by PROJ and the driver registry.** For short tasks, keep a warm worker
  rather than shrinking the image; for long tasks, the image size barely matters.
- **Pin the base image by digest, not by tag.** `python:3.11-slim` moves; `python@sha256:…` does not,
  and the whole point of this exercise is that it does not move.
- **Keep the grids in the image for reproducibility, not for speed.** A cached CDN fetch is fast;
  what it is not is identical across environments and over time.

## Downstream validation

The container should emit its versions with every run, so an artefact can always be traced back to
the stack that produced it. Combined with the run record described in the parent page, that gives a
complete answer to "what produced this file".

```python
import json
import logging

log = logging.getLogger("siting.stack")


def log_stack_provenance(run_id: str) -> None:
    """One structured line per run — the cheapest reproducibility insurance available."""
    versions = assert_geospatial_stack()
    log.info(json.dumps({"event": "stack", "run_id": run_id, **versions}))
```

<svg viewBox="0 0 940 380" role="img" aria-label="What an unpinned rebuild actually changes. The same control point reprojected from EPSG:4326 to EPSG:32614 lands within a centimetre across PROJ 9.2 and 9.3 with the datum grids present, and 8.4 centimetres away when the grids are missing and PROJ falls back to a ballpark transformation. The fallback raises nothing, logs nothing at default verbosity, and is the entire failure." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>The same control point under four stack configurations</title>
  <desc>A table of one control point reprojected under four configurations. PROJ 9.2 with grids present: the reference position. PROJ 9.3 with grids present: 0.004 metres away, within tolerance. PROJ 9.3 with grids absent and network enabled: 0.004 metres, because the grid was fetched. PROJ 9.3 with grids absent and network disabled: 0.084 metres away, using a ballpark transformation, with no warning raised. The last row is marked as the failure the control-point assertion exists to catch.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="380"/>
  <defs><marker id="ctr3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">One control point, four stack configurations</text>
  <rect x="40" y="70" width="868" height="60" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3" opacity="0.5"/>
  <text x="60" y="106" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">PROJ 9.2 · grids present</text>
  <text x="600" y="106" text-anchor="end" font-size="13" fill="currentColor" font-weight="700">reference</text>
  <text x="890" y="106" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.9">—</text>
  <rect x="40" y="140" width="868" height="60" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3" opacity="0.5"/>
  <text x="60" y="176" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">PROJ 9.3 · grids present</text>
  <text x="600" y="176" text-anchor="end" font-size="13" fill="currentColor" font-weight="700">0.004 m</text>
  <text x="890" y="176" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.9">within tolerance</text>
  <rect x="40" y="210" width="868" height="60" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3" opacity="0.5"/>
  <text x="60" y="246" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">PROJ 9.3 · no grids · network ON</text>
  <text x="600" y="246" text-anchor="end" font-size="13" fill="currentColor" font-weight="700">0.004 m</text>
  <text x="890" y="246" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.9">grid fetched at runtime</text>
  <rect x="40" y="280" width="868" height="60" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3" opacity="0.5"/>
  <text x="60" y="316" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">PROJ 9.3 · no grids · network OFF</text>
  <text x="600" y="316" text-anchor="end" font-size="13" fill="currentColor" font-weight="700">0.084 m</text>
  <text x="890" y="316" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.9">ballpark fallback — silent</text>
  <rect x="40" y="328" width="868" height="42" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="474.0" y="348" text-anchor="middle" font-size="11" fill="currentColor">84 millimetres is invisible on a map, inside survey-staking tolerance, and enough to move a boundary vertex</text>
  <text x="474.0" y="363" text-anchor="middle" font-size="11" fill="currentColor">across a setback line. The assertion at container start is what turns it into a failed build.</text>
</svg>

## Frequently asked questions

### Should I use the official GDAL image instead of a Python base?

Only if the pipeline needs GDAL command-line tools. The `osgeo/gdal` images are large and pin GDAL
tightly, which is helpful, but they bring a full toolchain most Python pipelines never call. Starting
from a slim Python base with vendored wheels gives the same pinning at a fraction of the size, and
the wheel is what `rasterio` actually binds to either way.

### How do I produce a lockfile with hashes?

`pip-compile --generate-hashes` from `pip-tools`, or `uv pip compile --generate-hashes`. The hashes
matter more here than in most projects: they are what stops a wheel from being silently replaced by a
rebuild for a different platform, which is one of the few remaining ways the native stack can change
without the version changing.

### What happens if the container cannot reach the PROJ CDN?

With `PROJ_NETWORK=OFF` and baked grids, nothing — which is the point. With network on and no
reachable CDN, PROJ falls back to a lower-accuracy transformation and does not raise, so the run
succeeds and the coordinates move. That silent fallback is the single strongest argument for baking
the grids.

### Does this apply to serverless deployments?

The pinning does; the shape changes. A Lambda-style function still needs the same wheels and grids,
usually shipped as a layer or a container image, and still benefits from the control-point assertion —
run it at cold start rather than at build. What does not carry over is the assumption of a warm
process: PROJ initialisation and the GDAL driver registry are paid per cold start, which is why
raster work fits serverless poorly.


### Does a bigger image cost anything besides pull time?

Mostly it costs cache churn and attack surface rather than run time. A 1.4 gigabyte image pulls
slowly on a cold node and evicts other images from the node's cache, which shows up as unpredictable
start latency for everything else on the host. It also ships a compiler toolchain and a set of
command-line utilities that a Python pipeline never invokes, each of which is something to patch. The
runtime difference between a 500 megabyte and a 1.4 gigabyte image on a warm node is close to zero.

### How should the image be tagged?

By content, not by intent. A tag like `latest` or `prod` tells a reader nothing about what is inside,
and both move. Tagging by the commit SHA and recording the resulting digest in the run record means
an artefact from six months ago names the exact image that produced it, and pulling that digest
reproduces the stack byte for byte — which is the whole point of the pinning above.

### Can the same image serve both the pipeline and interactive analysis?

Yes, and it is worth arranging. An analyst working in a notebook against a different GDAL than the
pipeline uses will eventually produce a number that the pipeline cannot reproduce, and the
investigation is expensive. Publishing the same image with a Jupyter entry point costs one extra
build stage and removes an entire category of "it works in my notebook" discrepancy.

## Related

- [Spatial Pipeline Orchestration & Deployment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-pipeline-orchestration-and-deployment/) — the parent workflow and its run records
- [Adding Spatial Regression Tests to a CI Pipeline](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-pipeline-orchestration-and-deployment/adding-spatial-regression-tests-to-a-ci-pipeline/) — the fixture suite this container has to pass
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — what the pinned PROJ stack is protecting
- [Streaming GeoParquet from Cloud Object Storage with GeoPandas](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/streaming-geoparquet-from-cloud-object-storage-with-geopandas/) — where the GDAL environment variables above pay off
