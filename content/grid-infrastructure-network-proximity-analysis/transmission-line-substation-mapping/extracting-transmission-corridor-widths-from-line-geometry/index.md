---
title: Extracting Transmission Corridor Widths from Line Geometry
description: Infer right-of-way width from mapped circuits alone — parallel-run detection, voltage-class defaults, structure spacing as evidence, and an output that says how confident each width is.
slug: extracting-transmission-corridor-widths-from-line-geometry
type: article
breadcrumb: Extracting Corridor Widths
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Extracting Transmission Corridor Widths from Line Geometry

The scenario: a co-location study needs to know how much right-of-way each transmission corridor
occupies, the source dataset carries centrelines and nothing else, and the analyst applies a flat
30-metre buffer to everything. The 500 kV double-circuit corridor is under-stated by a factor of
four, the 69 kV tap is over-stated, and the resulting land-take figure is wrong in both directions at
once. This page infers width from what the geometry actually shows, and it extends
[transmission line and substation mapping](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/).

## Root-cause analysis

Centreline datasets omit width, and three pieces of evidence in the data can stand in for it.

1. **Voltage class.** Right-of-way width scales with voltage because clearance does: a 69 kV single
   circuit typically occupies 20 to 30 metres, a 230 kV circuit 40 to 55, and a 500 kV circuit 60 to
   90. These are conventions rather than laws, and they vary by utility, but they bound the answer.
2. **Parallel runs.** Two or more circuits mapped as separate ways following the same corridor within
   tens of metres are almost always sharing one right-of-way. Buffering each independently and
   unioning double-counts the shared land; measuring the envelope of the group does not.
3. **Structure spacing.** Where towers are mapped, the span length is evidence about the structure
   type, and structure type correlates with width more tightly than voltage alone — a 230 kV line on
   monopoles occupies materially less than the same voltage on lattice towers.

<svg viewBox="0 0 940 400" role="img" aria-label="Three evidence sources for a corridor width, and how much each narrows the estimate. Voltage class alone gives a range of 40 to 55 metres for a 230 kilovolt circuit. Adding structure type — monopole rather than lattice — moves it to 28 to 38. Adding a parallel-run count of two widens the envelope by 12 metres per extra circuit. Each piece of evidence both shifts the estimate and raises the confidence label attached to it." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>How each evidence source narrows a corridor-width estimate</title>
  <desc>A sequence of three horizontal ranges for the same 230 kilovolt corridor. With voltage class alone the estimate spans 40 to 55 metres and is labelled medium confidence. Adding structure type as monopole narrows and lowers it to 28 to 38 metres and raises the label to high confidence. Adding a parallel-run count of two circuits widens the envelope by 12 metres to 40 to 50 metres, still at high confidence. A fourth bar shows the flat 30 metre default applied to everything, which sits inside all three ranges and is right by accident.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="cw1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">230 kV corridor — each piece of evidence moves the answer</text>
  <text x="248" y="110" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">voltage class only</text>
  <rect x="508.0" y="92" width="93.0" height="32" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
  <text x="554.5" y="114" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">40–55 m</text>
  <text x="248" y="168" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">+ monopole structures</text>
  <rect x="433.6" y="150" width="62.0" height="32" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
  <text x="464.6" y="172" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">28–38 m</text>
  <text x="248" y="226" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">+ 2 parallel circuits</text>
  <rect x="508.0" y="208" width="62.0" height="32" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
  <text x="539.0" y="230" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">40–50 m</text>
  <text x="248" y="284" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">flat 30 m default</text>
  <rect x="442.0" y="266" width="8" height="32" rx="3" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.4"/>
  <text x="462.0" y="288" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">30 m flat</text>
  <line x1="260.0" y1="318" x2="260.0" y2="324" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="260.0" y="340" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0 m</text>
  <line x1="415.0" y1="318" x2="415.0" y2="324" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="415.0" y="340" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">25 m</text>
  <line x1="570.0" y1="318" x2="570.0" y2="324" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="570.0" y="340" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">50 m</text>
  <line x1="725.0" y1="318" x2="725.0" y2="324" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="725.0" y="340" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">75 m</text>
  <line x1="880.0" y1="318" x2="880.0" y2="324" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="880.0" y="340" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">100 m</text>
  <line x1="260" y1="318" x2="880" y2="318" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <text x="260" y="364" text-anchor="start" font-size="11" fill="currentColor" opacity="0.8">right-of-way width</text>
  <rect x="40" y="356" width="200" height="44" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="140.0" y="376" text-anchor="middle" font-size="11.5" fill="currentColor">confidence rises</text>
  <text x="140.0" y="392" text-anchor="middle" font-size="11.5" fill="currentColor">with evidence</text>
</svg>

## Pre-flight validation

Find the parallel runs first, because they change which lines should be measured together.

```python
import geopandas as gpd
import numpy as np


def find_parallel_runs(
    lines: gpd.GeoDataFrame,
    *,
    working_epsg: int,
    max_separation_m: float = 120.0,
    min_shared_length_m: float = 500.0,
) -> list[list]:
    """Group circuits that share a corridor, so their widths are not double-counted."""
    proj = lines.to_crs(working_epsg)
    idx = proj.sindex
    groups: list[set] = []

    for i, geom in zip(proj.index, proj.geometry):
        candidates = list(idx.query(geom.buffer(max_separation_m), predicate="intersects"))
        near = set()
        for pos in candidates:
            j = proj.index[pos]
            if j == i:
                continue
            other = proj.geometry.loc[j]
            # Shared length: how much of each line lies within the other's corridor buffer.
            shared = geom.intersection(other.buffer(max_separation_m)).length
            if shared >= min_shared_length_m:
                near.add(j)
        if near:
            near.add(i)
            merged = False
            for g in groups:
                if g & near:
                    g |= near
                    merged = True
                    break
            if not merged:
                groups.append(near)

    return [sorted(g) for g in groups]
```

A corridor with four mapped circuits and no grouping produces four buffers and four times the land
take; grouping first turns that into one envelope, which is what exists on the ground.

## Fix implementation

```python
import geopandas as gpd

# Half-widths in metres by voltage class, single circuit on lattice towers.
ROW_HALF_WIDTH_M = {69: 12.5, 115: 17.5, 138: 20.0, 230: 25.0, 345: 32.5, 500: 42.5, 765: 55.0}
MONOPOLE_FACTOR = 0.7          # monopoles need materially less lateral clearance
PER_EXTRA_CIRCUIT_M = 12.0     # each additional parallel circuit widens the envelope


def estimate_corridor_widths(
    lines: gpd.GeoDataFrame,
    *,
    working_epsg: int,
    groups: list[list] | None = None,
    voltage_field: str = "voltage_kv",
    structure_field: str = "structure",
) -> gpd.GeoDataFrame:
    """Per-corridor right-of-way estimate, with the evidence and a confidence label."""
    proj = lines.to_crs(working_epsg)
    groups = groups or [[i] for i in proj.index]
    rows = []

    for members in groups:
        subset = proj.loc[members]
        voltages = subset[voltage_field].dropna()
        if voltages.empty:
            half, confidence, basis = 20.0, "low", "no voltage — default applied"
        else:
            nominal = min(ROW_HALF_WIDTH_M, key=lambda v: abs(v - voltages.max()))
            half = ROW_HALF_WIDTH_M[nominal]
            basis = f"voltage class {nominal} kV"
            confidence = "medium"

        structures = subset.get(structure_field)
        if structures is not None and (structures == "monopole").all():
            half *= MONOPOLE_FACTOR
            basis += " · monopole"
            confidence = "high"

        extra = max(0, len(members) - 1)
        half += extra * PER_EXTRA_CIRCUIT_M
        if extra:
            basis += f" · {extra} parallel circuit(s)"

        envelope = subset.geometry.union_all().buffer(half)
        rows.append({
            "geometry": envelope,
            "members": list(members),
            "circuits": len(members),
            "half_width_m": half,
            "row_width_m": half * 2,
            "basis": basis,
            "confidence": confidence,
            "length_km": float(subset.geometry.length.sum()) / 1000.0,
            "area_ha": envelope.area / 10_000.0,
        })
    return gpd.GeoDataFrame(rows, crs=proj.crs)
```

The `basis` and `confidence` fields are the point. A width inferred from a voltage class alone is a
different claim from one corroborated by structure type, and a land-take figure built from the two
should say which it rests on.

<svg viewBox="0 0 940 396" role="img" aria-label="Grouping parallel circuits before buffering. Four circuits mapped separately along one corridor, buffered independently at 25 metres and unioned, produce a 96-metre envelope and 412 hectares over 43 kilometres. Grouped first and buffered once at 61 metres — the single-circuit half-width plus 12 metres per additional circuit — the same corridor is 122 metres wide and 524 hectares, which is what a shared right-of-way actually occupies." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Independent buffers against one grouped envelope</title>
  <desc>Two plan views of the same corridor carrying four parallel circuits. In the first, each circuit is buffered independently at 25 metres and the results are unioned, producing a lumpy envelope that pinches where the circuits converge and reports 412 hectares. In the second, the four circuits are grouped and buffered once at 61 metres, producing a smooth envelope of consistent width that reports 524 hectares. A note records that the independent buffers both under-state the corridor where circuits converge and over-state it where they diverge.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="cw2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Four circuits, one right-of-way</text>
  <text x="240" y="66" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">buffered independently, then unioned</text>
  <path d="M60,222 L160,182 L280,158 L420,132" fill="none" stroke="#F4A261" stroke-width="16" opacity="0.28"/>
  <path d="M60,222 L160,182 L280,158 L420,132" fill="none" stroke="#F4A261" stroke-width="1.6"/>
  <path d="M60,234 L160,194 L280,170 L420,144" fill="none" stroke="#F4A261" stroke-width="16" opacity="0.28"/>
  <path d="M60,234 L160,194 L280,170 L420,144" fill="none" stroke="#F4A261" stroke-width="1.6"/>
  <path d="M60,246 L160,206 L280,182 L420,156" fill="none" stroke="#F4A261" stroke-width="16" opacity="0.28"/>
  <path d="M60,246 L160,206 L280,182 L420,156" fill="none" stroke="#F4A261" stroke-width="1.6"/>
  <path d="M60,258 L160,218 L280,194 L420,168" fill="none" stroke="#F4A261" stroke-width="16" opacity="0.28"/>
  <path d="M60,258 L160,218 L280,194 L420,168" fill="none" stroke="#F4A261" stroke-width="1.6"/>
  <text x="240" y="296" text-anchor="middle" font-size="15" fill="currentColor" font-weight="700">412 ha</text>
  <text x="240" y="320" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">43 km of corridor</text>
  <text x="700" y="66" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">grouped, then buffered once</text>
  <path d="M520,240 L620,200 L740,176 L880,150" fill="none" stroke="#3D8B5F" stroke-width="44" opacity="0.35"/>
  <path d="M520,240 L620,200 L740,176 L880,150" fill="none" stroke="#3D8B5F" stroke-width="2.4"/>
  <text x="700" y="296" text-anchor="middle" font-size="15" fill="currentColor" font-weight="700">524 ha</text>
  <text x="700" y="320" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">43 km of corridor</text>
  <rect x="40" y="340" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="359" text-anchor="middle" font-size="11" fill="currentColor">Independent buffers pinch where the circuits converge and bulge where they diverge — the union of four</text>
  <text x="474.0" y="374" text-anchor="middle" font-size="11" fill="currentColor">25-metre buffers is not a 122-metre right-of-way, however similar the outline looks.</text>
</svg>

## Fallback routing and performance tuning

- **Group before buffering, always.** Buffering each circuit and unioning is both slower and wrong;
  the union of four 25-metre buffers over a shared corridor is not the corridor.
- **Cap the grouping distance by voltage.** A 120-metre separation is reasonable for bulk
  transmission and far too generous for distribution, where two circuits 100 metres apart are
  genuinely separate corridors.
- **Use the envelope, not the convex hull.** A convex hull across a bend swallows land the corridor
  does not occupy; buffering the unioned centrelines follows the alignment.
- **Simplify centrelines before buffering.** A one-metre simplification on a national line layer cuts
  the buffer cost substantially and moves the envelope edge by less than the width uncertainty.
- **Treat width as a range, not a number.** Publishing a low and high estimate alongside the central
  one is more useful than a single figure with false precision.

## Downstream validation

```python
def assert_corridor_widths(corridors, lines, *, max_width_m: float = 200.0) -> None:
    """Bounds and coverage checks on an inferred right-of-way layer."""
    assert corridors["row_width_m"].between(20, max_width_m).all(), (
        "an inferred corridor width falls outside any plausible right-of-way range"
    )
    assigned = {m for members in corridors["members"] for m in members}
    missing = set(lines.index) - assigned
    assert not missing, f"{len(missing)} circuits were not assigned to any corridor"
    assert corridors["confidence"].isin({"low", "medium", "high"}).all(), "unlabelled confidence"
    # A grouped corridor must never be narrower than a single circuit of the same class.
    singles = corridors[corridors["circuits"] == 1]["row_width_m"].max()
    grouped = corridors[corridors["circuits"] > 1]["row_width_m"].min()
    if len(corridors[corridors["circuits"] > 1]):
        assert grouped >= singles * 0.9, "a multi-circuit corridor came out narrower than a single one"
```

## What the width estimate is good for, and what it is not

An inferred right-of-way is a screening quantity, and being explicit about that prevents most of the
misuse.

It is good for **land-take estimation** across a region: how many hectares existing corridors occupy,
how much of a study area is already encumbered, and how a proposed route compares with existing
infrastructure. Errors of ten or twenty percent on individual corridors average out across hundreds
of kilometres.

<svg viewBox="0 0 940 392" role="img" aria-label="What an inferred corridor width is and is not good for. Regional land-take estimation and co-location screening tolerate a ten to twenty percent error on individual corridors because it averages out over hundreds of kilometres. A parcel-level encumbrance question does not: the legal right-of-way comes from a recorded easement and can differ from the inferred figure by tens of metres in either direction." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Fit-for-purpose limits of an inferred right-of-way</title>
  <desc>A two-column comparison. The suitable column lists regional land-take estimation, co-location screening for a routing cost surface, and comparing a proposed route against existing infrastructure, each annotated that a ten to twenty percent per-corridor error averages out. The unsuitable column lists parcel-level encumbrance questions, easement negotiation and constructability assessment, each annotated that the legal right-of-way comes from a recorded easement and differs from the inferred figure by tens of metres.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="392"/>
  <defs><marker id="cw3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">An inferred width is a screening quantity</text>
  <rect x="40" y="62" width="416" height="226" rx="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4" opacity="0.45"/>
  <text x="248" y="92" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">suitable</text>
  <text x="248" y="132" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.92">regional land-take estimation</text>
  <text x="248" y="162" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.92">co-location screening for routing</text>
  <text x="248" y="192" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.92">comparing a route against existing lines</text>
  <text x="248" y="256" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">per-corridor error averages out over hundreds of km</text>
  <rect x="492" y="62" width="416" height="226" rx="9" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.4" opacity="0.45"/>
  <text x="700" y="92" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">not suitable</text>
  <text x="700" y="132" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.92">parcel-level encumbrance</text>
  <text x="700" y="162" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.92">easement negotiation</text>
  <text x="700" y="192" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.92">constructability assessment</text>
  <text x="700" y="256" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">the legal extent comes from a recorded easement</text>
  <rect x="40" y="306" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="325" text-anchor="middle" font-size="11" fill="currentColor">Publishing the confidence label with the width is what keeps the two columns apart: a figure resting on a</text>
  <text x="474.0" y="340" text-anchor="middle" font-size="11" fill="currentColor">defaulted voltage class should never be summed alongside one corroborated by structure type.</text>
</svg>

It is good for **co-location screening**: identifying where a new line could plausibly share an
existing corridor, which is one of the highest-value weights in a
[least-cost routing surface](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-routing-and-least-cost-path-analysis/building-a-transmission-cost-surface-raster-in-numpy/).
The question there is whether a corridor exists and roughly how wide, not its legal extent.

It is **not** good for anything that touches a property boundary. The legal right-of-way is defined
by recorded easements, not by clearance conventions, and it frequently differs from the inferred
figure by tens of metres in either direction. A parcel-level encumbrance question needs the easement
record, and an inferred width used in its place will be wrong on exactly the parcels where it
matters.

It is also not a substitute for a survey where the question is constructability. Two corridors of the
same nominal width can differ entirely in usable space depending on terrain, access and existing
crossings — which is why the routing surface treats an existing corridor as a cost discount rather
than as a guaranteed alignment.

## Frequently asked questions

### Where do the half-width conventions come from?

Utility design standards and published transmission planning documents, which broadly agree at each
voltage class and differ in the details. Because they are conventions, they belong in configuration
with a citation, and a utility whose standards are known should override the defaults for its own
territory.

### How do I detect double-circuit lines from geometry alone?

You largely cannot — a double-circuit tower carries two circuits on one structure and appears as one
way. The `circuits` tag is the evidence when present, and its absence is why the confidence label
matters. Parallel-run detection finds circuits on separate structures, which is a different and
easier case.

### Should the corridor include the access road?

For land-take estimation, yes, and the conventions above generally already reflect maintained access
within the right-of-way. For a constructability question the access route may run well outside the
corridor, and that is a routing problem rather than a width one.

### What about underground cable?

It has a right-of-way too, usually much narrower — often 6 to 15 metres — and no overhead clearance
requirement. Because the cable tag is recorded on the way, the estimator should branch on it rather
than applying overhead conventions, which over-state underground land take by a factor of three or
more.

### How should low-confidence estimates be presented?

As a range with the basis named, and excluded from any total that will be quoted without
qualification. A corridor whose width rests on a defaulted voltage should not be silently summed with
one corroborated by structure type — reporting the two subtotals separately keeps the aggregate
honest.

### Can the estimate be validated against imagery?

Yes, and it is the most practical check available. Measuring the cleared corridor on recent imagery
for a sample of twenty corridors per voltage class calibrates the conventions for a specific
territory in an afternoon, and the calibrated table then applies to the whole region.


### Should widths be published as a layer or as attributes on the centrelines?

Both, and they answer different questions. The polygon layer is what a land-take or co-location query
needs; the width attribute on the centreline is what a routing surface needs, because a cost raster
wants a number per cell rather than a polygon to intersect. Deriving the polygon from the attribute
keeps the two consistent, and storing only the polygon makes the routing case rebuild it every run.

### How often should the estimate be refreshed?

Whenever the source circuits change, which for an OpenStreetMap-derived layer is continuously and for
a utility extract is quarterly at most. The estimate is cheap to recompute once the parallel-run
grouping is cached, so the practical cadence follows the source rather than a schedule of its own.

## Related

- [Transmission Line & Substation Mapping](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/) — the parent workflow and its tag semantics
- [Mapping High-Voltage Transmission Lines from OpenStreetMap](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/mapping-high-voltage-transmission-lines-from-openstreetmap/) — the tag completeness this inference works around
- [Deduplicating Overlapping Transmission Segments from OpenStreetMap](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/deduplicating-overlapping-transmission-segments-from-openstreetmap/) — separating duplicates from genuine parallel runs
- [Building a Transmission Cost Surface Raster in NumPy](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-routing-and-least-cost-path-analysis/building-a-transmission-cost-surface-raster-in-numpy/) — where the corridor discount is applied
