---
title: Building Multi-Layer Exclusion Masks with GeoPandas Overlay
description: Combine a dozen constraint layers into one exclusion mask without double-counting overlaps or exploding the vertex count — union once, subtract once, and keep a per-layer accounting that reconciles.
slug: building-multi-layer-exclusion-masks-with-geopandas-overlay
type: article
breadcrumb: Building Multi-Layer Exclusion Masks
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Building Multi-Layer Exclusion Masks with GeoPandas Overlay

The scenario is a screening script that runs, produces a buildable-area figure, and disagrees with
the environmental consultant's figure by 14 percent. No exception was raised, both analysts used the
same layers, and neither can immediately say why. This page fixes that class of disagreement, and it
is the mechanical half of
[environmental constraint and exclusion screening](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/environmental-constraint-and-exclusion-screening/).

## Root-cause analysis

Three mechanisms produce a divergent buildable-area figure, and a real disagreement usually involves
more than one.

1. **Sequential subtraction with a sum.** Computing each layer's area, summing those areas, and
   subtracting the sum from the gross area double-counts every overlap. Wetlands sit inside
   floodplains, habitat corridors follow drainage, and the overlap on a typical study area is a
   quarter to a third of the total constrained area.
2. **Chained differences.** `study.difference(a).difference(b).difference(c)` gets the arithmetic
   right and the geometry wrong: each operation adds vertices and slivers along shared edges, and by
   the fourth layer the result carries enough topological noise that its area depends on the order
   the layers were applied in.
3. **A frame that does not preserve area.** A hectare figure computed in a conformal frame is
   latitude-dependent, so two analysts working in different UTM zones or in Web Mercator will
   legitimately disagree — the same distortion covered under
   [projection and CRS quick reference](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/projection-and-crs-quick-reference/).

<svg viewBox="0 0 940 400" role="img" aria-label="Three ways to combine the same four constraint layers, and the three answers they give. Summing the layer areas and subtracting the sum double-counts the overlap and reports 1,890 buildable hectares. Chaining differences gets the arithmetic right but accumulates slivers and vertices, and its answer drifts with the order the layers are applied. Unioning first and subtracting once gives 2,478 hectares, order-independent, with a tenth of the vertices." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Sum, chain, or union — three combination strategies compared</title>
  <desc>Three rows over the same four constraint layers. The first, sum then subtract, produces 1,890 buildable hectares and is marked as double-counting every overlap. The second, chained difference, produces about 2,478 hectares but with 41,000 output vertices and an answer that changes slightly with layer order. The third, union then difference, produces 2,478 hectares with 4,100 vertices and no order dependence. Each row carries its vertex count and whether its answer depends on layer ordering.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="mk1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Same four layers, three combination strategies</text>
  <rect x="40" y="70" width="868" height="76" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3" opacity="0.5"/>
  <text x="62" y="100" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">sum of layer areas, then subtract</text>
  <text x="62" y="124" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">double-counts every overlap</text>
  <text x="700" y="114" text-anchor="end" font-size="15" fill="currentColor" font-weight="700">1 890 ha</text>
  <text x="890" y="114" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.9">—</text>
  <rect x="40" y="160" width="868" height="76" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3" opacity="0.5"/>
  <text x="62" y="190" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">chained .difference() per layer</text>
  <text x="62" y="214" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">answer drifts with layer order</text>
  <text x="700" y="204" text-anchor="end" font-size="15" fill="currentColor" font-weight="700">2 478 ha</text>
  <text x="890" y="204" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.9">41 000 vertices</text>
  <rect x="40" y="250" width="868" height="76" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3" opacity="0.5"/>
  <text x="62" y="280" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">union_all(), then one difference</text>
  <text x="62" y="304" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">order-independent</text>
  <text x="700" y="294" text-anchor="end" font-size="15" fill="currentColor" font-weight="700">2 478 ha</text>
  <text x="890" y="294" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.9">4 100 vertices</text>
  <rect x="40" y="348" width="868" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="369" text-anchor="middle" font-size="11.5" fill="currentColor">The middle row is the dangerous one: it is arithmetically right, so nobody looks at it again — and its</text>
  <text x="474.0" y="386" text-anchor="middle" font-size="11.5" fill="currentColor">geometry degrades until the area depends on the order the shapefiles happened to be listed in.</text>
</svg>

## Pre-flight validation

Before any overlay runs, three properties have to hold: every layer carries a declared CRS, every
geometry is valid, and every layer has been clipped to the study area. The third is not just a
performance measure — an unclipped national layer unioned in full can produce a geometry whose area
exceeds the study area, which then makes the accounting assertions meaningless.

```python
import geopandas as gpd


def preflight_constraint_layers(
    study: gpd.GeoDataFrame,
    layers: dict[str, gpd.GeoDataFrame],
    *,
    working_epsg: int,
) -> dict[str, dict]:
    """Surface the three faults that make an overlay disagree, before it runs."""
    report: dict[str, dict] = {}
    study_area = study.to_crs(working_epsg).union_all()

    for name, gdf in layers.items():
        if gdf.crs is None:
            raise ValueError(f"{name}: undeclared CRS — set_crs() the true source frame first")
        projected = gdf.to_crs(working_epsg)
        invalid = int((~projected.is_valid).sum())
        empty = int(projected.geometry.is_empty.sum())
        intersects = int(projected.geometry.intersects(study_area).sum())
        report[name] = {
            "features": len(projected),
            "invalid": invalid,
            "empty": empty,
            "intersecting_study_area": intersects,
            "source_epsg": gdf.crs.to_epsg(),
        }
        if intersects == 0:
            # Not fatal on its own — a national layer may genuinely miss this county.
            report[name]["warning"] = "no features intersect the study area"
    return report
```

A layer reporting zero intersecting features is normal in isolation and alarming in aggregate: when
every layer reports zero, the study area is almost certainly in a different frame from the
constraints, not in an unconstrained paradise.

## Fix implementation

The correct shape is: clip, repair, union per class, subtract once. GeoPandas `overlay` with
`how="difference"` does the subtraction, and `union_all()` does the union — the important part is
that the union happens before the difference, exactly once.

```python
import geopandas as gpd

EQUAL_AREA_EPSG = 5070


def build_exclusion_mask(
    study: gpd.GeoDataFrame,
    layers: dict[str, gpd.GeoDataFrame],
    *,
    working_epsg: int,
    buffer_m: dict[str, float] | None = None,
) -> tuple[gpd.GeoDataFrame, dict[str, float]]:
    """Return the buildable remainder plus a per-layer hectare accounting."""
    buffer_m = buffer_m or {}
    study_p = study.to_crs(working_epsg)
    study_geom = study_p.union_all()

    per_layer: dict[str, float] = {}
    pieces = []
    for name, gdf in layers.items():
        layer = gdf.to_crs(working_epsg)
        layer["geometry"] = layer.geometry.make_valid()
        # Clip first: this is the single largest cost saving in the whole function.
        clipped = layer.clip(study_geom)
        if clipped.empty:
            per_layer[name] = 0.0
            continue
        geom = clipped.union_all()
        if buffer_m.get(name):
            geom = geom.buffer(buffer_m[name])   # working room, in metres
        per_layer[name] = _ha(geom, working_epsg)
        pieces.append(geom)

    if not pieces:
        return study_p.assign(exclusion_ha=0.0), per_layer

    excluded = gpd.GeoSeries(pieces, crs=study_p.crs).union_all()
    buildable = gpd.GeoDataFrame(
        {"excluded_ha": [_ha(excluded, working_epsg)]},
        geometry=[study_geom.difference(excluded)],
        crs=study_p.crs,
    )
    return buildable, per_layer


def _ha(geom, working_epsg: int) -> float:
    return float(
        gpd.GeoSeries([geom], crs=working_epsg).to_crs(EQUAL_AREA_EPSG).area.iloc[0]
    ) / 10_000.0
```

Two details carry the correctness. `make_valid()` runs before any union, because unioning an invalid
ring produces an area that is wrong without raising. And `_ha` reprojects to an equal-area frame for
every measurement, so the working frame stays free for distance operations without contaminating the
hectare figures.

<svg viewBox="0 0 940 396" role="img" aria-label="What chained differences do to the output geometry. Each successive difference adds vertices along every shared edge and leaves slivers where two boundaries nearly coincide: 1,100 vertices after the first layer, 6,800 after the second, 19,400 after the third and 41,000 after the fourth. Unioning the four layers first and differencing once produces 4,100 vertices and no slivers, because the shared edges are resolved inside the union rather than against the study boundary." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Vertex growth under chained differences versus one union</title>
  <desc>A chart of output vertex count after each of four constraint layers is applied. The chained difference series rises steeply: 1,100 vertices after the first layer, 6,800 after the second, 19,400 after the third and 41,000 after the fourth. A single flat marker shows the union-then-difference result at 4,100 vertices regardless of layer count. An inset shows the sliver polygons that appear along nearly-coincident boundaries in the chained result and are absent from the unioned one.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="mk2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Vertices in the buildable polygon after each layer</text>
  <line x1="110" y1="272" x2="640" y2="272" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="110" y1="70" x2="110" y2="272" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="106" y1="272.0" x2="640" y2="272.0" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="276.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0k</text>
  <line x1="106" y1="227.45454545454544" x2="640" y2="227.45454545454544" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="231.45454545454544" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">10k</text>
  <line x1="106" y1="182.9090909090909" x2="640" y2="182.9090909090909" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="186.9090909090909" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">20k</text>
  <line x1="106" y1="138.36363636363637" x2="640" y2="138.36363636363637" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="142.36363636363637" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">30k</text>
  <line x1="106" y1="93.81818181818181" x2="640" y2="93.81818181818181" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="97.81818181818181" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">40k</text>
  <line x1="110.0" y1="272" x2="110.0" y2="277" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="110.0" y="292" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">layer 1</text>
  <line x1="286.66666666666663" y1="272" x2="286.66666666666663" y2="277" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="286.66666666666663" y="292" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">layer 2</text>
  <line x1="463.3333333333333" y1="272" x2="463.3333333333333" y2="277" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="463.3333333333333" y="292" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">layer 3</text>
  <line x1="640.0" y1="272" x2="640.0" y2="277" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="640.0" y="292" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">layer 4</text>
  <path d="M110.0,267.1 L286.66666666666663,241.70909090909092 L463.3333333333333,185.58181818181816 L640.0,89.36363636363637" fill="none" stroke="#C85B5B" stroke-width="2.8"/>
  <circle cx="110.0" cy="267.1" r="4.5" fill="#C85B5B" stroke="#C85B5B" stroke-width="1"/>
  <circle cx="286.66666666666663" cy="241.70909090909092" r="4.5" fill="#C85B5B" stroke="#C85B5B" stroke-width="1"/>
  <circle cx="463.3333333333333" cy="185.58181818181816" r="4.5" fill="#C85B5B" stroke="#C85B5B" stroke-width="1"/>
  <circle cx="640.0" cy="89.36363636363637" r="4.5" fill="#C85B5B" stroke="#C85B5B" stroke-width="1"/>
  <line x1="110" y1="253.73636363636365" x2="640" y2="253.73636363636365" stroke="#3D8B5F" stroke-width="2.4" stroke-dasharray="6 4"/>
  <text x="634" y="243.73636363636365" text-anchor="end" font-size="11.5" fill="#1F5C3A" font-weight="700">union then one difference — 4 100</text>
  <text x="630.0" y="77.36363636363637" text-anchor="end" font-size="11.5" fill="#7A4A1A" font-weight="700">chained — 41 000</text>
  <rect x="690" y="76" width="218" height="65" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="799.0" y="97" text-anchor="middle" font-size="11.5" fill="currentColor">the extra vertices are</text>
  <text x="799.0" y="114" text-anchor="middle" font-size="11.5" fill="currentColor">slivers along nearly</text>
  <text x="799.0" y="131" text-anchor="middle" font-size="11.5" fill="currentColor">coincident boundaries</text>
  <rect x="690" y="168" width="218" height="65" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="799.0" y="189" text-anchor="middle" font-size="11.5" fill="currentColor">they cost area, memory</text>
  <text x="799.0" y="206" text-anchor="middle" font-size="11.5" fill="currentColor">and every downstream</text>
  <text x="799.0" y="223" text-anchor="middle" font-size="11.5" fill="currentColor">predicate that touches them</text>
  <rect x="110" y="312" width="798" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="509.0" y="333" text-anchor="middle" font-size="11.5" fill="currentColor">Slivers are not cosmetic: each one is a tiny polygon that a later intersection has to evaluate, and a</text>
  <text x="509.0" y="350" text-anchor="middle" font-size="11.5" fill="currentColor">handful of them is what turns a two-second overlay into a two-minute one.</text>
</svg>

## Fallback routing and performance tuning

- **Clip before you union.** A national wetlands layer has millions of vertices; the part inside one
  county has thousands. Clipping first turns the union from the dominant cost into a rounding error.
- **Simplify only what carries no legal weight.** A `simplify(tolerance=1.0)` on an advisory viewshed
  layer is free; the same call on a wetland delineation changes a regulated boundary.
- **Use the spatial index implicitly.** `GeoDataFrame.clip` already queries the index, so an explicit
  `sindex.query` before it buys nothing — the common mistake is doing neither and calling
  `intersection` on the full layer.
- **Union in one call, not in a loop.** `union_all()` on a list is substantially faster than repeated
  pairwise unions, because it can use a cascaded strategy rather than rebuilding the accumulated
  geometry each time.
- **Keep the mask, not the difference, when reusing.** For a portfolio, computing the exclusion union
  once and differencing it against each parcel is far cheaper than rebuilding the union per parcel.

## Downstream validation

The accounting is what makes two analysts agree. Publish the gross area, each layer's clipped area,
the union area, and the difference between the per-layer sum and the union — that difference is the
overlap, and it is the number the disagreement was always about.

```python
def assert_mask_reconciles(gross_ha: float, per_layer: dict[str, float], excluded_ha: float,
                           buildable_ha: float) -> None:
    """CI gate: the three relations that must hold if the arithmetic is right."""
    assert buildable_ha <= gross_ha * 1.0001, "buildable exceeds gross — wrong frame for area"
    assert excluded_ha <= gross_ha * 1.0001, "exclusion exceeds gross — a layer was not clipped"
    assert sum(per_layer.values()) >= excluded_ha * 0.9999, (
        "per-layer sum below the union — a layer was measured in a different CRS"
    )
    assert abs((gross_ha - excluded_ha) - buildable_ha) < max(0.01, gross_ha * 1e-6), (
        "gross − excluded ≠ buildable — the difference and the union disagree"
    )
```

<svg viewBox="0 0 940 372" role="img" aria-label="The four assertions that make two independent analysts agree on a buildable-area figure. Buildable must not exceed gross, which catches an area computed in a conformal frame. The exclusion union must not exceed gross, which catches an unclipped national layer. The sum of per-layer areas must be at least the union, which catches a layer measured in a different CRS. And gross minus excluded must equal buildable, which catches a difference and a union that were computed from different inputs." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Four assertions and the specific disagreement each one prevents</title>
  <desc>A four-row table pairing an assertion with the bug it catches. Buildable area less than or equal to gross area catches area measured in a conformal rather than equal-area frame. Excluded area less than or equal to gross catches a constraint layer that was never clipped to the study area. The sum of per-layer areas being at least the union area catches a layer measured in a different CRS from the union. And gross minus excluded equalling buildable catches a difference computed against a stale union.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="372"/>
  <defs><marker id="mk3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Four assertions, four disagreements they prevent</text>
  <rect x="40" y="68" width="400" height="56" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="240" y="102" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">buildable_ha &lt;= gross_ha</text>
  <line x1="446" y1="96" x2="478" y2="96" stroke="currentColor" stroke-width="1.4" marker-end="url(#mk3-arr)"/>
  <rect x="486" y="68" width="422" height="56" rx="7" fill="none" stroke="#3D8B5F" stroke-width="1.1" opacity="0.6"/>
  <text x="697" y="102" text-anchor="middle" font-size="11.5" fill="currentColor">area computed in a conformal frame</text>
  <rect x="40" y="134" width="400" height="56" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="240" y="168" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">excluded_ha &lt;= gross_ha</text>
  <line x1="446" y1="162" x2="478" y2="162" stroke="currentColor" stroke-width="1.4" marker-end="url(#mk3-arr)"/>
  <rect x="486" y="134" width="422" height="56" rx="7" fill="none" stroke="#3D8B5F" stroke-width="1.1" opacity="0.6"/>
  <text x="697" y="168" text-anchor="middle" font-size="11.5" fill="currentColor">a constraint layer that was never clipped</text>
  <rect x="40" y="200" width="400" height="56" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="240" y="234" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">sum(per_layer) &gt;= excluded_ha</text>
  <line x1="446" y1="228" x2="478" y2="228" stroke="currentColor" stroke-width="1.4" marker-end="url(#mk3-arr)"/>
  <rect x="486" y="200" width="422" height="56" rx="7" fill="none" stroke="#F4A261" stroke-width="1.1" opacity="0.6"/>
  <text x="697" y="234" text-anchor="middle" font-size="11.5" fill="currentColor">a layer measured in a different CRS</text>
  <rect x="40" y="266" width="400" height="56" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="240" y="300" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">gross − excluded == buildable</text>
  <line x1="446" y1="294" x2="478" y2="294" stroke="currentColor" stroke-width="1.4" marker-end="url(#mk3-arr)"/>
  <rect x="486" y="266" width="422" height="56" rx="7" fill="none" stroke="#C85B5B" stroke-width="1.1" opacity="0.6"/>
  <text x="697" y="300" text-anchor="middle" font-size="11.5" fill="currentColor">a difference against a stale union</text>
  <text x="40" y="348" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">Publish the per-layer sum and the union together — the gap between them is the overlap, and it is the first question asked.</text>
</svg>

## Frequently asked questions

### Why does `overlay(how="difference")` return more rows than the input?

Because the difference can split one polygon into several disjoint parts, and GeoPandas returns them
as separate rows unless the geometry is explicitly recombined. That is usually what you want for a
buildable-area map and never what you want for a per-parcel accounting — dissolve back to the input
key before aggregating, or the same parcel appears several times in the totals.

### Should exclusions be buffered before or after the union?

Before, per layer, because different layers need different working-room offsets: a wetland delineation
needs the regulatory buffer, a road needs the construction offset, and a viewshed needs none at all.
Buffering after the union applies one offset to everything and quietly grows the exclusion by more
than any single rule requires.

### What is the fastest way to test one parcel against a prepared mask?

Prepare the mask geometry once and test parcels against the prepared version. The mask is reused
thousands of times in a portfolio run, which is exactly the case prepared geometry exists for — the
preparation cost is amortised after roughly twenty tests.

### How should the mask handle holes?

Leave them as authored. A hole inside a wetland polygon is upland the delineation deliberately
excluded, and it is buildable unless another layer says otherwise. Filling holes "to clean up the
geometry" is a common and expensive tidying instinct: it removes real buildable land and is invisible
in the final map.


### Does the mask need to be a single polygon?

No, and forcing it to be one is usually a mistake. A study area with several disjoint buildable
pockets is genuinely a MultiPolygon, and dissolving it into one geometry with a convex hull or a
generous buffer merges pockets that are separated by real constraints. Keep the parts, and report
their count and their individual areas — a single 400-hectare pocket and eight 50-hectare pockets are
very different projects.

### How should the mask be stored between runs?

As a versioned artefact keyed on the layer versions that produced it, in the working CRS, with the
per-layer accounting alongside. Recomputing a national mask for every parcel is the most common
performance mistake in this stage, and caching the geometry without caching what produced it is the
most common correctness one — a mask whose provenance is unknown cannot be reused with confidence.

### What tolerance should be used when comparing two analysts' figures?

Small: a fraction of a percent. Once both figures are computed in an equal-area frame from the same
layer versions with the same buffers, they should agree to within floating-point noise. A gap larger
than that is not tolerance — it is a difference in inputs or in method, and chasing it down is how
the discrepancy in the opening paragraph gets resolved.

## Related

- [Environmental Constraint & Exclusion Screening](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/environmental-constraint-and-exclusion-screening/) — the parent workflow and its classification rules
- [Detecting & Removing Sliver Polygons in GeoPandas](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/detecting-and-removing-sliver-polygons-in-geopandas/) — cleaning the slivers a chained difference creates
- [Clipping Solar Parcels to County Setback Boundaries in GeoPandas](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/clipping-solar-parcels-to-county-setback-boundaries-in-geopandas/) — the same union-then-subtract discipline for statutory setbacks
- [Projection & CRS Quick Reference](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/projection-and-crs-quick-reference/) — choosing the equal-area frame the accounting needs
