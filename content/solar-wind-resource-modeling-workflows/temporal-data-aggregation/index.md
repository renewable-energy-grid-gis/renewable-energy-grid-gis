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

$$ \text{CF} = \frac{\sum_{t} P_t \,\Delta t}{P_{\text{rated}} \, T} $$

where $P_t$ is instantaneous power, $\Delta t$ the sample interval, and $T$ the window length. Because $P_t$ is non-linear in irradiance and wind speed, collapsing the time axis *before* applying the power curve discards the variance the curve responds to.

Wind is the sharper case. Power density scales with the cube of wind speed:

$$ \bar{P} \propto \overline{v^3} \neq \bar{v}^3 $$

so a monthly mean of `wind_speed_ms` understates available power whenever the speed distribution has any spread. Aggregate the cube (or fit Weibull shape and scale parameters per period) rather than the speed itself, and only then evaluate the turbine power curve — the convention used throughout [wind speed and direction modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/). Extreme-value statistics — 95th-percentile gusts, maximum module temperature — require `max` or a `percentile` reducer, never a mean, because the engineering question is about the tail, not the centre.

## Error handling & edge cases

The three failure modes named in the framing each need an explicit guard rather than a hope that the data is clean.

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
