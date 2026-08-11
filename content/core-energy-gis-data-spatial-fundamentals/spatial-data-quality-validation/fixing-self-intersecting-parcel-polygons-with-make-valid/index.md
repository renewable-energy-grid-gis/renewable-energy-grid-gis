---
title: Fixing Self-Intersecting Parcel Polygons with make_valid
description: Repair invalid parcel geometry without changing what it means — read the reason string first, choose between make_valid, set_precision and a buffer, and assert the area the repair was allowed to move.
slug: fixing-self-intersecting-parcel-polygons-with-make-valid
type: article
breadcrumb: Fixing Self-Intersecting Parcels
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Fixing Self-Intersecting Parcel Polygons with make_valid

The scenario: an overlay raises `TopologyException: Input geom 1 is invalid`, someone applies
`make_valid` to the whole layer, the overlay runs, and the parcel count comes out 12 higher than the
input. A bowtie was repaired into two polygons, each inherited the original parcel identifier, and
the acreage is now double-counted for every one of those parcels. This page repairs geometry without
that outcome, and it sits under
[spatial data quality and validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/).

## Root-cause analysis

A blanket repair fails because "invalid" covers several defects with different correct treatments.

1. **A bowtie self-intersection.** The ring crosses itself once, and `make_valid` correctly returns a
   MultiPolygon of the two lobes. Correct geometrically, and a data error if the row keeps one
   identifier — the parcel is now two rows or one multipart geometry, and downstream counts change.
2. **A zero-width spike or a duplicate vertex.** Two vertices coincide or a spur doubles back with no
   area. `make_valid` will handle it, but `set_precision` with a grid size is cheaper, deterministic
   and does not change the polygon's structure.
3. **A hole outside its shell.** A ring recorded as an interior that lies wholly outside the exterior.
   The repair is a ring reassignment — the "hole" is a separate polygon — and `make_valid` may
   discard it entirely, silently losing a parcel.
4. **Ring orientation.** Not invalid under the OGC rules that GEOS enforces, but invalid under RFC
   7946, which is why a layer that passes `is_valid` can still be rejected by a permitting portal.

<svg viewBox="0 0 940 424" role="img" aria-label="Four invalidity reasons on a national parcel extract, with how often each occurs and what each repair costs. Repeated points account for 396 of 412 invalid geometries and are fixed by a precision snap that moves no area. Self-intersections account for 12 and produce a multipart result. Rings self-intersecting account for 2. A hole outside its shell accounts for 2 and is the one case make_valid can silently discard." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Invalidity reasons by frequency, and the repair each needs</title>
  <desc>A table of four invalidity reasons from a national parcel extract of 412 invalid geometries. Repeated Point: 396 occurrences, repaired by set_precision, area moved under one part per million, structure preserved. Self-intersection: 12 occurrences, repaired by make_valid, produces a multipart result, area moved by the overlapping lobe. Ring Self-intersection: 2 occurrences, repaired by make_valid, structure preserved. Hole lies outside shell: 2 occurrences, needs an explicit ring reassignment because make_valid may discard the ring and lose land.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="424"/>
  <defs><marker id="mv1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">412 invalid geometries, four reasons, four repairs</text>
  <rect x="40" y="72" width="868" height="68" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3" opacity="0.48"/>
  <text x="64" y="102" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">Repeated Point</text>
  <text x="64" y="124" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.88">area moves &lt; 1e-6 · structure kept</text>
  <rect x="560" y="92" width="124.8" height="24" rx="3" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1" opacity="0.55"/>
  <text x="694.8" y="110" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">396</text>
  <text x="884" y="110" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">set_precision(0.001)</text>
  <rect x="40" y="150" width="868" height="68" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3" opacity="0.48"/>
  <text x="64" y="180" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">Self-intersection</text>
  <text x="64" y="202" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.88">multipart result · area moves by the lobe</text>
  <rect x="560" y="170" width="9.6" height="24" rx="3" fill="#F4A261" stroke="#F4A261" stroke-width="1" opacity="0.55"/>
  <text x="579.6" y="188" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">12</text>
  <text x="884" y="188" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">make_valid</text>
  <rect x="40" y="228" width="868" height="68" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3" opacity="0.48"/>
  <text x="64" y="258" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">Ring Self-intersection</text>
  <text x="64" y="280" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.88">structure kept</text>
  <rect x="560" y="248" width="6.6" height="24" rx="3" fill="#F4A261" stroke="#F4A261" stroke-width="1" opacity="0.55"/>
  <text x="576.6" y="266" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">2</text>
  <text x="884" y="266" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">make_valid</text>
  <rect x="40" y="306" width="868" height="68" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3" opacity="0.48"/>
  <text x="64" y="336" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">Hole lies outside shell</text>
  <text x="64" y="358" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.88">make_valid may discard the ring</text>
  <rect x="560" y="326" width="6.6" height="24" rx="3" fill="#C85B5B" stroke="#C85B5B" stroke-width="1" opacity="0.55"/>
  <text x="576.6" y="344" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">2</text>
  <text x="884" y="344" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">explicit ring reassignment</text>
  <rect x="40" y="392" width="868" height="22" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="410" text-anchor="middle" font-size="11" fill="currentColor">96% of the work is a vectorised precision snap; the 4% that needs judgement is the 4% worth reading.</text>
</svg>

## Pre-flight validation: read the reason before repairing

`shapely.validation.explain_validity` names the defect and gives its coordinates. Grouping a layer by
reason turns a blanket repair into four targeted ones.

```python
import geopandas as gpd
from shapely.validation import explain_validity


def classify_invalidity(gdf: gpd.GeoDataFrame) -> gpd.pd.DataFrame:
    """Group invalid geometry by the reason GEOS gives, with an example each."""
    invalid = gdf[~gdf.is_valid]
    if invalid.empty:
        return gpd.pd.DataFrame(columns=["reason", "count", "example_index"])

    reasons = invalid.geometry.apply(explain_validity)
    # The reason string carries coordinates; the kind is the part before the bracket.
    kind = reasons.str.split("[").str[0].str.strip()
    summary = (
        gpd.pd.DataFrame({"kind": kind, "reason": reasons, "idx": invalid.index})
        .groupby("kind")
        .agg(count=("idx", "size"), example_index=("idx", "first"), example=("reason", "first"))
        .reset_index()
        .sort_values("count", ascending=False)
    )
    return summary
```

Running this first is what distinguishes "412 invalid geometries" from "398 duplicate vertices, 12
bowties and 2 holes outside their shell" — three different repairs with three different risks.

## Fix implementation

```python
import geopandas as gpd
import shapely
from shapely.validation import explain_validity, make_valid


def repair_parcels(
    gdf: gpd.GeoDataFrame,
    *,
    id_field: str = "parcel_id",
    precision_grid_m: float = 0.001,
    area_tolerance: float = 1e-6,
) -> tuple[gpd.GeoDataFrame, gpd.pd.DataFrame]:
    """Repair by reason, keep one row per parcel, and record what each repair moved."""
    out = gdf.copy()
    log = []

    invalid_mask = ~out.is_valid
    for idx in out.index[invalid_mask]:
        geom = out.at[idx, "geometry"]
        reason = explain_validity(geom)
        before = geom.area

        if "Repeated Point" in reason or "Self-intersection" in reason and geom.is_simple:
            # Precision snapping is deterministic and preserves structure.
            repaired = shapely.set_precision(geom, precision_grid_m)
        else:
            repaired = make_valid(geom)

        # A repair that returns several polygons must stay ONE row for this parcel.
        if repaired.geom_type == "GeometryCollection":
            polys = [g for g in repaired.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
            repaired = shapely.union_all(polys) if polys else repaired
        if repaired.geom_type == "MultiPolygon":
            parts = len(repaired.geoms)
        else:
            parts = 1

        out.at[idx, "geometry"] = repaired
        log.append({
            id_field: out.at[idx, id_field],
            "reason": reason.split("[")[0].strip(),
            "area_before": before,
            "area_after": repaired.area,
            "area_delta": repaired.area - before,
            "parts_after": parts,
        })

    report = gpd.pd.DataFrame(log)
    if not report.empty:
        report["area_delta_pct"] = report["area_delta"] / report["area_before"].replace(0, float("nan")) * 100
    return out, report
```

The two decisions that keep the parcel count stable are collapsing a `GeometryCollection` to its
polygonal parts and leaving a MultiPolygon as one row. A repair that explodes into several rows is
almost never what a parcel layer wants — the parcel is still one legal object.

<svg viewBox="0 0 940 412" role="img" aria-label="What each repair does to a bowtie. buffer(0) returns the larger lobe and silently drops the smaller one, losing 1.8 hectares with no record. make_valid returns both lobes as a MultiPolygon, preserving the area but producing a multipart geometry that must stay on one row. set_precision does not repair a genuine self-intersection at all and leaves the geometry invalid, which is the honest outcome for the wrong tool." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>A bowtie under three repairs</title>
  <desc>Three panels over the same bowtie polygon whose ring crosses itself once, forming a larger lobe of 12.4 hectares and a smaller one of 1.8. The first panel, buffer(0), shows only the larger lobe retained and is annotated as silently losing 1.8 hectares. The second, make_valid, shows both lobes retained as a MultiPolygon totalling 14.2 hectares, annotated as correct provided the result stays on one row. The third, set_precision, shows the unchanged bowtie, annotated as still invalid because a precision snap cannot resolve a genuine crossing.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="412"/>
  <defs><marker id="mv2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The same bowtie, three tools, three outcomes</text>
  <text x="150" y="68" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">buffer(0)</text>
  <polygon points="60,100 210,100 146,166" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.8"/>
  <polygon points="146,166 230,210 80,210" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.25"/>
  <text x="150" y="258" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">12.4 ha — 1.8 ha lost silently</text>
  <text x="446" y="68" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">make_valid</text>
  <polygon points="356,100 506,100 442,166" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.8"/>
  <polygon points="442,166 526,210 376,210" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.8"/>
  <text x="446" y="258" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">14.2 ha — MultiPolygon, one row</text>
  <text x="742" y="68" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">set_precision</text>
  <polygon points="652,100 802,100 738,166" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.8"/>
  <polygon points="738,166 822,210 672,210" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.8"/>
  <circle cx="738" cy="166" r="7" fill="none" stroke="#C85B5B" stroke-width="2"/>
  <text x="742" y="258" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">unchanged — still invalid</text>
  <rect x="60" y="288" width="848" height="40" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="484.0" y="307" text-anchor="middle" font-size="11" fill="currentColor">buffer(0) is the dangerous one: it succeeds, returns a valid polygon, and the missing lobe leaves no trace</text>
  <text x="484.0" y="322" text-anchor="middle" font-size="11" fill="currentColor">in the output. The area assertion in the repair report is what catches it.</text>
  <rect x="60" y="352" width="848" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="484.0" y="371" text-anchor="middle" font-size="11" fill="currentColor">A MultiPolygon result belongs on one row under the original parcel identifier — exploding it to several rows</text>
  <text x="484.0" y="386" text-anchor="middle" font-size="11" fill="currentColor">double-counts the parcel in every downstream total.</text>
</svg>

## Fallback routing and performance tuning

- **Prefer `set_precision` where it applies.** It is deterministic, orders of magnitude cheaper than
  `make_valid` on a large layer, and it cannot restructure a polygon into a collection.
- **Never use `buffer(0)` on a parcel layer.** It works, and it silently drops the smaller lobe of a
  bowtie — which is the one outcome nobody notices until the acreage is challenged.
- **Repair before the overlay, not inside it.** GEOS will raise mid-operation otherwise, and the
  partial result is discarded, so the whole overlay is repeated.
- **Vectorise with `shapely.make_valid` on the array.** Shapely 2 applies it over a GeoSeries without
  a Python loop, which on a national layer is the difference between minutes and an hour.
- **Keep the pre-repair geometry.** A repair is a modification of source data, and the original is
  what an auditor asks for when a boundary is disputed.

## Downstream validation

```python
def assert_repair_conservative(report, *, max_area_shift_pct: float = 0.5, max_new_parts: int = 1) -> None:
    """A repair should fix topology, not redraw parcels."""
    if report.empty:
        return
    worst = report["area_delta_pct"].abs().max()
    assert worst <= max_area_shift_pct, (
        f"a repair moved {worst:.3f}% of a parcel's area — inspect before accepting"
    )
    exploded = report[report["parts_after"] > max_new_parts]
    assert exploded.empty, (
        f"{len(exploded)} parcels became multipart: {list(exploded['parcel_id'])[:5]} — "
        "confirm these are genuinely multipart holdings"
    )
```

<svg viewBox="0 0 940 396" role="img" aria-label="The area a repair is allowed to move, drawn as a tolerance band. A precision snap moves area by parts per million and sits far inside the band. A bowtie repair moves it by the overlapping lobe — here 0.31 percent — which clears the 0.5 percent threshold and warrants a look. A buffer(0) that dropped a lobe moves it by 12.7 percent and fails outright, which is the assertion doing its job." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Area moved by repair, against the acceptance threshold</title>
  <desc>A horizontal scale of area change from zero to fifteen percent, with a green acceptance band below 0.5 percent. Three repairs are plotted: a precision snap at under 0.0001 percent, well inside the band; a make_valid bowtie repair at 0.31 percent, inside the band but flagged for review; and a buffer(0) that dropped a lobe at 12.7 percent, far outside and failing the assertion. A note records that the assertion is what turns a silent geometry change into a build failure.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="mv3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">How much area a repair moved — and whether that is acceptable</text>
  <line x1="110" y1="170" x2="880" y2="170" stroke="currentColor" stroke-width="1.6" opacity="0.6"/>
  <line x1="110.0" y1="163" x2="110.0" y2="177" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <text x="110.0" y="198" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0.00001%</text>
  <line x1="358.38709677419354" y1="163" x2="358.38709677419354" y2="177" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <text x="358.38709677419354" y="198" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0.001%</text>
  <line x1="606.7741935483871" y1="163" x2="606.7741935483871" y2="177" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <text x="606.7741935483871" y="198" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0.1%</text>
  <line x1="730.9677419354838" y1="163" x2="730.9677419354838" y2="177" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <text x="730.9677419354838" y="198" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1%</text>
  <line x1="855.1612903225806" y1="163" x2="855.1612903225806" y2="177" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <text x="855.1612903225806" y="198" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">10%</text>
  <rect x="110" y="126" width="583.5817586030216" height="30" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4" opacity="0.65"/>
  <text x="401.7908793015108" y="146" text-anchor="middle" font-size="11.5" fill="#1F5C3A" font-weight="700">accepted: under 0.5%</text>
  <circle cx="234.19354838709677" cy="170" r="7" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <line x1="234.19354838709677" y1="160" x2="234.19354838709677" y2="90" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.35"/>
  <text x="234.19354838709677" y="82" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">precision snap</text>
  <circle cx="667.7981458471597" cy="170" r="7" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <line x1="667.7981458471597" y1="160" x2="667.7981458471597" y2="90" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.35"/>
  <text x="667.7981458471597" y="82" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">bowtie repair</text>
  <circle cx="868.0530427638851" cy="170" r="7" fill="#C85B5B" stroke="#C85B5B" stroke-width="1"/>
  <line x1="868.0530427638851" y1="180" x2="868.0530427638851" y2="230" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.35"/>
  <text x="868.0530427638851" y="248" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">buffer(0) dropped a lobe</text>
  <rect x="40" y="296" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="315" text-anchor="middle" font-size="11" fill="currentColor">assert report[&quot;area_delta_pct&quot;].abs().max() &lt;= 0.5 — one line, and it is the only thing standing between</text>
  <text x="474.0" y="330" text-anchor="middle" font-size="11" fill="currentColor">a topology repair and a redrawn parcel boundary.</text>
</svg>

## What a repair is allowed to change

A useful discipline is to state, before running anything, which properties a repair may alter.

**Area may move slightly.** Snapping a duplicate vertex to a millimetre grid changes area by a
vanishing amount; repairing a bowtie changes it by the overlapping lobe, which can be a real
fraction. The first is noise and the second is a fact about the source that deserves a look.

**Topology must improve.** Every output must be valid, and no repair may introduce an overlap with a
neighbouring parcel that was not there before. A repair that fixes one polygon by growing it into its
neighbour has traded a validity error for a boundary dispute.

**Identity must be preserved.** One input row is one output row. Where the repair genuinely produces
disjoint parts, they belong in one multipart geometry under the original identifier, not in several
rows — unless the parcel truly is several legal parcels, which is a data-modelling decision rather
than a repair.

**Attributes must not move.** It sounds obvious, and the common violation is subtle: a repair
implemented as a spatial rebuild that re-joins attributes by position rather than by identifier
scrambles them whenever the row order changes.

Writing these four down turns "we repaired the layer" into something a reviewer can check, and the
`area_delta` column in the report above is the evidence for the first two.

## Frequently asked questions

### Is `make_valid` ever the wrong tool?

For a hole recorded outside its shell, yes — it may discard the ring entirely rather than promote it
to its own polygon, which silently loses land. That case wants an explicit ring reassignment. It is
also the wrong tool when `set_precision` would do, not because it is incorrect but because it can
restructure a polygon that only needed a vertex snapped.

### Why did a repaired layer fail a permitting portal that accepts invalid geometry?

Almost certainly ring winding. GEOS validity does not constrain orientation, but RFC 7946 requires
exterior rings counter-clockwise and interior rings clockwise, and a strict consumer reads a reversed
exterior as the complement of the polygon. Enforce winding at export, as covered in
[exporting compliance overlay results to GeoJSON](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/exporting-compliance-overlay-results-to-geojson-for-permitting-portals/).

### What precision grid should `set_precision` use?

One that is finer than the survey tolerance and coarser than floating-point noise — a millimetre in a
projected metric frame is a good default. Coarser than a centimetre starts to move real boundaries;
finer than a micrometre does not remove the duplicate vertices it was called for.

### Should invalid geometry ever be dropped instead of repaired?

Only when the row is meaningless — a zero-area collapse or a geometry outside the study area by
hundreds of kilometres. Dropping a repairable parcel removes land from the analysis without saying
so, which is the same failure as silently repairing it badly. Quarantine and report is the middle
path.

### How do I repair a whole national layer efficiently?

Classify first, then apply the cheap repair to the large group and the expensive one to the small
group. On a typical national parcel extract, upwards of 95 percent of invalid geometries are repeated
points that `set_precision` fixes in one vectorised call, leaving a few hundred genuine
self-intersections for `make_valid`.

### Does repairing change the CRS or the extent?

Neither, and asserting both is a cheap way to catch a repair implemented as an accidental
reprojection. Check that the output CRS matches the input and that the total bounds have not moved by
more than the precision grid; both are one line and both have caught real bugs.

## Related

- [Spatial Data Quality & Validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) — the parent quality gate
- [Validating Geometry Topology with Shapely 2 Predicates](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/validating-geometry-topology-with-shapely-2-predicates/) — the invalidity reasons this page repairs
- [Detecting & Removing Sliver Polygons in GeoPandas](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/detecting-and-removing-sliver-polygons-in-geopandas/) — the artefacts a repaired overlay tends to produce
- [Best Practices for Cleaning Messy Shapefiles in GeoPandas](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/best-practices-for-cleaning-messy-shapefiles-in-geopandas/) — the format defects that produce this geometry
