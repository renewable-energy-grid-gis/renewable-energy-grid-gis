---
title: Estimating Wake Losses with a Jensen Model in Python
description: Compute array efficiency from turbine positions and a wind rose — the Jensen deficit, sum-of-squares superposition, direction and energy weighting, and the point where a top-hat model stops being enough.
slug: estimating-wake-losses-with-a-jensen-model-in-python
type: article
breadcrumb: Estimating Wake Losses
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Estimating Wake Losses with a Jensen Model in Python

The scenario: a layout is scored with a wake model, the array efficiency comes out at 0.96, and the
operating fleet reports 0.89 for a comparable site. The model was not wrong so much as
under-specified — it weighted directions by frequency instead of by energy, ignored the neighbouring
project upwind, and used an offshore wake decay constant onshore. This page computes the number
properly, and it is the scoring half of
[wind farm layout and wake modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-farm-layout-and-wake-modeling/).

## Root-cause analysis

Four modelling choices account for most of the gap between a modelled and a measured array
efficiency.

1. **Frequency weighting instead of energy weighting.** Wake losses cost energy, and energy scales
   with the cube of wind speed. Weighting sectors by frequency alone under-weights the strong sectors
   where the loss is largest — typically one to two percentage points of array efficiency.
2. **A decay constant borrowed from the wrong environment.** The Jensen wake decay constant `k` is
   about 0.075 onshore and 0.04 offshore, reflecting how quickly ambient turbulence refills the wake.
   Using the offshore value onshore over-states losses; the reverse under-states them.
3. **Neighbouring turbines omitted.** Wakes do not stop at a lease boundary, and an operating farm two
   kilometres upwind in the prevailing direction can cost one to three points on the near rows.
4. **Partial wakes treated as full ones.** The Jensen profile is a top hat: a turbine is either in the
   wake or out of it. At tight crosswind spacing many turbines are partially waked, and the top hat
   makes the estimate jumpy and pessimistic.

<svg viewBox="0 0 940 400" role="img" aria-label="Frequency weighting against energy weighting on the same rose. The west-south-westerly sector carries 21 percent of the hours and 34 percent of the energy, because its mean speed is 9.4 metres per second against a site mean of 7.4 and power follows the cube. Weighting wake losses by frequency therefore under-weights exactly the sector where the losses cost most — worth one to two points of array efficiency." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Hours share against energy share, by sector</title>
  <desc>A paired bar chart over eight direction sectors. For each sector, the share of hours and the share of annual energy are drawn side by side. The west-south-westerly sector carries 21 percent of hours and 34 percent of energy; west carries 14 and 19; south-west 12 and 14; and the four light sectors together carry 29 percent of hours and 12 percent of energy. A note explains that the divergence follows the cube of the sector mean speed and that weighting wake losses by frequency under-weights the strong sectors.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="jw1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The strong sectors carry more energy than hours</text>
  <line x1="76" y1="268" x2="900" y2="268" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <rect x="90" y="156.0" width="42" height="112.0" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <rect x="136" y="86.66666666666669" width="42" height="181.33333333333331" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="111" y="148.0" text-anchor="middle" font-size="10" fill="#2C6E8F" font-weight="700">21</text>
  <text x="157" y="78.66666666666669" text-anchor="middle" font-size="10" fill="#7A4A1A" font-weight="700">34</text>
  <text x="134" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">WSW</text>
  <rect x="190" y="193.33333333333331" width="42" height="74.66666666666667" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <rect x="236" y="166.66666666666666" width="42" height="101.33333333333334" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="211" y="185.33333333333331" text-anchor="middle" font-size="10" fill="#2C6E8F" font-weight="700">14</text>
  <text x="257" y="158.66666666666666" text-anchor="middle" font-size="10" fill="#7A4A1A" font-weight="700">19</text>
  <text x="234" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">W</text>
  <rect x="290" y="204.0" width="42" height="64.0" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <rect x="336" y="193.33333333333331" width="42" height="74.66666666666667" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="311" y="196.0" text-anchor="middle" font-size="10" fill="#2C6E8F" font-weight="700">12</text>
  <text x="357" y="185.33333333333331" text-anchor="middle" font-size="10" fill="#7A4A1A" font-weight="700">14</text>
  <text x="334" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">SW</text>
  <rect x="390" y="220.0" width="42" height="48.0" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <rect x="436" y="225.33333333333334" width="42" height="42.666666666666664" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="411" y="212.0" text-anchor="middle" font-size="10" fill="#2C6E8F" font-weight="700">9</text>
  <text x="457" y="217.33333333333334" text-anchor="middle" font-size="10" fill="#7A4A1A" font-weight="700">8</text>
  <text x="434" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">S</text>
  <rect x="490" y="225.33333333333334" width="42" height="42.666666666666664" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <rect x="536" y="220.0" width="42" height="48.0" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="511" y="217.33333333333334" text-anchor="middle" font-size="10" fill="#2C6E8F" font-weight="700">8</text>
  <text x="557" y="212.0" text-anchor="middle" font-size="10" fill="#7A4A1A" font-weight="700">9</text>
  <text x="534" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">NW</text>
  <rect x="590" y="230.66666666666666" width="42" height="37.333333333333336" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <rect x="636" y="236.0" width="42" height="32.0" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="611" y="222.66666666666666" text-anchor="middle" font-size="10" fill="#2C6E8F" font-weight="700">7</text>
  <text x="657" y="228.0" text-anchor="middle" font-size="10" fill="#7A4A1A" font-weight="700">6</text>
  <text x="634" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">SSW</text>
  <rect x="690" y="236.0" width="42" height="32.0" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <rect x="736" y="246.66666666666666" width="42" height="21.333333333333332" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="711" y="228.0" text-anchor="middle" font-size="10" fill="#2C6E8F" font-weight="700">6</text>
  <text x="757" y="238.66666666666666" text-anchor="middle" font-size="10" fill="#7A4A1A" font-weight="700">4</text>
  <text x="734" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">N</text>
  <rect x="790" y="145.33333333333334" width="42" height="122.66666666666666" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <rect x="836" y="236.0" width="42" height="32.0" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="811" y="137.33333333333334" text-anchor="middle" font-size="10" fill="#2C6E8F" font-weight="700">23</text>
  <text x="857" y="228.0" text-anchor="middle" font-size="10" fill="#7A4A1A" font-weight="700">6</text>
  <text x="834" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">others</text>
  <rect x="90" y="302" width="16" height="12" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="114" y="313" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">share of hours</text>
  <rect x="300" y="302" width="16" height="12" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="324" y="313" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">share of annual energy (freq × mean³)</text>
  <rect x="90" y="334" width="810" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="495.0" y="353" text-anchor="middle" font-size="11" fill="currentColor">Weighting by frequency under-weights WSW by 13 percentage points — the sector where turbines are most</text>
  <text x="495.0" y="368" text-anchor="middle" font-size="11" fill="currentColor">likely to be in line and where each waked hour costs the most.</text>
</svg>

## Pre-flight validation

Two checks before any efficiency is computed: that the rose is normalised, and that the positions are
in a projected metric frame. Both failures produce a number rather than an error.

```python
import numpy as np


def preflight_wake_inputs(positions: np.ndarray, rose: list[dict], *, crs_is_projected: bool) -> None:
    """The two silent failures: an unnormalised rose and geographic coordinates."""
    if not crs_is_projected:
        raise ValueError("positions must be in a projected metric CRS — diameters are metres")

    total = sum(s["freq"] for s in rose)
    if not np.isclose(total, 1.0, atol=1e-3):
        raise ValueError(f"rose frequencies sum to {total:.4f}, not 1.0 — normalise before weighting")

    if positions.ndim != 2 or positions.shape[1] != 2:
        raise ValueError(f"positions must be (n, 2) in metres, got {positions.shape}")

    spread = positions.max(axis=0) - positions.min(axis=0)
    if spread.max() < 500:
        raise ValueError(
            f"layout spans only {spread.max():.0f} m — coordinates are probably still in degrees"
        )
```

## Fix implementation

```python
import numpy as np


def jensen_deficit(distance_m, *, rotor_diameter_m, thrust_coefficient=0.8, wake_decay_k=0.075):
    """Fractional velocity deficit behind one turbine, Jensen (Park) model."""
    x = np.maximum(np.asarray(distance_m, dtype=float), 1e-6)
    return (1.0 - np.sqrt(1.0 - thrust_coefficient)) / (
        1.0 + 2.0 * wake_decay_k * x / rotor_diameter_m
    ) ** 2


def array_efficiency(
    positions: np.ndarray,
    rose: list[dict],
    *,
    rotor_diameter_m: float,
    thrust_coefficient: float = 0.8,
    wake_decay_k: float = 0.075,
    external: np.ndarray | None = None,
    max_wake_d: float = 20.0,
) -> dict:
    """Energy-weighted array efficiency, with per-sector detail."""
    own = np.asarray(positions, dtype=float)
    upwind_sources = own if external is None else np.vstack([own, np.asarray(external, float)])
    max_wake_m = max_wake_d * rotor_diameter_m

    gross = 0.0
    net = 0.0
    per_sector = []
    for sector in rose:
        theta = np.radians(sector["dir_deg"])
        wx, wy = np.sin(theta + np.pi), np.cos(theta + np.pi)   # unit vector downwind
        weight = sector["freq"] * sector["mean_ms"] ** 3        # energy, not frequency

        sector_gross = 0.0
        sector_net = 0.0
        for x, y in own:
            dx = x - upwind_sources[:, 0]
            dy = y - upwind_sources[:, 1]
            downwind = dx * wx + dy * wy
            cross = np.abs(dx * wy - dy * wx)
            radius = rotor_diameter_m / 2 + wake_decay_k * downwind
            in_wake = (downwind > 1e-6) & (downwind < max_wake_m) & (cross <= radius)
            if in_wake.any():
                deficits = jensen_deficit(
                    downwind[in_wake],
                    rotor_diameter_m=rotor_diameter_m,
                    thrust_coefficient=thrust_coefficient,
                    wake_decay_k=wake_decay_k,
                )
                deficit = float(np.sqrt(np.sum(deficits ** 2)))   # sum-of-squares superposition
            else:
                deficit = 0.0
            sector_gross += weight
            sector_net += weight * (1.0 - min(deficit, 0.95)) ** 3

        per_sector.append(
            {"dir_deg": sector["dir_deg"], "efficiency": sector_net / sector_gross if sector_gross else 1.0}
        )
        gross += sector_gross
        net += sector_net

    return {
        "array_efficiency": net / gross if gross else 1.0,
        "per_sector": per_sector,
        "wake_decay_k": wake_decay_k,
        "external_turbines": 0 if external is None else len(external),
    }
```

Two details protect the result. The deficit is clamped below 0.95 because a superposed deficit can
otherwise exceed one and produce negative power in a dense cluster. And the `max_wake_d` cut-off is
both a performance measure and a physical one: beyond about twenty diameters the Jensen deficit is
under one percent and the model has no useful resolution there.

<svg viewBox="0 0 940 388" role="img" aria-label="How multiple wakes combine. Three upwind turbines each produce deficits of 12, 9 and 6 percent at the evaluated turbine. Adding them linearly gives 27 percent, which over-counts because each wake acts on air the previous one already slowed. Sum-of-squares gives 16.2 percent, which is the standard engineering compromise and matches measurements far better. In power terms the two differ by 12 percentage points on that turbine." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Linear addition against sum-of-squares superposition</title>
  <desc>A diagram of one evaluated turbine with three upwind turbines at 5, 8 and 12 rotor diameters, producing velocity deficits of 12, 9 and 6 percent respectively. Two combination results are shown: linear addition giving a 27 percent deficit and a 61 percent power loss, and sum-of-squares giving 16.2 percent and a 41 percent power loss. A note explains that sum-of-squares is an engineering compromise rather than a first-principles result, and that the deficit must be clamped below one to avoid negative power in dense clusters.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="388"/>
  <defs><marker id="jw2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Three wakes on one turbine</text>
  <circle cx="140" cy="150" r="8" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <text x="140" y="124" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.9">5 D · 12%</text>
  <path d="M148,150 L460,176 L460,204 L148,150 Z" fill="#DCEEF6" stroke="none" stroke-width="1.4" opacity="0.28"/>
  <circle cx="260" cy="150" r="8" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <text x="260" y="124" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.9">8 D · 9%</text>
  <path d="M268,150 L460,176 L460,204 L268,150 Z" fill="#DCEEF6" stroke="none" stroke-width="1.4" opacity="0.28"/>
  <circle cx="380" cy="150" r="8" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <text x="380" y="124" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.9">12 D · 6%</text>
  <path d="M388,150 L460,176 L460,204 L388,150 Z" fill="#DCEEF6" stroke="none" stroke-width="1.4" opacity="0.28"/>
  <circle cx="470" cy="190" r="10" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <text x="470" y="220" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">evaluated turbine</text>
  <rect x="560" y="96" width="348" height="76" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3" opacity="0.55"/>
  <text x="580" y="128" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">linear addition</text>
  <text x="890" y="130" text-anchor="end" font-size="16" fill="currentColor" font-weight="700">27.0%</text>
  <text x="580" y="154" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">61% power loss</text>
  <rect x="560" y="188" width="348" height="76" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3" opacity="0.55"/>
  <text x="580" y="220" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">sum of squares</text>
  <text x="890" y="222" text-anchor="end" font-size="16" fill="currentColor" font-weight="700">16.2%</text>
  <text x="580" y="246" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">41% power loss</text>
  <rect x="40" y="296" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="315" text-anchor="middle" font-size="11" fill="currentColor">Sum-of-squares is a compromise, not a derivation — it matches measurements far better than linear addition</text>
  <text x="474.0" y="330" text-anchor="middle" font-size="11" fill="currentColor">and needs a clamp below 1.0, or a dense cluster produces a negative power.</text>
</svg>

## Fallback routing and performance tuning

- **Vectorise over turbines, not over sectors.** The inner loop above is already vectorised across
  upwind sources; lifting it to operate on all evaluated turbines at once gives another order of
  magnitude at a few hundred turbines.
- **Prune with a spatial index.** Only sources within `max_wake_d` diameters can contribute, so a
  KD-tree query per sector bounds the comparison set on large arrays.
- **Cache the pairwise geometry.** Downwind and crosswind distances depend only on positions and
  direction, so an optimisation loop that moves one turbine can update one row rather than recompute
  the matrix.
- **Move to a Gaussian profile before optimising.** The top-hat discontinuity makes an optimiser chase
  cliff edges; a Gaussian deficit gives it a smooth surface to descend.

## Downstream validation

```python
def assert_wake_result(result: dict, *, n_turbines: int) -> None:
    """Bounds and sanity for an array-efficiency figure."""
    eff = result["array_efficiency"]
    assert 0.6 <= eff <= 1.0, f"array efficiency {eff:.3f} outside any defensible range"
    if n_turbines == 1:
        assert eff == 1.0, "a single turbine cannot wake itself"
    worst = min(s["efficiency"] for s in result["per_sector"])
    best = max(s["efficiency"] for s in result["per_sector"])
    assert best >= worst, "per-sector efficiencies inconsistent"
    assert result["wake_decay_k"] in (0.04, 0.075) or 0.03 <= result["wake_decay_k"] <= 0.09, (
        "wake decay constant outside the physically supported range"
    )
```

<svg viewBox="0 0 940 420" role="img" aria-label="Array efficiency by direction sector for one layout. Efficiency is near 0.99 in the sectors where no turbine sits behind another and falls to 0.71 in the west-south-westerly sector, where three rows line up along the prevailing axis. Because that sector carries a third of the annual energy, its 0.71 pulls the energy-weighted array efficiency down to 0.902 even though ten of the sixteen sectors sit above 0.95." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Per-sector efficiency, and the one sector that sets the answer</title>
  <desc>A polar plot of array efficiency by direction sector for a 24-turbine layout, with the radius running from 0.6 at the centre to 1.0 at the rim. Most sectors sit between 0.95 and 0.99. Three adjacent sectors around west-south-west drop to between 0.71 and 0.82, forming a clear notch. An annotation marks the west-south-westerly sector as carrying 34 percent of the annual energy, and a summary gives the energy-weighted array efficiency as 0.902 against an unweighted sector mean of 0.94.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="420"/>
  <defs><marker id="jw3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Sixteen sectors, one that decides the number</text>
  <circle cx="300" cy="236" r="0.0" fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.2"/>
  <text x="306" y="240.0" text-anchor="start" font-size="9.5" fill="currentColor" opacity="0.65">0.6</text>
  <circle cx="300" cy="236" r="37.999999999999986" fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.2"/>
  <text x="306" y="202.0" text-anchor="start" font-size="9.5" fill="currentColor" opacity="0.65">0.7</text>
  <circle cx="300" cy="236" r="76.00000000000001" fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.2"/>
  <text x="306" y="164.0" text-anchor="start" font-size="9.5" fill="currentColor" opacity="0.65">0.8</text>
  <circle cx="300" cy="236" r="114.00000000000001" fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.2"/>
  <text x="306" y="125.99999999999999" text-anchor="start" font-size="9.5" fill="currentColor" opacity="0.65">0.9</text>
  <circle cx="300" cy="236" r="152.0" fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.2"/>
  <text x="306" y="88.0" text-anchor="start" font-size="9.5" fill="currentColor" opacity="0.65">1.0</text>
  <path d="M300.0,91.6 L356.7,99.1 L399.4,136.6 L433.4,180.7 L436.8,236.0 L429.9,289.8 L394.0,330.0 L352.4,362.4 L300.0,361.4 L259.3,334.3 L240.9,295.1 L261.4,252.0 L227.8,236.0 L194.7,192.4 L203.3,139.3 L246.2,106.1 L300.0,91.6 Z" fill="#DCEEF6" fill-opacity="0.5" stroke="#5BA8C8" stroke-width="2.2"/>
  <text x="300.0" y="66.0" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">N</text>
  <text x="474.0" y="240.0" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">E</text>
  <text x="300.0" y="414.0" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">S</text>
  <text x="126.0" y="240.00000000000003" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">W</text>
  <text x="260" y="356" text-anchor="middle" font-size="11.5" fill="#7A4A1A" font-weight="700">WSW notch — 0.71</text>
  <rect x="540" y="90" width="368" height="73" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="724.0" y="112" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">WSW carries 34% of annual energy</text>
  <text x="724.0" y="131" text-anchor="middle" font-size="11.5" fill="currentColor">and returns 0.71 efficiency</text>
  <text x="724.0" y="150" text-anchor="middle" font-size="11.5" fill="currentColor">— three rows line up along the axis</text>
  <rect x="540" y="202" width="368" height="58" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="724.0" y="224" text-anchor="middle" font-size="12" fill="currentColor">unweighted sector mean 0.94</text>
  <text x="724.0" y="245" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">energy-weighted result 0.902</text>
  <rect x="540" y="300" width="368" height="54" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="724.0" y="322" text-anchor="middle" font-size="11.5" fill="currentColor">The gap between the two numbers is</text>
  <text x="724.0" y="341" text-anchor="middle" font-size="11.5" fill="currentColor">the whole argument for energy weighting</text>
</svg>


## Calibrating the model against an operating fleet

A wake model earns trust by being compared with measurement, and the comparison is more useful than
it looks because the failure modes are distinguishable.

If modelled efficiency is uniformly higher than measured across every sector, the wake decay constant
is too large — the model is recovering wakes faster than the site does. If the gap concentrates in
the strong sectors, the weighting is wrong: either frequency was used instead of energy, or the
thrust coefficient was held constant across a speed range where it falls. If the gap concentrates on
the turbines nearest the boundary, a neighbouring project is missing from the source list. And if the
gap appears only at night, atmospheric stability is doing what a Jensen model cannot represent, which
is the honest point at which to move to a model that carries a stability parameter.

Calibration should adjust one parameter at a time and record the result, because two parameters can
compensate for each other and produce a model that matches this fleet and generalises to nothing. In
practice the decay constant is the only parameter worth fitting; the rest should come from the
turbine specification and the measured rose.

Where no operating data exists, the substitute is a sensitivity band rather than a single figure.
Running the model at `k` values of 0.05 and 0.09 brackets most onshore conditions, and reporting the
resulting range of array efficiencies is more defensible than a single number carrying three decimal
places.

## Frequently asked questions

### Why sum-of-squares rather than adding the deficits?

Because adding them over-counts: two upwind turbines each producing a 10 percent deficit do not
combine to 20 percent, since the second wake is acting on air the first already slowed. Sum-of-squares
is the standard engineering compromise — it is not derived from first principles, but it matches
measurements far better than linear addition and is cheap.

### When should I move to FLORIS or a Gaussian model?

When partial wakes dominate, when the site has strong atmospheric stability structure, or when the
layout is being optimised rather than screened. For ranking candidate layouts, Jensen with
sum-of-squares is typically within one to two percentage points of the heavier models and runs in
milliseconds, which is what makes a sensitivity sweep practical.

### Does the thrust coefficient need to vary with wind speed?

For a screening estimate, no — a representative `Ct` near 0.8 covers the region below rated speed
where wakes matter most. For a bankable figure, yes: `Ct` falls sharply above rated speed, so a
constant value over-states losses in the strong sectors, which is precisely where the energy is.

### How much does the array efficiency change with turbine count?

Substantially and non-linearly. Adding turbines to a fixed mask tightens spacing, so efficiency falls
while total net energy usually keeps rising until the spacing gets very tight. That is why efficiency
is a diagnostic rather than an objective — the objective is net energy, and a layout with a lower
efficiency and more turbines is frequently the better project.

### Should the model include turbulence-driven fatigue?

Not in this calculation, but the wake map it produces is the right input for one. Waked turbines see
elevated turbulence intensity as well as reduced speed, which is a loads and maintenance question
rather than an energy one. Reporting which turbines are waked in which sectors gives the loads
engineer what they need without conflating two different analyses.

### What array efficiency should trigger a redesign?

There is no universal threshold, but a per-sector efficiency below about 0.75 in a sector carrying
more than a tenth of the energy is worth investigating — it usually means several turbines are
directly in line along the energy-carrying axis, which the elliptical spacing rule in the placement
stage is designed to prevent.

## Related

- [Wind Farm Layout & Wake Modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-farm-layout-and-wake-modeling/) — the parent workflow
- [Generating Turbine Layouts with Spacing Constraints in Shapely](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-farm-layout-and-wake-modeling/generating-turbine-layouts-with-spacing-constraints-in-shapely/) — producing the positions this model scores
- [Building Wind Roses from Met Mast Data with Python](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/building-wind-roses-from-met-mast-data-with-python/) — the sector weights this calculation needs
- [Calculating Wind Shear Coefficients with Python](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/calculating-wind-shear-coefficients-with-python/) — the hub-height speeds that set the energy weighting
