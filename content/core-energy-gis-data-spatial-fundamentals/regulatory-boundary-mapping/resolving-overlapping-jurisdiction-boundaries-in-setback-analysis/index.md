---
title: Resolving Overlapping Jurisdiction Boundaries in Setback Analysis
description: Decide which ordinance applies when county, municipal and state boundaries overlap a parcel — an explicit precedence table, a most-restrictive default, per-parcel attribution, and an audit that names the binding rule.
slug: resolving-overlapping-jurisdiction-boundaries-in-setback-analysis
type: article
breadcrumb: Resolving Overlapping Jurisdictions
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Resolving Overlapping Jurisdiction Boundaries in Setback Analysis

The scenario: a parcel on the edge of an incorporated town is screened against the county ordinance,
clears a 300-metre dwelling setback, and is then rejected in pre-application review because the town
requires 500 metres and the parcel sits inside its extraterritorial jurisdiction. The geometry was
right, the ordinance lookup was right for the county, and nothing in the pipeline knew that two
ordinances applied at once. This page makes the precedence explicit, and it extends
[regulatory boundary mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/).

## Root-cause analysis

Overlapping jurisdiction is the normal case, not the exception, and three assumptions break on it.

1. **One parcel, one jurisdiction.** A parcel can sit inside a county, an incorporated municipality's
   extraterritorial jurisdiction, a special district and a state overlay simultaneously, and each may
   publish its own setback. A point-in-polygon join returning the first match picks one arbitrarily.
2. **Nearest-boundary attribution.** Assigning a parcel to whichever jurisdiction polygon its
   centroid falls in fails for parcels that straddle a boundary — and a straddling parcel is subject
   to both ordinances over the parts they cover, not to one over all of it.
3. **Precedence hard-coded as an ordering.** Writing "county then municipality" into the loop encodes
   a legal judgement in code, where nobody reviews it. Where a state pre-emption statute inverts the
   usual order, the code is quietly wrong for that state and nothing indicates it.

<svg viewBox="0 0 940 400" role="img" aria-label="How jurisdictions overlap on one county-edge portfolio. Of 412 parcels, 379 sit in a single jurisdiction, 27 fall inside both the county and a municipal extraterritorial jurisdiction, 4 also fall inside a special district, and 8 straddle a boundary rather than sitting wholly inside one. The 33 multi-jurisdiction parcels are eight percent of the portfolio and carry two different setbacks each." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Jurisdiction overlap across a county-edge portfolio</title>
  <desc>A breakdown of 412 parcels by how many jurisdictions apply. 379 parcels have one, 27 have two — typically a county plus a municipal extraterritorial jurisdiction — 4 have three with a special district added, and 2 have four. Separately, 8 parcels are marked as straddling a jurisdiction boundary rather than lying wholly inside one, which means different setbacks apply to different parts of the same parcel. A note gives the share of the portfolio affected as eight percent.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="ju1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">412 parcels on a county edge — how many ordinances apply?</text>
  <rect x="280" y="76" width="587.45" height="46" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="268" y="106" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">one jurisdiction</text>
  <text x="879.45" y="106" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">379</text>
  <rect x="280" y="132" width="41.85" height="46" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="268" y="162" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">two — county + ETJ</text>
  <text x="333.85" y="162" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">27</text>
  <rect x="280" y="188" width="6.2" height="46" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="268" y="218" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">three — plus a district</text>
  <text x="298.2" y="218" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">4</text>
  <rect x="280" y="244" width="5" height="46" rx="5" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="268" y="274" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">four</text>
  <text x="297" y="274" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">2</text>
  <rect x="40" y="306" width="428" height="48" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.5"/>
  <text x="254.0" y="327" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">8 parcels straddle a boundary</text>
  <text x="254.0" y="344" text-anchor="middle" font-size="11.5" fill="currentColor">different setbacks over different parts</text>
  <rect x="492" y="306" width="416" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="700.0" y="327" text-anchor="middle" font-size="11.5" fill="currentColor">33 parcels carry two setbacks — 8% of the</text>
  <text x="700.0" y="344" text-anchor="middle" font-size="11.5" fill="currentColor">portfolio, and the edge cases are on the edge</text>
</svg>

## Pre-flight validation

Establish how much of the problem exists before designing for it: count the parcels touched by more
than one jurisdiction, and the parcels that straddle a boundary rather than sitting inside one.

```python
import geopandas as gpd


def jurisdiction_overlap_profile(
    parcels: gpd.GeoDataFrame,
    jurisdictions: gpd.GeoDataFrame,
    *,
    id_field: str = "parcel_id",
    juris_field: str = "jurisdiction_id",
) -> dict:
    """How many parcels have more than one applicable ordinance, and how many straddle."""
    joined = gpd.sjoin(parcels[[id_field, "geometry"]], jurisdictions[[juris_field, "geometry"]],
                       how="left", predicate="intersects")
    per_parcel = joined.groupby(id_field)[juris_field].nunique()

    straddling = []
    multi = per_parcel[per_parcel > 1].index
    for pid in multi:
        geom = parcels.loc[parcels[id_field] == pid, "geometry"].iloc[0]
        covers = jurisdictions[jurisdictions.intersects(geom)]
        wholly_inside = any(geom.within(g) for g in covers.geometry)
        if not wholly_inside:
            straddling.append(pid)

    return {
        "parcels": len(parcels),
        "single_jurisdiction": int((per_parcel == 1).sum()),
        "multi_jurisdiction": int((per_parcel > 1).sum()),
        "straddling_a_boundary": len(straddling),
        "max_jurisdictions_on_one_parcel": int(per_parcel.max()) if len(per_parcel) else 0,
    }
```

On a typical county-edge portfolio this returns something like eight percent multi-jurisdiction and
two percent straddling — small enough to ignore by accident and large enough to lose a project.

## Fix implementation

The resolution has two parts: a precedence table that lives in configuration with a citation, and a
per-parcel evaluation that applies every applicable rule and records which one bound.

```python
from dataclasses import dataclass

import geopandas as gpd


@dataclass(frozen=True)
class OrdinanceRule:
    jurisdiction_id: str
    level: str                 # "state" | "county" | "municipal" | "district"
    setback_m: float
    citation: str
    pre_empts: tuple[str, ...] = ()     # levels this rule overrides where statute says so


def applicable_setback(
    parcel_geom,
    jurisdictions: gpd.GeoDataFrame,
    rules: dict[str, OrdinanceRule],
    *,
    juris_field: str = "jurisdiction_id",
) -> dict:
    """Every rule that applies, the one that binds, and why."""
    touching = jurisdictions[jurisdictions.intersects(parcel_geom)]
    applicable = [rules[j] for j in touching[juris_field] if j in rules]
    if not applicable:
        raise ValueError("no ordinance found for this parcel — the jurisdiction layer has a hole")

    # Pre-emption first: a rule that pre-empts a level removes that level from contention.
    pre_empted_levels = {lvl for r in applicable for lvl in r.pre_empts}
    contenders = [r for r in applicable if r.level not in pre_empted_levels] or applicable

    # Default among survivors: the most restrictive applies. Both parts are policy,
    # so both are stated here rather than implied by an ordering somewhere.
    binding = max(contenders, key=lambda r: r.setback_m)

    return {
        "setback_m": binding.setback_m,
        "binding_jurisdiction": binding.jurisdiction_id,
        "binding_level": binding.level,
        "citation": binding.citation,
        "applicable": [
            {"jurisdiction": r.jurisdiction_id, "level": r.level, "setback_m": r.setback_m}
            for r in applicable
        ],
        "pre_empted_levels": sorted(pre_empted_levels),
    }
```

Returning the whole applicable list alongside the binding rule is what makes the result reviewable.
A land team asking "why 500 metres and not 300" gets the answer from the record instead of from a
rerun.

<svg viewBox="0 0 940 404" role="img" aria-label="How the binding setback is chosen for one parcel. Three ordinances apply: a state overlay at 150 metres that pre-empts county rules, a county rule at 300 metres, and a municipal extraterritorial rule at 500 metres. Pre-emption removes the county rule from contention; the most-restrictive default then selects the municipal 500 metres, and the record names both the binding rule and the one that was pre-empted." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Pre-emption first, then most-restrictive</title>
  <desc>A two-stage decision for one parcel with three applicable ordinances: a state overlay at 150 metres that pre-empts county rules, a county rule at 300 metres, and a municipal extraterritorial jurisdiction rule at 500 metres. Stage one, pre-emption, removes the county rule from contention and leaves the state and municipal rules. Stage two, the most-restrictive default, selects the municipal rule at 500 metres. The output record lists all three applicable rules, the binding one with its citation, and the level that was pre-empted.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="404"/>
  <defs><marker id="ju2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Two policies, stated separately: pre-emption, then most-restrictive</text>
  <rect x="40" y="70" width="300" height="62" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3" opacity="0.55"/>
  <text x="60" y="98" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">state overlay</text>
  <text x="60" y="120" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.88">pre-empts county</text>
  <text x="322" y="108" text-anchor="end" font-size="14" fill="currentColor" font-weight="700">150 m</text>
  <line x1="348" y1="101" x2="388" y2="101" stroke="currentColor" stroke-width="1.4" opacity="0.55" marker-end="url(#ju2-arr)"/>
  <rect x="40" y="148" width="300" height="62" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3" opacity="0.55"/>
  <text x="60" y="176" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">county</text>
  <text x="60" y="198" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.88">pre-empted here</text>
  <text x="322" y="186" text-anchor="end" font-size="14" fill="currentColor" font-weight="700">300 m</text>
  <line x1="348" y1="179" x2="388" y2="179" stroke="currentColor" stroke-width="1.4" opacity="0.55" marker-end="url(#ju2-arr)"/>
  <rect x="40" y="226" width="300" height="62" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3" opacity="0.55"/>
  <text x="60" y="254" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">municipal ETJ</text>
  <text x="60" y="276" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.88">binding</text>
  <text x="322" y="264" text-anchor="end" font-size="14" fill="currentColor" font-weight="700">500 m</text>
  <line x1="348" y1="257" x2="388" y2="257" stroke="currentColor" stroke-width="1.4" opacity="0.55" marker-end="url(#ju2-arr)"/>
  <rect x="396" y="92" width="240" height="73" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="516.0" y="114" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">stage 1 · pre-emption</text>
  <text x="516.0" y="133" text-anchor="middle" font-size="11.5" fill="currentColor">county removed</text>
  <text x="516.0" y="152" text-anchor="middle" font-size="11" fill="currentColor">state statute cited</text>
  <line x1="644" y1="130" x2="684" y2="130" stroke="currentColor" stroke-width="1.4" marker-end="url(#ju2-arr)"/>
  <rect x="692" y="92" width="216" height="54" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="800.0" y="114" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">stage 2 · most restrictive</text>
  <text x="800.0" y="133" text-anchor="middle" font-size="11.5" fill="currentColor">of what remains</text>
  <rect x="396" y="214" width="512" height="73" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="652.0" y="236" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">binding: municipal ETJ · 500 m</text>
  <text x="652.0" y="255" text-anchor="middle" font-size="11.5" fill="currentColor">citation recorded · county pre-empted</text>
  <text x="652.0" y="274" text-anchor="middle" font-size="11.5" fill="currentColor">all three applicable rules kept in the record</text>
  <rect x="40" y="316" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="335" text-anchor="middle" font-size="11" fill="currentColor">Both stages are policy, so both are written down. An ordering buried in a loop is a legal judgement that</text>
  <text x="474.0" y="350" text-anchor="middle" font-size="11" fill="currentColor">nobody reviews — and it is quietly wrong in every state that pre-empts local siting rules.</text>
</svg>

## Handling a parcel that straddles a boundary

A parcel lying partly in two jurisdictions is not subject to the stricter rule everywhere — it is
subject to each rule over the part that jurisdiction covers. Two treatments are defensible and they
give different answers.

**Split and evaluate per part.** Intersect the parcel with each jurisdiction, apply that
jurisdiction's setback to its own piece, and union the buildable remainders. This is the legally
accurate treatment and produces a buildable envelope with a discontinuity at the boundary, which is
what actually exists.

**Apply the most restrictive to the whole parcel.** Simpler, conservative, and wrong in the direction
that loses buildable land. It is a reasonable screening default and a poor basis for a layout,
because it discards area the parcel genuinely has.

The choice belongs in configuration, and the output should say which was used. For a screening pass
the conservative treatment is fine as long as the straddling parcels are flagged; for a shortlisted
site, split and evaluate per part before any layout work begins.

<svg viewBox="0 0 940 396" role="img" aria-label="Two defensible treatments of a parcel that straddles a boundary. Applying the stricter rule to the whole parcel leaves 18.2 buildable hectares and is conservative. Splitting the parcel and applying each jurisdiction’s rule to its own part leaves 23.6 hectares with a step in the buildable edge at the boundary — which is what the ordinances actually create. The 5.4 hectare difference is land the conservative treatment discards." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Whole-parcel strictest rule against split-and-evaluate</title>
  <desc>Two plan views of the same parcel crossed by a jurisdiction boundary, with the county on the west at a 300 metre setback and a municipal extraterritorial jurisdiction on the east at 500 metres. In the first, the stricter 500 metre setback is applied across the whole parcel, leaving 18.2 buildable hectares with a straight setback line. In the second, each part is evaluated under its own rule, leaving 23.6 hectares with a visible step in the buildable edge where the boundary crosses. The 5.4 hectare difference is annotated as land the conservative treatment discards.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="ju3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The stricter rule everywhere, or each rule where it applies</text>
  <text x="240" y="66" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">strictest rule applied to the whole parcel</text>
  <rect x="40" y="80" width="400" height="200" rx="3" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <line x1="260" y1="80" x2="260" y2="280" stroke="#5BA8C8" stroke-width="2" stroke-dasharray="6 4"/>
  <text x="190" y="100" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">county</text>
  <text x="350" y="100" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">municipal ETJ</text>
  <rect x="50" y="200" width="380" height="70" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.6" opacity="0.6"/>
  <text x="240" y="244" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">buildable</text>
  <text x="240" y="302" text-anchor="middle" font-size="14" fill="currentColor" font-weight="700">18.2 ha</text>
  <text x="700" y="66" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">split · each rule on its own part</text>
  <rect x="500" y="80" width="400" height="200" rx="3" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <line x1="720" y1="80" x2="720" y2="280" stroke="#5BA8C8" stroke-width="2" stroke-dasharray="6 4"/>
  <text x="650" y="100" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">county</text>
  <text x="810" y="100" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">municipal ETJ</text>
  <path d="M510,270 L510,170 L720,170 L720,200 L890,200 L890,270 Z" fill="#DDF0E2" fill-opacity="0.6" stroke="#3D8B5F" stroke-width="1.6"/>
  <text x="700" y="244" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">buildable</text>
  <text x="700" y="302" text-anchor="middle" font-size="14" fill="currentColor" font-weight="700">23.6 ha</text>
  <rect x="40" y="324" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="343" text-anchor="middle" font-size="11" fill="currentColor">The split treatment is the legally accurate one and produces a step in the buildable edge, because that step</text>
  <text x="474.0" y="358" text-anchor="middle" font-size="11" fill="currentColor">is what the two ordinances create. The conservative treatment is a fine screening default and a poor layout input.</text>
</svg>

## Downstream validation

```python
def assert_jurisdiction_attribution(results, *, require_citation: bool = True) -> None:
    """Every parcel must name a binding rule, and the binding rule must be applicable."""
    for pid, res in results.items():
        assert res["applicable"], f"{pid}: no applicable ordinance recorded"
        binding = res["binding_jurisdiction"]
        assert any(a["jurisdiction"] == binding for a in res["applicable"]), (
            f"{pid}: binding jurisdiction {binding} is not in the applicable list"
        )
        assert res["setback_m"] == max(
            a["setback_m"] for a in res["applicable"]
            if a["level"] not in res["pre_empted_levels"]
        ), f"{pid}: binding setback is not the most restrictive among non-pre-empted rules"
        if require_citation:
            assert res.get("citation"), f"{pid}: binding rule has no citation — unreviewable"
```

## Frequently asked questions

### Is "most restrictive wins" always right?

It is the right default and not a universal rule. Several states pre-empt local wind or solar siting
ordinances outright, and in those the state rule governs even when it is less restrictive. Encoding
the default as policy with an explicit pre-emption list — rather than as an ordering in a loop — is
what lets a per-state exception be added without touching the evaluation logic.

### What about a parcel with no jurisdiction at all?

Treat it as an error in the boundary layer rather than as an absence of regulation. Unincorporated
land still sits in a county, so a parcel matching nothing usually means a gap or a CRS problem in the
jurisdiction layer. Failing loudly is right: a silently unregulated parcel is the most dangerous
possible output of this stage.

### How should extraterritorial jurisdiction be represented?

As its own polygon with its own rule, not as an extension of the municipal boundary. ETJ areas
frequently carry a different setback from the municipality proper, and merging them into one polygon
makes that distinction unrepresentable. The same applies to overlay districts and special-purpose
districts.

### Does the precedence table need a vintage?

Yes, per rule. Ordinances are amended on their own schedules, and a screening result is only as
current as the rule it applied. Recording the adoption date and the citation with each rule lets a
refresh list exactly which parcels are affected when one changes.

### How do I keep the table maintainable across hundreds of jurisdictions?

Store it as data with a citation per row, keep it under version control, and treat an edit as a
reviewable change rather than a configuration tweak. The volume is manageable because most
jurisdictions default to their county's rule — the table only needs the ones that differ, plus a
documented default.

### What should the screening output carry per parcel?

The binding setback, the jurisdiction and level that produced it, the citation, the full applicable
list, and the straddling treatment used. Those five fields answer every question the next reviewer
asks, and all five are already computed by the evaluation above.


### Should the repair run on ingestion or before each analysis?

On ingestion, with a cheap re-assertion before an expensive analysis. Repairing at the boundary means
the working store carries one invariant — every geometry is valid — and every consumer can rely on
it. The re-assertion before a long overlay costs a second against an indexed frame and catches the
case where something wrote to the store outside the pipeline, which is worth far more than it costs.

### How do I tell a genuine multipart parcel from a repaired bowtie?

By the source, not by the geometry. Genuine multipart holdings are common — a farm either side of a
road is one parcel with two polygons — and they arrive multipart from the county. A parcel that was
single-part on input and multipart on output was changed by the repair, which is exactly what the
`parts_after` column in the report records. Comparing input and output part counts separates the two
without any judgement about shape.

## Related

- [Regulatory Boundary Mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/) — the parent workflow and its precedence discussion
- [Clipping Solar Parcels to County Setback Boundaries in GeoPandas](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/clipping-solar-parcels-to-county-setback-boundaries-in-geopandas/) — applying the resolved setback geometrically
- [Automating US County Boundary Extraction with OSMnx](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/automating-us-county-boundary-extraction-with-osmnx/) — sourcing the jurisdiction polygons
- [Calculating Buildable Area After Setback and Habitat Exclusions](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/environmental-constraint-and-exclusion-screening/calculating-buildable-area-after-setback-and-habitat-exclusions/) — the consumer of the resolved setback
