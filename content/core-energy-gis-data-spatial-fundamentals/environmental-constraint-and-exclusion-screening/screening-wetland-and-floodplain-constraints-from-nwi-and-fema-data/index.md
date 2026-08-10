---
title: Screening Wetland & Floodplain Constraints from NWI and FEMA Data
description: Load National Wetlands Inventory and FEMA flood hazard layers in Python, keep only the codes that actually constrain a project, and produce a permittable-versus-hard exclusion split a reviewer can follow.
slug: screening-wetland-and-floodplain-constraints-from-nwi-and-fema-data
type: article
breadcrumb: Wetland & Floodplain Constraints
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Screening Wetland & Floodplain Constraints from NWI and FEMA Data

The scenario: a screening run treats every National Wetlands Inventory polygon and every FEMA flood
zone as an exclusion, reports that 38 percent of the study area is unbuildable, and the project is
dropped. A wetland scientist then points out that most of the NWI polygons in that county are
seasonally flooded agricultural depressions, that Zone X is not a regulated floodplain at all, and
that the real constrained fraction is closer to 12 percent. This page is about reading the attribute
codes before excluding on them, and it sits under
[environmental constraint and exclusion screening](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/environmental-constraint-and-exclusion-screening/).

## Root-cause analysis

Three assumptions cause the over-exclusion, and each has an under-exclusion twin.

1. **All NWI polygons are jurisdictional wetlands.** They are not. NWI is a remote-sensing derived
   inventory with a Cowardin classification code on every polygon, and the code distinguishes
   permanently flooded open water from temporarily flooded farmed depressions. Jurisdiction under
   Section 404 is a legal determination that NWI does not make. Treating every polygon as a hard
   exclusion over-states the constraint; treating none of them as one under-states it badly.
2. **All FEMA flood zones are equivalent.** Zone A and AE are the 100-year floodplain and carry real
   development restrictions; Zone X is outside it and carries none; the floodway within Zone AE is
   far more restrictive than the rest of it. A single "in a flood zone" filter merges three different
   regulatory realities.
3. **The two layers are independent.** They overlap heavily by construction — wetlands are where
   water sits — so summing their areas over-states the combined constraint by the overlap, which is
   the arithmetic covered in
   [building multi-layer exclusion masks](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/environmental-constraint-and-exclusion-screening/building-multi-layer-exclusion-masks-with-geopandas-overlay/).

<svg viewBox="0 0 940 420" role="img" aria-label="What the attribute codes actually say in one 4,200 hectare study area. Of 38 percent nominal wetland and flood coverage, palustrine emergent wetland accounts for 9.1 percent and palustrine forested 2.3 — both permittable — while open water systems account for 1.4 percent and are hard exclusions. FEMA Zone AE covers 14 percent of which the regulatory floodway is 2.1, and Zone X covers 11 percent and constrains nothing. Classifying by code moves the real constraint from 38 percent to about 12." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Attribute codes turn 38 percent nominal constraint into 12 percent real</title>
  <desc>Two stacked bars. The first, National Wetlands Inventory coverage, divides into palustrine emergent at 9.1 percent, palustrine scrub-shrub at 1.6, palustrine forested at 2.3, open water systems at 1.4 and farmed or temporarily flooded depressions at 3.2. The second, FEMA flood hazard coverage, divides into the regulatory floodway at 2.1 percent, the rest of Zone AE at 11.9, and Zone X at 11.0. Each segment is coloured by its constraint class, and a summary shows hard exclusions at 3.5 percent, permittable at 8.6 and advisory at the remainder.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="420"/>
  <defs><marker id="wt1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">One study area, coded rather than counted</text>
  <text x="40" y="70" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">National Wetlands Inventory — 17.6% of the study area</text>
  <rect x="40" y="80" width="300.79999999999995" height="44" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="190.39999999999998" y="108" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">9.1%</text>
  <rect x="343.79999999999995" y="80" width="50.415384615384625" height="44" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <rect x="397.21538461538455" y="80" width="73.78461538461538" height="44" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="434.1076923076922" y="108" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">2.3%</text>
  <rect x="473.99999999999994" y="80" width="43.73846153846153" height="44" rx="5" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <rect x="520.7384615384615" y="80" width="103.83076923076925" height="44" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="572.6538461538461" y="108" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">3.2%</text>
  <text x="190.39999999999998" y="142" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">PEM emergent</text>
  <text x="434.1076923076922" y="142" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">PFO forested</text>
  <text x="572.6538461538461" y="142" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">farmed depressions</text>
  <text x="40" y="186" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">FEMA flood hazard — 25.0% of the study area</text>
  <rect x="40" y="196" width="67.10769230769232" height="44" rx="5" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="73.55384615384617" y="224" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">2.1%</text>
  <rect x="110.10769230769232" y="196" width="394.2769230769231" height="44" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="307.24615384615385" y="224" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">11.9%</text>
  <rect x="507.3846153846154" y="196" width="364.2307692307692" height="44" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="689.5" y="224" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">11.0%</text>
  <text x="73.55384615384617" y="258" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">regulatory floodway</text>
  <text x="307.24615384615385" y="258" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">Zone AE (rest)</text>
  <text x="689.5" y="258" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">Zone X</text>
  <rect x="40" y="310" width="280" height="54" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.5"/>
  <text x="180.0" y="332" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">hard exclusion</text>
  <text x="180.0" y="351" text-anchor="middle" font-size="12" fill="currentColor">3.5% of the study area</text>
  <rect x="334" y="310" width="280" height="54" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="474.0" y="332" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">permittable</text>
  <text x="474.0" y="351" text-anchor="middle" font-size="12" fill="currentColor">8.6% — with a 404 path</text>
  <rect x="628" y="310" width="280" height="54" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="768.0" y="332" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">advisory only</text>
  <text x="768.0" y="351" text-anchor="middle" font-size="12" fill="currentColor">Zone X and farmed ground</text>
  <text x="40" y="396" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">The 38% headline was the union of two layers nobody had read the attributes of.</text>
</svg>

## Pre-flight validation

The pre-flight step is a code inventory rather than a geometry check: list the distinct Cowardin
codes and FEMA zone codes present in the study area, with their areas, before deciding anything.

```python
import geopandas as gpd


def inventory_constraint_codes(
    nwi: gpd.GeoDataFrame,
    fema: gpd.GeoDataFrame,
    study_geom,
    *,
    working_epsg: int,
) -> dict[str, dict[str, float]]:
    """Area by attribute code — the table the exclusion decision should be made from."""
    out: dict[str, dict[str, float]] = {}
    for name, gdf, field in (("nwi", nwi, "ATTRIBUTE"), ("fema", fema, "FLD_ZONE")):
        layer = gdf.to_crs(working_epsg).clip(study_geom)
        if layer.empty:
            out[name] = {}
            continue
        layer["_ha"] = layer.geometry.area / 10_000.0
        # Cowardin codes are hierarchical: the first two characters carry the system
        # and subsystem, which is the level a screening decision is made at.
        key = layer[field].astype(str).str[:2] if name == "nwi" else layer[field].astype(str)
        out[name] = layer.groupby(key)["_ha"].sum().sort_values(ascending=False).to_dict()
    return out
```

Running that inventory first is what turns "38 percent is wetland" into "PEM covers 9 percent, PFO
covers 2 percent, PUB covers 0.4 percent, and the rest is PSS and farmed depressions" — a statement a
wetland scientist can act on.

## Fix implementation

The classification below is deliberately explicit and deliberately conservative in the right places:
open water and permanently flooded systems are hard exclusions, forested and emergent wetlands are
permittable, and the floodway is separated from the wider 100-year zone.

```python
import geopandas as gpd

# Cowardin system/subsystem prefixes → constraint class.
NWI_CLASS = {
    "L1": "hard",         # lacustrine, limnetic — open water
    "L2": "hard",         # lacustrine, littoral
    "R2": "hard",         # riverine, lower perennial
    "R3": "hard",         # riverine, upper perennial
    "PUB": "hard",        # palustrine unconsolidated bottom — open water
    "PAB": "hard",        # palustrine aquatic bed
    "PFO": "permittable", # palustrine forested
    "PSS": "permittable", # palustrine scrub-shrub
    "PEM": "permittable", # palustrine emergent
}

FEMA_CLASS = {
    "AE": "permittable",  # 100-year with base flood elevation
    "A": "permittable",   # 100-year, no BFE determined
    "AO": "permittable",
    "AH": "permittable",
    "VE": "hard",         # coastal high hazard
    "X": "advisory",      # outside the 100-year zone
    "0.2 PCT ANNUAL CHANCE FLOOD HAZARD": "advisory",
}


def classify_wetland_flood_constraints(
    nwi: gpd.GeoDataFrame,
    fema: gpd.GeoDataFrame,
    *,
    working_epsg: int,
    floodway_field: str = "ZONE_SUBTY",
) -> dict[str, gpd.GeoDataFrame]:
    """Split both sources into hard, permittable and advisory layers."""
    nwi_p = nwi.to_crs(working_epsg).copy()
    nwi_p["_key"] = nwi_p["ATTRIBUTE"].astype(str).str[:3]
    nwi_p["constraint_class"] = (
        nwi_p["_key"].map(NWI_CLASS).fillna(nwi_p["_key"].str[:2].map(NWI_CLASS)).fillna("advisory")
    )

    fema_p = fema.to_crs(working_epsg).copy()
    fema_p["constraint_class"] = fema_p["FLD_ZONE"].astype(str).map(FEMA_CLASS).fillna("advisory")
    # The regulatory floodway is materially more restrictive than the rest of Zone AE.
    if floodway_field in fema_p.columns:
        is_floodway = fema_p[floodway_field].astype(str).str.contains("FLOODWAY", case=False, na=False)
        fema_p.loc[is_floodway, "constraint_class"] = "hard"

    combined = gpd.GeoDataFrame(
        gpd.pd.concat([nwi_p[["constraint_class", "geometry"]],
                       fema_p[["constraint_class", "geometry"]]], ignore_index=True),
        crs=nwi_p.crs,
    )
    return {cls: combined[combined["constraint_class"] == cls].copy()
            for cls in ("hard", "permittable", "advisory")}
```

<svg viewBox="0 0 940 388" role="img" aria-label="Why the wetland and flood layers cannot be added together. Along a river valley the two follow the same ground: of 17.6 percent NWI coverage and 25.0 percent FEMA coverage, 11.2 percentage points lie in both. Summing gives 42.6 percent; the union is 31.4. The overlap is not an error in either layer — it is what happens when two agencies map the same valley for different reasons." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>The overlap between wetlands and floodplain, drawn and counted</title>
  <desc>A Venn-style diagram over the study area with two overlapping regions: National Wetlands Inventory coverage at 17.6 percent and FEMA flood hazard coverage at 25.0 percent, sharing an overlap of 11.2 percentage points along the river valley. Beside it, three figures: the sum of the two coverages at 42.6 percent, the union at 31.4 percent, and the difference of 11.2 points labelled as the double count. A note explains that the overlap is expected, because both agencies map the same valley for different reasons.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="388"/>
  <defs><marker id="wt2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Two layers, one valley, 11.2 points counted twice</text>
  <circle cx="330" cy="190" r="108" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.8" opacity="0.75"/>
  <circle cx="456" cy="190" r="128" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.8" opacity="0.6"/>
  <text x="258" y="128" text-anchor="middle" font-size="12" fill="#2C6E8F" font-weight="700">NWI 17.6%</text>
  <text x="540" y="116" text-anchor="middle" font-size="12" fill="#7A4A1A" font-weight="700">FEMA 25.0%</text>
  <text x="394" y="196" text-anchor="middle" font-size="14" fill="currentColor" font-weight="700">11.2%</text>
  <text x="394" y="216" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">both</text>
  <rect x="640" y="90" width="268" height="60" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3" opacity="0.55"/>
  <text x="660" y="126" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">sum of the two</text>
  <text x="890" y="128" text-anchor="end" font-size="15" fill="currentColor" font-weight="700">42.6%</text>
  <rect x="640" y="166" width="268" height="60" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3" opacity="0.55"/>
  <text x="660" y="202" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">union of the two</text>
  <text x="890" y="204" text-anchor="end" font-size="15" fill="currentColor" font-weight="700">31.4%</text>
  <rect x="640" y="242" width="268" height="60" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3" opacity="0.55"/>
  <text x="660" y="278" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">counted twice</text>
  <text x="890" y="280" text-anchor="end" font-size="15" fill="currentColor" font-weight="700">11.2%</text>
  <rect x="40" y="326" width="868" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="347" text-anchor="middle" font-size="11.5" fill="currentColor">The overlap is expected: wetlands are where water sits, and the 100-year floodplain is where water goes.</text>
  <text x="474.0" y="364" text-anchor="middle" font-size="11.5" fill="currentColor">Two agencies mapped the same valley for different reasons, and neither is wrong.</text>
</svg>

## Fallback routing and performance tuning

- **Download by county, not by state.** Both NWI and the FEMA National Flood Hazard Layer publish
  county extracts; a state download is an order of magnitude larger and is clipped away immediately.
- **Cache the raw extract with its vintage.** FEMA revises flood maps continuously through Letters of
  Map Revision, and NWI is updated on an irregular state-by-state schedule. The vintage is part of
  the answer.
- **Dissolve by class before unioning.** Both layers carry many small polygons; dissolving each class
  first reduces the union input by an order of magnitude with no change to the result.
- **Expect unmapped areas.** Parts of the country have no detailed FEMA study and appear as an
  absence rather than as Zone X. Treat unmapped as unknown and flag it, never as unconstrained.
- **Keep the codes on the output.** A downstream reviewer will ask which code produced a given
  exclusion, and re-deriving it costs a rerun.

## Downstream validation

```python
def assert_constraint_split(layers: dict[str, gpd.GeoDataFrame], study_ha: float) -> None:
    """CI gate: the split has to be exhaustive, bounded and non-empty where it matters."""
    total = sum(float(g.geometry.area.sum()) / 10_000.0 for g in layers.values())
    assert total <= study_ha * 3, "classified area exceeds three times the study area — layers unclipped"
    assert not layers["hard"].empty or not layers["permittable"].empty, (
        "no constrained area at all — check the attribute field names against the source vintage"
    )
    for cls, gdf in layers.items():
        assert gdf.geometry.is_valid.all(), f"{cls}: invalid geometry survived classification"
        assert gdf["constraint_class"].eq(cls).all(), f"{cls}: mislabelled rows in the split"
```

<svg viewBox="0 0 940 372" role="img" aria-label="The classification each source code routes to, and what that means for the project. Open water and the regulatory floodway are hard exclusions that no permit resolves. Palustrine emergent, scrub-shrub and forested wetlands and the wider Zone AE are permittable, so they produce a second buildable figure conditional on a Section 404 permit or a floodplain development permit. Zone X and farmed depressions are advisory and belong in the scoring model rather than in any mask." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Where each source code ends up, and what the project can do about it</title>
  <desc>A routing diagram from source codes to constraint classes to project consequences. Open water codes L1, L2, R2, R3 and PUB and the FEMA regulatory floodway route to the hard class and to a buildable figure that no permit changes. Palustrine emergent, scrub-shrub and forested codes and FEMA Zones A, AE, AO and AH route to the permittable class and to a second figure conditional on a Section 404 individual permit or a local floodplain development permit. Zone X and farmed or temporarily flooded depressions route to the advisory class and into the weighted suitability score.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="372"/>
  <defs><marker id="wt3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">From attribute code to what the project can actually do</text>
  <rect x="40" y="66" width="300" height="76" rx="7" fill="none" stroke="#C85B5B" stroke-width="1.2" opacity="0.7"/>
  <text x="190" y="96" text-anchor="middle" font-size="11.5" fill="currentColor">L1 · L2 · R2 · R3 · PUB</text>
  <text x="190" y="118" text-anchor="middle" font-size="11.5" fill="currentColor">FEMA regulatory floodway</text>
  <line x1="346" y1="104" x2="386" y2="104" stroke="currentColor" stroke-width="1.4" marker-end="url(#wt3-arr)"/>
  <rect x="394" y="66" width="180" height="76" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.4"/>
  <text x="484" y="110" text-anchor="middle" font-size="13.5" fill="currentColor" font-weight="700">hard</text>
  <line x1="580" y1="104" x2="620" y2="104" stroke="currentColor" stroke-width="1.4" marker-end="url(#wt3-arr)"/>
  <rect x="628" y="66" width="280" height="76" rx="7" fill="none" stroke="#C85B5B" stroke-width="1.2" opacity="0.7"/>
  <text x="768" y="110" text-anchor="middle" font-size="11.5" fill="currentColor">no permit resolves this</text>
  <rect x="40" y="172" width="300" height="76" rx="7" fill="none" stroke="#F4A261" stroke-width="1.2" opacity="0.7"/>
  <text x="190" y="202" text-anchor="middle" font-size="11.5" fill="currentColor">PEM · PSS · PFO</text>
  <text x="190" y="224" text-anchor="middle" font-size="11.5" fill="currentColor">FEMA A · AE · AO · AH</text>
  <line x1="346" y1="210" x2="386" y2="210" stroke="currentColor" stroke-width="1.4" marker-end="url(#wt3-arr)"/>
  <rect x="394" y="172" width="180" height="76" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.4"/>
  <text x="484" y="216" text-anchor="middle" font-size="13.5" fill="currentColor" font-weight="700">permittable</text>
  <line x1="580" y1="210" x2="620" y2="210" stroke="currentColor" stroke-width="1.4" marker-end="url(#wt3-arr)"/>
  <rect x="628" y="172" width="280" height="76" rx="7" fill="none" stroke="#F4A261" stroke-width="1.2" opacity="0.7"/>
  <text x="768" y="216" text-anchor="middle" font-size="11.5" fill="currentColor">second figure, with a 404 or FDP path</text>
  <rect x="40" y="278" width="300" height="76" rx="7" fill="none" stroke="#5BA8C8" stroke-width="1.2" opacity="0.7"/>
  <text x="190" y="308" text-anchor="middle" font-size="11.5" fill="currentColor">Zone X</text>
  <text x="190" y="330" text-anchor="middle" font-size="11.5" fill="currentColor">farmed / temporarily flooded</text>
  <line x1="346" y1="316" x2="386" y2="316" stroke="currentColor" stroke-width="1.4" marker-end="url(#wt3-arr)"/>
  <rect x="394" y="278" width="180" height="76" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
  <text x="484" y="322" text-anchor="middle" font-size="13.5" fill="currentColor" font-weight="700">advisory</text>
  <line x1="580" y1="316" x2="620" y2="316" stroke="currentColor" stroke-width="1.4" marker-end="url(#wt3-arr)"/>
  <rect x="628" y="278" width="280" height="76" rx="7" fill="none" stroke="#5BA8C8" stroke-width="1.2" opacity="0.7"/>
  <text x="768" y="322" text-anchor="middle" font-size="11.5" fill="currentColor">weighted score, never a mask</text>
</svg>

## Frequently asked questions

### Does an NWI polygon mean the Corps will assert jurisdiction?

No. NWI is an inventory, not a determination, and the two disagree in both directions: NWI misses
small features below its mapping threshold and includes features that are not jurisdictional. A
screening model should treat NWI as evidence of likely constraint and a delineation as the answer,
which is exactly why these polygons belong in the permittable class rather than the hard one.

### Should Zone X be excluded at all?

Not as a constraint. Zone X is outside the 100-year floodplain and carries no federal development
restriction, so excluding it removes buildable land for no legal reason. It can reasonably carry a
small advisory weight in a scoring model, because insurers and lenders sometimes ask about the
0.2-percent-annual-chance zone, but that is a cost signal rather than an exclusion.

### How do I handle a study area with no FEMA data?

Flag it and stop, rather than assuming absence means safety. Unmapped areas are common in rural
counties and are the case where the screening model is most likely to be wrong, because the flood
risk is unknown rather than absent. A field survey or a state-level hazard layer is the substitute,
and the output should say which was used.

### Why do the wetland and floodplain layers disagree along rivers?

Because they map different things: NWI maps vegetation and hydrology as observed, and FEMA maps
modelled flood extent at a given recurrence interval. Along a river the two follow the same valley
and diverge in detail, which is exactly why they must be unioned rather than summed — and why the
overlap between them is one of the numbers worth publishing.


### Are state wetland programmes stricter than the federal one?

Often, and the difference is what a screening model most easily misses. Several states regulate
isolated wetlands that fall outside federal jurisdiction, and a few regulate buffers around wetlands
rather than only the wetland itself. The consequence for the pipeline is that the classification
table belongs in per-state configuration rather than in code, because the same Cowardin code can be
permittable in one state and effectively hard in its neighbour.

### How much does a wetland delineation change the screening figure?

Enough to be worth commissioning early on a shortlisted site. Field delineation typically moves the
regulated wetland area by 20 to 40 percent relative to NWI in either direction, because NWI misses
small features and includes some that are not jurisdictional. The screening figure is for ranking
sites; the delineation is for designing on one.

### Should the floodway be treated as buildable for solar?

No, and it is the one flood-zone answer that is nearly unambiguous. The regulatory floodway is the
channel that must convey the base flood without increasing flood height, so development there is
restricted far more tightly than in the wider Zone AE — which is exactly why it belongs in the hard
class while the rest of AE sits in the permittable one.

## Related

- [Environmental Constraint & Exclusion Screening](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/environmental-constraint-and-exclusion-screening/) — the parent workflow and its three constraint classes
- [Building Multi-Layer Exclusion Masks with GeoPandas Overlay](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/environmental-constraint-and-exclusion-screening/building-multi-layer-exclusion-masks-with-geopandas-overlay/) — unioning these layers with the others
- [Open Energy Data Portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/) — fetching and caching the source extracts
- [Regulatory Boundary Mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/) — the statutory setbacks these constraints compose with
