---
title: Simulating Hourly PV Output with pvlib ModelChain
description: Fix the silent failures in a pvlib ModelChain run — timezone-naive weather indexes, missing DNI/DHI, unknown SAM module and inverter keys, and AC/DC confusion — to produce an auditable hourly AC power series and capacity factor.
slug: simulating-hourly-pv-output-with-pvlib-modelchain
type: article
breadcrumb: Simulating Hourly PV Output with pvlib ModelChain
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Simulating Hourly PV Output with pvlib ModelChain

An all-zero AC series, an inverted daily profile, a `KeyError` deep inside a SAM database lookup, or an `annual_energy` that is quietly 30% too high — these are the four ways a [pvlib](https://pvlib-python.readthedocs.io/) `ModelChain.run_model()` call fails in production, and none of them raises the exception you would hope for. This page is the single-site walkthrough referenced by [Solar PV Yield Simulation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-pv-yield-simulation/): the step where a concrete weather frame is threaded through a `Location`, a `PVSystem`, and a `ModelChain` to yield an hourly AC power series and a `capacity_factor`. The `ModelChain` orchestration is not where things break — the arithmetic inside pvlib is correct. Failures live in the boundary between your weather DataFrame and pvlib's assumptions about it: what timezone the index carries, which irradiance components exist, and whether the component names you passed actually resolve to a device in the Sandia database.

The quantity you are ultimately after is energy, the time integral of AC power over the modeled window:

$$ E = \int_{t_0}^{t_1} P_\text{AC}(t)\,dt \;\approx\; \sum_{i} P_{\text{AC},i}\,\Delta t_i $$

For an hourly series $\Delta t_i = 1\ \text{h}$, so a watt series in W integrates to Wh simply by summing and dividing by $10^6$ for MWh. That trivial reduction is exactly why a corrupted power series is dangerous: it sums to a plausible number regardless of whether the profile underneath it is physically real.

## Root-Cause Analysis

Four compounding causes account for nearly every broken single-site `ModelChain` run, and each maps to a distinct guard in the pre-flight validator below.

1. **Timezone-naive weather index.** pvlib computes solar position from the DataFrame's `DatetimeIndex`. If that index is timezone-naive, pvlib treats it as UTC while your `Location` sits at, say, UTC−8. Solar noon lands hours off, the sun appears below the horizon during real daylight, and the AC series is zeroed or phase-shifted. No error is raised because a naive index is syntactically valid — the profile is just silently wrong.
2. **Missing DNI/DHI.** A `ModelChain` needs beam (DNI) and diffuse (DHI) components to transpose irradiance to the plane of array. Many gridded products — the same NASA POWER and PVGIS layers handled in [solar irradiance raster processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) — ship only global horizontal (GHI). Feeding GHI-only weather leaves DNI and DHI as `NaN`, which propagate through transposition and produce an all-`NaN` AC series. The fix is a decomposition model (`erbs` or `disc`) that estimates the components from GHI and solar geometry.
3. **Unknown SAM module or inverter key.** `pvlib.pvsystem.retrieve_sam('SandiaMod')` returns a table whose column labels are mangled device names. A copied-in name with the wrong punctuation raises `KeyError` at model-build time, and a *close-but-wrong* name silently selects a different device with a different power rating.
4. **Missing temperature-model parameters or AC/DC confusion.** Omit `temperature_model_parameters` and pvlib either errors or falls back to a default set that does not match your mounting. Separately, reading `mc.results.dc` (DC power, or a DataFrame of currents and voltages) when you meant `mc.results.ac` inflates the yield by the inverter's conversion loss and ignores clipping entirely.

<svg viewBox="0 0 900 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Decision flow mapping four ModelChain failure causes to their fixes. A weather DataFrame enters a timezone gate; a naive index is localized to the site timezone. It then reaches an irradiance-component gate; if DNI and DHI are absent, an Erbs decomposition derives them from GHI. Next a device-key gate checks that the module and inverter names exist in the Sandia database, raising KeyError otherwise. Finally the ModelChain runs and the AC result — not the DC result — is integrated to energy and a capacity factor." style="max-width:100%;height:auto;font-family:inherit">
  <title>Mapping four ModelChain failure causes to their fixes</title>
  <desc>A left-to-right pipeline. A weather DataFrame enters a timezone-parity gate; a naive index branches down to a localize-to-site-timezone fix. The stream then reaches an irradiance-component gate; missing DNI and DHI branch down to an Erbs decomposition that derives beam and diffuse from GHI. Next, a device-key gate verifies module and inverter names exist in the Sandia database and raises a KeyError otherwise. The validated inputs reach the ModelChain run node, whose AC result — explicitly not the DC result — feeds an integrate-to-energy node emitting MWh and a capacity factor.</desc>
  <defs>
    <marker id="pv-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="900" height="560" fill="none"/>
  <!-- Input -->
  <rect x="24" y="60" width="150" height="46" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="99" y="80" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">weather df</text>
  <text x="99" y="97" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">GHI · index</text>
  <line x1="174" y1="83" x2="212" y2="83" stroke="currentColor" stroke-width="1.4" marker-end="url(#pv-arr)"/>
  <!-- Gate 1: tz -->
  <path d="M290,40 L358,83 L290,126 L222,83 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="290" y="80" text-anchor="middle" font-size="10.5" fill="currentColor">index tz</text>
  <text x="290" y="95" text-anchor="middle" font-size="10.5" fill="currentColor">aware?</text>
  <line x1="290" y1="126" x2="290" y2="176" stroke="currentColor" stroke-width="1.4" marker-end="url(#pv-arr)"/>
  <text x="304" y="152" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">no</text>
  <rect x="200" y="178" width="180" height="44" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="290" y="197" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">tz_localize</text>
  <text x="290" y="213" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">to site tz</text>
  <line x1="358" y1="83" x2="404" y2="83" stroke="currentColor" stroke-width="1.4" marker-end="url(#pv-arr)"/>
  <text x="381" y="74" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">yes</text>
  <!-- Gate 2: components -->
  <path d="M482,40 L558,83 L482,126 L406,83 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="482" y="80" text-anchor="middle" font-size="10.5" fill="currentColor">DNI+DHI</text>
  <text x="482" y="95" text-anchor="middle" font-size="10.5" fill="currentColor">present?</text>
  <line x1="482" y1="126" x2="482" y2="176" stroke="currentColor" stroke-width="1.4" marker-end="url(#pv-arr)"/>
  <text x="496" y="152" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">no</text>
  <rect x="392" y="178" width="180" height="44" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="482" y="197" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">erbs(GHI)</text>
  <text x="482" y="213" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">decompose</text>
  <line x1="558" y1="83" x2="604" y2="83" stroke="currentColor" stroke-width="1.4" marker-end="url(#pv-arr)"/>
  <text x="581" y="74" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">yes</text>
  <!-- Gate 3: device key -->
  <path d="M682,40 L758,83 L682,126 L606,83 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="682" y="80" text-anchor="middle" font-size="10.5" fill="currentColor">SAM keys</text>
  <text x="682" y="95" text-anchor="middle" font-size="10.5" fill="currentColor">exist?</text>
  <line x1="682" y1="126" x2="682" y2="176" stroke="currentColor" stroke-width="1.4" marker-end="url(#pv-arr)"/>
  <text x="696" y="152" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">no</text>
  <rect x="592" y="178" width="180" height="44" rx="7" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 3"/>
  <text x="682" y="203" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">raise KeyError</text>
  <!-- Gate3 yes -> run -->
  <line x1="758" y1="83" x2="806" y2="83" stroke="currentColor" stroke-width="1.4" marker-end="url(#pv-arr)"/>
  <text x="782" y="74" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">yes</text>
  <rect x="808" y="60" width="72" height="46" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="844" y="80" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">run</text>
  <text x="844" y="96" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">model</text>
  <!-- run -> energy -->
  <path d="M844,106 V300 H500" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#pv-arr)"/>
  <rect x="300" y="278" width="200" height="52" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="400" y="299" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">integrate results.ac</text>
  <text x="400" y="316" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">→ MWh + capacity factor</text>
  <text x="620" y="270" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">use .ac, never .dc</text>
</svg>

## Pre-Flight Validation

The naive call below is the broken pattern: it hands pvlib a raw weather frame and trusts that whatever comes back is meaningful.

```python
import pvlib

# Flawed: no tz check, no component check, no key check
mc = pvlib.modelchain.ModelChain(system, location)
mc.run_model(weather)          # weather index may be naive; DNI/DHI may be NaN
annual = mc.results.dc.sum()   # wrong attribute — DC, not AC
```

The validator surfaces each root cause up front, so a bad frame fails with a precise message instead of returning a plausible-looking lie.

```python
import pandas as pd
import pvlib


def preflight_weather(weather: pd.DataFrame, site_tz: str,
                      module_name: str, inverter_name: str) -> None:
    """Raise on the exact root cause before ModelChain.run_model() is called."""
    # Cause 1: solar position needs a timezone-aware index matching the site
    if weather.index.tz is None:
        raise ValueError(
            f"weather index is timezone-naive; localize to {site_tz} "
            "so pvlib computes solar position at the correct longitude."
        )
    # Cause 2: transposition needs beam + diffuse, not just global horizontal
    have = set(weather.columns)
    if not {"dni", "dhi"} <= have:
        if "ghi" not in have:
            raise ValueError("weather has neither dni/dhi nor ghi to decompose.")
        print("[preflight] DNI/DHI absent; will decompose from GHI via erbs().")
    # Cause 3: device names must resolve in the Sandia databases
    mods = pvlib.pvsystem.retrieve_sam("SandiaMod")
    invs = pvlib.pvsystem.retrieve_sam("CECInverter")
    if module_name not in mods.columns:
        raise KeyError(f"module {module_name!r} not in SandiaMod database.")
    if inverter_name not in invs.columns:
        raise KeyError(f"inverter {inverter_name!r} not in CECInverter database.")
```

| Validation step | Diagnostic | Expected outcome |
|-----------------|-----------|------------------|
| Index timezone | `weather.index.tz is not None` | Aware index matching the site (e.g. `Etc/GMT+8`) |
| Irradiance components | `{"dni","dhi"} <= set(weather.columns)` | Present, or `ghi` available for decomposition |
| Module key | `module_name in retrieve_sam("SandiaMod").columns` | Exact device label resolves |
| Inverter key | `inverter_name in retrieve_sam("CECInverter").columns` | Exact device label resolves |

## Fix Implementation

The corrected function localizes the index to the site timezone, decomposes GHI when the beam and diffuse components are missing, builds the `Location` and `PVSystem` with explicit temperature-model parameters, and reads `results.ac` — never `results.dc`. Every parameter is justified: `erbs` is a fast, well-validated GHI decomposition; the `open_rack_glass_glass` SAPM thermal set matches ground-mount arrays; and the AC series is integrated to MWh via the energy sum above, with all irradiance handled in a projected context consistent with the site's declared `EPSG:4326` coordinates.

```python
import numpy as np
import pandas as pd
import pvlib
from pvlib.location import Location
from pvlib.pvsystem import PVSystem
from pvlib.modelchain import ModelChain
from pvlib.temperature import TEMPERATURE_MODEL_PARAMETERS


def run_pv_modelchain(
    weather: pd.DataFrame,
    latitude: float,
    longitude: float,
    site_tz: str,                      # IANA tz, e.g. "Etc/GMT+8" for UTC-8
    module_name: str,
    inverter_name: str,
    surface_tilt: float = 25.0,
    surface_azimuth: float = 180.0,    # equator-facing in N. hemisphere
    modules_per_string: int = 20,
    strings: int = 100,
) -> dict:
    """Run a single-site ModelChain and integrate AC power to energy.

    Returns hourly AC power (W), energy (MWh), and capacity factor.
    """
    preflight_weather(weather, site_tz, module_name, inverter_name)

    # Cause 1: attach the site timezone so solar position is computed correctly
    if weather.index.tz is None:
        weather = weather.tz_localize(site_tz)

    location = Location(latitude, longitude, tz=site_tz)

    # Cause 2: derive DNI/DHI from GHI when only global horizontal is available
    if not {"dni", "dhi"} <= set(weather.columns):
        solpos = location.get_solarposition(weather.index)
        decomposed = pvlib.irradiance.erbs(
            weather["ghi"], solpos["zenith"], weather.index
        )
        weather = weather.assign(dni=decomposed["dni"], dhi=decomposed["dhi"])

    # Cause 3 + 4: resolve devices and supply explicit thermal parameters
    module = pvlib.pvsystem.retrieve_sam("SandiaMod")[module_name]
    inverter = pvlib.pvsystem.retrieve_sam("CECInverter")[inverter_name]
    temp_params = TEMPERATURE_MODEL_PARAMETERS["sapm"]["open_rack_glass_glass"]

    system = PVSystem(
        surface_tilt=surface_tilt,
        surface_azimuth=surface_azimuth,
        module_parameters=module,
        inverter_parameters=inverter,
        temperature_model_parameters=temp_params,
        modules_per_string=modules_per_string,
        strings_per_inverter=strings,
    )

    mc = ModelChain(system, location, aoi_model="physical",
                    spectral_model="no_loss")
    mc.run_model(weather)

    # Cause 4: integrate the AC series (W), never the DC series
    ac_w = mc.results.ac.clip(lower=0.0)          # inverter tare can go negative
    hours = len(ac_w)
    energy_mwh = float(ac_w.sum()) / 1e6          # 1 h steps: sum(W)·1h -> Wh
    ac_nameplate_w = inverter["Paco"] * strings   # rated AC across inverters
    capacity_factor = energy_mwh * 1e6 / (ac_nameplate_w * hours)

    return {
        "ac_power_w": ac_w,
        "energy_mwh": energy_mwh,
        "capacity_factor": float(capacity_factor),
        "hours": hours,
    }
```

Reading `mc.results.ac` after the chain runs is the single correction that separates a metered AC number from an inflated DC one: the AC series already reflects inverter conversion loss and clipping at `Paco`, so summing it gives the energy that would actually cross the point of interconnection.

## Fallback Routing & Performance Tuning

For long runs, sparse inputs, or CI/CD execution, layer these strategies on top of the core function:

- **Pick the decomposition model deliberately.** `erbs` is fastest and robust for hourly data; switch to `disc` or `dirint` when you need better beam estimates under variable-sky conditions. Log which model was used in the result metadata so the yield is reproducible.
- **Clearsky-fill short gaps.** For isolated `NaN` runs in the weather frame, backfill with `location.get_clearsky(index)` scaled by a clear-sky index rather than dropping timestamps — dropping rows silently shortens the integration window and biases the capacity factor.
- **Chunk multi-year runs by calendar year.** Loop `run_model` over one-year weather slabs and concatenate the AC series; a single 30-year hourly frame per portfolio site is a needless memory spike, and per-year slabs parallelize cleanly.
- **Cache the SAM tables.** `retrieve_sam` reads a bundled CSV on every call; load `SandiaMod` and `CECInverter` once and pass the resolved `Series` into a batch loop when scoring hundreds of sites.
- **Reuse solar position across identical timestamps.** When many sites share the same weather index and timezone, compute `get_solarposition` once and feed it to `erbs` for every site instead of recomputing per run.

## Downstream Validation

Before an AC series feeds a finance model or a portfolio roll-up, gate it with assertions suitable for a CI/CD pipeline. These catch the failure signatures that do not raise on their own — an all-zero profile from a timezone slip, a capacity factor outside physical bounds, or a truncated integration window.

```python
import numpy as np
import pandas as pd


def assert_ac_series_integrity(result: dict, expected_hours: int,
                               cf_bounds: tuple = (0.0, 1.0)) -> None:
    """CI/CD gate: fail the build if the AC yield is not assessment-grade."""
    ac = result["ac_power_w"]
    assert isinstance(ac.index, pd.DatetimeIndex) and ac.index.tz is not None, \
        "AC series lost its timezone-aware index"
    assert (ac >= 0).all(), "negative AC power present after clipping"
    assert float(ac.max()) > 0, "all-zero AC series — check index tz vs site"
    lo, hi = cf_bounds
    cf = result["capacity_factor"]
    assert lo <= cf <= hi, f"capacity_factor {cf:.3f} outside [{lo}, {hi}]"
    assert result["hours"] == expected_hours, (
        f"integration window is {result['hours']} h, expected {expected_hours}; "
        "gaps were dropped instead of filled"
    )
```

Recording the decomposition model, the resolved device names, and the hour count alongside the `energy_mwh` figure is what makes the simulation auditable: an independent reviewer can confirm the yield came from AC power over a complete window, not DC power over a truncated one. The same capacity-factor sanity band feeds directly into [computing capacity factors from hourly generation timeseries](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/computing-capacity-factors-from-hourly-generation-timeseries/), and a defensible AC yield is only bankable once the site also clears the grid-side [thermal headroom checks in grid capacity buffer analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/). Pin `pvlib`, `pandas`, and `numpy` versions in `pyproject.toml` so a default-model change in a future release cannot silently shift the yield between runs.

## Related

- [Solar PV Yield Simulation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-pv-yield-simulation/) — parent workflow that scales this single-site chain across a portfolio
- [Solar Irradiance Raster Processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) — produces the GHI/DNI/DHI rasters this simulation consumes
- [Computing Capacity Factors from Hourly Generation Timeseries](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/computing-capacity-factors-from-hourly-generation-timeseries/) — turns the AC series into an auditable capacity factor
- [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) — checks whether the modeled AC yield fits available interconnection headroom
