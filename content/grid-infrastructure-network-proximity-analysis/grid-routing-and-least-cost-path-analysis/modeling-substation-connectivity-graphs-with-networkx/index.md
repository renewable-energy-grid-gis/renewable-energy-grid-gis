---
title: Modeling Substation Connectivity Graphs with NetworkX
description: Turn transmission geometry into a graph that answers electrical questions — node snapping, voltage-aware edges, connected components, shortest electrical paths, and the checks that catch a graph the geometry never justified.
slug: modeling-substation-connectivity-graphs-with-networkx
type: article
breadcrumb: Substation Connectivity Graphs
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Modeling Substation Connectivity Graphs with NetworkX

The scenario: a screening tool reports that a candidate site can reach a 345 kV substation in three
hops, the developer builds a case around it, and a network planner points out that two of those hops
are 69 kV distribution feeders that cannot carry the project at all. The graph was topologically
correct and electrically meaningless. This page builds a connectivity graph that carries the
attributes the question needs, and it complements
[grid routing and least-cost path analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-routing-and-least-cost-path-analysis/)
by answering "what is connected to what" rather than "where would a new line go".

## Root-cause analysis

Three failures turn transmission geometry into a graph that misleads.

1. **Geometric adjacency treated as electrical connection.** Two lines whose endpoints are three
   metres apart in OpenStreetMap may be one circuit or two unconnected circuits crossing at
   different heights. Snapping without a voltage and operator check manufactures connections that do
   not exist.
2. **Voltage ignored on the edges.** A path is only usable if every edge on it can carry the
   project. A shortest-path query over an unfiltered graph will happily route a 200 MW project
   through a distribution tap, because the graph has no concept of capacity.
3. **Unsnapped endpoints producing a shattered graph.** The opposite failure: with too tight a
   tolerance the network fragments into hundreds of components and every query returns "no path",
   which is usually read as a data problem rather than a parameter one — the tolerance sweep in
   [snapping transmission lines to substation nodes](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/snapping-transmission-lines-to-substation-nodes-with-shapely/)
   is the direct remedy.

<svg viewBox="0 0 940 388" role="img" aria-label="What a snapping tolerance does to the graph. At 5 metres the national extract fragments into 412 components and no false merges occur. At 15 metres there are 118 components and still none. At 25 metres there are 37 components and 2 merges join segments whose voltages disagree. At 50 metres there are 9 components and 14 voltage-mismatched merges — circuits welded together that share only a corridor." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Component count against false merges, by snapping tolerance</title>
  <desc>A chart over four snapping tolerances of 5, 15, 25 and 50 metres. One series shows the number of connected components falling from 412 to 118 to 37 to 9. A second shows voltage-mismatched merges rising from 0 to 0 to 2 to 14. The band between 15 and 25 metres is marked as the working range, and a note explains that a false merge is more damaging than a fragment because it produces a shorter path that does not exist.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="388"/>
  <defs><marker id="nx1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The tolerance that consolidates without inventing connections</text>
  <line x1="100" y1="262" x2="890" y2="262" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <rect x="280" y="70" width="210" height="192" rx="6" fill="#DDF0E2" opacity="0.5"/>
  <text x="370" y="84" text-anchor="middle" font-size="11" fill="#1F5C3A" font-weight="700">working range</text>
  <rect x="118" y="89.70909090909089" width="54" height="172.2909090909091" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <rect x="184" y="260" width="54" height="2" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="145" y="79.70909090909089" text-anchor="middle" font-size="11.5" fill="#2C6E8F" font-weight="700">412</text>
  <text x="211" y="250" text-anchor="middle" font-size="11.5" fill="#7A4A1A" font-weight="700">0</text>
  <text x="180" y="284" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">5 m</text>
  <rect x="308" y="212.65454545454546" width="54" height="49.345454545454544" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <rect x="374" y="260" width="54" height="2" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="335" y="202.65454545454546" text-anchor="middle" font-size="11.5" fill="#2C6E8F" font-weight="700">118</text>
  <text x="401" y="250" text-anchor="middle" font-size="11.5" fill="#7A4A1A" font-weight="700">0</text>
  <text x="370" y="284" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">15 m</text>
  <rect x="498" y="246.52727272727273" width="54" height="15.472727272727273" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <rect x="564" y="239.0" width="54" height="23.0" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="525" y="236.52727272727273" text-anchor="middle" font-size="11.5" fill="#2C6E8F" font-weight="700">37</text>
  <text x="591" y="229.0" text-anchor="middle" font-size="11.5" fill="#7A4A1A" font-weight="700">2</text>
  <text x="560" y="284" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">25 m</text>
  <rect x="688" y="258.23636363636365" width="54" height="3.7636363636363637" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <rect x="754" y="101.0" width="54" height="161.0" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="715" y="248.23636363636365" text-anchor="middle" font-size="11.5" fill="#2C6E8F" font-weight="700">9</text>
  <text x="781" y="91.0" text-anchor="middle" font-size="11.5" fill="#7A4A1A" font-weight="700">14</text>
  <text x="750" y="284" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">50 m</text>
  <rect x="120" y="300" width="16" height="12" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="144" y="311" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">connected components</text>
  <rect x="420" y="300" width="16" height="12" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="444" y="311" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">voltage-mismatched merges</text>
  <rect x="120" y="332" width="770" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="505.0" y="351" text-anchor="middle" font-size="11" fill="currentColor">A fragment announces itself as &quot;no path&quot;. A false merge returns a shorter path through two circuits that</text>
  <text x="505.0" y="366" text-anchor="middle" font-size="11" fill="currentColor">were never connected — so tolerance is chosen against merges, not against components.</text>
</svg>

## Pre-flight validation

Before building the graph, measure how fragmented the geometry is at several tolerances. The right
tolerance is the largest one that produces no false merges, and false merges are detectable: they
join segments whose voltage or operator disagree.

```python
import geopandas as gpd
import numpy as np
from scipy.spatial import cKDTree


def endpoint_gap_profile(lines: gpd.GeoDataFrame, tolerances=(5, 15, 25, 50)) -> dict:
    """How many endpoint pairs merge at each tolerance, and how many disagree on voltage."""
    ends = []
    for idx, geom in zip(lines.index, lines.geometry):
        coords = list(geom.coords)
        ends.append((idx, coords[0]))
        ends.append((idx, coords[-1]))
    xy = np.array([c for _, c in ends])
    owners = np.array([i for i, _ in ends])
    volts = lines["voltage_kv"].reindex(owners).to_numpy()

    tree = cKDTree(xy)
    out = {}
    for tol in tolerances:
        pairs = tree.query_pairs(tol, output_type="ndarray")
        cross = pairs[owners[pairs[:, 0]] != owners[pairs[:, 1]]]
        mismatch = int(np.sum(volts[cross[:, 0]] != volts[cross[:, 1]])) if len(cross) else 0
        out[tol] = {"merged_pairs": int(len(cross)), "voltage_mismatched": mismatch}
    return out
```

## Fix implementation

```python
import geopandas as gpd
import networkx as nx
from shapely.geometry import Point


def build_grid_graph(
    lines: gpd.GeoDataFrame,
    substations: gpd.GeoDataFrame,
    *,
    snap_tolerance_m: float = 15.0,
    voltage_field: str = "voltage_kv",
) -> nx.MultiGraph:
    """A graph whose nodes are substations and junctions, and whose edges carry voltage."""
    g = nx.MultiGraph()

    for idx, row in substations.iterrows():
        g.add_node(
            f"S{idx}",
            kind="substation",
            geometry=row.geometry,
            voltage_kv=row.get(voltage_field),
            name=row.get("name"),
        )

    sub_pts = {n: d["geometry"] for n, d in g.nodes(data=True)}

    def nearest_node(pt: Point) -> str | None:
        best, best_d = None, snap_tolerance_m
        for name, geom in sub_pts.items():
            d = pt.distance(geom)
            if d <= best_d:
                best, best_d = name, d
        return best

    for idx, row in lines.iterrows():
        coords = list(row.geometry.coords)
        a_pt, b_pt = Point(coords[0]), Point(coords[-1])
        a = nearest_node(a_pt) or f"J{idx}a"
        b = nearest_node(b_pt) or f"J{idx}b"
        for node, pt in ((a, a_pt), (b, b_pt)):
            if node not in g:
                g.add_node(node, kind="junction", geometry=pt, voltage_kv=row.get(voltage_field))
        g.add_edge(
            a, b,
            key=f"L{idx}",
            length_km=row.geometry.length / 1000.0,
            voltage_kv=row.get(voltage_field),
            circuits=row.get("circuits"),
            operator=row.get("operator"),
        )
    return g


def usable_subgraph(g: nx.MultiGraph, *, min_voltage_kv: float) -> nx.MultiGraph:
    """The graph a project of this size can actually use."""
    keep = [
        (u, v, k) for u, v, k, d in g.edges(keys=True, data=True)
        if (d.get("voltage_kv") or 0) >= min_voltage_kv
    ]
    return g.edge_subgraph(keep).copy()
```

The `usable_subgraph` step is the substance. Filtering edges by voltage before any path query is what
turns "three hops" into "three hops the project can use", and it costs one pass over the edge list.

<svg viewBox="0 0 940 400" role="img" aria-label="Why the graph must be filtered by voltage before any path query. The unfiltered graph offers a three-hop path from the project to a 345 kV substation, but two of those hops are 69 kV feeders that cannot carry a 200 megawatt project. Filtering edges to 138 kV and above leaves a five-hop path that is 41 kilometres longer and is the one the project can actually use." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>The same graph, unfiltered and filtered to usable voltage</title>
  <desc>Two graph diagrams over the same eight nodes. In the unfiltered graph a three-hop path runs from the project through two 69 kilovolt feeder edges to a 345 kilovolt substation, drawn as the shortest path. In the filtered graph those two edges are removed because they fall below the 138 kilovolt threshold, and the shortest remaining path takes five hops and 41 kilometres more. Each edge is labelled with its voltage class, and a note records that the unfiltered answer is topologically correct and electrically meaningless.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="nx2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Three hops the project cannot use, or five it can</text>
  <text x="240" y="62" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">unfiltered — shortest path</text>
  <line x1="110" y1="250" x2="230" y2="180" stroke="#F4A261" stroke-width="3" opacity="1.0"/>
  <text x="170.0" y="207.0" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">69 kV</text>
  <line x1="230" y1="180" x2="360" y2="130" stroke="#F4A261" stroke-width="3" opacity="1.0"/>
  <text x="295.0" y="147.0" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">69 kV</text>
  <line x1="360" y1="130" x2="460" y2="90" stroke="#F4A261" stroke-width="3" opacity="1.0"/>
  <text x="410.0" y="102.0" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">345 kV</text>
  <line x1="110" y1="250" x2="330" y2="280" stroke="currentColor" stroke-width="1.4" opacity="0.35"/>
  <text x="220.0" y="257.0" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">230 kV</text>
  <line x1="330" y1="280" x2="450" y2="220" stroke="currentColor" stroke-width="1.4" opacity="0.35"/>
  <text x="390.0" y="242.0" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">230 kV</text>
  <line x1="450" y1="220" x2="460" y2="90" stroke="currentColor" stroke-width="1.4" opacity="0.35"/>
  <text x="455.0" y="147.0" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">345 kV</text>
  <circle cx="110" cy="250" r="9" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.6"/>
  <text x="110" y="234" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">P</text>
  <circle cx="230" cy="180" r="6" fill="none" stroke="#F4A261" stroke-width="1.6"/>
  <text x="230" y="164" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">A</text>
  <circle cx="330" cy="280" r="6" fill="none" stroke="#F4A261" stroke-width="1.6"/>
  <text x="330" y="264" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">B</text>
  <circle cx="360" cy="130" r="6" fill="none" stroke="#F4A261" stroke-width="1.6"/>
  <text x="360" y="114" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">C</text>
  <circle cx="450" cy="220" r="6" fill="none" stroke="#F4A261" stroke-width="1.6"/>
  <text x="450" y="204" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">D</text>
  <circle cx="460" cy="90" r="9" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.6"/>
  <text x="460" y="74" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">T</text>
  <text x="240" y="322" text-anchor="middle" font-size="12" fill="#7A4A1A" font-weight="700">3 hops · 62 km · unusable</text>
  <text x="700" y="62" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">filtered to ≥ 138 kV</text>
  <line x1="820" y1="130" x2="920" y2="90" stroke="currentColor" stroke-width="1.4" opacity="0.35"/>
  <text x="870.0" y="102.0" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">345 kV</text>
  <line x1="570" y1="250" x2="790" y2="280" stroke="#3D8B5F" stroke-width="3" opacity="1.0"/>
  <text x="680.0" y="257.0" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">230 kV</text>
  <line x1="790" y1="280" x2="910" y2="220" stroke="#3D8B5F" stroke-width="3" opacity="1.0"/>
  <text x="850.0" y="242.0" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">230 kV</text>
  <line x1="910" y1="220" x2="920" y2="90" stroke="#3D8B5F" stroke-width="3" opacity="1.0"/>
  <text x="915.0" y="147.0" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">345 kV</text>
  <circle cx="570" cy="250" r="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.6"/>
  <text x="570" y="234" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">P</text>
  <circle cx="690" cy="180" r="6" fill="none" stroke="#3D8B5F" stroke-width="1.6"/>
  <text x="690" y="164" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">A</text>
  <circle cx="790" cy="280" r="6" fill="none" stroke="#3D8B5F" stroke-width="1.6"/>
  <text x="790" y="264" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">B</text>
  <circle cx="820" cy="130" r="6" fill="none" stroke="#3D8B5F" stroke-width="1.6"/>
  <text x="820" y="114" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">C</text>
  <circle cx="910" cy="220" r="6" fill="none" stroke="#3D8B5F" stroke-width="1.6"/>
  <text x="910" y="204" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">D</text>
  <circle cx="920" cy="90" r="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.6"/>
  <text x="920" y="74" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">T</text>
  <text x="700" y="322" text-anchor="middle" font-size="12" fill="#1F5C3A" font-weight="700">5 hops · 103 km · usable</text>
  <rect x="30" y="344" width="878" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="469.0" y="363" text-anchor="middle" font-size="11" fill="currentColor">The unfiltered answer is topologically correct and electrically meaningless — the graph has no concept of</text>
  <text x="469.0" y="378" text-anchor="middle" font-size="11" fill="currentColor">capacity until the voltage filter gives it one.</text>
</svg>

## Fallback routing and performance tuning

- **Use a spatial index for snapping.** The `nearest_node` loop above is clear and quadratic; on a
  national extract, replace it with a `cKDTree` query over substation coordinates.
- **Prefer `MultiGraph` over `Graph`.** Parallel circuits between the same pair of substations are
  real, and collapsing them loses the redundancy a reliability question depends on.
- **Store geometry on nodes, not on edges.** Edge geometry duplicates the source layer; a key back to
  the line identifier is enough and keeps the graph small enough to pickle.
- **Filter before you query, not inside the query.** Building the usable subgraph once and querying
  it many times is far cheaper than a per-query predicate, and it makes the filter visible.
- **Contract degree-two junctions.** A chain of collinear segments between two substations is one
  electrical edge; contracting them shrinks a national graph by an order of magnitude without
  changing any answer.

## Downstream validation

```python
import networkx as nx


def assert_graph_sane(g: nx.MultiGraph, *, max_components: int = 50) -> dict:
    """Catch both fragmentation and manufactured connectivity."""
    comps = list(nx.connected_components(g))
    largest = max((len(c) for c in comps), default=0)
    report = {
        "nodes": g.number_of_nodes(),
        "edges": g.number_of_edges(),
        "components": len(comps),
        "largest_component_share": largest / max(g.number_of_nodes(), 1),
    }
    assert report["components"] <= max_components, (
        f"{report['components']} components — snapping tolerance is too tight"
    )
    assert report["largest_component_share"] > 0.6, (
        "the largest component holds under 60% of nodes — the network is shattered"
    )
    for u, v, d in g.edges(data=True):
        assert d.get("voltage_kv") is not None, f"edge {u}-{v} has no voltage — it cannot be filtered"
    return report
```

<svg viewBox="0 0 940 372" role="img" aria-label="What a healthy component profile looks like. On a national extract snapped at 15 metres, the largest component holds 94 percent of the nodes, a handful of genuine islands hold between 0.3 and 2 percent each, and the tail is single-node fragments that are almost always unsnapped endpoints. A largest-component share below about 60 percent means the graph is shattered rather than the grid being disconnected." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Component size distribution on a national graph</title>
  <desc>A distribution of connected component sizes for a national transmission graph snapped at 15 metres. The largest component holds 94 percent of nodes. Four further components hold between 0.3 and 2.1 percent each and correspond to genuine electrical islands. The remaining 113 components hold one or two nodes each and total 1.4 percent, and are annotated as unsnapped endpoints rather than real islands. A threshold marks 60 percent as the point below which the graph should be treated as shattered.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="372"/>
  <defs><marker id="nx3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">One large component, a few real islands, and a tail of artefacts</text>
  <rect x="240" y="70" width="601.6" height="32" rx="4" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="228" y="92" text-anchor="end" font-size="11.5" fill="currentColor">largest component</text>
  <text x="851.6" y="92" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">94.0%</text>
  <rect x="240" y="110" width="13.44" height="32" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="228" y="132" text-anchor="end" font-size="11.5" fill="currentColor">island A (ERCOT tie)</text>
  <text x="263.44" y="132" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">2.1%</text>
  <rect x="240" y="150" width="7.68" height="32" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="228" y="172" text-anchor="end" font-size="11.5" fill="currentColor">island B</text>
  <text x="257.68" y="172" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">1.2%</text>
  <rect x="240" y="190" width="4" height="32" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="228" y="212" text-anchor="end" font-size="11.5" fill="currentColor">island C</text>
  <text x="254" y="212" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">0.6%</text>
  <rect x="240" y="230" width="4" height="32" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="228" y="252" text-anchor="end" font-size="11.5" fill="currentColor">island D</text>
  <text x="254" y="252" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">0.3%</text>
  <rect x="240" y="270" width="8.96" height="32" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="228" y="292" text-anchor="end" font-size="11.5" fill="currentColor">113 single-node fragments</text>
  <text x="258.96000000000004" y="292" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">1.4%</text>
  <line x1="624.0" y1="62" x2="624.0" y2="302" stroke="#F4A261" stroke-width="1.6" stroke-dasharray="5 4"/>
  <text x="632.0" y="318" text-anchor="start" font-size="11" fill="#7A4A1A" font-weight="700">60% floor — below this the graph is shattered</text>
  <rect x="40" y="322" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="341" text-anchor="middle" font-size="11" fill="currentColor">The single-node tail is the diagnostic: 113 fragments at 15 metres means 113 endpoints that did not snap,</text>
  <text x="474.0" y="356" text-anchor="middle" font-size="11" fill="currentColor">and each one is a line whose connection the graph cannot see.</text>
</svg>


## Contracting the graph without changing any answer

A national transmission graph built directly from line geometry carries a node at every vertex where
two segments meet, and most of those nodes are degree two — a point where one circuit simply
continues. Contracting them is the single largest reduction available and it changes no query result.

The rule is narrow: a degree-two node may be contracted when both incident edges share a voltage, an
operator and a circuit count, and neither endpoint is a substation. The contracted edge inherits the
sum of the two lengths and the shared attributes. On a typical national extract this removes 80 to 90
percent of nodes, which turns a graph that takes minutes to traverse into one that takes seconds and
fits comfortably in memory for interactive work.

Two nodes must never be contracted. A substation is a query target even when it happens to sit
mid-span, and a junction where three or more circuits meet is where a path can branch. Contracting
either produces a graph that is smaller and answers a different question — which is the failure mode
worth guarding against, because the resulting graph still looks entirely plausible.

Keep the original line identifiers on the contracted edge as a list. When a query returns a path, the
identifiers are what let it be drawn back onto the source geometry, and without them the contracted
graph can answer questions but cannot show its work.

## Frequently asked questions

### Should the graph be directed?

Not for connectivity questions, and not for screening. Power flow direction is a function of dispatch
rather than of topology, and it reverses. Where direction genuinely matters — a radial feeder with a
defined source — encode it as an attribute rather than as a directed edge, so the same graph can
answer both kinds of question.

### How do I find every substation a project could reach?

Take the usable subgraph at the project's voltage class, then run a single-source shortest path from
the nearest node with the edge length as weight. One traversal returns the distance to every reachable
substation, which is both faster and more useful than repeated pairwise queries.

### What does a high component count actually mean?

Almost always a snapping tolerance that is too tight for the source data, not a genuinely
disconnected grid. National extracts routinely fragment into hundreds of components at 5 metres and
consolidate into a handful at 25. The tolerance sweep in the pre-flight step is the fastest way to
find the value where components collapse without voltage-mismatched merges appearing.

### Can this graph estimate available capacity?

Not on its own — it answers topology, not power flow. What it does provide is the set of candidate
substations and the electrical distance to each, which is what feeds the headroom calculation in
[grid capacity buffer analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/).
Treating a graph distance as a capacity proxy is the mistake this page's opening scenario describes.

### How should transformers between voltage levels be represented?

As explicit edges with a `kind` of transformer and both voltages recorded, connecting the two nodes
that represent the same yard at different levels. Collapsing a substation to one node hides the
transformer, and a path that crosses voltage levels without one is not a path a project can use.

### Is it worth persisting the graph?

Yes, keyed on the source layer vintages and the snapping tolerance. Rebuilding a national graph takes
minutes and the inputs change monthly at most, so a cached graph with its provenance recorded turns
an interactive query from a coffee break into a second — and the provenance is what stops two
analysts comparing results from different tolerances.

## Related

- [Grid Routing & Least-Cost Path Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-routing-and-least-cost-path-analysis/) — routing a new line where no connection exists
- [Snapping Transmission Lines to Substation Nodes with Shapely](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/snapping-transmission-lines-to-substation-nodes-with-shapely/) — the tolerance sweep this graph depends on
- [Network Attribute Validation](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/) — making the voltage attribute trustworthy enough to filter on
- [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) — turning reachable substations into available headroom
