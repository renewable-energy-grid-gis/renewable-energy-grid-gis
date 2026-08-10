---
title: Proximity Distance Calculations
description: A production-grade Python workflow for grid proximity distance calculations — projected-CRS enforcement, R-tree spatial indexing to escape O(N×M) scaling, memory-chunked batch scoring, async network-constrained routing, and audit-ready feasibility output.
slug: proximity-distance-calculations
type: guide
breadcrumb: Proximity Distance Calculations
datePublished: 2025-09-12
dateModified: 2026-06-26
---

# Proximity Distance Calculations

Proximity distance calculations are the primary feasibility filter for renewable interconnection projects, and they sit at the analytical core of the [Grid Infrastructure & Network Proximity Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/) pipeline. The specific failure mode this page addresses is **pairwise O(N×M) proximity scaling**: the moment a screening workflow tries to answer "how far is each candidate site from the nearest grid asset?" by looping every one of N candidate generation sites against every one of M transmission features, the run time and memory footprint explode. Fifty thousand sites against a few hundred thousand line segments is two-and-a-half billion distance evaluations — a calculation that finishes in a notebook demo at toy scale and never returns on a continental portfolio. The naive script does not raise an error; it simply hangs, gets killed by the out-of-memory reaper, or quietly returns distances that are wrong by the cosine of the latitude because the geometries were never projected.

This page builds a deterministic proximity-scoring workflow that turns raw asset and candidate geometries into audit-ready feasibility scores. It follows the order the data actually travels: inputs are forced into a projected coordinate frame and topologically validated, the search space is pruned with an R-tree spatial index before any precise geometric operation runs, distances are computed in bounded memory chunks, network-constrained corridors are resolved asynchronously where straight-line distance is meaningless, and every output row carries the capacity and regulatory flags an interconnection queue submission needs. Raw Euclidean metrics are only the starting point — terrain, right-of-way limits, and regulatory setbacks all bend the real interconnection cost away from the straight line.

## Why Naive Distance Calculations Fail

The brute-force approach fails for four compounding reasons, and only one of them reliably raises an exception at the point of error.

First, **projected-distance error**. Geographic coordinate systems such as [EPSG:4326](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) express position in decimal degrees, and Shapely's `geometry.distance()` operates in planar Cartesian space. Call `site.distance(line)` on unprojected lon/lat and you get a number in degrees that mixes a longitudinal axis whose metric value collapses toward the poles with a latitudinal axis that does not — the result is not off by a rounding error, it is off by a latitude-dependent scale factor. Every distance must be computed in a projected frame whose units are meters, which is exactly the [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) discipline the rest of the pipeline depends on.

Second, **quadratic search-space blow-up**. A direct double loop is

$$T_\text{naive} = O(N \times M)$$

distance evaluations. An R-tree spatial index reduces a nearest-feature query to roughly

$$T_\text{indexed} = O(N \log M)$$

by pruning every grid feature whose bounding box cannot possibly contain the nearest geometry before a single exact distance is measured. On a 50,000 × 300,000 problem that is the difference between billions of operations and tens of millions.

Third, **memory spike**. Materializing a dense N×M distance matrix — or calling `unary_union` on an entire national transmission layer at once — allocates gigabytes that the host never reclaims inside a long-running batch. Bounded chunking with explicit cleanup keeps the resident set flat regardless of portfolio size.

Fourth, **async latency on network-constrained legs**. When a straight line is meaningless — a candidate separated from the grid by a ridge, a protected wetland, or a missing right-of-way — the real distance comes from a routing service or a cost-surface solver. Issuing those calls synchronously, one site at a time, serializes thousands of independent I/O waits into an unusable wall-clock time.

<svg viewBox="0 0 1080 470" role="img" aria-label="Proximity scoring decision flow: raw lon/lat geometries are normalized to a projected CRS, the search space is pruned with an R-tree bounding-box query, exact distances are measured on the pruned subset, then a branch checks whether the straight-line path is obstructed — obstructed legs go through async network routing, clear legs go straight to capacity and regulatory flags, and both converge on an audit-ready feasibility score. Two warning callouts mark the failure modes each stage prevents: unprojected CRS yielding degrees instead of metres, and a dense N by M distance matrix exhausting memory." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="1080" height="470"/>
  <title>Proximity distance scoring pipeline with branch for obstructed legs</title>
  <desc>A flow that moves raw lon/lat geometries through projected-CRS normalization, an R-tree bounding-box prune, and exact distance measurement on the pruned subset, then branches on whether the straight-line path is obstructed: obstructed legs resolve through async network routing while clear legs pass directly to capacity and regulatory flags, both converging on an audit-ready feasibility score. Amber callouts mark the failure each guarded stage avoids — unprojected CRS returning degrees not metres, and a dense N by M distance matrix blowing up memory.</desc>
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
  <!-- Row 1: linear backbone -->
  <g>
    <rect class="stage" x="30"  y="50" width="200" height="84" rx="10"/>
    <rect class="stage" x="270" y="50" width="200" height="84" rx="10"/>
    <rect class="stage" x="510" y="50" width="200" height="84" rx="10"/>
    <rect class="stage" x="750" y="50" width="200" height="84" rx="10"/>
  </g>
  <g class="lbl" font-size="13.5">
    <text x="130" y="87">Raw lon/lat</text><text x="130" y="105">geometries</text>
    <text x="370" y="87">Projected-CRS</text><text x="370" y="105">normalization</text>
    <text x="610" y="87">R-tree</text><text x="610" y="105">bbox prune</text>
    <text x="850" y="87">Exact distance on</text><text x="850" y="105">pruned subset</text>
  </g>
  <!-- backbone arrows -->
  <g class="edge">
    <line x1="230" y1="92" x2="262" y2="92"/><path class="ehead" d="M262 87 L270 92 L262 97 Z"/>
    <line x1="470" y1="92" x2="502" y2="92"/><path class="ehead" d="M502 87 L510 92 L502 97 Z"/>
    <line x1="710" y1="92" x2="742" y2="92"/><path class="ehead" d="M742 87 L750 92 L742 97 Z"/>
  </g>
  <!-- warning callouts (failure each stage prevents) -->
  <g>
    <rect class="warn" x="270" y="178" width="200" height="54" rx="9"/>
    <rect class="warn" x="510" y="178" width="200" height="54" rx="9"/>
  </g>
  <g class="lbl" font-size="12">
    <text x="370" y="200">Unprojected CRS &#8594;</text><text x="370" y="217">degrees, not metres</text>
    <text x="610" y="200">Dense N&#215;M matrix &#8594;</text><text x="610" y="217">memory blow-up</text>
  </g>
  <g class="dash">
    <line x1="370" y1="134" x2="370" y2="176"/>
    <line x1="610" y1="134" x2="610" y2="176"/>
  </g>
  <g class="tag" font-size="9.5" font-weight="700" letter-spacing="0.6">
    <text x="370" y="160">PREVENTS</text>
    <text x="610" y="160">PREVENTS</text>
  </g>
  <!-- drop from backbone into decision -->
  <g class="edge">
    <line x1="850" y1="134" x2="850" y2="250"/><path class="ehead" d="M845 250 L850 258 L855 250 Z"/>
  </g>
  <!-- decision diamond -->
  <polygon class="warn" points="850,258 922,300 850,342 778,300"/>
  <g class="lbl" font-size="12.5">
    <text x="850" y="297">Path</text><text x="850" y="314">obstructed?</text>
  </g>
  <!-- Row 2: compliance + success + async branch -->
  <rect class="good"  x="30"  y="258" width="200" height="84" rx="10"/>
  <rect class="stage" x="440" y="258" width="200" height="84" rx="10"/>
  <rect class="stage" x="440" y="380" width="200" height="54" rx="10"/>
  <g class="lbl">
    <g font-size="13.5">
      <text x="130" y="295">Audit-ready</text><text x="130" y="313">feasibility score</text>
      <text x="540" y="295">Capacity &amp;</text><text x="540" y="313">regulatory flags</text>
    </g>
    <text x="540" y="412" font-size="12.5">Async network routing</text>
  </g>
  <!-- branch edges -->
  <g class="edge">
    <!-- No: straight line OK -> compliance -->
    <line x1="778" y1="300" x2="648" y2="300"/><path class="ehead" d="M648 295 L640 300 L648 305 Z"/>
    <!-- Yes: obstructed -> async -->
    <line x1="850" y1="342" x2="850" y2="407"/><line x1="850" y1="407" x2="648" y2="407"/><path class="ehead" d="M648 402 L640 407 L648 412 Z"/>
    <!-- async routed distance -> compliance -->
    <line x1="540" y1="380" x2="540" y2="350"/><path class="ehead" d="M535 350 L540 342 L545 350 Z"/>
    <!-- compliance -> feasibility score -->
    <line x1="440" y1="300" x2="238" y2="300"/><path class="ehead" d="M238 295 L230 300 L238 305 Z"/>
  </g>
  <g class="tag" font-size="11">
    <text x="709" y="292">No</text>
    <text x="700" y="430">Yes</text>
    <text x="592" y="365">routed dist.</text>
  </g>
  <text x="540" y="458" class="tag" font-size="11.5">Every row carries its CRS, thresholds, and timestamp so each score is independently reproducible.</text>
</svg>

## Prerequisites & Data Requirements

This workflow assumes the following inputs and environment:

- **Candidate sites** as a `GeoDataFrame` of `Point` (parcel centroids or proposed array centers) with a defined, non-null CRS. Land-cover and parcel preprocessing should already have passed through [spatial data quality validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/).
- **Grid assets** as a `GeoDataFrame` of `LineString`/`MultiLineString` conductors and `Point` substations, with `voltage_kv` and `available_capacity_mw` attributes confirmed by [Network Attribute Validation](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/). The geometry itself should originate from validated [Transmission Line & Substation Mapping](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/) so distances reference real conductor corridors, not simplified centerlines.
- A **projected target CRS** chosen for the region of interest. For a single UTM zone, EPSG:32610 (UTM 10N) or the appropriate state plane code preserves meter-level distance; a multi-state portfolio needs an equal-area or equidistant conic projection — see the projection-choice walkthrough in [aligning EPSG:4326 and EPSG:3857 for solar site mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/how-to-align-epsg4326-and-epsg3857-for-solar-site-mapping/).
- Library versions: `geopandas >= 0.14`, `shapely >= 2.0` (vectorized predicates and `union_all`), `pyproj >= 3.4`. The `sindex.query` two-array return signature used below requires Shapely 2.x.

CRS choice is not cosmetic. Using the web-mercator EPSG:3857 frame for distance work introduces scale error that grows with latitude — acceptable for tiles, unacceptable for a 500 m regulatory setback test.

## Core Implementation

The happy path is two stages: normalize and validate every input to the projected frame, then score proximity in memory-bounded chunks using the spatial index to prune before measuring.

```python
import geopandas as gpd
import numpy as np
from shapely.validation import make_valid


def normalize_and_validate(
    gdf: gpd.GeoDataFrame, target_epsg: int = 32610
) -> gpd.GeoDataFrame:
    """
    Validate topology and transform a GeoDataFrame to a projected CRS (meters).
    Repairs invalid rings before projection so a single bad geometry cannot
    abort an overnight batch with no traceable cause.
    """
    if gdf.crs is None:
        raise ValueError("Input GeoDataFrame must have a defined CRS (e.g. EPSG:4326).")

    gdf = gdf.copy()
    # Repair self-intersections and invalid rings prior to projection
    gdf.geometry = gdf.geometry.apply(
        lambda geom: make_valid(geom) if not geom.is_valid else geom
    )

    # Explicit transformation into a projected (meter) frame
    gdf = gdf.to_crs(epsg=target_epsg)

    # Drop empties/invalids introduced by repair or transformation
    valid_mask = gdf.geometry.is_valid & ~gdf.geometry.is_empty
    return gdf[valid_mask].reset_index(drop=True)
```

With both layers in the same projected frame, the scoring loop queries the R-tree index for each chunk of sites, dissolves only the pruned grid subset, and measures exact distances against that small union:

```python
import pandas as pd
from typing import Generator


def chunked_proximity_scores(
    sites_gdf: gpd.GeoDataFrame,
    grid_gdf: gpd.GeoDataFrame,
    chunk_size: int = 5000,
    search_radius_m: float = 25_000.0,
) -> Generator[pd.DataFrame, None, None]:
    """
    Yield nearest-grid distances in memory-bounded chunks, pruning the search
    space with an R-tree before any exact distance is computed.

    search_radius_m bounds the candidate set per site; sites with no grid
    feature inside the radius are reported as +inf rather than forcing a
    full-layer union.
    """
    grid_gdf = grid_gdf.copy()
    grid_gdf["geometry"] = grid_gdf.geometry.buffer(0)  # cheap topology fix
    grid_sindex = grid_gdf.sindex

    for start in range(0, len(sites_gdf), chunk_size):
        chunk = sites_gdf.iloc[start:start + chunk_size].copy()

        # Bounding-box pre-filter: query each site's search envelope (Shapely 2.x)
        envelopes = chunk.geometry.buffer(search_radius_m)
        site_pos, grid_pos = grid_sindex.query(envelopes, predicate="intersects")

        distances = np.full(len(chunk), np.inf, dtype="float64")
        # Group candidate grid features per site position, then measure exactly
        for s in np.unique(site_pos):
            site_geom = chunk.geometry.iloc[s]
            candidate_idx = grid_pos[site_pos == s]
            candidates = grid_gdf.geometry.iloc[candidate_idx]
            distances[s] = candidates.distance(site_geom).min()

        yield pd.DataFrame({
            "site_id": chunk.index.to_numpy(),
            "nearest_grid_distance_m": distances,
        })

        del chunk, envelopes, site_pos, grid_pos  # keep the resident set flat
```

The `search_radius_m` envelope is what keeps the pruned subset small: it bounds the bounding-box query so dense corridors do not degenerate back toward the pairwise case, and it makes "no grid within reach" an explicit `inf` result rather than an exception.

## Error Handling & Edge Cases

Each of the failure modes named above has a concrete guard.

<svg viewBox="0 0 940 396" role="img" aria-label="Why the tail of the circuity distribution exists. A candidate site 8.2 kilometres from its point of interconnection in a straight line has a river, a designated wildlife corridor and a rail crossing between it and the substation. The routable path leaves at a bearing 40 degrees off the direct line, crosses at the existing bridge, and runs 14.6 kilometres — a circuity factor of 1.78 that no straight-line screen can see." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>One obstructed leg: 8.2 km as the crow flies, 14.6 km as the line must run</title>
  <desc>A plan view with the candidate site at the lower left and the substation at the upper right. A dashed straight line between them is annotated 8.2 kilometres. Between them lie three obstacles: a river running north to south, a shaded wildlife corridor, and a rail line. The routable path leaves the site heading north, follows the river to an existing bridge crossing, skirts the southern edge of the wildlife corridor, and approaches the substation from the west; it is annotated 14.6 kilometres, a circuity factor of 1.78.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="ob-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The straight line is 8.2 km; nothing can be built along it</text>
  <rect x="40" y="56" width="860" height="268" rx="6" fill="none" stroke="currentColor" stroke-width="1" opacity="0.25"/>
  <path d="M300,56 C330,120 280,180 320,240 C348,282 330,306 340,324" fill="none" stroke="#5BA8C8" stroke-width="8" opacity="0.45"/>
  <text x="258" y="100" text-anchor="middle" font-size="11" fill="#2C6E8F" font-weight="700">river</text>
  <rect x="470" y="90" width="300" height="96" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4" opacity="0.6"/>
  <text x="620" y="126" text-anchor="middle" font-size="11.5" fill="#1F5C3A" font-weight="700">designated wildlife corridor</text>
  <text x="620" y="146" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">no new linear infrastructure</text>
  <line x1="420" y1="324" x2="900" y2="232" stroke="currentColor" stroke-width="2.4" stroke-dasharray="9 5" opacity="0.35"/>
  <text x="700" y="300" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">rail line</text>
  <circle cx="120" cy="280" r="8" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <text x="120" y="306" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">candidate site</text>
  <circle cx="846" cy="100" r="8" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="846" y="82" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">substation</text>
  <line x1="128" y1="276" x2="838" y2="106" stroke="currentColor" stroke-width="1.6" stroke-dasharray="6 4" opacity="0.7"/>
  <text x="430" y="208" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">8.2 km straight line</text>
  <path d="M124,272 L150,190 L246,166 L318,150 L392,196 L470,214 L560,214 L664,196 L760,150 L838,108" fill="none" stroke="#F4A261" stroke-width="2.8"/>
  <text x="300" y="132" text-anchor="middle" font-size="11.5" fill="#7A4A1A" font-weight="700">routable path 14.6 km · circuity 1.78</text>
  <rect x="40" y="340" width="424" height="48" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="252.0" y="361" text-anchor="middle" font-size="11.5" fill="currentColor">A straight-line screen ranks this site third;</text>
  <text x="252.0" y="378" text-anchor="middle" font-size="11.5" fill="currentColor">the routed cost ranks it eleventh</text>
  <rect x="480" y="340" width="420" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="690.0" y="361" text-anchor="middle" font-size="11.5" fill="currentColor">Route only the shortlist — routing every</text>
  <text x="690.0" y="378" text-anchor="middle" font-size="11.5" fill="currentColor">candidate is what makes screening slow</text>
</svg>

**Unprojected or mismatched CRS.** The single most common silent corruption. Assert that both layers share the projected target frame before scoring — never compute distance across a CRS boundary:

```python
def assert_projected_meters(*gdfs: gpd.GeoDataFrame, expected_epsg: int = 32610) -> None:
    for g in gdfs:
        if g.crs is None:
            raise ValueError("Geometry has no CRS; distances would be undefined.")
        if g.crs.to_epsg() != expected_epsg:
            raise ValueError(
                f"CRS {g.crs.to_epsg()} != target EPSG:{expected_epsg}; "
                "distances must be computed in a single projected (meter) frame."
            )
        if g.crs.is_geographic:
            raise ValueError(
                "Geographic CRS detected — distance() would return degrees, not meters."
            )
```

**Sites with no grid feature in range.** Returning `inf` (as the scorer does) is correct, but downstream code must treat it as "infeasible," not coerce it to a real distance. Tag and partition these rather than dropping them silently — an interconnection screen needs to report *why* a site failed.

**Obstructed straight-line paths.** Where a candidate is separated from the grid by terrain or an exclusion zone, the Euclidean nearest distance understates the true interconnection length. Flag any site whose nearest asset lies across a known barrier layer for re-routing in the network-constrained stage below, and never let a straight-line distance silently stand in for a routed one in the feasibility score.

## Performance & Scalability — Network-Constrained Routing

For obstructed legs, the real distance comes from a routing service or a Dijkstra solve over a rasterized impedance surface. These are I/O- and compute-bound and must run concurrently. The pattern below dispatches routing requests asynchronously while validating each spatial input before the call, and preserves order so results align with the input sites:

<svg viewBox="0 0 940 400" role="img" aria-label="Why a straight-line distance is a screen and not an answer. Across 1,200 sited interconnections the ratio of routed length to straight-line length — the circuity factor — has a median of 1.28 and a long tail: a quarter of sites exceed 1.45 and the worst 5 percent exceed 1.9, where a river crossing or a protected corridor forces a long detour. A 10 kilometre straight line is therefore a 12.8 kilometre route at the median and a 19 kilometre route in the tail." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Routed length divided by straight-line length, across 1,200 sites</title>
  <desc>A histogram of the circuity factor over 1,200 sited interconnections, binned from 1.0 to 2.2. The distribution peaks between 1.2 and 1.3, with a median marked at 1.28, a seventy-fifth percentile at 1.45 and a ninety-fifth percentile at 1.9. Annotations translate the percentiles into route length for a 10 kilometre straight line: 12.8 kilometres at the median, 14.5 at the seventy-fifth percentile and 19 in the tail, where a river crossing or protected corridor forces the detour.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="cf-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Straight-line distance screens candidates; routed distance prices them</text>
  <line x1="76" y1="268" x2="900" y2="268" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="76" y1="70" x2="76" y2="268" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <rect x="90" y="248.8" width="64" height="19.200000000000003" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="122.0" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1.0</text>
  <rect x="162" y="197.60000000000002" width="64" height="70.39999999999999" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="194.0" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1.1</text>
  <rect x="234" y="95.19999999999999" width="64" height="172.8" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="266.0" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1.2</text>
  <rect x="306" y="114.39999999999998" width="64" height="153.60000000000002" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="338.0" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1.3</text>
  <rect x="378" y="172.0" width="64" height="96.0" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="410.0" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1.4</text>
  <rect x="450" y="216.8" width="64" height="51.2" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="482.0" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1.5</text>
  <rect x="522" y="236.0" width="64" height="32.0" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="554.0" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1.6</text>
  <rect x="594" y="248.8" width="64" height="19.200000000000003" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="626.0" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1.7</text>
  <rect x="666" y="255.2" width="64" height="12.8" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="698.0" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1.8</text>
  <rect x="738" y="259.04" width="64" height="8.959999999999999" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="770.0" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1.9</text>
  <rect x="810" y="264.16" width="64" height="3.84" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="842.0" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">2.0</text>
  <text x="70" y="80" text-anchor="end" font-size="11" fill="currentColor" opacity="0.8">% of sites</text>
  <line x1="291.6" y1="70" x2="291.6" y2="268" stroke="#3D8B5F" stroke-width="1.6" stroke-dasharray="5 4"/>
  <text x="299.6" y="84" text-anchor="start" font-size="11" fill="#1F5C3A" font-weight="700">median 1.28 → 12.8 km</text>
  <line x1="414.0" y1="100" x2="414.0" y2="268" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.6"/>
  <text x="422.0" y="116" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">75th 1.45 → 14.5 km</text>
  <line x1="738" y1="132" x2="738" y2="268" stroke="#F4A261" stroke-width="1.4" stroke-dasharray="4 4"/>
  <text x="730" y="148" text-anchor="end" font-size="11" fill="#7A4A1A" font-weight="700">95th 1.9 → 19 km</text>
  <text x="90" y="312" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.8">routed length ÷ straight-line length</text>
  <rect x="90" y="322" width="400" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="290.0" y="343" text-anchor="middle" font-size="11.5" fill="currentColor">Screen on straight-line distance — it is cheap</text>
  <text x="290.0" y="360" text-anchor="middle" font-size="11.5" fill="currentColor">and never under-states the route</text>
  <rect x="506" y="322" width="394" height="48" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="703.0" y="343" text-anchor="middle" font-size="11.5" fill="currentColor">Price on routed distance — the tail is where</text>
  <text x="703.0" y="360" text-anchor="middle" font-size="11.5" fill="currentColor">a project quietly stops penciling</text>
</svg>

```python
import asyncio
import aiohttp
from shapely.geometry import Point
from typing import List, Tuple


async def resolve_network_distances(
    site_coords: List[Tuple[float, float]],
    routing_endpoint: str,
    session: aiohttp.ClientSession,
    max_concurrency: int = 32,
) -> List[float]:
    """
    Concurrently fetch network-constrained distances for obstructed sites.
    Validates each geometry before dispatch and bounds concurrency so a large
    portfolio does not exhaust the routing service or local sockets.
    """
    sem = asyncio.Semaphore(max_concurrency)

    async def _fetch(site: Point) -> float:
        if not site.is_valid:
            raise ValueError(f"Invalid site geometry: {site.wkt}")
        payload = {"origin": [site.x, site.y], "mode": "grid_tie"}
        async with sem:
            async with session.post(routing_endpoint, json=payload) as resp:
                resp.raise_for_status()
                data = await resp.json()
                return float(data.get("distance_m", float("inf")))

    tasks = [_fetch(Point(x, y)) for x, y in site_coords]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Failed legs degrade to +inf (infeasible) while preserving input order
    return [r if isinstance(r, float) else float("inf") for r in results]
```

Additional scaling levers for continental runs:

- **Build the index once.** Construct `grid_gdf.sindex` a single time and reuse it across every chunk; rebuilding per chunk reintroduces the cost the index was meant to remove.
- **Tune `chunk_size` to the host.** Larger chunks amortize per-call overhead but raise the peak resident set; size it against the worker's memory budget, not a fixed default.
- **Bound concurrency, not just parallelism.** The `Semaphore` ceiling protects the routing endpoint and local socket pool — unbounded `gather` over 50,000 sites is its own outage.
- **Spatially partition the portfolio.** Process geographically contiguous tiles so each chunk's pruned grid subset stays small and cache-local.

## Validation & Audit Trail

A distance is only a feasibility input once it is reconciled against capacity and regulatory constraints. The final stage cross-references each distance against [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) thresholds and applies the minimum environmental setback, then emits a bounded score plus the flags an interconnection or permitting reviewer needs:

```python
def apply_compliance_filters(
    proximity_df: pd.DataFrame,
    capacity_threshold_km: float = 15.0,
    regulatory_setback_m: float = 500.0,
) -> pd.DataFrame:
    """
    Reconcile raw proximity against capacity reach and regulatory setback,
    returning a 0-100 feasibility score with explicit, auditable flags.
    """
    df = proximity_df.copy()
    reach_m = capacity_threshold_km * 1000.0

    # Within interconnection reach of a viable asset?
    df["capacity_viable"] = df["nearest_grid_distance_m"] <= reach_m
    # Beyond the minimum regulatory/environmental setback?
    df["regulatory_compliant"] = df["nearest_grid_distance_m"] >= regulatory_setback_m

    # Distance-efficiency score, zeroed when either constraint is violated
    df["feasibility_score"] = np.where(
        df["capacity_viable"] & df["regulatory_compliant"],
        100.0 * (1.0 - (df["nearest_grid_distance_m"] / reach_m)),
        0.0,
    ).clip(0.0, 100.0)

    # Lineage so a reviewer can reproduce the verdict
    df["capacity_threshold_km"] = capacity_threshold_km
    df["regulatory_setback_m"] = regulatory_setback_m
    df["audit_timestamp"] = pd.Timestamp.utcnow().isoformat()
    return df
```

The `capacity_threshold_km`, `regulatory_setback_m`, and `audit_timestamp` columns are not decorative — they are the provenance that lets a screening result be independently re-run and arrive at the same verdict. A feasibility score without the thresholds and timestamp that produced it is a number a reviewer has no basis to trust.

At production scale, treat the whole sequence as a deterministic, auditable pipeline rather than an ad-hoc script: enforce schema validation on incoming GeoJSON/Parquet payloads, emit structured logs for every CRS assertion and `inf`-distance partition, and containerize the async workers to isolate routing-I/O bottlenecks. That discipline is what lets energy developers and GIS engineers scale interconnection feasibility studies across multi-state portfolios while staying inside regional grid codes and environmental permitting standards.


## Frequently asked questions

### Is geodesic distance worth the cost over projected distance?

Rarely, inside a study area. A well-chosen projected frame agrees with the geodesic answer to within
a few parts per ten thousand over the tens of kilometres an interconnection study spans, and the
projected calculation is vectorised while the geodesic one is not. Geodesic distance earns its cost
when the pairs span continental distances or cross zone boundaries — a portfolio-level "nearest
substation anywhere in the country" query, not a county screen.

### How should obstructed routes be handled in a first-pass screen?

By flagging them, not by routing them. Compute straight-line distance for everything, then mark the
legs whose straight line crosses a river, a protected corridor or a rail line, and carry a
provisional circuity multiplier for those. Routing is an order of magnitude more expensive per leg
and is the right tool for the shortlist, not the population — and a flagged leg is far more useful
to a developer than a silently optimistic straight line.

### What distance should a screen use when the point of interconnection is unknown?

The distance to the nearest point on the nearest suitable circuit, with the suitability filter
stated. That is not the same as the distance to the nearest substation, and the difference decides
whether the project is a tap or a node interconnection — a distinction with a large cost
consequence. Where neither is known, report both and let the ranking carry both columns rather than
collapsing them into one number.

### Why does the screen return a nearest substation that is obviously wrong?

Almost always because the query ran against a reference set that was not filtered to serviceable
assets: a decommissioned yard, a distribution-class node below the project's voltage, or a duplicate
record from a second dataset. The geometry is doing exactly what it was asked. Filter the reference
set by status and voltage class before building the index, and the same query returns a defensible
answer.


### How should distances be reported — to the asset or to its boundary?

To the boundary of a polygon asset and to the point for a node, stated explicitly either way. A
substation mapped as a yard polygon is several hundred metres across, so "distance to the substation"
differs by that much depending on which convention is used — enough to reorder a shortlist of
similar candidates. Fix the convention once, name it in the output column, and apply it everywhere.

## Related

- [Grid Infrastructure & Network Proximity Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/) — the parent pipeline this proximity-scoring stage belongs to.
- [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) — the capacity-reach thresholds the feasibility filter reconciles against.
- [Transmission Line & Substation Mapping](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/) — the validated asset geometry these distances are measured to.
- [Network Attribute Validation](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/) — schema enforcement for the voltage and capacity attributes the screen keys off.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — the projected-frame selection every distance calculation depends on.
- [Calculating 5 km Proximity Buffers Around Substations in Shapely](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/calculating-5km-proximity-buffers-around-substations-in-shapely/) — the single-asset walkthrough of the projected-distance failure mode.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "Compute Audit-Ready Grid Proximity Distances in Python",
  "description": "A deterministic geopandas workflow for grid proximity distance calculations: projected-CRS enforcement, R-tree spatial indexing to escape O(N×M) scaling, memory-chunked batch scoring, async network-constrained routing, and lineage-tagged feasibility output.",
  "step": [
    { "@type": "HowToStep", "position": 1, "name": "Normalize & Validate Geometries to a Projected CRS", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/#core-implementation" },
    { "@type": "HowToStep", "position": 2, "name": "Score Proximity in Memory-Bounded Chunks with an R-tree Index", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/#core-implementation" },
    { "@type": "HowToStep", "position": 3, "name": "Resolve Obstructed Legs with Async Network-Constrained Routing", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/#performance-scalability-network-constrained-routing" },
    { "@type": "HowToStep", "position": 4, "name": "Reconcile Against Capacity & Regulatory Constraints and Tag Lineage", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/#validation-audit-trail" }
  ]
}
</script>
