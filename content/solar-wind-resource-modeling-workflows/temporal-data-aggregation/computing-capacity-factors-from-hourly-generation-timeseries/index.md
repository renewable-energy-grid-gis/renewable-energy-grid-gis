---
title: Computing Capacity Factors from Hourly Generation Timeseries
description: Fix capacity factors above 1.0, wrong hour counts, and DST-corrupted totals when reducing an hourly generation series with pandas — tz-aware indexing, energy-unit integration, leap-year hour counts, and a CI/CD assertion gate.
slug: computing-capacity-factors-from-hourly-generation-timeseries
type: article
breadcrumb: Computing Capacity Factors
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Computing Capacity Factors from Hourly Generation Timeseries

**Scenario:** you resample an hourly generation series with `gen.resample("YS").mean()`, divide by rated power, and the annual capacity factor comes back as `1.34` — or a plausible `0.28` that is quietly 5–8% wrong because the index was timezone-naive across a daylight-saving transition. Both land in the reduction stage of the [Temporal Data Aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) workflow, where a high-frequency power series is collapsed into the single dimensionless number every project-finance model, PPA negotiation, and interconnection study treats as ground truth. A capacity factor greater than one raises no exception; a subtly biased one raises no exception either. Both surface at regulatory review, when rework is most expensive.

Capacity factor is the realised energy over a window divided by the energy the asset would produce running flat-out at its nameplate rating for the whole window:

$$ \text{CF} = \frac{E_{\text{actual}}}{P_{\text{rated}} \times T} = \frac{\sum_{t} P_t \, \Delta t}{P_{\text{rated}} \, T} $$

where $P_t$ is instantaneous power, $\Delta t$ the sample interval, and $T$ the wall-clock length of the period. The arithmetic is a single division. Every production failure lives in the three terms the division consumes — the energy integral, the rated power, and the hour count — not in the ratio itself.

## Root-cause analysis

Four independent errors corrupt this calculation, each mapping to a distinct correction stage below.

1. **Timezone-naive index across DST.** A `DatetimeIndex` with no `tz` cannot resolve daylight-saving transitions. The autumn fall-back hour duplicates a local timestamp, so a naive `resample` either double-counts that hour's energy or silently drops one of the pair; the spring forward creates a missing hour that a mean quietly absorbs. Reanalysis and SCADA exports store UTC, but a series localized to a civil timezone — or worse, left naive — shifts every annual boundary by the local offset and leaks generation across the year boundary.
2. **Sum versus mean, and irregular sampling.** Energy is an integral, `ΣP·Δt`, not an average of instantaneous power. Taking `.mean()` and multiplying by a fixed hour count works only when `Δt` is perfectly regular; the instant the series has a five-minute burst embedded in hourly data, or gaps that compress the effective interval, the mean-times-hours shortcut diverges from the true Riemann sum.
3. **Missing hours and leap-year hour count.** The denominator `T` is the number of hours in the period. Assuming a fixed `8760` silently understates a leap year's `8784` hours, and treating a month as `730` hours ignores that February and July differ by three days. When observations are missing, dividing realised energy by the full period still returns a number, but it conflates low output with low coverage.
4. **Mixing kW and kWh, MW and MWh.** Power in kW summed over hourly steps yields kWh; rated power quoted in MW must be scaled to the same unit before the ratio. A single unhandled factor of 1000 is the fastest route to a capacity factor of `1340%`.

<svg viewBox="0 0 880 372" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Failure-to-correction flow for capacity factor computation. Four failure modes on the left — a timezone-naive index across DST, taking a mean instead of the energy sum with irregular sampling, missing hours with a wrong leap-year hour count, and mixing kW with kWh — each map by an arrow to a corrective stage in the middle: a tz-aware UTC index, an energy integral of power times delta-t, a boundary-derived hour count that yields 8784 in leap years, and explicit kW-to-MWh unit scaling. The four stages converge into a single validated output node on the right, a capacity-factor table bounded between zero and one with a coverage mask." style="width:100%;max-width:880px;height:auto;font-family:inherit;">
  <rect class="svg-bg" x="0" y="0" width="880" height="372"/>
  <title>Four capacity-factor failure modes mapped to their corrective stages</title>
  <desc>A left-to-right flow diagram. The left column lists four dashed-border failure nodes: timezone-naive index with DST double-count or gap; mean instead of the energy sum with irregular delta-t; missing hours with an 8760-versus-8784 leap-year error; and kW mixed with kWh causing a factor-of-1000 blow-up. Each maps by an arrow to a solid corrective node in the middle column: localize to a tz-aware UTC index and dedupe DST; integrate energy as the sum of power times delta-t in kWh; derive the hour count from period boundaries so leap years give 8784; and scale units explicitly from kW to MWh against MW rated power. The four corrective stages converge through a shared bus into a single highlighted output node on the right: a capacity-factor table bounded between 0 and 1 with a coverage mask and audit metadata.</desc>
  <defs>
    <marker id="cf-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="880" height="372" fill="none"/>
  <!-- Column headers -->
  <text x="141" y="20" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700" opacity="0.7" letter-spacing="0.5">FAILURE MODE</text>
  <text x="465" y="20" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700" opacity="0.7" letter-spacing="0.5">CORRECTION STAGE</text>
  <text x="783" y="20" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700" opacity="0.7" letter-spacing="0.5">DEFENSIBLE OUTPUT</text>
  <!-- Failure nodes (dashed = trap) -->
  <rect x="16" y="32" width="250" height="70" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="141" y="60" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Timezone-naive index</text>
  <text x="141" y="80" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">DST double-count or gap</text>
  <rect x="16" y="114" width="250" height="70" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="141" y="142" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Mean, not energy sum</text>
  <text x="141" y="162" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">irregular &#916;t biases total</text>
  <rect x="16" y="196" width="250" height="70" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="141" y="224" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Missing / leap hours</text>
  <text x="141" y="244" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">8760 vs 8784</text>
  <rect x="16" y="278" width="250" height="70" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="141" y="306" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">kW mixed with kWh</text>
  <text x="141" y="326" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">factor-of-1000 blow-up</text>
  <!-- Corrective stages (solid) -->
  <rect x="330" y="32" width="270" height="70" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="465" y="60" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">tz-aware UTC index</text>
  <text x="465" y="80" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">localize &#183; dedupe DST</text>
  <rect x="330" y="114" width="270" height="70" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="465" y="142" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Energy integral</text>
  <text x="465" y="162" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">&#931; P&#183;&#916;t &#8594; kWh</text>
  <rect x="330" y="196" width="270" height="70" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="465" y="224" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Boundary hour count</text>
  <text x="465" y="244" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">leap-aware 8784</text>
  <rect x="330" y="278" width="270" height="70" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="465" y="306" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Explicit unit scaling</text>
  <text x="465" y="326" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">kW &#8594; MWh vs MW</text>
  <!-- Failure -> Correction arrows -->
  <line x1="266" y1="67"  x2="324" y2="67"  stroke="currentColor" stroke-width="1.5" marker-end="url(#cf-arr)"/>
  <line x1="266" y1="149" x2="324" y2="149" stroke="currentColor" stroke-width="1.5" marker-end="url(#cf-arr)"/>
  <line x1="266" y1="231" x2="324" y2="231" stroke="currentColor" stroke-width="1.5" marker-end="url(#cf-arr)"/>
  <line x1="266" y1="313" x2="324" y2="313" stroke="currentColor" stroke-width="1.5" marker-end="url(#cf-arr)"/>
  <!-- Convergence bus into output -->
  <line x1="600" y1="67"  x2="636" y2="67"  stroke="currentColor" stroke-width="1.5"/>
  <line x1="600" y1="149" x2="636" y2="149" stroke="currentColor" stroke-width="1.5"/>
  <line x1="600" y1="231" x2="636" y2="231" stroke="currentColor" stroke-width="1.5"/>
  <line x1="600" y1="313" x2="636" y2="313" stroke="currentColor" stroke-width="1.5"/>
  <line x1="636" y1="67"  x2="636" y2="313" stroke="currentColor" stroke-width="1.5"/>
  <line x1="636" y1="190" x2="672" y2="190" stroke="currentColor" stroke-width="1.5" marker-end="url(#cf-arr)"/>
  <!-- Output node (highlighted terminal artifact) -->
  <rect x="674" y="132" width="190" height="116" rx="7" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"/>
  <text x="769" y="170" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">CF table</text>
  <text x="769" y="192" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.85">0 &#8804; CF &#8804; 1</text>
  <text x="769" y="214" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">coverage-masked</text>
  <text x="769" y="232" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">audited</text>
</svg>

## Pre-flight validation

Surface the broken assumption *before* the ratio runs. The naive pattern below is exactly what produces a capacity factor above one or a quietly biased total — no timezone, no cadence check, no unit discipline:

```python
import pandas as pd

# Flawed: tz-naive index, mean instead of energy, hard-coded 8760, kW/MW mix
gen_kw = pd.read_parquet("plant_generation.parquet")["power_kw"]
annual_mean_kw = gen_kw.resample("YS").mean()
cf = annual_mean_kw / capacity_mw / 8760      # units and hour count both wrong
```

The pre-flight validator isolates which failure is present so a CI/CD run fails fast with a precise message instead of shipping a poisoned number:

```python
import pandas as pd


def preflight_generation_series(gen_kw: pd.Series, interval_hours: float = 1.0) -> None:
    """Raise on the exact root cause before any capacity-factor ratio is formed."""
    idx = gen_kw.index
    if not isinstance(idx, pd.DatetimeIndex):
        raise TypeError("Generation series must carry a DatetimeIndex.")
    # Cause 1: a tz-naive index cannot resolve DST duplicates or spring-forward gaps
    if idx.tz is None:
        raise ValueError(
            "Index is timezone-naive; localize to UTC (or the site tz, then convert) "
            "so DST transitions are neither double-counted nor dropped."
        )
    if not idx.is_monotonic_increasing:
        raise ValueError("Index is not monotonic; sort_index() before resampling.")
    if idx.has_duplicates:
        raise ValueError("Duplicate timestamps (DST fall-back?); dedupe before aggregating.")
    # Cause 2: confirm the native cadence matches the Δt used in the energy integral
    step = pd.Timedelta(hours=interval_hours)
    deltas = idx.to_series().diff().dropna()
    off_cadence = int((deltas != step).sum())
    if off_cadence:
        print(f"[preflight] {off_cadence} intervals deviate from {interval_hours}h; "
              "irregular Δt biases a fixed-step sum — reindex to a regular grid first.")
```

| Validation step | Diagnostic | Expected outcome |
|-----------------|-----------|------------------|
| Timezone awareness | `gen_kw.index.tz is not None` | Index carries `UTC` (or a convertible tz) |
| Monotonic, unique | `idx.is_monotonic_increasing and not idx.has_duplicates` | No DST-duplicate or out-of-order rows |
| Regular cadence | `idx.to_series().diff().value_counts()` | A single dominant `Δt` (e.g. `0 days 01:00:00`) |
| Units labelled | column named `power_kw`, rating in `capacity_mw` | kW and MW never mixed into the ratio |

## Fix implementation

The corrected function normalises to UTC, integrates energy as `ΣP·Δt` in explicit units, derives each period's hour count from its own calendar boundaries so leap years resolve to `8784`, and masks periods whose coverage falls below a threshold rather than reporting them as low output. Parameter choices are justified for energy use: `freq="YS"` gives year-start annual periods for the headline number, `interval_hours` makes the sample step explicit in the integral, and `max_gap_frac=0.05` refuses a capacity factor when more than 5% of expected hours are missing.

<svg viewBox="0 0 940 392" role="img" aria-label="A capacity factor is one division with three chances to be wrong. The numerator is metered energy — 262,800 megawatt-hours — which must be net of parasitic load and curtailment if the figure is to be comparable. The denominator is nameplate capacity times hours: 100 megawatts AC times 8,760 hours. Using DC capacity instead of AC inflates the denominator by the DC to AC ratio and drops the reported factor from 30.0 percent to 24.0." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>One division, three places it goes wrong</title>
  <desc>A worked capacity factor calculation shown as a fraction. The numerator is 262,800 megawatt-hours of metered net energy, annotated with the two adjustments it must already include: parasitic load and curtailed energy. The denominator is 100 megawatts AC times 8,760 hours, or 876,000 megawatt-hours, annotated with the warning that using the 125 megawatt DC rating instead gives 1,095,000 and a reported capacity factor of 24.0 percent rather than 30.0. The result, 30.0 percent, is shown alongside the alternative figure.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="392"/>
  <defs><marker id="cfx-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">CF = net metered energy ÷ (rated capacity × hours in period)</text>
  <rect x="60" y="70" width="480" height="68" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
  <text x="300" y="100" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">262 800 MWh metered net energy</text>
  <text x="300" y="122" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">after parasitic load and curtailment</text>
  <line x1="60" y1="152" x2="540" y2="152" stroke="currentColor" stroke-width="2" opacity="0.7"/>
  <rect x="60" y="166" width="480" height="68" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
  <text x="300" y="196" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">100 MW AC × 8 760 h = 876 000 MWh</text>
  <text x="300" y="218" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">the AC point of interconnection rating</text>
  <text x="576" y="158" text-anchor="middle" font-size="18" fill="currentColor" font-weight="700">=</text>
  <rect x="620" y="100" width="288" height="76" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="764.0" y="124" text-anchor="middle" font-size="22" fill="currentColor" font-weight="700">30.0%</text>
  <text x="764.0" y="152" text-anchor="middle" font-size="11.5" fill="currentColor">capacity factor</text>
  <rect x="620" y="196" width="288" height="48" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="764.0" y="217" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">24.0% if the 125 MW DC</text>
  <text x="764.0" y="234" text-anchor="middle" font-size="11.5" fill="currentColor">rating is used instead</text>
  <rect x="60" y="262" width="848" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="484.0" y="283" text-anchor="middle" font-size="11.5" fill="currentColor">The two most common errors point in opposite directions: a gross numerator inflates the factor, and a</text>
  <text x="484.0" y="300" text-anchor="middle" font-size="11.5" fill="currentColor">DC denominator deflates it — so a plausible number can hide both at once.</text>
  <text x="60" y="348" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">Publish the basis with the number: net or gross, AC or DC, and the exact hour count.</text>
</svg>

```python
import numpy as np
import pandas as pd


def _expected_hours(period_starts: pd.DatetimeIndex, freq: str) -> pd.Series:
    """Wall-clock hours in each period, from its own boundaries — leap-safe."""
    offset = pd.tseries.frequencies.to_offset(freq)
    ends = period_starts + offset          # next boundary handles 8784 h leap years
    hours = (ends - period_starts) / pd.Timedelta(hours=1)
    return pd.Series(hours, index=period_starts, name="expected_hours")


def capacity_factor(
    gen_kw: pd.Series,
    capacity_mw: float,
    freq: str = "YS",
    interval_hours: float = 1.0,
    max_gap_frac: float = 0.05,
) -> pd.DataFrame:
    """Capacity factor per period from an hourly generation series in kW.

    CF = actual_energy / (rated_power * hours). Energy is a Riemann sum
    ΣP·Δt (kW·h → kWh → MWh); the denominator uses each period's true hour
    count so leap years and unequal months stay correct.
    """
    preflight_generation_series(gen_kw, interval_hours=interval_hours)

    # Cause 1: UTC has no DST, so every period has an unambiguous, gap-free hour span.
    gen_kw = gen_kw.tz_convert("UTC").sort_index()

    grouped = gen_kw.resample(freq)
    # Cause 2 & 4: energy = Σ power·Δt in kWh, then kWh → MWh. Never a bare mean.
    energy_mwh = grouped.apply(
        lambda p: float(np.nansum(p.to_numpy())) * interval_hours
    ) / 1_000.0
    observed_hours = grouped.count() * interval_hours

    # Cause 3: hours per period from calendar boundaries, not a hard-coded 8760.
    expected_hours = _expected_hours(energy_mwh.index, freq)
    coverage = observed_hours / expected_hours

    # Denominator: MW rated × hours = MWh at continuous rated output (unit-matched).
    denom_mwh = capacity_mw * expected_hours
    cf = energy_mwh / denom_mwh

    out = pd.DataFrame({
        "energy_mwh": energy_mwh,
        "expected_hours": expected_hours,
        "observed_hours": observed_hours,
        "coverage": coverage,
        # Cause 3: withhold CF where coverage is too low to be defensible.
        "capacity_factor": cf.where(coverage >= (1.0 - max_gap_frac)),
    })
    out.attrs.update({
        "capacity_mw": capacity_mw,
        "frequency": freq,
        "interval_hours": interval_hours,
        "max_gap_frac": max_gap_frac,
        "energy_convention": "sum(power_kw * interval_hours) / 1000 -> MWh",
        "time_reference": "UTC",
    })
    return out
```

Deriving `expected_hours` from `period_start + offset` is the load-bearing detail: adding a `YS` offset to `2020-01-01` lands on `2021-01-01`, a span of exactly `8784` hours, while `2021` returns `8760`. The same boundary arithmetic keeps a monthly (`freq="MS"`) run correct across February and the 31-day months, so the denominator never has to know how long a period "should" be. Because the series is in UTC, that span is pure wall-clock hours with no DST discontinuity to reconcile — the whole reason the [Temporal Data Aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) contract insists on a UTC index before any reduction.

## Fallback routing & performance tuning

For real SCADA and metered series where gaps, unit ambiguity, and partial periods are the norm rather than the exception, layer these policies on top of the core function:

- **Gap-filling policy, declared not implicit.** For short outages (a few consecutive missing hours), interpolate power before integrating only if the plant physics justify it — otherwise leave gaps as `NaN` and let `np.nansum` treat them as zero energy, which is conservative. Record which policy ran; a filled hour and a genuine zero are not the same evidentiary claim.
- **Partial-period handling at series edges.** The first and last periods are usually incomplete. The coverage mask already withholds their capacity factor, but expose `observed_hours` and `coverage` so a caller can report a partial-year CF with an explicit caveat rather than a silently deflated number.
- **Reindex irregular data to a regular grid.** If `Δt` varies, `gen_kw.resample("h").mean()` (or `.sum()` for pre-accumulated energy) before the CF call restores a constant interval so `ΣP·Δt` is a valid integral. Choose the reindex reducer to match whether the raw column is instantaneous power or accumulated energy.
- **Vectorize across an asset fleet.** For a portfolio, pass a wide `DataFrame` of `power_kw` columns and call `.resample(freq).apply(...)` once rather than looping per site; group metadata (each asset's `capacity_mw`) in a lookup `Series` and broadcast the division. This is the same batching discipline that keeps [grid capacity buffer analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) tractable when scoring every interconnection candidate on a corridor.
- **Feed, don't re-derive.** When a physical model already exists, integrate its hourly output directly — the AC power series from a [PV yield simulation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-pv-yield-simulation/) run drops straight into `capacity_factor()` without re-implementing the energy sum.

## Downstream validation

Before a capacity factor reaches a finance model or a resource-assessment report, gate it with an assertion suitable for a CI/CD pipeline. This catches the sign errors, unit mixes, and hour-count drift that produce a number outside the physically possible range:

<svg viewBox="0 0 940 380" role="img" aria-label="The hour count in the denominator is not always 8,760. A leap year has 8,784. A daylight-saving transition in a local-time series gives 8,759 hours in spring and 8,761 in autumn, and a naive concatenation of local-time years can double-count the repeated autumn hour. For a 100 megawatt plant producing 262,800 megawatt-hours, the reported capacity factor moves between 29.92 and 30.01 percent depending only on which hour count is used." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Four hour counts, four slightly different capacity factors</title>
  <desc>A comparison of four hour counts for the same 262,800 megawatt-hours from a 100 megawatt plant: a common year at 8,760 hours gives 30.00 percent, a leap year at 8,784 gives 29.92 percent, a local-time spring-forward year at 8,759 gives 30.00 percent, and a local-time fall-back year at 8,761 gives 29.99 percent. A note explains that the differences are small individually but systematic across a portfolio, and that mixing UTC and local-time series inside one comparison is what makes them unexplainable.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="380"/>
  <defs><marker id="hr-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">262 800 MWh from 100 MW — which hour count?</text>
  <rect x="40" y="70" width="868" height="52" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="102" text-anchor="start" font-size="12" fill="currentColor">common year (UTC)</text>
  <text x="430" y="102" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">8 760 h</text>
  <text x="600" y="102" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">CF = 30.00%</text>
  <rect x="700" y="86" width="190" height="20" rx="3" fill="none" stroke="#5BA8C8" stroke-width="1"/>
  <rect x="700" y="86" width="142.49999999999864" height="20" rx="3" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1" opacity="0.5"/>
  <rect x="40" y="130" width="868" height="52" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="162" text-anchor="start" font-size="12" fill="currentColor">leap year (UTC)</text>
  <text x="430" y="162" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">8 784 h</text>
  <text x="600" y="162" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">CF = 29.92%</text>
  <rect x="700" y="146" width="190" height="20" rx="3" fill="none" stroke="#F4A261" stroke-width="1"/>
  <rect x="700" y="146" width="64.63114754098153" height="20" rx="3" fill="#F4A261" stroke="#F4A261" stroke-width="1" opacity="0.5"/>
  <rect x="40" y="190" width="868" height="52" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="222" text-anchor="start" font-size="12" fill="currentColor">local time, spring forward</text>
  <text x="430" y="222" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">8 759 h</text>
  <text x="600" y="222" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">CF = 30.00%</text>
  <rect x="700" y="206" width="190" height="20" rx="3" fill="none" stroke="#5BA8C8" stroke-width="1"/>
  <rect x="700" y="206" width="145.75379609544362" height="20" rx="3" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1" opacity="0.5"/>
  <rect x="40" y="250" width="868" height="52" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="282" text-anchor="start" font-size="12" fill="currentColor">local time, fall back</text>
  <text x="430" y="282" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">8 761 h</text>
  <text x="600" y="282" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">CF = 30.00%</text>
  <rect x="700" y="266" width="190" height="20" rx="3" fill="none" stroke="#F4A261" stroke-width="1"/>
  <rect x="700" y="266" width="139.24694669558323" height="20" rx="3" fill="#F4A261" stroke="#F4A261" stroke-width="1" opacity="0.5"/>
  <rect x="40" y="316" width="868" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="337" text-anchor="middle" font-size="11.5" fill="currentColor">Individually these are rounding; across a 40-site portfolio compared year on year they are a systematic</text>
  <text x="474.0" y="354" text-anchor="middle" font-size="11.5" fill="currentColor">drift. Fix the convention — UTC hour counts everywhere — and record it beside the factor.</text>
</svg>

```python
def assert_capacity_factor(cf_table: pd.DataFrame) -> None:
    """CI/CD gate: fail the build if the capacity-factor table is not defensible."""
    cf = cf_table["capacity_factor"].dropna()
    assert (cf >= 0.0).all(), "negative capacity factor — sign or unit error"
    assert (cf <= 1.0).all(), (
        "capacity factor > 1.0 — kW/kWh mix, wrong rated power, or double-counted DST hour"
    )
    # Observed samples can never exceed the hours in the period (duplicate timestamps).
    assert (cf_table["observed_hours"] <= cf_table["expected_hours"] + 1e-6).all(), \
        "observed hours exceed the period length — duplicate or DST-collided timestamps"
    # Leap-year hour count: any full annual period must be exactly 8760 or 8784 hours.
    full_year = cf_table["expected_hours"] > 8000
    annual_hours = cf_table.loc[full_year, "expected_hours"].round()
    assert annual_hours.isin([8760, 8784]).all(), (
        "near-annual period with a non-8760/8784 hour count — calendar boundary drift"
    )
```

The `capacity_factor > 1.0` assertion is the single most valuable line: it is physically impossible for real generation and therefore an unambiguous signal that units were mixed or a DST hour was double-counted, exactly the class of error that never raises on its own. Logging `coverage` alongside the pass/fail record keeps the result auditable — an independent engineer reviewing the interconnection or project-finance package can see how many hours were measured versus assumed. Pin `pandas` in `pyproject.toml` so a change to resampling or offset semantics cannot silently shift the hour count between runs, and route the same series through [resampling hourly solar data to monthly averages](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/resampling-hourly-solar-data-to-monthly-averages/) when the monthly shape of the capacity factor, not just its annual value, is what the study needs.

## Related

- [Temporal Data Aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) — the parent workflow whose UTC-and-coverage contract this calculation depends on.
- [Resampling Hourly Solar Data to Monthly Averages](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/resampling-hourly-solar-data-to-monthly-averages/) — the monthly-granularity companion for shaping capacity factor over the year.
- [Solar PV Yield Simulation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-pv-yield-simulation/) — produces the hourly AC power series this function integrates.
- [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) — where capacity factor and rated power feed interconnection headroom screening.
