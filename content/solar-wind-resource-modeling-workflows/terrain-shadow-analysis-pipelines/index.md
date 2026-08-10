---
title: Terrain & Shadow Analysis Pipelines
description: A production Python workflow for terrain and shadow analysis in renewable siting — metric CRS enforcement, vectorized horizon profiling, async windowed shadow casting, and audit-ready terrain-loss metadata for bankable yield assessment.
slug: terrain-shadow-analysis-pipelines
type: guide
breadcrumb: Terrain & Shadow Analysis Pipelines
datePublished: 2025-09-22
dateModified: 2026-06-26
---

# Terrain & Shadow Analysis Pipelines

Terrain and shadow analysis is the validation layer that decides whether a resource estimate survives contact with the actual ground. Mesoscale models and satellite irradiance products assume an unobstructed sky; real sites sit in valleys, behind ridgelines, and on north-facing slopes that clip the morning and evening sun and steer the wind. This workflow is the topographic-correction stage of the broader [Solar & Wind Resource Modeling Workflows](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/) pipeline: it takes a digital elevation model (DEM) and a time series of solar positions and produces the shadow-loss and slope-constraint surfaces that turn a flat-sky resource figure into a defensible, terrain-aware yield projection. The specific failure mode this stage exists to eliminate is *horizon drift in misaligned DEM stacks* — when the elevation grid and the irradiance grid disagree on projection, pixel registration, or vertical datum by even a fraction of a cell, every cast shadow lands in the wrong place and the resulting terrain loss is biased in a way no later step can detect.

The goal is deterministic: convert raw elevation into a binary or fractional shadow mask, plus slope and aspect derivatives, that align pixel-for-pixel with the irradiance surface they will modulate, carry explicit provenance, and quantify terrain-induced losses *before* the financial model consumes them. This page covers the conceptual foundation, the prerequisites, a full runnable horizon-and-shadow function, the failure modes that break naive shadow casting, the scalability patterns for high-resolution lidar-derived DEMs, and the audit trail that makes a terrain-loss figure bankable in permitting and project-finance review.

<svg viewBox="0 0 940 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Terrain and shadow analysis pipeline: DEM ingest flows through a CRS and vertical-datum validation gate that rejects drifted grids, then slope and aspect derivatives, vectorized horizon profiling, a fractional shadow mask, an alignment check against the irradiance grid, irradiance modulation, and a bankable terrain-loss percentage." style="width:100%;max-width:940px;height:auto;font-family:inherit;">
  <rect class="svg-bg" x="0" y="0" width="940" height="320"/>
  <title>Terrain &amp; Shadow Analysis Pipeline</title>
  <desc>A snake-layout data-flow diagram. The top row runs left to right: Stage 1 DEM ingest from lidar or SRTM; Stage 2 a CRS and vertical-datum validation gate, drawn dashed, with a side branch labelled "drift, reject" that diverts misregistered or unit-mismatched grids out of the pipeline; Stage 3 slope and aspect derivatives; Stage 4 vectorized horizon profiling by cumulative-max ray sweep. The flow then drops down on the right and the bottom row runs right to left: Stage 5 the fractional shadow mask; Stage 6 an alignment check against the upstream irradiance grid; the "aligned" path then feeds Stage 7 irradiance modulation, which dims the direct beam; and the highlighted terminal artifact is the bankable, audit-tagged terrain-loss percentage.</desc>
  <defs>
    <marker id="tsa-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="940" height="320" fill="none"/>
  <!-- Top row: S1 -> S2 (gate) -> S3 -> S4 -->
  <rect x="20" y="40" width="195" height="78" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="117" y="70" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">1 · DEM Ingest</text>
  <text x="117" y="90" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">lidar DSM · SRTM</text>
  <text x="117" y="106" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">single-band float, metres</text>
  <rect x="255" y="40" width="195" height="78" rx="7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="6,3"/>
  <text x="352" y="70" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">2 · CRS + Datum Gate</text>
  <text x="352" y="90" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">metric EPSG · vertical unit</text>
  <text x="352" y="106" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">true-distance precondition</text>
  <rect x="490" y="40" width="195" height="78" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="587" y="70" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">3 · Slope / Aspect</text>
  <text x="587" y="90" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">np.gradient derivatives</text>
  <text x="587" y="106" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">vertical sanity check</text>
  <rect x="725" y="40" width="195" height="78" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="822" y="70" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">4 · Horizon Profiling</text>
  <text x="822" y="90" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">cumulative-max ray sweep</text>
  <text x="822" y="106" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">time-invariant, cached</text>
  <!-- Bottom row: S5 <- ... ; S6 -> S7 -> terminal -->
  <rect x="725" y="210" width="195" height="78" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="822" y="240" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">5 · Shadow Mask</text>
  <text x="822" y="260" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">α ≤ h(θ) per timestamp</text>
  <text x="822" y="276" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">float32 shaded-time</text>
  <rect x="490" y="210" width="195" height="78" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="587" y="240" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">6 · Align Check</text>
  <text x="587" y="260" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">vs irradiance grid</text>
  <text x="587" y="276" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">affine residual ≤ 0.5 m</text>
  <rect x="255" y="210" width="195" height="78" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="352" y="240" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">7 · Irradiance Modulation</text>
  <text x="352" y="260" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">dim the direct beam</text>
  <text x="352" y="276" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">terrain-aware POA</text>
  <rect x="20" y="210" width="195" height="78" rx="7" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"/>
  <text x="117" y="240" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">Terrain-loss %</text>
  <text x="117" y="260" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">bankable · audit-tagged</text>
  <text x="117" y="276" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">ISO lineage in tags</text>
  <!-- Top-row connectors -->
  <line x1="215" y1="79" x2="248" y2="79" stroke="currentColor" stroke-width="1.5" marker-end="url(#tsa-arr)"/>
  <line x1="450" y1="79" x2="483" y2="79" stroke="currentColor" stroke-width="1.5" marker-end="url(#tsa-arr)"/>
  <text x="466" y="70" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">aligned</text>
  <line x1="685" y1="79" x2="718" y2="79" stroke="currentColor" stroke-width="1.5" marker-end="url(#tsa-arr)"/>
  <!-- Drop S4 -> S5 -->
  <line x1="822" y1="118" x2="822" y2="203" stroke="currentColor" stroke-width="1.5" marker-end="url(#tsa-arr)"/>
  <text x="835" y="166" text-anchor="start" font-size="10" fill="currentColor" opacity="0.65">per timestamp</text>
  <!-- Bottom-row connectors (right to left) -->
  <line x1="725" y1="249" x2="692" y2="249" stroke="currentColor" stroke-width="1.5" marker-end="url(#tsa-arr)"/>
  <line x1="490" y1="249" x2="457" y2="249" stroke="currentColor" stroke-width="1.5" marker-end="url(#tsa-arr)"/>
  <text x="473" y="240" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">aligned</text>
  <line x1="255" y1="249" x2="222" y2="249" stroke="currentColor" stroke-width="1.5" marker-end="url(#tsa-arr)"/>
  <!-- Reject branch off the gate -->
  <line x1="352" y1="118" x2="352" y2="142" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#tsa-arr)"/>
  <rect x="277" y="146" width="150" height="34" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5,3"/>
  <text x="352" y="168" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">drift → reject build</text>
</svg>

## Why naive shadow casting fails

The intuitive approach — loop over every pixel, march a ray toward the sun, and flag the pixel as shaded the moment a higher cell appears — fails on two independent axes: spatial correctness and computational cost. Both compound into the silent bias this stage must prevent.

First, **spatial misregistration between the DEM and the resource grid**. Shadow masks are not consumed in isolation; they multiply the direct component of an irradiance surface produced upstream by [solar irradiance raster processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/). If the DEM is delivered in geographic coordinates ([EPSG:4326](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/)) with degree-based spacing while the irradiance grid is in a projected metric system such as EPSG:32612, the horizon angles computed from degree distances are wrong by a latitude-dependent factor, and the mask is registered half a cell — tens of metres on the ground — away from the irradiance pixels it is supposed to dim. Enforcing [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) into one projected, metric target is the precondition for every subsequent angle calculation.

Second, **vertical datum and unit mismatch**. Horizon elevation is an angle built from a *rise over a run*. If the horizontal run is in metres but the vertical rise is in feet, or the DEM mixes an ellipsoidal height with an orthometric (geoid) reference partway through a mosaic, the computed terrain angle is systematically wrong. A 30% vertical scaling error from a foot/metre confusion turns a true 4° horizon into a 5.2° horizon and over-reports morning shadow loss across the whole site.

Third, **per-pixel ray marching does not scale**. A naive nested loop is $O(N \times T \times R)$ — for $N$ pixels, $T$ timestamps, and $R$ steps along each ray. A 4000×4000 lidar tile evaluated hourly across a year is on the order of $10^{13}$ ray steps, which is why production pipelines precompute a per-cell *horizon profile* once and reuse it for every timestamp. The angle to the local horizon in a given azimuth direction does not change with time; only the sun moves. Separating the time-invariant horizon profile from the time-varying solar position collapses the cost by orders of magnitude.

A clean pipeline therefore decouples spatial validation, horizon profiling, and temporal shadow evaluation into discrete, testable stages so that projection drift, datum mismatch, or registration error is caught and rejected before any shadow is cast, rather than discovered after the yield model has already absorbed the bias.

## Prerequisites and data requirements

Before running the workflow, pin the inputs and the environment so terrain results are reproducible across a portfolio:

- **Library versions:** `rasterio>=1.3`, `numpy>=1.24`, `pyproj>=3.5`, and `pvlib>=0.10` for solar position. GDAL underpins `rasterio`; keep it `>=3.6`. Datum transforms should defer to the [pyproj documentation](https://pyproj4.github.io/pyproj/stable/) and the EPSG registry rather than hand-coded proj strings.
- **Target CRS:** a single projected, metric CRS matching the project's UTM zone (for example EPSG:32612 for the US Mountain West). Store the EPSG integer, never an unqualified "UTM 12N" string, and confirm the DEM shares this CRS with the irradiance grid produced by [solar irradiance raster processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/).
- **Input geometry:** a single-band float DEM (GeoTIFF or Cloud-Optimized GeoTIFF) of ground or surface elevation in **metres**, with a defined CRS, a declared nodata value, and a documented vertical datum (e.g. NAVD88 orthometric). Lidar-derived DSMs capture vegetation and structures that cast real shadow; bare-earth DTMs do not — pick the one that matches the obstruction question. Surfaces missing a CRS must be rejected at ingest; see [spatial data quality validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) for the cleaning patterns this stage assumes upstream.
- **Solar geometry:** per-timestamp solar azimuth and elevation for the site latitude/longitude, typically from `pvlib.solarposition`. Only timestamps with positive solar elevation matter; the sun below the horizon produces a trivially fully-shaded frame.
- **Source provenance:** DEM acquisition date, source portal, product version, and ground sample distance, sourced from one of the documented [open energy data portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/) so the terrain-loss output's lineage is auditable.

A pixel is shaded at a given instant when the sun sits below the local terrain horizon in the sun's azimuth direction. With $h(\theta)$ the horizon elevation angle toward azimuth $\theta$ and $\alpha_s$ the solar elevation:

$$ \text{shaded}(\theta_s, \alpha_s) = \begin{cases} 1 & \alpha_s \le h(\theta_s) \\ 0 & \alpha_s > h(\theta_s) \end{cases} $$

The horizon angle itself, for a neighbour cell at planimetric distance $d$ and elevation difference $\Delta z$, is:

$$ h = \arctan\!\left(\frac{\Delta z}{d}\right) $$

Because $d$ must be a true metric distance, this formula is only valid once the DEM is in a projected CRS — the algebraic restatement of why the spatial validation gate runs first.

## Core implementation

The loader below enforces a metric projection and a sane vertical range, then generates memory-safe windows for chunked execution. It rejects geographic CRS inputs early, because degree-based runs make the `arctan` horizon angle meaningless. Variable names are energy-specific throughout.

<svg viewBox="0 0 940 400" role="img" aria-label="How slope is computed from a DEM. The Horn method reads the eight neighbours of each cell, weights the four cardinal neighbours double, and forms east-west and north-south gradients; slope is the arctangent of their combined magnitude divided by the cell size. Two consequences follow: the result depends on the cell size, so a 30 metre DEM and a 10 metre DEM give different slopes for the same hill, and the outermost ring of cells has no complete neighbourhood and must be masked, not guessed." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Slope from a DEM: the 3 by 3 Horn kernel and its two consequences</title>
  <desc>On the left, a 3 by 3 cell neighbourhood labelled a through i with the centre cell highlighted, and the two Horn weight stencils: the east-west gradient weights the left and right columns with 1, 2, 1 and the north-south gradient weights the top and bottom rows the same way. In the middle, the formulae for the two gradients and the arctangent that turns them into a slope in degrees. On the right, two consequences: the same hill measured on a 30 metre and a 10 metre DEM gives 8.4 and 11.2 degrees, and the outer ring of cells has no complete neighbourhood and is masked rather than extrapolated.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="hn-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Slope is a property of the DEM as much as of the hill</text>
  <rect x="44" y="76" width="58" height="58" rx="4" fill="none" stroke="#5BA8C8" stroke-width="1.1"/>
  <text x="73.0" y="114" text-anchor="middle" font-size="15" fill="currentColor" font-weight="700">a</text>
  <rect x="106" y="76" width="58" height="58" rx="4" fill="none" stroke="#5BA8C8" stroke-width="1.1"/>
  <text x="135.0" y="114" text-anchor="middle" font-size="15" fill="currentColor" font-weight="700">b</text>
  <rect x="168" y="76" width="58" height="58" rx="4" fill="none" stroke="#5BA8C8" stroke-width="1.1"/>
  <text x="197.0" y="114" text-anchor="middle" font-size="15" fill="currentColor" font-weight="700">c</text>
  <rect x="44" y="138" width="58" height="58" rx="4" fill="none" stroke="#5BA8C8" stroke-width="1.1"/>
  <text x="73.0" y="176" text-anchor="middle" font-size="15" fill="currentColor" font-weight="700">d</text>
  <rect x="106" y="138" width="58" height="58" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.6"/>
  <text x="135.0" y="176" text-anchor="middle" font-size="15" fill="currentColor" font-weight="700">e</text>
  <rect x="168" y="138" width="58" height="58" rx="4" fill="none" stroke="#5BA8C8" stroke-width="1.1"/>
  <text x="197.0" y="176" text-anchor="middle" font-size="15" fill="currentColor" font-weight="700">f</text>
  <rect x="44" y="200" width="58" height="58" rx="4" fill="none" stroke="#5BA8C8" stroke-width="1.1"/>
  <text x="73.0" y="238" text-anchor="middle" font-size="15" fill="currentColor" font-weight="700">g</text>
  <rect x="106" y="200" width="58" height="58" rx="4" fill="none" stroke="#5BA8C8" stroke-width="1.1"/>
  <text x="135.0" y="238" text-anchor="middle" font-size="15" fill="currentColor" font-weight="700">h</text>
  <rect x="168" y="200" width="58" height="58" rx="4" fill="none" stroke="#5BA8C8" stroke-width="1.1"/>
  <text x="197.0" y="238" text-anchor="middle" font-size="15" fill="currentColor" font-weight="700">i</text>
  <text x="135.0" y="282" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">3 × 3 neighbourhood</text>
  <rect x="266" y="78" width="330" height="111" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="431.0" y="100" text-anchor="middle" font-size="11.5" fill="currentColor">dz/dx = ((c + 2f + i) − (a + 2d + g))</text>
  <text x="431.0" y="119" text-anchor="middle" font-size="11.5" fill="currentColor">        ÷ (8 × cellsize)</text>
  <text x="431.0" y="138" text-anchor="middle" font-size="11.5" fill="currentColor">dz/dy = ((g + 2h + i) − (a + 2b + c))</text>
  <text x="431.0" y="157" text-anchor="middle" font-size="11.5" fill="currentColor">        ÷ (8 × cellsize)</text>
  <text x="431.0" y="176" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">slope = atan(√(dz/dx² + dz/dy²))</text>
  <rect x="620" y="78" width="296" height="92" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="768.0" y="100" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">Same hill, two DEMs</text>
  <text x="768.0" y="119" text-anchor="middle" font-size="11.5" fill="currentColor">30 m cells → 8.4° mean slope</text>
  <text x="768.0" y="138" text-anchor="middle" font-size="11.5" fill="currentColor">10 m cells → 11.2° mean slope</text>
  <text x="768.0" y="157" text-anchor="middle" font-size="11" fill="currentColor">finer cells resolve steeper local relief</text>
  <rect x="620" y="214" width="296" height="73" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="768.0" y="236" text-anchor="middle" font-size="11.5" fill="currentColor">The outer ring has no full 3 × 3</text>
  <text x="768.0" y="255" text-anchor="middle" font-size="11.5" fill="currentColor">neighbourhood — mask it, never</text>
  <text x="768.0" y="274" text-anchor="middle" font-size="11.5" fill="currentColor">extrapolate a border value</text>
  <rect x="44" y="320" width="872" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="480.0" y="341" text-anchor="middle" font-size="11.5" fill="currentColor">Record the DEM resolution beside every slope statistic. A 15% slope limit is not a threshold until the</text>
  <text x="480.0" y="358" text-anchor="middle" font-size="11.5" fill="currentColor">grid it was measured on is named — the same terrain passes on one DEM and fails on another.</text>
</svg>

```python
import logging
from pathlib import Path
from typing import List, Tuple

import numpy as np
import rasterio
from rasterio.windows import Window

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

TARGET_EPSG = 32612          # UTM Zone 12N — must match the irradiance grid
CHUNK_PX = 1024              # memory-safe tile dimension
PLAUSIBLE_ELEV_M = (-430.0, 8849.0)  # Dead Sea floor to Everest — sanity bounds


def validate_and_window_dem(dem_path: Path,
                            target_epsg: int = TARGET_EPSG,
                            chunk_px: int = CHUNK_PX) -> Tuple[dict, List[Window]]:
    """Validate DEM CRS, datum range, and resolution; return metadata + windows."""
    with rasterio.open(dem_path) as src:
        if src.crs is None:
            raise ValueError(f"{dem_path.name}: DEM lacks a defined CRS — assign before processing.")
        if src.crs.is_geographic:
            raise RuntimeError(
                f"{dem_path.name}: geographic CRS {src.crs} detected. Reproject to a metric "
                f"projection (EPSG:{target_epsg}) so horizon arctan runs are true distances."
            )
        if src.crs.to_epsg() != target_epsg:
            raise RuntimeError(
                f"{dem_path.name}: CRS EPSG:{src.crs.to_epsg()} != irradiance grid EPSG:{target_epsg}; "
                f"shadow mask would be misregistered against the resource surface."
            )

        dem = src.read(1, masked=True)
        lo, hi = float(dem.min()), float(dem.max())
        if lo < PLAUSIBLE_ELEV_M[0] or hi > PLAUSIBLE_ELEV_M[1]:
            raise ValueError(
                f"{dem_path.name}: elevation range [{lo:.0f}, {hi:.0f}] m implausible — "
                f"check vertical datum / unit (feet vs metres)."
            )

        windows = [
            Window(col, row,
                   min(chunk_px, src.width - col),
                   min(chunk_px, src.height - row))
            for row in range(0, src.height, chunk_px)
            for col in range(0, src.width, chunk_px)
        ]
        logging.info("%s: %d windows, native res %.1f m, EPSG:%d.",
                     dem_path.name, len(windows), abs(src.res[0]), target_epsg)
        return src.meta.copy(), windows
```

With validation in place, the next function precomputes the time-invariant horizon profile and evaluates the time-varying shadow state. The horizon is sampled along a set of azimuth bearings by marching outward in metric steps and tracking the cumulative maximum elevation angle — the standard "ray-sweep" formulation — and a per-timestamp mask is then a vectorized comparison of solar elevation against the horizon angle for the sun's bearing.

```python
def compute_horizon_profile(elevation_m: np.ndarray,
                            cell_size_m: float,
                            azimuth_deg: float,
                            max_distance_m: float = 5000.0) -> np.ndarray:
    """Time-invariant horizon angle (radians) toward one azimuth, via cumulative-max ray sweep."""
    rows, cols = elevation_m.shape
    horizon = np.zeros((rows, cols), dtype=np.float32)

    # Per-step pixel offsets along the azimuth bearing (0deg = North, clockwise).
    az = np.radians(azimuth_deg)
    step_row = -np.cos(az)   # north is negative row direction
    step_col = np.sin(az)
    n_steps = int(max_distance_m / cell_size_m)

    base_r, base_c = np.mgrid[0:rows, 0:cols]
    for step in range(1, n_steps + 1):
        sample_r = np.round(base_r + step * step_row).astype(int)
        sample_c = np.round(base_c + step * step_col).astype(int)
        inside = (sample_r >= 0) & (sample_r < rows) & (sample_c >= 0) & (sample_c < cols)
        rr = np.clip(sample_r, 0, rows - 1)
        cc = np.clip(sample_c, 0, cols - 1)

        delta_z = elevation_m[rr, cc] - elevation_m       # rise toward the neighbour
        run = step * cell_size_m                          # true metric distance
        angle = np.where(inside, np.arctan2(delta_z, run), 0.0)
        horizon = np.maximum(horizon, angle.astype(np.float32))
    return horizon


def shadow_mask_for_timestamp(horizon_angle_rad: np.ndarray,
                              solar_elevation_deg: float) -> np.ndarray:
    """Binary shadow mask: 1 where the sun sits at/below the local terrain horizon."""
    if solar_elevation_deg <= 0:
        return np.ones_like(horizon_angle_rad, dtype=np.uint8)   # sun below horizon
    solar_elev_rad = np.radians(solar_elevation_deg)
    return (solar_elev_rad <= horizon_angle_rad).astype(np.uint8)
```

The two functions split the cost exactly where it matters: `compute_horizon_profile` runs once per azimuth bin per tile (the expensive sweep), while `shadow_mask_for_timestamp` is a single vectorized comparison cheap enough to call for every hour of a test year.

## Error handling and edge cases

The failure modes named above need explicit, testable guards rather than a blanket `try/except`.

**Geographic CRS or DEM/irradiance mismatch reaching the sweep.** `validate_and_window_dem` already rejects an undefined CRS, a geographic CRS, and an EPSG that disagrees with the irradiance grid. This is the single most important guard, because a misregistered mask produces a plausible-looking but wrong terrain loss. Never let a degree-spaced DEM into the `arctan` horizon step.

**Vertical datum / unit confusion.** A foot-valued DEM tagged as metres, or an ellipsoidal-vs-orthometric splice, slips past a CRS check because the *horizontal* CRS is valid. Guard the vertical axis independently with a physical range test and a slope sanity check:

```python
def assert_vertical_sanity(elevation_m: np.ndarray, cell_size_m: float) -> None:
    """Catch foot/metre and datum-splice errors before they bias horizon angles."""
    gy, gx = np.gradient(elevation_m, cell_size_m)
    max_slope_deg = float(np.degrees(np.arctan(np.hypot(gy, gx).max())))
    if max_slope_deg > 85.0:
        raise ValueError(
            f"Max slope {max_slope_deg:.0f} deg implies a vertical-unit or datum error "
            f"(feet read as metres inflates rise ~3.28x)."
        )
```

**Nodata bleed into the horizon sweep.** Voids in lidar DEMs (water bodies, occlusions) arrive as a sentinel such as `-9999`. Left unmasked, a single void cell injects a spurious cliff that casts a kilometre of false shadow. Replace nodata with `np.nan` before the sweep and treat NaN neighbours as non-occluding:

```python
elevation_m = np.where(elevation_m == src.nodata, np.nan, elevation_m)
# In the sweep, NaN deltas yield NaN angles; np.fmax ignores them:
horizon = np.fmax(horizon, np.nan_to_num(angle, nan=-np.inf))
```

**Edge truncation on tile borders.** A ridge just outside a 1024-px window still shades pixels inside it. Process windows with an overlap halo of `ceil(max_distance_m / cell_size_m)` pixels and crop the halo after the sweep, so shadows cast by off-tile terrain are still captured.

## Performance and scalability

High-resolution DEMs routinely exceed RAM once paired with a multi-temporal solar-position array, so scaling is about bounding memory and overlapping I/O, not buying more of either:

<svg viewBox="0 0 940 404" role="img" aria-label="How a horizon profile is sampled. From the site, rays are cast at a fixed azimuth step — 5 degrees gives 72 rays — and along each ray the DEM is sampled at increasing distance out to a cut-off, usually 20 to 50 kilometres. The horizon angle for that azimuth is the maximum elevation angle found along the ray. The two parameters that decide the answer are the azimuth step, which sets angular resolution, and the cut-off distance, which decides whether a distant ridge is seen at all." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Casting rays: azimuth step and cut-off distance</title>
  <desc>A plan view centred on the site with rays radiating outward every 15 degrees for legibility, annotated as a 5 degree step in practice. Sample points are marked along one highlighted ray at increasing distance. Two range rings mark a 20 kilometre and a 50 kilometre cut-off, with a ridge drawn between them that is invisible at the shorter cut-off. Beside the plan, an elevation-angle profile along the highlighted ray showing the maximum angle found, which becomes the horizon angle for that azimuth.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="404"/>
  <defs><marker id="hz-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">One horizon profile is 72 rays, each sampled to a cut-off</text>
  <circle cx="240" cy="210" r="78" fill="none" stroke="#5BA8C8" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.7"/>
  <circle cx="240" cy="210" r="140" fill="none" stroke="#5BA8C8" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.5"/>
  <text x="296" y="152" text-anchor="middle" font-size="10.5" fill="#2C6E8F">20 km</text>
  <text x="344" y="110" text-anchor="middle" font-size="10.5" fill="#2C6E8F">50 km</text>
  <line x1="240" y1="210" x2="380.0" y2="210.0" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="375.2296156804696" y2="246.23466631435292" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="361.24355652982143" y2="280.0" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="338.99494936611666" y2="308.99494936611666" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="310.0" y2="331.2435565298214" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="276.2346663143529" y2="345.2296156804696" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="240.0" y2="350.0" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="203.7653336856471" y2="345.2296156804696" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="170.00000000000003" y2="331.24355652982143" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="141.00505063388334" y2="308.99494936611666" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="118.75644347017858" y2="280.0" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="104.77038431953045" y2="246.23466631435295" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="100.0" y2="210.00000000000003" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="104.77038431953045" y2="173.76533368564708" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="118.75644347017857" y2="140.00000000000006" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="141.0050506338833" y2="111.0050506338834" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="169.99999999999994" y2="88.75644347017862" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="203.7653336856471" y2="74.77038431953045" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="239.99999999999997" y2="70.0" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="276.23466631435286" y2="74.77038431953042" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="310.0" y2="88.7564434701786" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="338.99494936611666" y2="111.00505063388333" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="361.2435565298214" y2="139.99999999999994" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="375.2296156804695" y2="173.76533368564697" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>
  <line x1="240" y1="210" x2="365.4510134662711" y2="124.17434404395462" stroke="#F4A261" stroke-width="2.4"/>
  <circle cx="264.76006844729034" cy="193.06072579814895" r="3.4" fill="#F4A261" stroke="#F4A261" stroke-width="0.8"/>
  <circle cx="287.8694656647613" cy="177.25073654308795" r="3.4" fill="#F4A261" stroke="#F4A261" stroke-width="0.8"/>
  <circle cx="310.9788628822323" cy="161.44074728802696" r="3.4" fill="#F4A261" stroke="#F4A261" stroke-width="0.8"/>
  <circle cx="334.08826009970335" cy="145.63075803296596" r="3.4" fill="#F4A261" stroke="#F4A261" stroke-width="0.8"/>
  <circle cx="357.19765731717433" cy="129.82076877790496" r="3.4" fill="#F4A261" stroke="#F4A261" stroke-width="0.8"/>
  <path d="M336,94 L364,76 L392,102" fill="none" stroke="#3D8B5F" stroke-width="3"/>
  <text x="368" y="62" text-anchor="middle" font-size="11" fill="#1F5C3A" font-weight="700">ridge at 34 km</text>
  <circle cx="240" cy="210" r="5" fill="currentColor" stroke="currentColor" stroke-width="1"/>
  <text x="240" y="386" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">azimuth step 15° shown · 5° used in practice</text>
  <line x1="470" y1="268" x2="900" y2="268" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="470" y1="90" x2="470" y2="268" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <path d="M470.0,268.0 L521.6,222.8 L573.2,237.9 L624.8,199.2 L676.4,212.1 L762.4,121.8 L814.0,201.3 L900.0,220.7" fill="none" stroke="#F4A261" stroke-width="2.4"/>
  <circle cx="762.4000000000001" cy="121.80000000000001" r="5" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <text x="772.4000000000001" y="111.80000000000001" text-anchor="start" font-size="11.5" fill="#7A4A1A" font-weight="700">horizon angle 6.8° at 34 km</text>
  <line x1="466" y1="268.0" x2="900" y2="268.0" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="460" y="272.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0°</text>
  <line x1="466" y1="182.0" x2="900" y2="182.0" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="460" y="186.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">4°</text>
  <line x1="466" y1="96.0" x2="900" y2="96.0" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="460" y="100.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">8°</text>
  <text x="470.0" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0 km</text>
  <text x="642.0" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">20 km</text>
  <text x="762.4000000000001" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">34 km</text>
  <text x="900.0" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">50 km</text>
  <text x="470" y="80" text-anchor="start" font-size="11" fill="currentColor" opacity="0.8">elevation angle along the highlighted ray</text>
  <rect x="470" y="306" width="430" height="48" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="685.0" y="327" text-anchor="middle" font-size="11.5" fill="currentColor">A 20 km cut-off never sees the 34 km ridge</text>
  <text x="685.0" y="344" text-anchor="middle" font-size="11.5" fill="currentColor">and under-reports winter shading</text>
  <rect x="30" y="306" width="420" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="240.0" y="327" text-anchor="middle" font-size="11.5" fill="currentColor">72 rays × 500 samples = 36 000 DEM reads</text>
  <text x="240.0" y="344" text-anchor="middle" font-size="11.5" fill="currentColor">per site — window the DEM once, not per ray</text>
</svg>

- **Profile once, evaluate many.** Cache the per-azimuth horizon profile per tile; quantise the sun's azimuth to a fixed set of bins (e.g. 1° or 2°) and reuse the nearest cached profile across every timestamp. This is the change that turns an intractable $O(N \times T \times R)$ sweep into a tractable one.
- **Windowed reads, tiled writes, overlap halo.** Read with `rasterio` windows, write tiled LZW-compressed output, and carry the halo above so cross-tile shadows survive chunking. Peak memory then scales with one tile plus its halo, not the whole DEM.
- **Async over tiles, threads within a sweep.** Coarse concurrency belongs at the tile level via `asyncio` and a semaphore; the same async pattern used in [wind speed and direction modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/) for independent temporal slices applies here, with each coroutine owning one DEM window so disk latency overlaps across cores.
- **GDAL cache tuning.** Set `GDAL_CACHEMAX` (e.g. `512`) to bound the block cache during batch runs; a runaway cache, not the elevation data, is the usual cause of memory exhaustion.
- **Store fractional, not just binary, masks.** Aggregating hourly binary masks to a `float32` mean per cell yields a fractional shaded-time surface that modulates the direct beam smoothly. Once aligned, these surfaces feed straight into [temporal data aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) for monthly and seasonal terrain-loss reduction.

The async orchestration below dispatches one coroutine per DEM window, computes the temporal shadow stack, and streams a fractional shaded-time tile to disk.

```python
import asyncio
from concurrent.futures import ThreadPoolExecutor


async def run_async_shadow_pipeline(dem_path: Path,
                                    windows: List[Window],
                                    timestamps,                 # iterable of (azimuth_deg, elev_deg)
                                    out_dir: Path,
                                    max_concurrency: int = 3) -> None:
    """Cast shadows tile-by-tile, overlapping disk I/O with the CPU-bound sweep."""
    out_dir.mkdir(parents=True, exist_ok=True)
    loop = asyncio.get_running_loop()
    semaphore = asyncio.Semaphore(max_concurrency)

    def _process(window: Window, idx: int) -> None:
        with rasterio.open(dem_path) as src:
            elevation_m = src.read(1, window=window).astype(np.float32)
            elevation_m = np.where(elevation_m == src.nodata, np.nan, elevation_m)
            transform = src.window_transform(window)
            cell_size_m = abs(src.res[0])

        accum = np.zeros(elevation_m.shape, dtype=np.float32)
        cache: dict = {}
        for az_deg, elev_deg in timestamps:
            az_bin = round(az_deg)                       # 1-degree azimuth cache key
            if az_bin not in cache:
                cache[az_bin] = compute_horizon_profile(elevation_m, cell_size_m, az_bin)
            accum += shadow_mask_for_timestamp(cache[az_bin], elev_deg)
        shaded_fraction = (accum / max(len(list(timestamps)), 1)).astype(np.float32)

        with rasterio.open(out_dir / f"shaded_{idx}.tif", "w", driver="GTiff",
                           height=window.height, width=window.width, count=1,
                           dtype="float32", crs=f"EPSG:{TARGET_EPSG}", transform=transform,
                           nodata=np.nan, tiled=True, blockxsize=256, blockysize=256,
                           compress="lzw") as dst:
            dst.write(shaded_fraction, 1)

    async def _bounded(window: Window, idx: int) -> None:
        async with semaphore:
            with ThreadPoolExecutor(max_workers=1) as ex:
                await loop.run_in_executor(ex, _process, window, idx)

    await asyncio.gather(*(_bounded(w, i) for i, w in enumerate(windows)))
```

## Validation and audit trail

A terrain-loss figure is only bankable if its integrity is asserted automatically and its provenance is embedded. Every output should pass a post-processing gate suitable for a CI/CD pipeline: CRS and pixel-alignment verification against the irradiance grid, value-range checks on the fractional mask, and embedded solar-geometry and DEM-source metadata.

```python
def assert_shadow_integrity(shaded_path: Path,
                            target_epsg: int = TARGET_EPSG) -> None:
    """CI/CD gate: fail the build if a shadow surface is non-compliant."""
    with rasterio.open(shaded_path) as out:
        assert out.crs.to_epsg() == target_epsg, "Shadow mask CRS not aligned to irradiance grid."
        assert out.dtypes[0] == "float32", "Unexpected dtype; expected float32 fractional mask."
        frac = out.read(1, masked=True)
        assert frac.count() > 0, "No valid pixels — possible disjoint extent or all-nodata tile."
        assert 0.0 <= float(np.ma.min(frac)) and float(np.ma.max(frac)) <= 1.0, \
            "Fractional shaded time outside [0, 1] — aggregation or nodata defect."
    with rasterio.open(shaded_path, "r+") as out:
        out.update_tags(
            DEM_SOURCE="USGS 3DEP lidar DTM",
            VERTICAL_DATUM="NAVD88",
            SOLAR_MODEL="pvlib.solarposition",
            HORIZON_MAX_DIST_M="5000",
            CRS_EPSG=str(target_epsg),
            QA_STATUS="passed",
        )
```

Pixel alignment is the non-negotiable invariant: a shadow mask is only meaningful when it multiplies the *same* pixels of the irradiance surface it was built to dim. Enforce an explicit tolerance — for example ±0.5 m for UTM-projected assets — and log the DEM-to-irradiance affine residual so the terrain loss is auditable for regulatory submission and project-finance due diligence. Embedding the DEM source, vertical datum, solar model, and horizon search radius via `update_tags` keeps the lineage attached to the file rather than to a notebook that will not survive the project. With alignment proven and provenance written, these surfaces become unified terrain-constraint layers — combining shadow loss with the slope and aspect derivatives detailed in [Automating hillshade and slope analysis for wind turbine siting](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/automating-hillshade-and-slope-analysis-for-wind-turbine-siting/) — that feed layout optimization and the proximity screens in [grid capacity buffer analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/). For windowed raster I/O specifics, consult the [Rasterio documentation on windowed reading and writing](https://rasterio.readthedocs.io/en/stable/topics/windowed-rw.html); for the async orchestration, the [asyncio task scheduling guide](https://docs.python.org/3/library/asyncio.html).

## Related

- [Solar & Wind Resource Modeling Workflows](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/) — the parent pipeline this terrain-correction stage feeds.
- [Automating Hillshade and Slope Analysis for Wind Turbine Siting](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/automating-hillshade-and-slope-analysis-for-wind-turbine-siting/) — the slope/aspect derivatives that combine with shadow loss into terrain-constraint layers.
- [Solar Irradiance Raster Processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) — the irradiance grid that shadow masks must align to pixel-for-pixel.
- [Wind Speed & Direction Modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/) — shares the async windowed-evaluation pattern for terrain-aware wind fields.
- [Temporal Data Aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) — reducing hourly shadow stacks to monthly and seasonal terrain-loss statistics.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — the projection and datum foundations this stage enforces.
