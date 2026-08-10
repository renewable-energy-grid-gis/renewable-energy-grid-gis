---
title: Automating Hillshade and Slope Analysis for Wind Turbine Siting
description: Fix MemoryError and 90-degree slope cliffs at tile seams when batch-computing hillshade and slope from regional DEMs — projected CRS enforcement, overlap-padded windowed processing, and a CI/CD-ready raster audit for wind siting workflows.
slug: automating-hillshade-and-slope-analysis-for-wind-turbine-siting
type: article
breadcrumb: Hillshade & Slope Automation
datePublished: 2025-09-22
dateModified: 2026-06-26
---

# Automating hillshade and slope analysis for wind turbine siting

When scaling terrain preprocessing for utility-scale wind development, automated hillshade and slope extraction fails at the intersection of memory limits, coordinate reference system (CRS) unit mismatches, and windowed raster boundary discontinuities. The symptom is consistent: a pipeline runs cleanly on a small test extent but, on a regional 1 m LiDAR or 30 m SRTM mosaic covering 500+ km², either crashes with `MemoryError` or writes artificial 90° slope cliffs along every tile seam. This page is the slope-and-aspect derivative stage of the broader [Terrain & Shadow Analysis Pipelines](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/) workflow, and it isolates the root causes, surfaces them with a pre-flight check, and delivers a chunked, CRS-validated fix that is safe to run inside a CI/CD gate before a siting model ever consumes the output.

## Scenario: `MemoryError` and 90° slope cliffs at tile seams

Two distinct failures present from the same batch script and break the same pipeline stage — the slope/aspect derivative step that feeds turbine micro-siting and access-road routing:

- On large mosaics, `numpy.gradient` over a full in-memory array raises `MemoryError` (or the kernel silently kills the worker) once the DEM exceeds available RAM on a cloud runner.
- On naively tiled DEMs, slope drops to zero or spikes to a hard 90° wall along every internal tile boundary, because the derivative kernel never sees the neighbouring tile's edge pixels.

Both must be solved together: chunking fixes the memory ceiling but *introduces* the seam artifact unless each window carries an overlap halo. The minimal failing pattern looks reasonable and is exactly what most teams ship first:

```python
import rasterio
import numpy as np

# Fails on large DEMs: loads entire array, ignores CRS units, no window padding
with rasterio.open("dem_1m.tif") as src:
    dem = src.read(1)
    # Assumes 1:1 horizontal/vertical units (false for EPSG:4326)
    grad_y, grad_x = np.gradient(dem.astype(np.float32))
    slope_deg = np.degrees(np.arctan(np.sqrt(grad_x**2 + grad_y**2)))
```

This produces three immediate defects: `MemoryError` on DEMs larger than available RAM, slope cliffs at any tile boundary if later chunked without overlap, and physically wrong slope magnitudes whenever the horizontal units are degrees rather than metres.

## Root-cause analysis

Three compounding causes drive the failure, each mapping to a specific stage of the fix:

1. **CRS unit mismatch.** A geographic CRS such as EPSG:4326 expresses horizontal distance in degrees while elevation stays in metres, so the gradient ratios $\frac{\partial z}{\partial x}$ and $\frac{\partial z}{\partial y}$ are dimensionally invalid. Slope collapses toward zero or inflates with latitude. Computing slope on degree-spaced grids is the single most common silent error, which is why a [coordinate reference system reprojection](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) to a metric UTM zone (e.g. EPSG:32610) must happen before any derivative is taken — the same [EPSG:4326 to projected-grid alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/how-to-align-epsg4326-and-epsg3857-for-solar-site-mapping/) discipline used across the resource-modeling pipeline.
2. **Windowed boundary artifacts.** A 3×3 derivative kernel needs one ring of neighbouring pixels. A plain `rasterio` window with no padding starves the edge rows and columns, so the kernel reads off-window zeros and emits seams. The defect is invisible at small scale and only appears once tiling kicks in.
3. **Memory fragmentation.** Reading the full DEM, then allocating `float64` copies for `numpy.gradient` and `scipy.ndimage` intermediates, multiplies peak RSS several times over the on-disk size and exhausts constrained runners.

The corrected slope formula, applied on a metric grid with cell size $c$, is:

$$\text{slope} = \arctan\!\left(\sqrt{\left(\tfrac{\partial z}{\partial x}\right)^2 + \left(\tfrac{\partial z}{\partial y}\right)^2}\right), \quad \tfrac{\partial z}{\partial x} = \frac{z_{east} - z_{west}}{2c}$$

<svg viewBox="0 0 900 372" role="img" aria-label="Two pipeline lanes contrasted. The broken lane reads the full DEM in EPSG:4326, runs np.gradient assuming 1:1 horizontal and vertical units, and ends in slope cliffs at seams plus MemoryError. The corrected lane validates a projected CRS in metres, reads each window with a one-pixel overlap and boundless NaN pad, computes a Horn three-by-three slope and hillshade, then trims the overlap for a seamless write." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="900" height="372"/>
  <title>Broken versus corrected slope and hillshade pipeline</title>
  <desc>A warning-coloured three-stage broken pipeline ending in MemoryError and seam cliffs, above a success-coloured four-stage corrected pipeline that enforces a projected CRS, pads windows with an overlap halo, applies a Horn kernel, and trims the halo for a seamless write.</desc>
  <g text-anchor="middle" font-size="13" fill="currentColor">
    <!-- BROKEN LANE -->
    <rect x="30" y="20" width="150" height="26" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.4"/>
    <text x="105" y="38" font-size="12" font-weight="700" letter-spacing="1">BROKEN</text>
    <rect x="40" y="64" width="230" height="66" rx="8" fill="#FFF4E6" stroke="#F4A261" stroke-width="1.4"/>
    <text x="155" y="92" font-weight="700">Read full DEM</text>
    <text x="155" y="112" font-size="11.5" opacity="0.85">EPSG:4326, whole array</text>
    <rect x="335" y="64" width="230" height="66" rx="8" fill="#FFF4E6" stroke="#F4A261" stroke-width="1.4"/>
    <text x="450" y="92" font-weight="700">np.gradient</text>
    <text x="450" y="112" font-size="11.5" opacity="0.85">assumes 1:1 units</text>
    <rect x="630" y="64" width="230" height="66" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.8"/>
    <text x="745" y="92" font-weight="700">Slope cliffs at seams</text>
    <text x="745" y="112" font-size="11.5" opacity="0.85">+ MemoryError</text>
    <!-- CORRECTED LANE -->
    <rect x="30" y="206" width="150" height="26" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
    <text x="105" y="224" font-size="12" font-weight="700" letter-spacing="1">CORRECTED</text>
    <rect x="40" y="250" width="175" height="74" rx="8" fill="#ECF7EF" stroke="#3D8B5F" stroke-width="1.4"/>
    <text x="127" y="278" font-weight="700" font-size="12.5">Validate CRS</text>
    <text x="127" y="297" font-size="11" opacity="0.85">projected, units=metre</text>
    <rect x="263" y="250" width="175" height="74" rx="8" fill="#ECF7EF" stroke="#3D8B5F" stroke-width="1.4"/>
    <text x="350" y="271" font-weight="700" font-size="12.5">Window + 1px</text>
    <text x="350" y="288" font-size="11" opacity="0.85">overlap halo,</text>
    <text x="350" y="304" font-size="11" opacity="0.85">boundless NaN pad</text>
    <rect x="486" y="250" width="175" height="74" rx="8" fill="#ECF7EF" stroke="#3D8B5F" stroke-width="1.4"/>
    <text x="573" y="278" font-weight="700" font-size="12.5">Horn 3x3 slope</text>
    <text x="573" y="297" font-size="11" opacity="0.85">+ hillshade</text>
    <rect x="709" y="250" width="151" height="74" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.8"/>
    <text x="784" y="278" font-weight="700" font-size="12.5">Trim overlap</text>
    <text x="784" y="297" font-size="11" opacity="0.85">seamless write</text>
  </g>
  <g stroke="currentColor" stroke-width="1.6" fill="currentColor" opacity="0.75">
    <line x1="270" y1="97" x2="329" y2="97"/><path d="M327 91 L335 97 L327 103 Z" stroke="none"/>
    <line x1="565" y1="97" x2="624" y2="97"/><path d="M622 91 L630 97 L622 103 Z" stroke="none"/>
    <line x1="215" y1="287" x2="257" y2="287"/><path d="M255 281 L263 287 L255 293 Z" stroke="none"/>
    <line x1="438" y1="287" x2="480" y2="287"/><path d="M478 281 L486 287 L478 293 Z" stroke="none"/>
    <line x1="661" y1="287" x2="703" y2="287"/><path d="M701 281 L709 287 L701 293 Z" stroke="none"/>
  </g>
</svg>

## Pre-flight validation

Run a cheap check that surfaces the two structural root causes — non-metric CRS and a chunk size that will swap — *before* the expensive windowed pass starts. It opens only the header and metadata, so it is safe to call in a CI/CD gate.

```python
import rasterio
import numpy as np

def preflight_dem(input_path: str, chunk_size: int = 2048,
                  max_window_bytes: int = 512 * 1024 * 1024) -> None:
    """Fail fast on the two structural causes of slope/hillshade failure."""
    with rasterio.open(input_path) as src:
        if not src.crs or not src.crs.is_projected:
            raise ValueError(
                f"DEM CRS {src.crs} is not projected. Reproject to a metric "
                "UTM zone (e.g. EPSG:32610) before slope computation."
            )
        units = (src.crs.linear_units or "").lower()
        if units not in ("metre", "meter", "m"):
            raise ValueError(f"CRS linear unit '{units}' is not metres.")

        # float64 working copy of one padded window is the memory hot spot
        win_px = (chunk_size + 2) ** 2
        est_bytes = win_px * np.dtype(np.float64).itemsize * 3  # dem + 2 gradients
        if est_bytes > max_window_bytes:
            raise ValueError(
                f"chunk_size={chunk_size} needs ~{est_bytes // 1_048_576} MB/window; "
                f"reduce to fit the {max_window_bytes // 1_048_576} MB budget."
            )
        print(f"OK: {src.crs} res={src.res} size={src.width}x{src.height}")
```

## Fix implementation

The corrected pipeline enforces a projected CRS, reads each window with a one-pixel overlap halo (`boundless=True` pads off-extent pixels with `NaN`), computes slope and aspect from central differences scaled by the true ground cell size, trims the halo, and streams each tile straight to disk. Outputs are `float32` slope with `nodata=NaN` and `uint8` hillshade, both DEFLATE-compressed and internally tiled for downstream windowed reads.

```python
import rasterio
import numpy as np
from rasterio.windows import Window
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

def compute_slope_aspect(dem_window: np.ndarray, cell_size_m: float):
    """Central-difference slope (deg) and aspect (deg, 0-360) on a metric grid."""
    grad_y, grad_x = np.gradient(dem_window.astype(np.float64),
                                 cell_size_m, cell_size_m)
    slope_deg = np.degrees(np.arctan(np.sqrt(grad_x**2 + grad_y**2)))
    aspect_deg = np.degrees(np.arctan2(grad_y, -grad_x)) % 360.0
    return slope_deg, aspect_deg

def compute_hillshade(slope_deg, aspect_deg, sun_azimuth=315.0, sun_altitude=45.0):
    """Analytical hillshade, 0-255 uint8, for stakeholder visualization."""
    slope_rad, aspect_rad = np.radians(slope_deg), np.radians(aspect_deg)
    az_rad, alt_rad = np.radians(sun_azimuth), np.radians(sun_altitude)
    hs = 255.0 * (
        np.sin(alt_rad) * np.cos(slope_rad) +
        np.cos(alt_rad) * np.sin(slope_rad) * np.cos(az_rad - aspect_rad)
    )
    return np.clip(np.nan_to_num(hs), 0, 255).astype(np.uint8)

def process_dem_chunked(input_path, slope_out, hillshade_out,
                        chunk_size=2048, overlap=1):
    """Memory-safe, seam-free slope + hillshade over a regional DEM."""
    with rasterio.open(input_path) as src:
        cell_size_m = src.res[0]
        slope_meta = src.meta.copy()
        slope_meta.update(driver="GTiff", dtype="float32", count=1,
                          nodata=np.nan, compress="deflate", tiled=True)
        hs_meta = slope_meta.copy()
        hs_meta.update(dtype="uint8", nodata=0)

        with rasterio.open(slope_out, "w", **slope_meta) as dst_slope, \
             rasterio.open(hillshade_out, "w", **hs_meta) as dst_hs:
            for row in range(0, src.height, chunk_size):
                for col in range(0, src.width, chunk_size):
                    padded = Window(col - overlap, row - overlap,
                                    chunk_size + 2 * overlap,
                                    chunk_size + 2 * overlap)
                    dem_chunk = src.read(1, window=padded, boundless=True,
                                         fill_value=np.nan)
                    slope, aspect = compute_slope_aspect(dem_chunk, cell_size_m)
                    hs = compute_hillshade(slope, aspect)

                    slope_w = slope[overlap:-overlap, overlap:-overlap]
                    hs_w = hs[overlap:-overlap, overlap:-overlap]
                    write_win = Window(col, row, slope_w.shape[1], slope_w.shape[0])
                    dst_slope.write(slope_w.astype("float32"), 1, window=write_win)
                    dst_hs.write(hs_w, 1, window=write_win)
            dst_slope.update_tags(sun_azimuth=315.0, sun_altitude=45.0,
                                  cell_size_m=cell_size_m, source_crs=str(src.crs))
            logging.info("slope + hillshade written for %s", input_path)
```

<svg viewBox="0 0 900 430" role="img" aria-label="Annotated overlap-halo window. On the left, a padded read window of nine by nine cells: the outer one-cell ring is the boundless NaN pad overlap halo, the inner seven by seven block is the trimmed write window. A three-by-three Horn kernel sits at the corner with its centre on the first inner cell, reaching across into the halo ring so the derivative never reads off-window zeros. An arrow trims the halo and writes the inner block aligned to the parent grid, where two adjacent write windows abut at a seam that stays continuous with no ninety-degree cliff." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="900" height="430"/>
  <title>Overlap halo lets the Horn kernel cross tile seams without cliffs</title>
  <desc>A padded read window with a warning-coloured one-pixel halo ring around a success-coloured write window; a three-by-three kernel at the corner reads into the halo. Trimming the halo writes the inner block to the parent grid, where neighbouring tiles meet at a seam with no slope cliff.</desc>
  <g font-size="12.5" fill="currentColor">
    <text x="214" y="34" text-anchor="middle" font-weight="700">Padded read window (chunk + halo)</text>
    <!-- 9x9 grid: outer warn ring = halo, inner 7x7 = write window -->
    <rect x="70" y="56" width="288" height="288" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <rect x="102" y="88" width="224" height="224" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <g stroke="currentColor" stroke-width="0.7" opacity="0.35">
      <line x1="102" y1="56" x2="102" y2="344"/><line x1="134" y1="56" x2="134" y2="344"/>
      <line x1="166" y1="56" x2="166" y2="344"/><line x1="198" y1="56" x2="198" y2="344"/>
      <line x1="230" y1="56" x2="230" y2="344"/><line x1="262" y1="56" x2="262" y2="344"/>
      <line x1="294" y1="56" x2="294" y2="344"/><line x1="326" y1="56" x2="326" y2="344"/>
      <line x1="70" y1="88" x2="358" y2="88"/><line x1="70" y1="120" x2="358" y2="120"/>
      <line x1="70" y1="152" x2="358" y2="152"/><line x1="70" y1="184" x2="358" y2="184"/>
      <line x1="70" y1="216" x2="358" y2="216"/><line x1="70" y1="248" x2="358" y2="248"/>
      <line x1="70" y1="280" x2="358" y2="280"/><line x1="70" y1="312" x2="358" y2="312"/>
    </g>
    <!-- 3x3 Horn kernel at corner, centre on first inner cell, reaching into halo -->
    <rect x="70" y="56" width="96" height="96" fill="none" stroke="currentColor" stroke-width="2.4"/>
    <rect x="102" y="88" width="32" height="32" fill="currentColor" opacity="0.16"/>
    <circle cx="118" cy="104" r="3.4" fill="currentColor"/>
    <text x="214" y="208" text-anchor="middle" font-size="13" font-weight="700" fill="#1F3A60">write window</text>
    <text x="214" y="226" text-anchor="middle" font-size="11.5" opacity="0.8">(trimmed, 7x7)</text>
    <text x="89" y="171" text-anchor="middle" font-size="10" opacity="0.85">halo</text>
  </g>
  <!-- callouts -->
  <g font-size="11.5" fill="currentColor">
    <line x1="166" y1="104" x2="362" y2="104" stroke="currentColor" stroke-width="1.2" opacity="0.7"/>
    <text x="368" y="100" font-weight="700">3x3 Horn kernel</text>
    <text x="368" y="117" font-size="10.5" opacity="0.8">centre cell reads into halo</text>
    <text x="44" y="378" font-weight="700" fill="currentColor">1px overlap halo</text>
    <text x="44" y="395" font-size="10.5" opacity="0.85">boundless NaN pad — supplies the</text>
    <text x="44" y="410" font-size="10.5" opacity="0.85">neighbour pixels the kernel needs</text>
  </g>
  <!-- trim + write arrow -->
  <g>
    <line x1="380" y1="200" x2="500" y2="200" stroke="currentColor" stroke-width="1.8"/>
    <path d="M498 193 L508 200 L498 207 Z" fill="currentColor"/>
    <text x="444" y="186" text-anchor="middle" font-size="11.5" font-weight="700" fill="currentColor">trim halo,</text>
    <text x="444" y="222" text-anchor="middle" font-size="11.5" font-weight="700" fill="currentColor">write aligned</text>
  </g>
  <!-- parent grid: two adjacent write windows abut seamlessly -->
  <g font-size="12.5" fill="currentColor">
    <text x="694" y="34" text-anchor="middle" font-weight="700">Parent grid (seamless)</text>
    <rect x="540" y="92" width="154" height="216" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <rect x="694" y="92" width="154" height="216" fill="#ECF7EF" stroke="#3D8B5F" stroke-width="1.5"/>
    <line x1="694" y1="92" x2="694" y2="308" stroke="#3D8B5F" stroke-width="2" stroke-dasharray="5 4"/>
    <text x="617" y="206" text-anchor="middle" font-size="11.5" opacity="0.85">tile A</text>
    <text x="771" y="206" text-anchor="middle" font-size="11.5" opacity="0.85">tile B</text>
    <!-- continuous slope band across the seam -->
    <path d="M548 270 Q620 236 694 244 T840 218" fill="none" stroke="currentColor" stroke-width="2" opacity="0.65"/>
    <line x1="694" y1="318" x2="694" y2="340" stroke="currentColor" stroke-width="1.2" opacity="0.7"/>
    <text x="694" y="358" text-anchor="middle" font-size="11.5" font-weight="700">seam stays continuous</text>
    <text x="694" y="374" text-anchor="middle" font-size="10.5" opacity="0.8">no zero gap, no 90&#176; cliff</text>
  </g>
</svg>

## Fallback routing & performance tuning

When the default `chunk_size` still pressures a constrained runner, step down through these strategies rather than loading the full array:

- **Shrink the window.** Drop `chunk_size` to `1024` or `512`; peak RSS scales with the window area, so halving the side quarters the working set while the one-pixel halo keeps seams gone.
- **Cap GDAL's block cache.** Export `GDAL_CACHEMAX=256` (MB) so `rasterio` reads do not balloon the resident set on top of your NumPy arrays.
- **Pre-build a Cloud-Optimized GeoTIFF.** Convert the source DEM to a COG with internal tiling and overviews so each `boundless` window is a cheap block read instead of a random-access scan of a striped TIFF.
- **Use a VRT for multi-tile mosaics.** Wrap many adjacent DEM tiles in a `gdalbuildvrt` virtual raster and stream windows out-of-core, avoiding a physical merge into one oversized file.
- **Choose resampling deliberately if you downsample.** Use `average` (not `bilinear`) when reducing resolution before slope, so a single anomalous cell does not smear a false gradient across the kernel.

## Downstream validation

Before slope and hillshade reach exclusion-zoning or [grid capacity buffer analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) routing, assert structural integrity. This audit returns a pass/fail dict suitable for a CI/CD gate and catches the exact regressions this fix targets: wrong dtype, a non-projected output CRS, `nodata` bleed, and any residual seam.

<svg viewBox="0 0 940 396" role="img" aria-label="What terrain does to a wind layout, expressed as buildable area. Of a 4,200 hectare lease, 38 percent lies under 5 degrees and takes a standard crane pad; 29 percent is 5 to 10 degrees and needs cut-and-fill; 21 percent is 10 to 15 degrees, where crane-path grading starts to dominate civil cost; and 12 percent exceeds 15 degrees and is excluded outright by the crane specification. Two-thirds of the lease is usable, and only 38 percent is usable cheaply." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Buildable area by slope class, and what each class costs to build on</title>
  <desc>A stacked bar dividing a 4,200 hectare lease into four slope classes: under 5 degrees at 38 percent with a standard crane pad, 5 to 10 degrees at 29 percent needing cut and fill, 10 to 15 degrees at 21 percent where crane-path grading dominates civil cost, and above 15 degrees at 12 percent excluded by the crane specification. Each class is annotated with its hectare figure and its civil-cost implication, and a note records that the slope class boundaries come from the crane specification rather than from the DEM.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="sl-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">4 200 ha lease, split by slope class</text>
  <rect x="40" y="70" width="326.84" height="66" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
  <text x="204.92" y="100" text-anchor="middle" font-size="15" fill="currentColor" font-weight="700">38%</text>
  <text x="204.92" y="122" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">1 596 ha</text>
  <rect x="369.84" y="70" width="248.72" height="66" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
  <text x="495.7" y="100" text-anchor="middle" font-size="15" fill="currentColor" font-weight="700">29%</text>
  <text x="495.7" y="122" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">1 218 ha</text>
  <rect x="621.56" y="70" width="179.28" height="66" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.4"/>
  <text x="712.6999999999999" y="100" text-anchor="middle" font-size="15" fill="currentColor" font-weight="700">21%</text>
  <text x="712.6999999999999" y="122" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">882 ha</text>
  <rect x="803.8399999999999" y="70" width="101.16" height="66" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.4"/>
  <text x="855.92" y="100" text-anchor="middle" font-size="15" fill="currentColor" font-weight="700">12%</text>
  <text x="855.92" y="122" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">504 ha</text>
  <rect x="40" y="166" width="16" height="16" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="66" y="179" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.9">under 5° — standard crane pad</text>
  <rect x="40" y="194" width="16" height="16" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="66" y="207" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.9">5–10° — cut and fill required</text>
  <rect x="40" y="222" width="16" height="16" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="66" y="235" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.9">10–15° — crane-path grading dominates</text>
  <rect x="40" y="250" width="16" height="16" rx="3" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2"/>
  <text x="66" y="263" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.9">above 15° — excluded by crane spec</text>
  <rect x="500" y="166" width="408" height="73" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="704.0" y="188" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">67% is buildable at some cost</text>
  <text x="704.0" y="207" text-anchor="middle" font-size="12" fill="currentColor">38% is buildable at standard cost</text>
  <text x="704.0" y="226" text-anchor="middle" font-size="11.5" fill="currentColor">the gap between the two is the civil budget</text>
  <rect x="40" y="292" width="868" height="48" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="474.0" y="313" text-anchor="middle" font-size="11.5" fill="currentColor">The class boundaries come from the crane specification, not from the DEM — so a layout study should</text>
  <text x="474.0" y="330" text-anchor="middle" font-size="11.5" fill="currentColor">take them as inputs and record which crane they assume, or the buildable area is not reproducible.</text>
  <text x="40" y="372" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">Slope classes computed on a 10 m DEM; a 30 m DEM moves the boundaries by several percent.</text>
</svg>

```python
import rasterio
import numpy as np

def audit_slope_raster(slope_path: str, max_internal_jump_deg: float = 5.0) -> dict:
    """CI/CD gate: band count, dtype, projected CRS, nodata bleed, seam check."""
    report = {}
    with rasterio.open(slope_path) as src:
        report["band_count_ok"] = src.count == 1
        report["dtype_ok"] = src.dtypes[0] == "float32"
        report["crs_projected"] = bool(src.crs and src.crs.is_projected)

        slope = src.read(1, masked=True)
        report["nodata_is_nan"] = src.nodata is None or np.isnan(src.nodata)
        report["value_range_ok"] = bool(slope.min() >= 0 and slope.max() <= 90)

        # Seam check: large abrupt jumps along interior rows/cols flag bad overlap
        d_row = np.abs(np.diff(slope.filled(np.nan), axis=0))
        d_col = np.abs(np.diff(slope.filled(np.nan), axis=1))
        worst = np.nanmax([np.nanmax(d_row), np.nanmax(d_col)])
        report["max_internal_jump_deg"] = float(worst)
        report["seam_free"] = bool(worst <= max_internal_jump_deg)

    report["passed"] = all(v for k, v in report.items()
                           if isinstance(v, bool))
    return report
```

A failing `seam_free` points back to insufficient `overlap`; a failing `crs_projected` means the reproject in [coordinate reference systems for energy projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) was skipped upstream. Log the returned dict alongside the `update_tags` provenance (sun azimuth, altitude, cell size, source CRS) so the terrain-loss figure stays defensible in permitting and project-finance review. With projected-CRS enforcement, overlap-aware windowing, and the audit gate in place, the slope and hillshade surfaces align pixel-for-pixel with the irradiance and wind grids they constrain and are ready for turbine micro-siting and interconnection studies.

## Related

- [Terrain & Shadow Analysis Pipelines](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/) — the parent workflow this slope/hillshade stage feeds.
- [Calculating wind shear coefficients with Python](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/calculating-wind-shear-coefficients-with-python/) — pairs slope-constrained sites with hub-height wind extrapolation.
- [Stacking NASA POWER and PVGIS rasters in rasterio](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/stacking-nasa-power-and-pvgis-rasters-in-rasterio/) — the grid-alignment pattern slope outputs must match.
- [Best practices for cleaning messy shapefiles in GeoPandas](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/best-practices-for-cleaning-messy-shapefiles-in-geopandas/) — preparing exclusion-zone vectors that consume these terrain derivatives.
