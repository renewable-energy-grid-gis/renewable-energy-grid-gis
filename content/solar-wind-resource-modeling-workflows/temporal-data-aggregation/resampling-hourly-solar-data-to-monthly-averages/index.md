---
title: "Resampling Hourly Solar Data to Monthly Averages Without Drift or OOM Kills"
description: Fix the three silent failures that corrupt hourly-to-monthly GHI resampling — UTC-to-local boundary drift, dask OOM kills on multi-year stacks, and energy-violating arithmetic means — with a pre-flight check, an energy-conserving xarray fix, and a CI/CD audit gate.
slug: resampling-hourly-solar-data-to-monthly-averages
type: article
breadcrumb: Hourly to Monthly Resampling
datePublished: 2025-10-12
dateModified: 2026-06-26
---

# Resampling Hourly Solar Data to Monthly Averages Without Drift or OOM Kills

**Scenario / symptom:** an hourly Global Horizontal Irradiance (GHI) stack resampled with `ds["ghi"].resample(time="ME").mean()` produces monthly averages that are 5–8% off the values an independent engineer computes from the same source — or the call never returns and the kernel is killed with `Killed (signal 9)` after RAM exhaustion. Both symptoms land in the temporal reduction stage of [Temporal Data Aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/), where a high-frequency time-series is collapsed to the monthly granularity that yield models and interconnection studies consume. Neither failure raises a clean exception: the numbers are simply wrong, or the process dies, and the cost surfaces at regulatory review or financial close.

High-frequency irradiance stacks are the computational backbone of long-term yield forecasting, but the move from hourly to monthly granularity routinely fractures downstream GIS pipelines. The fix is to normalise the time index to a confirmed timezone, force lazy out-of-core execution, and aggregate in energy units rather than instantaneous power — then gate the result before it can feed a capacity-factor model.

## Root-cause analysis

The pipeline fractures at three independent intersection points. Each one passes silently in isolation, and they compound when a multi-year stack is reduced in a single call.

1. **Timezone & calendar boundary drift.** `pandas` and `xarray` resample to calendar-month boundaries (`'MS'`/`'ME'`) against whatever time index they are handed. NSRDB, ERA5, and Solcast exports store hourly timestamps in UTC. Resampling UTC timestamps to *local* calendar months without an explicit conversion shifts every aggregation window by the local offset (5–8 hours for North American zones), leaking partial-day irradiance across month boundaries and biasing peak values up or down.
2. **Unbounded memory allocation.** An unchunked multi-year raster stack forces full in-memory materialization. A single 10-year hourly GHI stack at 1 km resolution easily exceeds 50 GB. Calling `.resample()` without explicit `dask` chunking triggers scheduler deadlocks or OOM kills, especially when combined with spatial operations such as terrain masking or shadow casting.
3. **Physics violation in aggregation.** An arithmetic mean over a 24-hour window dilutes daylight hours with night-time zeros and misrepresents the capacity factor. Irradiance reduction must conserve energy: sum hourly power to monthly energy, then divide by the count of valid hours. For an average that preserves the energy balance over a month of $N$ valid hourly samples $G_i$ (in W·m⁻²):

$$\bar{G}_{\text{month}} = \frac{\sum_{i=1}^{N} G_i \,\Delta t}{N \,\Delta t} = \frac{1}{N}\sum_{i=1}^{N} G_i \quad \text{with } N \text{ gated by a coverage threshold}$$

The subtlety is not the formula — it is that $N$ must count *valid* hours only, and months below a coverage threshold must be masked rather than reported.

<svg viewBox="0 0 880 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three independent resampling failures and their fixes converging on a single CF-compliant monthly output: timezone drift fixed by tz_localize then tz_convert, unbounded memory fixed by Dask chunking, and physics violation fixed by summing energy over valid hours with a coverage mask" style="width:100%;max-width:880px;height:auto;font-family:inherit;">
  <rect class="svg-bg" x="0" y="0" width="880" height="360"/>
  <title>Three Resampling Failure Modes Mapped to Their Fixes</title>
  <desc>A three-row diagram. Each left-column failure box maps by an arrow to a middle-column fix box, and all three fixes converge through a vertical bus into one right-hand output box. Row one: timezone and calendar drift (a UTC index resampled to a local month-end window shifts every month by five to eight hours) is fixed by tz_localize then tz_convert before any resample. Row two: unbounded memory (a ten-year one-kilometre stack over fifty gigabytes triggers an out-of-memory kill, signal nine) is fixed by Dask chunks of time 720 and x equals y equals 256. Row three: physics violation (an arithmetic mean over twenty-four hours lets night-time zeros dilute the capacity factor) is fixed by summing energy and dividing by valid hours plus a ninety percent coverage mask. The converged output is a CF-compliant monthly NetCDF that is energy-conserving and gated.</desc>
  <defs>
    <marker id="rs-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="880" height="360" fill="none"/>
  <text x="145" y="18" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600" opacity="0.7" letter-spacing="0.5">FAILURE</text>
  <text x="455" y="18" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600" opacity="0.7" letter-spacing="0.5">FIX</text>
  <text x="760" y="18" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600" opacity="0.7" letter-spacing="0.5">OUTPUT</text>
  <!-- Row 1 -->
  <rect x="20" y="30" width="250" height="90" rx="7" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="145" y="62" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">Timezone &amp; calendar drift</text>
  <text x="145" y="84" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">UTC index, local 'ME' window</text>
  <text x="145" y="101" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">shifts every month 5–8 h</text>
  <rect x="330" y="30" width="250" height="90" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="455" y="62" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">tz_localize → tz_convert</text>
  <text x="455" y="84" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">normalise before any resample</text>
  <text x="455" y="101" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">then tz_localize(None)</text>
  <!-- Row 2 -->
  <rect x="20" y="140" width="250" height="90" rx="7" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="145" y="172" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">Unbounded memory</text>
  <text x="145" y="194" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">10-yr 1 km stack &gt; 50 GB</text>
  <text x="145" y="211" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">OOM kill, signal 9</text>
  <rect x="330" y="140" width="250" height="90" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="455" y="172" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">Lazy Dask chunking</text>
  <text x="455" y="194" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">time=720, x=y=256</text>
  <text x="455" y="211" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">execute only at to_netcdf</text>
  <!-- Row 3 -->
  <rect x="20" y="250" width="250" height="90" rx="7" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="145" y="282" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">Physics violation</text>
  <text x="145" y="304" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">arithmetic mean over 24 h</text>
  <text x="145" y="321" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">night zeros dilute the CF</text>
  <rect x="330" y="250" width="250" height="90" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="455" y="282" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">Σ energy ÷ valid hours</text>
  <text x="455" y="304" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">conserve the energy balance</text>
  <text x="455" y="321" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">+ 90% coverage mask</text>
  <!-- Output -->
  <rect x="660" y="130" width="200" height="110" rx="7" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"/>
  <text x="760" y="172" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">CF-compliant</text>
  <text x="760" y="191" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">monthly NetCDF</text>
  <text x="760" y="213" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">energy-conserving, gated</text>
  <!-- Failure -> Fix arrows -->
  <line x1="270" y1="75"  x2="323" y2="75"  stroke="currentColor" stroke-width="1.5" marker-end="url(#rs-arr)"/>
  <line x1="270" y1="185" x2="323" y2="185" stroke="currentColor" stroke-width="1.5" marker-end="url(#rs-arr)"/>
  <line x1="270" y1="295" x2="323" y2="295" stroke="currentColor" stroke-width="1.5" marker-end="url(#rs-arr)"/>
  <!-- Fix -> output convergence bus -->
  <line x1="580" y1="75"  x2="620" y2="75"  stroke="currentColor" stroke-width="1.5"/>
  <line x1="580" y1="185" x2="620" y2="185" stroke="currentColor" stroke-width="1.5"/>
  <line x1="580" y1="295" x2="620" y2="295" stroke="currentColor" stroke-width="1.5"/>
  <line x1="620" y1="75"  x2="620" y2="295" stroke="currentColor" stroke-width="1.5"/>
  <line x1="620" y1="185" x2="653" y2="185" stroke="currentColor" stroke-width="1.5" marker-end="url(#rs-arr)"/>
</svg>

## Pre-flight validation

Before resampling, surface all three root causes in one cheap pass. This validator reads only metadata and the time coordinate — it never materializes the data array — so it is safe to run as the first step of a CI/CD job. It confirms the time index is timezone-explicit, estimates the in-memory footprint, and checks that the stack is chunked.

```python
import xarray as xr
import numpy as np
import pandas as pd


def preflight_resample_check(path: str, var: str = "ghi", ram_budget_gb: float = 16.0) -> dict:
    """Surface tz-drift, OOM, and coverage risks before resampling an hourly GHI stack."""
    ds = xr.open_dataset(path, chunks={})  # open lazily, read metadata only
    da = ds[var]
    report = {"path": path, "ok": True, "warnings": []}

    # 1. Timezone explicitness — naive UTC stacks must be declared before any local resample
    t = pd.DatetimeIndex(da["time"].values)
    if t.tz is None:
        report["warnings"].append(
            "time index is timezone-naive; declare source tz (assume UTC for NSRDB/ERA5) "
            "before resampling to a local calendar month")
    report["inferred_freq"] = pd.infer_freq(t)
    if report["inferred_freq"] not in ("h", "H"):
        report["warnings"].append(f"non-hourly cadence {report['inferred_freq']!r}; coverage math assumes 1 h steps")

    # 2. Memory footprint — float32 element count vs RAM budget
    est_gb = da.size * np.dtype("float32").itemsize / 1024**3
    report["estimated_gb"] = round(est_gb, 2)
    if est_gb > ram_budget_gb and not da.chunks:
        report["warnings"].append(
            f"unchunked {est_gb:.1f} GB array exceeds {ram_budget_gb} GB budget; "
            "open with chunks={'time': 720, 'y': 256, 'x': 256}")

    # 3. Coverage — months that cannot reach the threshold should be flagged early
    months = t.to_period("M").nunique()
    report["n_months"] = int(months)

    report["ok"] = not report["warnings"]
    ds.close()
    return report


if __name__ == "__main__":
    print(preflight_resample_check("solar_irradiance_hourly.nc"))
```

A clean pre-flight pass guarantees the fix below runs deterministically. Treat any warning as a hard stop in automated pipelines — the same discipline applied in [spatial data quality validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) gates, where a bad layer is halted before it reaches a downstream model.

## Fix implementation

The corrected pipeline uses `xarray` and `dask` with explicit timezone normalization, lazy evaluation, and energy-conserving aggregation. Every parameter is chosen for energy-GIS use: `float32` keeps the stack within a workstation RAM budget, `time=720` aligns chunk boundaries with ~30-day months to minimise cross-chunk reduction, and a 90% coverage mask suppresses months that would otherwise report a biased mean.

<svg viewBox="0 0 940 392" role="img" aria-label="Whether a monthly reduction should take a mean or a sum is decided by the unit, not by preference. Irradiance in watts per square metre is a rate, so its monthly figure is a mean — summing it produces a number with no physical meaning. Energy in kilowatt-hours is already a quantity, so its monthly figure is a sum. Applying the wrong one to a June series gives 5,652,000 where the answer is 235.5, and both look like numbers." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>The unit decides the aggregator</title>
  <desc>A two-by-two comparison. For irradiance in watts per square metre, a rate, the correct monthly reduction is a mean, giving 261 watts per square metre; the incorrect sum gives 187,920 with no meaning. For energy in kilowatt-hours per square metre, a quantity, the correct reduction is a sum, giving 235.5 kilowatt-hours per square metre for the month; the incorrect mean gives 0.327, which is an hourly average dressed as a monthly total. Each cell is marked correct or meaningless.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="392"/>
  <defs><marker id="ag-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Rates are averaged; quantities are summed</text>
  <text x="60" y="104" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">irradiance · W/m²</text>
  <text x="60" y="124" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">a rate</text>
  <rect x="300" y="70" width="290" height="84" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
  <text x="445" y="108" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">mean = 261 W/m²</text>
  <text x="445" y="130" text-anchor="middle" font-size="11" fill="#1F5C3A" font-weight="700">correct</text>
  <rect x="614" y="70" width="294" height="84" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.4"/>
  <text x="761" y="108" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">sum = 187 920</text>
  <text x="761" y="130" text-anchor="middle" font-size="11" fill="#7A4A1A" font-weight="700">meaningless</text>
  <text x="60" y="212" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">energy · kWh/m²</text>
  <text x="60" y="232" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">a quantity</text>
  <rect x="300" y="178" width="290" height="84" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
  <text x="445" y="216" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">sum = 235.5 kWh/m²</text>
  <text x="445" y="238" text-anchor="middle" font-size="11" fill="#1F5C3A" font-weight="700">correct</text>
  <rect x="614" y="178" width="294" height="84" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.4"/>
  <text x="761" y="216" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">mean = 0.327</text>
  <text x="761" y="238" text-anchor="middle" font-size="11" fill="#7A4A1A" font-weight="700">meaningless</text>
  <text x="60" y="300" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">June, hourly series, 720 records</text>
  <rect x="60" y="314" width="848" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="484.0" y="335" text-anchor="middle" font-size="11.5" fill="currentColor">The wrong aggregator does not raise, does not warn, and produces a column of plausible magnitudes —</text>
  <text x="484.0" y="352" text-anchor="middle" font-size="11.5" fill="currentColor">so the check belongs in the schema: assert the unit, then dispatch the aggregator from it.</text>
</svg>

```python
import xarray as xr
import pandas as pd

# Configuration
INPUT_NC = "solar_irradiance_hourly.nc"
OUTPUT_NC = "solar_irradiance_monthly.nc"
TARGET_TZ = "America/New_York"
CHUNKS = {"time": 720, "y": 256, "x": 256}
COVERAGE_FRACTION = 0.90

# 1. Lazy load with explicit chunking to prevent OOM
ds = xr.open_dataset(INPUT_NC, chunks=CHUNKS)

# 2. Timezone normalization (UTC -> project local).
# xarray requires timezone-naive datetimes; convert via pandas, then strip tz info
# so the resample window lands on local calendar months without drift.
local_times = (
    pd.DatetimeIndex(ds["time"].values)
    .tz_localize("UTC")
    .tz_convert(TARGET_TZ)
    .tz_localize(None)  # local time is now encoded in the values
)
ds = ds.assign_coords(time=local_times)

# 3. Physics-compliant aggregation (W/m^2 -> Wh/m^2 -> monthly mean W/m^2).
# Sum hourly power to monthly energy, then divide by the count of valid hours
# to recover average irradiance while preserving the energy balance.
monthly_energy = ds["ghi"].resample(time="ME").sum(skipna=True)   # Wh/m^2 per month
monthly_hours = ds["ghi"].resample(time="ME").count()             # valid hours per month
ghi_monthly_avg = (
    monthly_energy / monthly_hours.where(monthly_hours > 0)
).rename("ghi_monthly_avg").astype("float32")

# 4. Coverage mask: suppress months with < 90% temporal coverage
coverage_threshold = 720 * COVERAGE_FRACTION  # ~30 days x 24 h
ghi_monthly_avg = ghi_monthly_avg.where(monthly_hours >= coverage_threshold)

# 5. CF-compliant metadata + deterministic compressed write
ghi_monthly_avg.attrs.update({
    "units": "W m-2",
    "standard_name": "surface_downwelling_shortwave_flux_in_air",
    "cell_methods": "time: mean",
    "processing_tz": TARGET_TZ,
    "aggregation_method": "energy_sum_then_divide",
    "coverage_threshold": COVERAGE_FRACTION,
})
ghi_monthly_avg.to_netcdf(
    OUTPUT_NC,
    encoding={"ghi_monthly_avg": {"zlib": True, "complevel": 4, "_FillValue": -9999.0}},
    engine="netcdf4",
)
```

The energy-summation approach also absorbs daylight-saving and leap-year irregularities: a 23-hour or 25-hour DST day changes the valid-hour count, not the per-hour energy, so the divisor self-corrects. For strict audit runs, set `skipna=False` so any gap propagates to `NaN` and is caught by the mask rather than silently imputed. Confirm the source `crs_wkt`/`spatial_ref` survives the round-trip; if it is dropped, reassign explicitly with `ds.rio.write_crs("EPSG:4326", inplace=True)` before the write, following the same [coordinate reference system discipline](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) the upstream stages enforce.

## Fallback routing & performance tuning

For continental-scale stacks or CI/CD runners with constrained RAM, layer in these controls before reaching for a bigger machine:

- **Chunk to the calendar, not the disk.** Keep `time=720` so each ~30-day window resolves inside one chunk and the reducer avoids cross-chunk shuffles; keep spatial chunks square (`256×256`) for cache locality during raster reads.
- **Enforce lazy evaluation.** Never call `.compute()` or `.load()` before `.resample()`. Chain operations lazily and trigger execution only at `.to_netcdf()` or `.to_zarr()` so dask streams the stack instead of materializing it.
- **Tune the scheduler to the host.** On a workstation use `dask.config.set(scheduler="threads")` to avoid GIL contention on array math; on a multi-node Dask cluster route through `dask.distributed` with explicit `--memory-limit 4GB` workers so a runaway chunk is spilled, not OOM-killed.
- **Spill to Zarr under pressure.** If memory still spikes, write monthly intermediates with `ghi_monthly_avg.to_zarr("monthly_intermediate.zarr", mode="w")` — Zarr's chunked store sidesteps NetCDF locking and enables parallel downstream reads.
- **Fall back, never extrapolate.** If a target month lacks hourly data, drop to daily aggregates with a logged warning. Never synthesise a monthly mean from fewer than 10 days; mask and document it instead so a reviewer sees a gap rather than a fabricated value.

## Downstream validation

Gate the output before it reaches a yield model. This audit asserts temporal monotonicity, CRS persistence, dtype, and physical bounds (`0 ≤ GHI ≤ 1400 W·m⁻²`), and is cheap enough to run as a CI/CD step on every produced artifact.

<svg viewBox="0 0 940 388" role="img" aria-label="A monthly mean says nothing about how much of the month it saw. In this year, March is complete at 744 of 744 hours, June is missing a maintenance window and holds 71 percent, and September holds 96 percent. The June mean is computed without complaint and is 0.42 kilowatt-hours per square metre per day higher than the full-month figure, because the missing window fell on overcast days. Every monthly reduction should carry its coverage fraction." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Coverage fraction belongs beside every monthly figure</title>
  <desc>A twelve-month chart showing, for each month, the fraction of expected hours actually present: most months are at or near 100 percent, June is at 71 percent and September at 96 percent. A threshold line marks 90 percent as the minimum coverage for a reportable monthly figure. Beside it, the June comparison: the mean computed from the 71 percent of hours present is 7.84 kilowatt-hours per square metre per day, while the full-month figure reconstructed from a neighbouring station is 7.42 — the gap arises because the missing hours were overcast.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="388"/>
  <defs><marker id="cv-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Coverage, not just the mean</text>
  <rect x="60" y="84.0" width="46" height="160.0" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="83.0" y="76.0" text-anchor="middle" font-size="10" fill="currentColor" font-weight="700">100</text>
  <text x="83.0" y="262" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">J</text>
  <rect x="114" y="84.0" width="46" height="160.0" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="137.0" y="76.0" text-anchor="middle" font-size="10" fill="currentColor" font-weight="700">100</text>
  <text x="137.0" y="262" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">F</text>
  <rect x="168" y="84.0" width="46" height="160.0" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="191.0" y="76.0" text-anchor="middle" font-size="10" fill="currentColor" font-weight="700">100</text>
  <text x="191.0" y="262" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">M</text>
  <rect x="222" y="85.6" width="46" height="158.4" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="245.0" y="77.6" text-anchor="middle" font-size="10" fill="currentColor" font-weight="700">99</text>
  <text x="245.0" y="262" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">A</text>
  <rect x="276" y="84.0" width="46" height="160.0" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="299.0" y="76.0" text-anchor="middle" font-size="10" fill="currentColor" font-weight="700">100</text>
  <text x="299.0" y="262" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">M</text>
  <rect x="330" y="130.39999999999998" width="46" height="113.60000000000001" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="353.0" y="122.39999999999998" text-anchor="middle" font-size="10" fill="currentColor" font-weight="700">71</text>
  <text x="353.0" y="262" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">J</text>
  <rect x="384" y="84.0" width="46" height="160.0" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="407.0" y="76.0" text-anchor="middle" font-size="10" fill="currentColor" font-weight="700">100</text>
  <text x="407.0" y="262" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">J</text>
  <rect x="438" y="84.0" width="46" height="160.0" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="461.0" y="76.0" text-anchor="middle" font-size="10" fill="currentColor" font-weight="700">100</text>
  <text x="461.0" y="262" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">A</text>
  <rect x="492" y="90.4" width="46" height="153.6" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="515.0" y="82.4" text-anchor="middle" font-size="10" fill="currentColor" font-weight="700">96</text>
  <text x="515.0" y="262" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">S</text>
  <rect x="546" y="84.0" width="46" height="160.0" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="569.0" y="76.0" text-anchor="middle" font-size="10" fill="currentColor" font-weight="700">100</text>
  <text x="569.0" y="262" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">O</text>
  <rect x="600" y="84.0" width="46" height="160.0" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="623.0" y="76.0" text-anchor="middle" font-size="10" fill="currentColor" font-weight="700">100</text>
  <text x="623.0" y="262" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">N</text>
  <rect x="654" y="87.19999999999999" width="46" height="156.8" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="677.0" y="79.19999999999999" text-anchor="middle" font-size="10" fill="currentColor" font-weight="700">98</text>
  <text x="677.0" y="262" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">D</text>
  <line x1="50" y1="100.0" x2="708" y2="100.0" stroke="#F4A261" stroke-width="1.4" stroke-dasharray="5 4"/>
  <text x="714" y="104.0" text-anchor="start" font-size="11" fill="#7A4A1A" font-weight="700">90% floor</text>
  <text x="60" y="60" text-anchor="start" font-size="11" fill="currentColor" opacity="0.8">% of expected hours present</text>
  <rect x="60" y="272" width="412" height="50" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="266.0" y="293" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">June mean from the 71% present</text>
  <text x="266.0" y="311" text-anchor="middle" font-size="12.5" fill="currentColor">7.84 kWh/m²·day</text>
  <rect x="496" y="272" width="412" height="50" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="702.0" y="293" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">full-month figure once reconstructed</text>
  <text x="702.0" y="311" text-anchor="middle" font-size="12.5" fill="currentColor">7.42 kWh/m²·day</text>
  <text x="60" y="366" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">The missing window fell on overcast days, so the gap is bias, not noise.</text>
</svg>

```python
import xarray as xr
import numpy as np


def audit_monthly_ghi(path: str, var: str = "ghi_monthly_avg") -> None:
    """Fail fast if a resampled monthly GHI artifact is not pipeline-ready."""
    ds = xr.open_dataset(path)
    da = ds[var]

    t = ds["time"].to_index()
    assert t.is_monotonic_increasing, "time axis is not monotonic increasing"
    assert da.dtype == np.float32, f"expected float32, got {da.dtype}"

    crs = ds.attrs.get("crs_wkt") or ds.rio.crs if hasattr(ds, "rio") else None
    assert crs is not None, "CRS metadata missing; downstream merges will misalign"

    valid = da.where(np.isfinite(da))
    vmax = float(valid.max()) if valid.count() else 0.0
    vmin = float(valid.min()) if valid.count() else 0.0
    assert 0.0 <= vmin and vmax <= 1400.0, f"GHI out of physical bounds: [{vmin}, {vmax}]"
    assert da.attrs.get("cell_methods") == "time: mean", "missing CF cell_methods tag"

    ds.close()
    print(f"PASS audit: {path} ({da.sizes.get('time', 0)} months, max {vmax:.0f} W/m^2)")


if __name__ == "__main__":
    audit_monthly_ghi("solar_irradiance_monthly.nc")
```

Pairing this audit with a SHA-256 checksum of the NetCDF file in your asset registry gives you the deterministic, reproducible provenance that regulatory and project-finance due diligence require — the resampled monthly averages then integrate cleanly into capacity-factor estimation and grid-planning pipelines.

## Related

- [Temporal Data Aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) — the parent workflow defining the full reduction contract for solar and wind time-series.
- [Stacking NASA POWER and PVGIS rasters in rasterio](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/stacking-nasa-power-and-pvgis-rasters-in-rasterio/) — resolve the spatial-alignment errors that precede temporal reduction.
- [Calculating wind shear coefficients with Python](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/calculating-wind-shear-coefficients-with-python/) — the wind-side counterpart to physics-correct solar aggregation.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — the CRS foundation every resampled artifact must carry forward.
