---
title: Temporal Data Aggregation
description: A production Python workflow for aggregating high-frequency solar and wind raster time-series into daily, monthly, and seasonal statistics — CRS-stable resampling, memory-safe dask chunking, physics-correct reduction, and audit-ready compliance metadata for energy resource assessment.
slug: temporal-data-aggregation
type: guide
breadcrumb: Temporal Data Aggregation
datePublished: 2025-09-22
dateModified: 2026-06-26
---

# Temporal Data Aggregation

High-frequency meteorological datasets form the computational backbone of renewable resource assessment, but the failure mode this workflow addresses is *temporal reduction that silently corrupts the very numbers a project finance model treats as ground truth*. Raw hourly or sub-hourly measurements capture diurnal cycles, ramp events, and microclimatic variability, yet they are prohibitive for portfolio-scale yield modeling, interconnection studies, and regulatory submissions. The instant those granular stacks are resampled to daily, monthly, or seasonal intervals without a disciplined contract, three errors enter unannounced: the aggregation window drifts because timestamps were never normalised to UTC, the engine exhausts RAM and is OOM-killed on a multi-year stack, and an arithmetic mean is applied where energy conservation demands a sum or a non-linear integration. None of these raise an exception — they surface during regulatory review or financial close, when rework is most expensive. This page sits within the broader [Solar & Wind Resource Modeling Workflows](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/) architecture and defines the reduction discipline that capacity factor estimation, compliance reporting, and grid integration analysis all depend on.

The goal is not "call `.resample()` and ship the array." It is a deterministic, auditable reduction contract: every input is tagged with a confirmed [coordinate reference system](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) and a UTC-normalised time index on ingestion, every reduction records its frequency, aggregator, and missing-data policy, and every output is gated by a coverage assertion before it can feed a yield model. That contract is what makes an aggregated capacity factor defensible when an independent engineer asks how it was produced.

## Why naive temporal reduction fails

The intuition that "downsampling is just averaging over a window" is the root cause of most aggregation-induced error in energy GIS. Three traps compound, and each maps to a distinct correction stage.

The first is **calendar-boundary drift**. `xarray` and `pandas` resample on calendar-month boundaries (`'MS'`, `'ME'`) in whatever time zone the index carries. Reanalysis and satellite exports — NSRDB, ERA5, Solcast, NASA POWER — store timestamps in UTC, so resampling to *local* calendar months without an explicit `tz_convert` shifts every window by 5–8 hours. Partial-day irradiance leaks across month boundaries and inflates or deflates peak statistics. CRS drift compounds this when raster stacks are merged from different providers: a reduction performed before a consistent projected frame is enforced bakes spatial misalignment into every monthly slice.

The second is the **memory spike**. Portfolio-scale NetCDF and GeoTIFF time-series routinely exceed available RAM. A single ten-year hourly GHI stack at 1 km resolution easily exceeds 50 GB. Calling `.resample()` on an unchunked array forces full in-memory materialisation, triggering a `MemoryError`, OS swap thrashing, or a dask scheduler deadlock — most often when temporal reduction is combined with a spatial operation such as terrain masking from a [terrain and shadow analysis pipeline](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/).

The third is the **physics violation**. Solar irradiance and wind power are non-linear in their driving variables, so the choice of aggregator is a modelling decision, not a formatting one. An arithmetic mean over a 24-hour window dilutes daylight hours and misrepresents the capacity factor; wind power scales with the cube of wind speed, so a mean of speeds understates available power density. Energy-conserving reduction integrates the underlying flux or fits the appropriate distribution before collapsing the axis.

<svg viewBox="0 0 880 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Failure-to-correction flow: three temporal-reduction traps — calendar-boundary drift, unbounded memory, and physics violation — each mapped to a corrective stage (UTC normalisation, lazy chunking, energy-correct reduction), all converging on a single compliant monthly NetCDF output" style="width:100%;max-width:880px;height:auto;font-family:inherit;">
  <rect class="svg-bg" x="0" y="0" width="880" height="360"/>
  <title>Three Aggregation Traps and Their Corrective Stages</title>
  <desc>A left-to-right flow diagram in three columns. The left column lists three failure modes drawn with dashed borders: calendar-boundary drift, where a local month boundary does not match the UTC window and partial-day irradiance leaks; unbounded memory, where a ten-year hourly stack over 50 gigabytes triggers an out-of-memory kill; and a physics violation, where an arithmetic mean dilutes the capacity factor and the mean of wind speed is not the mean of its cube. Each failure maps by an arrow to a corrective stage in the middle column: convert to UTC before resampling, chunk lazily along the time axis, and apply an energy-correct reduction with a coverage mask. The three corrective stages then converge through a shared bus into a single highlighted output node on the right, a capacity-factor-compliant monthly NetCDF carrying UTC, EPSG:32612, and an audited coverage mask.</desc>
  <defs>
    <marker id="ta-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="880" height="360" fill="none"/>
  <!-- Column headers -->
  <text x="141" y="22" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700" opacity="0.7" letter-spacing="0.5">FAILURE MODE</text>
  <text x="465" y="22" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700" opacity="0.7" letter-spacing="0.5">CORRECTION STAGE</text>
  <text x="768" y="22" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700" opacity="0.7" letter-spacing="0.5">DEFENSIBLE OUTPUT</text>
  <!-- Failure nodes (dashed = trap) -->
  <rect x="16" y="34" width="250" height="86" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="141" y="66" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">Calendar-boundary drift</text>
  <text x="141" y="88" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">local month &#8800; UTC window</text>
  <text x="141" y="106" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">partial-day irradiance leaks</text>
  <rect x="16" y="144" width="250" height="86" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="141" y="176" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">Unbounded memory</text>
  <text x="141" y="198" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">10-yr hourly stack &gt; 50 GB</text>
  <text x="141" y="216" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">OOM kill &#183; swap thrash</text>
  <rect x="16" y="254" width="250" height="86" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="141" y="286" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">Physics violation</text>
  <text x="141" y="308" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">mean dilutes capacity factor</text>
  <text x="141" y="326" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">mean of v &#8800; mean of v&#179;</text>
  <!-- Corrective stages (solid) -->
  <rect x="330" y="34" width="270" height="86" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="465" y="66" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">tz_convert &#8594; UTC</text>
  <text x="465" y="88" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">normalise before .resample()</text>
  <text x="465" y="106" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">unambiguous month windows</text>
  <rect x="330" y="144" width="270" height="86" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="465" y="176" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">Chunk lazily</text>
  <text x="465" y="198" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">time=720 &#183; x/y=512 &#183; float32</text>
  <text x="465" y="216" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">out-of-core dask graph</text>
  <rect x="330" y="254" width="270" height="86" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="465" y="286" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">Energy-correct reduce</text>
  <text x="465" y="308" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">sum / cube / Weibull</text>
  <text x="465" y="326" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">+ coverage mask</text>
  <!-- Failure -> Correction arrows -->
  <line x1="266" y1="77"  x2="324" y2="77"  stroke="currentColor" stroke-width="1.5" marker-end="url(#ta-arr)"/>
  <line x1="266" y1="187" x2="324" y2="187" stroke="currentColor" stroke-width="1.5" marker-end="url(#ta-arr)"/>
  <line x1="266" y1="297" x2="324" y2="297" stroke="currentColor" stroke-width="1.5" marker-end="url(#ta-arr)"/>
  <!-- Convergence bus into output -->
  <line x1="600" y1="77"  x2="636" y2="77"  stroke="currentColor" stroke-width="1.5"/>
  <line x1="600" y1="187" x2="636" y2="187" stroke="currentColor" stroke-width="1.5"/>
  <line x1="600" y1="297" x2="636" y2="297" stroke="currentColor" stroke-width="1.5"/>
  <line x1="636" y1="77"  x2="636" y2="297" stroke="currentColor" stroke-width="1.5"/>
  <line x1="636" y1="187" x2="672" y2="187" stroke="currentColor" stroke-width="1.5" marker-end="url(#ta-arr)"/>
  <!-- Output node (highlighted terminal artifact) -->
  <rect x="674" y="127" width="190" height="120" rx="7" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"/>
  <text x="769" y="166" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">CF-compliant</text>
  <text x="769" y="184" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">monthly NetCDF</text>
  <text x="769" y="208" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">UTC &#183; EPSG:32612</text>
  <text x="769" y="226" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">coverage-masked &#183; audited</text>
</svg>

## Prerequisites & data requirements

This workflow assumes a Python 3.11+ environment with `xarray>=2024.3`, `rioxarray>=0.15`, `dask>=2024.3`, `geopandas>=0.14`, and `pandas>=2.1`. Inputs are labelled raster time-series — NetCDF, GeoTIFF stacks, or Zarr — each carrying a `time` dimension and, ideally, embedded CRS metadata recoverable through `rioxarray`. The non-negotiable preconditions are:

- **A confirmed time index in UTC.** Verify the index is timezone-aware and convert to UTC before any resampling. A naive `datetime64` index with an implicit local offset is the single most common source of boundary drift.
- **A deliberate target CRS with an EPSG integer.** Energy distance and area work must run in a projected metre-based frame — for example EPSG:32612 (UTM Zone 12N) for Arizona/Utah longitudes — never in EPSG:4326 degrees. Reduction must occur after the stack is on a single grid so that pixel-wise statistics stay geometrically valid, the same metadata-first discipline applied to [open energy data portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/).
- **Known native sampling cadence.** The expected number of observations per period (24 hourly, 48 half-hourly) drives the coverage mask. Without it, a partially populated month silently passes as complete.
- **Upstream geometry validity.** Source rasters that have already passed [spatial data quality validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) avoid NaN bleed and nodata contamination propagating into aggregated cells.

Optimal chunk sizing depends on storage layout and access pattern. For temporal reduction, chunk along the `time` dimension (roughly 24–72 hours per chunk, or `time=720` for month-scale blocks) while keeping full spatial coverage per chunk; this minimises I/O on cloud-optimised formats and aligns chunk boundaries with resampling windows. For distributed vector–raster operations that need spatial indexing alongside reduction, pair chunked `xarray` with `dask-geopandas`.

## Core implementation: a CRS-stable monthly reduction

The function below performs the full happy path: explicit chunking for out-of-core computation, UTC normalisation, CRS enforcement after [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/), named aggregation with a missing-data threshold, and a compliant write. Variable names are energy-specific and CRS values carry their EPSG integer for searchability.

```python
import logging
from pathlib import Path

import numpy as np
import xarray as xr
import rioxarray  # noqa: F401 — registers the .rio accessor

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

TARGET_EPSG = "EPSG:32612"   # UTM Zone 12N — adjust per project region
AGG_FREQ = "ME"              # month-end calendar boundary
MAX_MISSING_PCT = 0.15       # mask a period with >15% missing observations
OBS_PER_DAY = 24             # native hourly cadence


def aggregate_temporal_raster(
    input_nc: Path,
    output_nc: Path,
    variable: str = "ghi",
    agg_method: str = "mean",
    target_crs: str = TARGET_EPSG,
) -> Path:
    """Aggregate an hourly solar/wind raster stack to monthly statistics.

    Enforces UTC time alignment, a projected CRS, and a coverage mask so that
    capacity-factor inputs are geometrically and temporally defensible.
    """
    logging.info("Loading temporal raster: %s", input_nc)

    # Open lazily with explicit chunks for memory-safe out-of-core computation.
    ghi_stack = xr.open_dataset(
        input_nc, chunks={"time": 720, "x": 512, "y": 512}
    )

    if variable not in ghi_stack.data_vars:
        raise ValueError(f"Variable '{variable}' not found in dataset.")
    if "time" not in ghi_stack[variable].dims:
        raise ValueError("Dataset must contain a 'time' dimension.")

    # Temporal contract: force UTC so calendar-month windows are unambiguous.
    time_index = ghi_stack.indexes["time"]
    if getattr(time_index, "tz", None) is not None:
        ghi_stack = ghi_stack.assign_coords(time=time_index.tz_convert("UTC").tz_localize(None))

    # Spatial contract: enforce a single projected CRS before any reduction.
    source_crs = ghi_stack.rio.crs
    if source_crs is None:
        raise RuntimeError("Input lacks CRS metadata; cannot reduce safely.")
    if str(source_crs) != target_crs:
        logging.info("Reprojecting %s -> %s", source_crs, target_crs)
        ghi_stack = ghi_stack.rio.reproject(target_crs)

    da = ghi_stack[variable]
    resampler = da.resample(time=AGG_FREQ)

    aggregators = {
        "mean": lambda r: r.mean(skipna=True),   # GHI/DNI energy balance
        "sum": lambda r: r.sum(skipna=True, min_count=1),  # accumulated energy
        "max": lambda r: r.max(skipna=True),     # extreme-value analysis
    }
    if agg_method not in aggregators:
        raise ValueError(f"Unsupported agg_method '{agg_method}'.")
    aggregated = aggregators[agg_method](resampler)

    # Coverage mask: drop periods missing more than the allowed fraction.
    valid_count = da.resample(time=AGG_FREQ).count()
    days_in_period = aggregated["time"].dt.days_in_month
    expected = (days_in_period * OBS_PER_DAY).astype("float32")
    missing_ratio = 1.0 - (valid_count / expected)
    aggregated = aggregated.where(missing_ratio <= MAX_MISSING_PCT)

    # Compliance metadata travels with the array.
    aggregated.attrs.update({
        "temporal_aggregation": AGG_FREQ,
        "aggregation_method": agg_method,
        "missing_data_threshold": MAX_MISSING_PCT,
        "spatial_crs": target_crs,
        "time_reference": "UTC",
        "processing_standard": "NREL_GIS_v2.1",
    })

    aggregated.rio.write_crs(target_crs, inplace=True)
    aggregated.to_netcdf(
        output_nc,
        encoding={variable: {"zlib": True, "complevel": 5, "dtype": "float32"}},
        mode="w",
    )
    logging.info("Aggregation complete -> %s", output_nc)
    return output_nc
```

The expected-observations term derives from `days_in_month`, which keeps the coverage mask correct across months of unequal length and leap years rather than assuming a fixed period size. The same pattern extends to daily (`AGG_FREQ = "D"`) or seasonal (`AGG_FREQ = "QS-DEC"`) reductions by swapping the frequency string and the `expected` denominator.

## Selecting a statistically valid aggregator

The aggregation function encodes a physical assumption, so it must be chosen per variable. Global horizontal irradiance (GHI) and direct normal irradiance (DNI) are fluxes in W·m⁻²; their arithmetic mean over a period preserves energy balance and feeds capacity factor directly. The dimensionless capacity factor over a window is the realised energy divided by the energy at continuous rated output:

<svg viewBox="0 0 940 392" role="img" aria-label="Why an annual average built from twelve monthly averages is not the annual average. February contributes 28 days and July 31, but a mean of monthly means weights them equally. For a site whose monthly mean GHI runs from 2.31 kilowatt-hours per square metre per day in December to 7.84 in June, the mean of the twelve monthly means is 5.093 while the day-weighted annual mean is 5.116 — a 0.45 percent difference that propagates directly into an annual energy estimate." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Mean of monthly means versus the day-weighted annual mean</title>
  <desc>A chart of twelve monthly mean daily GHI values from 2.31 in December to 7.84 in June, each bar drawn with a width proportional to the number of days in that month. Two horizontal lines mark the two candidate annual figures: the unweighted mean of the twelve monthly means at 5.093 kilowatt-hours per square metre per day, and the day-weighted annual mean at 5.116. The difference of 0.45 percent is annotated, with a note that the longer summer months are systematically under-weighted by the unweighted mean.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="392"/>
  <defs><marker id="mw-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Twelve monthly means, weighted by the days they represent</text>
  <rect x="60" y="195.98139534883722" width="68.34246575342465" height="66.01860465116279" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="94.17123287671232" y="280" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">J</text>
  <text x="94.17123287671232" y="187.98139534883722" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.85">3.02</text>
  <rect x="131.34246575342465" y="175.86976744186046" width="61.43835616438356" height="86.13023255813954" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="162.06164383561642" y="280" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">F</text>
  <text x="162.06164383561642" y="167.86976744186046" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.85">3.94</text>
  <rect x="195.78082191780823" y="150.07441860465116" width="68.34246575342465" height="111.92558139534884" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="229.95205479452056" y="280" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">M</text>
  <text x="229.95205479452056" y="142.07441860465116" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.85">5.12</text>
  <rect x="267.1232876712329" y="122.53023255813952" width="66.04109589041096" height="139.46976744186048" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="300.14383561643837" y="280" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">A</text>
  <text x="300.14383561643837" y="114.53023255813952" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.85">6.38</text>
  <rect x="336.16438356164383" y="102.20000000000002" width="68.34246575342465" height="159.79999999999998" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="370.33561643835617" y="280" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">M</text>
  <text x="370.33561643835617" y="94.20000000000002" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.85">7.31</text>
  <rect x="407.5068493150685" y="90.61395348837209" width="66.04109589041096" height="171.3860465116279" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="440.527397260274" y="280" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">J</text>
  <text x="440.527397260274" y="82.61395348837209" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.85">7.84</text>
  <rect x="476.54794520547944" y="95.42325581395349" width="68.34246575342465" height="166.5767441860465" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="510.7191780821918" y="280" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">J</text>
  <text x="510.7191780821918" y="87.42325581395349" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.85">7.62</text>
  <rect x="547.8904109589041" y="110.28837209302324" width="68.34246575342465" height="151.71162790697676" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="582.0616438356165" y="280" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">A</text>
  <text x="582.0616438356165" y="102.28837209302324" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.85">6.94</text>
  <rect x="619.2328767123288" y="134.553488372093" width="66.04109589041096" height="127.44651162790699" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="652.2534246575343" y="280" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">S</text>
  <text x="652.2534246575343" y="126.553488372093" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.85">5.83</text>
  <rect x="688.2739726027397" y="165.37674418604652" width="68.34246575342465" height="96.62325581395348" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="722.445205479452" y="280" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">O</text>
  <text x="722.445205479452" y="157.37674418604652" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.85">4.42</text>
  <rect x="759.6164383561644" y="191.1720930232558" width="66.04109589041096" height="70.82790697674419" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="792.6369863013699" y="280" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">N</text>
  <text x="792.6369863013699" y="183.1720930232558" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.85">3.24</text>
  <rect x="828.6575342465753" y="211.50232558139535" width="68.34246575342465" height="50.49767441860465" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="862.8287671232877" y="280" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">D</text>
  <text x="862.8287671232877" y="203.50232558139535" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.85">2.31</text>
  <line x1="60" y1="262" x2="900" y2="262" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="60" y1="145.46550387596898" x2="900" y2="145.46550387596898" stroke="#F4A261" stroke-width="1.6" stroke-dasharray="6 4"/>
  <text x="906" y="149.46550387596898" text-anchor="start" font-size="11" fill="#7A4A1A" font-weight="700">5.331</text>
  <line x1="60" y1="145.33339280025487" x2="900" y2="145.33339280025487" stroke="#3D8B5F" stroke-width="1.6"/>
  <text x="906" y="137.33339280025487" text-anchor="start" font-size="11" fill="#1F5C3A" font-weight="700">5.337</text>
  <rect x="60" y="300" width="412" height="48" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="266.0" y="321" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">mean of 12 monthly means</text>
  <text x="266.0" y="338" text-anchor="middle" font-size="12" fill="currentColor">5.331 kWh/m²·day</text>
  <rect x="492" y="300" width="412" height="48" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="698.0" y="321" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">day-weighted annual mean</text>
  <text x="698.0" y="338" text-anchor="middle" font-size="12" fill="currentColor">5.337 kWh/m²·day — the one to report</text>
  <text x="60" y="376" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">Difference 0.11% — it lands straight in the annual energy estimate.</text>
</svg>

$$ \text{CF} = \frac{\sum_{t} P_t \,\Delta t}{P_{\text{rated}} \, T} $$

where $P_t$ is instantaneous power, $\Delta t$ the sample interval, and $T$ the window length. Because $P_t$ is non-linear in irradiance and wind speed, collapsing the time axis *before* applying the power curve discards the variance the curve responds to.

Wind is the sharper case. Power density scales with the cube of wind speed:

$$ \bar{P} \propto \overline{v^3} \neq \bar{v}^3 $$

so a monthly mean of `wind_speed_ms` understates available power whenever the speed distribution has any spread. Aggregate the cube (or fit Weibull shape and scale parameters per period) rather than the speed itself, and only then evaluate the turbine power curve — the convention used throughout [wind speed and direction modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/). Extreme-value statistics — 95th-percentile gusts, maximum module temperature — require `max` or a `percentile` reducer, never a mean, because the engineering question is about the tail, not the centre.

## Error handling & edge cases

The three failure modes named in the framing each need an explicit guard rather than a hope that the data is clean.

<svg viewBox="0 0 940 400" role="img" aria-label="The two resample arguments that decide which hour lands in which bucket. With closed set to left and label set to left — the pandas default for most frequencies — an hourly series resampled to daily puts 00:00 through 23:00 into the day stamped 00:00. With closed set to right, 01:00 through 00:00 of the next day fall into the earlier stamp, shifting every daily total by one hour of generation. Neither is wrong; leaving it implicit is." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>closed and label decide which hour belongs to which day</title>
  <desc>Two timelines of hourly samples across a day boundary. In the first, closed equals left and label equals left: the bucket stamped at midnight contains the samples from 00:00 through 23:00, and the next bucket starts at the following midnight. In the second, closed equals right: the bucket stamped at midnight contains 01:00 through 00:00 of the next day, so one hour of generation moves from each day into the previous one. An annotation notes that the difference is invisible in an annual total and obvious in a daily comparison against metered data.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="cl2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Same hourly series, two bucket definitions</text>
  <text x="40" y="76" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">closed='left', label='left'</text>
  <rect x="60" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="94" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="128" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="162" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="196" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="230" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="264" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="298" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="332" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="366" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="400" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="434" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="468" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="502" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="536" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="570" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="604" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="638" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="672" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="706" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="740" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="774" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="808" y="92" width="28" height="40" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1"/>
  <rect x="842" y="92" width="28" height="40" rx="3" fill="none" stroke="#3D8B5F" stroke-width="1.1" opacity="0.35"/>
  <line x1="60" y1="144" x2="870" y2="144" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <text x="74" y="160" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.8">00:00</text>
  <text x="448" y="160" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.8">11:00</text>
  <text x="856" y="160" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.8">23:00</text>
  <line x1="870" y1="84" x2="870" y2="140" stroke="currentColor" stroke-width="1.6" stroke-dasharray="4 3"/>
  <text x="860" y="84" text-anchor="end" font-size="10.5" fill="currentColor" font-weight="700">bucket edge</text>
  <text x="40" y="226" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">closed='right', label='left'</text>
  <rect x="60" y="242" width="28" height="40" rx="3" fill="none" stroke="#F4A261" stroke-width="1.1" opacity="0.35"/>
  <rect x="94" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="128" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="162" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="196" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="230" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="264" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="298" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="332" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="366" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="400" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="434" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="468" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="502" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="536" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="570" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="604" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="638" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="672" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="706" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="740" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="774" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="808" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <rect x="842" y="242" width="28" height="40" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <line x1="60" y1="294" x2="870" y2="294" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <text x="74" y="310" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.8">00:00</text>
  <text x="448" y="310" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.8">11:00</text>
  <text x="856" y="310" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.8">23:00</text>
  <line x1="60" y1="234" x2="60" y2="290" stroke="currentColor" stroke-width="1.6" stroke-dasharray="4 3"/>
  <text x="70" y="234" text-anchor="start" font-size="10.5" fill="currentColor" font-weight="700">bucket edge</text>
  <rect x="40" y="344" width="864" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="472.0" y="365" text-anchor="middle" font-size="11.5" fill="currentColor">The two definitions differ by exactly one hour of generation per day. In an annual total that is invisible;</text>
  <text x="472.0" y="382" text-anchor="middle" font-size="11.5" fill="currentColor">in a daily comparison against metered data it is a persistent, unexplained offset.</text>
</svg>

**Calendar-boundary drift.** Confirm the index is UTC before reduction and refuse to proceed on a naive index whose offset cannot be established:

```python
import pandas as pd


def assert_utc_time_axis(da: xr.DataArray) -> None:
    """Fail loudly when the time axis cannot be trusted for calendar windows."""
    idx = pd.DatetimeIndex(da["time"].values)
    if idx.tz is not None and str(idx.tz) != "UTC":
        raise ValueError(f"Time axis is {idx.tz}; convert to UTC before resampling.")
    if not idx.is_monotonic_increasing:
        raise ValueError("Time axis is not monotonic; sort before resampling.")
    gaps = idx.to_series().diff().dropna().unique()
    if len(gaps) > 1:
        logging.warning("Irregular sampling cadence detected: %s", gaps)
```

**Memory spike.** A stack that was opened eagerly, or a reduction that triggers a full graph compute, will exceed RAM. Verify the array is dask-backed and bound the chunk footprint before computing:

```python
def assert_lazy_and_bounded(da: xr.DataArray, max_chunk_mb: float = 256.0) -> None:
    """Guard against eager materialisation and oversized chunks."""
    if da.chunks is None:
        raise RuntimeError("Array is not chunked; reopen with chunks={...} for out-of-core.")
    bytes_per_chunk = np.prod([max(c) for c in da.chunks]) * da.dtype.itemsize
    if bytes_per_chunk / 1e6 > max_chunk_mb:
        raise ValueError(
            f"Chunk footprint {bytes_per_chunk / 1e6:.0f} MB exceeds {max_chunk_mb} MB; "
            "reduce time/x/y chunk sizes."
        )
```

**Sparse periods and nodata bleed.** Months with sensor outages must not present as low-irradiance signal. The coverage mask in the core function handles the common case; for provider stacks that encode gaps as a sentinel rather than NaN, convert sentinels to NaN on ingestion so `skipna` and `.count()` behave, and never let a reprojection resample nodata into valid cells — use `nearest` or `average` with an explicit `nodata=np.nan` rather than `bilinear` across a mask edge.

## Performance & scalability across portfolios

Single-site routines rarely scale to multi-asset portfolios spanning hundreds of square kilometres. Distributing reduction across a compute cluster requires decoupling I/O, computation, and metadata registration so that no single stage blocks the pipeline. Three levers carry most of the gain:

- **Chunk to the reduction window.** Align `time` chunks with the resampling period (`time=720` for monthly) so each worker reduces a self-contained block with no cross-chunk shuffle. Mismatched chunks force dask to rechunk mid-graph, the most common cause of unexpected memory pressure.
- **Push reduction down to storage.** Zarr and cloud-optimised GeoTIFF allow windowed reads; reduce per region of interest rather than materialising the national grid, mirroring the spatial scoping used for [grid capacity buffer analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) when only assets near a corridor matter.
- **Dispatch chunked jobs through a task queue.** Wrapping the aggregation function in Celery or Prefect tasks gives parallel execution of per-region jobs, automatic retry on transient object-store failures, and centralised logging for audit trails. Consolidate outputs through a single result store so that regional archives process concurrently while each job keeps its own spatial validation boundary.

Profile with the dask dashboard before scaling out: a graph that spills to disk on one worker signals an oversized chunk, not a need for more nodes.

## Validation & audit trail

Temporal aggregation is a compliance prerequisite, not a convenience. Interconnection authorities and permitting agencies require aggregated datasets that document temporal resolution, CRS provenance, and missing-data handling. Gate every output with a post-processing assertion that emits a structured record suitable for a CI/CD permitting check:

```python
def audit_aggregated_output(output_nc: Path, variable: str = "ghi") -> dict:
    """Assert reduced-raster integrity and emit a compliance record."""
    result = xr.open_dataset(output_nc)
    da = result[variable]

    assert result.rio.crs is not None, "Output missing CRS metadata"
    assert da.dtype == np.float32, f"Expected float32, got {da.dtype}"
    assert "temporal_aggregation" in da.attrs, "Missing aggregation provenance"

    record = {
        "status": "PASS",
        "variable": variable,
        "crs": str(result.rio.crs),
        "epsg": result.rio.crs.to_epsg(),
        "periods": int(da["time"].size),
        "aggregation": da.attrs.get("temporal_aggregation"),
        "method": da.attrs.get("aggregation_method"),
        "missing_threshold": da.attrs.get("missing_data_threshold"),
        "time_reference": da.attrs.get("time_reference"),
        "masked_cell_fraction": float(np.isnan(da).mean()),
    }
    logging.info("Audit record: %s", record)
    return record
```

The `masked_cell_fraction` is the early-warning signal: a sudden jump between runs means an upstream sensor outage or a coverage threshold that is now too strict, and it should fail the gate before the artifact reaches a yield model. Persist the record alongside the NetCDF so the lineage from raw stack to monthly statistic is reproducible at financial close. For the specific failure modes encountered when moving from hourly to monthly granularity — timezone drift, unbounded memory, and physics-violating means — the focused walkthrough in [resampling hourly solar data to monthly averages](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/resampling-hourly-solar-data-to-monthly-averages/) carries the corrected, runnable correction path.


## Frequently asked questions

### Which timezone should the working series use?

UTC everywhere inside the pipeline, with local time applied only at presentation. A local-time index
duplicates one hour each autumn and drops one each spring, so a year is 8,759 or 8,761 hours rather
than 8,760, and concatenating local-time years silently double-counts the repeated hour. Storing UTC
and rendering local keeps every count exact and every comparison across sites valid.

### Does `closed` or `label` matter for annual totals?

Not for the total, which is why the mistake survives — the same hours are summed either way. It
matters for every daily or monthly comparison against metered data, where the choice shifts one hour
of generation across each boundary and produces a persistent, unexplained offset. Set both
explicitly rather than relying on the frequency-dependent default.

### How should missing intervals be represented?

As `NaN` rows that exist, not as absent rows. A gap that is present and null is visible to a
coverage calculation; a gap that is simply missing looks like a shorter month. Reindex to the
expected frequency after loading, so every reduction can report the fraction of expected intervals
it actually saw alongside its value.

## Related

- [Solar & Wind Resource Modeling Workflows](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/) — the parent architecture this reduction stage feeds.
- [Resampling Hourly Solar Data to Monthly Averages](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/resampling-hourly-solar-data-to-monthly-averages/) — the focused fix for timezone, memory, and energy-conservation failures.
- [Solar Irradiance Raster Processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) — the upstream stage that produces the irradiance stacks reduced here.
- [Wind Speed & Direction Modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/) — cubic and Weibull reduction for wind power density.
- [Terrain & Shadow Analysis Pipelines](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/) — terrain masks that must align with aggregated rasters before yield modelling.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — the projection discipline every reduction depends on.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "headline": "Temporal Data Aggregation",
      "description": "A production Python workflow for aggregating high-frequency solar and wind raster time-series into daily, monthly, and seasonal statistics — CRS-stable resampling, memory-safe dask chunking, physics-correct reduction, and audit-ready compliance metadata for energy resource assessment.",
      "datePublished": "2025-09-22",
      "dateModified": "2026-06-26",
      "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/",
      "author": { "@type": "Organization", "name": "Renewable Energy Grid GIS" },
      "publisher": { "@type": "Organization", "name": "Renewable Energy Grid GIS" },
      "isPartOf": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/",
      "keywords": "temporal aggregation, xarray resample, dask chunking, EPSG:32612, capacity factor, GHI, DNI, Weibull, NetCDF, energy GIS"
    },
    {
      "@type": "HowTo",
      "name": "Aggregate Solar and Wind Raster Time-Series for Resource Assessment",
      "description": "Reduce high-frequency irradiance and wind raster stacks to monthly statistics with UTC alignment, CRS enforcement, coverage masking, and a compliance audit trail.",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Confirm a UTC time index and a deliberate projected CRS before reduction", "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/#prerequisites-data-requirements" },
        { "@type": "HowToStep", "position": 2, "name": "Chunk lazily and resample with a coverage-aware aggregator", "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/#core-implementation-a-crs-stable-monthly-reduction" },
        { "@type": "HowToStep", "position": 3, "name": "Guard calendar drift, memory spikes, and nodata bleed", "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/#error-handling-edge-cases" },
        { "@type": "HowToStep", "position": 4, "name": "Assert output integrity and emit a compliance record", "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/#validation-audit-trail" }
      ]
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.renewable-energy-grid-gis.org/" },
        { "@type": "ListItem", "position": 2, "name": "Solar & Wind Resource Modeling Workflows", "item": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/" },
        { "@type": "ListItem", "position": 3, "name": "Temporal Data Aggregation", "item": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/" }
      ]
    }
  ]
}
</script>
