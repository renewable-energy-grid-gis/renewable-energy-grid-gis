---
title: Environmental Constraint & Exclusion Screening
description: Build a defensible exclusion mask for renewable siting in Python — layered wetland, habitat, floodplain and slope constraints unioned once, measured in an equal-area CRS, and audited so every removed hectare names the layer that removed it.
slug: environmental-constraint-and-exclusion-screening
type: guide
breadcrumb: Environmental Constraint & Exclusion Screening
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Environmental Constraint & Exclusion Screening

Exclusion screening is the stage where a study area stops being land and becomes buildable area, and
it is part of the [core energy-GIS data and spatial fundamentals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/)
pipeline. The failure mode it addresses is quiet and expensive: a screening script loads a dozen
constraint layers, subtracts each one in turn from the study polygon, sums what is left, and reports
a buildable-area figure that is wrong by more than the margin the project was won on. Nothing raises.
The map looks right. The error only surfaces when an environmental consultant redoes the overlay with
the same layers and gets a different number.

Three things produce that divergence, and all three are arithmetic rather than ecological. Constraint
layers overlap, so subtracting them one at a time removes the shared area more than once. Most
national constraint products are rasters on their own grids, so mixing them with vector parcels
without an explicit resolution decision quantises the boundary to a cell size nobody chose. And area
is not preserved by most projections, so a figure computed in the frame the data happened to arrive
in is not the figure a permit reviewer will compute in an equal-area one. This page builds the
screening stage that removes all three: layers are harmonised into one metric frame, classified by
the legal force they actually carry, unioned once, subtracted once, and reported with a per-layer
accounting that reconciles back to the gross area.

<svg viewBox="0 0 940 420" role="img" aria-label="Four constraint layers over the same 4,200 hectare study area, and why their coverages do not add up. Wetlands cover 11 percent, the floodplain 9, the habitat corridor 14 and the slope mask 21 — a naive sum of 55 percent. Because wetlands sit inside floodplains and the corridor follows the same drainage, the union is 41 percent, leaving 2,478 buildable hectares rather than the 1,890 the sum implies." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Four constraint layers, one union, and the 588 hectares between them</title>
  <desc>On the left, four stacked translucent layers over one study-area outline: a wetlands layer covering 11 percent, a floodplain covering 9 percent, a habitat corridor covering 14 percent and a slope mask covering 21 percent, drawn so their heavy mutual overlap along the drainage is visible. On the right, two bars: the naive sum of the four coverages at 55 percent of the study area, and the union at 41 percent. The difference of 14 percentage points, or 588 hectares, is annotated as the double-counted overlap.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="420"/>
  <defs><marker id="ecs1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">4 200 ha study area · four constraint layers</text>
  <rect x="40" y="62" width="380" height="250" rx="4" fill="none" stroke="currentColor" stroke-width="1.6" opacity="0.7"/>
  <path d="M70,102 C160,152 190,212 160,292 L230,292 C255,212 220,142 135,102 Z" fill="#DCEEF6" fill-opacity="0.7" stroke="#5BA8C8" stroke-width="1.4"/>
  <path d="M90,112 C170,158 196,212 174,282 L208,282 C230,212 204,154 136,112 Z" fill="#DDF0E2" fill-opacity="0.75" stroke="#3D8B5F" stroke-width="1.4"/>
  <path d="M280,92 L400,92 L400,182 L290,212 Z" fill="#FFE3BE" fill-opacity="0.6" stroke="#F4A261" stroke-width="1.4"/>
  <path d="M60,242 L160,298 L80,302 Z" fill="#F6DCDC" fill-opacity="0.6" stroke="#C85B5B" stroke-width="1.4"/>
  <rect x="40" y="330" width="14" height="14" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="60" y="342" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">wetlands — 11%</text>
  <rect x="40" y="356" width="14" height="14" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="60" y="368" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">floodplain — 9%</text>
  <rect x="240" y="330" width="14" height="14" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="260" y="342" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">habitat corridor — 14%</text>
  <rect x="240" y="356" width="14" height="14" rx="3" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2"/>
  <text x="260" y="368" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">slope &gt; 15° — 21%</text>
  <text x="480" y="92" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">sum of the four coverages</text>
  <rect x="480" y="104" width="231.00000000000003" height="44" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.4"/>
  <text x="595.5" y="132" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">55% — 1 890 ha buildable</text>
  <text x="480" y="192" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">union of the four layers</text>
  <rect x="480" y="204" width="172.2" height="44" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
  <text x="566.1" y="232" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">41% — 2 478 ha buildable</text>
  <rect x="480" y="272" width="420" height="48" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="690.0" y="293" text-anchor="middle" font-size="11.5" fill="currentColor">the 14-point gap is overlap counted twice —</text>
  <text x="690.0" y="310" text-anchor="middle" font-size="11.5" fill="currentColor">588 ha, enough to change the turbine count</text>
</svg>

## Why subtracting constraints one at a time fails

Consider a 4,200-hectare study area with four constraint layers: a National Wetlands Inventory
polygon set, a FEMA 100-year floodplain, a state-designated habitat corridor, and a slope mask
derived from a 10-metre DEM. Each layer covers a different fraction of the study area — 11, 9, 14 and
21 percent respectively — and a naive sum of those fractions is 55 percent, implying 1,890 hectares
of buildable land. The true excluded area is 41 percent, because wetlands sit inside floodplains
almost by definition and the habitat corridor follows the same drainage, so the layers overlap
heavily. The correct answer is 2,478 hectares, and the naive one under-states buildable land by 588
hectares — enough to change how many turbines fit, or whether the project clears its minimum size.

The inverse error is just as common. A script that subtracts layers sequentially from a shrinking
remainder — `study.difference(wetlands).difference(floodplain).difference(habitat)` — gets the
overlap arithmetic right but pays for it in geometry: each difference operation produces a more
complex polygon than the last, and by the fourth subtraction the result carries tens of thousands of
vertices, slivers along every shared edge, and enough topological noise that the subsequent area
calculation is sensitive to the order the layers were applied in. Unioning the constraints first,
then subtracting once, produces the same answer with a fraction of the vertices and no order
dependence.

The third failure is the unit one. A constraint layer downloaded in `EPSG:4326` and subtracted from a
parcel layer already reprojected to a UTM zone will silently produce an empty intersection, because
the two coordinate ranges do not overlap — the same defect covered in detail under
[coordinate reference systems for energy projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/).
When it does not fail outright, it fails softly: the areas come out in square degrees, which are
plausible-looking numbers with no physical meaning.

## Not every constraint carries the same legal force

The most consequential modelling decision on this page is not geometric. Constraint layers differ in
what they legally do, and collapsing that difference into a single exclusion mask throws away the
information a developer most needs. Three classes are worth separating.

**Hard exclusions** remove land unconditionally: open water, designated wilderness, existing
structures, and slopes above the crane specification. No permit makes these buildable, so they belong
in the mask that produces the buildable-area headline figure.

**Permittable constraints** remove land unless a permit is obtained: wetlands under a Section 404
individual permit, floodplain development under a local ordinance, some habitat overlaps under an
incidental-take permit. These belong in a second mask, and the honest output is two numbers —
buildable without permits, and buildable with a defined permitting path — rather than one.

**Advisory layers** carry no legal force at all but predict opposition or cost: viewshed sensitivity,
prime farmland classifications in states without a farmland statute, informal habitat mapping. These
belong in the scoring stage described under
[building a site suitability scoring pipeline](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/building-a-site-suitability-scoring-pipeline-with-geopandas-and-pvlib/),
not in the exclusion mask, because a weighted score can express "expensive" while a mask can only
express "impossible".

<svg viewBox="0 0 940 396" role="img" aria-label="The three classes a constraint layer can belong to and what each one does to the answer. Hard exclusions remove land unconditionally and set the headline buildable figure. Permittable constraints remove land unless a permit is obtained and produce a second figure. Advisory layers carry no legal force and belong in the scoring stage, where a weight can express cost — a mask can only express impossibility." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Hard, permittable, advisory — three classes, three destinations</title>
  <desc>Three columns. The hard column lists open water, designated wilderness, existing structures and slopes above the crane specification, and routes to the buildable-area headline figure. The permittable column lists Section 404 wetlands, floodplain development and incidental take habitat overlaps, and routes to a second buildable figure conditional on a permitting path. The advisory column lists viewshed sensitivity, prime farmland outside farmland-statute states and informal habitat mapping, and routes to the weighted suitability score rather than to any mask.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="ecs2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Classify before you union — the class decides the destination</text>
  <rect x="40" y="62" width="272" height="190" rx="9" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.4" opacity="0.5"/>
  <text x="176" y="90" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">hard exclusion</text>
  <text x="176" y="122" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">open water</text>
  <text x="176" y="146" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">designated wilderness</text>
  <text x="176" y="170" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">existing structures</text>
  <text x="176" y="194" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">slope above crane spec</text>
  <line x1="176" y1="258" x2="176" y2="288" stroke="currentColor" stroke-width="1.4" marker-end="url(#ecs2-arr)"/>
  <rect x="40" y="292" width="272" height="28" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.5"/>
  <text x="176.0" y="312" text-anchor="middle" font-size="11" fill="currentColor">buildable-area headline</text>
  <rect x="336" y="62" width="272" height="190" rx="9" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.4" opacity="0.5"/>
  <text x="472" y="90" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">permittable</text>
  <text x="472" y="122" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">Section 404 wetlands</text>
  <text x="472" y="146" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">floodplain development</text>
  <text x="472" y="170" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">incidental-take habitat</text>
  <line x1="472" y1="258" x2="472" y2="288" stroke="currentColor" stroke-width="1.4" marker-end="url(#ecs2-arr)"/>
  <rect x="336" y="292" width="272" height="28" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="472.0" y="312" text-anchor="middle" font-size="11" fill="currentColor">second figure, with a permitting path</text>
  <rect x="632" y="62" width="272" height="190" rx="9" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4" opacity="0.5"/>
  <text x="768" y="90" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">advisory</text>
  <text x="768" y="122" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">viewshed sensitivity</text>
  <text x="768" y="146" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">prime farmland (no statute)</text>
  <text x="768" y="170" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">informal habitat mapping</text>
  <line x1="768" y1="258" x2="768" y2="288" stroke="currentColor" stroke-width="1.4" marker-end="url(#ecs2-arr)"/>
  <rect x="632" y="292" width="272" height="28" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="768.0" y="312" text-anchor="middle" font-size="11" fill="currentColor">weighted score, never a mask</text>
  <text x="40" y="372" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">A layer with no class is not a constraint — it is a shapefile.</text>
</svg>

## Prerequisites and data requirements

The workflow assumes Python 3.11+ with `geopandas>=0.14`, `shapely>=2.0`, `rasterio>=1.3` and
`pyproj>=3.6`. Inputs are a study-area polygon, a set of vector constraint layers in any
GDAL-readable format, and optionally raster constraint masks such as a slope threshold or a land
cover classification.

Three input requirements are non-negotiable. Every layer must arrive with a declared CRS or be
explicitly tagged at read time; the working frame must be projected and metric, with an equal-area
frame such as `EPSG:5070` used for any reported hectare figure; and every constraint layer must carry
a `constraint_class` attribute drawn from the three classes above, assigned at ingestion rather than
inferred later. A layer without a class is not a constraint, it is a shapefile.

Geometry validity matters more here than in most stages, because `union_all` on invalid input either
raises or — worse — returns a valid-looking result whose area is wrong. Repair before you union, using
the predicates described in
[validating geometry topology with Shapely 2](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/validating-geometry-topology-with-shapely-2-predicates/).

## Core implementation: one union, one subtraction, one accounting

The function below harmonises the layers, unions each class separately, subtracts once, and returns
both the buildable geometry and a per-layer accounting that reconciles to the gross area. The
per-layer figures are deliberately computed against the study area rather than against each other:
they overlap, they sum to more than the total exclusion, and that is the honest way to report them.

```python
from dataclasses import dataclass, field

import geopandas as gpd
from shapely.ops import unary_union

EQUAL_AREA_EPSG = 5070  # NAD83 / CONUS Albers — hectares are only defensible here


@dataclass
class ExclusionResult:
    buildable: gpd.GeoDataFrame
    gross_ha: float
    hard_ha: float
    permittable_ha: float
    per_layer_ha: dict = field(default_factory=dict)


def screen_exclusions(
    study_area: gpd.GeoDataFrame,
    constraints: dict[str, gpd.GeoDataFrame],
    classes: dict[str, str],
    *,
    working_epsg: int,
) -> ExclusionResult:
    """Subtract classified constraint layers from a study area, once.

    `constraints` maps a layer name to its GeoDataFrame; `classes` maps the same
    names to 'hard', 'permittable' or 'advisory'. Advisory layers are measured and
    reported but never subtracted.
    """
    study = study_area.to_crs(working_epsg)
    study_geom = unary_union(study.geometry.values)

    per_layer, hard_parts, permittable_parts = {}, [], []
    for name, gdf in constraints.items():
        cls = classes[name]
        layer = gdf.to_crs(working_epsg)
        # Repair before union: an invalid ring makes the union area meaningless.
        layer["geometry"] = layer.geometry.make_valid()
        clipped = layer.geometry.intersection(study_geom)
        clipped = clipped[~clipped.is_empty]
        if clipped.empty:
            per_layer[name] = 0.0
            continue
        merged = unary_union(clipped.values)
        per_layer[name] = _hectares(merged, working_epsg)
        if cls == "hard":
            hard_parts.append(merged)
        elif cls == "permittable":
            permittable_parts.append(merged)

    hard = unary_union(hard_parts) if hard_parts else None
    permittable = unary_union(permittable_parts) if permittable_parts else None

    buildable_geom = study_geom.difference(hard) if hard is not None else study_geom
    strict_geom = (
        buildable_geom.difference(permittable) if permittable is not None else buildable_geom
    )

    buildable = gpd.GeoDataFrame(
        {"scenario": ["hard_only", "hard_and_permittable"]},
        geometry=[buildable_geom, strict_geom],
        crs=study.crs,
    )
    return ExclusionResult(
        buildable=buildable,
        gross_ha=_hectares(study_geom, working_epsg),
        hard_ha=_hectares(hard, working_epsg) if hard is not None else 0.0,
        permittable_ha=_hectares(permittable, working_epsg) if permittable is not None else 0.0,
        per_layer_ha=per_layer,
    )


def _hectares(geom, working_epsg: int) -> float:
    """Area in hectares, measured in an equal-area frame regardless of the working one."""
    s = gpd.GeoSeries([geom], crs=working_epsg).to_crs(EQUAL_AREA_EPSG)
    return float(s.area.iloc[0]) / 10_000.0
```

Two details in that function carry most of its value. The intersection with the study area before
unioning keeps the constraint geometries bounded — a national wetlands layer unioned in full is an
expensive way to compute nothing — and the separate `_hectares` helper reprojects to an equal-area
frame for every measurement, so the working frame can be chosen for distance operations without
corrupting the area figures.

## Raster constraints: the resolution decision nobody makes explicitly

Slope masks, land cover and many habitat products are rasters, and combining them with vector parcels
forces a choice: vectorise the raster, or rasterise the vectors. The choice is usually made by
accident, and it changes the answer.

Vectorising a 30-metre slope mask produces polygon boundaries that step in 30-metre increments, so a
parcel edge that runs diagonally across the grid gains a staircase whose area error is proportional
to the cell size and to the length of the boundary. On a 4,200-hectare study area with 40 kilometres
of constraint boundary, a 30-metre quantisation moves roughly 60 hectares — 1.4 percent — and the
direction of the error depends on whether cells are included when their centre or any part is
covered.

Rasterising the vectors instead makes the whole computation cell-based, which is fast and internally
consistent, at the cost of quantising the parcel boundary too. That is usually the right trade for a
screening pass over thousands of parcels and the wrong one for the final buildable-area figure on a
shortlisted site, where the vector boundary is the legal object and the raster is the approximation.

<svg viewBox="0 0 940 400" role="img" aria-label="What cell size does to an exclusion boundary. A constraint boundary running diagonally across a 30 metre grid is quantised into a staircase, and the area error scales with the boundary length: on 40 kilometres of constraint edge a 30 metre grid moves about 60 hectares, a 10 metre grid about 20, and a 1 metre grid about 2. The direction of the error depends on whether a cell counts as excluded when its centre is covered or when any part of it is." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Cell size, boundary staircase and the hectares it moves</title>
  <desc>On the left, a diagonal constraint boundary drawn over a coarse grid with the cells that would be marked excluded shaded, producing a visible staircase against the true line. In the middle, the same boundary over a grid three times finer, with a much closer staircase. On the right, a table of the area moved on 40 kilometres of constraint boundary: about 60 hectares at 30 metre cells, 20 hectares at 10 metre cells and 2 hectares at 1 metre cells, with a note that centre-based and any-part-covered rules push the error in opposite directions.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="ecs3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The same boundary at two cell sizes</text>
  <rect x="40.0" y="68.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="68.0" y="68.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="96.0" y="68.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="124.0" y="68.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="152.0" y="68.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="180.0" y="68.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="208.0" y="68.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="236.0" y="68.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="40.0" y="96.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="68.0" y="96.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="96.0" y="96.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="124.0" y="96.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="152.0" y="96.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="180.0" y="96.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="208.0" y="96.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="236.0" y="96.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="40.0" y="124.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="68.0" y="124.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="96.0" y="124.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="124.0" y="124.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="152.0" y="124.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="180.0" y="124.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="208.0" y="124.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="236.0" y="124.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="40.0" y="152.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="68.0" y="152.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="96.0" y="152.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="124.0" y="152.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="152.0" y="152.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="180.0" y="152.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="208.0" y="152.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="236.0" y="152.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="40.0" y="180.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="68.0" y="180.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="96.0" y="180.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="124.0" y="180.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="152.0" y="180.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="180.0" y="180.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="208.0" y="180.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="236.0" y="180.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="40.0" y="208.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="68.0" y="208.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="96.0" y="208.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="124.0" y="208.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="152.0" y="208.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="180.0" y="208.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="208.0" y="208.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="236.0" y="208.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="40.0" y="236.0" width="27.4" height="27.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="68.0" y="236.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="96.0" y="236.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="124.0" y="236.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="152.0" y="236.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="180.0" y="236.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="208.0" y="236.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="236.0" y="236.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="40.0" y="264.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="68.0" y="264.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="96.0" y="264.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="124.0" y="264.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="152.0" y="264.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="180.0" y="264.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="208.0" y="264.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="236.0" y="264.0" width="27.4" height="27.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <line x1="40" y1="292" x2="241.6" y2="68" stroke="#C85B5B" stroke-width="2.4"/>
  <text x="152.0" y="316" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">30 m cells</text>
  <rect x="330.0" y="68.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="344.0" y="68.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="358.0" y="68.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="372.0" y="68.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="386.0" y="68.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="400.0" y="68.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="414.0" y="68.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="428.0" y="68.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="442.0" y="68.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="456.0" y="68.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="470.0" y="68.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="484.0" y="68.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="498.0" y="68.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="512.0" y="68.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="526.0" y="68.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="540.0" y="68.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="330.0" y="82.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="344.0" y="82.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="358.0" y="82.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="372.0" y="82.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="386.0" y="82.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="400.0" y="82.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="414.0" y="82.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="428.0" y="82.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="442.0" y="82.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="456.0" y="82.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="470.0" y="82.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="484.0" y="82.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="498.0" y="82.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="512.0" y="82.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="526.0" y="82.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="540.0" y="82.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="330.0" y="96.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="344.0" y="96.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="358.0" y="96.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="372.0" y="96.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="386.0" y="96.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="400.0" y="96.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="414.0" y="96.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="428.0" y="96.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="442.0" y="96.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="456.0" y="96.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="470.0" y="96.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="484.0" y="96.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="498.0" y="96.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="512.0" y="96.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="526.0" y="96.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="540.0" y="96.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="330.0" y="110.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="344.0" y="110.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="358.0" y="110.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="372.0" y="110.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="386.0" y="110.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="400.0" y="110.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="414.0" y="110.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="428.0" y="110.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="442.0" y="110.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="456.0" y="110.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="470.0" y="110.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="484.0" y="110.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="498.0" y="110.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="512.0" y="110.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="526.0" y="110.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="540.0" y="110.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="330.0" y="124.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="344.0" y="124.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="358.0" y="124.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="372.0" y="124.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="386.0" y="124.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="400.0" y="124.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="414.0" y="124.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="428.0" y="124.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="442.0" y="124.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="456.0" y="124.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="470.0" y="124.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="484.0" y="124.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="498.0" y="124.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="512.0" y="124.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="526.0" y="124.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="540.0" y="124.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="330.0" y="138.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="344.0" y="138.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="358.0" y="138.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="372.0" y="138.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="386.0" y="138.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="400.0" y="138.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="414.0" y="138.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="428.0" y="138.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="442.0" y="138.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="456.0" y="138.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="470.0" y="138.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="484.0" y="138.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="498.0" y="138.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="512.0" y="138.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="526.0" y="138.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="540.0" y="138.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="330.0" y="152.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="344.0" y="152.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="358.0" y="152.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="372.0" y="152.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="386.0" y="152.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="400.0" y="152.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="414.0" y="152.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="428.0" y="152.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="442.0" y="152.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="456.0" y="152.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="470.0" y="152.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="484.0" y="152.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="498.0" y="152.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="512.0" y="152.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="526.0" y="152.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="540.0" y="152.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="330.0" y="166.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="344.0" y="166.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="358.0" y="166.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="372.0" y="166.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="386.0" y="166.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="400.0" y="166.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="414.0" y="166.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="428.0" y="166.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="442.0" y="166.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="456.0" y="166.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="470.0" y="166.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="484.0" y="166.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="498.0" y="166.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="512.0" y="166.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="526.0" y="166.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="540.0" y="166.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="330.0" y="180.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="344.0" y="180.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="358.0" y="180.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="372.0" y="180.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="386.0" y="180.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="400.0" y="180.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="414.0" y="180.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="428.0" y="180.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="442.0" y="180.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="456.0" y="180.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="470.0" y="180.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="484.0" y="180.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="498.0" y="180.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="512.0" y="180.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="526.0" y="180.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="540.0" y="180.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="330.0" y="194.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="344.0" y="194.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="358.0" y="194.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="372.0" y="194.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="386.0" y="194.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="400.0" y="194.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="414.0" y="194.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="428.0" y="194.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="442.0" y="194.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="456.0" y="194.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="470.0" y="194.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="484.0" y="194.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="498.0" y="194.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="512.0" y="194.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="526.0" y="194.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="540.0" y="194.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="330.0" y="208.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="344.0" y="208.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="358.0" y="208.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="372.0" y="208.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="386.0" y="208.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="400.0" y="208.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="414.0" y="208.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="428.0" y="208.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="442.0" y="208.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="456.0" y="208.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="470.0" y="208.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="484.0" y="208.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="498.0" y="208.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="512.0" y="208.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="526.0" y="208.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="540.0" y="208.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="330.0" y="222.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="344.0" y="222.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="358.0" y="222.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="372.0" y="222.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="386.0" y="222.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="400.0" y="222.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="414.0" y="222.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="428.0" y="222.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="442.0" y="222.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="456.0" y="222.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="470.0" y="222.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="484.0" y="222.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="498.0" y="222.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="512.0" y="222.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="526.0" y="222.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="540.0" y="222.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="330.0" y="236.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="344.0" y="236.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="358.0" y="236.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="372.0" y="236.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="386.0" y="236.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="400.0" y="236.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="414.0" y="236.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="428.0" y="236.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="442.0" y="236.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="456.0" y="236.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="470.0" y="236.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="484.0" y="236.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="498.0" y="236.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="512.0" y="236.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="526.0" y="236.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="540.0" y="236.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="330.0" y="250.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="344.0" y="250.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="358.0" y="250.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="372.0" y="250.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="386.0" y="250.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="400.0" y="250.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="414.0" y="250.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="428.0" y="250.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="442.0" y="250.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="456.0" y="250.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="470.0" y="250.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="484.0" y="250.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="498.0" y="250.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="512.0" y="250.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="526.0" y="250.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="540.0" y="250.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="330.0" y="264.0" width="13.4" height="13.4" rx="0.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="344.0" y="264.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="358.0" y="264.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="372.0" y="264.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="386.0" y="264.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="400.0" y="264.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="414.0" y="264.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="428.0" y="264.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="442.0" y="264.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="456.0" y="264.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="470.0" y="264.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="484.0" y="264.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="498.0" y="264.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="512.0" y="264.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="526.0" y="264.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="540.0" y="264.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="330.0" y="278.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="344.0" y="278.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="358.0" y="278.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="372.0" y="278.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="386.0" y="278.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="400.0" y="278.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="414.0" y="278.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="428.0" y="278.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="442.0" y="278.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="456.0" y="278.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="470.0" y="278.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="484.0" y="278.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="498.0" y="278.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="512.0" y="278.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="526.0" y="278.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <rect x="540.0" y="278.0" width="13.4" height="13.4" rx="0.5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5"/>
  <line x1="330" y1="292" x2="531.6" y2="68" stroke="#C85B5B" stroke-width="2.4"/>
  <text x="442.0" y="316" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">10 m cells</text>
  <text x="40" y="328" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">red line: the true constraint boundary · shaded: cells marked excluded</text>
  <rect x="600" y="68" width="300" height="92" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="750.0" y="90" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">area moved on 40 km of boundary</text>
  <text x="750.0" y="109" text-anchor="middle" font-size="11.5" fill="currentColor">30 m cells → ≈ 60 ha</text>
  <text x="750.0" y="128" text-anchor="middle" font-size="11.5" fill="currentColor">10 m cells → ≈ 20 ha</text>
  <text x="750.0" y="147" text-anchor="middle" font-size="11.5" fill="currentColor">1 m cells → ≈ 2 ha</text>
  <rect x="600" y="196" width="300" height="73" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="750.0" y="218" text-anchor="middle" font-size="11.5" fill="currentColor">centre-covered under-excludes;</text>
  <text x="750.0" y="237" text-anchor="middle" font-size="11.5" fill="currentColor">any-part-covered over-excludes —</text>
  <text x="750.0" y="256" text-anchor="middle" font-size="11.5" fill="currentColor">state the rule with the figure</text>
  <rect x="40" y="344" width="860" height="28" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="470.0" y="364" text-anchor="middle" font-size="11.5" fill="currentColor">Rasterise for screening, vectorise for the shortlisted site, and record which produced the number.</text>
</svg>

The practical rule: rasterise for screening, vectorise for the final site, and record which was used
alongside the figure. A buildable-area number without its resolution provenance cannot be reconciled
against anyone else's.

```python
import numpy as np
import rasterio
from rasterio.features import geometry_mask


def slope_exclusion_ha(
    dem_path: str,
    study_geom,
    *,
    max_slope_deg: float = 15.0,
) -> tuple[float, float]:
    """Excluded hectares from a slope threshold, plus the cell-size uncertainty band."""
    with rasterio.open(dem_path) as src:
        window = src.window(*study_geom.bounds)
        dem = src.read(1, window=window, masked=True).astype("float32")
        transform = src.window_transform(window)
        cell_m = abs(transform.a)

        dzdy, dzdx = np.gradient(dem, cell_m)
        slope_deg = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))

        inside = ~geometry_mask(
            [study_geom], out_shape=dem.shape, transform=transform, invert=False
        )
        steep = (slope_deg > max_slope_deg) & inside & ~dem.mask

        cells = int(steep.sum())
        ha = cells * (cell_m ** 2) / 10_000.0
        # Boundary cells are the uncertainty: half a cell along the excluded perimeter.
        perimeter_cells = int(
            (steep ^ np.roll(steep, 1, axis=0)).sum() + (steep ^ np.roll(steep, 1, axis=1)).sum()
        )
        band_ha = perimeter_cells * 0.5 * (cell_m ** 2) / 10_000.0
    return ha, band_ha
```

Returning the uncertainty band alongside the figure is what makes a raster-derived exclusion
defensible. A slope exclusion of "412 hectares" invites a challenge; "412 hectares ± 18 from a 10-metre
grid" answers it in advance.

## Error handling and edge cases

**A constraint layer that does not intersect the study area.** This is normal — a national layer
clipped to a county usually contributes nothing — and must not be an error. What must be an error is a
layer that intersects nothing across every study area in a batch, which almost always means a CRS or
extent problem rather than an absence of constraints.

**A study area entirely excluded.** Report it as zero buildable hectares with the binding layer named,
never as a dropped row. A parcel that vanishes from the output is indistinguishable from one that was
never submitted, and that distinction is exactly what a landowner will ask about.

**Multipart and nested geometry.** Wetland layers routinely contain polygons with holes, and a hole
inside a wetland is not buildable land unless the hole is genuinely upland. Preserve the rings as
authored, repair rather than simplify, and let `difference` handle the topology — manual ring
manipulation is where most of the subtle area errors in this stage come from.

**Layers with different vintages.** A 2019 wetlands delineation and a 2024 floodplain revision
describe different moments. Record the vintage per layer in the accounting output; a reviewer
comparing against current data needs to know which layer is stale, and the answer is rarely the one
they assume.

## Performance and scalability

The expensive operation is the union, and its cost is driven by vertex count rather than by feature
count. Three levers matter, in order. Clip each constraint layer to the study area before unioning —
this is the single largest win, and it is why the implementation above does it first. Simplify only
the layers whose boundary precision does not carry legal weight, and never the ones that do; a
`simplify(tolerance=1.0)` on an advisory viewshed layer is free, and the same call on a wetland
delineation is a compliance problem. Finally, use the spatial index to skip constraint features whose
bounding box misses the study area entirely, which on a national layer removes the large majority
before any geometry is touched.

For portfolio runs, the shape of the parallelism is per study area rather than per layer: each site
is independent, the constraint layers are read-only, and a worker pool over sites scales linearly
until the object store rather than the CPU becomes the limit. Reading the constraint layers once into
each worker and reusing them across that worker's sites avoids re-reading a national layer for every
parcel.

## Validation and audit trail

The accounting output is the deliverable, not a by-product. For every screening run, record the gross
study area, the per-layer excluded area, the unioned hard and permittable areas, the resulting
buildable figures for both scenarios, and the sum of the per-layer figures alongside the union —
because the gap between those two numbers is the overlap, and a reviewer will want it.

<svg viewBox="0 0 940 424" role="img" aria-label="The accounting a screening run has to publish. Gross study area 4,200 hectares; per-layer exclusions of 462, 378, 588 and 882 hectares that sum to 2,310; a union of hard and permittable constraints of 1,722; and two buildable figures — 2,478 hectares excluding hard constraints only, and 2,142 once permittable constraints are also removed. The gap between the per-layer sum and the union, 588 hectares, is the overlap, and reporting it is what stops the reconciliation question." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>The reconciliation every exclusion report needs to survive review</title>
  <desc>A table of the screening accounting. Gross study area: 4,200 hectares. Per-layer excluded area: wetlands 462, floodplain 378, habitat corridor 588 and slope 882 hectares, summing to 2,310. Union of all constraints: 1,722 hectares, with the 588 hectare difference labelled as overlap. Two buildable results follow: 2,478 hectares with hard exclusions removed, and 2,142 hectares with permittable constraints removed as well. Three CI assertions are listed beneath: buildable never exceeds gross, the union never exceeds gross, and the per-layer sum is never less than the union.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="424"/>
  <defs><marker id="ecs4-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The numbers a reviewer will ask for, published together</text>
  <rect x="40" y="62" width="520" height="30" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.5"/>
  <text x="56" y="82" text-anchor="start" font-size="11.5" fill="currentColor">gross study area</text>
  <text x="544" y="82" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">4 200 ha</text>
  <rect x="40" y="96" width="520" height="30" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1" opacity="0.5"/>
  <text x="56" y="116" text-anchor="start" font-size="11.5" fill="currentColor">− wetlands</text>
  <text x="544" y="116" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">462 ha</text>
  <rect x="40" y="130" width="520" height="30" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1" opacity="0.5"/>
  <text x="56" y="150" text-anchor="start" font-size="11.5" fill="currentColor">− floodplain</text>
  <text x="544" y="150" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">378 ha</text>
  <rect x="40" y="164" width="520" height="30" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1" opacity="0.5"/>
  <text x="56" y="184" text-anchor="start" font-size="11.5" fill="currentColor">− habitat corridor</text>
  <text x="544" y="184" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">588 ha</text>
  <rect x="40" y="198" width="520" height="30" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1" opacity="0.5"/>
  <text x="56" y="218" text-anchor="start" font-size="11.5" fill="currentColor">− slope &gt; 15°</text>
  <text x="544" y="218" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">882 ha</text>
  <rect x="40" y="232" width="520" height="30" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1" opacity="0.5"/>
  <text x="56" y="252" text-anchor="start" font-size="11.5" fill="currentColor">per-layer sum</text>
  <text x="544" y="252" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">2 310 ha</text>
  <rect x="40" y="266" width="520" height="30" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1" opacity="0.5"/>
  <text x="56" y="286" text-anchor="start" font-size="11.5" fill="currentColor">union of constraints</text>
  <text x="544" y="286" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">1 722 ha</text>
  <rect x="40" y="300" width="520" height="30" rx="5" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.1" opacity="0.5"/>
  <text x="56" y="320" text-anchor="start" font-size="11.5" fill="currentColor">overlap (sum − union)</text>
  <text x="544" y="320" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">588 ha</text>
  <rect x="40" y="334" width="520" height="30" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1" opacity="0.5"/>
  <text x="56" y="354" text-anchor="start" font-size="11.5" fill="currentColor">buildable · hard only</text>
  <text x="544" y="354" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">2 478 ha</text>
  <rect x="40" y="368" width="520" height="30" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1" opacity="0.5"/>
  <text x="56" y="388" text-anchor="start" font-size="11.5" fill="currentColor">buildable · hard + permittable</text>
  <text x="544" y="388" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">2 142 ha</text>
  <rect x="590" y="62" width="310" height="92" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="745.0" y="84" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">CI assertions</text>
  <text x="745.0" y="103" text-anchor="middle" font-size="11.5" fill="currentColor">buildable ≤ gross</text>
  <text x="745.0" y="122" text-anchor="middle" font-size="11.5" fill="currentColor">union ≤ gross</text>
  <text x="745.0" y="141" text-anchor="middle" font-size="11.5" fill="currentColor">per-layer sum ≥ union</text>
  <rect x="590" y="186" width="310" height="92" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="745.0" y="208" text-anchor="middle" font-size="11.5" fill="currentColor">Each assertion catches one bug:</text>
  <text x="745.0" y="227" text-anchor="middle" font-size="11.5" fill="currentColor">a subtraction in the wrong frame,</text>
  <text x="745.0" y="246" text-anchor="middle" font-size="11.5" fill="currentColor">an unclipped national layer,</text>
  <text x="745.0" y="265" text-anchor="middle" font-size="11.5" fill="currentColor">a layer measured in another CRS</text>
  <rect x="590" y="320" width="310" height="54" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="745.0" y="342" text-anchor="middle" font-size="11.5" fill="currentColor">Publish the overlap explicitly —</text>
  <text x="745.0" y="361" text-anchor="middle" font-size="11.5" fill="currentColor">it is the first question asked</text>
</svg>

Three assertions belong in CI. Buildable area must never exceed gross area, which catches a
subtraction performed in the wrong frame. The union of the constraint layers must never exceed the
gross area either, which catches an unclipped layer. And the sum of the per-layer areas must be
greater than or equal to the union area, which is a tautology when the arithmetic is right and fails
loudly when a layer was measured in one frame and unioned in another.

```python
def assert_exclusion_integrity(result: ExclusionResult) -> None:
    """CI gate: the accounting has to reconcile before the figure is published."""
    hard_only = result.buildable.loc[
        result.buildable["scenario"] == "hard_only", "geometry"
    ].iloc[0]
    strict = result.buildable.loc[
        result.buildable["scenario"] == "hard_and_permittable", "geometry"
    ].iloc[0]

    assert result.gross_ha > 0, "empty study area"
    assert _hectares(hard_only, EQUAL_AREA_EPSG) <= result.gross_ha * 1.0001, (
        "buildable exceeds gross — the subtraction ran in a non-equal-area frame"
    )
    assert strict.area <= hard_only.area * 1.0001, (
        "the permittable scenario is larger than the hard-only one — masks were swapped"
    )
    assert sum(result.per_layer_ha.values()) >= result.hard_ha * 0.9999, (
        "per-layer areas sum to less than their union — a layer was measured in another CRS"
    )
```

## Frequently asked questions

### Should the exclusion mask be built once per region or once per project?

Once per project, from region-wide source layers. The geometry is shared, but the classification is
not: whether a wetland is a hard exclusion or a permittable one depends on the project's permitting
strategy, and whether a slope is excluded depends on the crane specification. Sharing the resolved
mask between projects silently imposes one project's assumptions on another.

### How should overlapping constraint layers be reported?

Both ways, with the overlap named. Report the per-layer area — which sums to more than the total —
and the unioned area, and give the difference a label. Reviewers ask the overlap question every time,
and a report that pre-empts it avoids a rebuild.

### Is a 30-metre national land-cover product good enough for exclusion screening?

For screening, yes; for a final buildable-area figure, no. The quantisation error scales with the
length of the constraint boundary, so it is small on compact parcels and material on long, irregular
ones. Use the national product to rank sites, and a site-specific delineation for the shortlist.

### What about constraints that are not spatial at all?

Encode them as attributes on the study area rather than forcing them into geometry. A parcel whose
title carries a conservation easement is fully excluded without any polygon being involved, and
representing that as a geometric mask makes it invisible in a spatial audit. The exclusion pipeline
should accept both geometric and attribute-based exclusions and report them in the same accounting.

### How do I handle a constraint layer that is itself derived from another?

Record the derivation and do not double-count. A hydric-soils layer and a wetlands delineation
overlap by construction because one informs the other, so treating them as independent constraints
inflates the apparent constraint coverage without changing the union. The accounting handles this
correctly as long as both are unioned rather than summed — which is another reason the union figure,
not the sum, is the headline.

## Related

- [Core Energy-GIS Data & Spatial Fundamentals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/) — the parent pipeline this stage sits in
- [Regulatory Boundary Mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/) — jurisdictional setbacks, which compose with these constraints
- [Spatial Data Quality & Validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) — repairing constraint geometry before it is unioned
- [Projection & CRS Quick Reference](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/projection-and-crs-quick-reference/) — choosing the equal-area frame every hectare figure needs
- [Automating Hillshade & Slope Analysis for Wind Turbine Siting](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/automating-hillshade-and-slope-analysis-for-wind-turbine-siting/) — where the slope mask comes from
