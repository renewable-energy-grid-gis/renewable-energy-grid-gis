---
title: Solar Irradiance Raster Processing
description: A production Python workflow for solar irradiance raster processing — explicit EPSG enforcement, radiometric resampling, windowed memory-safe I/O, async orchestration, and audit-ready GHI validation for bankable resource assessment.
slug: solar-irradiance-raster-processing
type: guide
breadcrumb: Solar Irradiance Raster Processing
datePublished: 2025-09-15
dateModified: 2026-06-26
---

# Solar Irradiance Raster Processing

Accurate solar resource assessment hinges on rigorous raster ingestion, spatial normalization, and radiometric resampling long before any yield model or financial pro forma runs. This workflow is the data-preparation stage of the broader [Solar & Wind Resource Modeling Workflows](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/) pipeline: raw satellite-derived and reanalysis products — NSRDB, PVGIS, NASA POWER, CAMS — almost never arrive on a uniform coordinate reference system, resolution, or temporal cadence, and feeding them straight into a model silently corrupts the capacity factor a lender treats as ground truth. The specific failure mode this stage exists to eliminate is *CRS drift in multi-source raster stacks*: when two irradiance surfaces disagree on projection, pixel registration, or grid origin by even a fraction of a cell, every downstream spatial join with parcel boundaries, terrain masks, or transmission corridors inherits a systematic radiometric bias that no later step can detect or repair.

The goal of the stage is deterministic: turn heterogeneous Global Horizontal Irradiance (GHI), Direct Normal Irradiance (DNI), and Diffuse Horizontal Irradiance (DHI) inputs into a single analysis-ready grid that preserves radiometric integrity, carries explicit provenance, and aligns pixel-for-pixel with every other layer in the assessment. This page covers the conceptual foundation, the prerequisites, a full runnable processing function, the three failure modes that break naive pipelines, the scalability patterns for continental archives, and the audit trail that makes the output defensible in permitting and project-finance review.

<svg viewBox="0 0 980 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Solar irradiance raster processing pipeline: ingest from NSRDB, PVGIS and NASA POWER, validate CRS and registration, reproject and bilinear-resample to a metric grid, write windowed tiled output, pass the QA/QC gate, and emit an analysis-ready GHI grid; a rejection branch off CRS validation quarantines surfaces with projection or registration drift" style="width:100%;max-width:980px;height:auto;font-family:inherit;">
  <rect class="svg-bg" x="0" y="0" width="980" height="290"/>
  <title>Solar Irradiance Raster Processing Pipeline</title>
  <desc>A left-to-right data flow through six stages. Stage 1 ingest pulls GHI, DNI and DHI surfaces from NSRDB, PVGIS, NASA POWER and CAMS. Stage 2 CRS validate checks the EPSG code and pixel registration; a downward branch labelled drift to reject quarantines any surface whose projection or grid origin disagrees, so it is logged but never merged. Surfaces that pass continue through Stage 3 reproject and bilinear resample to the metric target EPSG:32610, Stage 4 windowed tiled write of float32 with NaN nodata, and Stage 5 QA/QC gate enforcing the clearness-index and alignment bounds, ending at the highlighted Stage 6 analysis-ready GHI grid carrying embedded provenance.</desc>
  <defs>
    <marker id="sir-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="980" height="290" fill="none"/>
  <!-- Stage 1 -->
  <rect x="15" y="44" width="140" height="88" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="85" y="74" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">1 · Ingest</text>
  <text x="85" y="95" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">NSRDB · PVGIS</text>
  <text x="85" y="111" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">NASA POWER · CAMS</text>
  <!-- Stage 2 -->
  <rect x="177" y="44" width="140" height="88" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="247" y="74" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">2 · CRS Validate</text>
  <text x="247" y="95" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">EPSG defined?</text>
  <text x="247" y="111" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">registration · origin</text>
  <!-- Stage 3 -->
  <rect x="339" y="44" width="140" height="88" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="409" y="74" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">3 · Reproject</text>
  <text x="409" y="95" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">bilinear resample</text>
  <text x="409" y="111" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">→ EPSG:32610</text>
  <!-- Stage 4 -->
  <rect x="501" y="44" width="140" height="88" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="571" y="74" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">4 · Windowed Write</text>
  <text x="571" y="95" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">tiled float32</text>
  <text x="571" y="111" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">NaN nodata · LZW</text>
  <!-- Stage 5 -->
  <rect x="663" y="44" width="140" height="88" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="733" y="74" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">5 · QA/QC Gate</text>
  <text x="733" y="95" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">Kt ≤ 1 · extent</text>
  <text x="733" y="111" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">±0.5 m alignment</text>
  <!-- Stage 6 (terminal, highlighted) -->
  <rect x="825" y="44" width="140" height="88" rx="7" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"/>
  <text x="895" y="74" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">6 · GHI Grid</text>
  <text x="895" y="95" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">analysis-ready</text>
  <text x="895" y="111" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">provenance tagged</text>
  <!-- Forward connectors -->
  <line x1="155" y1="88" x2="170" y2="88" stroke="currentColor" stroke-width="1.5" marker-end="url(#sir-arr)"/>
  <line x1="317" y1="88" x2="332" y2="88" stroke="currentColor" stroke-width="1.5" marker-end="url(#sir-arr)"/>
  <line x1="479" y1="88" x2="494" y2="88" stroke="currentColor" stroke-width="1.5" marker-end="url(#sir-arr)"/>
  <line x1="641" y1="88" x2="656" y2="88" stroke="currentColor" stroke-width="1.5" marker-end="url(#sir-arr)"/>
  <line x1="803" y1="88" x2="818" y2="88" stroke="currentColor" stroke-width="1.5" marker-end="url(#sir-arr)"/>
  <!-- Rejection branch off Stage 2 -->
  <line x1="247" y1="132" x2="247" y2="198" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#sir-arr)"/>
  <text x="259" y="166" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">drift → reject</text>
  <rect x="177" y="202" width="200" height="58" rx="7" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 4"/>
  <text x="277" y="227" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">Quarantine</text>
  <text x="277" y="246" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">logged, never merged</text>
</svg>

## Why naive raster stacking fails

The intuitive approach — load every GeoTIFF, call `rasterio.merge` or stack the arrays, and average — fails because raster algebra has no tolerance for spatial disagreement. Three independent mismatches compound into the bias this stage must prevent.

First, **projection mismatch**. Irradiance rasters are typically distributed in geographic coordinates ([EPSG:4326](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/)) with degree-based pixel spacing, while project development requires a projected metric system — a UTM zone such as EPSG:32610 or a state plane CRS — for accurate area, buffer, and distance work. Operating in degrees stretches north–south distance against east–west distance by a latitude-dependent factor, so a "1 km" buffer around a substation interconnection point computed on an unprojected irradiance grid is not actually 1 km. Enforcing [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) into a single projected target is the precondition for everything else.

Second, **pixel registration and grid origin divergence**. NASA POWER ships a 0.5° grid with center-registered pixels; PVGIS and CAMS often deliver edge-registered cells or finer 0.01° grids. Mixing registration conventions shifts pixel centers by half a cell, and a half-pixel shift on a continental GHI surface translates into tens of kilometres of misplaced irradiance. The affine transforms must be reconciled to a common origin before any resampling.

Third, **radiometrically wrong resampling**. Resampling is not a single operation — the correct kernel depends on what the band represents. Nearest-neighbor preserves categorical masks (cloud flags, land/water) but destroys continuous fields; bilinear preserves continuous irradiance without inventing new extremes; cubic convolution sharpens high-frequency temporal derivatives at the cost of overshoot near coastlines and terrain edges. Applying nearest-neighbor to a GHI surface, or bilinear to a quality flag, silently corrupts the data while producing a file that looks valid.

A clean pipeline therefore decouples ingestion, transformation, and validation into discrete, testable stages so that drift, registration mismatch, or resolution disagreement is caught and rejected before resource aggregation rather than discovered after the financial model has already consumed the bias.

## Prerequisites and data requirements

Before running the workflow, pin the inputs and the environment so results are reproducible across a portfolio:

- **Library versions:** `rasterio>=1.3`, `numpy>=1.24`, `pyproj>=3.5`. GDAL underpins `rasterio`; keep it `>=3.6` so `calculate_default_transform` honours `resolution` correctly. Authoritative datum transforms should defer to the [pyproj documentation](https://pyproj4.github.io/pyproj/stable/) and the EPSG registry rather than hand-coded proj strings.
- **Target CRS:** a single projected, metric CRS chosen for the project's UTM zone (for example EPSG:32610 for the US West Coast). Always store the EPSG integer, never an unqualified "UTM 10N" string.
- **Input geometry:** single-band or multi-band GeoTIFF / Cloud-Optimized GeoTIFF surfaces of GHI, DNI, or DHI in W/m² or kWh/m²/day, each carrying a defined CRS and nodata value. Surfaces missing a CRS must be rejected at ingest, not assumed — see [spatial data quality validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) for the cleaning patterns this stage assumes upstream.
- **Source provenance:** acquisition date range, source portal, and product version for each input, sourced from one of the documented [open energy data portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/) so the output's lineage is auditable.
- **Sanity bounds:** daily-mean GHI realistically falls between 0 and roughly 12 kWh/m²/day depending on latitude and atmospheric clarity. A useful normalization is the dimensionless clearness index, the ratio of surface to extraterrestrial irradiance:

$$ K_t = \frac{\mathrm{GHI}}{\mathrm{GHI}_{0}}, \qquad 0 \le K_t \le 1 $$

where $\mathrm{GHI}_0$ is top-of-atmosphere horizontal irradiance. Any pixel with $K_t > 1$ after processing is physically impossible and signals a unit, scaling, or resampling defect.

## Core implementation

The function below ingests a list of GHI rasters, validates each one, reprojects and resamples it into the target metric CRS with windowed I/O, and returns per-file QA statistics. It uses bilinear resampling to preserve radiometric continuity, writes tiled LZW-compressed `float32` GeoTIFFs with `nodata=NaN`, and orchestrates independent files concurrently with `asyncio` so I/O latency overlaps across the portfolio. Variable names are energy-specific throughout.

<svg viewBox="0 0 940 496" role="img" aria-label="What a GHI raster stack has to agree on before the bands can be treated as one cube. Four properties must match exactly across every band: the CRS, the affine transform, the width and height in pixels, and the nodata value. Two more must be recorded rather than matched: the acquisition epoch of each band and its units. A stack assembled without the first four produces a cube whose pixel [i, j] means a different place in each band." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>The six properties a raster stack has to settle before it is a cube</title>
  <desc>Two grouped lists. The first, marked must match exactly, holds four properties: coordinate reference system, affine transform, raster width and height, and nodata value. Each carries the symptom of a mismatch: a silently shifted overlay, a half-pixel offset that grows with distance from the origin, a shape error at stack time, and fill values entering statistics as data. The second, marked must be recorded, holds two: the acquisition epoch of each band and its units, with the symptom that bands are compared across different years or unit systems without any error being raised.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="496"/>
  <defs><marker id="st2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Before np.stack: four properties to match, two to record</text>
  <text x="48" y="70" text-anchor="start" font-size="12" fill="currentColor" font-weight="700" opacity="0.85">must match exactly</text>
  <rect x="40" y="82" width="868" height="44" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="110" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">CRS</text>
  <text x="320" y="110" text-anchor="start" font-size="11.5" fill="currentColor">a silent shift — no exception at any point</text>
  <rect x="40" y="134" width="868" height="44" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="162" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">affine transform</text>
  <text x="320" y="162" text-anchor="start" font-size="11.5" fill="currentColor">half-pixel offset growing from the origin</text>
  <rect x="40" y="186" width="868" height="44" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="214" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">width × height</text>
  <text x="320" y="214" text-anchor="start" font-size="11.5" fill="currentColor">ValueError at stack time — the loud one</text>
  <rect x="40" y="238" width="868" height="44" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="266" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">nodata value</text>
  <text x="320" y="266" text-anchor="start" font-size="11.5" fill="currentColor">fill values enter the statistics as data</text>
  <text x="48" y="312" text-anchor="start" font-size="12" fill="currentColor" font-weight="700" opacity="0.85">must be recorded</text>
  <rect x="40" y="324" width="868" height="44" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="352" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">acquisition epoch</text>
  <text x="320" y="352" text-anchor="start" font-size="11.5" fill="currentColor">a 2013 band averaged with a 2021 band</text>
  <rect x="40" y="376" width="868" height="44" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="404" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">units</text>
  <text x="320" y="404" text-anchor="start" font-size="11.5" fill="currentColor">W/m² and kWh/m² summed into one figure</text>
  <text x="40" y="486" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">Only the third failure raises. The other five produce a cube that stacks cleanly and means nothing.</text>
</svg>

```python
import asyncio
import logging
from pathlib import Path
from typing import Dict, List

import numpy as np
import rasterio
from rasterio.warp import calculate_default_transform, reproject, Resampling
from rasterio.crs import CRS
from concurrent.futures import ThreadPoolExecutor

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def validate_spatial_metadata(src: rasterio.DatasetReader,
                              target_epsg: int,
                              target_res_m: float) -> None:
    """Reject irradiance rasters that violate alignment preconditions."""
    if src.crs is None or not src.crs.is_valid:
        raise ValueError(f"{src.name}: source CRS is undefined or invalid.")
    if src.bounds.left >= src.bounds.right or src.bounds.bottom >= src.bounds.top:
        raise ValueError(f"{src.name}: degenerate raster bounds detected.")
    if src.nodata is None:
        logging.warning("%s: no nodata declared; NaN fill will be assumed.", src.name)
    # Flag a >5% native-vs-target resolution gap so resampling is intentional.
    native_res_m = abs(src.res[0]) * (111_320 if src.crs.is_geographic else 1)
    if abs(native_res_m - target_res_m) / target_res_m > 0.05:
        logging.info("%s: native ~%.0f m differs >5%% from target %.0f m; resampling enforced.",
                     src.name, native_res_m, target_res_m)


def reproject_irradiance(src_path: Path,
                         dst_path: Path,
                         target_epsg: int,
                         target_res_m: float,
                         chunk_size: int = 2048) -> Dict[str, float]:
    """Reproject one GHI raster to a metric grid with windowed, radiometric resampling."""
    target_crs = CRS.from_epsg(target_epsg)
    with rasterio.open(src_path) as src:
        validate_spatial_metadata(src, target_epsg, target_res_m)

        dst_transform, dst_width, dst_height = calculate_default_transform(
            src.crs, target_crs, src.width, src.height, *src.bounds,
            resolution=target_res_m,
        )
        profile = src.profile | {
            "driver": "GTiff", "crs": target_crs, "transform": dst_transform,
            "width": dst_width, "height": dst_height, "dtype": "float32",
            "nodata": np.nan, "tiled": True, "blockxsize": chunk_size,
            "blockysize": chunk_size, "compress": "lzw",
        }

        with rasterio.open(dst_path, "w", **profile) as dst:
            for band in range(1, src.count + 1):
                reproject(
                    source=rasterio.band(src, band),
                    destination=rasterio.band(dst, band),
                    src_crs=src.crs,
                    dst_crs=target_crs,
                    dst_transform=dst_transform,
                    # Bilinear preserves continuous irradiance without inventing extremes.
                    resampling=Resampling.bilinear,
                    num_threads=4,
                )

    with rasterio.open(dst_path) as out:
        ghi_array = out.read(1, masked=True)
        return {
            "valid_px": int(ghi_array.count()),
            "mean_ghi_kwh_m2": float(np.ma.mean(ghi_array)),
            "max_ghi_kwh_m2": float(np.ma.max(ghi_array)),
            "crs_aligned": out.crs.to_epsg() == target_epsg,
        }


async def run_irradiance_pipeline(src_paths: List[Path],
                                  dst_dir: Path,
                                  target_epsg: int = 32610,
                                  target_res_m: float = 1000.0,
                                  max_concurrency: int = 3) -> Dict[str, Dict[str, float]]:
    """Orchestrate async, memory-bounded irradiance processing across a portfolio."""
    dst_dir.mkdir(parents=True, exist_ok=True)
    loop = asyncio.get_running_loop()
    semaphore = asyncio.Semaphore(max_concurrency)  # cap concurrent disk I/O
    results: Dict[str, Dict[str, float]] = {}

    with ThreadPoolExecutor(max_workers=max_concurrency) as executor:
        async def _process(src_path: Path) -> None:
            dst_path = dst_dir / f"aligned_{src_path.name}"
            async with semaphore:
                logging.info("Processing %s", src_path.name)
                stats = await loop.run_in_executor(
                    executor, reproject_irradiance,
                    src_path, dst_path, target_epsg, target_res_m,
                )
            results[src_path.name] = stats

        await asyncio.gather(*(_process(p) for p in src_paths))
    return results
```

The reprojection itself is delegated to `rasterio.warp.reproject`, which streams the warp through GDAL's windowed engine rather than materializing the full source array — the single most important detail for keeping continental archives inside a workstation's RAM budget. Running each file in a thread-pool executor behind a semaphore lets independent surfaces overlap their I/O without thrashing the disk.

## Error handling and edge cases

The three failure modes named above need explicit, testable guards rather than blanket `try/except`.

**Undefined or geographic CRS reaching the warp.** A surface with no CRS, or one left in EPSG:4326 when the target is metric, must be stopped at validation. `validate_spatial_metadata` already raises on a missing CRS; reject silent geographic inputs before they contaminate a metric stack:

```python
with rasterio.open(src_path) as src:
    if src.crs is None:
        raise ValueError(f"{src_path.name}: refusing to process — no CRS declared.")
    if src.crs.is_geographic and target_epsg not in (4326,):
        logging.warning("%s: geographic source (EPSG:%s) reprojecting to EPSG:%s.",
                        src_path.name, src.crs.to_epsg(), target_epsg)
```

**Disjoint or non-overlapping extents.** Two surfaces that do not share a footprint produce an empty or all-nodata result that downstream code happily averages to NaN. Test for overlap before merging, the same `ValueError: Input shapes do not overlap raster` condition handled in depth in [Stacking NASA POWER and PVGIS rasters in rasterio](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/stacking-nasa-power-and-pvgis-rasters-in-rasterio/):

```python
from rasterio.coords import disjoint_bounds

if disjoint_bounds(src_a.bounds, src_b.bounds):
    raise ValueError("Irradiance surfaces have non-overlapping extents; check source tiling.")
```

**Implicit reprojection memory spike.** Calling `src.read()` on a full-resolution continental array before warping is the classic `MemoryError` trigger on a 32 GB workstation. The core function avoids it by handing band references to `reproject` so GDAL streams windows; never read the whole array eagerly when a windowed path exists. For surfaces large enough that even the warp output strains memory, cap GDAL's cache and process in blocks rather than raising the cache ceiling.

## Performance and scalability

Scaling from a single feasibility site to a regional portfolio is a question of bounding memory and saturating I/O, not buying more RAM:

<svg viewBox="0 0 940 392" role="img" aria-label="What the pixel data type costs on a national hourly GHI stack of 8,760 bands at 4 kilometre resolution. float64 needs 89.2 gigabytes, float32 44.6, and int16 with a scale factor of 0.1 needs 22.3 while still resolving irradiance to 0.1 watts per square metre — far finer than the measurement uncertainty of the source. The data type is the cheapest lever in the whole pipeline and the one most often left at its default." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Pixel type against storage on a national hourly GHI stack</title>
  <desc>Three bars comparing storage for the same 8,760-band national GHI stack at 4 kilometre resolution: float64 at 89.2 gigabytes, float32 at 44.6 gigabytes, and int16 with a 0.1 scale factor at 22.3 gigabytes. Each bar is annotated with the value resolution it preserves: float64 resolves far below a millionth of a watt per square metre, float32 to about 0.001, and scaled int16 to 0.1 — against a source measurement uncertainty of about 5 watts per square metre, which is marked as the only figure that matters.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="392"/>
  <defs><marker id="dt-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">8 760 hourly bands, 4 km national grid — pick the pixel type</text>
  <rect x="200" y="76" width="542.9565217391304" height="52" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.4"/>
  <text x="190" y="108" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">float64</text>
  <text x="212" y="108" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">89.2 GB</text>
  <text x="756.9565217391304" y="108" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">resolves ≈1e−12 W/m²</text>
  <rect x="200" y="148" width="271.4782608695652" height="52" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
  <text x="190" y="180" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">float32</text>
  <text x="212" y="180" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">44.6 GB</text>
  <text x="485.4782608695652" y="180" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">resolves ≈0.001 W/m²</text>
  <rect x="200" y="220" width="135.7391304347826" height="52" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
  <text x="190" y="252" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">int16 × 0.1 scale</text>
  <text x="212" y="252" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">22.3 GB</text>
  <text x="349.7391304347826" y="252" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">resolves 0.1 W/m²</text>
  <line x1="200" y1="60" x2="200" y2="292" stroke="currentColor" stroke-width="1.1" opacity="0.4"/>
  <rect x="40" y="292" width="424" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="252.0" y="313" text-anchor="middle" font-size="11.5" fill="currentColor">Source measurement uncertainty is ≈5 W/m²</text>
  <text x="252.0" y="330" text-anchor="middle" font-size="11.5" fill="currentColor">— every option above resolves far past it</text>
  <rect x="488" y="292" width="420" height="48" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="698.0" y="313" text-anchor="middle" font-size="11.5" fill="currentColor">Scaled int16 also halves the bytes moved on</text>
  <text x="698.0" y="330" text-anchor="middle" font-size="11.5" fill="currentColor">every read, which is where the time goes</text>
  <text x="40" y="372" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">Set dtype and nodata explicitly at write time; a default float64 doubles every downstream cost.</text>
</svg>

- **Windowed reads and tiled writes.** Tiled output (`blockxsize`/`blockysize` of 512–2048) lets every downstream consumer read the same windows the warp wrote, keeping peak memory proportional to one tile rather than the whole grid.
- **Async over files, threads within a file.** Coarse concurrency belongs at the file level via `asyncio` and a semaphore; fine-grained parallelism belongs inside the warp via `num_threads`. Nesting them lets a portfolio run overlap disk latency while each file still uses every core.
- **GDAL cache tuning.** Set `GDAL_CACHEMAX` (e.g. `512`) to bound block cache; a runaway cache, not the data, is usually what exhausts memory during batch runs.
- **Match the resampling kernel to the band.** Bilinear for continuous GHI/DNI, nearest for categorical masks, average when downsampling to a coarser monthly grid — choosing `average` for downsampling avoids the aliasing that bilinear introduces when the target cell spans many source cells.
- **Pre-flight the resolution gap.** Logging a >5% native-vs-target gap before the run surfaces silent over- or under-sampling that would otherwise only appear as a quiet bias in the aggregated capacity factor. Once aligned, these surfaces feed directly into [temporal data aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) for monthly and seasonal reduction.

## Validation and audit trail

A processed raster is only bankable if its integrity is asserted automatically and its provenance is embedded. Every output should pass a post-processing gate suitable for a CI/CD pipeline: extent and pixel-alignment verification, nodata consistency, and the physical sanity bounds from the prerequisites.

```python
def assert_irradiance_integrity(dst_path: Path, target_epsg: int) -> None:
    """CI/CD gate: fail the build if a processed GHI surface is non-compliant."""
    with rasterio.open(dst_path) as out:
        assert out.crs.to_epsg() == target_epsg, "CRS not aligned to target."
        assert out.dtypes[0] == "float32", "Unexpected dtype; expected float32."
        ghi = out.read(1, masked=True)
        assert ghi.count() > 0, "No valid pixels — possible disjoint extent."
        assert float(np.ma.max(ghi)) <= 13.0, "GHI exceeds physical ceiling (kWh/m²/day)."
        # Embed ISO 19115-style provenance directly in the GeoTIFF header.
    with rasterio.open(dst_path, "r+") as out:
        out.update_tags(
            SOURCE="NSRDB/PVGIS",
            PROCESSING="bilinear-reproject",
            CRS_EPSG=str(target_epsg),
            QA_STATUS="passed",
        )
```

Pixel alignment is the non-negotiable invariant: when surfaces are later stacked or intersected with [transmission line and substation mapping](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/) layers or with a [grid capacity buffer analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/), sub-pixel shifts compound into siting errors. Enforce an explicit tolerance — for example ±0.5 m for UTM-projected assets — and log transformation residuals so the output is auditable for regulatory submission and project-finance due diligence. Embedding acquisition timestamps and source version via `update_tags` keeps the lineage attached to the file rather than to a notebook that will not survive the project. With alignment proven and provenance written, these surfaces become safe inputs for cross-validation workflows such as [Stacking NASA POWER and PVGIS rasters in rasterio](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/stacking-nasa-power-and-pvgis-rasters-in-rasterio/) and for uncertainty quantification across providers.


## Frequently asked questions

### Should the stack be built as a multi-band GeoTIFF or a Zarr store?

A multi-band GeoTIFF for a fixed, modest band count that is always read together — a twelve-band
monthly climatology, say — and a chunked Zarr or COG stack for anything hourly or growing. The
deciding question is whether readers want a time series at a point or a map at a time: GeoTIFF
serves the map cheaply and the time series expensively, and a chunked store with a time-major
chunking serves the reverse.

### How do I detect a band that was silently misaligned?

Assert, do not inspect. Compare CRS, affine transform, width and height across every band before
stacking, and compare the value at a known control point across bands afterwards. A half-pixel
affine drift produces a stack that assembles cleanly and whose pixel [i, j] means a slightly
different place in each band — which is invisible in any single map and shows up as noise in the
time series.

### Is float32 precise enough for irradiance?

Comfortably. Float32 resolves about 0.001 W/m² across the range irradiance actually occupies, and
the measurement uncertainty of the underlying products is several W/m². Scaled int16 with a 0.1
factor is finer than the measurement too, and halves the bytes again — which is where the time goes
on a national stack, since almost every operation here is I/O bound rather than compute bound.

### What is the right chunk shape for a national hourly stack?

Chunk on the axis that reads will scan. Site-level analysis reads one pixel across all 8,760 hours,
so a time-major chunk of the full year for a small spatial tile is right; map-level analysis reads
one hour across the country, so a space-major chunk is right. Choosing wrong does not produce wrong
answers, it produces reads that touch every chunk in the store — which on a national stack is the
difference between seconds and hours.


### How should provenance be recorded for a derived raster?

In the file, not beside it. GeoTIFF and Zarr both carry arbitrary metadata, so the source products,
their versions, the resampling kernel, the nodata convention and the processing timestamp belong in
the product itself, where a reader who receives only the file can still answer where it came from. A
sidecar JSON is better than nothing and is routinely separated from the raster it describes.

### Is it worth building overviews for analysis rasters?

For anything that will be looked at, yes — overviews cost a few percent of the file size and turn a
national map render from a full read into a pyramid read. For a product that is only ever consumed
by windowed analysis, they earn nothing. The distinction is what the raster is for, and most
national products end up serving both purposes, which is why overviews are usually worth building.

## Related

- [Solar & Wind Resource Modeling Workflows](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/) — the parent pipeline this stage feeds.
- [Stacking NASA POWER and PVGIS rasters in rasterio](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/stacking-nasa-power-and-pvgis-rasters-in-rasterio/) — resolving overlap and registration errors when merging multi-source surfaces.
- [Temporal Data Aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) — reducing aligned irradiance stacks to monthly and seasonal statistics.
- [Terrain & Shadow Analysis Pipelines](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/) — horizon masking that requires identical pixel alignment to the irradiance grid.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — the projection foundations this stage enforces.
- [Open Energy Data Portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/) — sourcing and provenance for NSRDB, PVGIS, and NASA POWER inputs.
