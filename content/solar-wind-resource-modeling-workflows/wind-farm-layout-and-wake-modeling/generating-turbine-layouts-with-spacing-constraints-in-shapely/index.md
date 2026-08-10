---
title: Generating Turbine Layouts with Spacing Constraints in Shapely
description: Place turbines greedily against a buildable mask and an elliptical spacing rule — candidate grids, wind-aligned separation, crane-pad clearance, and the assertions that catch a layout that violates its own rule.
slug: generating-turbine-layouts-with-spacing-constraints-in-shapely
type: article
breadcrumb: Generating Turbine Layouts
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Generating Turbine Layouts with Spacing Constraints in Shapely

The scenario: a layout script places 26 turbines inside the buildable mask, every position passes the
4-diameter spacing test, and the civil engineer rejects six of them because a crane cannot be
assembled within 40 metres of the wetland edge. The geometry was correct and the constraint set was
incomplete. This page builds the placement stage of
[wind farm layout and wake modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-farm-layout-and-wake-modeling/),
with the constraints a layout actually has to satisfy.

## Root-cause analysis

Three modelling gaps produce layouts that pass their own tests and fail review.

1. **Point-in-mask instead of pad-in-mask.** A turbine is not a point: it needs a crane pad, a rotor
   swept area and an access road. Testing whether the tower centre falls inside the buildable polygon
   accepts positions whose pad or rotor tip does not, and the error concentrates along the exclusion
   boundary — which is exactly where a greedy placer wants to put turbines, because that is where the
   wind is unobstructed.
2. **Circular spacing on a directional site.** A single minimum separation treats every bearing as
   equally important. On a site where one sector carries a fifth of the hours and a third of the
   energy, that wastes crosswind space and under-spaces along the prevailing axis at the same time.
3. **Greedy placement without a resource sort.** Placing in file order fills the mask from wherever
   the first candidate happened to be. Sorting candidates by hub-height wind speed first costs
   nothing and produces layouts that are consistently one to two percent better in energy terms.

<svg viewBox="0 0 940 396" role="img" aria-label="Why a turbine is not a point. The tower centre may sit inside the buildable mask while the crane pad, the rotor swept circle and the assembly area do not. Eroding the mask by the binding radius before placement removes the positions a civil engineer would reject — here six of twenty-six — and it removes them at the exclusion boundary, which is exactly where a resource-sorted placer wants to put them." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Point-in-mask accepts positions that pad-in-mask rejects</title>
  <desc>Two panels over the same buildable boundary. In the left panel, placement tests only the tower centre: six turbines near the boundary are accepted although their crane pads and rotor circles cross it, drawn as circles overlapping the exclusion. In the right panel the mask has been eroded by the pad radius before placement, so those six positions are never offered and every remaining turbine has its full pad and rotor clearance inside the mask. An annotation gives the binding radius as the crane assembly area rather than the pad itself.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="tl1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Erode the mask by the machine, then place</text>
  <text x="240" y="62" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">centre-in-mask</text>
  <path d="M90,260 L150,120 L330,74 L430,150 L416,250 L280,300 Z" fill="none" stroke="currentColor" stroke-width="1.8" opacity="0.55"/>
  <circle cx="140" cy="240" r="18" fill="none" stroke="#F4A261" stroke-width="1.1" opacity="0.5"/>
  <circle cx="140" cy="240" r="4" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="200" cy="170" r="18" fill="none" stroke="#F4A261" stroke-width="1.1" opacity="0.5"/>
  <circle cx="200" cy="170" r="4" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="270" cy="130" r="18" fill="none" stroke="#F4A261" stroke-width="1.1" opacity="0.5"/>
  <circle cx="270" cy="130" r="4" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="330" cy="180" r="18" fill="none" stroke="#F4A261" stroke-width="1.1" opacity="0.5"/>
  <circle cx="330" cy="180" r="4" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="360" cy="240" r="18" fill="none" stroke="#F4A261" stroke-width="1.1" opacity="0.5"/>
  <circle cx="360" cy="240" r="4" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="230" cy="250" r="18" fill="none" stroke="#F4A261" stroke-width="1.1" opacity="0.5"/>
  <circle cx="230" cy="250" r="4" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="170" cy="200" r="18" fill="none" stroke="#F4A261" stroke-width="1.1" opacity="0.5"/>
  <circle cx="170" cy="200" r="4" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="290" cy="220" r="18" fill="none" stroke="#F4A261" stroke-width="1.1" opacity="0.5"/>
  <circle cx="290" cy="220" r="4" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <text x="240" y="330" text-anchor="middle" font-size="11.5" fill="#7A4A1A" font-weight="700">26 placed · 6 rejected at review</text>
  <text x="700" y="62" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">pad-in-mask (mask eroded first)</text>
  <path d="M550,260 L610,120 L790,74 L890,150 L876,250 L740,300 Z" fill="none" stroke="currentColor" stroke-width="1.8" opacity="0.55"/>
  <path d="M581,249 L631,132 L782,93 L866,157 L855,241 L740,283 Z" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.6" stroke-dasharray="5 4" opacity="0.5"/>
  <circle cx="660" cy="170" r="18" fill="none" stroke="#3D8B5F" stroke-width="1.1" opacity="0.5"/>
  <circle cx="660" cy="170" r="4" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="790" cy="180" r="18" fill="none" stroke="#3D8B5F" stroke-width="1.1" opacity="0.5"/>
  <circle cx="790" cy="180" r="4" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="690" cy="250" r="18" fill="none" stroke="#3D8B5F" stroke-width="1.1" opacity="0.5"/>
  <circle cx="690" cy="250" r="4" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="630" cy="200" r="18" fill="none" stroke="#3D8B5F" stroke-width="1.1" opacity="0.5"/>
  <circle cx="630" cy="200" r="4" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="750" cy="220" r="18" fill="none" stroke="#3D8B5F" stroke-width="1.1" opacity="0.5"/>
  <circle cx="750" cy="220" r="4" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="700" y="330" text-anchor="middle" font-size="11.5" fill="#1F5C3A" font-weight="700">20 placed · 0 rejected</text>
  <rect x="30" y="348" width="878" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="469.0" y="367" text-anchor="middle" font-size="11" fill="currentColor">The binding radius is usually the crane assembly area, not the pad — record which one bound, because a</text>
  <text x="469.0" y="382" text-anchor="middle" font-size="11" fill="currentColor">change of crane changes the buildable area rather than just the cost.</text>
</svg>

## Pre-flight validation

Erode the buildable mask by the pad radius before any placement runs, and check that what remains can
hold the intended turbine count at the intended spacing. That second check is the one that saves a
wasted optimisation run.

```python
import geopandas as gpd
import numpy as np


def preflight_layout_capacity(
    buildable: gpd.GeoSeries,
    *,
    rotor_diameter_m: float,
    pad_radius_m: float,
    min_spacing_d: float,
) -> dict:
    """Can this mask hold a layout at all, and roughly how many turbines?"""
    eroded = buildable.buffer(-pad_radius_m)
    eroded = eroded[~eroded.is_empty]
    if eroded.empty:
        raise ValueError(
            f"no buildable area survives a {pad_radius_m} m pad erosion — "
            "the mask is narrower than the machine"
        )
    area_m2 = float(eroded.area.sum())
    # A hexagonal packing at spacing s covers about s^2 * sqrt(3)/2 per turbine.
    s = min_spacing_d * rotor_diameter_m
    theoretical = int(area_m2 / (s * s * np.sqrt(3) / 2))
    return {
        "eroded_area_ha": area_m2 / 10_000.0,
        "pieces": int(len(eroded.explode(index_parts=False))),
        "theoretical_turbines": theoretical,
        "practical_turbines": int(theoretical * 0.65),   # edges and shape cost ~a third
    }
```

The 0.65 factor is empirical and worth keeping honest: perfect hexagonal packing assumes an infinite
plane, and a real mask with an irregular boundary and internal holes loses roughly a third of the
theoretical count to edge effects.

## Fix implementation

```python
import geopandas as gpd
import numpy as np
from shapely.geometry import Point


def place_turbines(
    buildable: gpd.GeoSeries,
    candidates: gpd.GeoDataFrame,
    *,
    rotor_diameter_m: float,
    pad_radius_m: float = 40.0,
    cross_spacing_d: float = 3.2,
    down_spacing_d: float = 9.0,
    prevailing_deg: float | None = None,
    max_turbines: int | None = None,
) -> gpd.GeoDataFrame:
    """Greedy, resource-sorted placement under an elliptical spacing rule."""
    area = buildable.buffer(-pad_radius_m).union_all()
    if area.is_empty:
        raise ValueError("buildable area does not survive pad erosion")

    inside = candidates[candidates.geometry.within(area)].copy()
    inside = inside.sort_values("wind_speed_ms", ascending=False)

    r_cross = cross_spacing_d * rotor_diameter_m
    r_down = down_spacing_d * rotor_diameter_m
    theta = np.radians(prevailing_deg) if prevailing_deg is not None else None

    placed: list[tuple[float, float]] = []
    keep: list[int] = []
    for idx, row in inside.iterrows():
        x, y = row.geometry.x, row.geometry.y
        if placed:
            px = np.fromiter((p[0] for p in placed), dtype=float)
            py = np.fromiter((p[1] for p in placed), dtype=float)
            dx, dy = x - px, y - py
            if theta is None:
                blocked = np.hypot(dx, dy) < r_cross
            else:
                u = dx * np.sin(theta) + dy * np.cos(theta)   # along the wind
                v = dx * np.cos(theta) - dy * np.sin(theta)   # across it
                blocked = ((u / r_down) ** 2 + (v / r_cross) ** 2) < 1.0
            if blocked.any():
                continue
        placed.append((x, y))
        keep.append(idx)
        if max_turbines and len(keep) >= max_turbines:
            break

    out = inside.loc[keep].copy()
    out["turbine_id"] = [f"T{i + 1:03d}" for i in range(len(out))]
    out["pad_radius_m"] = pad_radius_m
    return out.set_geometry("geometry")
```

The ellipse is the substance. Rotating the separation vector into wind-aligned coordinates costs one
sine and one cosine per comparison and lets the layout pack tightly across the prevailing axis while
staying generous along it — which is what the wake physics asks for and what a circular rule cannot
express.

<svg viewBox="0 0 940 412" role="img" aria-label="Circular versus elliptical spacing on a directional site. A circular 4-diameter rule reserves the same distance in every direction, which wastes crosswind space and still allows turbines to line up along the axis that carries the energy. An ellipse of 3.2 diameters across the prevailing axis and 9 along it reserves distance where the wake actually travels — the same turbine count, packed tighter across the wind and spread further along it." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>The exclusion zone a spacing rule reserves around each turbine</title>
  <desc>Two diagrams of the exclusion zone a spacing rule reserves around one turbine. The first is a circle of 4 rotor diameters in every direction. The second is an ellipse 3.2 diameters wide across the prevailing wind axis and 9 diameters long along it, rotated to the energy-weighted prevailing direction of 247 degrees. Beneath, the arithmetic: the circle reserves 50.3 square diameters per turbine while the ellipse reserves 22.6, so the same mask holds more turbines under the rule that matches the physics.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="412"/>
  <defs><marker id="tl2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The same rule, expressed two ways</text>
  <text x="250" y="66" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">circular · 4 D in every direction</text>
  <circle cx="250" cy="200" r="96" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.6" opacity="0.5"/>
  <circle cx="250" cy="200" r="5" fill="currentColor" stroke="currentColor" stroke-width="1"/>
  <text x="250" y="328" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">50.3 D² reserved</text>
  <text x="690" y="66" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">elliptical · 3.2 D across, 9 D along</text>
  <g transform="rotate(-67.5 690 200)">
  <ellipse cx="690" cy="200" rx="108" ry="38" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.6" opacity="0.5"/>
  </g>
  <line x1="598" y1="238" x2="782" y2="162" stroke="currentColor" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.55"/>
  <text x="794" y="154" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">prevailing axis</text>
  <circle cx="690" cy="200" r="5" fill="currentColor" stroke="currentColor" stroke-width="1"/>
  <text x="690" y="328" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">22.6 D² reserved</text>
  <rect x="30" y="348" width="878" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="469.0" y="367" text-anchor="middle" font-size="11" fill="currentColor">Same physics, half the reserved area: the ellipse spends its separation along the axis the wake travels</text>
  <text x="469.0" y="382" text-anchor="middle" font-size="11" fill="currentColor">and reclaims it across the axis where the wake never reaches.</text>
</svg>

## Fallback routing and performance tuning

- **Vectorise the distance test.** Comparing against all placed turbines with NumPy rather than a
  Python loop keeps placement linear in practice up to a few hundred turbines.
- **Use a spatial index above ~300 turbines.** Only turbines within `r_down` can block a candidate, so
  a KD-tree query bounds the comparison set instead of scanning every placement.
- **Generate candidates on a hexagonal grid, not a square one.** Hexagonal candidate spacing packs
  about 15 percent more positions into the same mask before the spacing rule prunes them.
- **Keep the candidate grid coarse.** A 25-metre candidate spacing is finer than the uncertainty in
  the wind field, and a finer grid multiplies placement time for no measurable energy gain.
- **Erode once, on the union.** The negative buffer is the expensive geometry operation here; doing
  it per candidate is the most common reason a placement run takes minutes.

## Downstream validation

```python
import numpy as np
from scipy.spatial import cKDTree


def assert_layout_valid(
    layout: gpd.GeoDataFrame,
    buildable: gpd.GeoSeries,
    *,
    rotor_diameter_m: float,
    pad_radius_m: float,
    cross_spacing_d: float,
) -> None:
    """Three assertions that catch the layouts a review would reject."""
    area = buildable.buffer(-pad_radius_m).union_all()
    outside = layout[~layout.geometry.within(area)]
    assert outside.empty, f"{len(outside)} turbines outside the pad-eroded buildable area"

    xy = np.column_stack([layout.geometry.x.values, layout.geometry.y.values])
    if len(xy) > 1:
        pairs = cKDTree(xy).query_pairs(cross_spacing_d * rotor_diameter_m)
        assert not pairs, f"{len(pairs)} turbine pairs closer than the crosswind minimum"

    assert layout["turbine_id"].is_unique, "duplicate turbine identifiers in the layout"
```

<svg viewBox="0 0 940 388" role="img" aria-label="How many turbines a mask actually holds. Perfect hexagonal packing at 4 diameters predicts 37 turbines on a 2,164 hectare placeable area; the greedy placer fits 24. The gap is edge effect: an irregular boundary and internal holes cost roughly a third of the theoretical count, which is why the pre-flight estimate applies a 0.65 factor rather than reporting the packing number." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Theoretical packing against what a real mask holds</title>
  <desc>A comparison over four candidate sites. For each, the placeable area in hectares, the theoretical hexagonal packing count at 4 rotor diameters, and the count the greedy placer actually achieved: 2,164 hectares predicting 37 and achieving 24; 1,480 hectares predicting 25 and achieving 17; 890 hectares predicting 15 and achieving 9; and 3,320 hectares predicting 57 and achieving 41. The achieved-to-theoretical ratio ranges from 0.60 to 0.72, clustering near the 0.65 factor used in the pre-flight estimate.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="388"/>
  <defs><marker id="tl3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Hexagonal packing is an upper bound, not a forecast</text>
  <rect x="40" y="74" width="868" height="54" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.4"/>
  <text x="60" y="107" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">site A · 2 164 ha placeable</text>
  <rect x="430" y="88" width="123.33333333333333" height="26" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <rect x="430" y="88" width="80.0" height="26" rx="4" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
  <text x="646" y="107" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">24 of 37</text>
  <text x="890" y="107" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.9">ratio 0.65</text>
  <rect x="40" y="136" width="868" height="54" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.4"/>
  <text x="60" y="169" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">site B · 1 480 ha placeable</text>
  <rect x="430" y="150" width="83.33333333333333" height="26" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <rect x="430" y="150" width="56.666666666666664" height="26" rx="4" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
  <text x="646" y="169" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">17 of 25</text>
  <text x="890" y="169" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.9">ratio 0.68</text>
  <rect x="40" y="198" width="868" height="54" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.4"/>
  <text x="60" y="231" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">site C · 890 ha placeable</text>
  <rect x="430" y="212" width="50.0" height="26" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <rect x="430" y="212" width="30.0" height="26" rx="4" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
  <text x="646" y="231" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">9 of 15</text>
  <text x="890" y="231" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.9">ratio 0.60</text>
  <rect x="40" y="260" width="868" height="54" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.4"/>
  <text x="60" y="293" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">site D · 3 320 ha placeable</text>
  <rect x="430" y="274" width="190.0" height="26" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <rect x="430" y="274" width="136.66666666666666" height="26" rx="4" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
  <text x="646" y="293" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">41 of 57</text>
  <text x="890" y="293" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.9">ratio 0.72</text>
  <rect x="40" y="336" width="16" height="12" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="64" y="347" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">theoretical hexagonal packing</text>
  <rect x="340" y="336" width="16" height="12" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="364" y="347" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">achieved by greedy placement</text>
  <text x="40" y="376" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">Edge effect costs about a third: an irregular boundary and internal holes are where the packing assumption fails.</text>
</svg>


## Candidate grids and why they matter more than they look

Placement can only choose from the positions it is offered, so the candidate grid is a modelling
decision rather than an implementation detail. Three properties matter.

**Spacing.** A 25-metre candidate spacing is finer than the uncertainty in the hub-height wind field,
so anything finer buys resolution the resource data cannot support while multiplying placement time.
Anything much coarser starts to cost real energy, because the placer cannot reach the local maximum
it is aiming for.

**Geometry.** A hexagonal candidate grid packs about 15 percent more positions into the same mask
than a square one at the same nominal spacing, and it aligns better with the hexagonal packing an
unconstrained spacing rule tends toward. The difference shows up as one or two extra turbines on a
mid-sized mask.

**Stability.** The same grid must be used across layout variants. Regenerating it — or generating it
from a bounding box that moves when the mask changes — introduces differences between variants that
look like layout improvements and are grid noise. Persist the grid with the project, and treat a
change to it as a change to the study.

A useful diagnostic is the ratio of candidates offered to turbines placed. On an open mask at 4
diameters that ratio is in the hundreds; when it falls into the low tens, the mask is so constrained
that the spacing rule is barely binding and the layout is being decided by the exclusions instead.

## Frequently asked questions

### Is greedy placement good enough, or should this be optimised?

Greedy with a resource sort lands within a few percent of an optimised layout and is explainable,
which matters more than the last percent when a landowner asks why a turbine sits where it does.
Optimisation earns its cost when the mask is highly fragmented, when a hard turbine count must be
met, or when the wake model is inside the objective rather than applied afterwards.

### What pad radius should be used?

Whatever the crane and the rotor require, and it is usually the crane. A large main crane needs a
level pad tens of metres across plus assembly space, and the binding constraint is often the assembly
area rather than the pad itself. Record which one bound, because a change of crane changes the
buildable area rather than just the cost.

### Should the ellipse use the prevailing direction or the energy-weighted mean direction?

The energy-weighted one. The most frequent direction and the direction that carries the most energy
differ at many sites, sometimes by two sectors, and it is the energy-weighted axis that wake losses
follow. Deriving it from the rose is a few lines and removes a systematic misalignment.

### How do external turbines factor into placement?

As placed positions that cannot be moved. Add the neighbouring project's turbines to the placed list
before the loop starts, and the spacing rule will keep new positions clear of them automatically —
which is both good practice and, in several jurisdictions, a permitting requirement.

### What if the layout needs an exact turbine count?

Run placement at several spacings and pick the tightest that still meets the count, rather than
forcing positions at a fixed spacing. A layout that meets a count by violating its own spacing rule
will lose the difference to wake losses and more, which the array-efficiency calculation in the
parent workflow will show immediately.

### Does the candidate grid need to align with anything?

Only with itself. What matters is that the same grid is used across layout variants, so two options
are comparable; an unaligned or regenerated grid introduces differences that look like layout
improvements and are grid noise.

## Related

- [Wind Farm Layout & Wake Modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-farm-layout-and-wake-modeling/) — the parent workflow
- [Estimating Wake Losses with a Jensen Model in Python](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-farm-layout-and-wake-modeling/estimating-wake-losses-with-a-jensen-model-in-python/) — scoring the layouts this page produces
- [Calculating Buildable Area After Setback and Habitat Exclusions](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/environmental-constraint-and-exclusion-screening/calculating-buildable-area-after-setback-and-habitat-exclusions/) — the eroded mask this placement consumes
- [Building Wind Roses from Met Mast Data with Python](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/building-wind-roses-from-met-mast-data-with-python/) — the prevailing axis the ellipse aligns to
