---
title: Validating NREL Solar Datasets with Python
description: Debug and fix the silent failures in NREL NSRDB, PVWatts, and TMY3 ingestion — RuntimeError on empty intersections, MemoryError on full-extent reads, and corrupted P50/P90 yields from unhandled quality flags — with a runnable Python validation pipeline.
slug: validating-nrel-solar-datasets-with-python
type: article
breadcrumb: Validating NREL Solar Datasets
datePublished: 2025-09-12
dateModified: 2026-06-26
---

# Validating NREL Solar Datasets with Python

The failure usually surfaces as one of two exceptions at the ingestion boundary: `RuntimeError: Spatial intersection yielded no valid irradiance values` when a project polygon silently drifts out of the raster extent, or a `MemoryError` (or container OOM kill) when a multi-year NSRDB array is materialized in full. A quieter third failure produces no exception at all — stripped quality flags let night-time GHI spikes and negative irradiance leak into the aggregate, corrupting P50/P90 yields by several percent. All three break the same pipeline stage: validation of NREL solar irradiance data (NSRDB, PVWatts, and TMY3) before it reaches a yield model or an interconnection filing. This page is part of the [open energy data portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/) ingestion reference and isolates each fault, surfaces it pre-flight, and delivers a validated fix plus a compliance-safe fallback path.

## Root-Cause Analysis: Why NSRDB Validation Pipelines Fail

When sourcing multi-year irradiance grids from public repositories, three compounding causes dominate automated validation failures. They rarely raise an exception at the point of error — each produces a plausible-looking output that only diverges from truth downstream, during a permit reviewer's recomputation.

1. **Implicit CRS Assumptions:** NREL datasets default to WGS84 ([EPSG:4326](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/)). Downstream GIS layers often use projected systems (e.g. EPSG:32612 or a state-plane zone). Without explicit [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/how-to-align-epsg4326-and-epsg3857-for-solar-site-mapping/), silent coordinate drift causes bounding-box clipping to return empty geometries or misaligned raster windows, corrupting spatial joins before they execute.
2. **Memory Overflow on Full-Extent Reads:** Loading 4 km-resolution, 20+ year NSRDB arrays into `pandas` or `rasterio` without windowing triggers OOM kills during spatial joins or temporal aggregation. Unmanaged array expansion is the leading cause of pipeline crashes in containerized environments.
3. **Temporal & Quality-Flag Misalignment:** NSRDB quality flags (Clearness Index, Solar Zenith Angle, and `ghi_flag`/`dni_flag`) are frequently stripped during CSV/GeoTIFF conversion. Unfiltered negative irradiance values or night-time GHI spikes corrupt yield calculations and violate IEC 61724-1 monitoring standards. A physically valid clearness index must satisfy $0 \le K_t = \frac{\text{GHI}}{\text{GHI}_{\text{toa}}} \le 1$; any pixel outside that band is a flag failure, not a data point.

Understanding the underlying [core energy-GIS data and spatial fundamentals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/) prevents these silent failures by enforcing explicit coordinate validation, lazy evaluation, and flag-aware filtering before any spatial operation runs.

<svg viewBox="0 0 900 372" role="img" aria-label="Cause-to-fix map for NREL solar validation. Three failure causes on the left, each arrowed to the validation stage that neutralizes it on the right. Implicit EPSG:4326 CRS drift, where a boundary in a projected CRS clips to empty geometry, is fixed by an explicit pyproj CRS assertion that raises when src.crs does not equal the target. A full-extent read MemoryError, where a 20-year 4 km array OOM-kills the worker, is fixed by a windowed read built from bounds with boundless reads and NaN fill. Stripped ghi_flag and out-of-band clearness index, where night-time spikes and negative GHI leak into the mean, is fixed by a flag-aware mask keeping only positive, finite GHI inside a valid clearness band." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="900" height="372"/>
  <title>Mapping each NSRDB validation failure to the stage that fixes it</title>
  <desc>Three warning-coloured cause nodes on the left, each connected by an arrow to a success-coloured fix node on the right. CRS drift maps to an explicit pyproj CRS assertion; full-extent MemoryError maps to a windowed read; stripped quality flags map to a flag-aware mask.</desc>
  <g text-anchor="middle">
    <rect x="30" y="14" width="360" height="30" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="210" y="34" font-size="13" font-weight="700" letter-spacing="1.1" fill="currentColor">FAILURE CAUSE</text>
    <rect x="510" y="14" width="360" height="30" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <text x="690" y="34" font-size="13" font-weight="700" letter-spacing="1.1" fill="currentColor">VALIDATION FIX</text>
  </g>
  <g text-anchor="middle" font-size="12.5" fill="currentColor">
    <!-- ROW 1 -->
    <rect x="30" y="70" width="360" height="74" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.4"/>
    <text x="210" y="98" font-weight="700">Implicit EPSG:4326 CRS drift</text>
    <text x="210" y="118" font-size="11" opacity="0.85">boundary in a projected CRS clips</text>
    <text x="210" y="133" font-size="11" opacity="0.85">to empty geometry before the read</text>
    <rect x="510" y="70" width="360" height="74" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
    <text x="690" y="98" font-weight="700">Explicit pyproj CRS assertion</text>
    <text x="690" y="118" font-size="11" opacity="0.85">src.crs == target_crs, else raise</text>
    <text x="690" y="133" font-size="11" opacity="0.85">no silent auto-projection</text>
    <!-- ROW 2 -->
    <rect x="30" y="162" width="360" height="74" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.4"/>
    <text x="210" y="190" font-weight="700">Full-extent read MemoryError</text>
    <text x="210" y="210" font-size="11" opacity="0.85">20-year 4 km array materialized</text>
    <text x="210" y="225" font-size="11" opacity="0.85">in full &#8594; OOM kill / container OOM</text>
    <rect x="510" y="162" width="360" height="74" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
    <text x="690" y="190" font-weight="700">Windowed read</text>
    <text x="690" y="210" font-size="11" opacity="0.85">from_bounds + boundless, NaN fill,</text>
    <text x="690" y="225" font-size="11" opacity="0.85">clamped to the raster&#8217;s own window</text>
    <!-- ROW 3 -->
    <rect x="30" y="254" width="360" height="74" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.4"/>
    <text x="210" y="282" font-weight="700">Stripped ghi_flag / out-of-band K&#8348;</text>
    <text x="210" y="302" font-size="11" opacity="0.85">night-time GHI spikes and negative</text>
    <text x="210" y="317" font-size="11" opacity="0.85">irradiance leak into the mean</text>
    <rect x="510" y="254" width="360" height="74" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
    <text x="690" y="282" font-weight="700">Flag-aware mask</text>
    <text x="690" y="302" font-size="11" opacity="0.85">keep GHI &gt; 0 &amp; np.isfinite,</text>
    <text x="690" y="317" font-size="11" opacity="0.85">enforce 0 &#8804; K&#8348; &#8804; 1</text>
  </g>
  <!-- mapping arrows -->
  <g stroke="currentColor" stroke-width="1.6" fill="currentColor" opacity="0.75">
    <line x1="390" y1="107" x2="504" y2="107"/><path d="M502 101 L510 107 L502 113 Z" stroke="none"/>
    <line x1="390" y1="199" x2="504" y2="199"/><path d="M502 193 L510 199 L502 205 Z" stroke="none"/>
    <line x1="390" y1="291" x2="504" y2="291"/><path d="M502 285 L510 291 L502 297 Z" stroke="none"/>
  </g>
</svg>

## Pre-Flight Validation: Surface the Fault Before You Read the Raster

The cheapest fix is to fail at the boundary. The function below runs before any pixel is read: it asserts both CRS are explicit and equal, confirms the project polygon actually overlaps the raster extent, and estimates the read footprint so an over-large request is rejected instead of OOM-killing the worker.

<svg viewBox="0 0 940 380" role="img" aria-label="What happens to an annual GHI statistic when the NSRDB quality flags are honoured. Of 8,760 hourly records, 4,015 are night-time zeros, 212 carry a fill flag and 47 have a solar zenith angle above 90 degrees with non-zero irradiance. Averaging every row gives 2.44 kilowatt-hours per square metre per day; averaging only the daylight rows that pass the flags gives 5.31 — the same file, a 2.2 times difference, and no error either way." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>The same NSRDB year, averaged with and without its quality flags</title>
  <desc>A stacked bar showing how 8,760 hourly records divide: 4,486 valid daylight records, 4,015 night-time zeros, 212 fill-flagged records and 47 records with a solar zenith angle above 90 degrees yet non-zero irradiance. Beside it, two result bars: averaging all rows gives 2.44 kilowatt-hours per square metre per day, while averaging only the records that pass the flag mask gives 5.31. A note points out that both numbers are computed without error, so only the flag mask distinguishes them.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="380"/>
  <defs><marker id="nq-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Flags are not metadata — they decide which rows are allowed into the mean</text>
  <text x="40" y="68" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">8 760 hourly records in one NSRDB year</text>
  <rect x="40" y="78" width="440.4063926940639" height="46" rx="4" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="260.20319634703196" y="106" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">4 486</text>
  <rect x="480.4063926940639" y="78" width="394.1666666666667" height="46" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="677.4897260273973" y="106" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">4 015</text>
  <rect x="874.5730593607307" y="78" width="20.812785388127853" height="46" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <rect x="895.3858447488585" y="78" width="4.614155251141552" height="46" rx="4" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <rect x="40" y="138" width="14" height="14" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <text x="60" y="150" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">valid daylight (4486)</text>
  <rect x="276" y="138" width="14" height="14" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1"/>
  <text x="296" y="150" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">night-time zeros (4015)</text>
  <rect x="512" y="138" width="14" height="14" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <text x="532" y="150" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">fill-flagged (212)</text>
  <rect x="748" y="138" width="14" height="14" rx="3" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.1"/>
  <text x="768" y="150" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">SZA &gt; 90° yet non-zero (47)</text>
  <text x="40" y="196" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">Annual mean GHI, kWh/m²/day</text>
  <rect x="300" y="210" width="187.1" height="36.1" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="290" y="232.04" text-anchor="end" font-size="11.5" fill="currentColor">mean of every row</text>
  <text x="495.06666666666666" y="232.04" text-anchor="start" font-size="11.5" fill="currentColor">2.44</text>
  <rect x="300" y="255.92000000000002" width="407.1" height="36.1" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="290" y="277.96000000000004" text-anchor="end" font-size="11.5" fill="currentColor">mean of flag-passing rows</text>
  <text x="715.0999999999999" y="277.96000000000004" text-anchor="start" font-size="11.5" fill="currentColor">5.31</text>
  <rect x="40" y="318" width="428" height="28" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="254.0" y="338" text-anchor="middle" font-size="11.5" fill="currentColor">2.44 is a real average of a column that is 46% zeros</text>
  <rect x="492" y="318" width="428" height="28" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="706.0" y="338" text-anchor="middle" font-size="11.5" fill="currentColor">5.31 is the resource the array will actually see</text>
</svg>

```python
import geopandas as gpd
import rasterio
import pyproj
from shapely.geometry import box

def preflight_nrel(tif_path: str, boundary_path: str,
                   target_epsg: int = 4326,
                   max_pixels: int = 50_000_000) -> None:
    """Surface CRS drift, extent miss, and memory blowup before the main read."""
    target_crs = pyproj.CRS.from_epsg(target_epsg)

    boundary_gdf = gpd.read_file(boundary_path)
    if boundary_gdf.crs is None:
        raise ValueError("Boundary CRS is undefined. Assign explicitly before ingestion.")

    with rasterio.open(tif_path) as src:
        if src.crs is None:
            raise ValueError(f"Raster {tif_path} has no CRS tag; cannot validate alignment.")

        # 1. Reproject the boundary into the raster frame for an honest extent test
        boundary_aligned = boundary_gdf.to_crs(src.crs)
        raster_extent = box(*src.bounds)
        if not boundary_aligned.union_all().intersects(raster_extent):
            raise RuntimeError(
                "Project polygon lies outside the NSRDB raster extent — "
                "the intersection would yield zero valid pixels."
            )

        # 2. Estimate the read footprint in the target frame
        minx, miny, maxx, maxy = boundary_gdf.to_crs(target_crs).total_bounds
        px_w = abs((maxx - minx) / src.res[0])
        px_h = abs((maxy - miny) / src.res[1])
        if px_w * px_h > max_pixels:
            raise MemoryError(
                f"Requested window ~{int(px_w * px_h):,} px exceeds {max_pixels:,}; "
                "switch to a windowed or dask-backed read."
            )
```

Calling `preflight_nrel()` converts the two runtime exceptions into deterministic, early failures with actionable messages — exactly the contract a CI/CD ingestion gate needs. The same overlap-then-read discipline underpins [cleaning messy shapefiles in geopandas](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/best-practices-for-cleaning-messy-shapefiles-in-geopandas/).

## Fix Implementation: A Production-Grade Validation Pipeline

The corrected pipeline replaces the common failure patterns with explicit spatial alignment, memory-safe windowing, and compliance-aware filtering. The parameter choices are deliberate: `boundless=True` with `fill_value=np.nan` keeps the window read inside raster bounds while marking out-of-coverage cells as nodata rather than zero (a zero would be read as a valid 0 W/m² reading and bias the mean downward), and `float` casts guard the JSON-serializable return contract used by downstream audit logs.

```python
import geopandas as gpd
import rasterio
import numpy as np
import pyproj
from rasterio.windows import from_bounds
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

def validate_nrel_ghi(tif_path: str, boundary_path: str,
                      target_epsg: int = 4326) -> dict:
    """
    Validate an NREL GHI raster against a project boundary with explicit CRS
    alignment, memory-safe windowing, and quality-aware filtering.
    """
    target_crs = pyproj.CRS.from_epsg(target_epsg)

    # 1. Load and explicitly align the boundary CRS
    boundary_gdf = gpd.read_file(boundary_path)
    if boundary_gdf.crs is None:
        raise ValueError("Boundary CRS is undefined. Assign explicitly before ingestion.")
    if boundary_gdf.crs != target_crs:
        boundary_gdf = boundary_gdf.to_crs(target_crs)
        logging.info("Reprojected boundary to EPSG:%d", target_epsg)

    # 2. Open raster & assert spatial alignment (never auto-project silently)
    with rasterio.open(tif_path) as src:
        if src.crs != target_crs:
            raise ValueError(f"Raster CRS {src.crs} does not match target EPSG:{target_epsg}.")

        # 3. Memory-safe windowed read, clamped to the raster's own window
        bounds = boundary_gdf.total_bounds
        window = from_bounds(*bounds, src.transform)
        window = window.intersection(src.window(*src.bounds))

        ghi_array = src.read(1, window=window, boundless=True, fill_value=np.nan)
        out_transform = src.window_transform(window)

        # 4. Flag-aware masking: drop night-time, negative, and nodata cells
        ghi_flat = ghi_array.flatten()
        valid_mask = (ghi_flat > 0) & np.isfinite(ghi_flat)
        ghi_clean = ghi_flat[valid_mask]

        if ghi_clean.size == 0:
            raise RuntimeError("Spatial intersection yielded no valid irradiance values.")

        return {
            "mean_ghi": float(np.mean(ghi_clean)),
            "valid_count": int(valid_mask.sum()),
            "coverage_ratio": float(valid_mask.mean()),
            "crs": str(src.crs),
            "window_shape": ghi_array.shape,
            "transform": out_transform.to_gdal(),
        }
```

### Key Validation Checkpoints

- **CRS Enforcement:** The pipeline raises a hard exception on undefined or mismatched coordinate systems. Never rely on implicit `geopandas` or `rasterio` auto-projection — see the [EPSG:4326 / EPSG:3857 alignment walkthrough](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/how-to-align-epsg4326-and-epsg3857-for-solar-site-mapping/) for the failure signature this guards against.
- **Window Intersection:** `window.intersection()` guarantees the read stays within raster bounds, preventing `boundless=True` from introducing artificial edge artifacts.
- **Flag-Aware Masking:** The `valid_mask` removes negative values and `NaN` placeholders. In production, extend this to parse embedded `ghi_flag` arrays or companion CSV metadata so a flagged pixel never enters the mean.

## Compliance-Safe Fallback Routing

Production pipelines must degrade gracefully when primary datasets are incomplete, spatially misaligned, or fail quality thresholds. Implement a tiered fallback strategy and record which tier produced each value:

- **Primary:** NSRDB GeoTIFF/Parquet, validated via the pipeline above.
- **Secondary:** PVWatts API point-query fallback. When raster coverage is sparse, query the nearest valid grid cell using `scipy.spatial.KDTree` over project centroids — the same nearest-feature pattern used in [proximity buffer analysis around substations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/calculating-5km-proximity-buffers-around-substations-in-shapely/).
- **Tertiary:** TMY3 synthetic generation. For preliminary siting, interpolate from historical TMY3 stations within a 50 km radius, applying elevation and albedo corrections.

Document every fallback activation in the project metadata. Regulatory bodies and interconnection authorities require transparent provenance when primary portal data is substituted; never mask fallback usage — append a `data_source_tier` field to the output schema instead.

<svg viewBox="0 0 800 478" role="img" aria-label="Tiered fallback routing for GHI data. Starting from the need for GHI at a site, the pipeline tests whether the NSRDB GeoTIFF is valid; if yes it uses the NSRDB raster as the primary source. If not, it tests whether a PVWatts API nearest cell is available; if yes it uses the PVWatts point as the secondary source. If neither, it falls back to TMY3 stations within 50 km with elevation and albedo correction as the tertiary source. All three outputs converge on a final step that tags the data_source_tier field so a reviewer can reconstruct which tier produced each value." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="800" height="478"/>
  <title>Compliance-safe tiered fallback: NSRDB to PVWatts to TMY3</title>
  <desc>A decision cascade. NSRDB GeoTIFF valid leads to the primary NSRDB raster (success). Otherwise PVWatts nearest cell leads to a PVWatts point (warning, secondary). Otherwise TMY3 within 50 km with elevation and albedo correction (warning, tertiary). All three feed a final tag-data_source_tier step.</desc>
  <g text-anchor="middle" font-size="12.5" fill="currentColor">
    <!-- LEFT COLUMN: start + decisions (pipeline palette) -->
    <rect x="60" y="24" width="280" height="46" rx="10" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
    <text x="200" y="52" font-weight="700">Need GHI for site</text>
    <rect x="60" y="104" width="280" height="58" rx="10" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
    <text x="200" y="129" font-weight="700">NSRDB GeoTIFF valid?</text>
    <text x="200" y="148" font-size="10.5" opacity="0.85">primary &#183; passes the validation read</text>
    <rect x="60" y="210" width="280" height="58" rx="10" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
    <text x="200" y="235" font-weight="700">PVWatts API nearest cell?</text>
    <text x="200" y="254" font-size="10.5" opacity="0.85">secondary &#183; KDTree over centroids</text>
    <!-- RIGHT COLUMN: outputs -->
    <rect x="470" y="110" width="250" height="46" rx="10" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <text x="595" y="130" font-weight="700">Use NSRDB raster</text>
    <text x="595" y="147" font-size="10.5" opacity="0.85">tier 1 &#183; validated GeoTIFF</text>
    <rect x="470" y="216" width="250" height="46" rx="10" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="595" y="236" font-weight="700">Use PVWatts point</text>
    <text x="595" y="253" font-size="10.5" opacity="0.85">tier 2 &#183; nearest valid grid cell</text>
    <rect x="470" y="313" width="250" height="60" rx="10" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="595" y="336" font-weight="700">TMY3 within 50 km</text>
    <text x="595" y="356" font-size="10.5" opacity="0.85">tier 3 &#183; + elev / albedo correction</text>
    <!-- CONVERGENCE: tag tier -->
    <rect x="470" y="408" width="250" height="46" rx="10" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="595" y="428" font-weight="700">Tag data_source_tier</text>
    <text x="595" y="445" font-size="10.5" opacity="0.85">provenance on every output row</text>
  </g>
  <!-- flow arrows -->
  <g stroke="currentColor" stroke-width="1.6" fill="none" opacity="0.78">
    <path d="M200 70 L200 104"/>
    <path d="M340 133 L470 133"/>
    <path d="M200 162 L200 210"/>
    <path d="M340 239 L470 239"/>
    <path d="M200 268 L200 343 L470 343"/>
    <path d="M720 133 L750 133 L750 431 L724 431"/>
    <path d="M720 239 L750 239"/>
    <path d="M720 343 L750 343"/>
  </g>
  <g fill="currentColor" stroke="none" opacity="0.78">
    <path d="M194 102 L200 110 L206 102 Z"/>
    <path d="M468 127 L476 133 L468 139 Z"/>
    <path d="M194 208 L200 216 L206 208 Z"/>
    <path d="M468 233 L476 239 L468 245 Z"/>
    <path d="M468 337 L476 343 L468 349 Z"/>
    <path d="M726 425 L718 431 L726 437 Z"/>
  </g>
  <!-- edge labels -->
  <g text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">
    <rect x="386" y="119" width="34" height="18" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1"/>
    <text x="403" y="132">yes</text>
    <rect x="174" y="177" width="32" height="18" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1"/>
    <text x="190" y="190">no</text>
    <rect x="386" y="225" width="34" height="18" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1"/>
    <text x="403" y="238">yes</text>
    <rect x="174" y="297" width="32" height="18" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1"/>
    <text x="190" y="310">no</text>
  </g>
</svg>

### Spatial Debugging & Memory-Tuning Protocols

When validation returns unexpected zeros, empty arrays, or memory spikes, work through these strategies before touching the data:

- **Verify bounding-box overlap first:** test `shapely.geometry.box(*bounds).intersects(raster_extent)` before reading. A `False` here means the project polygon lies outside the dataset extent — the cause of most `no valid irradiance values` runtimes.
- **Pin pixel alignment:** misaligned transforms usually stem from floating-point precision drift. Round coordinates to 6 decimal places before constructing `from_bounds()` windows.
- **Chunk temporal aggregation:** for multi-year NSRDB stacks, avoid full-array loads. Use `dask.array` with `rasterio`'s `block_shapes` to compute monthly or seasonal aggregates lazily — the same windowed discipline applied to [stacking NASA POWER and PVGIS rasters](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/stacking-nasa-power-and-pvgis-rasters-in-rasterio/) and [resampling hourly solar data to monthly averages](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/resampling-hourly-solar-data-to-monthly-averages/).
- **Cap the GDAL cache:** export `GDAL_CACHEMAX` (e.g. `512`) in CI workers so block reads do not balloon resident memory under parallel windows.
- **Validate downstream units:** ensure yield models (`pvlib`, `SAM`) receive data in W/m² with consistent time zones. Mismatched UTC offsets between raster timestamps and local solar time introduce systematic bias in capacity-factor calculations. Reference the [Rasterio windowed-read documentation](https://rasterio.readthedocs.io/en/stable/topics/windowed-rw.html) for block-aligned chunking.

## Downstream Validation: A CI/CD Integrity Gate

Before a validated result is allowed into a yield model, assert its integrity. This compact gate is cheap enough to run on every ingestion and specific enough to fail a bad raster loudly — checking dtype, CRS, nodata bleed, and minimum spatial coverage.

<svg viewBox="0 0 940 360" role="img" aria-label="What a timezone error does to an hourly solar profile. NSRDB delivers UTC timestamps; a site in Pacific Standard Time is eight hours behind, so a profile plotted on raw UTC places its peak at 20:00 and reports generation during local darkness. Shifting the index to local standard time — never to a daylight-saving-aware zone, which would duplicate one hour in autumn and drop one in spring — puts the peak back at 12:00 where the sun is." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>A UTC index moves solar noon eight hours, and nothing complains</title>
  <desc>Two daily irradiance curves drawn over a 24-hour axis. The first, indexed on raw UTC, peaks at 20:00 and shows non-zero values through local night. The second, shifted to local standard time, peaks at 12:00 and is zero overnight. An annotation marks the eight hour offset between the two peaks and warns that a daylight-saving-aware timezone would duplicate an hour each autumn and drop one each spring, corrupting the annual total rather than merely shifting it.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="360"/>
  <defs><marker id="tz-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The timestamps are correct — the frame they are read in is not</text>
  <line x1="90" y1="240" x2="880" y2="240" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="90" y1="68" x2="90" y2="240" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="90.0" y1="240" x2="90.0" y2="245" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="90.0" y="260" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">00:00</text>
  <line x1="221.66666666666666" y1="240" x2="221.66666666666666" y2="245" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="221.66666666666666" y="260" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">04:00</text>
  <line x1="353.3333333333333" y1="240" x2="353.3333333333333" y2="245" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="353.3333333333333" y="260" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">08:00</text>
  <line x1="485.0" y1="240" x2="485.0" y2="245" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="485.0" y="260" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">12:00</text>
  <line x1="616.6666666666666" y1="240" x2="616.6666666666666" y2="245" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="616.6666666666666" y="260" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">16:00</text>
  <line x1="748.3333333333334" y1="240" x2="748.3333333333334" y2="245" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="748.3333333333334" y="260" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">20:00</text>
  <line x1="880.0" y1="240" x2="880.0" y2="245" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="880.0" y="260" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">24:00</text>
  <text x="78" y="80" text-anchor="end" font-size="11" fill="currentColor" opacity="0.8">GHI</text>
  <path d="M90.0,240.0 L93.3,240.0 L96.6,240.0 L99.9,240.0 L103.2,240.0 L106.5,240.0 L109.8,240.0 L113.0,240.0 L116.3,240.0 L119.6,240.0 L122.9,240.0 L126.2,240.0 L129.5,240.0 L132.8,240.0 L136.1,240.0 L139.4,240.0 L142.7,240.0 L146.0,240.0 L149.2,240.0 L152.5,240.0 L155.8,240.0 L159.1,240.0 L162.4,240.0 L165.7,240.0 L169.0,240.0 L172.3,240.0 L175.6,240.0 L178.9,240.0 L182.2,240.0 L185.5,240.0 L188.8,240.0 L192.0,240.0 L195.3,240.0 L198.6,240.0 L201.9,240.0 L205.2,240.0 L208.5,240.0 L211.8,240.0 L215.1,240.0 L218.4,240.0 L221.7,240.0 L225.0,240.0 L228.2,240.0 L231.5,240.0 L234.8,240.0 L238.1,240.0 L241.4,240.0 L244.7,240.0 L248.0,240.0 L251.3,240.0 L254.6,240.0 L257.9,240.0 L261.2,240.0 L264.5,240.0 L267.8,240.0 L271.0,240.0 L274.3,240.0 L277.6,240.0 L280.9,240.0 L284.2,240.0 L287.5,240.0 L290.8,240.0 L294.1,240.0 L297.4,240.0 L300.7,240.0 L304.0,240.0 L307.2,240.0 L310.5,240.0 L313.8,240.0 L317.1,240.0 L320.4,240.0 L323.7,240.0 L327.0,240.0 L330.3,240.0 L333.6,240.0 L336.9,240.0 L340.2,240.0 L343.5,240.0 L346.8,240.0 L350.0,240.0 L353.3,240.0 L356.6,240.0 L359.9,240.0 L363.2,240.0 L366.5,240.0 L369.8,240.0 L373.1,240.0 L376.4,240.0 L379.7,240.0 L383.0,240.0 L386.2,240.0 L389.5,240.0 L392.8,240.0 L396.1,240.0 L399.4,240.0 L402.7,240.0 L406.0,240.0 L409.3,240.0 L412.6,240.0 L415.9,240.0 L419.2,240.0 L422.5,240.0 L425.8,240.0 L429.0,240.0 L432.3,240.0 L435.6,240.0 L438.9,240.0 L442.2,240.0 L445.5,240.0 L448.8,240.0 L452.1,240.0 L455.4,240.0 L458.7,240.0 L462.0,240.0 L465.2,240.0 L468.5,240.0 L471.8,240.0 L475.1,240.0 L478.4,240.0 L481.7,240.0 L485.0,240.0 L488.3,240.0 L491.6,240.0 L494.9,240.0 L498.2,240.0 L501.5,240.0 L504.8,240.0 L508.0,240.0 L511.3,240.0 L514.6,240.0 L517.9,240.0 L521.2,240.0 L524.5,240.0 L527.8,240.0 L531.1,240.0 L534.4,240.0 L537.7,240.0 L541.0,240.0 L544.2,240.0 L547.5,240.0 L550.8,240.0 L554.1,240.0 L557.4,240.0 L560.7,240.0 L564.0,240.0 L567.3,240.0 L570.6,240.0 L573.9,240.0 L577.2,240.0 L580.5,240.0 L583.8,240.0 L587.0,240.0 L590.3,240.0 L593.6,240.0 L596.9,240.0 L600.2,240.0 L603.5,240.0 L606.8,240.0 L610.1,240.0 L613.4,232.2 L616.7,224.6 L620.0,217.1 L623.2,209.9 L626.5,202.8 L629.8,196.0 L633.1,189.3 L636.4,182.8 L639.7,176.5 L643.0,170.4 L646.3,164.4 L649.6,158.7 L652.9,153.1 L656.2,147.8 L659.5,142.6 L662.8,137.6 L666.0,132.8 L669.3,128.2 L672.6,123.8 L675.9,119.5 L679.2,115.5 L682.5,111.6 L685.8,108.0 L689.1,104.5 L692.4,101.2 L695.7,98.1 L699.0,95.2 L702.2,92.4 L705.5,89.9 L708.8,87.6 L712.1,85.4 L715.4,83.4 L718.7,81.6 L722.0,80.0 L725.3,78.6 L728.6,77.4 L731.9,76.4 L735.2,75.5 L738.5,74.8 L741.8,74.4 L745.0,74.1 L748.3,74.0 L751.6,74.1 L754.9,74.4 L758.2,74.8 L761.5,75.5 L764.8,76.4 L768.1,77.4 L771.4,78.6 L774.7,80.0 L778.0,81.6 L781.2,83.4 L784.5,85.4 L787.8,87.6 L791.1,89.9 L794.4,92.4 L797.7,95.2 L801.0,98.1 L804.3,101.2 L807.6,104.5 L810.9,108.0 L814.2,111.6 L817.5,115.5 L820.8,119.5 L824.0,123.8 L827.3,128.2 L830.6,132.8 L833.9,137.6 L837.2,142.6 L840.5,147.8 L843.8,153.1 L847.1,158.7 L850.4,164.4 L853.7,170.4 L857.0,176.5 L860.2,182.8 L863.5,189.3 L866.8,196.0 L870.1,202.8 L873.4,209.9 L876.7,217.1 L880.0,224.6" fill="none" stroke="#F4A261" stroke-width="2.4"/>
  <path d="M90.0,240.0 L93.3,240.0 L96.6,240.0 L99.9,240.0 L103.2,240.0 L106.5,240.0 L109.8,240.0 L113.0,240.0 L116.3,240.0 L119.6,240.0 L122.9,240.0 L126.2,240.0 L129.5,240.0 L132.8,240.0 L136.1,240.0 L139.4,240.0 L142.7,240.0 L146.0,240.0 L149.2,240.0 L152.5,240.0 L155.8,240.0 L159.1,240.0 L162.4,240.0 L165.7,240.0 L169.0,240.0 L172.3,240.0 L175.6,240.0 L178.9,240.0 L182.2,240.0 L185.5,240.0 L188.8,240.0 L192.0,240.0 L195.3,240.0 L198.6,240.0 L201.9,240.0 L205.2,240.0 L208.5,240.0 L211.8,240.0 L215.1,240.0 L218.4,240.0 L221.7,240.0 L225.0,240.0 L228.2,240.0 L231.5,240.0 L234.8,240.0 L238.1,240.0 L241.4,240.0 L244.7,240.0 L248.0,240.0 L251.3,240.0 L254.6,240.0 L257.9,240.0 L261.2,240.0 L264.5,240.0 L267.8,240.0 L271.0,240.0 L274.3,240.0 L277.6,240.0 L280.9,240.0 L284.2,240.0 L287.5,240.0 L290.8,240.0 L294.1,240.0 L297.4,240.0 L300.7,240.0 L304.0,240.0 L307.2,240.0 L310.5,240.0 L313.8,240.0 L317.1,240.0 L320.4,240.0 L323.7,240.0 L327.0,240.0 L330.3,240.0 L333.6,240.0 L336.9,240.0 L340.2,240.0 L343.5,240.0 L346.8,240.0 L350.0,232.2 L353.3,224.6 L356.6,217.1 L359.9,209.9 L363.2,202.8 L366.5,196.0 L369.8,189.3 L373.1,182.8 L376.4,176.5 L379.7,170.4 L383.0,164.4 L386.2,158.7 L389.5,153.1 L392.8,147.8 L396.1,142.6 L399.4,137.6 L402.7,132.8 L406.0,128.2 L409.3,123.8 L412.6,119.5 L415.9,115.5 L419.2,111.6 L422.5,108.0 L425.8,104.5 L429.0,101.2 L432.3,98.1 L435.6,95.2 L438.9,92.4 L442.2,89.9 L445.5,87.6 L448.8,85.4 L452.1,83.4 L455.4,81.6 L458.7,80.0 L462.0,78.6 L465.2,77.4 L468.5,76.4 L471.8,75.5 L475.1,74.8 L478.4,74.4 L481.7,74.1 L485.0,74.0 L488.3,74.1 L491.6,74.4 L494.9,74.8 L498.2,75.5 L501.5,76.4 L504.8,77.4 L508.0,78.6 L511.3,80.0 L514.6,81.6 L517.9,83.4 L521.2,85.4 L524.5,87.6 L527.8,89.9 L531.1,92.4 L534.4,95.2 L537.7,98.1 L541.0,101.2 L544.2,104.5 L547.5,108.0 L550.8,111.6 L554.1,115.5 L557.4,119.5 L560.7,123.8 L564.0,128.2 L567.3,132.8 L570.6,137.6 L573.9,142.6 L577.2,147.8 L580.5,153.1 L583.8,158.7 L587.0,164.4 L590.3,170.4 L593.6,176.5 L596.9,182.8 L600.2,189.3 L603.5,196.0 L606.8,202.8 L610.1,209.9 L613.4,217.1 L616.7,224.6 L620.0,232.2 L623.2,240.0 L626.5,240.0 L629.8,240.0 L633.1,240.0 L636.4,240.0 L639.7,240.0 L643.0,240.0 L646.3,240.0 L649.6,240.0 L652.9,240.0 L656.2,240.0 L659.5,240.0 L662.8,240.0 L666.0,240.0 L669.3,240.0 L672.6,240.0 L675.9,240.0 L679.2,240.0 L682.5,240.0 L685.8,240.0 L689.1,240.0 L692.4,240.0 L695.7,240.0 L699.0,240.0 L702.2,240.0 L705.5,240.0 L708.8,240.0 L712.1,240.0 L715.4,240.0 L718.7,240.0 L722.0,240.0 L725.3,240.0 L728.6,240.0 L731.9,240.0 L735.2,240.0 L738.5,240.0 L741.8,240.0 L745.0,240.0 L748.3,240.0 L751.6,240.0 L754.9,240.0 L758.2,240.0 L761.5,240.0 L764.8,240.0 L768.1,240.0 L771.4,240.0 L774.7,240.0 L778.0,240.0 L781.2,240.0 L784.5,240.0 L787.8,240.0 L791.1,240.0 L794.4,240.0 L797.7,240.0 L801.0,240.0 L804.3,240.0 L807.6,240.0 L810.9,240.0 L814.2,240.0 L817.5,240.0 L820.8,240.0 L824.0,240.0 L827.3,240.0 L830.6,240.0 L833.9,240.0 L837.2,240.0 L840.5,240.0 L843.8,240.0 L847.1,240.0 L850.4,240.0 L853.7,240.0 L857.0,240.0 L860.2,240.0 L863.5,240.0 L866.8,240.0 L870.1,240.0 L873.4,240.0 L876.7,240.0 L880.0,240.0" fill="none" stroke="#3D8B5F" stroke-width="2.4"/>
  <line x1="485.0" y1="70" x2="748.3333333333334" y2="70" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.7"/>
  <text x="616.6666666666666" y="62" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">8 h offset</text>
  <rect x="300" y="268" width="14" height="14" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="322" y="280" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">raw UTC index — peak at 20:00, output during local night</text>
  <rect x="300" y="292" width="14" height="14" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="322" y="304" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">shifted to local standard time — peak at 12:00</text>
  <rect x="20" y="262" width="260" height="60" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="150.0" y="282" text-anchor="middle" font-size="11.5" fill="currentColor">Use a fixed UTC offset,</text>
  <text x="150.0" y="298" text-anchor="middle" font-size="11.5" fill="currentColor">not a DST-aware zone:</text>
  <text x="150.0" y="314" text-anchor="middle" font-size="11.5" fill="currentColor">DST duplicates and drops hours</text>
</svg>

```python
import numpy as np
import rasterio
import pyproj

def assert_ghi_integrity(result: dict, tif_path: str,
                         target_epsg: int = 4326,
                         min_coverage: float = 0.85) -> None:
    """Post-read assertions suitable for a CI/CD ingestion gate."""
    with rasterio.open(tif_path) as src:
        assert src.crs == pyproj.CRS.from_epsg(target_epsg), \
            f"CRS drift: {src.crs} != EPSG:{target_epsg}"
        assert np.issubdtype(src.dtypes[0], np.floating), \
            "NSRDB GHI must be float to preserve NaN nodata; integer dtype bleeds zeros."

    assert result["coverage_ratio"] >= min_coverage, (
        f"Spatial coverage {result['coverage_ratio']:.1%} below {min_coverage:.0%} "
        "threshold — route to manual review, do not auto-approve."
    )
    assert 0.0 < result["mean_ghi"] < 12.0, (
        f"mean_ghi {result['mean_ghi']:.2f} kWh/m^2/day outside physical bounds — "
        "check unit conversion and flag masking."
    )
```

Flag any dataset where coverage drops below 85 % of the project area or more than 5 % of pixels fail quality checks, and route it to a manual review queue rather than auto-approving the yield estimate.

## Audit-Ready Documentation & Provenance

Environmental compliance and grid-interconnection filings demand reproducible, version-controlled validation artifacts:

- **Checksum verification:** generate SHA-256 hashes for all ingested rasters and boundary files, stored in a `validation_manifest.json` alongside pipeline outputs.
- **Dependency pinning:** export exact environment states with `pip freeze > requirements.lock`, including `pyproj`, `rasterio`, and `geopandas` minor versions to prevent silent CRS-library regressions.
- **Structured logging:** replace `print()` with structured JSON logs capturing `timestamp`, `crs`, `valid_pixel_count`, `mean_ghi`, and `fallback_triggered` for downstream audit trails.
- **Quality-threshold reporting:** record the `coverage_ratio` and `data_source_tier` on every output row so a reviewer can reconstruct exactly which tier and which pixels produced each number.

For authoritative guidance on solar data-quality metrics, consult the [NREL NSRDB Technical Reference](https://nsrdb.nrel.gov/about/technical-reference.html). By enforcing explicit spatial alignment, memory-safe ingestion, and compliance-aware fallback routing, engineering teams eliminate silent validation failures and deliver audit-ready solar yield models at scale.

## Related

- [Open Energy Data Portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/) — the parent ingestion pattern this NSRDB workflow plugs into.
- [How to align EPSG:4326 and EPSG:3857 for solar site mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/how-to-align-epsg4326-and-epsg3857-for-solar-site-mapping/) — the CRS-drift failure signature behind empty intersections.
- [Stacking NASA POWER and PVGIS rasters in Rasterio](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/stacking-nasa-power-and-pvgis-rasters-in-rasterio/) — multi-source irradiance harmonization once NSRDB validation passes.
- [Resampling hourly solar data to monthly averages](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/resampling-hourly-solar-data-to-monthly-averages/) — the temporal aggregation stage downstream of validation.
- [Solar & Wind Resource Modeling Workflows](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/) — the resource-modeling domain these validated rasters feed.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "headline": "Validating NREL Solar Datasets with Python",
      "description": "Debug and fix silent failures in NREL NSRDB, PVWatts, and TMY3 ingestion — empty-intersection RuntimeError, full-extent MemoryError, and corrupted P50/P90 yields from unhandled quality flags — with a runnable Python validation pipeline.",
      "datePublished": "2025-09-12",
      "dateModified": "2026-06-26",
      "author": { "@type": "Organization", "name": "Renewable Energy Grid GIS" },
      "mainEntityOfPage": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/validating-nrel-solar-datasets-with-python/"
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Core Energy-GIS Data & Spatial Fundamentals", "item": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/" },
        { "@type": "ListItem", "position": 2, "name": "Open Energy Data Portals", "item": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/" },
        { "@type": "ListItem", "position": 3, "name": "Validating NREL Solar Datasets with Python", "item": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/validating-nrel-solar-datasets-with-python/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Validate an NREL NSRDB Solar Raster in Python",
      "description": "Pre-flight CRS and extent checks, a memory-safe flag-aware validation read, tiered fallback routing, and a CI/CD integrity gate for NREL solar irradiance data.",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Pre-flight validation of CRS, extent overlap, and read footprint", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/validating-nrel-solar-datasets-with-python/#pre-flight-validation-surface-the-fault-before-you-read-the-raster" },
        { "@type": "HowToStep", "position": 2, "name": "Run the production-grade windowed validation pipeline", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/validating-nrel-solar-datasets-with-python/#fix-implementation-a-production-grade-validation-pipeline" },
        { "@type": "HowToStep", "position": 3, "name": "Route through compliance-safe NSRDB / PVWatts / TMY3 fallbacks", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/validating-nrel-solar-datasets-with-python/#compliance-safe-fallback-routing" },
        { "@type": "HowToStep", "position": 4, "name": "Assert output integrity in a CI/CD gate", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/validating-nrel-solar-datasets-with-python/#downstream-validation-a-ci-cd-integrity-gate" }
      ]
    }
  ]
}
</script>
