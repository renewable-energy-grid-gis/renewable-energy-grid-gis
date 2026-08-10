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

<svg viewBox="0 20 900 332" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Decision flow mapping four ModelChain failure causes to their fixes. A weather DataFrame enters a timezone gate; a naive index is localized to the site timezone. It then reaches an irradiance-component gate; if DNI and DHI are absent, an Erbs decomposition derives them from GHI. Next a device-key gate checks that the module and inverter names exist in the Sandia database, raising KeyError otherwise. Finally the ModelChain runs and the AC result — not the DC result — is integrated to energy and a capacity factor." style="max-width:100%;height:auto;font-family:inherit">
  <rect class="svg-bg" x="0" y="20" width="900" height="332"/>
  <title>Mapping four ModelChain failure causes to their fixes</title>
  <desc>A left-to-right pipeline. A weather DataFrame enters a timezone-parity gate; a naive index branches down to a localize-to-site-timezone fix. The stream then reaches an irradiance-component gate; missing DNI and DHI branch down to an Erbs decomposition that derives beam and diffuse from GHI. Next, a device-key gate verifies module and inverter names exist in the Sandia database and raises a KeyError otherwise. The validated inputs reach the ModelChain run node, whose AC result — explicitly not the DC result — feeds an integrate-to-energy node emitting MWh and a capacity factor.</desc>
  <defs>
    <marker id="pv-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
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

<svg viewBox="0 0 940 404" role="img" aria-label="What each pvlib model expects before it will run. PVWatts needs only a DC rating, a temperature coefficient and a system loss percentage, which is why it works from a nameplate. SAPM needs a full module parameter set from the Sandia database plus mounting coefficients. The CEC model needs the six single-diode parameters. Choosing a model is therefore choosing what data must exist — and a missing parameter fails at ModelChain construction, not at run time." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Three PV models, three very different input requirements</title>
  <desc>A comparison of three pvlib model choices. PVWatts requires a DC nameplate rating, a power temperature coefficient and an aggregate loss percentage, is available from any datasheet, and is suited to portfolio screening. SAPM requires the full Sandia module parameter set and mounting configuration coefficients, is available only for modules in the Sandia database, and is suited to detailed design. The CEC single-diode model requires six diode parameters, is available from the CEC module library, and is suited to bankable energy assessments. A note records that a missing parameter raises at construction time rather than during the run.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="404"/>
  <defs><marker id="pm2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The model you choose is the data you must already have</text>
  <rect x="40" y="62" width="272" height="236" rx="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4" opacity="0.5"/>
  <text x="176" y="90" text-anchor="middle" font-size="13.5" fill="currentColor" font-weight="700">PVWatts</text>
  <text x="176" y="122" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">pdc0 — DC nameplate</text>
  <text x="176" y="144" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">gamma_pdc — temp coeff</text>
  <text x="176" y="166" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">losses — aggregate %</text>
  <text x="176" y="226" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">any datasheet</text>
  <text x="176" y="246" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">availability</text>
  <text x="176" y="276" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">portfolio screening</text>
  <rect x="336" y="62" width="272" height="236" rx="9" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4" opacity="0.5"/>
  <text x="472" y="90" text-anchor="middle" font-size="13.5" fill="currentColor" font-weight="700">SAPM</text>
  <text x="472" y="122" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">full Sandia parameter set</text>
  <text x="472" y="144" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">mounting coefficients a, b</text>
  <text x="472" y="166" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">deltaT for the rack type</text>
  <text x="472" y="226" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">Sandia database only</text>
  <text x="472" y="246" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">availability</text>
  <text x="472" y="276" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">detailed design</text>
  <rect x="632" y="62" width="272" height="236" rx="9" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.4" opacity="0.5"/>
  <text x="768" y="90" text-anchor="middle" font-size="13.5" fill="currentColor" font-weight="700">CEC single diode</text>
  <text x="768" y="122" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">I_L_ref, I_o_ref, R_s</text>
  <text x="768" y="144" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">R_sh_ref, a_ref, Adjust</text>
  <text x="768" y="166" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">from the CEC library</text>
  <text x="768" y="226" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">CEC module library</text>
  <text x="768" y="246" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">availability</text>
  <text x="768" y="276" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">bankable assessment</text>
  <rect x="40" y="320" width="864" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="472.0" y="341" text-anchor="middle" font-size="11.5" fill="currentColor">A missing parameter raises when the ModelChain is constructed, not part-way through an 8 760-hour run —</text>
  <text x="472.0" y="358" text-anchor="middle" font-size="11.5" fill="currentColor">so validate the module dictionary in the pre-flight step and fail before the loop starts.</text>
</svg>

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

<svg viewBox="0 0 940 396" role="img" aria-label="A clear June day for a 125 megawatt DC array behind a 100 megawatt AC inverter. The DC curve peaks near 118 megawatts, but AC output flattens at 100 from about 10:40 to 15:20 — the plateau is clipping, and the area above the plateau is the energy the inverter cannot pass. On this day it is 214 megawatt-hours, about 4.1 percent of the day. A model that reports DC output as generation never shows the plateau." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>What clipping looks like in an hourly profile</title>
  <desc>An hourly profile over one clear June day. A DC power curve rises from sunrise to a peak near 118 megawatts at solar noon and falls to sunset. An AC curve follows it until it reaches the 100 megawatt inverter rating at about 10:40, then runs flat until about 15:20, when it drops back below the rating and rejoins the DC curve. The area between the two curves during the plateau is shaded and annotated as 214 megawatt-hours of clipped energy, about 4.1 percent of the day.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="cp-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">One clear June day: 125 MW DC behind a 100 MW AC inverter</text>
  <line x1="100" y1="288" x2="880" y2="288" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="100" y1="64" x2="100" y2="288" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="96" y1="288.0" x2="880" y2="288.0" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="90" y="292.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0 MW</text>
  <line x1="96" y1="204.15384615384613" x2="880" y2="204.15384615384613" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="90" y="208.15384615384613" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">50 MW</text>
  <line x1="96" y1="120.30769230769229" x2="880" y2="120.30769230769229" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="90" y="124.30769230769229" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">100 MW</text>
  <line x1="145.88235294117646" y1="288" x2="145.88235294117646" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="145.88235294117646" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">05:00</text>
  <line x1="283.52941176470586" y1="288" x2="283.52941176470586" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="283.52941176470586" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">08:00</text>
  <line x1="421.1764705882353" y1="288" x2="421.1764705882353" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="421.1764705882353" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">11:00</text>
  <line x1="558.8235294117646" y1="288" x2="558.8235294117646" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="558.8235294117646" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">14:00</text>
  <line x1="696.470588235294" y1="288" x2="696.470588235294" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="696.470588235294" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">17:00</text>
  <line x1="834.1176470588235" y1="288" x2="834.1176470588235" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="834.1176470588235" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">20:00</text>
  <path d="M100.0,288.0 L104.6,288.0 L109.2,288.0 L113.8,288.0 L118.4,288.0 L122.9,288.0 L127.5,288.0 L132.1,288.0 L136.7,288.0 L141.3,288.0 L145.9,288.0 L150.5,288.0 L155.1,288.0 L159.6,288.0 L164.2,288.0 L168.8,288.0 L173.4,288.0 L178.0,288.0 L182.6,288.0 L187.2,288.0 L191.8,288.0 L196.4,288.0 L200.9,288.0 L205.5,288.0 L210.1,288.0 L214.7,288.0 L219.3,288.0 L223.9,288.0 L228.5,288.0 L233.1,288.0 L237.6,288.0 L242.2,288.0 L246.8,288.0 L251.4,288.0 L256.0,287.7 L260.6,287.1 L265.2,286.2 L269.8,285.0 L274.4,283.6 L278.9,281.8 L283.5,279.8 L288.1,277.5 L292.7,275.0 L297.3,272.2 L301.9,269.1 L306.5,265.8 L311.1,262.3 L315.6,258.5 L320.2,254.6 L324.8,250.4 L329.4,246.1 L334.0,241.6 L338.6,237.0 L343.2,232.2 L347.8,227.2 L352.4,222.2 L356.9,217.1 L361.5,211.8 L366.1,206.5 L370.7,201.2 L375.3,195.8 L379.9,190.4 L384.5,185.0 L389.1,179.6 L393.6,174.3 L398.2,168.9 L402.8,163.7 L407.4,158.5 L412.0,153.4 L416.6,148.4 L421.2,143.5 L425.8,138.8 L430.4,134.2 L434.9,129.8 L439.5,125.6 L444.1,121.5 L448.7,117.7 L453.3,114.0 L457.9,110.6 L462.5,107.5 L467.1,104.5 L471.6,101.8 L476.2,99.4 L480.8,97.3 L485.4,95.4 L490.0,93.8 L494.6,92.5 L499.2,91.4 L503.8,90.7 L508.4,90.3 L512.9,90.1 L517.5,90.3 L522.1,90.7 L526.7,91.4 L531.3,92.5 L535.9,93.8 L540.5,95.4 L545.1,97.3 L549.6,99.4 L554.2,101.8 L558.8,104.5 L563.4,107.5 L568.0,110.6 L572.6,114.0 L577.2,117.7 L581.8,121.5 L586.4,125.6 L590.9,129.8 L595.5,134.2 L600.1,138.8 L604.7,143.5 L609.3,148.4 L613.9,153.4 L618.5,158.5 L623.1,163.7 L627.6,168.9 L632.2,174.3 L636.8,179.6 L641.4,185.0 L646.0,190.4 L650.6,195.8 L655.2,201.2 L659.8,206.5 L664.4,211.8 L668.9,217.1 L673.5,222.2 L678.1,227.2 L682.7,232.2 L687.3,237.0 L691.9,241.6 L696.5,246.1 L701.1,250.4 L705.6,254.6 L710.2,258.5 L714.8,262.3 L719.4,265.8 L724.0,269.1 L728.6,272.2 L733.2,275.0 L737.8,277.5 L742.4,279.8 L746.9,281.8 L751.5,283.6 L756.1,285.0 L760.7,286.2 L765.3,287.1 L769.9,287.7 L774.5,288.0 L779.1,288.0 L783.6,288.0 L788.2,288.0 L792.8,288.0 L797.4,288.0 L802.0,288.0 L806.6,288.0 L811.2,288.0 L815.8,288.0 L820.4,288.0 L824.9,288.0 L829.5,288.0 L834.1,288.0 L838.7,288.0 L843.3,288.0 L847.9,288.0 L852.5,288.0 L857.1,288.0 L861.6,288.0 L866.2,288.0 L870.8,288.0 L875.4,288.0 L880.0,288.0" fill="none" stroke="#5BA8C8" stroke-width="2.4" stroke-dasharray="6 4"/>
  <path d="M100.0,288.0 L104.6,288.0 L109.2,288.0 L113.8,288.0 L118.4,288.0 L122.9,288.0 L127.5,288.0 L132.1,288.0 L136.7,288.0 L141.3,288.0 L145.9,288.0 L150.5,288.0 L155.1,288.0 L159.6,288.0 L164.2,288.0 L168.8,288.0 L173.4,288.0 L178.0,288.0 L182.6,288.0 L187.2,288.0 L191.8,288.0 L196.4,288.0 L200.9,288.0 L205.5,288.0 L210.1,288.0 L214.7,288.0 L219.3,288.0 L223.9,288.0 L228.5,288.0 L233.1,288.0 L237.6,288.0 L242.2,288.0 L246.8,288.0 L251.4,288.0 L256.0,287.7 L260.6,287.1 L265.2,286.2 L269.8,285.0 L274.4,283.6 L278.9,281.8 L283.5,279.8 L288.1,277.5 L292.7,275.0 L297.3,272.2 L301.9,269.1 L306.5,265.8 L311.1,262.3 L315.6,258.5 L320.2,254.6 L324.8,250.4 L329.4,246.1 L334.0,241.6 L338.6,237.0 L343.2,232.2 L347.8,227.2 L352.4,222.2 L356.9,217.1 L361.5,211.8 L366.1,206.5 L370.7,201.2 L375.3,195.8 L379.9,190.4 L384.5,185.0 L389.1,179.6 L393.6,174.3 L398.2,168.9 L402.8,163.7 L407.4,158.5 L412.0,153.4 L416.6,148.4 L421.2,143.5 L425.8,138.8 L430.4,134.2 L434.9,129.8 L439.5,125.6 L444.1,121.5 L448.7,120.3 L453.3,120.3 L457.9,120.3 L462.5,120.3 L467.1,120.3 L471.6,120.3 L476.2,120.3 L480.8,120.3 L485.4,120.3 L490.0,120.3 L494.6,120.3 L499.2,120.3 L503.8,120.3 L508.4,120.3 L512.9,120.3 L517.5,120.3 L522.1,120.3 L526.7,120.3 L531.3,120.3 L535.9,120.3 L540.5,120.3 L545.1,120.3 L549.6,120.3 L554.2,120.3 L558.8,120.3 L563.4,120.3 L568.0,120.3 L572.6,120.3 L577.2,120.3 L581.8,121.5 L586.4,125.6 L590.9,129.8 L595.5,134.2 L600.1,138.8 L604.7,143.5 L609.3,148.4 L613.9,153.4 L618.5,158.5 L623.1,163.7 L627.6,168.9 L632.2,174.3 L636.8,179.6 L641.4,185.0 L646.0,190.4 L650.6,195.8 L655.2,201.2 L659.8,206.5 L664.4,211.8 L668.9,217.1 L673.5,222.2 L678.1,227.2 L682.7,232.2 L687.3,237.0 L691.9,241.6 L696.5,246.1 L701.1,250.4 L705.6,254.6 L710.2,258.5 L714.8,262.3 L719.4,265.8 L724.0,269.1 L728.6,272.2 L733.2,275.0 L737.8,277.5 L742.4,279.8 L746.9,281.8 L751.5,283.6 L756.1,285.0 L760.7,286.2 L765.3,287.1 L769.9,287.7 L774.5,288.0 L779.1,288.0 L783.6,288.0 L788.2,288.0 L792.8,288.0 L797.4,288.0 L802.0,288.0 L806.6,288.0 L811.2,288.0 L815.8,288.0 L820.4,288.0 L824.9,288.0 L829.5,288.0 L834.1,288.0 L838.7,288.0 L843.3,288.0 L847.9,288.0 L852.5,288.0 L857.1,288.0 L861.6,288.0 L866.2,288.0 L870.8,288.0 L875.4,288.0 L880.0,288.0" fill="none" stroke="#3D8B5F" stroke-width="2.8"/>
  <path d="M448.7,120.3 L448.7,117.7 L453.3,114.0 L457.9,110.6 L462.5,107.5 L467.1,104.5 L471.6,101.8 L476.2,99.4 L480.8,97.3 L485.4,95.4 L490.0,93.8 L494.6,92.5 L499.2,91.4 L503.8,90.7 L508.4,90.3 L512.9,90.1 L517.5,90.3 L522.1,90.7 L526.7,91.4 L531.3,92.5 L535.9,93.8 L540.5,95.4 L545.1,97.3 L549.6,99.4 L554.2,101.8 L558.8,104.5 L563.4,107.5 L568.0,110.6 L572.6,114.0 L577.2,117.7 L577.2,120.3 Z" fill="#FFE3BE" fill-opacity="0.85" stroke="#F4A261" stroke-width="1.2"/>
  <text x="512.9411764705883" y="100.18461538461537" text-anchor="middle" font-size="11.5" fill="#7A4A1A" font-weight="700">214 MWh clipped — 4.1% of the day</text>
  <text x="806.5882352941176" y="112.30769230769229" text-anchor="end" font-size="11" fill="#1F5C3A" font-weight="700">AC rating 100 MW</text>
  <text x="301.88235294117646" y="190.73846153846154" text-anchor="middle" font-size="11.5" fill="#2C6E8F" font-weight="700">DC</text>
  <rect x="100" y="322" width="372" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="286.0" y="343" text-anchor="middle" font-size="11.5" fill="currentColor">The plateau is the whole story: outside it,</text>
  <text x="286.0" y="360" text-anchor="middle" font-size="11.5" fill="currentColor">AC and DC differ only by conversion loss</text>
  <rect x="490" y="322" width="390" height="48" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="685.0" y="343" text-anchor="middle" font-size="11.5" fill="currentColor">mc.results.ac is what a meter sees;</text>
  <text x="685.0" y="360" text-anchor="middle" font-size="11.5" fill="currentColor">mc.results.dc is not generation</text>
</svg>

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
