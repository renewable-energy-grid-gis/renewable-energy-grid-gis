---
title: Wind Speed & Direction Modeling
description: A production Python workflow for wind speed and direction modeling — U/V vector decomposition to escape the 0°/360° interpolation discontinuity, projected-CRS enforcement, chunked grid interpolation, power-law hub-height scaling, and audit-ready GeoTIFF output.
slug: wind-speed-direction-modeling
type: guide
breadcrumb: Wind Speed & Direction Modeling
datePublished: 2025-09-18
dateModified: 2026-06-26
---

# Wind Speed & Direction Modeling

Wind speed and direction modeling sits at the analytical core of the [Solar & Wind Resource Modeling Workflows](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/) pipeline, and it fails in a way that scalar resource modeling never does. The specific failure mode this workflow exists to eliminate is the **0°/360° directional discontinuity**: wind direction is a circular quantity, so interpolating bearings directly — averaging a 350° reading with a 10° reading and getting 180° instead of 0° — produces a vector field that points the wrong way across half the domain. A naive script does not raise an error. It returns a smooth-looking raster of completely wrong directions, the wind rose rotates, the wake model places turbine deficits in the wrong cells, and the energy yield that a lender treats as ground truth inherits a systematic bias no downstream step can detect.

Two further failure modes compound the first. Distance-based interpolation run in geographic coordinates (EPSG:4326) weights stations by degrees rather than metres, so a kilometre of east-west separation at 50° latitude counts for roughly two-thirds of the same distance north-south — the field is stretched before a single physical calculation runs. And the regular grids that bankable wind atlases demand are large enough that an unchunked `scipy` interpolation call materializes the full coordinate stack in RAM and triggers the out-of-memory reaper precisely on the continental runs that matter. This page builds a deterministic workflow that turns raw anemometer, mast, and LiDAR observations into an analysis-ready hub-height wind field: vectors are decomposed into orthogonal components before any interpolation, every input is forced into a projected metric frame, the grid is filled in bounded memory chunks, speeds are scaled to turbine hub height with an explicit shear law, and every output band carries the provenance an interconnection or project-finance review needs.

## Why naive directional interpolation fails

Wind is a vector, but most station feeds report it as two scalars: a speed `wind_speed_ms` and a meteorological bearing `wind_dir_deg` measured clockwise from north as the direction the wind blows *from*. The temptation is to interpolate those two scalars independently onto the target grid. Speed interpolates cleanly because it is a true magnitude. Direction does not, because the number line wraps: 359° and 1° are two degrees apart physically but 358 degrees apart numerically. Any interpolator that treats bearing as an ordinary real number — linear, nearest-neighbour, kriging, or IDW — produces a spurious gradient wherever the field crosses north, and that boundary almost always runs straight through the prevailing-wind sector of a real site.

The fix is to decompose each observation into orthogonal **U** (west-to-east) and **V** (south-to-north) components, interpolate each component independently as an ordinary continuous field, and reconstruct speed and direction from the gridded components. Using the meteorological *from*-convention the components are:

$$ u = -V \sin\theta \qquad v = -V \cos\theta $$

and the inverse reconstruction, with the four-quadrant arctangent and a wrap into the `[0, 360)` range, is:

$$ V = \sqrt{u^2 + v^2} \qquad \theta = \left(270 - \tfrac{180}{\pi}\,\operatorname{atan2}(v, u)\right) \bmod 360 $$

Because `atan2` consumes the signed `u` and `v` directly, the discontinuity never enters the arithmetic — the wrap is applied once, at the very end, on the reconstructed bearing rather than on every interpolation weight. This is the same vector-first discipline that the child workflow on [calculating wind shear coefficients with Python](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/calculating-wind-shear-coefficients-with-python/) applies to the vertical profile.

<svg viewBox="0 0 960 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Comparison of two ways to interpolate wind bearings of 350 degrees and 10 degrees. Averaging the bearings as plain numbers gives 180 degrees, a vector pointing south, which is wrong. Decomposing each reading into U and V components, interpolating those separately, then reconstructing with atan2 gives 0 degrees, pointing north, which is correct." style="width:100%;max-width:960px;height:auto;font-family:inherit;">
  <rect class="svg-bg" x="0" y="0" width="960" height="360"/>
  <title>Why bearings must be decomposed before interpolation</title>
  <desc>Two side-by-side panels each take the same two wind directions, 350 degrees and 10 degrees, which lie two degrees apart around north. The left panel takes the scalar mean of the bearings and gets 180 degrees, a compass arrow pointing south, labelled wrong because the number line wraps at 360. The right panel decomposes each reading into orthogonal U and V components, interpolates the two components independently, then reconstructs the bearing with atan2 and gets 0 degrees, a compass arrow pointing north, labelled correct because the wrap never enters the arithmetic.</desc>
  <defs>
    <marker id="wd-cmp-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="960" height="360" fill="none"/>
  <!-- LEFT PANEL: naive -->
  <rect x="12" y="12" width="456" height="336" rx="9" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.85"/>
  <text x="34" y="42" font-size="14" fill="currentColor" font-weight="700">Naive — interpolate the bearings</text>
  <rect x="360" y="24" width="90" height="26" rx="13" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-width="1"/>
  <text x="405" y="41" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700" letter-spacing="0.05em">WRONG</text>
  <rect x="34" y="62" width="180" height="42" rx="7" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <text x="124" y="80" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.8">Reading A</text>
  <text x="124" y="96" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">350°</text>
  <rect x="266" y="62" width="180" height="42" rx="7" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <text x="356" y="80" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.8">Reading B</text>
  <text x="356" y="96" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">10°</text>
  <path d="M124,104 L210,128" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#wd-cmp-arr)"/>
  <path d="M356,104 L270,128" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#wd-cmp-arr)"/>
  <rect x="120" y="132" width="240" height="40" rx="7" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <text x="240" y="157" text-anchor="middle" font-size="12.5" fill="currentColor">scalar mean of bearings</text>
  <path d="M240,172 L240,196" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#wd-cmp-arr)"/>
  <text x="240" y="216" text-anchor="middle" font-size="17" fill="currentColor" font-weight="700">(350 + 10) / 2 = 180°</text>
  <text x="240" y="236" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.75">number line wraps across 0° / 360°</text>
  <!-- compass: arrow south -->
  <circle cx="240" cy="300" r="40" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <text x="240" y="268" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">N</text>
  <line x1="240" y1="300" x2="240" y2="336" stroke="currentColor" stroke-width="2.4" marker-end="url(#wd-cmp-arr)"/>
  <text x="316" y="304" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">points South</text>
  <!-- RIGHT PANEL: correct -->
  <rect x="492" y="12" width="456" height="336" rx="9" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="514" y="42" font-size="14" fill="currentColor" font-weight="700">Correct — decompose to U / V first</text>
  <rect x="838" y="24" width="92" height="26" rx="13" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-width="1.5"/>
  <text x="884" y="41" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700" letter-spacing="0.05em">CORRECT</text>
  <rect x="514" y="62" width="180" height="42" rx="7" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <text x="604" y="80" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.8">350° → u, v</text>
  <text x="604" y="96" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">u=−V·sinθ, v=−V·cosθ</text>
  <rect x="746" y="62" width="180" height="42" rx="7" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <text x="836" y="80" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.8">10° → u, v</text>
  <text x="836" y="96" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">u=−V·sinθ, v=−V·cosθ</text>
  <path d="M604,104 L690,128" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#wd-cmp-arr)"/>
  <path d="M836,104 L750,128" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#wd-cmp-arr)"/>
  <rect x="600" y="132" width="240" height="40" rx="7" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <text x="720" y="157" text-anchor="middle" font-size="12.5" fill="currentColor">interpolate u and v separately</text>
  <path d="M720,172 L720,196" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#wd-cmp-arr)"/>
  <text x="720" y="216" text-anchor="middle" font-size="17" fill="currentColor" font-weight="700">atan2(v, u) → 0°</text>
  <text x="720" y="236" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.75">wrap applied once, at the end only</text>
  <!-- compass: arrow north -->
  <circle cx="720" cy="300" r="40" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <text x="720" y="356" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">S</text>
  <line x1="720" y1="300" x2="720" y2="264" stroke="currentColor" stroke-width="2.4" marker-end="url(#wd-cmp-arr)"/>
  <text x="796" y="304" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">points North</text>
</svg>

## Prerequisites & data requirements

This workflow assumes a tabular station inventory and a projected analysis grid. Concretely:

- **Inputs:** a CSV or Parquet table of meteorological stations carrying `station_id`, `latitude`, `longitude`, `wind_speed_ms`, and `wind_dir_deg`. Sourcing these from versioned, machine-readable [open energy data portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/) keeps provenance and licensing explicit when the same artifacts later feed a permitting submission.
- **Coordinate frames:** stations arrive in geographic coordinates (EPSG:4326). All interpolation runs in a projected metric frame — a UTM zone such as EPSG:32612 (UTM Zone 12N) or a regional Albers — chosen so that distances are preserved. Picking the right projection is the subject of [coordinate reference systems for energy projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/); for wind layout work a conformal UTM zone preserves the local angles that direction and terrain channeling depend on.
- **Geometry hygiene:** invalid or out-of-range records must be quarantined before interpolation, applying the same [spatial data quality validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) gates the rest of the pipeline relies on.
- **Library versions:** `geopandas` ≥ 0.14, `pyproj` ≥ 3.6, `scipy` ≥ 1.11, and `rasterio` ≥ 1.3. Pin them, because `scipy.interpolate` and `rasterio` occasionally change default behaviour across releases.

## CRS harmonization & station ingestion

Spatial interpolation degrades rapidly when distances are computed in degrees. The first step standardizes every input into the target projected CRS and rejects records that would poison the field — negative speeds, bearings outside `[0, 360]`, coordinates off the globe — before any geometry is constructed. The ingest gate is the cheapest place to catch these errors.

```python
import geopandas as gpd
import pandas as pd
import numpy as np
import logging
from pathlib import Path
from pyproj import CRS

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

def prepare_station_gdf(csv_path: str | Path, target_epsg: int = 32612) -> gpd.GeoDataFrame:
    """
    Ingest a wind station CSV, validate coordinates and observations, and
    transform to a projected metric CRS. Filtering runs before geometry
    construction to keep the memory footprint flat on large station feeds.
    """
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"Station data not found: {path}")

    df = pd.read_csv(path, dtype={"station_id": str})
    required_cols = {"station_id", "latitude", "longitude", "wind_speed_ms", "wind_dir_deg"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    # Spatial + physical validation: drop records that would corrupt the field
    valid_mask = (
        df["latitude"].between(-90, 90) &
        df["longitude"].between(-180, 180) &
        df["wind_speed_ms"].ge(0) &
        df["wind_dir_deg"].between(0, 360)
    )
    dropped = int((~valid_mask).sum())
    df = df.loc[valid_mask].copy()
    logging.info(f"Retained {len(df)} stations; quarantined {dropped} invalid records.")

    station_gdf = gpd.GeoDataFrame(
        df,
        geometry=gpd.points_from_xy(df.longitude, df.latitude),
        crs=CRS.from_epsg(4326),
    )
    station_proj = station_gdf.to_crs(epsg=target_epsg)
    logging.info(f"Transformed to EPSG:{target_epsg} | bounds: {station_proj.total_bounds}")
    return station_proj
```

The `to_crs` call is explicit and logged — never an implicit on-the-fly reprojection buried inside an analysis routine — so the EPSG decision that governs every later distance is recoverable from the run log.

## Core implementation: vectorized U/V interpolation

With clean, projected stations in hand, the happy-path workflow decomposes the vectors, interpolates each component onto a regular grid, and returns the gridded U and V arrays plus the affine metadata that downstream rasterization needs. Direction never touches the interpolator; only its sine and cosine projections do.

```python
import rasterio
from scipy.interpolate import griddata
from typing import Tuple

def decompose_and_interpolate(
    station_gdf: gpd.GeoDataFrame,
    grid_res_m: float = 100.0,
    method: str = "linear",
    chunk_size: int = 10_000,
) -> Tuple[np.ndarray, np.ndarray, dict]:
    """
    Decompose wind vectors into U/V, interpolate each component onto a regular
    grid, and return the gridded components plus raster metadata. Avoids the
    0/360 discontinuity by interpolating components, never bearings.
    """
    coords = np.column_stack((station_gdf.geometry.x, station_gdf.geometry.y))
    speeds = station_gdf["wind_speed_ms"].to_numpy(dtype="float64")
    dirs_rad = np.deg2rad(station_gdf["wind_dir_deg"].to_numpy(dtype="float64"))

    # Vector decomposition (meteorological "from" convention)
    u = -speeds * np.sin(dirs_rad)
    v = -speeds * np.cos(dirs_rad)

    # Regular grid spanning the station bounds at the requested resolution
    minx, miny, maxx, maxy = station_gdf.total_bounds
    cols = int(np.ceil((maxx - minx) / grid_res_m))
    rows = int(np.ceil((maxy - miny) / grid_res_m))
    xi = np.linspace(minx, maxx, cols)
    yi = np.linspace(miny, maxy, rows)
    grid_x, grid_y = np.meshgrid(xi, yi)

    # Chunked interpolation: fill the grid in bounded blocks so a continental
    # domain never materializes the full coordinate stack in RAM at once.
    u_grid = np.full(grid_x.shape, np.nan, dtype="float32")
    v_grid = np.full(grid_x.shape, np.nan, dtype="float32")
    flat = np.column_stack((grid_x.ravel(), grid_y.ravel()))
    for i in range(0, len(flat), chunk_size):
        block = flat[i:i + chunk_size]
        u_grid.ravel()[i:i + chunk_size] = griddata(coords, u, block, method=method)
        v_grid.ravel()[i:i + chunk_size] = griddata(coords, v, block, method=method)

    metadata = {
        "transform": rasterio.transform.from_origin(minx, maxy, grid_res_m, grid_res_m),
        "crs": station_gdf.crs,
        "shape": (rows, cols),
        "bounds": (minx, miny, maxx, maxy),
        "grid_res_m": grid_res_m,
    }
    return u_grid, v_grid, metadata


def reconstruct_speed_direction(
    u_grid: np.ndarray, v_grid: np.ndarray
) -> Tuple[np.ndarray, np.ndarray]:
    """Rebuild scalar speed and meteorological bearing from gridded components."""
    speed = np.hypot(u_grid, v_grid)                       # sqrt(u^2 + v^2)
    bearing = (270.0 - np.degrees(np.arctan2(v_grid, u_grid))) % 360.0
    return speed.astype("float32"), bearing.astype("float32")
```

Keeping the working dtype at `float32` halves memory versus `float64` with negligible loss for a wind field, and `np.hypot` avoids the intermediate overflow that a literal `sqrt(u**2 + v**2)` can hit on extreme gusts.

## Hub-height extrapolation & wind shear

Turbine hub heights routinely exceed the mast or LiDAR measurement elevation, so the gridded components must be scaled vertically. The power-law profile relates speed at height $z$ to the reference speed via the shear exponent $\alpha$:

<svg viewBox="0 0 940 404" role="img" aria-label="A Weibull distribution with shape 2.1 and scale 8.4 metres per second has a mean speed of 7.44 metres per second, but wind power scales with the cube of speed, so the energy-weighted distribution peaks near 11 metres per second. Half the annual energy arrives in hours above 9.6 metres per second, which occupy only 29 percent of the year. A resource summary reported as a mean speed hides where the energy actually comes from." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Frequency peaks near 6 m/s; energy peaks near 11 m/s</title>
  <desc>Two curves over a wind speed axis from 0 to 25 metres per second. The first is the Weibull frequency distribution with shape 2.1 and scale 8.4, peaking near 6 metres per second. The second is the same distribution weighted by the cube of speed — the energy contribution — which peaks near 11 metres per second and has a long right tail. The mean speed of 7.44 metres per second is marked on both. A shaded region above 9.6 metres per second is annotated as 29 percent of the hours and half the annual energy.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="404"/>
  <defs><marker id="wb-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Weibull k = 2.1, c = 8.4 m/s — frequency against energy</text>
  <line x1="90" y1="280" x2="880" y2="280" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="90" y1="68" x2="90" y2="280" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="90.0" y1="280" x2="90.0" y2="285" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="90.0" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0</text>
  <line x1="248.0" y1="280" x2="248.0" y2="285" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="248.0" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">5</text>
  <line x1="406.0" y1="280" x2="406.0" y2="285" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="406.0" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">10</text>
  <line x1="564.0" y1="280" x2="564.0" y2="285" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="564.0" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">15</text>
  <line x1="722.0" y1="280" x2="722.0" y2="285" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="722.0" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">20</text>
  <line x1="880.0" y1="280" x2="880.0" y2="285" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="880.0" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">25</text>
  <text x="880" y="322" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.8">wind speed at hub height, m/s</text>
  <rect x="393.36" y="68" width="486.64" height="212" rx="0" fill="#FFE3BE" opacity="0.4"/>
  <text x="627.2" y="86" text-anchor="middle" font-size="11.5" fill="#7A4A1A" font-weight="700">29% of hours · 50% of annual energy</text>
  <path d="M97.9,269.8 L105.8,258.1 L113.7,246.0 L121.6,233.6 L129.5,221.1 L137.4,208.6 L145.3,196.2 L153.2,184.1 L161.1,172.4 L169.0,161.0 L176.9,150.1 L184.8,139.8 L192.7,130.1 L200.6,121.1 L208.5,112.7 L216.4,105.2 L224.3,98.4 L232.2,92.4 L240.1,87.2 L248.0,82.9 L255.9,79.5 L263.8,76.9 L271.7,75.1 L279.6,74.2 L287.5,74.0 L295.4,74.6 L303.3,76.0 L311.2,78.0 L319.1,80.7 L327.0,84.1 L334.9,88.0 L342.8,92.4 L350.7,97.3 L358.6,102.6 L366.5,108.3 L374.4,114.2 L382.3,120.5 L390.2,126.9 L398.1,133.5 L406.0,140.2 L413.9,147.0 L421.8,153.7 L429.7,160.5 L437.6,167.2 L445.5,173.8 L453.4,180.3 L461.3,186.7 L469.2,192.8 L477.1,198.8 L485.0,204.5 L492.9,210.1 L500.8,215.4 L508.7,220.4 L516.6,225.2 L524.5,229.7 L532.4,234.0 L540.3,238.0 L548.2,241.7 L556.1,245.3 L564.0,248.5 L571.9,251.6 L579.8,254.4 L587.7,256.9 L595.6,259.3 L603.5,261.5 L611.4,263.5 L619.3,265.3 L627.2,266.9 L635.1,268.4 L643.0,269.8 L650.9,271.0 L658.8,272.0 L666.7,273.0 L674.6,273.9 L682.5,274.7 L690.4,275.3 L698.3,276.0 L706.2,276.5 L714.1,277.0 L722.0,277.4 L729.9,277.7 L737.8,278.1 L745.7,278.3 L753.6,278.6 L761.5,278.8 L769.4,279.0 L777.3,279.1 L785.2,279.3 L793.1,279.4 L801.0,279.5 L808.9,279.6 L816.8,279.6 L824.7,279.7 L832.6,279.7 L840.5,279.8 L848.4,279.8 L856.3,279.9 L864.2,279.9 L872.1,279.9 L880.0,279.9" fill="none" stroke="#5BA8C8" stroke-width="2.6"/>
  <path d="M97.9,280.0 L105.8,280.0 L113.7,280.0 L121.6,279.9 L129.5,279.8 L137.4,279.7 L145.3,279.4 L153.2,279.0 L161.1,278.3 L169.0,277.5 L176.9,276.3 L184.8,274.9 L192.7,273.0 L200.6,270.7 L208.5,268.0 L216.4,264.8 L224.3,261.1 L232.2,256.8 L240.1,251.9 L248.0,246.5 L255.9,240.6 L263.8,234.1 L271.7,227.1 L279.6,219.6 L287.5,211.7 L295.4,203.4 L303.3,194.7 L311.2,185.9 L319.1,176.8 L327.0,167.7 L334.9,158.6 L342.8,149.5 L350.7,140.6 L358.6,132.0 L366.5,123.7 L374.4,115.8 L382.3,108.4 L390.2,101.6 L398.1,95.5 L406.0,90.0 L413.9,85.3 L421.8,81.4 L429.7,78.3 L437.6,76.0 L445.5,74.6 L453.4,74.0 L461.3,74.2 L469.2,75.3 L477.1,77.1 L485.0,79.7 L492.9,83.0 L500.8,87.0 L508.7,91.6 L516.6,96.7 L524.5,102.4 L532.4,108.4 L540.3,114.8 L548.2,121.6 L556.1,128.5 L564.0,135.7 L571.9,142.9 L579.8,150.2 L587.7,157.6 L595.6,164.8 L603.5,172.0 L611.4,179.1 L619.3,186.0 L627.2,192.7 L635.1,199.2 L643.0,205.4 L650.9,211.3 L658.8,217.0 L666.7,222.4 L674.6,227.4 L682.5,232.2 L690.4,236.7 L698.3,240.8 L706.2,244.7 L714.1,248.3 L722.0,251.5 L729.9,254.6 L737.8,257.3 L745.7,259.9 L753.6,262.2 L761.5,264.2 L769.4,266.1 L777.3,267.8 L785.2,269.3 L793.1,270.7 L801.0,271.9 L808.9,272.9 L816.8,273.9 L824.7,274.7 L832.6,275.4 L840.5,276.1 L848.4,276.6 L856.3,277.1 L864.2,277.6 L872.1,277.9 L880.0,278.2" fill="none" stroke="#3D8B5F" stroke-width="2.6"/>
  <line x1="325.09851287995144" y1="104" x2="325.09851287995144" y2="280" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 4" opacity="0.7"/>
  <text x="317.09851287995144" y="120" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">mean 7.44 m/s</text>
  <rect x="90" y="314" width="16" height="12" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="114" y="325" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">frequency — hours at each speed</text>
  <rect x="420" y="314" width="16" height="12" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="444" y="325" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">energy contribution — frequency × v³</text>
  <rect x="90" y="342" width="790" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="485.0" y="363" text-anchor="middle" font-size="11.5" fill="currentColor">Two sites with the same 7.4 m/s mean can differ by 20% in annual energy if their shape parameters</text>
  <text x="485.0" y="380" text-anchor="middle" font-size="11.5" fill="currentColor">differ — which is why the distribution, not the mean, is what a resource assessment reports.</text>
</svg>

$$ v(z) = v_{\text{ref}} \left(\frac{z}{z_{\text{ref}}}\right)^{\alpha} $$

Because $u$ and $v$ scale linearly with speed, the same ratio applies to both components, so the field can be scaled by broadcasting a single scalar across the grid. The exponent itself varies with terrain roughness and atmospheric stability; deriving a defensible, site-specific $\alpha$ rather than assuming the open-terrain default of 0.143 is the subject of the companion workflow on [calculating wind shear coefficients with Python](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/calculating-wind-shear-coefficients-with-python/).

```python
def apply_hub_height_scaling(
    u_grid: np.ndarray,
    v_grid: np.ndarray,
    alpha: float = 0.143,
    meas_height_m: float = 50.0,
    hub_height_m: float = 100.0,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Apply the power-law shear ratio to U/V grids. NaN cells (outside the
    convex hull of the stations) are preserved as nodata, not scaled.
    """
    if not 0.0 <= alpha <= 0.5:
        logging.warning("Shear exponent %.3f outside typical [0.0, 0.5]; verify site.", alpha)

    ratio = (hub_height_m / meas_height_m) ** alpha
    u_scaled = np.where(np.isnan(u_grid), np.nan, u_grid * ratio).astype("float32")
    v_scaled = np.where(np.isnan(v_grid), np.nan, v_grid * ratio).astype("float32")
    return u_scaled, v_scaled
```

Local topographic acceleration and flow channeling are not captured by a uniform shear ratio; correcting for them means debiting the field with the slope and aspect masks produced by [terrain and shadow analysis pipelines](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/) before the field is treated as final.

## Error handling & edge cases

The three failure modes named in the problem framing each need an explicit guard rather than a hopeful assumption.

**1. Directional discontinuity leaking back in.** The decomposition only protects the field if *nothing downstream* re-interpolates the reconstructed bearing. Guard against accidental scalar handling by asserting that any directional aggregation goes through the components:

```python
def circular_mean_deg(dirs_deg: np.ndarray) -> float:
    """Correct mean bearing via unit-vector averaging — never a scalar mean()."""
    rad = np.deg2rad(dirs_deg)
    s, c = np.nanmean(np.sin(rad)), np.nanmean(np.cos(rad))
    if np.hypot(s, c) < 1e-9:
        return float("nan")          # directionless: cancelling vectors
    return float((np.degrees(np.arctan2(s, c))) % 360.0)
```

**2. CRS mismatch or a geographic grid.** If the station GeoDataFrame is still in EPSG:4326 when it reaches the interpolator, every distance weight is wrong. Fail loudly instead of producing a stretched field:

```python
def assert_projected(station_gdf: gpd.GeoDataFrame) -> None:
    crs = station_gdf.crs
    if crs is None:
        raise ValueError("Station CRS is undefined; refuse to interpolate.")
    if crs.is_geographic:
        raise ValueError(
            f"Interpolation requires a projected CRS; got geographic {crs.to_epsg()}. "
            "Reproject to a UTM zone (e.g. EPSG:32612) first."
        )
```

**3. Sparse stations and empty grids.** When too few stations survive the ingest gate, `griddata` returns an all-NaN grid for `method="linear"` (which only fills the convex hull). Detect the degenerate case and either fall back to `nearest` for the extrapolation margin or abort with a clear message:

```python
def guard_station_density(station_gdf: gpd.GeoDataFrame, min_stations: int = 4) -> None:
    if len(station_gdf) < min_stations:
        raise ValueError(
            f"Only {len(station_gdf)} valid stations; need ≥ {min_stations} for a "
            "defensible linear interpolation. Widen the catchment or use nearest."
        )
```

## Performance & scalability: async rasterization

For a continental wind atlas the interpolation is CPU-bound and the serialization is I/O-bound, and the two should not block each other. The chunked grid fill already bounds interpolation memory; the write side benefits from offloading the GeoTIFF serialization so the event loop stays responsive during large tiled writes. Note that a `rasterio` `DatasetWriter` is not safe to share across threads — the entire write loop is offloaded to a single executor thread rather than fanning blocks across a pool.

```python
import asyncio
from concurrent.futures import ThreadPoolExecutor
from rasterio.windows import Window

async def write_wind_raster_async(
    u_grid: np.ndarray,
    v_grid: np.ndarray,
    metadata: dict,
    output_path: str | Path,
    block_size: int = 512,
) -> None:
    """Write U/V bands to a single tiled, compressed GeoTIFF off the event loop."""
    out_path = Path(output_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if not np.isfinite(u_grid).any() or not np.isfinite(v_grid).any():
        raise ValueError("Grid has no valid cells; check station density and bounds.")

    profile = {
        "driver": "GTiff",
        "dtype": "float32",
        "count": 2,
        "width": metadata["shape"][1],
        "height": metadata["shape"][0],
        "crs": metadata["crs"],
        "transform": metadata["transform"],
        "compress": "deflate",
        "nodata": np.nan,
        "blockxsize": block_size,
        "blockysize": block_size,
        "tiled": True,
    }

    def _write() -> None:
        with rasterio.open(out_path, "w", **profile) as dst:
            dst.set_band_description(1, "wind_speed_u_ms")
            dst.set_band_description(2, "wind_speed_v_ms")
            for row in range(0, profile["height"], block_size):
                for col in range(0, profile["width"], block_size):
                    win = Window(col, row,
                                 min(block_size, profile["width"] - col),
                                 min(block_size, profile["height"] - row))
                    u_block = u_grid[win.row_off:win.row_off + win.height,
                                     win.col_off:win.col_off + win.width]
                    v_block = v_grid[win.row_off:win.row_off + win.height,
                                     win.col_off:win.col_off + win.width]
                    dst.write(np.stack([u_block, v_block]), indexes=[1, 2], window=win)

    loop = asyncio.get_running_loop()
    with ThreadPoolExecutor(max_workers=1) as executor:
        await loop.run_in_executor(executor, _write)
    logging.info("Async rasterization complete: %s", out_path)
```

Beyond a single grid, the usual scaling levers apply: align `block_size` with the GeoTIFF tile dimensions to avoid re-blocking on read, raise `GDAL_CACHEMAX` for write-heavy runs, and for very large domains build per-tile interpolations behind a VRT rather than one monolithic array. Most bottlenecks here come from a redundant reprojection inside a loop or an unchunked grid fill — profile before reaching for a bigger machine.

<svg viewBox="0 0 980 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The wind-field pipeline runs left to right through six stages: ingest a station CSV, validate and reproject through the CRS gate, decompose vectors into U and V components, interpolate each component in bounded chunks, scale to hub height with the power-law shear ratio, and write a tiled GeoTIFF. A downward branch off the interpolation stage routes a degenerate, all-NaN or sparse-station grid to an abort node so a corrupt field is never written." style="width:100%;max-width:980px;height:auto;font-family:inherit;">
  <rect class="svg-bg" x="0" y="0" width="980" height="300"/>
  <title>Wind Speed and Direction Modeling Pipeline</title>
  <desc>A six-stage left-to-right data flow. Stage 1 ingests a station CSV or Parquet table of anemometer, mast and LiDAR observations. Stage 2 is the CRS gate, which validates records and reprojects from EPSG:4326 to a metric frame such as EPSG:32612. Stage 3 decomposes each vector into U and V components using u equals minus V sine theta and v equals minus V cosine theta. Stage 4 interpolates each component independently with chunked griddata in bounded memory; a downward branch off this stage detects an all-NaN or under-four-station grid and routes it to an abort-and-log node so no corrupt field is serialized. Stage 5 applies the power-law hub-height shear ratio. The highlighted terminal Stage 6 writes a tiled, compressed GeoTIFF carrying U and V bands plus hub-height and alpha provenance tags.</desc>
  <defs>
    <marker id="wd-pipe-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="980" height="300" fill="none"/>
  <!-- Stage 1 -->
  <rect x="15" y="40" width="142" height="88" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="86" y="70" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">1 · Stations</text>
  <text x="86" y="91" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">CSV / Parquet</text>
  <text x="86" y="107" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">anemometer · LiDAR</text>
  <!-- Stage 2 -->
  <rect x="179" y="40" width="142" height="88" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="250" y="70" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">2 · CRS Gate</text>
  <text x="250" y="91" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">validate · reproject</text>
  <text x="250" y="107" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">4326 → 32612</text>
  <!-- Stage 3 -->
  <rect x="343" y="40" width="142" height="88" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="414" y="70" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">3 · Decompose</text>
  <text x="414" y="91" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">u = −V·sinθ</text>
  <text x="414" y="107" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">v = −V·cosθ</text>
  <!-- Stage 4 -->
  <rect x="507" y="40" width="142" height="88" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="578" y="70" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">4 · Interpolate</text>
  <text x="578" y="91" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">chunked griddata</text>
  <text x="578" y="107" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">per component</text>
  <!-- Stage 5 -->
  <rect x="671" y="40" width="142" height="88" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="742" y="70" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">5 · Hub Scaling</text>
  <text x="742" y="91" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">power-law α</text>
  <text x="742" y="107" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">(z / z_ref)^α</text>
  <!-- Stage 6 terminal highlighted -->
  <rect x="835" y="40" width="142" height="88" rx="7" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"/>
  <text x="906" y="70" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">6 · GeoTIFF</text>
  <text x="906" y="91" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">async tiled write</text>
  <text x="906" y="107" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">U/V bands · tags</text>
  <!-- main flow arrows -->
  <line x1="157" y1="84" x2="178" y2="84" stroke="currentColor" stroke-width="1.6" marker-end="url(#wd-pipe-arr)"/>
  <line x1="321" y1="84" x2="342" y2="84" stroke="currentColor" stroke-width="1.6" marker-end="url(#wd-pipe-arr)"/>
  <line x1="485" y1="84" x2="506" y2="84" stroke="currentColor" stroke-width="1.6" marker-end="url(#wd-pipe-arr)"/>
  <line x1="649" y1="84" x2="670" y2="84" stroke="currentColor" stroke-width="1.6" marker-end="url(#wd-pipe-arr)"/>
  <line x1="813" y1="84" x2="834" y2="84" stroke="currentColor" stroke-width="1.6" marker-end="url(#wd-pipe-arr)"/>
  <!-- degenerate-grid guard branch off stage 4 -->
  <path d="M578,128 L578,178" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#wd-pipe-arr)"/>
  <text x="592" y="158" font-size="10" fill="currentColor" opacity="0.8">degenerate</text>
  <rect x="488" y="180" width="180" height="74" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 4"/>
  <text x="578" y="206" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">guard: all-NaN / &lt; 4 stations</text>
  <text x="578" y="226" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">abort run + log reason</text>
  <text x="578" y="244" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">no corrupt field written</text>
</svg>

## Validation & audit trail

A wind field is only bankable if its integrity is asserted, not assumed. Final outputs should conform to CF-Conventions and OGC GeoTIFF expectations, mirroring the quality gates applied in [solar irradiance raster processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) so the two technologies stay interoperable within a hybrid portfolio. The audit function below is suitable for a CI/CD gate that blocks a release when output integrity regresses.

```python
import json

def audit_wind_raster(raster_path: str, expected_epsg: int,
                      climatology_p95_ms: float = 35.0) -> dict:
    """Assert band count, dtype, CRS, and physical sanity of a wind GeoTIFF."""
    with rasterio.open(raster_path) as src:
        report = {
            "band_count": src.count,
            "dtype": src.dtypes[0],
            "crs_epsg": src.crs.to_epsg() if src.crs else None,
            "descriptions": list(src.descriptions),
        }
        u = src.read(1, masked=True)
        v = src.read(2, masked=True)

    speed = np.ma.sqrt(u**2 + v**2)
    report["max_speed_ms"] = float(speed.max())

    assert report["band_count"] == 2, "Expected U and V bands"
    assert report["dtype"] == "float32", f"Want float32, got {report['dtype']}"
    assert report["crs_epsg"] == expected_epsg, f"CRS drift: {report['crs_epsg']}"
    # Statistical sanity: reconstructed speed must not exceed regional climatology
    assert report["max_speed_ms"] < climatology_p95_ms, "Speed exceeds climatology p95"

    logging.info("Audit passed: %s", json.dumps(report))
    return report
```

The completeness checklist for a compliant artifact is: band descriptions (`wind_speed_u_ms`, `wind_speed_v_ms`) plus the `hub_height_m` and shear `alpha` recorded as raster tags; projection consistency with the project boundary shapefile; and the statistical sanity check that reconstructed speed stays below the 95th percentile of regional climatology. Production deployments wrap the whole sequence in a configuration-driven orchestrator (Prefect or Airflow) for temporal aggregation, chunk-level retries, and metadata cataloging. Those gridded fields then feed grid-screening work, where the resource surface is cross-referenced against [grid capacity buffer analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) thresholds — the metadata contract is what lets two pipelines trust each other's outputs.


## Frequently asked questions

### Why interpolate U and V components instead of speed and direction?

Because direction is circular and speed is not. Averaging bearings of 350° and 10° arithmetically
gives 180° — the exact opposite of the correct 0° — while decomposing into eastward and northward
components, interpolating each, and recomposing gives the right answer for both speed and direction
at once. The decomposition also makes the speed field continuous across the north seam, which is
where naive interpolation produces its worst artefacts.

### How many masts are needed before interpolation is defensible?

Enough that the variogram range covers the gaps, which is a statement about spacing rather than
count. Fourteen masts across an area whose correlation range is 12 kilometres can leave a corner
where the nearest mast is 18 kilometres away, and the prediction there is extrapolation wearing an
interpolation's clothes. Publish the variance surface next to the prediction and the question
answers itself for each turbine position.

### Should hub-height extrapolation happen before or after interpolation?

After, when the shear exponent varies across the site — which it does wherever roughness varies.
Extrapolate each mast to hub height using its own measured shear, then interpolate the hub-height
field; interpolating at measurement height and applying one site-wide exponent afterwards imposes a
uniform shear the terrain does not have.

## Related

- [Solar & Wind Resource Modeling Workflows](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/) — the parent pipeline this stage feeds, from ingest to monitored deployment.
- [Calculating Wind Shear Coefficients with Python](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/calculating-wind-shear-coefficients-with-python/) — deriving a defensible, site-specific power-law exponent.
- [Terrain & Shadow Analysis Pipelines](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/) — slope, aspect, and flow-channeling corrections for the raw field.
- [Solar Irradiance Raster Processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) — the sibling raster workflow and its shared quality gates.
- [Temporal Data Aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) — turning hourly wind fields into AEP and P50/P90 bands.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — choosing the projected frame that interpolation requires.
