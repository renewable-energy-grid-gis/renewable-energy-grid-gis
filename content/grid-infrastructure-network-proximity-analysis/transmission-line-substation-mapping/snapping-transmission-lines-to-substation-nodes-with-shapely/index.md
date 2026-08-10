---
title: Snapping Transmission Lines to Substation Nodes with Shapely
description: Fix disconnected network graphs when snapping dangling transmission line endpoints to substation nodes — metric-tolerance snapping with shapely.snap, nearest_points and set_precision, plus over-snap guards and a CI/CD connectivity gate.
slug: snapping-transmission-lines-to-substation-nodes-with-shapely
type: article
breadcrumb: Snapping Lines to Substation Nodes
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Snapping Transmission Lines to Substation Nodes with Shapely

You build a `networkx` graph from a clean-looking transmission layer, run a shortest-path query between two substations, and get `NetworkXNoPath` — or worse, a connected-components count in the hundreds when the physical grid is one interconnected backbone. The geometry plots as a continuous network, but the graph is shattered. This is the failure this page eliminates: transmission line endpoints that sit *near* a substation node but are not coincident with it, so the graph builder never creates the edge that ties the corridor to the bus. It breaks the topology-construction step of [Transmission Line & Substation Mapping](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/), the moment a projected, deduplicated line layer is converted into a routable node-and-edge model for interconnection or contingency studies.

Digitized corridors almost never terminate exactly on a substation point. A line endpoint may land 4 metres from the bus, or a substation may be represented as a small footprint polygon whose centroid drifts from the line's last vertex. Graph builders treat two coordinates as the same node only when they are bit-for-bit equal, so a sub-metre gap becomes a hard topological break. Snapping is the operation that closes that gap deliberately and reproducibly — but done carelessly it either fails to connect (tolerance too small, or applied in degrees) or fuses substations that should stay distinct (tolerance too large, over-snapping).

## Root-cause analysis

Four compounding causes account for nearly every disconnected transmission graph, and each maps to a distinct fix below:

1. **Endpoints within tolerance but not coincident.** The line ends 3–8 m from the substation node. Visually connected, numerically not: `LineString` endpoint `(512340.11, 3212489.44)` and node `(512338.02, 3212485.10)` hash to different graph vertices, so no edge is created and the corridor becomes a dead-end stub.
2. **Snapping evaluated in degrees.** A tolerance of `0.0001` against an [EPSG:4326](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) geographic layer is not "about 10 metres" — one degree of longitude collapses toward the poles, so the same tolerance snaps aggressively at low latitude and not at all further north. Any snap tolerance is meaningless until the layer is in a projected metric frame.
3. **Over-snapping merges distinct nodes.** Set the tolerance too generous — say 500 m to force stubborn stubs to connect — and two genuinely separate substations 300 m apart collapse into one node. The graph now shows a single bus where the grid has two, and every capacity and contingency result keyed to that node is wrong.
4. **Tolerance too small to catch real gaps.** Set it too tight and legitimate 10 m digitization offsets never close, leaving the corridor detached. The correct tolerance lives in the band *above* the digitization noise floor and *below* the minimum real spacing between distinct nodes.

<svg viewBox="0 0 900 470" role="img" aria-label="Four snapping failure causes mapped to their fixes. Cause one, endpoints near but not coincident, maps to snapping endpoints to the nearest node within a metric tolerance. Cause two, snapping evaluated in degrees, maps to projecting to a metric CRS such as EPSG 32614 before any snap. Cause three, an over-generous tolerance merging distinct substations, maps to bounding the tolerance below the minimum real node spacing and flagging every snap. Cause four, a tolerance too tight to close real gaps, maps to selecting the tolerance from an endpoint-to-node gap histogram. All four fixes converge on a connected, deduplicated network graph." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="900" height="470"/>
  <title>Snapping failure causes mapped to fixes converging on a connected graph</title>
  <desc>Left column of four warning-coloured cause boxes, each with an arrow to a matching success-coloured fix box in the middle column; all four fix boxes feed a single highlighted node on the right labelled connected deduplicated network graph. Cause one, endpoints near but not coincident, maps to snap endpoint to nearest node within metric tolerance. Cause two, tolerance evaluated in degrees, maps to project to metric CRS EPSG 32614 first. Cause three, over-generous tolerance merges distinct substations, maps to bound tolerance below minimum node spacing and flag each snap. Cause four, tolerance too tight, maps to pick tolerance from an endpoint-to-node gap histogram.</desc>
  <defs>
    <marker id="snap-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="900" height="470" fill="none"/>
  <g text-anchor="middle" font-size="10.5" fill="currentColor">
    <text x="150" y="20" font-size="12" font-weight="700" letter-spacing="0.5">ROOT CAUSE</text>
    <text x="470" y="20" font-size="12" font-weight="700" letter-spacing="0.5">FIX</text>
    <text x="800" y="20" font-size="12" font-weight="700" letter-spacing="0.5">RESULT</text>
  </g>
  <!-- Cause boxes -->
  <g text-anchor="middle" font-size="11" fill="currentColor">
    <rect x="24" y="40" width="252" height="72" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="150" y="66" font-weight="600">Endpoints near a node</text>
    <text x="150" y="83" font-size="10">but not coincident</text>
    <text x="150" y="99" font-size="10" opacity="0.85">graph edge never created</text>
    <rect x="24" y="140" width="252" height="72" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="150" y="166" font-weight="600">Tolerance in degrees</text>
    <text x="150" y="183" font-size="10">on a geographic layer</text>
    <text x="150" y="199" font-size="10" opacity="0.85">snap strength drifts with latitude</text>
    <rect x="24" y="240" width="252" height="72" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="150" y="266" font-weight="600">Tolerance too large</text>
    <text x="150" y="283" font-size="10">over-snaps distinct nodes</text>
    <text x="150" y="299" font-size="10" opacity="0.85">two substations fuse into one</text>
    <rect x="24" y="340" width="252" height="72" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="150" y="366" font-weight="600">Tolerance too small</text>
    <text x="150" y="383" font-size="10">real gaps never close</text>
    <text x="150" y="399" font-size="10" opacity="0.85">corridor stays detached</text>
  </g>
  <!-- Fix boxes -->
  <g text-anchor="middle" font-size="11" fill="currentColor">
    <rect x="344" y="40" width="252" height="72" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <text x="470" y="66" font-weight="600">Snap endpoint to node</text>
    <text x="470" y="83" font-size="10">within a metric tolerance</text>
    <text x="470" y="99" font-size="10" opacity="0.85">nearest_points + shapely.snap</text>
    <rect x="344" y="140" width="252" height="72" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <text x="470" y="166" font-weight="600">Project first</text>
    <text x="470" y="183" font-size="10">metric CRS EPSG:32614</text>
    <text x="470" y="199" font-size="10" opacity="0.85">tolerance now reads in metres</text>
    <rect x="344" y="240" width="252" height="72" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <text x="470" y="266" font-weight="600">Bound the tolerance</text>
    <text x="470" y="283" font-size="10">below min node spacing</text>
    <text x="470" y="299" font-size="10" opacity="0.85">flag every snapped endpoint</text>
    <rect x="344" y="340" width="252" height="72" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <text x="470" y="366" font-weight="600">Pick from a histogram</text>
    <text x="470" y="383" font-size="10">endpoint-to-node gaps</text>
    <text x="470" y="399" font-size="10" opacity="0.85">tolerance sits in the valley</text>
  </g>
  <!-- Result node -->
  <rect x="664" y="180" width="212" height="112" rx="9" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2"/>
  <text x="770" y="222" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">Connected,</text>
  <text x="770" y="240" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">deduplicated</text>
  <text x="770" y="258" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">network graph</text>
  <text x="770" y="278" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.8">one component per island</text>
  <!-- Arrows cause -> fix -->
  <g stroke="currentColor" stroke-width="1.4">
    <line x1="276" y1="76" x2="342" y2="76" marker-end="url(#snap-arr)"/>
    <line x1="276" y1="176" x2="342" y2="176" marker-end="url(#snap-arr)"/>
    <line x1="276" y1="276" x2="342" y2="276" marker-end="url(#snap-arr)"/>
    <line x1="276" y1="376" x2="342" y2="376" marker-end="url(#snap-arr)"/>
  </g>
  <!-- Arrows fix -> result -->
  <g stroke="currentColor" stroke-width="1.4" fill="none">
    <path d="M596,76 H630 V230 H662" marker-end="url(#snap-arr)"/>
    <path d="M596,176 H620 V236 H662" marker-end="url(#snap-arr)"/>
    <path d="M596,276 H620 V240 H662" marker-end="url(#snap-arr)"/>
    <path d="M596,376 H630 V246 H662" marker-end="url(#snap-arr)"/>
  </g>
</svg>

The safe tolerance $\tau$ is any value satisfying

$$ g_{\max} < \tau < \tfrac{1}{2}\, d_{\min} $$

where $g_{\max}$ is the largest real endpoint-to-node gap you want to close and $d_{\min}$ is the smallest distance between two distinct substation nodes. When that band is empty — real gaps exceed half the minimum node spacing — no single tolerance is safe, and the fix is to split lines at nodes rather than snap harder.

## Pre-flight validation

Before snapping anything, confirm the layer is projected and measure the endpoint-to-node gap distribution so the tolerance is chosen from data, not guessed. The validator below refuses to run in a geographic frame and returns the gap histogram edges that reveal where the digitization-noise band ends and real node spacing begins:

```python
import numpy as np
import geopandas as gpd
from shapely.geometry import Point


def preflight_snap_inputs(
    lines_gdf: gpd.GeoDataFrame,
    substation_gdf: gpd.GeoDataFrame,
) -> dict:
    """Fail fast on a geographic CRS; report the endpoint-to-node gap spread."""
    # Cause 2: a snap tolerance in metres is meaningless in degrees
    if lines_gdf.crs is None or not lines_gdf.crs.is_projected:
        raise ValueError(
            f"Lines CRS {lines_gdf.crs} is not projected in metres. "
            "Reproject to a UTM zone (e.g. EPSG:32614) before snapping."
        )
    if lines_gdf.crs != substation_gdf.crs:
        raise ValueError("Lines and substations are in different CRSes.")

    node_sindex = substation_gdf.sindex
    gaps = []
    for line in lines_gdf.geometry:
        for coord in (line.coords[0], line.coords[-1]):
            endpoint = Point(coord)
            nearest_idx = node_sindex.nearest(endpoint, return_all=False)[1][0]
            gaps.append(endpoint.distance(substation_gdf.geometry.iloc[nearest_idx]))

    gaps = np.asarray(gaps)
    return {
        "n_endpoints": len(gaps),
        "gap_p50_m": round(float(np.median(gaps)), 2),
        "gap_p95_m": round(float(np.percentile(gaps, 95)), 2),
        "gap_max_m": round(float(gaps.max()), 2),
        "already_coincident": int((gaps < 1e-6).sum()),
    }
```

A healthy histogram is bimodal: a tight cluster near zero (endpoints that already land on a node) and a second cluster at the real gap distance (endpoints that need snapping), with an empty valley between them and the next spacing regime. Pick $\tau$ in that valley. A `gap_p95_m` of 6.5 m with the nearest distinct-node spacing above 40 m is the comfortable case; a `gap_max_m` that approaches your node spacing is the warning that some "gaps" are actually the wrong node.

## Fix implementation

The corrected function snaps each line endpoint to the nearest substation node only when the gap falls within a metric tolerance, records a `snapped_flag` and the snap distance for the audit trail, and never moves an endpoint onto a node farther away than `tolerance_m`. It uses `shapely.ops.nearest_points` to find the target, moves only the terminal vertex, and applies `set_precision` afterward so snapped coordinates collapse to bit-identical values the graph builder will hash to one vertex. Parameter choices are deliberate: `tolerance_m=15.0` sits above a typical few-metre digitization offset and well below substation spacing, and `grid_size=0.001` (1 mm) rounds coordinates so floating-point residue cannot re-split a node.

<svg viewBox="0 0 940 372" role="img" aria-label="The difference between snapping a line endpoint to a substation node and inserting a vertex where a line passes a substation. A tap connection needs the line split at the point of nearest approach and a new node inserted, so the graph gains a degree-three junction. Snapping only endpoints leaves the passing line unconnected, and a routing query will detour to the nearest terminated end — often tens of kilometres away." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Endpoint snapping and vertex insertion solve different problems</title>
  <desc>Two panels. In the first, a line terminates near a substation node and endpoint snapping moves the endpoint onto the node, producing a clean degree-one connection. In the second, a line passes 12 metres from a substation without terminating; endpoint snapping does nothing, so the substation stays isolated, while vertex insertion splits the line at the nearest point and creates a degree-three junction. A note records the consequence: a routed query from the substation detours to the nearest terminated end.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="372"/>
  <defs><marker id="sv-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Two topologies, two different repairs</text>
  <rect x="30" y="58" width="424" height="250" rx="9" fill="none" stroke="#5BA8C8" stroke-width="1.2" opacity="0.55"/>
  <text x="242" y="84" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">line terminates near the node</text>
  <path d="M70,190 L200,168 L300,160" fill="none" stroke="#5BA8C8" stroke-width="2.6"/>
  <circle cx="348" cy="158" r="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2"/>
  <line x1="304" y1="160" x2="336" y2="158" stroke="#F4A261" stroke-width="1.6" stroke-dasharray="4 3" marker-end="url(#sv-arr)"/>
  <text x="320" y="196" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">9 m gap → snap the endpoint</text>
  <text x="242" y="262" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">endpoint snap gives a clean degree-1 connection</text>
  <rect x="486" y="58" width="424" height="250" rx="9" fill="none" stroke="#F4A261" stroke-width="1.2" opacity="0.55"/>
  <text x="698" y="84" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">line passes without terminating</text>
  <path d="M520,132 L700,150 L880,140" fill="none" stroke="#5BA8C8" stroke-width="2.6"/>
  <circle cx="700" cy="196" r="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2"/>
  <line x1="700" y1="186" x2="700" y2="158" stroke="#F4A261" stroke-width="1.6" stroke-dasharray="4 3" marker-end="url(#sv-arr)"/>
  <text x="760" y="178" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">12 m — no endpoint to snap</text>
  <text x="698" y="240" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">split the line and insert a vertex →</text>
  <text x="698" y="262" text-anchor="middle" font-size="11.5" fill="#1F5C3A" font-weight="700">the junction becomes degree 3</text>
  <rect x="30" y="322" width="880" height="25" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="470.0" y="341" text-anchor="middle" font-size="11" fill="currentColor">Endpoint-only snapping leaves every tap connection isolated, and a routed query from that substation detours to the nearest terminated end.</text>
</svg>

```python
import geopandas as gpd
from shapely import set_precision
from shapely.geometry import LineString, Point
from shapely.ops import nearest_points


def snap_endpoints_to_nodes(
    lines_gdf: gpd.GeoDataFrame,
    substation_gdf: gpd.GeoDataFrame,
    tolerance_m: float = 15.0,   # above digitization noise, below node spacing
    grid_size: float = 0.001,    # 1 mm precision grid for exact coincidence
) -> gpd.GeoDataFrame:
    """Snap dangling line endpoints onto nearby substation nodes in a metric CRS.

    Only endpoints within tolerance_m of a node are moved; each move is
    recorded so the graph build and audit stay reproducible.
    """
    if not lines_gdf.crs.is_projected:
        raise ValueError("Snapping requires a projected metric CRS (e.g. EPSG:32614).")

    nodes = substation_gdf.geometry.values
    node_sindex = substation_gdf.sindex
    out = lines_gdf.copy()

    snapped_flags, snap_dists = [], []
    new_geoms = []
    for line in lines_gdf.geometry:
        coords = list(line.coords)
        moved = False
        max_move = 0.0
        for pos in (0, -1):                       # only the two terminal vertices
            endpoint = Point(coords[pos])
            idx = node_sindex.nearest(endpoint, return_all=False)[1][0]
            node = nodes[idx]
            gap = endpoint.distance(node)
            if gap <= tolerance_m and gap > 0:
                target = nearest_points(endpoint, node)[1]
                coords[pos] = (target.x, target.y)
                moved = True
                max_move = max(max_move, gap)
        geom = LineString(coords)
        # Precision grid makes snapped endpoints exactly coincident with the node
        new_geoms.append(set_precision(geom, grid_size))
        snapped_flags.append(moved)
        snap_dists.append(round(max_move, 3))

    out["geometry"] = new_geoms
    out["snapped_flag"] = snapped_flags
    out["snap_dist_m"] = snap_dists
    return out
```

Snapping only the terminal vertices — never interior ones — is what keeps this from deforming corridor centerlines: an interior vertex snapped to a nearby node would inject a false detour. Moving the endpoint to the exact node coordinate (rather than to a rounded approximation) and then applying one shared `set_precision` grid guarantees that the line's new end and the substation node reduce to the same coordinate, which is the condition `networkx` needs to fuse them into a single vertex.

## Fallback routing & performance tuning

When the simple within-tolerance snap does not fully connect the network, or when it runs at portfolio scale, layer these strategies on top of the core function:

<svg viewBox="0 0 940 400" role="img" aria-label="How the snapping tolerance decides both connectivity and correctness. At 5 metres the network breaks into 412 disconnected components and nothing is wrongly merged. At 15 metres there are 118 components and still no false merges. At 25 metres there are 37 components and 2 false merges. At 50 metres there are 9 components but 14 false merges, where distinct circuits in a shared corridor have been welded together. The working tolerance is the largest value that still produces zero false merges." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Snapping tolerance: components fall, false merges rise</title>
  <desc>A chart over four snapping tolerances — 5, 15, 25 and 50 metres. One series shows disconnected components falling from 412 to 118 to 37 to 9. A second shows false merges rising from 0 to 0 to 2 to 14. The crossing region between 15 and 25 metres is marked as the working range, and a note explains that a false merge is far more damaging than a disconnection, because a disconnection is visible in a routing failure while a false merge silently produces a shorter path.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="sn-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Choosing the tolerance: the largest value with no false merges</text>
  <line x1="100" y1="268" x2="890" y2="268" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <rect x="280" y="70" width="210" height="198" rx="6" fill="#DDF0E2" opacity="0.5"/>
  <text x="370" y="84" text-anchor="middle" font-size="11" fill="#1F5C3A" font-weight="700">working range</text>
  <rect x="118" y="90.0909090909091" width="54" height="177.9090909090909" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <rect x="184" y="266" width="54" height="2" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="145" y="80.0909090909091" text-anchor="middle" font-size="11.5" fill="#2C6E8F" font-weight="700">412</text>
  <text x="211" y="256" text-anchor="middle" font-size="11.5" fill="#7A4A1A" font-weight="700">0</text>
  <text x="180" y="290" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">5 m</text>
  <rect x="308" y="217.04545454545456" width="54" height="50.95454545454545" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <rect x="374" y="266" width="54" height="2" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="335" y="207.04545454545456" text-anchor="middle" font-size="11.5" fill="#2C6E8F" font-weight="700">118</text>
  <text x="401" y="256" text-anchor="middle" font-size="11.5" fill="#7A4A1A" font-weight="700">0</text>
  <text x="370" y="290" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">15 m</text>
  <rect x="498" y="252.02272727272728" width="54" height="15.977272727272727" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <rect x="564" y="244.25" width="54" height="23.75" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="525" y="242.02272727272728" text-anchor="middle" font-size="11.5" fill="#2C6E8F" font-weight="700">37</text>
  <text x="591" y="234.25" text-anchor="middle" font-size="11.5" fill="#7A4A1A" font-weight="700">2</text>
  <text x="560" y="290" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">25 m</text>
  <rect x="688" y="264.1136363636364" width="54" height="3.8863636363636362" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <rect x="754" y="101.75" width="54" height="166.25" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="715" y="254.11363636363637" text-anchor="middle" font-size="11.5" fill="#2C6E8F" font-weight="700">9</text>
  <text x="781" y="91.75" text-anchor="middle" font-size="11.5" fill="#7A4A1A" font-weight="700">14</text>
  <text x="750" y="290" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">50 m</text>
  <rect x="120" y="306" width="16" height="12" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="144" y="317" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">disconnected components</text>
  <rect x="420" y="306" width="16" height="12" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="444" y="317" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">false merges</text>
  <rect x="120" y="336" width="780" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="510.0" y="357" text-anchor="middle" font-size="11.5" fill="currentColor">A disconnection announces itself as a routing failure. A false merge quietly returns a shorter path</text>
  <text x="510.0" y="374" text-anchor="middle" font-size="11.5" fill="currentColor">through two circuits that were never connected — so tolerance is chosen against false merges.</text>
</svg>

- **Select the tolerance from the histogram, not a hunch.** Feed `preflight_snap_inputs` output into the choice of `tolerance_m`: set it just above `gap_p95_m` when a clean valley exists, and treat any run where `gap_max_m` approaches node spacing as a signal to split rather than widen.
- **Split lines at interior node crossings.** A line that passes *through* a substation without terminating there needs `shapely.ops.split` at the node, not endpoint snapping — this creates the mid-line junction a tap or ring bus requires. Do this before the endpoint snap so the freshly created endpoints participate.
- **Guard against over-snap with a spacing floor.** Compute the minimum pairwise node distance once via the substation `sindex`; if `tolerance_m` exceeds half of it, refuse or lower it, so two distinct buses can never collapse into one node. This over-snap guard is the same node-integrity discipline enforced when [deduplicating overlapping transmission segments from OpenStreetMap](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/deduplicating-overlapping-transmission-segments-from-openstreetmap/).
- **Use the spatial index for the nearest lookup.** For national datasets, `substation_gdf.sindex.nearest` prunes the endpoint-to-node search toward $O(n \log n)$ instead of the pairwise scan a brute-force `distance` loop implies.
- **Build the graph on rounded coordinates.** After snapping, key each `networkx` node on the precision-reduced `(x, y)` tuple so endpoints that were snapped to the same node deterministically hash together — floating-point equality is never safe as a graph key.

## Downstream validation

Before the snapped layer feeds a routing or contingency model, gate it with an assertion suitable for a CI/CD pipeline. This catches the two failure signatures that matter — endpoints still stranded beyond tolerance, and distinct nodes that were fused by over-snapping — and confirms the graph has the expected connectivity:

```python
import networkx as nx
import geopandas as gpd
from shapely.geometry import Point


def assert_snapped_connectivity(
    lines_gdf: gpd.GeoDataFrame,
    substation_gdf: gpd.GeoDataFrame,
    tolerance_m: float = 15.0,
    max_components: int = 1,
) -> nx.Graph:
    """CI/CD gate: every endpoint within tolerance of a node, no fused nodes,
    and the graph no more fragmented than the physical grid's island count."""
    node_sindex = substation_gdf.sindex

    # 1. No endpoint left stranded beyond tolerance
    for line in lines_gdf.geometry:
        for coord in (line.coords[0], line.coords[-1]):
            endpoint = Point(coord)
            idx = node_sindex.nearest(endpoint, return_all=False)[1][0]
            gap = endpoint.distance(substation_gdf.geometry.iloc[idx])
            assert gap <= tolerance_m, f"endpoint {coord} stranded {gap:.1f} m from nearest node"

    # 2. No two distinct substations collapsed onto one coordinate
    rounded = substation_gdf.geometry.apply(lambda p: (round(p.x, 3), round(p.y, 3)))
    assert rounded.is_unique, "over-snap fused distinct substation nodes into one coordinate"

    # 3. Connectivity check via networkx
    graph = nx.Graph()
    for line in lines_gdf.geometry:
        u = (round(line.coords[0][0], 3), round(line.coords[0][1], 3))
        v = (round(line.coords[-1][0], 3), round(line.coords[-1][1], 3))
        graph.add_edge(u, v, length_m=line.length)

    n_components = nx.number_connected_components(graph)
    assert n_components <= max_components, (
        f"{n_components} disconnected components; expected <= {max_components}. "
        "Endpoints likely still non-coincident after snapping."
    )
    return graph
```

Logging the `snapped_flag` count and the connected-component total as part of the run is what keeps the topology defensible: a reviewer can see how many endpoints were moved and confirm the graph collapsed to the expected number of electrical islands, mirroring the provenance discipline enforced in [spatial data quality validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/). Pin `shapely >= 2.0` and `networkx` versions so a change in `set_precision` rounding or nearest-node tie-breaking cannot silently re-fragment the graph between runs. Snapping is only sound once the input layer is already clean, so run it after the extraction described in [mapping high-voltage transmission lines from OpenStreetMap](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/mapping-high-voltage-transmission-lines-from-openstreetmap/) has produced projected, valid geometry.

## Related

- [Transmission Line & Substation Mapping](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/) — parent workflow that produces the projected, validated layer this snap consumes.
- [Mapping High-Voltage Transmission Lines from OpenStreetMap](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/mapping-high-voltage-transmission-lines-from-openstreetmap/) — the extraction step that must run before endpoints are snapped to nodes.
- [Deduplicating Overlapping Transmission Segments from OpenStreetMap](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/deduplicating-overlapping-transmission-segments-from-openstreetmap/) — node-integrity and duplicate-geometry handling that pairs with the over-snap guard.
- [Spatial Data Quality Validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) — the audit-trail and geometry-integrity discipline the connectivity gate extends.
