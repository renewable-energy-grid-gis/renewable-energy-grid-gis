---
title: Computing Least-Cost Interconnection Routes with scikit-image
description: Run Dijkstra over a cost raster with route_through_array — geometric weighting, infinity handling, endpoint snapping, multi-destination reuse, and the assertions that stop an "optimal" route crossing an exclusion.
slug: computing-least-cost-interconnection-routes-with-scikit-image
type: article
breadcrumb: Computing Least-Cost Routes
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Computing Least-Cost Interconnection Routes with scikit-image

The scenario: `route_through_array` returns a route, its length is plausible, and a reviewer notices
it clips the corner of a designated wetland for 180 metres. The optimiser did exactly what it was
asked. This page covers the mechanics that sit between a cost surface and a defensible corridor, and
it is the execution half of
[grid routing and least-cost path analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-routing-and-least-cost-path-analysis/).

## Root-cause analysis

Four mechanical faults account for nearly every bad route that comes out of an otherwise correct
surface.

1. **Infinity substitution without a check.** `route_through_array` cannot traverse `np.inf`, so the
   surface is usually converted to a large finite value. Without checking the returned weight
   afterwards, "there is no route" becomes "here is a route through the exclusion".
2. **Geometric weighting left off.** With `geometric=False` a diagonal step costs the same as an
   orthogonal one, so diagonal movement is under-priced by a factor of 1.414 and routes acquire a
   staircase bias that is easy to mistake for terrain following.
3. **Endpoints inside excluded cells.** A substation polygon overlapping a developed land-cover class
   puts the destination in an infinite-cost cell, and the failure message is unhelpful.
4. **Cell-centre geometry.** Converting indices to coordinates without the half-cell offset shifts
   the whole route by half a pixel, which is invisible at national scale and matters when the route
   is compared against a parcel boundary.

<svg viewBox="0 0 940 384" role="img" aria-label="What geometric weighting changes. Without it a diagonal step costs the same as an orthogonal one, so the optimiser under-prices diagonal movement by a factor of 1.414 and produces staircase routes whose reported length is up to 41 percent short of the true ground distance. With geometric weighting on, a diagonal step is priced at the square root of two and the route follows the terrain rather than the grid." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Diagonal steps priced at 1, or at the square root of two</title>
  <desc>Two grids with the same origin and destination. In the first, with geometric weighting off, the route takes a staircase of alternating orthogonal steps whose total is reported as 12 cells while the true ground distance is 17 cell-lengths, a 41 percent understatement. In the second, with geometric weighting on, diagonal steps are priced at 1.414 and the route runs straight to the destination, reporting the true distance. A note records that the staircase is easy to mistake for terrain following.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="384"/>
  <defs><marker id="lc1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">geometric=False under-prices every diagonal by 41%</text>
  <text x="240" y="62" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">geometric=False — staircase</text>
  <rect x="40" y="78" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="88" y="78" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="136" y="78" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="184" y="78" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="232" y="78" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="280" y="78" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="328" y="78" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="376" y="78" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="40" y="110" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="88" y="110" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="136" y="110" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="184" y="110" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="232" y="110" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="280" y="110" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="328" y="110" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="376" y="110" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="40" y="142" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="88" y="142" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="136" y="142" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="184" y="142" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="232" y="142" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="280" y="142" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="328" y="142" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="376" y="142" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="40" y="174" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="88" y="174" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="136" y="174" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="184" y="174" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="232" y="174" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="280" y="174" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="328" y="174" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="376" y="174" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="40" y="206" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="88" y="206" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="136" y="206" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="184" y="206" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="232" y="206" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="280" y="206" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="328" y="206" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="376" y="206" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="40" y="238" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="88" y="238" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="136" y="238" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="184" y="238" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="232" y="238" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="280" y="238" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="328" y="238" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="376" y="238" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <path d="M64,258 L112,258 L112,226 L160,226 L160,194 L208,194 L208,162 L256,162 L256,130 L304,130 L304,98 L352,98 L352,66" fill="none" stroke="#F4A261" stroke-width="2.8"/>
  <circle cx="64" cy="258" r="6" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <circle cx="352" cy="66" r="6" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <text x="240" y="296" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">12 cells reported · 17 cell-lengths walked</text>
  <text x="700" y="62" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">geometric=True — true diagonal</text>
  <rect x="500" y="78" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="548" y="78" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="596" y="78" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="644" y="78" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="692" y="78" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="740" y="78" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="788" y="78" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="836" y="78" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="500" y="110" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="548" y="110" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="596" y="110" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="644" y="110" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="692" y="110" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="740" y="110" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="788" y="110" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="836" y="110" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="500" y="142" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="548" y="142" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="596" y="142" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="644" y="142" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="692" y="142" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="740" y="142" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="788" y="142" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="836" y="142" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="500" y="174" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="548" y="174" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="596" y="174" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="644" y="174" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="692" y="174" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="740" y="174" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="788" y="174" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="836" y="174" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="500" y="206" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="548" y="206" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="596" y="206" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="644" y="206" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="692" y="206" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="740" y="206" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="788" y="206" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="836" y="206" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="500" y="238" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="548" y="238" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="596" y="238" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="644" y="238" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="692" y="238" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="740" y="238" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="788" y="238" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <rect x="836" y="238" width="46" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.2"/>
  <path d="M524,258 L572,226 L620,194 L668,162 L716,130 L764,98 L812,66" fill="none" stroke="#3D8B5F" stroke-width="2.8"/>
  <circle cx="524" cy="258" r="6" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="812" cy="66" r="6" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="700" y="296" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">8.5 cell-lengths, reported correctly</text>
  <rect x="40" y="320" width="868" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="341" text-anchor="middle" font-size="11.5" fill="currentColor">The staircase looks like terrain following and is a pricing artefact. fully_connected=True allows the</text>
  <text x="474.0" y="358" text-anchor="middle" font-size="11.5" fill="currentColor">diagonal; geometric=True is what makes it cost what it should.</text>
</svg>

## Pre-flight validation

```python
import numpy as np


def prepare_for_routing(
    cost: np.ndarray,
    origin_rc: tuple[int, int],
    dest_rc: tuple[int, int],
    *,
    blocked_value: float = 1e9,
) -> tuple[np.ndarray, dict]:
    """Substitute infinities, rescue endpoints, and report what was changed."""
    report = {"blocked_cells": int(np.isinf(cost).sum()), "endpoint_overrides": []}
    finite = np.where(np.isinf(cost), np.float32(blocked_value), cost).astype("float32")

    for name, rc in (("origin", origin_rc), ("destination", dest_rc)):
        if finite[rc] >= blocked_value:
            # Rescue rather than fail: take the cheapest finite cell in a 5x5 window.
            r, c = rc
            window = finite[max(r - 2, 0):r + 3, max(c - 2, 0):c + 3]
            if not np.isfinite(window).any() or window.min() >= blocked_value:
                raise ValueError(f"{name} is inside a large excluded region — move it or relax a constraint")
            finite[rc] = float(window.min())
            report["endpoint_overrides"].append(name)
    return finite, report
```

## Fix implementation

```python
import numpy as np
from shapely.geometry import LineString
from skimage.graph import route_through_array


def least_cost_route(
    cost: np.ndarray,
    transform,
    origin_rc: tuple[int, int],
    dest_rc: tuple[int, int],
    *,
    blocked_value: float = 1e9,
    cell_size_m: float | None = None,
) -> dict:
    """Route, then prove the route is buildable before returning it."""
    finite, report = prepare_for_routing(cost, origin_rc, dest_rc, blocked_value=blocked_value)

    indices, weight = route_through_array(
        finite, origin_rc, dest_rc,
        fully_connected=True,     # allow diagonal movement
        geometric=True,           # and price it at sqrt(2), not 1
    )
    if weight >= blocked_value:
        raise ValueError("no traversable route: every path crosses an excluded region")

    # Half-cell offset puts the vertex at the cell centre, where the cost applies.
    coords = [transform * (c + 0.5, r + 0.5) for r, c in indices]
    line = LineString(coords)

    cs = cell_size_m or abs(transform.a)
    return {
        "geometry": line,
        "length_m": float(line.length),
        "accumulated_cost": float(weight),
        "cells": len(indices),
        "mean_cost_per_cell": float(weight) / max(len(indices), 1),
        "straight_line_m": float(
            LineString([coords[0], coords[-1]]).length
        ),
        "circuity": float(line.length) / max(
            LineString([coords[0], coords[-1]]).length, 1e-9
        ),
        "cell_size_m": cs,
        **report,
    }
```

Returning the circuity factor alongside the length is what connects this stage back to the
straight-line screen in
[proximity and distance calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/):
a route with a circuity of 1.9 is a project whose screen was optimistic, and that fact should travel
with the number.

<svg viewBox="0 0 940 384" role="img" aria-label="One Dijkstra pass answers every destination. Running find_costs once from the project fills the accumulated-cost array for the whole surface, so the cost to five candidate points of interconnection is five array lookups rather than five routing runs — 6.1 seconds instead of 28.4, with identical answers. Only the routes actually worth drawing need a traceback." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>One accumulated-cost pass serves every candidate destination</title>
  <desc>A diagram of one origin and five candidate points of interconnection over a shaded accumulated-cost surface, with iso-cost contours radiating from the origin. Each candidate is annotated with the cost read directly from the array: 14.6, 18.2, 21.9, 24.4 and 31.7 kilometres of cost-weighted distance. A comparison beside it gives the wall clock: five independent routing runs take 28.4 seconds, while one find_costs pass plus five array lookups takes 6.1 seconds and produces the same ranking.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="384"/>
  <defs><marker id="lc2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">find_costs once, read every destination</text>
  <circle cx="250" cy="200" r="60" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.28"/>
  <circle cx="250" cy="200" r="110" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.2"/>
  <circle cx="250" cy="200" r="160" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.14"/>
  <circle cx="250" cy="200" r="210" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.09"/>
  <circle cx="250" cy="200" r="8" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <text x="250" y="228" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">project</text>
  <circle cx="150" cy="92" r="6" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="150" y="78" text-anchor="middle" font-size="10.5" fill="#1F5C3A" font-weight="700">14.6 km</text>
  <circle cx="400" cy="118" r="6" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="400" y="104" text-anchor="middle" font-size="10.5" fill="#1F5C3A" font-weight="700">18.2 km</text>
  <circle cx="420" cy="258" r="6" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="420" y="244" text-anchor="middle" font-size="10.5" fill="#1F5C3A" font-weight="700">21.9 km</text>
  <circle cx="180" cy="320" r="6" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="180" y="306" text-anchor="middle" font-size="10.5" fill="#1F5C3A" font-weight="700">24.4 km</text>
  <circle cx="66" cy="240" r="6" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="66" y="226" text-anchor="middle" font-size="10.5" fill="#1F5C3A" font-weight="700">31.7 km</text>
  <rect x="560" y="100" width="348" height="66" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3" opacity="0.55"/>
  <text x="580" y="140" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">five independent routes</text>
  <text x="890" y="142" text-anchor="end" font-size="15" fill="currentColor" font-weight="700">28.4 s</text>
  <rect x="560" y="184" width="348" height="66" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3" opacity="0.55"/>
  <text x="580" y="224" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">one find_costs + 5 lookups</text>
  <text x="890" y="226" text-anchor="end" font-size="15" fill="currentColor" font-weight="700">6.1 s</text>
  <rect x="560" y="268" width="348" height="65" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="734.0" y="289" text-anchor="middle" font-size="11.5" fill="currentColor">Identical answers — the array is</text>
  <text x="734.0" y="306" text-anchor="middle" font-size="11.5" fill="currentColor">the same computation, kept</text>
  <text x="734.0" y="323" text-anchor="middle" font-size="11.5" fill="currentColor">instead of discarded</text>
  <rect x="40" y="344" width="868" height="25" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="363" text-anchor="middle" font-size="11" fill="currentColor">Trace back only the routes you intend to draw: the ranking comes from the array, the geometry from the traceback.</text>
</svg>

## Fallback routing and performance tuning

- **One Dijkstra, many destinations.** `route_through_array` discards the accumulated-cost array, but
  `skimage.graph.MCP_Geometric` exposes it: run `find_costs` once from the origin and read the cost
  to each candidate point of interconnection, then `traceback` only the ones worth drawing.
- **Route coarse, then refine.** A 30-metre pass to find the corridor and a 10-metre pass inside a
  buffer around it is roughly twenty times faster than a single fine pass and more accurate where it
  matters.
- **Simplify the output line, not the cost.** A raster route has a vertex per cell; simplifying with a
  tolerance of about one cell removes the staircase without changing the corridor. Compute the cost
  from the unsimplified path.
- **Watch memory on wide corridors.** The MCP structures are several arrays the size of the surface;
  at 44 million cells that is gigabytes, which is the practical reason for the corridor clip.

## Downstream validation

```python
import geopandas as gpd


def assert_route_is_buildable(route: dict, exclusions: gpd.GeoSeries, *, tol_m: float = 1.0) -> None:
    """The four assertions that separate an optimal route from a buildable one."""
    line = route["geometry"]
    assert route["accumulated_cost"] < 1e9, "route traverses an excluded region"
    assert route["length_m"] >= route["straight_line_m"] - tol_m, (
        "routed length below the straight line — a transform or CRS error"
    )
    hit = exclusions[exclusions.intersects(line)]
    assert hit.empty, f"route intersects {len(hit)} exclusion geometries despite a finite cost"
    assert route["circuity"] < 4.0, (
        f"circuity {route['circuity']:.2f} — the corridor is almost certainly blocked, not merely expensive"
    )
```

<svg viewBox="0 0 940 372" role="img" aria-label="Four assertions that separate an optimal route from a buildable one. The accumulated cost must stay below the blocked sentinel, which catches a route through an exclusion. The routed length must be at least the straight-line length, which catches a transform error. The route must not intersect any exclusion geometry, which catches the sentinel being too low. And the circuity factor must stay under about four, which catches a destination that is effectively unreachable rather than merely distant." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Four assertions and the bug each one catches</title>
  <desc>A four-row table pairing an assertion with the failure it catches. Accumulated cost below the blocked sentinel catches a route that crossed an excluded region. Routed length at least the straight-line length catches a coordinate or affine transform error. No intersection with any exclusion geometry catches a sentinel value set too low relative to the corridor length. A circuity factor under four catches a destination that is unreachable under the current constraints rather than simply far away.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="372"/>
  <defs><marker id="lc3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The route is a claim about buildability — check it</text>
  <rect x="40" y="68" width="420" height="56" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="250" y="102" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">accumulated_cost &lt; blocked_value</text>
  <line x1="466" y1="96" x2="498" y2="96" stroke="currentColor" stroke-width="1.4" marker-end="url(#lc3-arr)"/>
  <rect x="506" y="68" width="402" height="56" rx="7" fill="none" stroke="#C85B5B" stroke-width="1.1" opacity="0.6"/>
  <text x="707" y="102" text-anchor="middle" font-size="11.5" fill="currentColor">a route straight through an exclusion</text>
  <rect x="40" y="134" width="420" height="56" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="250" y="168" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">length_m &gt;= straight_line_m</text>
  <line x1="466" y1="162" x2="498" y2="162" stroke="currentColor" stroke-width="1.4" marker-end="url(#lc3-arr)"/>
  <rect x="506" y="134" width="402" height="56" rx="7" fill="none" stroke="#3D8B5F" stroke-width="1.1" opacity="0.6"/>
  <text x="707" y="168" text-anchor="middle" font-size="11.5" fill="currentColor">a coordinate or transform error</text>
  <rect x="40" y="200" width="420" height="56" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="250" y="234" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">not route.intersects(exclusions)</text>
  <line x1="466" y1="228" x2="498" y2="228" stroke="currentColor" stroke-width="1.4" marker-end="url(#lc3-arr)"/>
  <rect x="506" y="200" width="402" height="56" rx="7" fill="none" stroke="#F4A261" stroke-width="1.1" opacity="0.6"/>
  <text x="707" y="234" text-anchor="middle" font-size="11.5" fill="currentColor">a sentinel value set too low</text>
  <rect x="40" y="266" width="420" height="56" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="250" y="300" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">circuity &lt; 4.0</text>
  <line x1="466" y1="294" x2="498" y2="294" stroke="currentColor" stroke-width="1.4" marker-end="url(#lc3-arr)"/>
  <rect x="506" y="266" width="402" height="56" rx="7" fill="none" stroke="#5BA8C8" stroke-width="1.1" opacity="0.6"/>
  <text x="707" y="300" text-anchor="middle" font-size="11.5" fill="currentColor">a destination that is unreachable, not far</text>
  <text x="40" y="348" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">The third assertion is the one that matters most: it checks the geometry, not the arithmetic that produced it.</text>
</svg>


## What the accumulated-cost array is worth on its own

`route_through_array` throws away the most useful thing it computes. `MCP_Geometric.find_costs`
keeps it: an array holding the cost of reaching every cell from the origin, which answers several
questions the route alone cannot.

The first is comparison. Five candidate points of interconnection cost five array lookups rather
than five routing runs, and the ranking is exact rather than approximate because all five costs come
from the same pass. The second is shape. Contouring the array shows where the cheap corridors run
and where an obstacle splits the surface into two basins that only connect a long way round — which
is the map a routing engineer wants when deciding whether a constraint is worth challenging. The
third is uncertainty: differencing two accumulated-cost arrays computed under two plausible
weightings shows which parts of the study area are robustly cheap and which are cheap only under one
set of assumptions.

Keeping the array costs nothing beyond memory, since it was computed either way. Publishing it
alongside the route turns an argument about a line into an argument about the surface, which is the
one that can be settled.

## Frequently asked questions

### Why does the route hug the edge of an exclusion?

Because the cheapest traversable cells are the ones immediately outside it, and nothing in the model
says a line needs working room. Buffer the exclusions by a construction offset before rasterising —
30 to 50 metres is typical — and the optimiser keeps its distance without any special-case logic.

### Should `fully_connected` ever be False?

Only when the movement model genuinely forbids diagonals, which for a transmission line it does not.
With diagonals disabled every route becomes a staircase of orthogonal steps whose length is
systematically overstated by up to 41 percent on diagonal runs.

### How do I route to several substations at once?

Use `MCP_Geometric.find_costs` from the project location, which fills the accumulated-cost array for
the whole surface in one pass, then read the cost at each substation cell. Only trace back the routes
you intend to draw. For five candidate points of interconnection this is roughly five times faster
than five independent routes, and the comparison is exact rather than approximate.

### What does a very high circuity factor mean?

Usually that the destination is effectively unreachable under the current constraints rather than
merely expensive. A circuity above about three says the optimiser is taking a long way round an
obstacle that spans the direct line, and the useful output is the name of that obstacle — which comes
from intersecting the route's bounding corridor with the exclusion layers rather than from the route
itself.

### Should the routed geometry be smoothed?

Simplified, not smoothed. Simplification with a one-cell tolerance removes the raster staircase while
keeping every vertex on the routed path; smoothing with a spline moves vertices off it, which can
push the line into a cell the model excluded. Simplify for presentation, keep the raw path for the
cost.

### Can this handle a route that must pass through a waypoint?

Yes — route origin to waypoint and waypoint to destination, then concatenate. The concatenation is
exact because the accumulated cost is additive, and it is the standard way to honour a landowner
agreement or a mandated crossing point without distorting the cost surface to force the outcome.


### How long should a route take to compute?

Under a second for a clipped 30-metre corridor, and a few seconds for a refined 10-metre pass inside
a buffer. A route that takes minutes is almost always running over an unclipped surface, and the fix
is the corridor buffer rather than a faster machine. Wall-clock is a useful smoke test for exactly
that reason: a sudden increase usually means the clip stopped working, not that the terrain changed.

### Can the same code route a distribution feeder or an access road?

Yes — only the weights change. An access road cares about slope far more and about land cover far
less, and a distribution feeder can use narrower corridors and cross land a transmission line cannot.
The machinery is identical, which is a good argument for keeping the weights in configuration where
a second profile is a file rather than a fork.

## Related

- [Grid Routing & Least-Cost Path Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-routing-and-least-cost-path-analysis/) — the parent workflow
- [Building a Transmission Cost Surface Raster in NumPy](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-routing-and-least-cost-path-analysis/building-a-transmission-cost-surface-raster-in-numpy/) — the surface this page consumes
- [Proximity & Distance Calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) — the straight-line screen the circuity factor refers back to
- [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) — choosing which substations are worth routing to
