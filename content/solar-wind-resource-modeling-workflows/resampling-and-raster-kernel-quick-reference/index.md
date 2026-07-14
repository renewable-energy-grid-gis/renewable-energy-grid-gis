---
title: Resampling & Raster Kernel Quick Reference
description: Choose the right resampling kernel and temporal aggregation method for solar and wind raster work — continuity, edge behavior, rasterio Resampling values, and dtype/nodata guidance.
slug: resampling-and-raster-kernel-quick-reference
type: reference
breadcrumb: Resampling Quick Reference
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Resampling & Raster Kernel Quick Reference

Almost every step in the [solar and wind resource modeling workflows](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/) touches a resampling kernel, usually without saying so out loud. Reprojecting a satellite irradiance grid onto a DEM, coarsening a 5-minute time series to monthly means, mosaicking tiled GHI rasters, or aligning a land-use mask to the resource grid — each of these silently picks an interpolation rule, and the wrong rule corrupts the numbers a project finance model treats as ground truth. Bilinear smoothing over a categorical land-cover mask invents land classes that never existed; a plain nearest-neighbour downsample of an irradiance field throws away conserved energy; summing an intensity field where you meant to average it inflates yield by orders of magnitude.

This page is the quick-reference the rest of the site links into when a workflow needs to justify a kernel choice. It collects three decision tables — spatial resampling methods, temporal aggregation methods, and dtype/nodata conventions — plus a decision matrix and a runnable helper. It pairs naturally with the [projection and CRS quick reference](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/projection-and-crs-quick-reference/): pick the projection there, pick the kernel here, and every reproject in your pipeline is fully specified.

## Spatial resampling methods

The core rule: **continuous fields interpolate, categorical fields do not**, and **downsampling conserves the aggregate, upsampling reconstructs detail**. The `rasterio.enums.Resampling` value in the last column is what you pass to `rioxarray`'s `.rio.reproject(resampling=...)` or `rasterio`'s `WarpedVRT`.

| Kernel | Best for | Continuity | Edge / overshoot behavior | `Resampling` value |
|---|---|---|---|---|
| Nearest | Categorical land-use, cloud/QA flags, integer masks | Preserves exact input values (no new values) | Blocky; hard edges kept intact | `Resampling.nearest` (0) |
| Bilinear | Continuous irradiance (GHI/DNI/DHI), wind speed — reproject or modest upsample | C0 continuous; smooths | No overshoot; slight edge blur | `Resampling.bilinear` (1) |
| Cubic | Continuous fields where smooth gradients matter (terrain-driven wind) | C1 smoother than bilinear | Can overshoot near sharp gradients | `Resampling.cubic` (2) |
| Cubic spline | Very smooth surfaces (interpolated pressure, temperature) | C2 smoothest | Larger overshoot; ringing risk | `Resampling.cubic_spline` (3) |
| Lanczos | High-quality resize of continuous rasters for display/reporting | Sharp yet smooth | Sinc ringing near strong edges | `Resampling.lanczos` (4) |
| Average | **Downsampling continuous** irradiance/wind — conserves the mean | Smooths; mean-preserving | Averages across boundaries (blurs class edges) | `Resampling.average` (5) |
| Mode | **Downsampling categorical** land-use / masks — majority class | Preserves valid class values | Majority wins per coarse cell | `Resampling.mode` (6) |
| Min / Max | Conservative masks (worst-case shading, exclusion coverage) | Preserves extremes | Biases toward the extreme value | `Resampling.min` (9) / `Resampling.max` (8) |

Two failure modes dominate in practice. First, using `nearest` when downsampling a continuous field: it point-samples one fine pixel per coarse cell and discards the rest, so a 10× coarsening keeps only 1% of the data and the mean drifts unpredictably — use `average` instead. Second, using `bilinear` or `average` on a categorical mask: interpolating class codes `1` and `3` yields `2`, a class that may mean something entirely different — always use `nearest` (reproject) or `mode` (downsample) for anything discrete.

## Temporal aggregation methods

Temporal reduction is where units bite. Irradiance and wind speed are *intensities* (instantaneous rates) and aggregate by **mean**; energy is an *accumulation* and aggregates by **sum**. Confusing the two is the most common yield error in resource assessment. The full rolling/exceedance machinery lives in [temporal data aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/); this table is the cheat sheet.

| Variable | Hourly → daily | Daily → monthly | → annual | Notes |
|---|---|---|---|---|
| GHI / DNI (W/m²) | mean | mean | mean | Intensity — never sum W/m²; convert to Wh/m² first if you need energy |
| Irradiation (Wh/m²) | sum | sum | sum | Already energy-per-area; additive across time |
| Wind speed (m/s) | mean | mean | mean | Report mean; also keep the Weibull/percentile spread, not just the mean |
| Wind power density (W/m²) | mean | mean | mean | Mean of the cube ⟨½ρv³⟩ — compute per timestep, then average |
| Generation / energy (MWh) | sum | sum | sum | Additive; annual energy production (AEP) is a pure sum over the year |
| Resource risk bands | — | — | P50 / P90 percentile | Compute across the yearly totals, not within a year |

Percentiles apply to a *distribution of annual totals*, not to raw sub-hourly samples. Aggregate to annual energy first (by sum), collect one value per simulated year, then take the P50 (median) and P90 (10th percentile — the conservative exceedance band financiers underwrite against).

<div class="katex-note">

For **average** resampling and for mean temporal reduction, the coarse or aggregated value is the arithmetic mean of the contributing samples:

$$ \bar{G}_{\text{coarse}} = \frac{1}{n}\sum_{i=1}^{n} G_i $$

For **energy**, the aggregate is a sum of power over the interval, which is fundamentally additive and must never be replaced by a mean:

$$ E_{\text{annual}} = \sum_{t=1}^{8760} P_t \,\Delta t $$

With hourly steps $\Delta t = 1\,\text{h}$, so $E$ in MWh is just $\sum P_t$ in MW — the distinction between averaging an intensity ($G$, W/m²) and summing an accumulation ($E$, MWh) is exactly the mean-vs-sum choice above.

</div>

## Dtype, nodata & compression guidance

Kernel choice interacts with storage. Interpolating across a nodata value silently bleeds it into neighbours, and an integer dtype cannot hold a `NaN` sentinel — so the dtype and nodata policy is part of the resampling decision, not an afterthought.

| Concern | Recommendation | Why |
|---|---|---|
| Working dtype (continuous) | `float32` | Halves memory vs `float64` with negligible loss for irradiance/wind; supports `NaN` |
| Working dtype (categorical) | smallest int (`uint8`/`int16`) | Class codes need no float precision; keeps masks compact |
| Nodata (continuous) | `nodata = np.nan` | `average`/`bilinear` propagate `NaN` cleanly instead of blending a magic number like `-9999` into real pixels |
| Nodata (categorical) | reserved int (e.g. `255` for `uint8`) | `NaN` is invalid for integers; pick a code outside the valid class range |
| Compression | `LZW` (or `DEFLATE`), `predictor=3` for floats | Lossless; `predictor=2` for ints, `3` for floating point improves ratio |
| Block layout | tiled, `blockxsize=blockysize=256` (or 512) | Enables windowed reads so large mosaics never load whole |

Always mask before you resample continuous data (`rasterio` `masked=True` or rioxarray's `nodata`-aware read). With `nodata=NaN` and `float32`, `average` and `bilinear` skip missing pixels rather than averaging in a sentinel, and downstream statistics stay honest. This is the same discipline the [spatial data quality and validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) workflow enforces on vector inputs, applied to the raster side.

## Decision matrix: data type + operation → kernel

The two questions that fully determine a kernel are *what does the pixel value mean* (continuous vs categorical) and *which way are you resampling* (reproject/upsample vs downsample/coarsen). This matrix collapses both into a single lookup.

<svg viewBox="0 0 820 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Decision matrix mapping data type and resampling operation to a kernel. Continuous irradiance: use bilinear to reproject or upsample, average to downsample. Wind speed field: bilinear or cubic to reproject, average to downsample. Categorical land use or mask: nearest to reproject, mode to downsample." style="width:100%;max-width:820px;height:auto;font-family:inherit;">
  <title>Kernel Decision Matrix</title>
  <desc>A three-row, two-column matrix. Rows are data types: continuous irradiance, wind speed field, and categorical land use or mask. Columns are operations: reproject or upsample, and downsample or coarsen. Each cell names the recommended kernel and a one-line rationale. Continuous and wind rows recommend bilinear or cubic for reproject and average for downsample; the categorical row recommends nearest for reproject and mode for downsample, and its cells are emphasized to flag that interpolation must never be used on discrete values.</desc>
  <rect width="820" height="300" fill="none"/>
  <!-- Column headers -->
  <text x="330" y="34" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">Reproject / upsample</text>
  <text x="600" y="34" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">Downsample / coarsen</text>
  <!-- Row label column -->
  <text x="20" y="82" font-size="12" fill="currentColor" font-weight="600">Continuous</text>
  <text x="20" y="98" font-size="12" fill="currentColor" font-weight="600">irradiance</text>
  <text x="20" y="162" font-size="12" fill="currentColor" font-weight="600">Wind speed</text>
  <text x="20" y="178" font-size="12" fill="currentColor" font-weight="600">field</text>
  <text x="20" y="242" font-size="12" fill="currentColor" font-weight="600">Categorical</text>
  <text x="20" y="258" font-size="12" fill="currentColor" font-weight="600">mask / land use</text>
  <!-- Row 1: continuous -->
  <rect x="195" y="52" width="270" height="60" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="330" y="78" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">Bilinear</text>
  <text x="330" y="98" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">smooth, no overshoot</text>
  <rect x="475" y="52" width="270" height="60" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="600" y="78" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">Average</text>
  <text x="600" y="98" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">mean-preserving</text>
  <!-- Row 2: wind -->
  <rect x="195" y="132" width="270" height="60" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="330" y="158" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">Bilinear / Cubic</text>
  <text x="330" y="178" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">smooth gradients</text>
  <rect x="475" y="132" width="270" height="60" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="600" y="158" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">Average</text>
  <text x="600" y="178" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">conserves mean speed</text>
  <!-- Row 3: categorical (emphasized) -->
  <rect x="195" y="212" width="270" height="60" rx="7" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"/>
  <text x="330" y="238" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">Nearest</text>
  <text x="330" y="258" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">never interpolate codes</text>
  <rect x="475" y="212" width="270" height="60" rx="7" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"/>
  <text x="600" y="238" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">Mode</text>
  <text x="600" y="258" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">majority class wins</text>
</svg>

## Runnable helper: dispatch the right kernel

The helper below wires the matrix into code. It resolves a kernel from the data semantics and the operation direction, then runs an explicit `rioxarray` reproject-and-resample onto a target grid — the same `reproject_match` pattern used across [solar irradiance raster processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) so that harmonized layers share one affine transform before any pixel-wise math.

```python
import numpy as np
import xarray as xr
import rioxarray  # noqa: F401  (registers the .rio accessor)
from rasterio.enums import Resampling

def choose_kernel(is_categorical: bool, downsampling: bool) -> Resampling:
    """Map (data semantics, operation direction) -> rasterio resampling kernel."""
    if is_categorical:
        return Resampling.mode if downsampling else Resampling.nearest
    return Resampling.average if downsampling else Resampling.bilinear

def resample_to_grid(source_da: xr.DataArray, target_grid: xr.DataArray,
                     is_categorical: bool = False) -> xr.DataArray:
    """Reproject/resample a raster onto a reference grid with the correct kernel.

    source_da / target_grid carry a CRS via .rio; e.g. source in EPSG:4326,
    target DEM grid in EPSG:32615 (UTM 15N). Direction is inferred from
    resolution: coarser target => downsampling => conserve the aggregate.
    """
    src_res = abs(source_da.rio.resolution()[0])
    tgt_res = abs(target_grid.rio.resolution()[0])
    downsampling = tgt_res > src_res
    kernel = choose_kernel(is_categorical, downsampling)

    if is_categorical:
        ghi_or_mask = source_da.astype("int16")
        nodata = 255
    else:
        ghi_or_mask = source_da.astype("float32")
        nodata = np.float32("nan")

    aligned = ghi_or_mask.rio.write_nodata(nodata).rio.reproject_match(
        target_grid, resampling=kernel,
    )
    assert aligned.rio.crs.to_epsg() == target_grid.rio.crs.to_epsg()
    assert aligned.rio.transform() == target_grid.rio.transform(), "Affine drift"
    return aligned

# Example: snap a coarse EPSG:4326 GHI field onto a fine UTM DEM grid (upsample)
# ghi_aligned = resample_to_grid(ghi_array, dem_grid, is_categorical=False)
# -> bilinear, float32, nodata=NaN, co-registered with the DEM
```

Persist the result with a lossless codec and float-friendly predictor so the kernel's output is not undone by storage:

```python
ghi_aligned.rio.to_raster(
    "ghi_aligned_utm15n.tif",
    dtype="float32",
    compress="LZW",
    predictor=3,          # 3 for floating point, 2 for integer rasters
    tiled=True, blockxsize=256, blockysize=256,
    nodata=np.float32("nan"),
)
```

## Guidance notes

- **Reproject once, resample once.** Chaining reprojections compounds interpolation error. Snap every layer to a single reference grid (usually the DEM) with `reproject_match`, then keep that grid fixed for the rest of the run.
- **Match nodata to dtype.** `NaN` for `float32`, a reserved integer for categorical rasters. An out-of-band `-9999` fed to `average` or `bilinear` will bleed into real pixels and quietly bias every downstream statistic.
- **Downsample conserves, upsample reconstructs.** When coarsening a continuous field, `average` preserves the domain mean that becomes the denominator in capacity factor; `nearest` does not. When refining, `bilinear`/`cubic` reconstruct a plausible surface but add no real information.
- **Never smooth a mask.** Cloud flags, QA bands, land-use codes, and exclusion masks are categorical — `nearest` to reproject, `mode` to downsample, full stop.
- **Averages vs sums are a units decision.** Resample intensities (W/m², m/s) by mean; aggregate energy (MWh, Wh/m²) by sum. Verify the physical unit before choosing, not after.
- **Lanczos and cubic spline are for display,** not for the analytical grid — their overshoot can push irradiance below zero or above the extraterrestrial limit near sharp cloud edges.

## Related

- [Solar & Wind Resource Modeling Workflows](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/) — the pipeline overview these kernel choices feed into at every stage.
- [Solar Irradiance Raster Processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) — where reproject-and-resample harmonizes GHI/DNI grids onto the terrain.
- [Temporal Data Aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) — the mean-vs-sum and P50/P90 rules applied to full time series.
- [Projection & CRS Quick Reference](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/projection-and-crs-quick-reference/) — pick the target projection before you pick the kernel.
- [Spatial Data Quality & Validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) — the masking and nodata discipline that keeps resampling honest.
