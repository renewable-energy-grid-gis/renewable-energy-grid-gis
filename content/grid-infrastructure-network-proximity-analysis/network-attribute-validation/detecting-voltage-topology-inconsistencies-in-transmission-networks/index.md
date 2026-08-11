---
title: Detecting Voltage Topology Inconsistencies in Transmission Networks
description: Find the places where a transmission dataset contradicts itself — voltage jumps without a transformer, dead-end circuits, substations below the lines they serve, and a report that ranks each by how much it distorts a screen.
slug: detecting-voltage-topology-inconsistencies-in-transmission-networks
type: article
breadcrumb: Detecting Voltage Topology Inconsistencies
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Detecting Voltage Topology Inconsistencies in Transmission Networks

The scenario: a screening query finds a 345 kV path to a candidate site, the developer prices an
interconnection around it, and a planner points out that the path passes through a node where a 345
kV circuit meets a 138 kV circuit with no transformer between them. The dataset is internally
inconsistent, the graph traversed it happily, and nothing in the pipeline was looking. This page
finds those places before a query does, and it extends
[network attribute validation](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/).

## Root-cause analysis

Voltage inconsistencies come from three sources, and separating them decides whether to repair or to
report.

1. **Missing transformers.** Open datasets map circuits far more completely than substation
   internals, so a node where two voltage classes meet is usually a real substation whose transformer
   was never mapped. The topology is wrong; the geography is right.
2. **Mis-tagged voltage.** A single way tagged 138,000 where its neighbours are 345,000, or a
   transposed 1150 for 115. Here the topology is right and the attribute is wrong, and the correct
   repair is the opposite of the previous case.
3. **Snapping artefacts.** Two circuits that merely cross — one overhead, one underground, at
   different heights — snapped into a shared node by a tolerance that was too generous. Neither the
   topology nor the attribute is wrong; the join is.

<svg viewBox="0 0 940 412" role="img" aria-label="Three classes of voltage inconsistency and how each distorts a screen. An unmapped transformer lets a query cross voltage levels for free and makes the screen optimistic. A mis-tagged voltage cuts both ways — too low and a real path disappears, too high and the screen over-promises. A snapping artefact invents a connection between circuits that merely cross, producing paths shorter than anything buildable." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Three inconsistency classes and the direction each distorts a screen</title>
  <desc>A table of three voltage-topology inconsistency classes. An unmapped transformer, typically at a mapped substation, lets a query cross voltage levels without one and makes a screen optimistic; the repair is to split the node and insert an inferred transformer. A mis-tagged voltage, typically one way in an otherwise consistent run, makes the screen pessimistic when tagged too low and optimistic when tagged too high; the repair is comparison against neighbours or an authoritative source. A snapping artefact, typically a degree-two node in open country, invents a connection and makes the screen optimistic; the repair is to split the node or reduce the snapping tolerance.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="412"/>
  <defs><marker id="vt1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Three contradictions, three repairs, three directions of error</text>
  <rect x="40" y="74" width="868" height="92" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3" opacity="0.48"/>
  <text x="64" y="106" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">unmapped transformer</text>
  <text x="64" y="130" text-anchor="start" font-size="11" fill="currentColor" opacity="0.88">a mapped substation node</text>
  <text x="64" y="152" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">repair: split the node, insert an inferred transformer</text>
  <text x="884" y="120" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">optimistic</text>
  <rect x="40" y="176" width="868" height="92" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3" opacity="0.48"/>
  <text x="64" y="208" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">mis-tagged voltage</text>
  <text x="64" y="232" text-anchor="start" font-size="11" fill="currentColor" opacity="0.88">one way in a consistent run</text>
  <text x="64" y="254" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">repair: compare against neighbours or an authority</text>
  <text x="884" y="222" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">both directions</text>
  <rect x="40" y="278" width="868" height="92" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3" opacity="0.48"/>
  <text x="64" y="310" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">snapping artefact</text>
  <text x="64" y="334" text-anchor="start" font-size="11" fill="currentColor" opacity="0.88">degree-two node in open country</text>
  <text x="64" y="356" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">repair: split the node or lower the tolerance</text>
  <text x="884" y="324" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">optimistic</text>
  <rect x="40" y="386" width="868" height="22" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="404" text-anchor="middle" font-size="11" fill="currentColor">Counting them together hides the fix: two of the three are data defects and one is a parameter choice.</text>
</svg>

## Pre-flight validation

Every inconsistency is a local property of a node and its incident edges, so the detection is one
pass over the graph.

```python
import networkx as nx


def find_voltage_inconsistencies(g: nx.MultiGraph, *, voltage_field: str = "voltage_kv") -> list[dict]:
    """Nodes where the incident voltages cannot be reconciled without a transformer."""
    findings = []
    for node in g.nodes:
        voltages = {
            d.get(voltage_field)
            for _, _, d in g.edges(node, data=True)
            if d.get(voltage_field) is not None
        }
        if len(voltages) <= 1:
            continue
        kind = g.nodes[node].get("kind")
        has_transformer = any(
            d.get("kind") == "transformer" for _, _, d in g.edges(node, data=True)
        )
        if has_transformer:
            continue
        findings.append({
            "node": node,
            "node_kind": kind,
            "voltages": sorted(v for v in voltages if v is not None),
            "degree": g.degree(node),
            "likely_cause": (
                "unmapped transformer" if kind == "substation"
                else "snapping artefact" if g.degree(node) == 2
                else "mis-tagged voltage"
            ),
        })
    return findings
```

The `likely_cause` heuristic is coarse and useful: a mixed-voltage node that is a mapped substation
is almost always a missing transformer, a degree-two mixed node in open country is almost always two
circuits snapped together, and everything else needs a human.

## Fix implementation

```python
import networkx as nx


def repair_voltage_topology(
    g: nx.MultiGraph,
    findings: list[dict],
    *,
    voltage_field: str = "voltage_kv",
    snap_split_tolerance_m: float = 25.0,
) -> tuple[nx.MultiGraph, list[dict]]:
    """Insert implied transformers, split snapping artefacts, quarantine the rest."""
    out = g.copy()
    actions = []

    for f in findings:
        node = f["node"]
        if f["likely_cause"] == "unmapped transformer":
            # Split the node by voltage level and connect the levels with a transformer edge.
            levels = f["voltages"]
            for v in levels:
                out.add_node(f"{node}@{v:g}", kind="bus", voltage_kv=v,
                             geometry=out.nodes[node].get("geometry"))
            for u, w, key, d in list(out.edges(node, keys=True, data=True)):
                v = d.get(voltage_field)
                if v is None:
                    continue
                other = w if u == node else u
                out.add_edge(f"{node}@{v:g}", other, key=key, **d)
                out.remove_edge(u, w, key)
            for a, b in zip(levels, levels[1:]):
                out.add_edge(f"{node}@{a:g}", f"{node}@{b:g}",
                             key=f"XF-{node}-{a:g}-{b:g}", kind="transformer",
                             voltage_kv=None, length_km=0.0, inferred=True)
            out.remove_node(node)
            actions.append({"node": node, "action": "transformer inserted", "levels": levels})

        elif f["likely_cause"] == "snapping artefact":
            # Two circuits that merely cross: separate them into two coincident nodes.
            edges = list(out.edges(node, keys=True, data=True))
            for i, (u, w, key, d) in enumerate(edges):
                other = w if u == node else u
                new_node = f"{node}#{i}"
                out.add_node(new_node, **out.nodes[node])
                out.add_edge(new_node, other, key=key, **d)
                out.remove_edge(u, w, key)
            out.remove_node(node)
            actions.append({"node": node, "action": "node split", "degree": f["degree"]})

        else:
            actions.append({"node": node, "action": "quarantined for review",
                            "voltages": f["voltages"]})
    return out, actions
```

The transformer insertion is deliberately marked `inferred=True`. A downstream query can then choose
to trust inferred transformers for screening and exclude them for anything that carries a
commitment — which is the honest treatment of a connection the dataset never asserted.

<svg viewBox="0 0 940 400" role="img" aria-label="Repairing an unmapped transformer. Before, one node carries a 345 kilovolt circuit and a 138 kilovolt circuit, so any path may cross between them for free. After, the node is split into a 345 kilovolt bus and a 138 kilovolt bus joined by a transformer edge marked as inferred, so a screening query can cross it and a bankable query can be told to refuse." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Splitting a mixed-voltage node and inserting an inferred transformer</title>
  <desc>Two graph fragments. Before: a single node with four incident edges, two at 345 kilovolts and two at 138, annotated as allowing a free voltage crossing. After: the node has been split into a 345 kilovolt bus carrying its two edges and a 138 kilovolt bus carrying its two, joined by a short transformer edge drawn with a dashed stroke and labelled inferred equals true. A note records that a screening query may traverse inferred transformers while a bankable query filters them out.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="vt2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">One node, two voltage classes, no transformer</text>
  <text x="220" y="70" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">before</text>
  <circle cx="220" cy="180" r="14" fill="#F6DCDC" stroke="#C85B5B" stroke-width="2"/>
  <line x1="220" y1="180" x2="116.63381171355007" y2="142.37778423417643" stroke="#5BA8C8" stroke-width="2.4"/>
  <text x="95.96057405626009" y="138.85334108101173" text-anchor="middle" font-size="10.5" fill="currentColor" font-weight="700">345 kV</text>
  <line x1="220" y1="180" x2="182.37778423417646" y2="76.63381171355007" stroke="#5BA8C8" stroke-width="2.4"/>
  <text x="174.85334108101176" y="59.960574056260086" text-anchor="middle" font-size="10.5" fill="currentColor" font-weight="700">345 kV</text>
  <line x1="220" y1="180" x2="315.2627944162882" y2="124.99999999999994" stroke="#F4A261" stroke-width="2.4"/>
  <text x="334.31535329954585" y="117.99999999999994" text-anchor="middle" font-size="10.5" fill="currentColor" font-weight="700">138 kV</text>
  <line x1="220" y1="180" x2="323.3661882864499" y2="217.62221576582357" stroke="#F4A261" stroke-width="2.4"/>
  <text x="344.0394259437399" y="229.14665891898827" text-anchor="middle" font-size="10.5" fill="currentColor" font-weight="700">138 kV</text>
  <text x="220" y="300" text-anchor="middle" font-size="11" fill="#7A4A1A" font-weight="700">a path may cross for free</text>
  <line x1="392" y1="180" x2="432" y2="180" stroke="currentColor" stroke-width="1.4" marker-end="url(#vt2-arr)"/>
  <text x="700" y="70" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">after</text>
  <circle cx="620" cy="140" r="12" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="2"/>
  <text x="620" y="118" text-anchor="middle" font-size="10.5" fill="currentColor" font-weight="700">345 kV bus</text>
  <circle cx="620" cy="240" r="12" fill="#FFE3BE" stroke="#F4A261" stroke-width="2"/>
  <text x="620" y="272" text-anchor="middle" font-size="10.5" fill="currentColor" font-weight="700">138 kV bus</text>
  <line x1="620" y1="152" x2="620" y2="228" stroke="#3D8B5F" stroke-width="2.6" stroke-dasharray="5 4"/>
  <text x="680" y="196" text-anchor="start" font-size="10.5" fill="#1F5C3A" font-weight="700">transformer · inferred=true</text>
  <line x1="608" y1="140" x2="520" y2="170" stroke="#5BA8C8" stroke-width="2.2"/>
  <line x1="608" y1="140" x2="520" y2="110" stroke="#5BA8C8" stroke-width="2.2"/>
  <line x1="608" y1="240" x2="520" y2="210" stroke="#F4A261" stroke-width="2.2"/>
  <line x1="608" y1="240" x2="520" y2="270" stroke="#F4A261" stroke-width="2.2"/>
  <rect x="40" y="322" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="341" text-anchor="middle" font-size="11" fill="currentColor">The transformer is marked inferred because the source never asserted it. A screening query traverses it;</text>
  <text x="474.0" y="356" text-anchor="middle" font-size="11" fill="currentColor">a query behind a commitment filters it out — one attribute, two levels of confidence.</text>
</svg>

## Fallback routing and performance tuning

- **Detect before you snap harder.** A rising count of mixed-voltage nodes as the snapping tolerance
  grows is the clearest signal that the tolerance has passed the point of usefulness.
- **Rank findings by query impact.** A mixed-voltage node on a corridor nobody screens matters less
  than one on the shortest path from a live portfolio; sorting by betweenness centrality puts the
  consequential ones first.
- **Keep the repair out of the source layer.** Apply it when building the graph, so a source refresh
  does not silently discard the repairs or, worse, keep them alongside newly corrected data.
- **Cache the repaired graph with its provenance.** The repair depends on the snapping tolerance and
  the source vintage; a cached graph without both is not reusable.

<svg viewBox="0 0 940 400" role="img" aria-label="A findings report ranked by how much each inconsistency distorts a screen rather than by count. Fourteen unmapped transformers sit on high-betweenness corridors and affect 41 percent of screened paths; 226 mis-tagged voltages affect 6 percent because most sit on spurs nobody screens; 38 snapping artefacts affect 12 percent. Ranking by impact puts a list of fourteen at the top instead of a list of 226." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Findings ranked by screen impact, not by count</title>
  <desc>A table of three inconsistency classes with, for each, the number found, the share of screened paths affected, and the resulting priority. Fourteen unmapped transformers affect 41 percent of screened paths and rank first. Thirty-eight snapping artefacts affect 12 percent and rank second. Two hundred and twenty-six mis-tagged voltages affect 6 percent and rank third, because most sit on spurs no query traverses. A note explains that ranking by betweenness centrality turns an unmanageable list into a short one.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="vt3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">278 findings — fourteen of them matter most</text>
  <rect x="40" y="78" width="868" height="76" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3" opacity="0.48"/>
  <text x="64" y="110" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">unmapped transformers</text>
  <text x="64" y="134" text-anchor="start" font-size="11" fill="currentColor" opacity="0.88">on high-betweenness corridors</text>
  <text x="520" y="124" text-anchor="end" font-size="12" fill="currentColor">14 found</text>
  <rect x="560" y="124" width="218.66666666666666" height="20" rx="3" fill="#C85B5B" stroke="#C85B5B" stroke-width="1" opacity="0.55"/>
  <text x="884" y="110" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">41% of screened paths</text>
  <rect x="40" y="164" width="868" height="76" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3" opacity="0.48"/>
  <text x="64" y="196" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">snapping artefacts</text>
  <text x="64" y="220" text-anchor="start" font-size="11" fill="currentColor" opacity="0.88">invent short paths</text>
  <text x="520" y="210" text-anchor="end" font-size="12" fill="currentColor">38 found</text>
  <rect x="560" y="210" width="64.0" height="20" rx="3" fill="#F4A261" stroke="#F4A261" stroke-width="1" opacity="0.55"/>
  <text x="884" y="196" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">12% of screened paths</text>
  <rect x="40" y="250" width="868" height="76" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3" opacity="0.48"/>
  <text x="64" y="282" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">mis-tagged voltages</text>
  <text x="64" y="306" text-anchor="start" font-size="11" fill="currentColor" opacity="0.88">mostly on spurs nobody screens</text>
  <text x="520" y="296" text-anchor="end" font-size="12" fill="currentColor">226 found</text>
  <rect x="560" y="296" width="32.0" height="20" rx="3" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1" opacity="0.55"/>
  <text x="884" y="282" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">6% of screened paths</text>
  <rect x="40" y="344" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="363" text-anchor="middle" font-size="11" fill="currentColor">Sorted by count, the 226 mis-tagged voltages look like the problem. Sorted by betweenness, fourteen</text>
  <text x="474.0" y="378" text-anchor="middle" font-size="11" fill="currentColor">unmapped transformers are — and fourteen is a list a data steward can actually work through.</text>
</svg>

## Downstream validation

```python
def assert_voltage_topology_clean(g, *, allow_inferred: bool = True) -> dict:
    """No node may mix voltages without a transformer, inferred or otherwise."""
    remaining = find_voltage_inconsistencies(g)
    assert not remaining, (
        f"{len(remaining)} nodes still mix voltage classes without a transformer: "
        f"{[r['node'] for r in remaining][:5]}"
    )
    inferred = [
        (u, v) for u, v, d in g.edges(data=True)
        if d.get("kind") == "transformer" and d.get("inferred")
    ]
    if not allow_inferred:
        assert not inferred, f"{len(inferred)} inferred transformers present in a strict query"
    return {"inferred_transformers": len(inferred)}
```

## What each inconsistency costs a screen

The three classes distort a screening result in different directions, which is why the report ranks
them rather than merely counting them.

An **unmapped transformer** makes a screen optimistic: the graph lets a query cross voltage levels
for free, so a project appears to reach a bulk substation through a path that in reality needs a
transformer that may not exist or may be fully loaded. This is the class that produced the opening
scenario, and it is the most consequential.

A **mis-tagged voltage** cuts both ways. A circuit tagged too low is excluded from a usable-voltage
subgraph, so a real path disappears and the screen is pessimistic. Tagged too high, it is included
and the screen over-promises. Because the tag is wrong rather than missing, no amount of graph
reasoning finds it — only comparison with neighbours or with an authoritative source.

A **snapping artefact** makes a screen optimistic in a different way: it invents a connection between
two circuits that merely cross, producing paths that are shorter than anything buildable. It is also
the easiest to prevent, because it is a parameter choice rather than a data defect, and the
tolerance sweep in
[snapping transmission lines to substation nodes](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/snapping-transmission-lines-to-substation-nodes-with-shapely/)
finds the value where it stops happening.

Reporting the three separately, with a count and an example each, is what lets a data steward fix the
right thing — and what stops a team responding to all three by widening a tolerance that caused one
of them.

## Frequently asked questions

### Should inferred transformers be trusted in a screen?

For a first-pass screen, yes, flagged. For anything that carries a commitment, no. The distinction is
easy to implement — an `inferred` attribute and a query-time filter — and it prevents the most common
misuse, which is a bankable study resting on a connection the source dataset never asserted.

### How do I tell a mis-tagged voltage from a genuine step-down?

By the neighbourhood. A genuine step-down happens at a substation and has other evidence: a mapped
yard, a name, sometimes an explicit transformer. A mis-tag is usually one way in a run of otherwise
consistent ways, so comparing a circuit's voltage against the mode of its connected component finds
them quickly.

### What about DC ties and back-to-back converters?

They legitimately connect two systems without an AC transformer and will be flagged by any check that
assumes AC topology. Tag them explicitly as converters at ingestion; there are few enough of them
nationally that a maintained list is practical, and they are exactly the assets a screen most needs
to represent correctly.

### Does this need to run on every refresh?

Yes, and the useful output is the delta rather than the level. A source refresh that adds twelve new
mixed-voltage nodes has changed something specific, and the twelve are a short list to inspect. The
absolute count says more about the source's mapping conventions than about this month's data.

### Can the same detection find missing circuits?

Not directly — it finds contradictions, and a missing circuit is an absence rather than a
contradiction. What it does surface indirectly is dead-end circuits: a high-voltage line terminating
at a degree-one node in open country almost always means the continuation was not mapped, and that
is worth reporting alongside the voltage findings.

### Where should the repair live in the pipeline?

At graph-build time, driven by the source layers, so the source stays a faithful copy of what was
published and the graph carries the interpretation. Repairing the source layer instead makes a later
refresh either overwrite the repairs or preserve them against corrected data, and both outcomes are
worse than rebuilding a graph.

## Related

- [Network Attribute Validation](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/) — the parent workflow and its schema gate
- [Modeling Substation Connectivity Graphs with NetworkX](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-routing-and-least-cost-path-analysis/modeling-substation-connectivity-graphs-with-networkx/) — the graph this check runs over
- [Snapping Transmission Lines to Substation Nodes with Shapely](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/snapping-transmission-lines-to-substation-nodes-with-shapely/) — the tolerance that causes the artefact class
- [Enforcing Voltage Class Schemas with pandera](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/enforcing-voltage-class-schemas-with-pandera/) — catching mis-tagged values before they reach the graph
