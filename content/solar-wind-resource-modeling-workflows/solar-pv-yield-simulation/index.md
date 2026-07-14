---
title: Solar PV Yield Simulation
description: Turn gridded GHI/DNI/DHI rasters into modeled AC energy with a pvlib ModelChain — POA transposition, temperature derating, inverter clipping, DC/AC ratio, and capacity factor.
slug: solar-pv-yield-simulation
type: guide
breadcrumb: Solar PV Yield Simulation
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Solar PV Yield Simulation

Solar PV yield simulation is the stage where gridded resource data stops being a physics abstraction and becomes a number a project finance model will underwrite, and it is the modeling heart of the [Solar & Wind Resource Modeling Workflows](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/) pipeline. The failure mode this page addresses is the seductive one-liner: `annual_energy = ghi_array * panel_area_m2 * module_efficiency * 8760`. That estimate treats the array as a flat-plate radiometer that never heats up, never clips its inverter, and never loses a watt to soiling, wiring, or spectral mismatch. It does not raise an exception — it returns a plausible-looking megawatt-hour figure that is routinely 15–35% too high, and the error is not a constant offset you can calibrate away. It is a function of tilt, latitude, ambient temperature, and the DC/AC ratio, so two sites with identical annual GHI can have materially different AC yields.

This page builds the correct alternative: a deterministic [pvlib](https://pvlib-python.readthedocs.io/) `ModelChain` that transposes horizontal irradiance to the plane of array, derates DC power for cell temperature, clips DC through an inverter model, applies a losses stack, and emits a `capacity_factor` and `annual_energy_mwh` field per site or per pixel. It follows the path energy actually takes through a module: the raster components produced by [solar irradiance raster processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) enter as GHI, DNI, and DHI; they leave as AC power at the meter. The single-site walkthrough with a concrete weather frame lives in [simulating hourly PV output with pvlib ModelChain](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-pv-yield-simulation/simulating-hourly-pv-output-with-pvlib-modelchain/); this page is the workflow that scales that simulation across a portfolio and reconciles its output for audit.

## Why Naive Yield Estimates Fail

The `GHI × area × efficiency` shortcut collapses four independent physical transforms into one multiplication, and each omission pushes the estimate the same direction — up.

**It ignores plane-of-array geometry.** A fixed-tilt array does not see global horizontal irradiance; it sees the irradiance incident on a tilted plane, which combines beam, sky-diffuse, and ground-reflected components. The isotropic-sky transposition is

$$ G_\text{POA} = G_b R_b + G_d\,\frac{1+\cos\beta}{2} + \rho\,G\,\frac{1-\cos\beta}{2} $$

where $\beta$ is the surface tilt, $R_b$ the beam tilt factor, and $\rho$ the ground albedo. pvlib defaults to the anisotropic Perez model, which is materially more accurate near the horizon. For a mid-latitude fixed array this raises annual incident energy 10–20% above GHI — an *upward* correction the naive formula misses, which then gets swamped by the downward corrections below.

**It ignores cell temperature.** Silicon loses power as it heats. Cell temperature under the Sandia (SAPM) thermal model rises with plane-of-array irradiance,

$$ T_\text{cell} = T_\text{amb} + G_\text{POA}\,e^{\,a + b\,v_\text{wind}} + \frac{G_\text{POA}}{1000}\,\Delta T $$

and DC power derates linearly around the 25 °C reference:

$$ P_\text{dc} = P_\text{dc0}\,\frac{G_\text{POA}}{G_\text{ref}}\,\bigl(1 + \gamma_\text{pdc}\,(T_\text{cell}-25)\bigr) $$

With $\gamma_\text{pdc}\approx-0.0035\ \text{°C}^{-1}$, a cell at 55 °C is already 10.5% below nameplate — a loss the flat-plate estimate never books.

**It ignores the inverter.** Real systems are built with a DC array larger than the AC inverter — the DC/AC ratio (inverter loading ratio)

$$ R_\text{DC/AC} = \frac{P_\text{dc0}}{P_\text{ac0}} $$

is typically 1.1–1.4. Above the clipping threshold the inverter caps output, so peak-hour DC that the naive formula counts in full is simply thrown away:

$$ P_\text{ac} = \min\!\bigl(\eta_\text{inv}\,P_\text{dc},\; P_\text{ac0}\bigr) $$

**It ignores the losses stack.** Soiling, shading, mismatch, wiring, connections, light-induced degradation, and availability compound to a system loss near 14%. None of these appear in `efficiency`, which is a single STC nameplate number.

The net result is not random noise. It is a systematic overstatement that a lender's independent engineer will catch and discount, which is exactly why the modeled chain — not the multiplication — is the deliverable.

## Inside the pvlib ModelChain

The `ModelChain` is pvlib's orchestration object: given a `Location` (latitude, longitude, timezone), a `PVSystem` (mount geometry, module and inverter parameters, temperature model, losses), and a weather frame, it runs solar position, transposition, cell temperature, DC, and AC in the correct order and stores every intermediate on `mc.results`. The diagram below is the transform sequence, with the failure each guarded stage prevents called out beneath it.

<svg viewBox="0 0 1080 430" role="img" aria-label="Solar PV yield simulation chain: a GHI, DNI, DHI raster with air temperature and wind feeds plane-of-array transposition using the Perez sky model, then a cell-temperature and DC model, then inverter clipping and the losses stack, producing a capacity factor and annual energy field. Three amber callouts mark the failure each guarded stage prevents: skipping transposition gives a flat-plate error, skipping the cell-temperature derate overstates output in heat, and skipping the inverter clip books phantom AC energy above the AC rating." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>From resource raster to AC energy through the pvlib ModelChain</title>
  <desc>A left-to-right pipeline. A GHI/DNI/DHI raster carrying air temperature and wind enters plane-of-array transposition (Perez sky model), then a cell-temperature and DC model (SAPM temperature, PVWatts DC), then inverter clipping and the losses stack governed by the DC/AC ratio, ending in a green capacity_factor and annual_energy_mwh field. Amber callouts beneath three stages mark what each prevents: no transposition yields a flat-plate error, skipping the cell-temperature derate overstates output in heat, and no inverter clip books phantom AC energy above the AC nameplate.</desc>
  <defs>
    <style>
      .stage { fill:#DCEEF6; stroke:#5BA8C8; stroke-width:1.5; }
      .warn  { fill:#FFE3BE; stroke:#F4A261; stroke-width:1.5; }
      .good  { fill:#DDF0E2; stroke:#3D8B5F; stroke-width:1.5; }
      .lbl   { fill:currentColor; text-anchor:middle; }
      .edge  { stroke:currentColor; stroke-width:1.6; fill:none; opacity:0.85; }
      .ehead { fill:currentColor; stroke:none; opacity:0.85; }
      .dash  { stroke:#F4A261; stroke-width:1.4; fill:none; stroke-dasharray:4 4; opacity:0.9; }
      .tag   { fill:currentColor; opacity:0.78; text-anchor:middle; }
    </style>
  </defs>
  <!-- backbone -->
  <rect class="stage" x="20"  y="50" width="180" height="84" rx="10"/>
  <rect class="stage" x="230" y="50" width="180" height="84" rx="10"/>
  <rect class="stage" x="440" y="50" width="180" height="84" rx="10"/>
  <rect class="stage" x="650" y="50" width="180" height="84" rx="10"/>
  <rect class="good"  x="860" y="50" width="180" height="84" rx="10"/>
  <g class="lbl" font-size="13">
    <text x="110" y="80">GHI · DNI · DHI</text><text x="110" y="98">raster</text><text x="110" y="116" font-size="11" opacity="0.8">+ T_air, wind</text>
    <text x="320" y="80">POA</text><text x="320" y="98">transposition</text><text x="320" y="116" font-size="11" opacity="0.8">Perez sky</text>
    <text x="530" y="80">Cell temp</text><text x="530" y="98">+ DC model</text><text x="530" y="116" font-size="11" opacity="0.8">SAPM · PVWatts</text>
    <text x="740" y="80">Inverter clip</text><text x="740" y="98">+ losses stack</text><text x="740" y="116" font-size="11" opacity="0.8">DC/AC ratio</text>
    <text x="950" y="84" font-weight="600">capacity_factor</text><text x="950" y="104" font-weight="600">annual_energy_mwh</text>
  </g>
  <!-- backbone arrows -->
  <g class="edge">
    <line x1="200" y1="92" x2="222" y2="92"/><path class="ehead" d="M222 87 L230 92 L222 97 Z"/>
    <line x1="410" y1="92" x2="432" y2="92"/><path class="ehead" d="M432 87 L440 92 L432 97 Z"/>
    <line x1="620" y1="92" x2="642" y2="92"/><path class="ehead" d="M642 87 L650 92 L642 97 Z"/>
    <line x1="830" y1="92" x2="852" y2="92"/><path class="ehead" d="M852 87 L860 92 L852 97 Z"/>
  </g>
  <!-- warning callouts -->
  <rect class="warn" x="230" y="200" width="180" height="60" rx="9"/>
  <rect class="warn" x="440" y="200" width="180" height="60" rx="9"/>
  <rect class="warn" x="650" y="200" width="180" height="60" rx="9"/>
  <g class="lbl" font-size="12">
    <text x="320" y="224">No transposition &#8594;</text><text x="320" y="241">flat-plate error</text>
    <text x="530" y="224">Skip T_cell derate &#8594;</text><text x="530" y="241">overstated in heat</text>
    <text x="740" y="224">No inverter clip &#8594;</text><text x="740" y="241">phantom AC energy</text>
  </g>
  <g class="dash">
    <line x1="320" y1="134" x2="320" y2="198"/>
    <line x1="530" y1="134" x2="530" y2="198"/>
    <line x1="740" y1="134" x2="740" y2="198"/>
  </g>
  <g class="tag" font-size="9.5" font-weight="700" letter-spacing="0.6">
    <text x="320" y="166">PREVENTS</text>
    <text x="530" y="166">PREVENTS</text>
    <text x="740" y="166">PREVENTS</text>
  </g>
  <text x="540" y="300" class="tag" font-size="11.5">Each stage's intermediate is retained on mc.results, so a reviewer can inspect POA, cell temp, and DC before the AC total.</text>
  <text x="540" y="322" class="tag" font-size="11.5">Capacity factor is the AC total divided by the AC nameplate rating over the period — never the DC nameplate.</text>
</svg>

The value of the object is that it makes the sequence non-negotiable: you cannot accidentally apply the losses stack before transposition, and every intermediate — plane-of-array irradiance, cell temperature, DC power — is inspectable, which is what lets you diagnose a suspect capacity factor instead of trusting a black box.

## Prerequisites & Data Requirements

Running a `ModelChain` at portfolio scale assumes the following inputs and environment:

- **A weather frame per site** — a `pandas.DataFrame` indexed by a **timezone-aware** `DatetimeIndex`, with columns `ghi`, `dni`, `dhi`, `temp_air`, and `wind_speed`. pvlib's solar-position routines derive the sun's apparent position from the index, so a timezone-naive index silently computes positions in UTC and shifts the whole diurnal curve — the single most common cause of a wrong capacity factor.
- **Site coordinates in geographic degrees (EPSG:4326)**. pvlib's `Location` expects latitude and longitude, not projected easting/northing. When your resource stack lives in a projected frame such as EPSG:32610, sample the pixel value in the projected raster but transform the site centroid back to EPSG:4326 for pvlib — see [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) for the transformer pattern with `always_xy=True`.
- **System parameters**: DC nameplate `pdc0` (W), the temperature coefficient `gamma_pdc` (typically −0.0035 °C⁻¹ for crystalline silicon), surface tilt and azimuth, and a DC/AC ratio to size the inverter.
- **Library versions**: `pvlib >= 0.10` (the `Array`/`Mount` object model), `pandas >= 2.0`, and `numpy >= 1.24`. Irradiance rasters should already be atmospherically corrected and gap-filled upstream in [solar irradiance raster processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/); this stage assumes physically valid GHI/DNI/DHI, not raw satellite counts.

A note on interval: capacity factor and energy are only correct if you know the timestep. Hourly data means each `ac` sample in watts equals watt-hours over that hour; sub-hourly data must be scaled by the interval length before summation.

## Core Implementation: Running a ModelChain

The happy path constructs a `PVSystem` from explicit parameters, wraps it in a `ModelChain` with the PVWatts DC/AC models, runs it against the weather frame, and reduces the AC series to an energy total and capacity factor. The PVWatts formulation is used deliberately: it needs only nameplate-level parameters that are known at the screening stage, where full CEC single-diode coefficients are not.

```python
import numpy as np
import pandas as pd
import pvlib
from pvlib.location import Location
from pvlib.modelchain import ModelChain
from pvlib.pvsystem import Array, FixedMount, PVSystem
from pvlib.temperature import TEMPERATURE_MODEL_PARAMETERS


def simulate_site_yield(
    latitude: float,
    longitude: float,
    weather: pd.DataFrame,
    dc_capacity_kw: float = 1000.0,
    dc_ac_ratio: float = 1.30,
    surface_tilt: float = 25.0,
    surface_azimuth: float = 180.0,
    gamma_pdc: float = -0.0035,
) -> dict:
    """
    Simulate AC energy yield for one site from a resource weather frame.

    `weather` must have a timezone-aware DatetimeIndex and the columns
    ghi, dni, dhi, temp_air, wind_speed. Returns annual_energy_mwh and the
    AC-nameplate capacity_factor, plus the parameters that produced them.
    """
    if weather.index.tz is None:
        raise ValueError(
            "weather index is timezone-naive; solar position would be "
            "computed in UTC and shift the diurnal curve. Localize first."
        )

    location = Location(latitude, longitude, tz=weather.index.tz)

    pdc0_w = dc_capacity_kw * 1000.0
    ac_nameplate_w = pdc0_w / dc_ac_ratio  # inverter AC rating from the ILR

    array = Array(
        mount=FixedMount(surface_tilt=surface_tilt, surface_azimuth=surface_azimuth),
        module_parameters={"pdc0": pdc0_w, "gamma_pdc": gamma_pdc},
        temperature_model_parameters=(
            TEMPERATURE_MODEL_PARAMETERS["sapm"]["open_rack_glass_glass"]
        ),
    )
    system = PVSystem(
        arrays=[array],
        inverter_parameters={"pdc0": ac_nameplate_w},
        # PVWatts loss stack (percent): compounds to ~14% system loss
        losses_parameters={
            "soiling": 2.0, "shading": 3.0, "snow": 0.0, "mismatch": 2.0,
            "wiring": 2.0, "connections": 0.5, "lid": 1.5,
            "nameplate_rating": 1.0, "age": 0.0, "availability": 3.0,
        },
    )

    mc = ModelChain(
        system, location,
        aoi_model="physical",        # angle-of-incidence reflection losses
        spectral_model="no_loss",    # PVWatts carries no spectral term
        losses_model="pvwatts",
    )
    mc.run_model(weather)            # runs solpos -> POA -> temp -> DC -> AC

    ac_w = mc.results.ac.clip(lower=0.0)          # discard night-time tare draw
    interval_h = _interval_hours(weather.index)
    energy_wh = float((ac_w * interval_h).sum())
    hours = len(weather) * interval_h

    return {
        "annual_energy_mwh": energy_wh / 1e6,
        "capacity_factor": energy_wh / (ac_nameplate_w * hours),
        "dc_ac_ratio": dc_ac_ratio,
        "ac_nameplate_kw": ac_nameplate_w / 1000.0,
        "surface_tilt": surface_tilt,
    }


def _interval_hours(index: pd.DatetimeIndex) -> float:
    """Infer the sampling interval in hours from a regular DatetimeIndex."""
    step = index.to_series().diff().dropna().mode()
    if step.empty:
        raise ValueError("Cannot infer timestep from an irregular index.")
    return step.iloc[0].total_seconds() / 3600.0
```

Two design choices are load-bearing. The inverter's `pdc0` is set from the DC/AC ratio, so clipping happens at the physically correct AC ceiling rather than an arbitrary one. And capacity factor is divided by the **AC** nameplate over the period — the metric a grid planner expects — not the DC nameplate, which would understate it by the loading ratio.

## Error Handling & Edge Cases

Each failure mode named in the framing has a concrete guard.

**Timezone-naive weather index.** The constructor above rejects it outright. There is no safe default: pvlib will happily run on a naive index and return a curve that is offset by the site's UTC offset, producing a capacity factor that looks reasonable and is wrong by hours of generation. Localize with `weather.index.tz_localize("Etc/GMT+8")` (or the site's IANA zone) before calling.

**Inverter clipping accounting.** A high DC/AC ratio is an economic choice, not a bug — it trades clipped peak energy for a cheaper inverter and a flatter output profile. But the clipped energy must be *reported*, not hidden. Quantify it by comparing unclipped DC-implied AC against the clipped result:

```python
def clipping_loss_fraction(mc, ac_nameplate_w: float) -> float:
    """Fraction of potential AC energy lost to inverter clipping."""
    dc_power = mc.results.dc  # PVWatts DC returns a Series of W
    if hasattr(dc_power, "columns"):        # single-diode returns a DataFrame
        dc_power = dc_power["p_mp"]
    potential = np.minimum(dc_power * 0.96, dc_power).clip(lower=0.0).sum()
    delivered = mc.results.ac.clip(lower=0.0).sum()
    clipped = np.maximum(dc_power.clip(lower=0.0).sum() * 0.96 - delivered, 0.0)
    return float(clipped / potential) if potential else 0.0
```

**Out-of-range or missing irradiance.** A NaN in `dni` propagates through transposition to a NaN AC sample, which then poisons the sum. Reject non-physical values (negative GHI, DNI above the extraterrestrial limit) at ingest, and decide explicitly whether a data gap becomes zero generation or a masked interval excluded from both numerator and the hour count — silently summing over NaN with `.sum()` treats gaps as zero and depresses the capacity factor without telling you.

**Night-time negative AC.** The PVWatts and Sandia inverter models draw a small tare power at night, yielding tiny negative AC values. Clipping the series at zero (as the core function does) is correct for an energy total; leaving them in understates yield by a fraction of a percent and can push a marginal site below a screening threshold.

## Performance & Scalability: Per-Pixel vs Per-Site

pvlib is vectorized over *time* but not over *space*: one `ModelChain.run_model` call handles all 8,760 hours for a single location in milliseconds, but it models one location. Running it per pixel over a national GHI raster — tens of millions of cells, each with an 8,760-step weather frame — is both compute- and memory-infeasible, and most of that compute is redundant because neighboring pixels share nearly identical resource and geometry.

The scalable pattern is to decouple *where you simulate* from *where you report*:

- **Simulate per representative site, map per pixel.** Cluster the resource grid into zones of similar annual GHI, tilt, and temperature regime, run one full `ModelChain` per zone centroid, then broadcast each zone's capacity factor back onto its pixels. A few hundred simulations can characterize a portfolio that spans millions of cells.
- **Parallelize independent sites.** Site simulations share nothing, so they are embarrassingly parallel. Fan them out with `dask.delayed` or a process pool and collect the per-site result dicts into a `GeoDataFrame`.
- **Keep the working dtype at float32.** Weather frames dominate the memory budget; float32 halves it against float64 with negligible loss for irradiance and temperature.
- **Reuse solar position within a zone.** If two sites share a latitude band and timezone, their solar-position series are effectively identical — compute once and reuse rather than recomputing inside every ModelChain.

```python
import dask
import geopandas as gpd


def simulate_portfolio(
    sites_gdf: gpd.GeoDataFrame,
    weather_for,        # callable: site_id -> weather DataFrame
    dc_ac_ratio: float = 1.30,
) -> gpd.GeoDataFrame:
    """
    Simulate every site in parallel and attach yield fields.

    `sites_gdf` must be in EPSG:4326 so lat/lon feed pvlib directly; reproject
    a projected inventory before calling.
    """
    if sites_gdf.crs is None or sites_gdf.crs.to_epsg() != 4326:
        raise ValueError("Site inventory must be EPSG:4326 for pvlib lat/lon.")

    tasks = []
    for site_id, row in sites_gdf.iterrows():
        weather = weather_for(site_id)
        tasks.append(
            dask.delayed(simulate_site_yield)(
                latitude=row.geometry.y,
                longitude=row.geometry.x,
                weather=weather,
                dc_capacity_kw=row["capacity_mw"] * 1000.0,
                dc_ac_ratio=dc_ac_ratio,
            )
        )
    results = dask.compute(*tasks)

    out = sites_gdf.copy()
    out["annual_energy_mwh"] = [r["annual_energy_mwh"] for r in results]
    out["capacity_factor"] = [r["capacity_factor"] for r in results]
    return out
```

The reduction of the resulting hourly output into monthly, annual, and P50/P90 bands — the metrics a financier actually consumes — is the province of [temporal data aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/), which handles the UTC normalization and leap-year handling that a naive `.resample()` gets wrong.

## Validation & Audit Trail

A modeled capacity factor is only trustworthy once it is bounded-checked and lineage-stamped. The strongest sanity check is the **performance ratio** — final yield divided by reference yield — which normalizes out the resource and should land in a tight, technology-specific band regardless of location:

$$ \mathrm{PR} = \frac{E_\text{AC}\,/\,P_\text{ac0}}{H_\text{POA}\,/\,G_\text{ref}} $$

A modern fixed-tilt system has a PR near 0.75–0.85; a value of 0.95 means the losses stack was skipped, and 0.55 means something double-counted a loss or clipped too hard. Capacity factor itself is a coarser but useful gate: utility-scale fixed-tilt PV runs roughly 0.14–0.28 depending on latitude and DC/AC ratio, so a result outside that band is a modeling error until proven otherwise.

```python
def audit_yield(result: dict, poa_energy_wh_per_m2: float,
                cf_bounds=(0.10, 0.32), pr_bounds=(0.70, 0.88)) -> dict:
    """
    Bound-check a simulated yield and stamp reproducibility lineage.
    Raises on an out-of-band capacity factor or performance ratio so a bad
    run fails a CI/CD gate instead of reaching a project model.
    """
    cf = result["capacity_factor"]
    if not (cf_bounds[0] <= cf <= cf_bounds[1]):
        raise AssertionError(
            f"capacity_factor {cf:.3f} outside plausible {cf_bounds} — "
            "check timezone, transposition, or losses."
        )

    ac_nameplate_w = result["ac_nameplate_kw"] * 1000.0
    e_ac_wh = result["annual_energy_mwh"] * 1e6
    ref_yield = poa_energy_wh_per_m2 / 1000.0           # H_POA / G_ref
    performance_ratio = (e_ac_wh / ac_nameplate_w) / ref_yield
    if not (pr_bounds[0] <= performance_ratio <= pr_bounds[1]):
        raise AssertionError(
            f"performance_ratio {performance_ratio:.3f} outside {pr_bounds}"
        )

    return {
        **result,
        "performance_ratio": round(performance_ratio, 4),
        "cf_bounds": cf_bounds,
        "pr_bounds": pr_bounds,
        "audit_timestamp": pd.Timestamp.utcnow().isoformat(),
    }
```

The `performance_ratio`, the bounds that were applied, and the timestamp are provenance, not decoration: they let a reviewer re-run the simulation and confirm the same verdict, and they turn the yield surface into an artifact that downstream stages can trust. Those artifacts frequently flow straight into interconnection screening, where a site's `annual_energy_mwh` is cross-referenced against [grid capacity buffer analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) thresholds to decide whether the point of interconnection can absorb it. Treat the whole chain as a deterministic pipeline — schema-validated weather in, bound-checked and lineage-stamped yield out — and a portfolio simulation becomes something an independent engineer can audit rather than a notebook nobody can reproduce.

## Related

- [Solar & Wind Resource Modeling Workflows](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/) — the parent pipeline this yield-simulation stage belongs to.
- [Solar Irradiance Raster Processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) — the GHI/DNI/DHI transposition and atmospheric correction that feed this simulation.
- [Simulating Hourly PV Output with pvlib ModelChain](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-pv-yield-simulation/simulating-hourly-pv-output-with-pvlib-modelchain/) — the single-site walkthrough with a concrete weather frame.
- [Temporal Data Aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) — reducing the hourly AC series into AEP and P50/P90 bands.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — transforming projected site centroids back to EPSG:4326 for pvlib.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "Simulate Solar PV AC Energy Yield from Resource Rasters with pvlib",
  "description": "A deterministic pvlib ModelChain workflow that turns gridded GHI/DNI/DHI resource data into modeled AC energy: plane-of-array transposition, temperature derating, inverter clipping via the DC/AC ratio, a losses stack, and a bound-checked capacity_factor and annual_energy_mwh field.",
  "step": [
    { "@type": "HowToStep", "position": 1, "name": "Transpose Irradiance to the Plane of Array in the ModelChain", "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-pv-yield-simulation/#inside-the-pvlib-modelchain" },
    { "@type": "HowToStep", "position": 2, "name": "Build and Run a pvlib ModelChain per Site", "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-pv-yield-simulation/#core-implementation-running-a-modelchain" },
    { "@type": "HowToStep", "position": 3, "name": "Handle Temperature Derating and Inverter Clipping Edge Cases", "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-pv-yield-simulation/#error-handling-edge-cases" },
    { "@type": "HowToStep", "position": 4, "name": "Scale Simulation Per-Site Instead of Per-Pixel", "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-pv-yield-simulation/#performance-scalability-per-pixel-vs-per-site" },
    { "@type": "HowToStep", "position": 5, "name": "Bound-Check Capacity Factor and Stamp Lineage", "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-pv-yield-simulation/#validation-audit-trail" }
  ]
}
</script>
</content>
</invoke>
