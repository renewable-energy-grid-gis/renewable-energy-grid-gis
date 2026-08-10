---
title: Spatial Pipeline Orchestration & Deployment
description: Run energy-GIS pipelines unattended — pinned GDAL/PROJ containers, idempotent task graphs, backfill-safe scheduling, structured spatial logging, and the CI gates that stop a bad reprojection from reaching a permitting submission.
slug: spatial-pipeline-orchestration-and-deployment
type: guide
breadcrumb: Spatial Pipeline Orchestration & Deployment
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Spatial Pipeline Orchestration & Deployment

Orchestration is the stage where a working notebook becomes a service that runs at 03:00 without
anyone watching, and it is the deployment half of the
[core energy-GIS data and spatial fundamentals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/)
pipeline. The failure modes here are different in kind from the ones upstream. A geometry bug
produces a wrong shape; an orchestration bug produces a shape that is correct, a schedule that ran,
and a result that silently describes last month. The three that recur are version drift in the
native geospatial stack, tasks that are not safe to re-run, and logging that records that a job
finished without recording what it did.

Version drift is the one that surprises teams. `geopandas` and `rasterio` are thin Python bindings
over GDAL, PROJ and GEOS, and the numbers they return depend on the C libraries underneath. A
container rebuilt six months later with an unpinned base image can select a different datum
transformation pipeline for the same pair of EPSG codes, shifting coordinates by centimetres —
invisible on a map, material at survey-staking tolerance, and completely undetectable from the
Python dependency list. Pinning the Python packages is not enough; the native stack has to be pinned
too, and a fixture test has to assert that a known reprojection still lands where it did.

<svg viewBox="0 0 940 400" role="img" aria-label="The dependency stack a spatial pipeline actually runs on, and which layers a Python requirements file pins. GeoPandas and rasterio are thin bindings over GDAL, PROJ and GEOS, and those C libraries decide what a reprojection returns. Pinning only the Python layer leaves the two layers that produce the coordinates unpinned, so a container rebuilt months later can select a different datum transformation for the same pair of EPSG codes." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>What a requirements file pins, and what actually decides the answer</title>
  <desc>A four-layer stack. The top layer is the analysis code. Below it, the Python bindings — geopandas, rasterio, pyproj — marked as pinned by a requirements file. Below those, the native libraries GDAL, PROJ and GEOS, marked as unpinned unless the container pins them. At the base, the PROJ datum grids, marked as downloaded at runtime unless baked into the image. Callouts note that the bottom two layers decide the coordinates, and that a fixture test asserting a known transformation is the only thing that catches a change in them.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="orc1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Four layers; a requirements file pins one of them</text>
  <rect x="40" y="66" width="600" height="60" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
  <text x="60" y="94" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">analysis code</text>
  <text x="60" y="114" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">your repository</text>
  <text x="620" y="102" text-anchor="end" font-size="11" fill="currentColor" opacity="0.9">pinned by git</text>
  <rect x="40" y="136" width="600" height="60" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
  <text x="60" y="164" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">geopandas · rasterio · pyproj</text>
  <text x="60" y="184" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">Python bindings</text>
  <text x="620" y="172" text-anchor="end" font-size="11" fill="currentColor" opacity="0.9">pinned by requirements.txt</text>
  <rect x="40" y="206" width="600" height="60" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.4"/>
  <text x="60" y="234" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">GDAL · PROJ · GEOS</text>
  <text x="60" y="254" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">native C libraries</text>
  <text x="620" y="242" text-anchor="end" font-size="11" fill="currentColor" opacity="0.9">pinned only by the container</text>
  <rect x="40" y="276" width="600" height="60" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.4"/>
  <text x="60" y="304" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">PROJ datum grids</text>
  <text x="60" y="324" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">transformation accuracy</text>
  <text x="620" y="312" text-anchor="end" font-size="11" fill="currentColor" opacity="0.9">downloaded at runtime unless baked in</text>
  <rect x="668" y="66" width="240" height="73" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="788.0" y="88" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">These two decide</text>
  <text x="788.0" y="107" text-anchor="middle" font-size="11.5" fill="currentColor">what a reprojection</text>
  <text x="788.0" y="126" text-anchor="middle" font-size="11.5" fill="currentColor">actually returns</text>
  <line x1="660" y1="216" x2="660" y2="300" stroke="#F4A261" stroke-width="2"/>
  <line x1="660" y1="216" x2="646" y2="216" stroke="#F4A261" stroke-width="2"/>
  <line x1="660" y1="300" x2="646" y2="300" stroke="#F4A261" stroke-width="2"/>
  <rect x="668" y="190" width="240" height="73" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="788.0" y="212" text-anchor="middle" font-size="11.5" fill="currentColor">A fixture test on a known</text>
  <text x="788.0" y="231" text-anchor="middle" font-size="11.5" fill="currentColor">transformation is the only</text>
  <text x="788.0" y="250" text-anchor="middle" font-size="11.5" fill="currentColor">check that sees a change here</text>
  <rect x="40" y="350" width="868" height="27" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="370" text-anchor="middle" font-size="11" fill="currentColor">A centimetre-scale datum shift is invisible on a map, material at staking tolerance, and absent from every Python dependency list.</text>
</svg>

## The task graph is the contract

A spatial pipeline is a directed graph of tasks whose edges are datasets, and the useful discipline
is to make each edge an explicit, addressable artefact rather than an in-memory handoff. A task that
reads `s3://.../interconnection-queue/2026-07/` and writes `s3://.../screened/2026-07/` can be re-run
in isolation, backfilled for an old month, and reasoned about without running anything. A task that
reads a DataFrame from the previous step in the same process can do none of those things.

That framing decides the orchestration questions that follow. Retries become safe when every task is
idempotent — running it twice with the same inputs produces the same artefact and no duplicates —
which in practice means writing to a staging key and renaming, as described in
[geospatial data ingestion pipelines](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/).
Backfills become ordinary runs with a different partition parameter. And a partial failure leaves the
graph in a state a scheduler can resume rather than a state a human has to reconstruct.

The unit of partitioning should follow the natural grain of the data, which in this domain is almost
always geography crossed with time: a state per month, a balancing area per day, a project per run.
Partitioning by an artificial batch identifier makes backfills unnatural and makes it impossible to
answer "is Texas up to date" without reading everything.

## Prerequisites and data requirements

The workflow assumes a container runtime, an object store, and a scheduler — Prefect, Airflow,
Dagster or a cron-driven container are all workable, and the choice matters far less than the
idempotency discipline. Inputs are the upstream artefacts described elsewhere in this section;
outputs are versioned artefacts plus a run record.

The container is the part worth specifying precisely. Build on a slim Python base, install the
geospatial stack from wheels that bundle their native libraries, pin every version including the
wheel build, and set `PROJ_NETWORK=OFF` with the datum grids baked into the image unless the runtime
genuinely has network access to the CDN. A pipeline that silently falls back to a lower-accuracy
transformation because a grid download failed is a defect that only manifests in production.

## Core implementation: an idempotent, partition-addressed task

The function below is deliberately boring: it derives its own output path from its parameters,
short-circuits when the artefact already exists unless forced, writes to a staging key, renames, and
returns a record rather than a DataFrame. Almost every orchestration property worth having follows
from those five decisions.

```python
from __future__ import annotations

import hashlib
import json
import logging
import time
import uuid
from dataclasses import asdict, dataclass

import geopandas as gpd

log = logging.getLogger("siting.pipeline")


@dataclass(frozen=True)
class TaskRecord:
    task: str
    partition: str
    output_uri: str
    rows_in: int
    rows_out: int
    rows_quarantined: int
    input_fingerprint: str
    proj_version: str
    duration_s: float


def screen_partition(
    state: str,
    month: str,
    *,
    root: str,
    target_epsg: int,
    force: bool = False,
    storage_options: dict | None = None,
) -> TaskRecord:
    """Screen one state-month partition. Safe to re-run; safe to backfill."""
    started = time.perf_counter()
    src = f"{root}/queue/state={state}/month={month}/part.parquet"
    dst = f"{root}/screened/state={state}/month={month}/part.parquet"

    fingerprint = _fingerprint(src, storage_options)
    if not force and _artefact_matches(dst, fingerprint, storage_options):
        log.info("skip: %s %s already built from %s", state, month, fingerprint[:12])
        return _load_record(dst, storage_options)

    queue = gpd.read_parquet(src, storage_options=storage_options)
    rows_in = len(queue)

    projected = queue.to_crs(target_epsg)
    keep = projected[projected.geometry.notna() & projected.is_valid]
    quarantined = rows_in - len(keep)

    staging = f"{dst}.staging-{uuid.uuid4().hex}"
    keep.to_parquet(staging, storage_options=storage_options)
    _atomic_rename(staging, dst, storage_options)

    import pyproj

    record = TaskRecord(
        task="screen_partition",
        partition=f"{state}/{month}",
        output_uri=dst,
        rows_in=rows_in,
        rows_out=len(keep),
        rows_quarantined=quarantined,
        input_fingerprint=fingerprint,
        proj_version=pyproj.proj_version_str,
        duration_s=round(time.perf_counter() - started, 3),
    )
    log.info("built %s", json.dumps(asdict(record)))
    return record


def _fingerprint(uri: str, storage_options: dict | None) -> str:
    """Content address for the input, so a re-run is a no-op when nothing changed."""
    import fsspec

    fs, path = fsspec.core.url_to_fs(uri, **(storage_options or {}))
    info = fs.info(path)
    key = f"{info['size']}:{info.get('mtime', '')}:{info.get('etag', '')}"
    return hashlib.sha256(key.encode()).hexdigest()
```

The fingerprint deserves comment. Content-addressing the input rather than checking a timestamp is
what makes a re-run cheap and a backfill correct: a scheduled job that fires hourly against an
unchanged input does nothing and says so, while a job whose upstream was revised rebuilds without
anyone remembering to clear a cache. Recording the fingerprint on the output is what lets the next
run make that decision without reading the data.

<svg viewBox="0 0 940 404" role="img" aria-label="How a partition-addressed task graph behaves on a re-run. Each task derives its own output path from its parameters and records the fingerprint of its input. On the second run, three partitions whose inputs are unchanged short-circuit in milliseconds, one whose upstream was revised rebuilds, and a failed partition retries safely because the write is staged and renamed rather than performed in place." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>A second run touches only what changed</title>
  <desc>A task graph over four state-month partitions. Each partition shows its input fingerprint and its output artefact. On the second run, Texas, New Mexico and Oklahoma have unchanged fingerprints and are skipped in milliseconds; Kansas has a revised upstream fingerprint and is rebuilt; a previously failed Colorado partition retries from a clean state because its earlier attempt wrote to a staging key that was never renamed. A legend maps the three outcomes: skipped, rebuilt and retried.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="404"/>
  <defs><marker id="orc2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Second run: same code, same schedule, different work</text>
  <rect x="40" y="66" width="240" height="54" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="160" y="90" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">TX / 2026-07</text>
  <text x="160" y="108" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">fingerprint unchanged</text>
  <line x1="286" y1="93" x2="330" y2="93" stroke="currentColor" stroke-width="1.4" opacity="0.7" marker-end="url(#orc2-arr)"/>
  <rect x="338" y="66" width="240" height="54" rx="7" fill="none" stroke="#3D8B5F" stroke-width="1.2" opacity="0.7"/>
  <text x="458" y="98" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">skipped · 40 ms</text>
  <rect x="40" y="130" width="240" height="54" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="160" y="154" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">NM / 2026-07</text>
  <text x="160" y="172" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">fingerprint unchanged</text>
  <line x1="286" y1="157" x2="330" y2="157" stroke="currentColor" stroke-width="1.4" opacity="0.7" marker-end="url(#orc2-arr)"/>
  <rect x="338" y="130" width="240" height="54" rx="7" fill="none" stroke="#3D8B5F" stroke-width="1.2" opacity="0.7"/>
  <text x="458" y="162" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">skipped · 38 ms</text>
  <rect x="40" y="194" width="240" height="54" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="160" y="218" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">OK / 2026-07</text>
  <text x="160" y="236" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">fingerprint unchanged</text>
  <line x1="286" y1="221" x2="330" y2="221" stroke="currentColor" stroke-width="1.4" opacity="0.7" marker-end="url(#orc2-arr)"/>
  <rect x="338" y="194" width="240" height="54" rx="7" fill="none" stroke="#3D8B5F" stroke-width="1.2" opacity="0.7"/>
  <text x="458" y="226" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">skipped · 41 ms</text>
  <rect x="40" y="258" width="240" height="54" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="160" y="282" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">KS / 2026-07</text>
  <text x="160" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">upstream revised</text>
  <line x1="286" y1="285" x2="330" y2="285" stroke="currentColor" stroke-width="1.4" opacity="0.7" marker-end="url(#orc2-arr)"/>
  <rect x="338" y="258" width="240" height="54" rx="7" fill="none" stroke="#F4A261" stroke-width="1.2" opacity="0.7"/>
  <text x="458" y="290" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">rebuilt · 92 s</text>
  <rect x="40" y="322" width="240" height="54" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="160" y="346" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">CO / 2026-07</text>
  <text x="160" y="364" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">previous attempt failed</text>
  <line x1="286" y1="349" x2="330" y2="349" stroke="currentColor" stroke-width="1.4" opacity="0.7" marker-end="url(#orc2-arr)"/>
  <rect x="338" y="322" width="240" height="54" rx="7" fill="none" stroke="#5BA8C8" stroke-width="1.2" opacity="0.7"/>
  <text x="458" y="354" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">retried · 88 s</text>
  <rect x="614" y="66" width="294" height="73" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="761.0" y="88" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">Why the skip is safe</text>
  <text x="761.0" y="107" text-anchor="middle" font-size="11.5" fill="currentColor">the output records the input</text>
  <text x="761.0" y="126" text-anchor="middle" font-size="11.5" fill="currentColor">fingerprint it was built from</text>
  <rect x="614" y="176" width="294" height="73" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="761.0" y="198" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">Why the retry is safe</text>
  <text x="761.0" y="217" text-anchor="middle" font-size="11.5" fill="currentColor">the failed attempt wrote to a</text>
  <text x="761.0" y="236" text-anchor="middle" font-size="11.5" fill="currentColor">staging key, never to the target</text>
  <rect x="614" y="286" width="294" height="73" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="761.0" y="308" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">Why the rebuild happened</text>
  <text x="761.0" y="327" text-anchor="middle" font-size="11.5" fill="currentColor">the upstream artefact changed —</text>
  <text x="761.0" y="346" text-anchor="middle" font-size="11.5" fill="currentColor">no cache to clear by hand</text>
</svg>

## Scheduling, backfills and the late-arriving partition

Energy data arrives late and gets revised. EIA back-revises monthly series, interconnection queues
are republished with corrections, and a resource product can be reprocessed for a whole year at
once. A scheduler that assumes a partition is final once built will serve stale results
indefinitely; one that rebuilds everything nightly will spend most of its time recomputing unchanged
history.

The workable middle is a freshness window plus fingerprint checking. Re-examine the last N periods on
every run — three months is a common choice for monthly energy data — and rebuild only those whose
input fingerprint changed. Everything older is rebuilt only when explicitly backfilled. This keeps
the nightly cost proportional to the freshness window rather than to the history, and it makes
revision handling automatic rather than a manual chore.

Backfills should use the same task the scheduler uses, with the partition as a parameter. A separate
backfill script is a second implementation that drifts from the first, and the drift is discovered
when the two produce different numbers for the same month.

## Error handling and edge cases

**A task that fails halfway through a write.** The staging-then-rename pattern makes this a
non-event: the target still holds the previous version, and the orphaned staging object is garbage
collected by a lifecycle rule. Without it, a killed job leaves a truncated artefact that every
downstream reader treats as complete.

**A partition with no rows.** Distinguish "no data yet" from "no rows qualify". The first should
leave the partition unbuilt so the next run retries; the second should write an empty artefact with
a record, so downstream tasks can tell that the screen ran and found nothing. Conflating them
produces a pipeline that either retries forever or silently reports zero.

**A dependency upgrade that changes a result.** This is what the fixture test exists for: a handful
of geometries with known reprojected coordinates, areas and distances, asserted to a fixed tolerance
in CI. It turns a silent centimetre-scale drift into a failing build, and it is the only mechanism
that catches a PROJ pipeline change.

**Clock and timezone assumptions in the schedule.** A daily job partitioned by local date runs twice
on one autumn day and zero times on one spring day in a DST-observing zone. Partition on UTC dates
and let presentation handle local time, exactly as with the timeseries handling described under
[temporal data aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/).

## Observability for spatial pipelines

Generic pipeline metrics — did it run, how long did it take — say nothing about whether the spatial
work was correct. Four spatial signals belong in every run record, and all four are cheap.

The **quarantine rate** is the earliest warning that an upstream provider changed something; alert on
its delta rather than its level. The **CRS transformation path** actually used, as a string, catches
the PROJ drift case in production rather than only in CI. The **geometry repair count** distinguishes
a source that is degrading from one that is merely messy. And the **bounding box of the output**,
logged per partition, catches the whole class of failures where a coordinate error moves a state's
worth of assets into the ocean — a check that costs one line and catches the most embarrassing
possible bug.

<svg viewBox="0 0 940 392" role="img" aria-label="Four spatial signals that belong in every run record, and the failure each one catches. The quarantine rate catches upstream schema drift; the transformation pipeline string catches a PROJ change in production rather than in CI; the geometry repair count distinguishes a degrading source from a merely messy one; and the output bounding box catches the class of coordinate errors that move a state of assets into the ocean." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Four spatial log fields and the bug each one catches</title>
  <desc>A table of four structured log fields. Quarantine rate, an example value of 2.4 percent, catches upstream schema drift and should be alerted on as a delta rather than a level. Transformation pipeline, an example PROJ pipeline string, catches a native-library change in production. Geometries repaired, an example of 118, distinguishes a degrading source from a messy one. Output bounding box, an example west Texas extent, catches a coordinate error that relocates the whole partition. A note advises emitting all four as one JSON line, since a log aggregator can alert on a field but not on a sentence.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="392"/>
  <defs><marker id="orc3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Generic metrics say it ran; these say what it did</text>
  <rect x="40" y="70" width="868" height="60" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3" opacity="0.5"/>
  <text x="60" y="96" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">quarantine_rate</text>
  <text x="60" y="116" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">0.024</text>
  <text x="890" y="106" text-anchor="end" font-size="11.5" fill="currentColor">upstream schema drift — alert on the delta</text>
  <rect x="40" y="140" width="868" height="60" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3" opacity="0.5"/>
  <text x="60" y="166" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">proj_pipeline</text>
  <text x="60" y="186" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">&quot;+proj=pipeline +step …&quot;</text>
  <text x="890" y="176" text-anchor="end" font-size="11.5" fill="currentColor">a native-library change in production</text>
  <rect x="40" y="210" width="868" height="60" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3" opacity="0.5"/>
  <text x="60" y="236" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">geometries_repaired</text>
  <text x="60" y="256" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">118</text>
  <text x="890" y="246" text-anchor="end" font-size="11.5" fill="currentColor">a degrading source versus a messy one</text>
  <rect x="40" y="280" width="868" height="60" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3" opacity="0.5"/>
  <text x="60" y="306" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">output_bbox</text>
  <text x="60" y="326" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">(-106.4, 31.2, -101.1, 36.0)</text>
  <text x="890" y="316" text-anchor="end" font-size="11.5" fill="currentColor">a coordinate error that moves the partition</text>
  <rect x="40" y="350" width="868" height="28" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="370" text-anchor="middle" font-size="11.5" fill="currentColor">Emit them as one JSON line per run: a log aggregator can alert on a field, never on a sentence.</text>
</svg>

Emit these as structured JSON on a single line per run, not as formatted prose. A log aggregator can
alert on a field; it cannot alert on a sentence.

```python
def assert_pipeline_invariants(record: TaskRecord, bbox: tuple[float, float, float, float],
                               study_bbox: tuple[float, float, float, float]) -> None:
    """CI and runtime gate — the four assertions worth failing a run over."""
    assert record.rows_out > 0, f"{record.partition}: screen produced no rows"
    rate = record.rows_quarantined / max(record.rows_in, 1)
    assert rate < 0.15, f"{record.partition}: quarantine rate {rate:.1%} — upstream schema drift?"
    assert record.proj_version.startswith("9."), (
        f"unexpected PROJ {record.proj_version} — pin the native stack, not just the wheels"
    )
    minx, miny, maxx, maxy = bbox
    sminx, sminy, smaxx, smaxy = study_bbox
    assert sminx <= minx and maxx <= smaxx and sminy <= miny and maxy <= smaxy, (
        f"{record.partition}: output bbox {bbox} escapes the study area {study_bbox}"
    )
```

## Performance and cost

The dominant cost in a scheduled spatial pipeline is usually neither CPU nor storage but redundant
reads. A task that re-reads a national constraint layer for every one of 3,000 parcels pays the
transfer 3,000 times; the same task with the layer read once per worker pays it once per worker. The
second largest is over-partitioning: tens of thousands of tiny artefacts cost more in object listing
and metadata than they save in parallelism, which is the same effect described for
[streaming GeoParquet from cloud object storage](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/streaming-geoparquet-from-cloud-object-storage-with-geopandas/).

Container cold start matters more than it does for non-spatial work, because the PROJ datum grids and
the GDAL driver registry are not free to load. For short tasks that dominates the run; the fix is
either a warm worker pool or fewer, larger tasks. Serverless functions are a poor fit for raster
stages for exactly this reason and a reasonable fit for per-partition vector work.

## Frequently asked questions

### Airflow, Prefect or Dagster for a spatial pipeline?

Any of them, and the decision should turn on what the team already runs. None of the three has
meaningful geospatial support, because the properties that matter — idempotent tasks, addressable
artefacts, parameterised backfills, structured run records — are properties of how tasks are written
rather than of the scheduler. A pipeline built on those properties can be moved between schedulers in
an afternoon; one built without them cannot be made reliable on any of them.

### How do I pin GDAL and PROJ properly?

Install from wheels that vendor their native libraries — `rasterio` and `pyproj` both publish these —
pin the exact wheel versions, and record `pyproj.proj_version_str` and `rasterio.__gdal_version__` in
the run record. Then add a fixture test asserting a known transformation to a fixed tolerance. The
pin prevents the drift; the record proves which version produced a given output; the fixture catches
the case where the pin was changed deliberately and the consequences were not noticed.

### Should the pipeline write to a database or to object storage?

Object storage for artefacts, a database for the index of them. Spatial artefacts are large,
immutable and read whole; object storage is built for that and a database is not. What a database
does well is answer "which partitions exist, when were they built, from what inputs" — which is
exactly the run-record table, and it is small.

### What belongs in a CI run versus a scheduled run?

CI runs the fixture tests, the schema assertions and a screening pass over a small committed sample;
it must never touch production data or the real object store. The scheduled run does the real work
with the same code paths. The most common mistake is letting CI depend on a live external portal,
which makes the build fail for reasons that have nothing to do with the change under test.

### How should secrets and API keys be provided?

Through the runtime's secret mechanism, injected as environment variables, with a distinct key per
job rather than a shared one. Portal quotas are per key, so a shared key means an interactive session
can exhaust the budget a nightly job depends on — and a per-job key makes the log record identify
which job hit the limit.

### Is it worth containerising a pipeline that only ever runs on one machine?

Yes, for the pinning alone. The container is where the GDAL, PROJ and GEOS versions are fixed, and
those are the dependencies most likely to change under a pipeline without anyone editing a
requirements file. Running it on one machine is a scheduling decision; pinning the native stack is a
correctness one.


### Should the pipeline own its own copy of upstream data?

Yes, and the copy is the boundary. Reading a public portal directly from an analysis task couples the
analysis to the portal's uptime, its rate limits and its revision schedule all at once. An ingestion
task that fetches once, validates, and writes a versioned artefact converts three sources of
non-determinism into one dated file, and every downstream task then reads something that cannot
change under it mid-run.

### How much history should the run records keep?

Enough to answer the questions that get asked, which in practice means years rather than weeks. The
records are small — one JSON line per partition per run — and the questions they answer are exactly
the ones with commercial weight: which version of which input produced the figure in a submission,
when a quarantine rate started drifting, and whether a result changed because the data changed or
because the code did. Rotate the logs, keep the records.

### What is the smallest useful orchestration setup?

A container with a pinned native stack, a cron trigger, tasks that derive their own output paths, and
a JSON run record appended to object storage. That is enough to get idempotency, backfills and an
audit trail without any scheduler at all. Schedulers earn their keep when the graph has branches,
retries need policies, and more than one person needs to see why a run failed — but they add nothing
that the task discipline does not already provide.


### How do I test a pipeline whose inputs are hundreds of gigabytes?

By committing a fixture that is three orders of magnitude smaller and exercises the same code paths.
A dozen parcels spanning a zone boundary, one invalid ring, one null geometry, one record with a
mis-keyed voltage and one partition with no qualifying rows will find more defects than a full-scale
run, and it runs in seconds on every commit. Scale tests belong in a nightly job against a real
partition, where slowness is acceptable and a failure is informative rather than blocking.

### Should tasks be retried automatically?

Yes, with a bounded count and only where the task is genuinely idempotent — which is the whole reason
the write pattern matters. Transient object-store errors and portal rate limits are the normal case
and resolve on the second attempt; a schema violation or a topology failure will not, so a retry
policy that treats all failures alike simply delays the alert by the retry budget. Separate the two
by exception type and let the deterministic failures fail fast.

### What does a good run record look like six months later?

Readable without the code. It should name the task, the partition, the input fingerprint, the output
URI, the row counts in and out, the quarantine count, the native library versions, and the wall-clock
duration — and nothing that requires the reader to know how the pipeline is implemented. The test is
whether an engineer who has never seen the repository can answer "what produced this file, from what,
and when" from the record alone.

## Related

- [Core Energy-GIS Data & Spatial Fundamentals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/) — the pipeline this stage deploys
- [Geospatial Data Ingestion Pipelines](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/) — the atomic-write pattern every task here depends on
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — what the pinned PROJ stack protects
- [Spatial Data Quality & Validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) — the quarantine rate this pipeline monitors
- [Environmental Constraint & Exclusion Screening](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/environmental-constraint-and-exclusion-screening/) — a typical scheduled consumer of these artefacts
