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

<svg viewBox="0 0 940 400" role="img" aria-label="How the four common resampling kernels treat a hard edge in a raster — a coastline in a GHI grid, or a land-cover boundary. Nearest neighbour keeps the step exactly and introduces no new values, which is the only acceptable choice for categorical data. Bilinear ramps across two cells. Cubic convolution overshoots slightly on both sides, creating values that never existed in the source. Average smooths the step over the whole window and is the right choice only when downsampling continuous data." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Four kernels, one edge: what each one produces</title>
  <desc>Four small profile plots across the same hard step from 200 to 800 watts per square metre. Nearest neighbour reproduces the step exactly with no intermediate values. Bilinear produces a straight ramp across two cells. Cubic convolution produces a ramp with a visible undershoot below 200 before the edge and an overshoot above 800 after it, annotated as values not present in the source. Average produces a gentle S-shaped transition spread across the whole window. Under each plot is the data type it suits.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="kn-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The same edge, resampled four ways</text>
  <rect x="40" y="62" width="196" height="180" rx="8" fill="none" stroke="#3D8B5F" stroke-width="1.1" opacity="0.5"/>
  <line x1="60" y1="214" x2="216" y2="214" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <path d="M60,190 L138,190 L138,90 L216,90" fill="none" stroke="#3D8B5F" stroke-width="2.4"/>
  <text x="138" y="266" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">nearest</text>
  <text x="138" y="286" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">categorical only</text>
  <rect x="266" y="62" width="196" height="180" rx="8" fill="none" stroke="#5BA8C8" stroke-width="1.1" opacity="0.5"/>
  <line x1="286" y1="214" x2="442" y2="214" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <path d="M286,190 L348,190 L380,90 L442,90" fill="none" stroke="#5BA8C8" stroke-width="2.4"/>
  <text x="364" y="266" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">bilinear</text>
  <text x="364" y="286" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">continuous, upsampling</text>
  <rect x="492" y="62" width="196" height="180" rx="8" fill="none" stroke="#F4A261" stroke-width="1.1" opacity="0.5"/>
  <line x1="512" y1="214" x2="668" y2="214" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <path d="M512,190 L562,190 L574,204 L590,190 L612,90 L624,78 L638,90 L668,90" fill="none" stroke="#F4A261" stroke-width="2.4"/>
  <text x="590" y="82" text-anchor="middle" font-size="10" fill="#7A4A1A" font-weight="700">over/undershoot</text>
  <text x="590" y="266" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">cubic</text>
  <text x="590" y="286" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">continuous, smooth surfaces</text>
  <rect x="718" y="62" width="196" height="180" rx="8" fill="none" stroke="#5BA8C8" stroke-width="1.1" opacity="0.5"/>
  <line x1="738" y1="214" x2="894" y2="214" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <path d="M738,190 C808,190 828,90 894,90" fill="none" stroke="#5BA8C8" stroke-width="2.4"/>
  <text x="816" y="266" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">average</text>
  <text x="816" y="286" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">continuous, downsampling</text>
  <text x="40" y="316" text-anchor="start" font-size="11" fill="currentColor" opacity="0.8">200 W/m² on the left of each step, 800 W/m² on the right</text>
  <rect x="40" y="330" width="876" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="478.0" y="351" text-anchor="middle" font-size="11.5" fill="currentColor">Cubic on a land-cover raster invents class codes that do not exist; nearest on a GHI raster leaves</text>
  <text x="478.0" y="368" text-anchor="middle" font-size="11.5" fill="currentColor">visible blocking. The kernel is chosen by what the pixel values mean, never by how the output looks.</text>
</svg>

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

<svg viewBox="0 0 940 372" role="img" aria-label="The window each kernel reads and what it costs. Nearest neighbour reads 1 source cell per output cell, bilinear 4, cubic convolution 16, Lanczos 36, and average reads the whole source window that maps into the output cell — which is the only kernel whose cost grows with the downsampling factor. On a national reprojection the difference between nearest and Lanczos is roughly a factor of nine in wall-clock time." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Cells read per output cell, and what that costs at national scale</title>
  <desc>A table of five kernels giving the source window each reads, the number of source cells per output cell, and the measured time to reproject a national 4 kilometre GHI grid: nearest reads a 1 by 1 window, 1 cell, 41 seconds; bilinear a 2 by 2 window, 4 cells, 58 seconds; cubic a 4 by 4 window, 16 cells, 121 seconds; Lanczos a 6 by 6 window, 36 cells, 372 seconds; and average reads the full mapped window, a variable cell count, 96 seconds at a factor of four downsample. Small grids of squares illustrate each window size.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="372"/>
  <defs><marker id="kw-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Cells read per output cell — and the wall-clock it buys</text>
  <rect x="40" y="62" width="164" height="214" rx="8" fill="none" stroke="#3D8B5F" stroke-width="1.1" opacity="0.5"/>
  <rect x="114.5" y="96" width="13.5" height="13.5" rx="1" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.9"/>
  <text x="122" y="196" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">nearest</text>
  <text x="122" y="216" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">1 × 1</text>
  <text x="122" y="246" text-anchor="middle" font-size="13" fill="#1F5C3A" font-weight="700">41 s</text>
  <text x="122" y="264" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">national reproject</text>
  <rect x="220" y="62" width="164" height="214" rx="8" fill="none" stroke="#5BA8C8" stroke-width="1.1" opacity="0.5"/>
  <rect x="287.0" y="96" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <rect x="302.0" y="96" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <rect x="287.0" y="111" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <rect x="302.0" y="111" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <text x="302" y="196" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">bilinear</text>
  <text x="302" y="216" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">2 × 2</text>
  <text x="302" y="246" text-anchor="middle" font-size="13" fill="#1F5C3A" font-weight="700">58 s</text>
  <text x="302" y="264" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">national reproject</text>
  <rect x="400" y="62" width="164" height="214" rx="8" fill="none" stroke="#5BA8C8" stroke-width="1.1" opacity="0.5"/>
  <rect x="452.0" y="96" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <rect x="467.0" y="96" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <rect x="482.0" y="96" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <rect x="497.0" y="96" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <rect x="452.0" y="111" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <rect x="467.0" y="111" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <rect x="482.0" y="111" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <rect x="497.0" y="111" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <rect x="452.0" y="126" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <rect x="467.0" y="126" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <rect x="482.0" y="126" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <rect x="497.0" y="126" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <rect x="452.0" y="141" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <rect x="467.0" y="141" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <rect x="482.0" y="141" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <rect x="497.0" y="141" width="13.5" height="13.5" rx="1" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <text x="482" y="196" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">cubic</text>
  <text x="482" y="216" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">4 × 4</text>
  <text x="482" y="246" text-anchor="middle" font-size="13" fill="#7A4A1A" font-weight="700">121 s</text>
  <text x="482" y="264" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">national reproject</text>
  <rect x="580" y="62" width="164" height="214" rx="8" fill="none" stroke="#F4A261" stroke-width="1.1" opacity="0.5"/>
  <rect x="626.0" y="96.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="638.0" y="96.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="650.0" y="96.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="662.0" y="96.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="674.0" y="96.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="686.0" y="96.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="626.0" y="108.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="638.0" y="108.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="650.0" y="108.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="662.0" y="108.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="674.0" y="108.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="686.0" y="108.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="626.0" y="120.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="638.0" y="120.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="650.0" y="120.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="662.0" y="120.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="674.0" y="120.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="686.0" y="120.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="626.0" y="132.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="638.0" y="132.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="650.0" y="132.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="662.0" y="132.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="674.0" y="132.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="686.0" y="132.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="626.0" y="144.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="638.0" y="144.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="650.0" y="144.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="662.0" y="144.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="674.0" y="144.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="686.0" y="144.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="626.0" y="156.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="638.0" y="156.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="650.0" y="156.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="662.0" y="156.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="674.0" y="156.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <rect x="686.0" y="156.0" width="10.5" height="10.5" rx="1" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.9"/>
  <text x="662" y="196" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">lanczos</text>
  <text x="662" y="216" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">6 × 6</text>
  <text x="662" y="246" text-anchor="middle" font-size="13" fill="#7A4A1A" font-weight="700">372 s</text>
  <text x="662" y="264" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">national reproject</text>
  <rect x="760" y="62" width="164" height="214" rx="8" fill="none" stroke="#5BA8C8" stroke-width="1.1" opacity="0.5"/>
  <rect x="800" y="96" width="84" height="60" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2" stroke-dasharray="4 3"/>
  <text x="842" y="132" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">variable</text>
  <text x="842" y="196" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">average</text>
  <text x="842" y="216" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">mapped window</text>
  <text x="842" y="246" text-anchor="middle" font-size="13" fill="#1F5C3A" font-weight="700">96 s</text>
  <text x="842" y="264" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">national reproject</text>
  <rect x="40" y="300" width="876" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="478.0" y="321" text-anchor="middle" font-size="11.5" fill="currentColor">Lanczos costs nine times nearest for a difference no downstream capacity model can resolve. Spend the</text>
  <text x="478.0" y="338" text-anchor="middle" font-size="11.5" fill="currentColor">time only where the surface is genuinely being interpolated, not where it is being warped.</text>
</svg>

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
  <rect class="svg-bg" x="0" y="0" width="820" height="300"/>
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


## Worked example: one raster, four operations, four kernels

A single national GHI product moving through a siting pipeline touches four operations, and the
right kernel differs at each step — which is why a project-wide default is always wrong somewhere.

Reprojecting the source from its native geographic grid to an equal-area frame is a warp of a
continuous surface, so bilinear is correct: it introduces no values outside the local neighbourhood
and produces no blocking. Nearest would preserve the exact source values while making the field
visibly stepped, which matters because the next stage takes gradients across it.

Downsampling that reprojected field from 1 kilometre to 4 kilometres for a portfolio screen is an
aggregation, not an interpolation, and `average` is the honest kernel: each output cell should
represent the mean of the source cells that fall inside it. Bilinear at a 4:1 downsample samples
only four of the sixteen contributing cells and produces a value that is neither the centre nor the
mean.

Aligning the exclusion mask that accompanies the field is a categorical operation and must use
nearest. The mask holds class codes — protected, buildable, unknown — and any averaging kernel
produces intermediate values that are not classes at all. The failure is quiet: a bilinear resample
of a 0/1 mask yields a field of fractions, and a downstream `mask > 0` test then includes every
partially covered cell.

Finally, upsampling the resulting suitability surface for cartographic output is the one place cubic
convolution earns its overshoot: the surface is smooth, the output is for display, and the values
are no longer being fed into an arithmetic chain. Even there, the overshoot has to be clamped if the
display carries a legend with a stated range, because cubic will produce values outside it.

## Frequently asked questions

### Why does nearest-neighbour resampling shift features slightly?

Because it snaps each output cell to whichever source cell centre is closest, which is a shift of up
to half a source cell. On a 30 metre DEM that is 15 metres — invisible on a national map and
material at a parcel boundary. When the geometry matters more than the exact pixel values and the
data is continuous, bilinear removes the shift at the cost of introducing interpolated values.

### What nodata value should a float raster use?

`NaN`, with the nodata attribute declared in the profile. Sentinel values such as −9999 survive
arithmetic silently — a mean over a tile with undeclared sentinels is dragged down by them, and the
result looks like a real trench in the field. `NaN` propagates instead of contaminating, which turns
a wrong answer into an obviously missing one.

### Should compression be applied before or after resampling?

After, always, and with a predictor suited to the data. Compressing then resampling means
decompressing the whole product to read it, and lossy settings interact badly with subsequent
interpolation. LZW with a horizontal predictor on float data typically halves the size at no
precision cost, which is a better trade than any lossy option in this domain.

### Does the resampling kernel affect the audit trail?

It should be part of it. Two products built from the same source with different kernels differ by
amounts that matter at the tail of a distribution, and the difference is not recoverable from the
outputs. Record the kernel, the source and target resolutions and the nodata handling alongside the
result, the same way a reprojection records its transformation pipeline.

### Is there a kernel that is safe for both continuous and categorical data?

No, and looking for one is the mistake. Nearest is the only kernel that never invents values, so it
is the only safe choice for categorical data; every other kernel exists precisely because it does
invent values, which is what interpolating a continuous surface means. Dispatch the kernel from the
declared data type rather than choosing one for the pipeline.


### Does the order of reprojection and resampling matter?

Yes, and combining them into one warp is both faster and more accurate than doing them in sequence.
A separate resample followed by a reproject interpolates twice, and each interpolation smooths the
field a little further; a single warp with an explicit target transform and resolution interpolates
once. Where a two-step is unavoidable, do the reprojection first and the aggregation second, so the
smoothing happens on the frame the output actually uses.

### How should a mask be resampled alongside its data?

Separately, with nearest, and then re-applied — never warped along with the data as if it were a
band. The mask carries class codes and the data carries measurements, so the two need different
kernels by definition. Warping them together is the most common route to a mask of fractional values
that no longer means anything, and the symptom appears far downstream as an exclusion layer that
quietly includes partially covered cells.


### What resolution should a suitability surface be published at?

The coarsest resolution that still resolves the decision being made, and no finer. Publishing a 10
metre suitability surface derived from 4 kilometre irradiance data implies a precision the inputs do
not carry, and reviewers reasonably read the resolution as a claim about accuracy. Where inputs of
different resolutions are combined, the output resolution should follow the coarsest input that
materially drives the result, with the input resolutions recorded alongside.

### How should a resample be validated?

By checking the invariants the kernel is supposed to preserve. An `average` downsample should
conserve the area-weighted mean of the source within floating-point tolerance; a nearest resample
should introduce no value that is not already in the source; any kernel should leave the extent and
the nodata mask consistent. Those three assertions catch most misconfigured warps, and all three are
cheap enough to run in CI on a small fixture.

## Related

- [Solar & Wind Resource Modeling Workflows](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/) — the pipeline overview these kernel choices feed into at every stage.
- [Solar Irradiance Raster Processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) — where reproject-and-resample harmonizes GHI/DNI grids onto the terrain.
- [Temporal Data Aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) — the mean-vs-sum and P50/P90 rules applied to full time series.
- [Projection & CRS Quick Reference](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/projection-and-crs-quick-reference/) — pick the target projection before you pick the kernel.
- [Spatial Data Quality & Validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) — the masking and nodata discipline that keeps resampling honest.
