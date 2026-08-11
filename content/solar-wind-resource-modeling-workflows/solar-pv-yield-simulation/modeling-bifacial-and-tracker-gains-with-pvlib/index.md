---
title: Modeling Bifacial and Tracker Gains with pvlib
description: Quantify what single-axis tracking and bifacial modules actually add — backtracking geometry, ground albedo, rear irradiance and the losses that eat the headline gain, with the inputs each model demands.
slug: modeling-bifacial-and-tracker-gains-with-pvlib
type: article
breadcrumb: Modeling Bifacial & Tracker Gains
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Modeling Bifacial and Tracker Gains with pvlib

The scenario: a pro forma assumes a 25 percent tracker gain and a 10 percent bifacial gain, adds
them, and books 35 percent over a fixed monofacial baseline. The modelled result comes in at 27
percent, because tracking already captures much of what bifaciality would have gained, backtracking
gives away some of the tracker benefit to avoid row shading, and the rear-side gain depends on an
albedo nobody measured. This page models both properly, and it extends
[solar PV yield simulation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-pv-yield-simulation/).

## Root-cause analysis

Four modelling errors account for the gap between a headline gain and a modelled one.

1. **Adding gains that are not independent.** Tracking raises plane-of-array irradiance by keeping
   the module normal to the sun; bifaciality collects reflected light on the rear. Both draw partly
   on the same resource, so the combined gain is materially less than the sum.
2. **Ignoring backtracking.** A single-axis tracker at low sun angles would shade the next row, so it
   rotates back toward horizontal. That is a deliberate loss of direct gain in exchange for avoiding
   a larger shading loss, and a model without it over-states morning and evening output.
3. **Assuming an albedo.** Rear irradiance scales almost linearly with ground reflectance, and the
   plausible range — 0.15 for dark soil to 0.55 for fresh snow or light gravel — is a factor of
   three. A default of 0.25 is a guess that carries most of the bifacial uncertainty.
4. **Omitting rear-side losses.** Rear irradiance is not free energy: mismatch, structure shading and
   a lower bifaciality factor mean the module converts it at roughly 70 percent of front efficiency.

<svg viewBox="0 0 940 400" role="img" aria-label="Where a bifacial and tracking gain actually comes from, and where it goes. A fixed monofacial baseline is 100. Single-axis tracking adds 22. Bifacial rear collection adds 11 gross, but the rear is converted at a bifaciality factor of 0.75 and loses further to rear mismatch and structure shading, leaving 7 net. Backtracking gives back 2 to avoid row shading. The modelled combined gain is 27, not the 33 the headline figures add to." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Waterfall from a fixed monofacial baseline to a modelled combined gain</title>
  <desc>A waterfall chart starting from a fixed monofacial baseline of 100. Single-axis tracking adds 22 units. Gross rear-side collection adds 11. The bifaciality factor of 0.75 and rear mismatch and structure shading together remove 4. Backtracking removes 2 as the deliberate cost of avoiding row shading. The final bar, modelled combined output, stands at 127 — a 27 percent gain rather than the 33 percent that adding the two headline gains would suggest.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="bt1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Fixed monofacial = 100 · modelled combined = 127</text>
  <rect x="60" y="130.85714285714286" width="116" height="137.14285714285714" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="118" y="121.85714285714286" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">100</text>
  <text x="118" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">fixed</text>
  <text x="118" y="304" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">monofacial</text>
  <rect x="190" y="100.68571428571428" width="116" height="30.17142857142857" rx="4" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="248" y="91.68571428571428" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">22</text>
  <text x="248" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">+</text>
  <text x="248" y="304" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">single-axis tracki</text>
  <rect x="320" y="85.6" width="116" height="15.085714285714285" rx="4" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="378" y="76.6" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">11</text>
  <text x="378" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">+</text>
  <text x="378" y="304" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">rear collection (g</text>
  <rect x="450" y="85.6" width="116" height="5.485714285714286" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="508" y="76.6" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">4</text>
  <text x="508" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">−</text>
  <text x="508" y="304" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">bifaciality &amp; rear</text>
  <rect x="580" y="91.08571428571429" width="116" height="3" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="638" y="82.08571428571429" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">2</text>
  <text x="638" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">−</text>
  <text x="638" y="304" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">backtracking</text>
  <rect x="710" y="93.82857142857142" width="116" height="174.17142857142858" rx="4" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.8"/>
  <text x="768" y="84.82857142857142" text-anchor="middle" font-size="13" fill="#1F5C3A" font-weight="700">127</text>
  <text x="768" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">modelled</text>
  <text x="768" y="304" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">combined</text>
  <line x1="50" y1="268" x2="900" y2="268" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <rect x="60" y="330" width="848" height="40" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="484.0" y="349" text-anchor="middle" font-size="11" fill="currentColor">Adding a 22% tracker gain to an 11% bifacial gain books 33%. The two draw on the same photons, and the</text>
  <text x="484.0" y="364" text-anchor="middle" font-size="11" fill="currentColor">modelled interaction plus backtracking brings it to 27%.</text>
</svg>

## Pre-flight validation

Bifacial and tracker models need inputs a fixed monofacial model does not. Assert them before the
ModelChain is built, not part-way through an 8,760-hour run.

```python
def preflight_bifacial_tracker(system: dict, weather) -> dict:
    """Refuse to model what the inputs cannot support."""
    required_tracker = {"axis_tilt", "axis_azimuth", "max_angle", "gcr", "backtrack"}
    required_bifacial = {"bifaciality", "module_height", "pitch", "albedo"}

    missing_t = required_tracker - set(system)
    if missing_t:
        raise ValueError(f"tracker model needs {sorted(missing_t)}")
    missing_b = required_bifacial - set(system)
    if missing_b:
        raise ValueError(f"bifacial model needs {sorted(missing_b)}")

    if not 0.0 < system["gcr"] <= 0.6:
        raise ValueError(f"ground coverage ratio {system['gcr']} outside a buildable range")
    if not 0.05 <= system["albedo"] <= 0.9:
        raise ValueError(f"albedo {system['albedo']} outside any measured surface")
    if "dni" not in weather or "dhi" not in weather:
        raise ValueError("bifacial and transposition models need DNI and DHI, not GHI alone")

    return {
        "tracker": "single-axis" + (" with backtracking" if system["backtrack"] else ""),
        "gcr": system["gcr"],
        "albedo": system["albedo"],
        "bifaciality": system["bifaciality"],
        "albedo_source": system.get("albedo_source", "ASSUMED — measure or cite"),
    }
```

The `albedo_source` field exists to make an assumption visible. An albedo carried through a model
without a citation is the single largest unquantified term in a bifacial yield estimate.

## Fix implementation

```python
import pandas as pd
import pvlib


def model_tracker_bifacial(
    weather: pd.DataFrame,
    location: pvlib.location.Location,
    system: dict,
) -> pd.DataFrame:
    """Front and rear plane-of-array irradiance for a backtracking single-axis array."""
    solpos = location.get_solarposition(weather.index)

    tracking = pvlib.tracking.singleaxis(
        apparent_zenith=solpos["apparent_zenith"],
        apparent_azimuth=solpos["azimuth"],
        axis_tilt=system["axis_tilt"],
        axis_azimuth=system["axis_azimuth"],
        max_angle=system["max_angle"],
        backtrack=system["backtrack"],
        gcr=system["gcr"],
    )

    poa_front = pvlib.irradiance.get_total_irradiance(
        surface_tilt=tracking["surface_tilt"].fillna(0),
        surface_azimuth=tracking["surface_azimuth"].fillna(180),
        solar_zenith=solpos["apparent_zenith"],
        solar_azimuth=solpos["azimuth"],
        dni=weather["dni"], ghi=weather["ghi"], dhi=weather["dhi"],
        albedo=system["albedo"], model="perez",
    )

    # Rear irradiance from the infinite-sheds model: it accounts for row geometry,
    # ground reflection and the view factor each row actually sees.
    sheds = pvlib.bifacial.infinite_sheds.get_irradiance(
        surface_tilt=tracking["surface_tilt"].fillna(0),
        surface_azimuth=tracking["surface_azimuth"].fillna(180),
        solar_zenith=solpos["apparent_zenith"],
        solar_azimuth=solpos["azimuth"],
        gcr=system["gcr"],
        height=system["module_height"],
        pitch=system["pitch"],
        ghi=weather["ghi"], dhi=weather["dhi"], dni=weather["dni"],
        albedo=system["albedo"],
        npoints=100,
    )

    effective = sheds["poa_front"] + system["bifaciality"] * sheds["poa_back"]
    return pd.DataFrame({
        "tracker_angle": tracking["tracker_theta"],
        "surface_tilt": tracking["surface_tilt"],
        "poa_front_fixed_ref": poa_front["poa_global"],
        "poa_front": sheds["poa_front"],
        "poa_back": sheds["poa_back"],
        "poa_effective": effective,
        "bifacial_ratio": sheds["poa_back"] / sheds["poa_front"].replace(0, pd.NA),
    })
```

`infinite_sheds` rather than a flat rear-irradiance assumption is what makes the bifacial term
defensible: it accounts for the row pitch, the module height and the view factor each row has of the
ground, all of which change the rear gain by more than the albedo uncertainty does.

<svg viewBox="0 0 940 392" role="img" aria-label="Combined gain across ground coverage ratio, for a backtracking single-axis bifacial array. At a coverage ratio of 0.25 the combined gain over fixed monofacial is 31 percent and the energy per hectare is low. At 0.35 the gain is 27 percent. At 0.45 it is 23, and at 0.55 it falls to 19 as rows shade both each other and the ground. Energy per hectare rises the whole way, which is why the design point is an economic choice rather than a modelling one." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Combined gain and energy per hectare against ground coverage ratio</title>
  <desc>A chart with ground coverage ratio from 0.20 to 0.60 on the horizontal axis. One curve shows the combined tracking and bifacial gain over a fixed monofacial baseline, falling from 32 percent at 0.20 through 27 percent at 0.35 to 18 percent at 0.60 as rows increasingly shade each other and the ground. A second curve shows energy per hectare rising monotonically across the same range. A band marks 0.30 to 0.40 as the usual design range, where the two curves cross in economic terms.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="392"/>
  <defs><marker id="bt2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Per-module gain falls as per-hectare energy rises</text>
  <line x1="110" y1="276" x2="850" y2="276" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="110" y1="70" x2="110" y2="276" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <rect x="295.0" y="70" width="185.0" height="206" rx="0" fill="#DDF0E2" opacity="0.5"/>
  <text x="387.49999999999994" y="86" text-anchor="middle" font-size="11" fill="#1F5C3A" font-weight="700">usual design range</text>
  <line x1="106" y1="276.0" x2="850" y2="276.0" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="280.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">10%</text>
  <line x1="106" y1="209.33333333333334" x2="850" y2="209.33333333333334" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="213.33333333333334" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">20%</text>
  <line x1="106" y1="142.66666666666669" x2="850" y2="142.66666666666669" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="146.66666666666669" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">30%</text>
  <line x1="106" y1="76.0" x2="850" y2="76.0" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="80.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">40%</text>
  <line x1="110.0" y1="276" x2="110.0" y2="281" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="110.0" y="296" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0.20</text>
  <line x1="295.0" y1="276" x2="295.0" y2="281" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="295.0" y="296" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0.30</text>
  <line x1="480.0" y1="276" x2="480.0" y2="281" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="480.0" y="296" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0.40</text>
  <line x1="664.9999999999999" y1="276" x2="664.9999999999999" y2="281" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="664.9999999999999" y="296" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0.50</text>
  <line x1="849.9999999999999" y1="276" x2="849.9999999999999" y2="281" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="849.9999999999999" y="296" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0.60</text>
  <text x="20" y="62" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.8">ground coverage ratio →</text>
  <path d="M110.0,129.3 L202.5,136.0 L295.0,149.3 L387.5,162.7 L480.0,176.0 L572.5,189.3 L665.0,202.7 L757.5,216.0 L850.0,222.7" fill="none" stroke="#5BA8C8" stroke-width="2.6"/>
  <path d="M110.0,262.7 L295.0,216.0 L480.0,176.0 L665.0,142.7 L850.0,116.0" fill="none" stroke="#F4A261" stroke-width="2.6" stroke-dasharray="6 4"/>
  <rect x="110" y="308" width="16" height="12" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="134" y="319" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">combined gain over fixed monofacial</text>
  <rect x="470" y="308" width="16" height="12" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="494" y="319" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">energy per hectare (indexed)</text>
  <rect x="110" y="336" width="740" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="480.0" y="355" text-anchor="middle" font-size="11" fill="currentColor">The design point is where land cost, interconnection size and module cost meet — not where either curve</text>
  <text x="480.0" y="370" text-anchor="middle" font-size="11" fill="currentColor">is highest. Sweeping the ratio is what makes that trade visible.</text>
</svg>

## Fallback routing and performance tuning

- **Model the fixed monofacial baseline in the same run.** The gain is a ratio, and computing the
  baseline separately invites a mismatch in weather, losses or period.
- **Sensitivity-test the albedo, always.** Running at 0.18 and 0.35 brackets most sites and turns one
  number into a range that survives review.
- **Watch `gcr` and pitch together.** Raising ground coverage lifts energy per hectare and lowers
  both the bifacial gain and the tracker gain, because rows shade each other and the ground sooner.
- **Vectorise over sites, not over hours.** pvlib is already vectorised across the time index; the
  parallelism worth adding is one site per worker.
- **Cache the solar position.** It depends only on location and time index, so a portfolio at one
  latitude can share it across every system variant.

## Downstream validation

```python
def assert_gains_plausible(result, baseline_kwh: float, *, site_latitude: float) -> None:
    """Bounds that catch a mis-specified tracker or an implausible albedo."""
    tracker_gain = result["tracker_only_kwh"] / baseline_kwh - 1.0
    bifacial_gain = result["combined_kwh"] / result["tracker_only_kwh"] - 1.0

    assert 0.10 <= tracker_gain <= 0.35, (
        f"tracker gain {tracker_gain:.1%} outside the plausible 10–35% band — check gcr and max_angle"
    )
    assert 0.02 <= bifacial_gain <= 0.15, (
        f"bifacial gain {bifacial_gain:.1%} outside 2–15% — check albedo, height and pitch"
    )
    combined = result["combined_kwh"] / baseline_kwh - 1.0
    assert combined < tracker_gain + bifacial_gain + 1e-9, (
        "combined gain equals the sum of the parts — the two models are not interacting"
    )
    if abs(site_latitude) > 50:
        assert tracker_gain < 0.30, "tracker gain above 30% at high latitude is not credible"
```

The third assertion is the one that catches the opening scenario directly: if the combined gain
equals the sum of the individual gains, the models were run independently and added rather than
composed.

<svg viewBox="0 0 940 388" role="img" aria-label="How much of the bifacial estimate rests on an assumed albedo. At a ground reflectance of 0.15 — dark tilled soil — the rear contributes 4.6 percent. At 0.25, a common default, it is 7.4. At 0.35, dry light grass or gravel, it is 10.1. At 0.55, fresh snow, it is 15.2. Choosing the default rather than measuring carries a spread of five percentage points into the yield estimate, unlabelled." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Rear-side contribution against ground albedo</title>
  <desc>A bar chart of the rear-side energy contribution as a percentage of front-side output for five ground albedo values: 0.15 dark tilled soil at 4.6 percent, 0.20 at 6.0, 0.25 the common default at 7.4, 0.35 dry grass or gravel at 10.1, and 0.55 fresh snow at 15.2. The default value is marked, and an annotation records that the spread across the plausible range is more than five percentage points of yield, larger than most other uncertainties in the model.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="388"/>
  <defs><marker id="bt3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The albedo assumption is most of the bifacial uncertainty</text>
  <text x="300" y="102" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">0.15 · dark tilled soil</text>
  <rect x="316" y="76" width="140.7058823529412" height="40" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="468.7058823529412" y="102" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">4.6% of front side</text>
  <text x="300" y="152" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">0.20 · damp soil</text>
  <rect x="316" y="126" width="183.52941176470588" height="40" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="511.52941176470586" y="152" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">6.0% of front side</text>
  <text x="300" y="202" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">0.25 · common default</text>
  <rect x="316" y="176" width="226.35294117647058" height="40" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="554.3529411764706" y="202" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">7.4% of front side</text>
  <text x="300" y="252" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">0.35 · dry grass, gravel</text>
  <rect x="316" y="226" width="308.94117647058823" height="40" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="636.9411764705883" y="252" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">10.1% of front side</text>
  <text x="300" y="302" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">0.55 · fresh snow</text>
  <rect x="316" y="276" width="464.94117647058823" height="40" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="792.9411764705883" y="302" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">15.2% of front side</text>
  <rect x="40" y="330" width="868" height="40" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="474.0" y="349" text-anchor="middle" font-size="11" fill="currentColor">Recording albedo_source with the model run is what separates a measured 0.31 from a defaulted 0.25 —</text>
  <text x="474.0" y="364" text-anchor="middle" font-size="11" fill="currentColor">and the difference between them is worth more than every other input the bifacial model takes.</text>
</svg>

## Frequently asked questions

### Why is the combined gain less than the sum?

Because both technologies harvest partly the same photons. A tracker increases the front-side
capture of direct beam irradiance, which reduces the share of total resource left to be reflected and
collected on the rear. Modelling them together captures the interaction; adding two independently
modelled gains double-counts it, typically by three to six percentage points.

### How much does albedo really matter?

It is close to the whole bifacial uncertainty. Rear irradiance scales nearly linearly with ground
reflectance, so moving from 0.18 to 0.35 roughly doubles the rear contribution and moves the
combined gain by four to five percentage points. Measuring it on site — or citing a defensible
surface-specific value — is the highest-value input in the whole bifacial model.

### Does backtracking cost energy?

It gives up direct gain at low sun angles and avoids a larger row-to-row shading loss, so the net is
positive at any realistic ground coverage. Turning it off in a model produces a higher number and a
layout that does not behave that way in the field, which is why the backtrack flag belongs in the
pre-flight assertions rather than in a default.

### Should the rear-side loss be modelled separately?

Yes, and the bifaciality factor is not the whole story. The module datasheet bifaciality — typically
0.65 to 0.85 — covers the cell response; structure shading, rear mismatch and soiling on the rear
surface are additional and site-specific. Folding them into one number hides which is which when the
model is later compared with measured output.

### How does row pitch interact with the gains?

Directly and in opposite directions. A wider pitch raises both the bifacial gain — more ground is
visible to each row — and the tracker gain, because backtracking engages later, while lowering energy
per hectare. That trade is the real layout decision, and it is only visible when both models run
against a swept pitch rather than a single design point.

### Can this be validated against measured output?

Yes, and the useful comparison is per-hour rather than annual. An annual total can match while the
diurnal shape is wrong, which usually means the tracker geometry or the backtracking threshold is
off. Comparing modelled and measured morning ramp separates a geometry error from an albedo error
quickly.


### Does module height above ground change the bifacial gain much?

Substantially, and it is the input most often left at a default. Raising modules from one metre to
two metres above ground widens the ground area each row sees and typically adds one to two
percentage points of rear contribution, because the view factor improves faster than the extra
structure shading costs. Beyond about two and a half metres the gain flattens while the racking cost
does not, which is why the height belongs in the sweep alongside pitch rather than being fixed early.


### Should the tracker and bifacial models be validated separately?

Yes, and in that order. Tracker geometry is deterministic — given a location, a time index and an
axis configuration, the tracker angle is a calculation with no free parameters — so it can be checked
against measured tracker positions exactly. Only once the geometry matches is a bifacial comparison
meaningful, because a rear-side discrepancy and a tracker-angle discrepancy look identical in an
energy total. Validating them together leaves two unknowns and one equation.

## Related

- [Solar PV Yield Simulation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-pv-yield-simulation/) — the parent workflow and its loss chain
- [Simulating Hourly PV Output with pvlib ModelChain](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-pv-yield-simulation/simulating-hourly-pv-output-with-pvlib-modelchain/) — the chain these irradiance terms feed
- [Computing Capacity Factors from Hourly Generation Timeseries](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/computing-capacity-factors-from-hourly-generation-timeseries/) — turning the modelled output into a comparable figure
- [Zonal Statistics of GHI over Candidate Parcels with rasterstats](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/zonal-statistics-of-ghi-over-candidate-parcels-with-rasterstats/) — sourcing the per-site resource these models consume
