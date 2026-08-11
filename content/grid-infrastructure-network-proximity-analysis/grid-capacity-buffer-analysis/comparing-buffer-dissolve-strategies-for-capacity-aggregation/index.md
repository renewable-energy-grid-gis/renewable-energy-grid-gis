---
title: Comparing Buffer Dissolve Strategies for Capacity Aggregation
description: Four ways to dissolve overlapping capacity buffers and what each reports — union with minimum reconciliation, weighted overlay, Voronoi allocation and no dissolve at all, with the megawatts each one manufactures or hides.
slug: comparing-buffer-dissolve-strategies-for-capacity-aggregation
type: article
breadcrumb: Comparing Buffer Dissolve Strategies
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Comparing Buffer Dissolve Strategies for Capacity Aggregation

The scenario: two screening runs over the same substation set report 1,840 MW and 620 MW of
available capacity in the same corridor. Both used the same buffers, the same headroom figures and
the same geometry library. They differ only in how overlapping zones were dissolved, and that choice
is worth a factor of three. This page compares the four strategies that actually get used, and it
extends
[grid capacity buffer analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/).

## Root-cause analysis

Dissolution is where a spatial question becomes an electrical claim, and the strategies disagree
because they answer subtly different questions.

1. **Union with a sum** answers "how much headroom exists among the assets serving this area" — and
   because overlapping assets usually share an upstream constraint, the sum promises capacity the
   network cannot deliver.
2. **Union with a minimum** answers "how much can any single point in this area be sure of" — which
   is conservative and correct for siting, and pessimistic where two genuinely independent assets
   overlap.
3. **No dissolve at all** answers "what does each asset offer" and pushes the reconciliation onto
   whoever reads the map, which in practice means the maximum is read off and the shared constraint
   is forgotten.
4. **Allocation** — Voronoi or capacity-weighted — answers "which asset would actually serve this
   point", which is the closest analogue to how an interconnection is assigned and the hardest to
   defend without a network model.

<svg viewBox="0 0 940 424" role="img" aria-label="Four dissolve strategies applied to the same three overlapping capacity zones of 120, 80 and 45 megawatts. No dissolve leaves three overlapping zones and lets a reader take the maximum. Union with a sum reports 245 megawatts across one zone. Union with a minimum reports 45. Allocation cuts the zones at the midlines and reports each asset over the area it would actually serve." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>The same three zones under four dissolve strategies</title>
  <desc>Four small plan views of the same three overlapping circular capacity zones labelled 120, 80 and 45 megawatts. The first, no dissolve, keeps the three circles overlapping and is annotated as leaving the reconciliation to the reader. The second, union with a sum, merges them into one outline reporting 245 megawatts and is marked as manufacturing capacity. The third, union with a minimum, merges them into the same outline reporting 45 megawatts and is marked as the defensible screening choice. The fourth, allocation, cuts the merged outline into three cells at the midlines between assets, each carrying its own asset capacity.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="424"/>
  <defs><marker id="bd1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Three zones · 120, 80 and 45 MW · four ways to combine them</text>
  <text x="130" y="68" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">no dissolve</text>
  <circle cx="104" cy="158" r="48" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5" opacity="0.45"/>
  <text x="104" y="162" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">120</text>
  <circle cx="156" cy="150" r="40" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5" opacity="0.45"/>
  <text x="156" y="154" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">80</text>
  <circle cx="134" cy="202" r="34" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5" opacity="0.45"/>
  <text x="134" y="206" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">45</text>
  <text x="130" y="288" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">reader takes the maximum</text>
  <text x="356" y="68" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">union + sum</text>
  <path d="M330,110 A48,48 0 0,1 382,110 A40,40 0 0,1 422,150 A40,40 0 0,1 394,226 A34,34 0 0,1 326,226 A48,48 0 0,1 330,110 Z" fill="#F6DCDC" fill-opacity="0.5" stroke="#C85B5B" stroke-width="1.8"/>
  <text x="356" y="182" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">245 MW</text>
  <text x="356" y="288" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">245 MW — manufactured</text>
  <text x="582" y="68" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">union + min</text>
  <path d="M556,110 A48,48 0 0,1 608,110 A40,40 0 0,1 648,150 A40,40 0 0,1 620,226 A34,34 0 0,1 552,226 A48,48 0 0,1 556,110 Z" fill="#DDF0E2" fill-opacity="0.5" stroke="#3D8B5F" stroke-width="1.8"/>
  <text x="582" y="182" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">45 MW</text>
  <text x="582" y="288" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">45 MW — defensible</text>
  <text x="808" y="68" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">allocate</text>
  <circle cx="782" cy="158" r="48" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4" opacity="0.35"/>
  <circle cx="834" cy="150" r="40" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4" opacity="0.35"/>
  <circle cx="812" cy="202" r="34" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4" opacity="0.35"/>
  <line x1="804" y1="110" x2="814" y2="188" stroke="currentColor" stroke-width="1.6" stroke-dasharray="4 3"/>
  <line x1="814" y1="188" x2="870" y2="216" stroke="currentColor" stroke-width="1.6" stroke-dasharray="4 3"/>
  <line x1="814" y1="188" x2="754" y2="220" stroke="currentColor" stroke-width="1.6" stroke-dasharray="4 3"/>
  <text x="782" y="162" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">120</text>
  <text x="834" y="154" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">80</text>
  <text x="812" y="206" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">45</text>
  <text x="808" y="288" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">per-asset service areas</text>
  <rect x="40" y="314" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="333" text-anchor="middle" font-size="11" fill="currentColor">Identical geometry, three different numbers: the strategy is the answer, not an implementation detail —</text>
  <text x="474.0" y="348" text-anchor="middle" font-size="11" fill="currentColor">and a figure that travels without its strategy name cannot be compared with anyone else’s.</text>
  <text x="40" y="400" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">Allocation is the only strategy that changes the outlines as well as the numbers.</text>
</svg>

## Pre-flight validation

Before choosing, measure how much overlap exists. A corridor with negligible overlap makes the choice
irrelevant; a dense one makes it the dominant assumption in the whole screen.

```python
import geopandas as gpd


def overlap_profile(zones: gpd.GeoDataFrame, *, capacity_field: str = "available_capacity_mw") -> dict:
    """How much of the buffered area is covered by more than one asset."""
    union_area = zones.geometry.union_all().area
    sum_area = float(zones.geometry.area.sum())
    overlap_area = sum_area - union_area

    # Depth: how many zones cover the typical overlapping point.
    inter = gpd.overlay(zones, zones, how="intersection", keep_geom_type=True)
    inter = inter[inter[f"{capacity_field}_1"] != inter[f"{capacity_field}_2"]]

    return {
        "zones": len(zones),
        "union_area_km2": union_area / 1e6,
        "summed_area_km2": sum_area / 1e6,
        "overlap_share": overlap_area / sum_area if sum_area else 0.0,
        "overlapping_pairs": len(inter) // 2,
        "sum_capacity_mw": float(zones[capacity_field].sum()),
        "min_capacity_mw": float(zones[capacity_field].min()),
    }
```

An overlap share below about five percent means any strategy will do; above twenty percent the
strategy is the answer, and it belongs in the report rather than in the code.

## Fix implementation

```python
import geopandas as gpd
from shapely.ops import unary_union


def dissolve_capacity_zones(
    zones: gpd.GeoDataFrame,
    *,
    strategy: str = "union_min",
    capacity_field: str = "available_capacity_mw",
    id_field: str = "substation_id",
) -> gpd.GeoDataFrame:
    """Dissolve overlapping capacity zones under an explicit, named strategy."""
    if strategy == "none":
        out = zones.copy()
        out["strategy"] = "none"
        out["contributors"] = out[id_field].apply(lambda v: [v])
        return out

    if strategy in ("union_min", "union_sum"):
        merged = unary_union(zones.geometry.values)
        parts = list(merged.geoms) if merged.geom_type == "MultiPolygon" else [merged]
        rows = []
        for part in parts:
            contributing = zones[zones.geometry.intersects(part)]
            capacity = (
                contributing[capacity_field].min()
                if strategy == "union_min"
                else contributing[capacity_field].sum()
            )
            rows.append({
                "geometry": part,
                capacity_field: float(capacity),
                "contributors": list(contributing[id_field]),
                "binding_asset": contributing.loc[contributing[capacity_field].idxmin(), id_field],
                "strategy": strategy,
            })
        return gpd.GeoDataFrame(rows, crs=zones.crs)

    if strategy == "allocate":
        # Every point is served by its nearest asset; zones are cut at the midlines.
        allocated = gpd.overlay(
            zones, zones, how="union", keep_geom_type=True
        ).dissolve(by=id_field, aggfunc="first").reset_index()
        allocated["strategy"] = "allocate"
        allocated["contributors"] = allocated[id_field].apply(lambda v: [v])
        return allocated

    raise ValueError(f"unknown dissolve strategy {strategy!r}")
```

Carrying `contributors` and `binding_asset` on every dissolved polygon is what makes the result
reviewable: a zone that reports 45 MW should be able to say which asset held it down.

<svg viewBox="0 0 940 400" role="img" aria-label="What each strategy reports over one dense corridor of 34 substations. No dissolve leaves 34 zones whose maximum is 210 megawatts. Union with a sum reports 1,840. Union with a minimum reports 620 across nine contiguous areas. Allocation reports 1,180 spread over 34 service cells. The spread between the highest and lowest defensible figure is a factor of three, on identical inputs." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>One corridor, four totals</title>
  <desc>A bar chart of the total capacity each dissolve strategy reports for the same corridor of 34 substations: union with a sum at 1,840 megawatts, allocation at 1,180, union with a minimum at 620, and no dissolve reporting a maximum single zone of 210. Each bar is annotated with the number of output polygons — one, 34, nine and 34 respectively — and with whether the figure can be promised to a developer. A note gives the overlap share of the corridor as 31 percent, which is what makes the spread so large.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="bd2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">34 substations, 31% overlap — four totals</text>
  <text x="230" y="110" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">union + sum</text>
  <rect x="246" y="78" width="522.9473684210526" height="52" rx="5" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="780.9473684210526" y="102" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">1 840 MW</text>
  <text x="780.9473684210526" y="122" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">1 polygon · upper bound only</text>
  <text x="230" y="176" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">allocate</text>
  <rect x="246" y="144" width="335.36842105263156" height="52" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="593.3684210526316" y="168" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">1 180 MW</text>
  <text x="593.3684210526316" y="188" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">34 service cells · needs a network model</text>
  <text x="230" y="242" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">union + min</text>
  <rect x="246" y="210" width="176.21052631578948" height="52" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="434.2105263157895" y="234" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">620 MW</text>
  <text x="434.2105263157895" y="254" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">9 contiguous areas · promisable</text>
  <text x="230" y="308" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">no dissolve (max zone)</text>
  <rect x="246" y="276" width="59.68421052631579" height="52" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="317.6842105263158" y="300" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">210 MW</text>
  <text x="317.6842105263158" y="320" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">34 zones · per-asset only</text>
  <rect x="40" y="348" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="367" text-anchor="middle" font-size="11" fill="currentColor">At 31% overlap the strategy dominates every other assumption in the screen. Below about 5% overlap it</text>
  <text x="474.0" y="382" text-anchor="middle" font-size="11" fill="currentColor">makes almost no difference — which is why the overlap share belongs in the pre-flight report.</text>
</svg>

## Fallback routing and performance tuning

- **Dissolve once, at the end.** Buffering, dissolving and re-buffering compounds vertex counts;
  build every buffer first, then dissolve in a single `unary_union`.
- **Simplify before the union, never after.** A one-metre simplification on a buffer of several
  kilometres is invisible and can halve the union cost; simplifying the dissolved result moves the
  published boundary.
- **Use `union_all` rather than a pairwise loop.** The cascaded implementation is substantially
  faster on hundreds of zones and produces the same geometry.
- **Watch the part count.** A dissolve that returns hundreds of parts usually means the buffers are
  too small for the asset spacing, which is a modelling signal rather than a performance one.
- **Keep the undissolved zones.** They are the evidence for the dissolved figure, and regenerating
  them costs another full buffer pass.

## Downstream validation

```python
def assert_dissolve_conservative(dissolved, original, *, capacity_field="available_capacity_mw") -> None:
    """A dissolve may not manufacture capacity, and must name what bound each zone."""
    assert dissolved[capacity_field].sum() <= original[capacity_field].sum() + 1e-6, (
        "dissolved capacity exceeds the sum of the inputs — a strategy that adds headroom"
    )
    assert dissolved.geometry.is_valid.all(), "invalid geometry produced by the dissolve"
    assert dissolved["contributors"].map(len).min() >= 1, "a dissolved zone with no contributors"
    if "binding_asset" in dissolved:
        assert dissolved["binding_asset"].notna().all(), "a zone with no binding asset recorded"
    union_before = original.geometry.union_all().area
    union_after = dissolved.geometry.union_all().area
    assert abs(union_after - union_before) / union_before < 1e-6, (
        "the dissolved footprint differs from the input footprint — geometry was lost or grown"
    )
```

## Choosing between them in practice

<svg viewBox="0 0 940 388" role="img" aria-label="Four assertions that hold whichever dissolve strategy is chosen. Dissolved capacity may never exceed the sum of the inputs, which catches a strategy that adds headroom. The dissolved footprint must equal the input footprint, which catches geometry lost or grown by the union. Every zone must name at least one contributor, and every zone must record the asset that bound it — without which the number cannot be defended." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Four strategy-independent assertions on a dissolved capacity layer</title>
  <desc>A four-row table pairing an assertion with the failure it catches. Dissolved capacity less than or equal to the input sum catches a strategy that manufactures headroom. The dissolved union area equalling the input union area catches geometry lost or grown during the dissolve. Every zone having at least one contributor catches an orphaned polygon produced by a geometry error. Every zone recording a binding asset catches a result that cannot be explained to a reviewer.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="388"/>
  <defs><marker id="bd3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">These hold whichever strategy was chosen</text>
  <rect x="40" y="68" width="400" height="58" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="240" y="103" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">dissolved MW &lt;= sum(input MW)</text>
  <line x1="446" y1="97" x2="478" y2="97" stroke="currentColor" stroke-width="1.4" marker-end="url(#bd3-arr)"/>
  <rect x="486" y="68" width="422" height="58" rx="7" fill="none" stroke="#C85B5B" stroke-width="1.1" opacity="0.6"/>
  <text x="697" y="103" text-anchor="middle" font-size="11.5" fill="currentColor">a strategy that manufactures headroom</text>
  <rect x="40" y="136" width="400" height="58" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="240" y="171" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">union area unchanged</text>
  <line x1="446" y1="165" x2="478" y2="165" stroke="currentColor" stroke-width="1.4" marker-end="url(#bd3-arr)"/>
  <rect x="486" y="136" width="422" height="58" rx="7" fill="none" stroke="#F4A261" stroke-width="1.1" opacity="0.6"/>
  <text x="697" y="171" text-anchor="middle" font-size="11.5" fill="currentColor">geometry lost or grown by the dissolve</text>
  <rect x="40" y="204" width="400" height="58" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="240" y="239" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">len(contributors) &gt;= 1</text>
  <line x1="446" y1="233" x2="478" y2="233" stroke="currentColor" stroke-width="1.4" marker-end="url(#bd3-arr)"/>
  <rect x="486" y="204" width="422" height="58" rx="7" fill="none" stroke="#5BA8C8" stroke-width="1.1" opacity="0.6"/>
  <text x="697" y="239" text-anchor="middle" font-size="11.5" fill="currentColor">an orphaned polygon from a geometry error</text>
  <rect x="40" y="272" width="400" height="58" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="240" y="307" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">binding_asset recorded</text>
  <line x1="446" y1="301" x2="478" y2="301" stroke="currentColor" stroke-width="1.4" marker-end="url(#bd3-arr)"/>
  <rect x="486" y="272" width="422" height="58" rx="7" fill="none" stroke="#3D8B5F" stroke-width="1.1" opacity="0.6"/>
  <text x="697" y="307" text-anchor="middle" font-size="11.5" fill="currentColor">a number that cannot be explained</text>
  <text x="40" y="356" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">The strategy name belongs on every row of the output; these four assertions are what make it checkable.</text>
</svg>

The four strategies are not interchangeable, and the decision follows from what the number will be
used for.

**Screening a portfolio** wants `union_min`. It cannot over-promise, it produces one figure per
contiguous area, and the binding asset is exactly the constraint a developer needs to know about.
Its pessimism in the rare case of two genuinely independent assets is the right direction to be wrong
in.

**Marketing a service territory** — showing where capacity broadly exists — can use `union_sum`
provided the figure is labelled as an upper bound and never as available headroom. The distinction
sounds pedantic and is the whole difference between a map and a commitment.

**Assigning a specific project to a specific asset** wants `allocate`, because that is the question:
which substation would this project actually connect to. It needs a network model to be defensible,
and without one it is a nearest-neighbour heuristic wearing an electrical costume.

**Diagnostics** want `none`. When a number looks wrong, the undissolved zones with their individual
capacities are what shows whether the problem is the buffer radii, the headroom figures or the
dissolve.

Publishing the strategy name alongside the number is not optional. Two figures that differ by a
factor of three are not comparable, and nothing else in the output distinguishes them.

## Frequently asked questions

### Is the minimum ever too conservative to be useful?

Occasionally, and the honest response is to report both the minimum and the count of contributors
rather than to switch strategies. A zone with one contributor at 45 MW and a zone with six
contributors whose minimum is 45 MW are very different situations, and the contributor count carries
that difference without changing the headline number.

### What if two overlapping assets are genuinely independent?

Then the minimum understates, and the fix is a network model rather than a different dissolve. In
practice, independence is rare enough at the distances these buffers cover that assuming it is a
worse error than assuming shared constraint. Where a planner confirms independence, the pair can be
excluded from the dissolve and carried as separate zones with a note.

### Does the choice affect the geometry or only the attributes?

Union strategies produce identical geometry and different attributes; allocation produces different
geometry, because it cuts the zones at the midlines between assets. That is worth knowing when
comparing two maps: identical outlines with different numbers means a reconciliation difference, and
different outlines mean a different strategy entirely.

### How should the strategy be recorded?

As a column on every output row and a field in the run record, not as a note in a report. A dissolved
layer that travels without its strategy is unusable by anyone who did not produce it, and the column
costs nothing.

### Can capacity be allocated proportionally instead of by minimum?

It can, and it is the least defensible of the options. Proportional allocation implies a sharing rule
that the interconnection process does not follow — queue position, not proximity or size, decides who
gets the headroom. It produces a smooth, plausible map and a number no planner will confirm.

### What about capacity that is available only seasonally?

Dissolve per season and publish the binding season alongside the figure. A zone that offers 87 MW in
winter and 12 in summer is genuinely a 12 MW zone for a project that must deliver at the summer peak,
and collapsing the two into an annual average hides exactly the constraint that binds.


### How do I compare two screens that used different strategies?

Re-run one of them. There is no conversion factor between a summed figure and a minimum figure —
the ratio depends entirely on how much overlap the corridor has and how the capacities are
distributed among the overlapping assets. Because the undissolved zones are cheap to keep, the
practical answer is to store them and re-dissolve under the other strategy, which takes seconds and
produces a genuinely comparable pair.

### Does the strategy change how many polygons the layer holds?

Substantially, and it is a useful smoke test. A union strategy collapses a corridor to a handful of
contiguous areas, while allocation returns one cell per asset and no dissolve returns one zone per
asset. A layer whose polygon count matches the asset count was not unioned, whatever the metadata
says.

## Related

- [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) — the parent workflow and its minimum-not-sum rule
- [Modeling Thermal Headroom for Interconnection Screening](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/modeling-thermal-headroom-for-interconnection-screening/) — where the per-asset capacity figures come from
- [Calculating 5 km Proximity Buffers Around Substations in Shapely](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/calculating-5km-proximity-buffers-around-substations-in-shapely/) — building the zones this page dissolves
- [Modeling Substation Connectivity Graphs with NetworkX](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-routing-and-least-cost-path-analysis/modeling-substation-connectivity-graphs-with-networkx/) — the network model an allocation strategy needs
