---
title: Wind Farm Layout & Wake Modeling
description: Place turbines in Python without losing the energy you sited for — spacing constraints in Shapely, Jensen and Gauss wake deficits, direction-weighted array losses, and the audit trail a bankable layout needs.
slug: wind-farm-layout-and-wake-modeling
type: guide
breadcrumb: Wind Farm Layout & Wake Modeling
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Wind Farm Layout & Wake Modeling

Layout is where a wind resource becomes a project, and it is the stage that consumes almost every
other output in the
[solar and wind resource modeling workflows](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/)
pipeline: the hub-height wind field, the wind rose, the terrain slope mask and the exclusion layers
all arrive here and turn into turbine coordinates. The failure mode this page addresses is a layout
that satisfies every geometric constraint and quietly loses a tenth of its energy to itself.

Wake losses are not a correction applied at the end. A turbine extracts momentum from the air, and
everything downwind of it sees a slower, more turbulent flow for several rotor diameters. Because
power scales with the cube of wind speed, a 10 percent velocity deficit is a 27 percent power deficit
in the affected turbine for as long as the wind blows from that direction. A layout that ignores this
does not fail — it produces an energy estimate that is 8 to 15 percent optimistic, which is larger
than most of the uncertainties the yield report quotes.

<svg viewBox="0 0 940 412" role="img" aria-label="The Jensen velocity deficit behind a turbine, plotted against downstream distance in rotor diameters, and the power loss it implies. At 3 diameters the velocity deficit is 20 percent and the power loss 49 percent; at 5 diameters, 14 and 36; at 8 diameters, 9.6 and 26; at 12 diameters, 6.4 and 18. Power falls with the cube of speed, so the power curve is always far below the velocity curve — which is why spacing rules are expressed in diameters and why they are as large as they are." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Velocity deficit and power loss behind one turbine</title>
  <desc>A chart with downstream distance from 2 to 20 rotor diameters on the horizontal axis. Two curves fall from left to right: the velocity deficit under the Jensen model with a thrust coefficient of 0.8 and a wake decay constant of 0.075, and the resulting power loss, which is the cube of the remaining velocity fraction. Marked points give 20 percent velocity and 49 percent power loss at 3 diameters, 14 and 36 percent at 5, 9.6 and 26 percent at 8, and 6.4 and 18 percent at 12. A shaded band marks the 7 to 10 diameter range used by conventional downwind spacing rules.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="412"/>
  <defs><marker id="wk1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Jensen deficit · Ct = 0.8 · k = 0.075</text>
  <line x1="100" y1="292" x2="860" y2="292" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="100" y1="68" x2="100" y2="292" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <rect x="311.1111111111111" y="68" width="126.66666666666669" height="224" rx="0" fill="#DDF0E2" opacity="0.55"/>
  <text x="374.44444444444446" y="82" text-anchor="middle" font-size="11" fill="#1F5C3A" font-weight="700">conventional 7–10 D</text>
  <line x1="96" y1="292.0" x2="860" y2="292.0" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="90" y="296.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0%</text>
  <line x1="96" y1="252.36363636363637" x2="860" y2="252.36363636363637" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="90" y="256.3636363636364" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">10%</text>
  <line x1="96" y1="212.72727272727272" x2="860" y2="212.72727272727272" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="90" y="216.72727272727272" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">20%</text>
  <line x1="96" y1="173.0909090909091" x2="860" y2="173.0909090909091" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="90" y="177.0909090909091" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">30%</text>
  <line x1="96" y1="133.45454545454544" x2="860" y2="133.45454545454544" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="90" y="137.45454545454544" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">40%</text>
  <line x1="96" y1="93.81818181818181" x2="860" y2="93.81818181818181" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="90" y="97.81818181818181" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">50%</text>
  <line x1="100.0" y1="292" x2="100.0" y2="297" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="100.0" y="312" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">2 D</text>
  <line x1="226.66666666666666" y1="292" x2="226.66666666666666" y2="297" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="226.66666666666666" y="312" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">5 D</text>
  <line x1="353.3333333333333" y1="292" x2="353.3333333333333" y2="297" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="353.3333333333333" y="312" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">8 D</text>
  <line x1="522.2222222222222" y1="292" x2="522.2222222222222" y2="297" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="522.2222222222222" y="312" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">12 D</text>
  <line x1="691.1111111111111" y1="292" x2="691.1111111111111" y2="297" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="691.1111111111111" y="312" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">16 D</text>
  <line x1="860.0" y1="292" x2="860.0" y2="297" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="860.0" y="312" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">20 D</text>
  <text x="860" y="334" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.8">downstream distance, rotor diameters</text>
  <path d="M100.0,162.4 L110.6,169.5 L121.1,176.1 L131.7,182.2 L142.2,187.8 L152.8,193.0 L163.3,197.8 L173.9,202.3 L184.4,206.4 L195.0,210.3 L205.6,213.9 L216.1,217.3 L226.7,220.5 L237.2,223.4 L247.8,226.2 L258.3,228.8 L268.9,231.3 L279.4,233.6 L290.0,235.8 L300.6,237.9 L311.1,239.9 L321.7,241.7 L332.2,243.5 L342.8,245.1 L353.3,246.7 L363.9,248.2 L374.4,249.7 L385.0,251.0 L395.6,252.3 L406.1,253.6 L416.7,254.7 L427.2,255.9 L437.8,256.9 L448.3,258.0 L458.9,259.0 L469.4,259.9 L480.0,260.8 L490.6,261.7 L501.1,262.5 L511.7,263.3 L522.2,264.1 L532.8,264.8 L543.3,265.5 L553.9,266.2 L564.4,266.8 L575.0,267.5 L585.6,268.1 L596.1,268.6 L606.7,269.2 L617.2,269.7 L627.8,270.3 L638.3,270.8 L648.9,271.3 L659.4,271.7 L670.0,272.2 L680.6,272.6 L691.1,273.0 L701.7,273.5 L712.2,273.9 L722.8,274.2 L733.3,274.6 L743.9,275.0 L754.4,275.3 L765.0,275.7 L775.6,276.0 L786.1,276.3 L796.7,276.6 L807.2,276.9 L817.8,277.2 L828.3,277.5 L838.9,277.8 L849.4,278.0 L860.0,278.3" fill="none" stroke="#5BA8C8" stroke-width="2.6"/>
  <path d="M100.0,16.4 L110.6,26.4 L121.1,36.1 L131.7,45.4 L142.2,54.4 L152.8,63.0 L163.3,71.2 L173.9,79.1 L184.4,86.7 L195.0,93.9 L205.6,100.8 L216.1,107.5 L226.7,113.8 L237.2,119.8 L247.8,125.6 L258.3,131.1 L268.9,136.4 L279.4,141.4 L290.0,146.2 L300.6,150.8 L311.1,155.3 L321.7,159.5 L332.2,163.5 L342.8,167.4 L353.3,171.1 L363.9,174.7 L374.4,178.1 L385.0,181.4 L395.6,184.5 L406.1,187.5 L416.7,190.4 L427.2,193.2 L437.8,195.9 L448.3,198.4 L458.9,200.9 L469.4,203.3 L480.0,205.6 L490.6,207.8 L501.1,209.9 L511.7,212.0 L522.2,213.9 L532.8,215.8 L543.3,217.7 L553.9,219.5 L564.4,221.2 L575.0,222.8 L585.6,224.4 L596.1,226.0 L606.7,227.5 L617.2,228.9 L627.8,230.3 L638.3,231.7 L648.9,233.0 L659.4,234.2 L670.0,235.5 L680.6,236.7 L691.1,237.8 L701.7,238.9 L712.2,240.0 L722.8,241.1 L733.3,242.1 L743.9,243.1 L754.4,244.1 L765.0,245.0 L775.6,245.9 L786.1,246.8 L796.7,247.6 L807.2,248.5 L817.8,249.3 L828.3,250.1 L838.9,250.8 L849.4,251.6 L860.0,252.3" fill="none" stroke="#F4A261" stroke-width="2.6"/>
  <circle cx="142.22222222222223" cy="187.78861858738802" r="4" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <circle cx="142.22222222222223" cy="54.359457388525726" r="4" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <text x="142.22222222222223" y="42.359457388525726" text-anchor="middle" font-size="10.5" fill="#7A4A1A" font-weight="700">60%</text>
  <circle cx="226.66666666666666" cy="220.4556965159129" r="4" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <circle cx="226.66666666666666" cy="113.77771636936689" r="4" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <text x="226.66666666666666" y="101.77771636936689" text-anchor="middle" font-size="10.5" fill="#7A4A1A" font-weight="700">45%</text>
  <circle cx="353.3333333333333" cy="246.73048978925277" r="4" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <circle cx="353.3333333333333" cy="171.11192894404303" r="4" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <text x="353.3333333333333" y="159.11192894404303" text-anchor="middle" font-size="10.5" fill="#7A4A1A" font-weight="700">30%</text>
  <circle cx="522.2222222222222" cy="264.05300645152846" r="4" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <circle cx="522.2222222222222" cy="213.93158169719104" r="4" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <text x="522.2222222222222" y="201.93158169719104" text-anchor="middle" font-size="10.5" fill="#7A4A1A" font-weight="700">20%</text>
  <rect x="100" y="330" width="16" height="12" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="124" y="341" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">velocity deficit</text>
  <rect x="300" y="330" width="16" height="12" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="324" y="341" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">power loss — the cube of the remaining speed</text>
  <rect x="100" y="356" width="760" height="28" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="480.0" y="376" text-anchor="middle" font-size="11.5" fill="currentColor">A 10% velocity deficit is a 27% power deficit for as long as the wind blows from that direction.</text>
</svg>

## The three constraints that decide a layout

Turbine positions are the solution to a constrained placement problem, and the constraints fall into
three groups that behave very differently.

**Hard geometry.** Setbacks from dwellings, roads, property lines and infrastructure; the exclusion
mask from
[environmental constraint and exclusion screening](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/environmental-constraint-and-exclusion-screening/);
and slope limits from the crane specification. These define where a turbine may stand at all, and
they are non-negotiable, so they are applied first as a buildable-area mask.

**Spacing rules.** A minimum separation expressed in rotor diameters — commonly 3 to 5 D crosswind
and 7 to 10 D downwind — is not a regulation but an engineering constraint standing in for the wake
model. It is cheap to enforce and coarse: it treats every direction as equally important, which no
site is.

**Wake interaction.** The actual physics, direction-weighted by the wind rose. This is what the
spacing rule approximates, and modelling it explicitly is what lets a layout beat the rule: a site
with a strongly prevailing direction can pack turbines much closer crosswind than a uniform 4 D rule
allows, and must space them further apart along the prevailing axis.

The practical consequence is an ordering. Mask first, place with spacing rules second, then evaluate
and refine against a wake model third. Optimising against the wake model from the start is
computationally expensive and rarely changes the answer more than the mask already did.

## Prerequisites and data requirements

The workflow assumes Python 3.11+ with `geopandas>=0.14`, `shapely>=2.0`, `numpy`, and optionally
`floris` for a full wake solve. Inputs are the buildable-area polygon, a turbine specification (rotor
diameter, hub height, thrust curve, power curve), the direction-binned wind rose from
[building wind roses from met mast data](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/building-wind-roses-from-met-mast-data-with-python/),
and the hub-height wind speed field.

Everything must be in one projected metric frame. Rotor diameters become metres, spacing becomes a
distance, and a layout computed in degrees is not merely wrong but wrong by a latitude-dependent
factor in one axis only — which produces layouts that look correct and are systematically compressed
east-west.

## Core implementation: placing turbines under spacing constraints

The placement below is deliberately greedy rather than optimal. It sorts candidate positions by
resource quality, accepts a position when it clears every constraint, and moves on. Greedy placement
gets within a few percent of an optimised layout for a fraction of the effort, and — more importantly
— it is explainable, which matters when a landowner asks why a turbine is where it is.

```python
import geopandas as gpd
import numpy as np
from scipy.spatial import cKDTree
from shapely.geometry import Point


def place_turbines(
    buildable: gpd.GeoSeries,
    candidates: gpd.GeoDataFrame,
    *,
    rotor_diameter_m: float,
    min_spacing_d: float = 4.0,
    prevailing_deg: float | None = None,
    downwind_spacing_d: float = 8.0,
    max_turbines: int | None = None,
) -> gpd.GeoDataFrame:
    """Greedy placement: best resource first, subject to spacing and the buildable mask.

    When a prevailing direction is given, spacing becomes elliptical — tighter across
    the prevailing axis and wider along it — which is what the wake physics asks for.
    """
    area = buildable.union_all()
    inside = candidates[candidates.geometry.within(area)].copy()
    inside = inside.sort_values("wind_speed_ms", ascending=False)

    placed_xy: list[tuple[float, float]] = []
    keep: list[int] = []
    r_cross = min_spacing_d * rotor_diameter_m
    r_down = downwind_spacing_d * rotor_diameter_m

    for idx, row in inside.iterrows():
        x, y = row.geometry.x, row.geometry.y
        if placed_xy:
            dx = np.array([x - px for px, _ in placed_xy])
            dy = np.array([y - py for _, py in placed_xy])
            if prevailing_deg is None:
                too_close = np.hypot(dx, dy) < r_cross
            else:
                theta = np.radians(prevailing_deg)
                # Rotate into wind-aligned coordinates: u along the wind, v across it.
                u = dx * np.sin(theta) + dy * np.cos(theta)
                v = dx * np.cos(theta) - dy * np.sin(theta)
                too_close = ((u / r_down) ** 2 + (v / r_cross) ** 2) < 1.0
            if too_close.any():
                continue
        placed_xy.append((x, y))
        keep.append(idx)
        if max_turbines and len(keep) >= max_turbines:
            break

    out = inside.loc[keep].copy()
    out["turbine_id"] = [f"T{i + 1:03d}" for i in range(len(out))]
    return out.set_geometry("geometry")
```

The elliptical spacing test is the part that earns its keep. A circular minimum separation wastes
crosswind space at every site with a directional regime, and the ellipse costs one rotation and two
divisions per comparison.

## Wake modelling: the Jensen deficit and where it stops being enough

The Jensen (Park) model is the simplest wake model still worth using, and it is a good first
approximation for layout screening. It assumes the wake expands linearly behind the rotor and that
the velocity deficit is uniform across the wake at any distance. For a turbine with thrust
coefficient `Ct` at downstream distance `x`, the fractional deficit is

$$ \frac{\Delta U}{U} = \frac{1 - \sqrt{1 - C_t}}{\left(1 + \frac{2kx}{D}\right)^{2}} $$

where `k` is the wake decay constant — about 0.075 onshore and 0.04 offshore — and `D` is the rotor
diameter. At 5 D behind a turbine with `Ct = 0.8`, that is a deficit of about 12 percent, or a 30
percent power loss for a turbine sitting directly in the wake.

```python
import numpy as np


def jensen_deficit(
    distance_m: np.ndarray,
    *,
    rotor_diameter_m: float,
    thrust_coefficient: float = 0.8,
    wake_decay_k: float = 0.075,
) -> np.ndarray:
    """Fractional velocity deficit behind a turbine under the Jensen model."""
    x = np.maximum(distance_m, 1e-6)
    numerator = 1.0 - np.sqrt(1.0 - thrust_coefficient)
    expansion = (1.0 + 2.0 * wake_decay_k * x / rotor_diameter_m) ** 2
    return numerator / expansion


def combine_deficits(deficits: np.ndarray) -> float:
    """Sum-of-squares superposition — the standard combination for multiple wakes."""
    return float(np.sqrt(np.sum(np.square(deficits))))
```

Two properties of this model matter for how it is used. It has a top-hat profile, so a turbine is
either fully in a wake or fully out of it — which makes it pessimistic for partial-wake geometries and
means small position changes can produce discontinuous energy changes. And it takes no account of
atmospheric stability, which in reality changes the wake recovery rate by a factor of two between a
stable night and a convective afternoon.

Those limits define when to move to a Gaussian wake model or a full engineering solver such as FLORIS:
when partial wakes dominate (tight crosswind spacing), when the site has strong stability structure
(flat, inland, continental), or when the layout is being optimised rather than screened. For ranking
candidate layouts, Jensen with sum-of-squares superposition is usually within one to two percentage
points of the more expensive models, and it runs in milliseconds.

<svg viewBox="0 0 940 440" role="img" aria-label="Why the same turbine count can be laid out two ways with different losses. On a site with a 21 percent west-south-westerly regime, a circular 4 diameter spacing rule spreads turbines evenly and returns an array efficiency of 0.902. An elliptical rule — 3.2 diameters across the prevailing axis and 9 along it — fits the same 24 turbines inside the same buildable area with an efficiency of 0.928, because almost no turbine sits directly downwind of another in the sector that carries the energy." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Circular spacing versus wind-aligned elliptical spacing</title>
  <desc>Two plan views of the same buildable-area polygon, each holding 24 turbines. The left layout uses a circular 4 rotor-diameter minimum spacing and shows several turbines aligned along the west-south-westerly prevailing axis, marked with wake cones. The right layout uses an elliptical rule of 3.2 diameters crosswind and 9 diameters downwind, producing rows that run across the prevailing direction with wider gaps along it. Array efficiency is 0.902 for the circular layout and 0.928 for the elliptical one, a gain of 2.6 percentage points at the same turbine count.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="440"/>
  <defs><marker id="wk2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Same site, same 24 turbines, two spacing rules</text>
  <text x="245" y="62" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">circular 4 D spacing</text>
  <rect x="40" y="74" width="410" height="258" rx="8" fill="none" stroke="#F4A261" stroke-width="1.3" opacity="0.6"/>
  <path d="M86,108 L123.90625730713813,136.68999227892957 L133.09065968390027,114.51688349865867 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M152,108 L189.90625730713813,136.68999227892957 L199.09065968390027,114.51688349865867 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M218,108 L255.9062573071381,136.68999227892957 L265.09065968390024,114.51688349865867 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M284,108 L321.9062573071381,136.68999227892957 L331.09065968390024,114.51688349865867 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M350,108 L387.9062573071381,136.68999227892957 L397.09065968390024,114.51688349865867 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M416,108 L453.9062573071381,136.68999227892957 L463.09065968390024,114.51688349865867 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M86,170 L123.90625730713813,198.68999227892957 L133.09065968390027,176.5168834986587 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M152,170 L189.90625730713813,198.68999227892957 L199.09065968390027,176.5168834986587 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M218,170 L255.9062573071381,198.68999227892957 L265.09065968390024,176.5168834986587 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M284,170 L321.9062573071381,198.68999227892957 L331.09065968390024,176.5168834986587 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M350,170 L387.9062573071381,198.68999227892957 L397.09065968390024,176.5168834986587 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M416,170 L453.9062573071381,198.68999227892957 L463.09065968390024,176.5168834986587 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M86,232 L123.90625730713813,260.6899922789296 L133.09065968390027,238.5168834986587 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M152,232 L189.90625730713813,260.6899922789296 L199.09065968390027,238.5168834986587 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M218,232 L255.9062573071381,260.6899922789296 L265.09065968390024,238.5168834986587 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M284,232 L321.9062573071381,260.6899922789296 L331.09065968390024,238.5168834986587 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M350,232 L387.9062573071381,260.6899922789296 L397.09065968390024,238.5168834986587 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M416,232 L453.9062573071381,260.6899922789296 L463.09065968390024,238.5168834986587 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M86,294 L123.90625730713813,322.6899922789296 L133.09065968390027,300.5168834986587 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M152,294 L189.90625730713813,322.6899922789296 L199.09065968390027,300.5168834986587 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M218,294 L255.9062573071381,322.6899922789296 L265.09065968390024,300.5168834986587 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M284,294 L321.9062573071381,322.6899922789296 L331.09065968390024,300.5168834986587 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M350,294 L387.9062573071381,322.6899922789296 L397.09065968390024,300.5168834986587 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M416,294 L453.9062573071381,322.6899922789296 L463.09065968390024,300.5168834986587 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <circle cx="86" cy="108" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="152" cy="108" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="218" cy="108" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="284" cy="108" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="350" cy="108" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="416" cy="108" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="86" cy="170" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="152" cy="170" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="218" cy="170" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="284" cy="170" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="350" cy="170" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="416" cy="170" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="86" cy="232" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="152" cy="232" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="218" cy="232" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="284" cy="232" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="350" cy="232" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="416" cy="232" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="86" cy="294" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="152" cy="294" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="218" cy="294" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="284" cy="294" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="350" cy="294" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="416" cy="294" r="4.2" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <text x="245" y="356" text-anchor="middle" font-size="13" fill="#7A4A1A" font-weight="700">array efficiency 0.902</text>
  <text x="695" y="62" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">elliptical 3.2 D × 9 D</text>
  <rect x="490" y="74" width="410" height="258" rx="8" fill="none" stroke="#3D8B5F" stroke-width="1.3" opacity="0.6"/>
  <path d="M524,122 L561.9062573071382,150.68999227892957 L571.0906596839003,128.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M572,122 L609.9062573071382,150.68999227892957 L619.0906596839003,128.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M620,122 L657.9062573071382,150.68999227892957 L667.0906596839003,128.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M668,122 L705.9062573071382,150.68999227892957 L715.0906596839003,128.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M716,122 L753.9062573071382,150.68999227892957 L763.0906596839003,128.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M764,122 L801.9062573071382,150.68999227892957 L811.0906596839003,128.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M812,122 L849.9062573071382,150.68999227892957 L859.0906596839003,128.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M860,122 L897.9062573071382,150.68999227892957 L907.0906596839003,128.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M546,200 L583.9062573071382,228.68999227892957 L593.0906596839003,206.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M594,200 L631.9062573071382,228.68999227892957 L641.0906596839003,206.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M642,200 L679.9062573071382,228.68999227892957 L689.0906596839003,206.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M690,200 L727.9062573071382,228.68999227892957 L737.0906596839003,206.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M738,200 L775.9062573071382,228.68999227892957 L785.0906596839003,206.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M786,200 L823.9062573071382,228.68999227892957 L833.0906596839003,206.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M834,200 L871.9062573071382,228.68999227892957 L881.0906596839003,206.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M882,200 L919.9062573071382,228.68999227892957 L929.0906596839003,206.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M524,278 L561.9062573071382,306.6899922789296 L571.0906596839003,284.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M572,278 L609.9062573071382,306.6899922789296 L619.0906596839003,284.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M620,278 L657.9062573071382,306.6899922789296 L667.0906596839003,284.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M668,278 L705.9062573071382,306.6899922789296 L715.0906596839003,284.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M716,278 L753.9062573071382,306.6899922789296 L763.0906596839003,284.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M764,278 L801.9062573071382,306.6899922789296 L811.0906596839003,284.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M812,278 L849.9062573071382,306.6899922789296 L859.0906596839003,284.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <path d="M860,278 L897.9062573071382,306.6899922789296 L907.0906596839003,284.5168834986587 Z" fill="#DDF0E2" stroke="none" stroke-width="1.4" opacity="0.55"/>
  <circle cx="524" cy="122" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="572" cy="122" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="620" cy="122" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="668" cy="122" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="716" cy="122" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="764" cy="122" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="812" cy="122" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="860" cy="122" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="546" cy="200" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="594" cy="200" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="642" cy="200" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="690" cy="200" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="738" cy="200" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="786" cy="200" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="834" cy="200" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="882" cy="200" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="524" cy="278" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="572" cy="278" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="620" cy="278" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="668" cy="278" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="716" cy="278" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="764" cy="278" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="812" cy="278" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="860" cy="278" r="4.2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="695" y="356" text-anchor="middle" font-size="13" fill="#1F5C3A" font-weight="700">array efficiency 0.928</text>
  <text x="470" y="200" text-anchor="middle" font-size="20" fill="currentColor" opacity="0.5">→</text>
  <rect x="40" y="380" width="868" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="401" text-anchor="middle" font-size="11.5" fill="currentColor">The gain comes from the rose, not from the geometry: on a site with a uniform wind rose the two rules</text>
  <text x="474.0" y="418" text-anchor="middle" font-size="11.5" fill="currentColor">produce the same efficiency, and the circular one is simpler. Direction weighting is what makes the difference.</text>
</svg>

## Direction weighting: the step that makes the number mean something

A wake deficit is a function of direction, and the annual energy loss is the deficit integrated over
the wind rose. The consequence is that array loss is not a property of the layout alone — the same
turbine positions on a site with a tight westerly regime and on a site with a uniform rose have
different losses, and the tight regime is worse if the array is aligned with it and better if it is
not.

The calculation is a loop over direction sectors, weighted by the frequency and the cube of the mean
speed in each. Using frequency alone under-weights the strong sectors, which are precisely the ones
where wake losses cost the most energy.

```python
def array_efficiency(
    positions: np.ndarray,          # (n, 2) in metres
    rose: list[dict],               # [{'dir_deg': 270, 'freq': 0.21, 'mean_ms': 9.4}, ...]
    *,
    rotor_diameter_m: float,
    thrust_coefficient: float = 0.8,
    wake_decay_k: float = 0.075,
) -> float:
    """Energy-weighted array efficiency: 1.0 means no wake loss at all."""
    gross = 0.0
    net = 0.0
    for sector in rose:
        theta = np.radians(sector["dir_deg"])
        # Unit vector pointing downwind.
        wx, wy = np.sin(theta + np.pi), np.cos(theta + np.pi)
        weight = sector["freq"] * sector["mean_ms"] ** 3

        for i, (x, y) in enumerate(positions):
            deficits = []
            for j, (ox, oy) in enumerate(positions):
                if i == j:
                    continue
                dx, dy = x - ox, y - oy
                downwind = dx * wx + dy * wy
                if downwind <= 0:
                    continue                      # upwind of this turbine
                cross = abs(dx * wy - dy * wx)
                wake_radius = rotor_diameter_m / 2 + wake_decay_k * downwind
                if cross > wake_radius:
                    continue                      # outside the wake cone
                deficits.append(
                    jensen_deficit(
                        np.array([downwind]),
                        rotor_diameter_m=rotor_diameter_m,
                        thrust_coefficient=thrust_coefficient,
                        wake_decay_k=wake_decay_k,
                    )[0]
                )
            deficit = combine_deficits(np.array(deficits)) if deficits else 0.0
            gross += weight
            net += weight * (1.0 - deficit) ** 3   # power goes with the cube of speed
    return net / gross if gross else 1.0
```

## Error handling and edge cases

**A layout with no feasible positions.** Report it with the binding constraint, not as an empty frame.
A site whose buildable area cannot hold two turbines at the specified spacing has a real answer —
"this specification does not fit here" — and the useful output names whether it was the setback, the
slope limit or the spacing rule that bound.

**Candidate positions on the buildable-area boundary.** A turbine centre inside the mask can still put
a rotor tip or a crane pad outside it. Buffer the buildable area inward by the crane-pad radius before
placement rather than checking the centre point, which is the same working-room argument that applies
to routing exclusions.

**Turbines just outside a wake cone.** The Jensen top-hat makes this a cliff: a metre of movement
changes a turbine from fully waked to unwaked. When a layout's efficiency is sensitive at that level,
the model is being used past its resolution — switch to a Gaussian profile rather than trusting the
discontinuity.

**Neighbouring projects.** Wakes do not stop at a lease boundary. An adjacent operating wind farm
upwind of the site is part of the flow, and omitting it produces an optimistic estimate that the
neighbour's operator will happily dispute. Include external turbines in the deficit calculation even
though they are not in the layout.

## Performance and scalability

The naive array-efficiency loop is `O(sectors × n²)`, which for 16 sectors and 60 turbines is 57,600
pair evaluations — fast enough to sit inside an optimisation loop. At 300 turbines and 36 sectors it
is 3.2 million, which is not. Two optimisations recover most of it: skip pairs beyond a maximum wake
length (about 20 D, past which the deficit is under one percent) using a spatial index, and vectorise
the inner loop over turbines rather than looping in Python. Both are mechanical and neither changes
the result.

If the layout is being optimised rather than evaluated, the useful structure is to keep the mask and
the candidate grid fixed and treat placement as a selection problem, so that each evaluation reuses
the same precomputed pairwise geometry. Recomputing the constraint mask inside the optimisation loop
is the most common reason a layout optimiser is slow.

<svg viewBox="0 0 940 404" role="img" aria-label="How array efficiency responds to spacing, for a 24-turbine layout on a site with a moderately directional rose. At 3 diameters mean spacing the efficiency is 0.861; at 4 it is 0.902; at 5, 0.925; at 7, 0.949; at 10, 0.968. The curve flattens, so each additional diameter of spacing recovers less energy while costing buildable area — which is why the optimum is a total-energy question rather than an efficiency one." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Array efficiency against mean spacing, and why more is not always better</title>
  <desc>A curve of array efficiency against mean turbine spacing in rotor diameters, rising from 0.861 at 3 diameters through 0.902 at 4, 0.925 at 5 and 0.949 at 7 to 0.968 at 10, flattening as it goes. A second series shows how many turbines fit in the same buildable area at each spacing: 34 at 3 diameters, 24 at 4, 17 at 5, 10 at 7 and 6 at 10. A third annotation gives the product — total net energy — which peaks near 4 diameters and falls away in both directions, making the point that efficiency alone is the wrong objective.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="404"/>
  <defs><marker id="wk3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Efficiency rises with spacing; turbine count falls faster</text>
  <line x1="110" y1="268" x2="700" y2="268" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="110" y1="70" x2="110" y2="268" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="106" y1="240.57142857142856" x2="700" y2="240.57142857142856" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="244.57142857142856" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0.86</text>
  <line x1="106" y1="185.71428571428564" x2="700" y2="185.71428571428564" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="189.71428571428564" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0.90</text>
  <line x1="106" y1="130.8571428571429" x2="700" y2="130.8571428571429" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="134.8571428571429" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0.94</text>
  <line x1="106" y1="76.0" x2="700" y2="76.0" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="80.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0.98</text>
  <line x1="110.0" y1="268" x2="110.0" y2="273" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="110.0" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">3 D</text>
  <line x1="194.28571428571428" y1="268" x2="194.28571428571428" y2="273" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="194.28571428571428" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">4 D</text>
  <line x1="278.57142857142856" y1="268" x2="278.57142857142856" y2="273" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="278.57142857142856" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">5 D</text>
  <line x1="447.1428571428571" y1="268" x2="447.1428571428571" y2="273" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="447.1428571428571" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">7 D</text>
  <line x1="700.0" y1="268" x2="700.0" y2="273" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="700.0" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">10 D</text>
  <path d="M110.0,239.2 L194.3,183.0 L278.6,151.4 L447.1,118.5 L700.0,92.5" fill="none" stroke="#3D8B5F" stroke-width="2.6"/>
  <circle cx="110.0" cy="239.2" r="4.5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="110.0" y="225.2" text-anchor="middle" font-size="10.5" fill="#1F5C3A" font-weight="700">0.861</text>
  <text x="110.0" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">34 turbines</text>
  <circle cx="194.28571428571428" cy="182.9714285714285" r="4.5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="194.28571428571428" y="168.9714285714285" text-anchor="middle" font-size="10.5" fill="#1F5C3A" font-weight="700">0.902</text>
  <text x="194.28571428571428" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">24 turbines</text>
  <circle cx="278.57142857142856" cy="151.42857142857133" r="4.5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="278.57142857142856" y="137.42857142857133" text-anchor="middle" font-size="10.5" fill="#1F5C3A" font-weight="700">0.925</text>
  <text x="278.57142857142856" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">17 turbines</text>
  <circle cx="447.1428571428571" cy="118.51428571428576" r="4.5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="447.1428571428571" y="104.51428571428576" text-anchor="middle" font-size="10.5" fill="#1F5C3A" font-weight="700">0.949</text>
  <text x="447.1428571428571" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">10 turbines</text>
  <circle cx="700.0" cy="92.45714285714286" r="4.5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="700.0" y="78.45714285714286" text-anchor="middle" font-size="10.5" fill="#1F5C3A" font-weight="700">0.968</text>
  <text x="700.0" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">6 turbines</text>
  <text x="700" y="62" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.8">mean spacing, rotor diameters</text>
  <text x="730" y="66" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700" opacity="0.85">net energy index</text>
  <rect x="730" y="76" width="180" height="44" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.55"/>
  <text x="744" y="96" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">3 D</text>
  <text x="744" y="112" text-anchor="start" font-size="10" fill="currentColor" opacity="0.85">34 turbines × 0.861</text>
  <text x="898" y="104" text-anchor="end" font-size="13" fill="currentColor" font-weight="700">29.3</text>
  <rect x="730" y="128" width="180" height="44" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.55"/>
  <text x="744" y="148" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">4 D</text>
  <text x="744" y="164" text-anchor="start" font-size="10" fill="currentColor" opacity="0.85">24 turbines × 0.902</text>
  <text x="898" y="156" text-anchor="end" font-size="13" fill="currentColor" font-weight="700">21.6</text>
  <rect x="730" y="180" width="180" height="44" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2" opacity="0.55"/>
  <text x="744" y="200" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">5 D</text>
  <text x="744" y="216" text-anchor="start" font-size="10" fill="currentColor" opacity="0.85">17 turbines × 0.925</text>
  <text x="898" y="208" text-anchor="end" font-size="13" fill="currentColor" font-weight="700">15.7</text>
  <rect x="730" y="232" width="180" height="44" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2" opacity="0.55"/>
  <text x="744" y="252" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">7 D</text>
  <text x="744" y="268" text-anchor="start" font-size="10" fill="currentColor" opacity="0.85">10 turbines × 0.949</text>
  <text x="898" y="260" text-anchor="end" font-size="13" fill="currentColor" font-weight="700">9.5</text>
  <rect x="110" y="320" width="800" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="510.0" y="341" text-anchor="middle" font-size="11.5" fill="currentColor">Efficiency is a means, not the objective: the layout that maximises net energy on this site is denser</text>
  <text x="510.0" y="358" text-anchor="middle" font-size="11.5" fill="currentColor">than the one that maximises efficiency, and both are constrained by what the buildable area holds.</text>
</svg>

## Validation and audit trail

A bankable layout carries: the turbine specification and its thrust and power curves, the spacing rule
applied, the buildable-area version and the exclusion layers behind it, the wind rose used for
direction weighting, the wake model and its decay constant, the resulting array efficiency, and the
external turbines included. Every one of those is a number an independent engineer will want to vary.

Three assertions belong in CI. Every turbine must lie inside the buildable area after the inward
buffer, which catches a mask applied to centres rather than to pads. Every pairwise distance must
clear the spacing rule, which catches an off-by-one in the greedy loop. And the array efficiency must
lie between 0.75 and 1.0 — a value above 1.0 means the deficit was applied with the wrong sign, and a
value below 0.75 means the layout is packed far past anything defensible.

## Frequently asked questions

### Is a 4 D by 8 D spacing rule good enough on its own?

For a first-pass layout, yes; for an energy estimate, no. The rule is a direction-blind approximation
of the wake physics, and its whole value is that it needs no wind rose. Once the rose exists, the same
turbine count can usually be placed with a lower array loss by tightening crosswind and widening
along the prevailing axis — typically one to three percentage points of annual energy, which is
larger than most layout optimisations recover by other means.

### What array efficiency should a layout achieve?

Onshore projects at conventional spacing usually land between 0.88 and 0.94, and offshore projects
lower because spacing is tighter relative to the resource. The number in isolation says little: an
efficiency of 0.95 on a site with half the turbines that fit is a worse project than 0.90 with the
full complement, since the objective is total net energy rather than per-turbine efficiency.

### How much does the wake decay constant matter?

Enough to be recorded and not enough to agonise over at screening. Moving `k` from 0.075 to 0.05
deepens deficits and typically costs one to two points of array efficiency; the difference between
onshore and offshore values is larger than the uncertainty within either. Where it does matter is in
comparing a modelled layout against operating data, because a mismatched `k` will look like a layout
problem.

### Should terrain effects be included in the wake model?

For anything but flat terrain, yes — but not through the wake model. Complex terrain changes the
inflow, and the right place to represent that is the hub-height wind field from
[interpolating sparse met mast data with kriging](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/interpolating-sparse-met-mast-data-with-kriging/),
which already varies across the site. Feeding a per-turbine inflow speed into a simple wake model
captures most of the terrain effect; using a flat-terrain wake model with a site-average wind speed
captures none of it.

### Can the same machinery lay out a solar project?

The masking and spacing parts, yes; the wake part has no analogue. Solar row spacing is a shading
problem rather than a momentum one, and it trades ground coverage ratio against row-to-row shading
loss in a way that is far more tractable — the geometry is deterministic given the sun position. The
shared machinery is the buildable-area mask and the candidate grid.

### How do neighbouring projects affect the estimate?

They reduce it, sometimes materially, and they are outside the developer's control. An operating farm
two kilometres upwind in the prevailing direction can cost one to three points of array efficiency on
the near rows. Model them explicitly, record which external turbines were included, and expect the
figure to be contested — wake interaction between adjacent projects is one of the more common sources
of dispute in operating fleets.

## Related

- [Solar & Wind Resource Modeling Workflows](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/) — the parent pipeline
- [Wind Speed & Direction Modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/) — the hub-height field and rose this stage consumes
- [Building Wind Roses from Met Mast Data with Python](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/building-wind-roses-from-met-mast-data-with-python/) — the direction weighting behind array efficiency
- [Automating Hillshade & Slope Analysis for Wind Turbine Siting](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/automating-hillshade-and-slope-analysis-for-wind-turbine-siting/) — the slope mask that bounds placement
- [Environmental Constraint & Exclusion Screening](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/environmental-constraint-and-exclusion-screening/) — the buildable area every layout starts from
