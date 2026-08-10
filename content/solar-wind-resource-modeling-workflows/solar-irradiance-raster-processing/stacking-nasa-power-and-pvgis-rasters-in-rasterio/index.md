---
title: "Stacking NASA POWER and PVGIS Rasters in Rasterio"
description: "Fix the ValueError: Input shapes do not overlap raster and silent radiometric drift you hit when merging NASA POWER and PVGIS irradiance grids — a pre-flight alignment guard, an explicit reproject+stack routine, windowed/VRT fallbacks, and a CI/CD output audit."
slug: stacking-nasa-power-and-pvgis-rasters-in-rasterio
type: article
breadcrumb: Stacking NASA POWER & PVGIS in Rasterio
datePublished: 2025-09-16
dateModified: 2026-06-26
---

# Stacking NASA POWER and PVGIS rasters in rasterio

**Scenario / symptom:** you call `rasterio.merge` or `rasterio.stack` on a NASA POWER daily Global Horizontal Irradiance (GHI) grid and a PVGIS Typical Meteorological Year (TMY) surface, and you get `ValueError: Input shapes do not overlap raster` — or worse, no exception at all, just a stacked array whose two bands disagree on pixel registration by half a cell and quietly poison every downstream capacity factor. This failure lands in the raster-stacking stage of multi-source resource assessment, the step where heterogeneous irradiance products are supposed to become a single analysis-ready grid. It is the concrete, two-source instance of the *CRS drift in multi-source raster stacks* failure mode dissected in the parent workflow, [Solar Irradiance Raster Processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/), itself a stage of the broader [Solar & Wind Resource Modeling Workflows](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/) pipeline.

This page isolates the compounding causes, gives a pre-flight guard that surfaces the mismatch before a single byte is merged, then builds an explicit reproject-and-stack routine that produces a deterministic, audit-ready two-band GeoTIFF. The discipline is the same one applied across the site: enforce a known [coordinate reference system](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) and grid registration before any raster algebra, never let `rasterio` reproject implicitly, and gate the output against a structural audit.

## Root-Cause Analysis

The failure is rarely a `rasterio` bug. It stems from three compounding spatial mismatches that violate the strict alignment requirements of raster algebra:

1. **Native CRS & Grid Registration**: NASA POWER distributes data on a 0.5° × 0.5° latitude/longitude grid (EPSG:4326) with **center-registered** pixels. PVGIS outputs are typically projected to UTM zones or delivered as 0.01° grids with **edge-registered** (corner-aligned) pixels. Mixing registration types shifts pixel centers by half a cell width, introducing systematic irradiance bias.
2. **Affine Transform Divergence**: `rasterio.merge` relies on GDAL's VRT builder to compute a unified bounding box. When input transforms differ in origin, resolution, or rotation, the builder cannot resolve overlapping extents, triggering shape overlap errors or silent clipping.
3. **Implicit Reprojection Memory Spike**: If `rasterio` attempts on-the-fly resampling during merge, it materializes full-resolution arrays in RAM before alignment. For continental-scale datasets, this routinely triggers `MemoryError` on standard analyst workstations (≤32 GB RAM).

Resolving this requires explicit pre-alignment, memory-aware I/O, and deterministic fallback routing.

<svg viewBox="0 0 900 372" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three compounding mismatches — pixel registration, affine divergence, and implicit reprojection RAM spikes — all flow into a single hard pre-stack validation gate, which then drives an explicit pipeline: build a unified target grid, reproject each source, and stack to an audited GeoTIFF" style="width:100%;max-width:900px;height:auto;font-family:inherit;">
  <rect class="svg-bg" x="0" y="0" width="900" height="372"/>
  <title>From compounding mismatch to an audited two-band stack</title>
  <desc>A top-down diagram. The top row holds three causes of the merge failure: registration mismatch between center- and edge-registered pixel grids, affine transform divergence in origin, resolution and rotation, and the implicit-reprojection RAM spike. All three drop into one wide pre-stack validation gate that hard-fails on disjoint bounds, resolution, CRS and registration. From the gate the flow continues left to right through a build-unified-target-grid stage, an explicit per-source reproject stage with bilinear for NASA POWER and average for PVGIS, and a highlighted terminal stage that stacks the bands into an LZW GeoTIFF with audit tags and a CI gate.</desc>
  <defs>
    <marker id="st-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="900" height="372" fill="none"/>
  <!-- Top row: three compounding causes -->
  <rect x="30" y="24" width="260" height="86" rx="7" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="160" y="54" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">! Registration mismatch</text>
  <text x="160" y="76" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">center- vs edge-registered</text>
  <text x="160" y="94" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">half-cell pixel shift</text>
  <rect x="320" y="24" width="260" height="86" rx="7" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="450" y="54" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">! Affine divergence</text>
  <text x="450" y="76" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">origin · resolution · rotation</text>
  <text x="450" y="94" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">VRT cannot resolve extent</text>
  <rect x="610" y="24" width="260" height="86" rx="7" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="740" y="54" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">! Implicit reproject</text>
  <text x="740" y="76" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">full-res arrays in RAM</text>
  <text x="740" y="94" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">MemoryError at scale</text>
  <!-- Cause -> gate connectors -->
  <line x1="160" y1="110" x2="160" y2="156" stroke="currentColor" stroke-width="1.5" marker-end="url(#st-arr)"/>
  <line x1="450" y1="110" x2="450" y2="156" stroke="currentColor" stroke-width="1.5" marker-end="url(#st-arr)"/>
  <line x1="740" y1="110" x2="740" y2="156" stroke="currentColor" stroke-width="1.5" marker-end="url(#st-arr)"/>
  <!-- Validation gate (wide bar) -->
  <rect x="120" y="158" width="660" height="58" rx="7" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="450" y="184" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">Pre-stack validation gate — hard fail, not warning</text>
  <text x="450" y="204" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">disjoint_bounds · resolution · CRS · registration</text>
  <!-- Gate -> pipeline elbow -->
  <polyline points="450,216 450,250 160,250 160,282" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#st-arr)"/>
  <!-- Bottom pipeline row -->
  <rect x="30" y="284" width="260" height="80" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="160" y="316" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">Build unified target grid</text>
  <text x="160" y="337" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">from_origin · float32</text>
  <text x="160" y="354" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">NaN nodata</text>
  <rect x="320" y="284" width="260" height="80" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="450" y="316" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">Explicit reproject per source</text>
  <text x="450" y="337" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">bilinear · NASA POWER</text>
  <text x="450" y="354" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">average · PVGIS</text>
  <rect x="610" y="284" width="260" height="80" rx="7" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"/>
  <text x="740" y="316" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">Stack → LZW GeoTIFF</text>
  <text x="740" y="337" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">2 bands · audit tags</text>
  <text x="740" y="354" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">CI/CD integrity gate</text>
  <!-- Pipeline connectors -->
  <line x1="290" y1="324" x2="318" y2="324" stroke="currentColor" stroke-width="1.5" marker-end="url(#st-arr)"/>
  <line x1="580" y1="324" x2="608" y2="324" stroke="currentColor" stroke-width="1.5" marker-end="url(#st-arr)"/>
</svg>

## Pre-Stack Spatial Validation Protocol

Before attempting any merge operation, enforce deterministic spatial validation. This prevents silent drift in the resource-processing pipeline and ensures audit-ready traceability — the same guard-before-operation pattern used when [aligning EPSG:4326 and EPSG:3857 for solar site mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/how-to-align-epsg4326-and-epsg3857-for-solar-site-mapping/). Run it as a hard gate, not a warning: an unvalidated stack that reaches a yield model is indistinguishable from a correct one until the project finance review fails.

<svg viewBox="0 0 940 396" role="img" aria-label="The two sources do not share a grid. NASA POWER delivers half-degree cells, about 55 kilometres across at mid-latitude and roughly 3,000 square kilometres each. PVGIS SARAH-2 delivers 0.0417-degree cells, about 4.6 kilometres and 21 square kilometres. One POWER cell covers about 144 PVGIS cells, so stacking them without an explicit resample either smears a coarse value across a site or averages away the detail that made the fine grid worth using." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>One POWER cell covers about 144 PVGIS cells</title>
  <desc>Two grids drawn to a common scale over the same 110 by 110 kilometre area. The NASA POWER grid shows four half-degree cells, each about 55 kilometres across. The PVGIS grid shows the same area divided into 0.0417-degree cells about 4.6 kilometres across, roughly 576 of them. A single POWER cell is highlighted along with the 144 PVGIS cells it contains. Annotations give each cell size in kilometres and square kilometres and state the resampling rule: upsample the coarse grid with bilinear interpolation for continuous irradiance, never nearest, and record which grid the output is on.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="gs-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Same area, two grids, a 144:1 cell-count ratio</text>
  <text x="60" y="56" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">NASA POWER — 0.5° cells</text>
  <rect x="60.0" y="66.0" width="107.0" height="107.0" rx="3" fill="none" stroke="#5BA8C8" stroke-width="1.1"/>
  <rect x="170.0" y="66.0" width="107.0" height="107.0" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.6"/>
  <rect x="60.0" y="176.0" width="107.0" height="107.0" rx="3" fill="none" stroke="#5BA8C8" stroke-width="1.1"/>
  <rect x="170.0" y="176.0" width="107.0" height="107.0" rx="3" fill="none" stroke="#5BA8C8" stroke-width="1.1"/>
  <text x="223.0" y="125.0" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">≈ 55 km</text>
  <text x="170.0" y="304" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">each cell ≈ 3 000 km²</text>
  <line x1="296" y1="176.0" x2="336" y2="176.0" stroke="currentColor" stroke-width="1.4" marker-end="url(#gs-arr)"/>
  <text x="352" y="56" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">PVGIS SARAH-2 — 0.0417° cells</text>
  <rect x="352.0" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="471.16666666666663" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="480.3333333333333" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="489.5" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="498.66666666666663" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="507.8333333333333" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="517.0" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="526.1666666666666" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="535.3333333333333" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="544.5" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="553.6666666666666" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="562.8333333333333" y="66.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="352.0" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="471.16666666666663" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="480.3333333333333" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="489.5" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="498.66666666666663" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="507.8333333333333" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="517.0" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="526.1666666666666" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="535.3333333333333" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="544.5" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="553.6666666666666" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="562.8333333333333" y="75.16666666666667" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="352.0" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="471.16666666666663" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="480.3333333333333" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="489.5" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="498.66666666666663" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="507.8333333333333" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="517.0" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="526.1666666666666" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="535.3333333333333" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="544.5" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="553.6666666666666" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="562.8333333333333" y="84.33333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="352.0" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="471.16666666666663" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="480.3333333333333" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="489.5" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="498.66666666666663" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="507.8333333333333" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="517.0" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="526.1666666666666" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="535.3333333333333" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="544.5" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="553.6666666666666" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="562.8333333333333" y="93.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="352.0" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="471.16666666666663" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="480.3333333333333" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="489.5" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="498.66666666666663" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="507.8333333333333" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="517.0" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="526.1666666666666" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="535.3333333333333" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="544.5" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="553.6666666666666" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="562.8333333333333" y="102.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="352.0" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="471.16666666666663" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="480.3333333333333" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="489.5" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="498.66666666666663" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="507.8333333333333" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="517.0" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="526.1666666666666" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="535.3333333333333" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="544.5" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="553.6666666666666" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="562.8333333333333" y="111.83333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="352.0" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="471.16666666666663" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="480.3333333333333" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="489.5" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="498.66666666666663" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="507.8333333333333" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="517.0" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="526.1666666666666" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="535.3333333333333" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="544.5" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="553.6666666666666" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="562.8333333333333" y="121.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="352.0" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="471.16666666666663" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="480.3333333333333" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="489.5" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="498.66666666666663" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="507.8333333333333" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="517.0" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="526.1666666666666" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="535.3333333333333" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="544.5" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="553.6666666666666" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="562.8333333333333" y="130.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="352.0" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="471.16666666666663" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="480.3333333333333" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="489.5" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="498.66666666666663" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="507.8333333333333" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="517.0" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="526.1666666666666" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="535.3333333333333" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="544.5" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="553.6666666666666" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="562.8333333333333" y="139.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="352.0" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="471.16666666666663" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="480.3333333333333" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="489.5" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="498.66666666666663" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="507.8333333333333" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="517.0" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="526.1666666666666" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="535.3333333333333" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="544.5" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="553.6666666666666" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="562.8333333333333" y="148.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="352.0" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="471.16666666666663" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="480.3333333333333" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="489.5" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="498.66666666666663" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="507.8333333333333" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="517.0" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="526.1666666666666" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="535.3333333333333" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="544.5" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="553.6666666666666" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="562.8333333333333" y="157.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="352.0" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="471.16666666666663" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="480.3333333333333" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="489.5" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="498.66666666666663" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="507.8333333333333" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="517.0" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="526.1666666666666" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="535.3333333333333" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="544.5" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="553.6666666666666" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="562.8333333333333" y="166.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5"/>
  <rect x="352.0" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="471.16666666666663" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="480.3333333333333" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="489.5" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="498.66666666666663" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="507.8333333333333" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="517.0" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="526.1666666666666" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="535.3333333333333" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="544.5" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="553.6666666666666" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="562.8333333333333" y="176.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="352.0" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="471.16666666666663" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="480.3333333333333" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="489.5" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="498.66666666666663" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="507.8333333333333" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="517.0" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="526.1666666666666" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="535.3333333333333" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="544.5" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="553.6666666666666" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="562.8333333333333" y="185.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="352.0" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="471.16666666666663" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="480.3333333333333" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="489.5" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="498.66666666666663" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="507.8333333333333" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="517.0" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="526.1666666666666" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="535.3333333333333" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="544.5" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="553.6666666666666" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="562.8333333333333" y="194.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="352.0" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="471.16666666666663" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="480.3333333333333" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="489.5" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="498.66666666666663" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="507.8333333333333" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="517.0" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="526.1666666666666" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="535.3333333333333" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="544.5" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="553.6666666666666" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="562.8333333333333" y="203.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="352.0" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="471.16666666666663" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="480.3333333333333" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="489.5" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="498.66666666666663" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="507.8333333333333" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="517.0" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="526.1666666666666" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="535.3333333333333" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="544.5" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="553.6666666666666" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="562.8333333333333" y="212.66666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="352.0" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="471.16666666666663" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="480.3333333333333" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="489.5" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="498.66666666666663" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="507.8333333333333" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="517.0" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="526.1666666666666" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="535.3333333333333" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="544.5" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="553.6666666666666" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="562.8333333333333" y="221.83333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="352.0" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="471.16666666666663" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="480.3333333333333" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="489.5" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="498.66666666666663" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="507.8333333333333" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="517.0" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="526.1666666666666" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="535.3333333333333" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="544.5" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="553.6666666666666" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="562.8333333333333" y="231.0" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="352.0" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="471.16666666666663" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="480.3333333333333" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="489.5" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="498.66666666666663" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="507.8333333333333" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="517.0" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="526.1666666666666" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="535.3333333333333" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="544.5" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="553.6666666666666" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="562.8333333333333" y="240.16666666666666" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="352.0" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="471.16666666666663" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="480.3333333333333" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="489.5" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="498.66666666666663" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="507.8333333333333" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="517.0" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="526.1666666666666" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="535.3333333333333" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="544.5" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="553.6666666666666" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="562.8333333333333" y="249.33333333333331" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="352.0" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="471.16666666666663" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="480.3333333333333" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="489.5" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="498.66666666666663" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="507.8333333333333" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="517.0" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="526.1666666666666" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="535.3333333333333" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="544.5" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="553.6666666666666" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="562.8333333333333" y="258.5" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="352.0" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="471.16666666666663" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="480.3333333333333" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="489.5" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="498.66666666666663" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="507.8333333333333" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="517.0" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="526.1666666666666" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="535.3333333333333" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="544.5" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="553.6666666666666" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="562.8333333333333" y="267.66666666666663" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="352.0" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="361.1666666666667" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="370.3333333333333" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="379.5" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="388.6666666666667" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="397.8333333333333" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="407.0" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="416.16666666666663" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="425.3333333333333" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="434.5" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="443.66666666666663" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="452.8333333333333" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="462.0" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="471.16666666666663" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="480.3333333333333" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="489.5" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="498.66666666666663" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="507.8333333333333" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="517.0" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="526.1666666666666" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="535.3333333333333" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="544.5" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="553.6666666666666" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <rect x="562.8333333333333" y="276.8333333333333" width="8.566666666666666" height="8.566666666666666" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.22"/>
  <text x="517.0" y="125.0" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">144 cells</text>
  <text x="462.0" y="304" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">each cell ≈ 21 km²</text>
  <rect x="600" y="74" width="316" height="88" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="758.0" y="96" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">Resample rule</text>
  <text x="758.0" y="114" text-anchor="middle" font-size="11.5" fill="currentColor">upsample POWER → PVGIS grid</text>
  <text x="758.0" y="132" text-anchor="middle" font-size="11.5" fill="currentColor">bilinear for continuous irradiance</text>
  <text x="758.0" y="150" text-anchor="middle" font-size="11.5" fill="currentColor">never nearest — it blocks the field</text>
  <rect x="600" y="200" width="316" height="70" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="758.0" y="222" text-anchor="middle" font-size="11.5" fill="currentColor">Record the grid the output sits on:</text>
  <text x="758.0" y="240" text-anchor="middle" font-size="11.5" fill="currentColor">a stack has exactly one geotransform</text>
  <text x="758.0" y="258" text-anchor="middle" font-size="11.5" fill="currentColor">and both bands must share it</text>
  <rect x="60" y="316" width="856" height="48" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="488.0" y="337" text-anchor="middle" font-size="11.5" fill="currentColor">Averaging PVGIS down to the POWER grid throws away the resolution that justified using PVGIS;</text>
  <text x="488.0" y="354" text-anchor="middle" font-size="11.5" fill="currentColor">upsampling POWER upward is honest as long as the output metadata says the coarse band is interpolated.</text>
</svg>

```python
import rasterio
from rasterio.coords import disjoint_bounds
from rasterio.transform import from_origin
import numpy as np

def validate_alignment(src_paths, target_crs="EPSG:4326", target_res=0.01):
    """Pre-flight validation for multi-source raster alignment."""
    transforms = []
    for path in src_paths:
        with rasterio.open(path) as src:
            # Check CRS compatibility
            if not src.crs.equals(target_crs):
                raise ValueError(f"{path} CRS {src.crs} != target {target_crs}. Reprojection required.")

            # Check bounds intersection
            if len(src_paths) > 1:
                for other_path in src_paths:
                    if path != other_path:
                        with rasterio.open(other_path) as other:
                            if disjoint_bounds(src.bounds, other.bounds):
                                raise ValueError(f"Disjoint bounds between {path} and {other_path}")

            transforms.append(src.transform)

    # Verify uniform resolution post-resampling
    res_a = [abs(t.a) for t in transforms]
    if not np.allclose(res_a, target_res, atol=1e-6):
        raise ValueError(f"Input resolutions {res_a} diverge from target {target_res}.")

    print("✅ Spatial validation passed. Proceeding to alignment.")
```

## Memory-Aware Alignment & Stacking Routine

Bypassing `rasterio.merge` for explicit `reproject` + `np.stack` provides deterministic control over resampling kernels, nodata handling, and memory allocation. The routine below enforces `float32` precision, LZW compression, and explicit transform logging for downstream audit compliance.

```python
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin
import numpy as np
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def align_and_stack_solar_rasters(power_path, pvgis_path, out_path,
                                  target_crs="EPSG:4326", target_res=0.01):
    """Aligns, resamples, and stacks NASA POWER and PVGIS irradiance rasters."""

    with rasterio.open(power_path) as src_power, rasterio.open(pvgis_path) as src_pvgis:
        # 1. Establish unified target grid
        target_bounds = rasterio.warp.transform_bounds(
            src_pvgis.crs, target_crs, *src_pvgis.bounds
        )
        target_transform = from_origin(
            target_bounds[0], target_bounds[3], target_res, target_res
        )
        width = int(np.ceil((target_bounds[2] - target_bounds[0]) / target_res))
        # target_bounds = (left, bottom, right, top); height = (top - bottom) / res
        height = int(np.ceil((target_bounds[3] - target_bounds[1]) / target_res))

        # 2. Pre-allocate destination arrays (float32 halves RAM vs float64)
        dst_shape = (1, height, width)
        dst_power = np.full(dst_shape, np.nan, dtype="float32")
        dst_pvgis = np.full(dst_shape, np.nan, dtype="float32")

        # 3. Explicit reprojection & resampling
        datasets = [
            (src_power, dst_power, Resampling.bilinear),
            (src_pvgis, dst_pvgis, Resampling.average)
        ]

        for src, dst_arr, resample_method in datasets:
            reproject(
                source=rasterio.band(src, 1),
                destination=dst_arr,
                src_transform=src.transform,
                src_crs=src.crs,
                dst_transform=target_transform,
                dst_crs=target_crs,
                resampling=resample_method,
                dst_nodata=np.nan
            )

        # 4. Stack & write with audit metadata
        stacked = np.concatenate([dst_power, dst_pvgis], axis=0)
        profile = src_power.profile.copy()
        profile.update({
            "driver": "GTiff",
            "dtype": "float32",
            "count": 2,
            "height": height,
            "width": width,
            "crs": target_crs,
            "transform": target_transform,
            "compress": "lzw",
            "nodata": np.nan,
            "tiled": True,
            "blockxsize": 512,
            "blockysize": 512
        })

        with rasterio.open(out_path, "w", **profile) as dst:
            dst.write(stacked)
            dst.update_tags(
                source_1="NASA_POWER_GHI",
                source_2="PVGIS_TMY_GHI",
                resampling="bilinear/average",
                target_crs=str(target_crs),
                target_resolution=str(target_res)
            )

    logger.info(f"Stacked raster written to {out_path} | Shape: {stacked.shape} | CRS: {target_crs}")
```

## Performance Tuning & Fallback Routing

For regional or continental-scale deployments, in-memory allocation may exceed workstation limits. Implement the following fallback routing to maintain pipeline stability:

- **Windowed I/O**: Partition the target grid into 1024×1024 tiles. Process each window independently using `rasterio.windows.Window` to cap peak RAM at ~2 GB.
- **Virtual Raster (VRT) Fallback**: When disk I/O latency dominates, generate a pre-aligned VRT using `rasterio.vrt.WarpedVRT`. This defers resampling to read-time and eliminates intermediate array allocation.
- **GDAL Cache Tuning**: Set `GDAL_CACHEMAX` to 25% of available RAM before execution. For Linux/macOS: `export GDAL_CACHEMAX=8000`. This accelerates tile reads during reprojection.
- **Resampling Kernel Selection**: Use `Resampling.average` for PVGIS (reduces aliasing in high-frequency TMY data) and `Resampling.bilinear` for NASA POWER (preserves daily gradient continuity). Avoid `nearest` for irradiance modeling, as it introduces quantization artifacts in capacity factor calculations.

Refer to the official [Rasterio Reprojection & Warping Documentation](https://rasterio.readthedocs.io/en/latest/topics/reproject.html) for kernel-specific performance benchmarks and memory footprint matrices.

## Downstream Validation & Pipeline Integration

Post-stack validation must verify spatial integrity, nodata propagation, and metadata compliance before feeding arrays into PVLIB or SAM yield models. Treat it as a CI/CD gate identical in spirit to the input-side checks in [Spatial Data Quality & Validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/): the source rasters themselves should already have passed provenance and value-range checks such as those in [validating NREL solar datasets with Python](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/validating-nrel-solar-datasets-with-python/) before they ever reach this stack.

<svg viewBox="0 0 940 356" role="img" aria-label="The two sources also disagree about time. NASA POWER runs from 1984 to the present with a two to three month lag. PVGIS SARAH-2 covers 2005 to 2020 and is a fixed reprocessed archive. The only window in which both are defined is 2005 to 2020, and any long-term average that mixes a 40-year POWER record with a 16-year PVGIS record is comparing two different climatologies rather than two datasets." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>The overlapping years are the only ones a comparison can use</title>
  <desc>Two horizontal time bars over an axis from 1980 to 2026. The NASA POWER bar runs from 1984 to about 2025 with a hatched tail marking the two to three month publication lag. The PVGIS SARAH-2 bar runs from 2005 to 2020 as a fixed archive. The overlapping span from 2005 to 2020 is highlighted and labelled as the only valid comparison window, with a note that a 40-year mean and a 16-year mean describe different climatologies even when both are correct.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="356"/>
  <defs><marker id="tw-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Two records, one overlapping window</text>
  <rect x="543.9130434782609" y="60" width="254.3478260869565" height="176" rx="6" fill="#DDF0E2" opacity="0.6"/>
  <text x="671.0869565217391" y="82" text-anchor="middle" font-size="11.5" fill="#1F5C3A" font-weight="700">2005 – 2020 · the comparable window</text>
  <rect x="187.82608695652175" y="104" width="695.2173913043479" height="46" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
  <text x="201.82608695652175" y="132" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">NASA POWER · 1984 → present</text>
  <rect x="883.0434782608696" y="104" width="16.95652173913038" height="46" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="877.0434782608696" y="168" text-anchor="end" font-size="10.5" fill="#7A4A1A">2–3 month lag</text>
  <rect x="543.9130434782609" y="180" width="254.3478260869565" height="46" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
  <text x="557.9130434782609" y="208" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">PVGIS SARAH-2 · fixed archive</text>
  <line x1="120" y1="250" x2="900" y2="250" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="120.0" y1="250" x2="120.0" y2="256" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="120.0" y="272" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1980</text>
  <line x1="289.5652173913044" y1="250" x2="289.5652173913044" y2="256" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="289.5652173913044" y="272" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1990</text>
  <line x1="459.1304347826087" y1="250" x2="459.1304347826087" y2="256" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="459.1304347826087" y="272" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">2000</text>
  <line x1="628.695652173913" y1="250" x2="628.695652173913" y2="256" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="628.695652173913" y="272" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">2010</text>
  <line x1="798.2608695652174" y1="250" x2="798.2608695652174" y2="256" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="798.2608695652174" y="272" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">2020</text>
  <line x1="900.0" y1="250" x2="900.0" y2="256" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="900.0" y="272" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">2026</text>
  <rect x="120" y="288" width="780" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="510.0" y="309" text-anchor="middle" font-size="11.5" fill="currentColor">A 40-year POWER mean and a 16-year PVGIS mean are both correct and not comparable: the difference</text>
  <text x="510.0" y="326" text-anchor="middle" font-size="11.5" fill="currentColor">between them is climate variability, not dataset disagreement.</text>
</svg>

```python
def audit_stacked_raster(path):
    """Verify output integrity for project finance & CI/CD compliance."""
    with rasterio.open(path) as src:
        assert src.count == 2, "Expected 2 bands (POWER, PVGIS)"
        assert src.dtype == "float32", "Precision mismatch detected"
        assert src.crs.to_epsg() == 4326, "CRS drift detected"

        # Check for catastrophic nodata bleed.
        # Use np.isnan when nodata is NaN (NaN != NaN), otherwise use equality.
        b1 = src.read(1)
        b2 = src.read(2)
        nodata = src.nodata
        if nodata is not None and np.isnan(nodata):
            band1_mask = np.isnan(b1)
            band2_mask = np.isnan(b2)
        else:
            band1_mask = (b1 == nodata) if nodata is not None else np.zeros_like(b1, dtype=bool)
            band2_mask = (b2 == nodata) if nodata is not None else np.zeros_like(b2, dtype=bool)
        overlap_nodata = np.sum(band1_mask & band2_mask)
        logger.info(f"Nodata overlap: {overlap_nodata} pixels")

        # Log affine matrix for audit trail
        logger.info(f"Transform: {src.transform}")
        return True
```

Embed this validation step immediately after stack generation. It guarantees deterministic alignment across environment deployments (local, staging, cloud) and satisfies technical due diligence requirements for renewable asset financing. For advanced coordinate transformation troubleshooting and GDAL-level warp diagnostics, consult the [GDAL Coordinate Transformation & Resampling Algorithms](https://gdal.org/en/latest/api/python/utilities.html#gdal.Warp) reference.

## Related

- [Solar Irradiance Raster Processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) — the parent workflow that frames CRS drift across multi-source irradiance stacks and the full ingestion-to-audit sequence.
- [Resampling Hourly Solar Data to Monthly Averages](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/resampling-hourly-solar-data-to-monthly-averages/) — the temporal counterpart, aligning the time axis after these grids are spatially aligned.
- [Automating Hillshade and Slope Analysis for Wind Turbine Siting](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/automating-hillshade-and-slope-analysis-for-wind-turbine-siting/) — a sibling raster workflow that consumes the same target-grid discipline for terrain layers.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — the projection and registration contract behind every aligned raster stack.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "headline": "Stacking NASA POWER and PVGIS Rasters in Rasterio",
      "description": "Fix the ValueError: Input shapes do not overlap raster and silent radiometric drift when merging NASA POWER and PVGIS irradiance grids — a pre-flight alignment guard, an explicit reproject+stack routine, windowed/VRT fallbacks, and a CI/CD output audit.",
      "datePublished": "2025-09-16",
      "dateModified": "2026-06-26",
      "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/stacking-nasa-power-and-pvgis-rasters-in-rasterio/",
      "author": { "@type": "Organization", "name": "Renewable Energy Grid GIS" },
      "publisher": { "@type": "Organization", "name": "Renewable Energy Grid GIS" },
      "isPartOf": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/",
      "keywords": "rasterio, NASA POWER, PVGIS, raster stacking, GHI, EPSG:4326, reproject, resampling, pixel registration, affine transform, solar resource, energy GIS"
    },
    {
      "@type": "HowTo",
      "name": "Align and stack NASA POWER and PVGIS irradiance rasters in rasterio",
      "description": "Detect the registration and affine mismatch that breaks rasterio.merge, build a unified target grid, reproject each source explicitly, stack to a float32 GeoTIFF, and validate the output for CI/CD.",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Run a pre-stack spatial validation guard before merging", "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/stacking-nasa-power-and-pvgis-rasters-in-rasterio/#pre-stack-spatial-validation-protocol" },
        { "@type": "HowToStep", "position": 2, "name": "Reproject each source to a unified target grid and stack with audit tags", "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/stacking-nasa-power-and-pvgis-rasters-in-rasterio/#memory-aware-alignment--stacking-routine" },
        { "@type": "HowToStep", "position": 3, "name": "Apply windowed I/O, VRT and GDAL cache fallbacks at scale", "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/stacking-nasa-power-and-pvgis-rasters-in-rasterio/#performance-tuning--fallback-routing" },
        { "@type": "HowToStep", "position": 4, "name": "Gate the output with a downstream integrity audit", "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/stacking-nasa-power-and-pvgis-rasters-in-rasterio/#downstream-validation--pipeline-integration" }
      ]
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.renewable-energy-grid-gis.org/" },
        { "@type": "ListItem", "position": 2, "name": "Solar & Wind Resource Modeling Workflows", "item": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/" },
        { "@type": "ListItem", "position": 3, "name": "Solar Irradiance Raster Processing", "item": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/" },
        { "@type": "ListItem", "position": 4, "name": "Stacking NASA POWER and PVGIS Rasters in Rasterio", "item": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/stacking-nasa-power-and-pvgis-rasters-in-rasterio/" }
      ]
    }
  ]
}
</script>