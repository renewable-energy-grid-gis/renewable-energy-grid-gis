---
title: Building a Transmission Cost Surface Raster in NumPy
description: Turn land cover, slope, exclusions and existing crossings into one per-cell cost array — aligned grids, relative multipliers, infinities where routing must not go, and a sensitivity pass that shows which weights actually matter.
slug: building-a-transmission-cost-surface-raster-in-numpy
type: article
breadcrumb: Building a Transmission Cost Surface
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Building a Transmission Cost Surface Raster in NumPy

The scenario: a routing run produces a corridor that crosses a wetland, and the modeller's first
instinct is to raise the wetland cost. It gets raised from 50 to 500, the route still crosses, and at
5,000 the route finally goes around — through a residential subdivision. The cost surface, not the
optimiser, is where routing goes wrong, and this page builds one that behaves. It is the input stage
for
[grid routing and least-cost path analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-routing-and-least-cost-path-analysis/).

## Root-cause analysis

Three modelling errors produce the behaviour above, and each has a specific fix.

1. **Exclusions encoded as large finite costs.** Any finite cost is a price the optimiser is willing
   to pay when the detour is long enough. A wetland at 5,000 is not excluded — it is expensive, and
   the model will cross it rather than take a 40-kilometre detour. Exclusions have to be infinite,
   with a separate check afterwards that distinguishes "no route" from "expensive route".
2. **Costs conflated with currency.** Baking a dollar rate into the surface means every change to the
   cost estimate requires a re-route, and it hides the fact that the ratios between cells are what
   the optimiser actually uses. Relative multipliers, with the per-kilometre rate applied to the
   routed length afterwards, separate the two cleanly.
3. **Grids that do not align.** A cost surface assembled from a 30-metre land-cover raster and a
   10-metre DEM with different origins is a surface where each cell means two slightly different
   places. Routes then drift systematically toward the offset, which looks like a modelling
   preference and is an alignment bug.

<svg viewBox="0 0 940 384" role="img" aria-label="What a half-cell grid offset does to a route. Two input rasters whose origins differ by 15 metres describe cells that overlap rather than coincide, so every cost value is a blend of two neighbouring places. The resulting route drifts consistently toward the offset direction — here about 15 metres over the whole corridor — which reads as a modelling preference and is an alignment bug." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Aligned cells versus a half-cell offset</title>
  <desc>Two panels. The left panel shows a land-cover grid and a slope grid whose cell boundaries coincide exactly, with a routed path following the cheap cells. The right panel shows the same two grids offset by half a cell, so each combined cell draws its land cover from one place and its slope from another; the routed path drifts consistently toward the offset direction. Annotations give the offset as 15 metres on a 30 metre grid and note that the drift is systematic rather than random.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="384"/>
  <defs><marker id="cs1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Two rasters, one grid — or two grids pretending to be one</text>
  <text x="240" y="62" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">aligned: same origin, same transform</text>
  <rect x="40" y="78" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="88" y="78" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="136" y="78" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="184" y="78" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="232" y="78" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="280" y="78" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="328" y="78" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="376" y="78" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="40" y="110" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="88" y="110" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="136" y="110" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="184" y="110" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="232" y="110" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="280" y="110" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="328" y="110" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="376" y="110" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="40" y="142" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="88" y="142" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="136" y="142" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="184" y="142" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="232" y="142" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="280" y="142" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="328" y="142" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="376" y="142" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="40" y="174" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="88" y="174" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="136" y="174" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="184" y="174" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="232" y="174" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="280" y="174" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="328" y="174" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="376" y="174" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="40" y="206" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="88" y="206" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="136" y="206" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="184" y="206" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="232" y="206" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="280" y="206" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="328" y="206" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="376" y="206" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="40" y="238" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="88" y="238" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="136" y="238" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="184" y="238" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="232" y="238" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="280" y="238" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="328" y="238" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="376" y="238" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="40" y="78" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="88" y="78" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="136" y="78" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="184" y="78" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="232" y="78" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="280" y="78" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="328" y="78" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="376" y="78" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="40" y="110" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="88" y="110" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="136" y="110" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="184" y="110" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="232" y="110" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="280" y="110" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="328" y="110" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="376" y="110" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="40" y="142" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="88" y="142" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="136" y="142" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="184" y="142" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="232" y="142" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="280" y="142" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="328" y="142" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="376" y="142" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="40" y="174" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="88" y="174" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="136" y="174" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="184" y="174" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="232" y="174" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="280" y="174" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="328" y="174" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="376" y="174" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="40" y="206" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="88" y="206" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="136" y="206" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="184" y="206" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="232" y="206" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="280" y="206" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="328" y="206" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="376" y="206" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="40" y="238" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="88" y="238" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="136" y="238" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="184" y="238" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="232" y="238" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="280" y="238" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="328" y="238" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="376" y="238" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <path d="M60,258 L150,214 L240,176 L340,132 L420,96" fill="none" stroke="#3D8B5F" stroke-width="2.8"/>
  <text x="700" y="62" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">offset by half a cell (15 m on a 30 m grid)</text>
  <rect x="500" y="78" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="548" y="78" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="596" y="78" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="644" y="78" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="692" y="78" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="740" y="78" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="788" y="78" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="836" y="78" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="500" y="110" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="548" y="110" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="596" y="110" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="644" y="110" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="692" y="110" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="740" y="110" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="788" y="110" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="836" y="110" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="500" y="142" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="548" y="142" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="596" y="142" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="644" y="142" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="692" y="142" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="740" y="142" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="788" y="142" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="836" y="142" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="500" y="174" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="548" y="174" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="596" y="174" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="644" y="174" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="692" y="174" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="740" y="174" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="788" y="174" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="836" y="174" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="500" y="206" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="548" y="206" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="596" y="206" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="644" y="206" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="692" y="206" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="740" y="206" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="788" y="206" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="836" y="206" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="500" y="238" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="548" y="238" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="596" y="238" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="644" y="238" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="692" y="238" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="740" y="238" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="788" y="238" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="836" y="238" width="46" height="30" rx="2" fill="none" stroke="#5BA8C8" stroke-width="0.8" opacity="0.35"/>
  <rect x="511" y="89" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="559" y="89" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="607" y="89" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="655" y="89" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="703" y="89" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="751" y="89" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="799" y="89" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="847" y="89" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="511" y="121" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="559" y="121" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="607" y="121" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="655" y="121" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="703" y="121" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="751" y="121" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="799" y="121" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="847" y="121" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="511" y="153" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="559" y="153" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="607" y="153" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="655" y="153" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="703" y="153" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="751" y="153" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="799" y="153" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="847" y="153" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="511" y="185" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="559" y="185" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="607" y="185" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="655" y="185" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="703" y="185" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="751" y="185" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="799" y="185" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="847" y="185" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="511" y="217" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="559" y="217" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="607" y="217" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="655" y="217" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="703" y="217" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="751" y="217" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="799" y="217" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="847" y="217" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="511" y="249" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="559" y="249" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="607" y="249" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="655" y="249" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="703" y="249" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="751" y="249" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="799" y="249" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <rect x="847" y="249" width="46" height="30" rx="2" fill="none" stroke="#3D8B5F" stroke-width="0.8" opacity="0.45"/>
  <path d="M520,258 L613,212 L706,172 L809,126 L892,88" fill="none" stroke="#F4A261" stroke-width="2.8"/>
  <rect x="40" y="292" width="16" height="12" rx="2" fill="none" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="64" y="303" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">land cover cells</text>
  <rect x="240" y="292" width="16" height="12" rx="2" fill="none" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="264" y="303" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">slope cells</text>
  <rect x="40" y="320" width="868" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="341" text-anchor="middle" font-size="11.5" fill="currentColor">The drift is systematic, so it survives averaging and looks like terrain following. Assert CRS, transform</text>
  <text x="474.0" y="358" text-anchor="middle" font-size="11.5" fill="currentColor">and shape across every band before a single cost is computed.</text>
</svg>

## Pre-flight validation

Alignment is the check worth running first, because everything downstream inherits it.

```python
import numpy as np
import rasterio


def assert_grids_align(paths: list[str], *, tol: float = 1e-6) -> dict:
    """Every band in a cost surface has to describe the same cells."""
    profiles = []
    for p in paths:
        with rasterio.open(p) as src:
            profiles.append(
                {"path": p, "crs": src.crs, "transform": src.transform,
                 "shape": (src.height, src.width), "nodata": src.nodata}
            )
    ref = profiles[0]
    for prof in profiles[1:]:
        if prof["crs"] != ref["crs"]:
            raise ValueError(f"{prof['path']}: CRS {prof['crs']} != {ref['crs']}")
        if prof["shape"] != ref["shape"]:
            raise ValueError(f"{prof['path']}: shape {prof['shape']} != {ref['shape']}")
        if not np.allclose(np.array(prof["transform"]), np.array(ref["transform"]), atol=tol):
            raise ValueError(f"{prof['path']}: affine transform differs from the reference grid")
    return ref
```

## Fix implementation

```python
import numpy as np
from rasterio.features import rasterize

BASELINE = 1.0   # grassland: every other multiplier is relative to this

LANDCOVER_COST = {
    11: np.inf, 21: 3.2, 22: 6.5, 23: np.inf, 31: 1.4,
    41: 2.4, 42: 2.6, 43: 2.5, 52: 1.2, 71: 1.0,
    81: 1.1, 82: 1.3, 90: np.inf, 95: np.inf,
}


def build_cost_surface(
    landcover: np.ndarray,
    slope_deg: np.ndarray,
    *,
    exclusions=(),
    crossings=(),
    transform=None,
    max_slope_deg: float = 25.0,
    slope_scale_deg: float = 10.0,
    crossing_cost: float = 1.5,
    construction_offset_m: float = 40.0,
) -> np.ndarray:
    """Per-cell relative build cost. Infinite where a line cannot go."""
    shape = landcover.shape
    cost = np.full(shape, BASELINE, dtype="float32")

    for code, factor in LANDCOVER_COST.items():
        cost[landcover == code] = factor

    # Slope raises cost quadratically: doubling the angle quadruples the multiplier.
    cost *= 1.0 + (slope_deg / slope_scale_deg) ** 2
    cost[slope_deg > max_slope_deg] = np.inf

    if len(exclusions):
        buffered = [g.buffer(construction_offset_m) for g in exclusions]
        blocked = rasterize([(g, 1) for g in buffered], out_shape=shape,
                            transform=transform, fill=0, dtype="uint8")
        cost[blocked == 1] = np.inf

    if len(crossings):
        cheap = rasterize([(g, 1) for g in crossings], out_shape=shape,
                          transform=transform, fill=0, dtype="uint8")
        cost = np.where(cheap == 1, np.minimum(cost, crossing_cost), cost)

    return cost
```

The crossing step deserves attention: it uses `np.minimum` rather than assignment, so an existing
bridge over a river makes those cells cheap without also making them cheap where the bridge crosses a
wetland. Assignment would punch a hole straight through an exclusion, which is the most common way a
"corrected" surface produces an unbuildable route.

<svg viewBox="0 0 940 496" role="img" aria-label="The land-cover multipliers a transmission cost surface actually uses, relative to a grassland baseline of 1.0. Pasture is 1.1, cropland 1.3, shrub 1.2, barren 1.4, deciduous forest 2.4, evergreen 2.6, developed open space 3.2 and low-intensity development 6.5, while open water, wetlands and medium-intensity development are infinite. Existing corridors sit below the baseline at 0.7, which is what makes a route follow them." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Relative build-cost multipliers by land cover</title>
  <desc>A horizontal bar chart of relative cost multipliers against a grassland baseline of 1.0: existing corridor 0.7, grassland 1.0, pasture 1.1, shrub 1.2, cropland 1.3, barren 1.4, deciduous forest 2.4, evergreen forest 2.6, developed open space 3.2 and low-intensity development 6.5. Three classes are drawn as infinite rather than as bars: open water, wetlands and medium-intensity development. A note explains that the multipliers are relative, so the dollar rate is applied to the routed length afterwards.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="496"/>
  <defs><marker id="cs2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Multipliers, not currency — the rate is applied afterwards</text>
  <rect x="280" y="64" width="56.0" height="26" rx="4" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="268" y="82" text-anchor="end" font-size="11" fill="currentColor">existing corridor</text>
  <text x="346.0" y="82" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">0.7×</text>
  <rect x="280" y="96" width="80.0" height="26" rx="4" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="268" y="114" text-anchor="end" font-size="11" fill="currentColor">grassland (baseline)</text>
  <text x="370.0" y="114" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">1.0×</text>
  <rect x="280" y="128" width="88.0" height="26" rx="4" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="268" y="146" text-anchor="end" font-size="11" fill="currentColor">pasture</text>
  <text x="378.0" y="146" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">1.1×</text>
  <rect x="280" y="160" width="96.0" height="26" rx="4" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="268" y="178" text-anchor="end" font-size="11" fill="currentColor">shrub</text>
  <text x="386.0" y="178" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">1.2×</text>
  <rect x="280" y="192" width="104.0" height="26" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="268" y="210" text-anchor="end" font-size="11" fill="currentColor">cropland</text>
  <text x="394.0" y="210" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">1.3×</text>
  <rect x="280" y="224" width="112.0" height="26" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="268" y="242" text-anchor="end" font-size="11" fill="currentColor">barren</text>
  <text x="402.0" y="242" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">1.4×</text>
  <rect x="280" y="256" width="192.0" height="26" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="268" y="274" text-anchor="end" font-size="11" fill="currentColor">deciduous forest</text>
  <text x="482.0" y="274" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">2.4×</text>
  <rect x="280" y="288" width="208.0" height="26" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="268" y="306" text-anchor="end" font-size="11" fill="currentColor">evergreen forest</text>
  <text x="498.0" y="306" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">2.6×</text>
  <rect x="280" y="320" width="256.0" height="26" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="268" y="338" text-anchor="end" font-size="11" fill="currentColor">developed, open space</text>
  <text x="546.0" y="338" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">3.2×</text>
  <rect x="280" y="352" width="520.0" height="26" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="268" y="370" text-anchor="end" font-size="11" fill="currentColor">developed, low intensity</text>
  <text x="810.0" y="370" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">6.5×</text>
  <line x1="360.0" y1="58" x2="360.0" y2="378" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.5"/>
  <rect x="280" y="390" width="180" height="34" rx="5" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="370" y="412" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">open water — ∞</text>
  <rect x="472" y="390" width="180" height="34" rx="5" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="562" y="412" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">wetlands — ∞</text>
  <rect x="664" y="390" width="180" height="34" rx="5" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="754" y="412" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">developed, medium+ — ∞</text>
  <rect x="40" y="442" width="868" height="48" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="474.0" y="463" text-anchor="middle" font-size="11.5" fill="currentColor">Infinity, not a large number: any finite cost is a price the optimiser will pay when the detour is long</text>
  <text x="474.0" y="480" text-anchor="middle" font-size="11.5" fill="currentColor">enough — which is exactly how an &quot;excluded&quot; wetland ends up with a line across it.</text>
</svg>

## Fallback routing and performance tuning

- **Store the surface as float32, not float64.** Routing is memory-bound on large corridors, and the
  precision beyond float32 is meaningless for a relative multiplier.
- **Clip to a corridor buffer before assembling.** A national surface is never needed; a buffer three
  to five kilometres either side of the straight line removes about 90 percent of the cells.
- **Keep the physical layers cached and the weights per project.** Land cover, slope and hydrography
  are regional and slow to prepare; the multipliers and exclusions are per project and fast to apply.
- **Represent infinity honestly in storage.** GeoTIFF cannot hold `np.inf` in every dtype — write a
  companion `uint8` exclusion mask and reconstruct the infinities on read.
- **Run a sensitivity pass, not a single surface.** Two plausible weightings that produce the same
  corridor are a robust answer; two that diverge tell you which weight the study actually hinges on.

## Downstream validation

```python
def assert_cost_surface(cost: np.ndarray, *, origin_rc, dest_rc) -> None:
    """Four properties a usable cost surface must have."""
    assert cost.dtype == np.float32, "use float32 — routing is memory bound"
    assert np.isfinite(cost).any(), "every cell is excluded — the mask swallowed the corridor"
    assert np.nanmin(cost[np.isfinite(cost)]) > 0, "zero or negative cost lets a route loop for free"
    for name, rc in (("origin", origin_rc), ("destination", dest_rc)):
        if not np.isfinite(cost[rc]):
            raise ValueError(f"{name} cell is excluded — snap it or override before routing")
```

<svg viewBox="0 0 940 396" role="img" aria-label="A sensitivity pass over one corridor. Doubling the forest multiplier from 2.4 to 4.8 moves the route 3.1 kilometres sideways and changes the routed length by 4 percent; halving the crossing cost changes the length by 0.3 percent and does not move the corridor at all; removing the existing-corridor discount moves it 6.8 kilometres. The weights the study depends on are the ones whose corridor moves, not the ones whose cost moves." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Which weights the answer actually depends on</title>
  <desc>A table of four weight perturbations with their effect on the routed corridor. Doubling the forest multiplier moves the corridor 3.1 kilometres and changes routed length by 4.0 percent. Halving the crossing cost moves it 0.0 kilometres and changes length by 0.3 percent. Removing the existing-corridor discount moves it 6.8 kilometres and changes length by 9.2 percent. Raising the slope exponent moves it 0.4 kilometres and changes length by 1.1 percent. The two perturbations that move the corridor are flagged as the weights the study depends on, and the other two as noise.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="cs3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Perturb each weight; watch the corridor, not the cost</text>
  <text x="60" y="72" text-anchor="start" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">perturbation</text>
  <text x="560" y="72" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">corridor moves</text>
  <text x="760" y="72" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">length changes</text>
  <rect x="40" y="84" width="868" height="52" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="116" text-anchor="start" font-size="12" fill="currentColor">forest multiplier 2.4 → 4.8</text>
  <text x="560" y="116" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">3.1 km</text>
  <text x="760" y="116" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">4.0%</text>
  <rect x="820" y="100" width="76" height="20" rx="3" fill="none" stroke="#F4A261" stroke-width="1"/>
  <rect x="820" y="100" width="33.65714285714286" height="20" rx="3" fill="#F4A261" stroke="#F4A261" stroke-width="1" opacity="0.5"/>
  <rect x="40" y="144" width="868" height="52" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="176" text-anchor="start" font-size="12" fill="currentColor">crossing cost 1.5 → 0.75</text>
  <text x="560" y="176" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">0.0 km</text>
  <text x="760" y="176" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">0.3%</text>
  <rect x="820" y="160" width="76" height="20" rx="3" fill="none" stroke="#5BA8C8" stroke-width="1"/>
  <rect x="820" y="160" width="2" height="20" rx="3" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1" opacity="0.5"/>
  <rect x="40" y="204" width="868" height="52" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="236" text-anchor="start" font-size="12" fill="currentColor">existing-corridor discount removed</text>
  <text x="560" y="236" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">6.8 km</text>
  <text x="760" y="236" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">9.2%</text>
  <rect x="820" y="220" width="76" height="20" rx="3" fill="none" stroke="#C85B5B" stroke-width="1"/>
  <rect x="820" y="220" width="73.82857142857142" height="20" rx="3" fill="#C85B5B" stroke="#C85B5B" stroke-width="1" opacity="0.5"/>
  <rect x="40" y="264" width="868" height="52" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="296" text-anchor="start" font-size="12" fill="currentColor">slope exponent 2 → 2.5</text>
  <text x="560" y="296" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">0.4 km</text>
  <text x="760" y="296" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">1.1%</text>
  <rect x="820" y="280" width="76" height="20" rx="3" fill="none" stroke="#5BA8C8" stroke-width="1"/>
  <rect x="820" y="280" width="4.342857142857143" height="20" rx="3" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1" opacity="0.5"/>
  <rect x="40" y="330" width="868" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="351" text-anchor="middle" font-size="11.5" fill="currentColor">A weight whose corridor does not move is a weight the study does not depend on — report it and stop</text>
  <text x="474.0" y="368" text-anchor="middle" font-size="11.5" fill="currentColor">arguing about it. Two weightings that produce different corridors both belong in the deliverable.</text>
</svg>


## Storing and versioning the surface

A cost surface is an artefact, not a scratch array, and it should be written with enough metadata to
be re-used and challenged. Three things belong in the file: the weight table that produced it, the
source layers with their vintages, and the exclusion buffer applied. GeoTIFF and Zarr both carry
arbitrary key-value metadata, so none of this needs a sidecar that can be separated from the raster.

Infinity is the one storage awkwardness. Most raster formats cannot hold `np.inf` in a float32 band
in a way every reader honours, so the durable pattern is two bands: a finite cost band with
exclusions written as the maximum finite value, and a `uint8` exclusion mask. On read, the mask
restores the infinities. Doing it the other way round — writing a sentinel like −9999 and hoping
every consumer knows — is how an exclusion silently becomes a cheap cell in someone else's pipeline.

Version the surface by content rather than by date. Hashing the weight table together with the source
layer vintages gives a short identifier that changes exactly when something that matters changed, and
recording that identifier on every route makes a corridor traceable to the surface that produced it.
Two routes with different surface identifiers are not comparable, however similar they look.

## Frequently asked questions

### Why must the minimum cost be strictly positive?

Because a zero-cost cell is free to traverse, and a connected region of them lets the optimiser
wander at no cost — which produces routes with pointless meanders that all have the same total cost.
A baseline of 1.0 for the cheapest land keeps every step priced and makes the shortest of several
equal-cost routes the one that wins.

### Should slope raise cost linearly or quadratically?

Quadratically, because construction cost does. Access-road switchbacks, pad cut-and-fill and
structure spotting all get disproportionately harder as the ground steepens, and a linear multiplier
under-prices the steep ground that actually decides the route. The exact exponent matters less than
the shape; what matters most is the hard cut-off at the crane or construction limit.

### How should water crossings be priced when there is no existing bridge?

As a finite, large adder rather than an exclusion, encoded as a narrow band of expensive cells across
the water rather than as a blanket cost on the whole water body. That way the optimiser chooses the
narrowest sensible crossing, which is what a routing engineer does, instead of treating the entire
river as uniformly expensive and crossing at an arbitrary point.

### Can the surface include a preference for existing corridors?

Yes, and it is one of the highest-value weights available. Give existing transmission and pipeline
corridors a multiplier below the grassland baseline — 0.6 to 0.8 is a common range — and routes will
follow them wherever the detour is modest, which reflects both the easement saving and the
permitting preference.

### What resolution should the surface be?

Thirty metres for the corridor search and ten metres or better where crossings are chosen. A uniform
fine grid buys almost nothing in open terrain and costs an order of magnitude in cells; the two-pass
approach described in the parent page gets the accuracy where it matters at a fraction of the run
time.

### How do I know a weight change actually mattered?

Run both and difference the accumulated-cost surfaces, not just the routes. Two weightings that
produce visibly different corridors but nearly identical costs are within the model's own noise, and
the honest report presents both. A weight that moves the total cost by more than the difference
between the top two candidate routes is a weight the study depends on, and it belongs in the
sensitivity table.


### Should the surface be rebuilt when a new DEM is published?

Only with a comparison. A newer DEM is usually finer and more accurate, and both properties change
the slope band — sometimes enough to move a corridor. Rebuild, route both surfaces, and report the
difference rather than silently replacing the old answer, because a route that appears in a study is
a claim tied to the data that produced it.

### How should nodata cells be treated?

As excluded, and counted. A nodata hole in the land-cover raster is not cheap land, and leaving it at
the baseline multiplier is exactly how a route ends up running through the one area nobody has
mapped. Count the nodata cells inside the corridor and report the fraction: above a percent or two,
the surface needs a better input rather than a better weight.

## Related

- [Grid Routing & Least-Cost Path Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-routing-and-least-cost-path-analysis/) — the parent workflow this surface feeds
- [Computing Least-Cost Interconnection Routes with scikit-image](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-routing-and-least-cost-path-analysis/computing-least-cost-interconnection-routes-with-scikit-image/) — running Dijkstra over this array
- [Environmental Constraint & Exclusion Screening](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/environmental-constraint-and-exclusion-screening/) — where the exclusion geometry comes from
- [Automating Hillshade & Slope Analysis for Wind Turbine Siting](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/automating-hillshade-and-slope-analysis-for-wind-turbine-siting/) — producing the slope band
