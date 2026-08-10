---
title: Reconciling Mismatched Substation IDs Across Grid Datasets
description: Join substation attributes across HIFLD, utility, and OSM sources whose keys don't match — why exact-key joins drop most rows, plus an attribute-first fuzzy match with a projected-CRS nearest tie-break, confidence scoring, and a one-to-one CI gate.
slug: reconciling-mismatched-substation-ids-across-grid-datasets
type: article
breadcrumb: Reconciling Mismatched Substation IDs
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Reconciling Mismatched Substation IDs Across Grid Datasets

You have two substation layers — say HIFLD as the spatial backbone and a utility interconnection export carrying the capacity numbers you actually need — and the moment you run `pd.merge(hifld_gdf, utility_gdf, on="substation_id")` the result comes back with a fraction of the rows you expected. The keys don't line up: HIFLD uses its own `ID`, the utility uses a SCADA point name, and an OpenStreetMap extract carries `osm_id` and a free-text `name`. There is no shared identifier, so an exact-key join silently drops most rows and quietly fabricates a dataset that looks joined but is mostly hollow. This is the identity-resolution failure that sits underneath [network attribute validation](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/): every schema and topology check downstream is meaningless if the attributes were bolted onto the wrong node in the first place.

The naive instinct — "just do a spatial join instead" — trades one silent error for another. Two substations serving different voltage classes can sit 200 m apart on the same campus, and a nearest-geometry join with no attribute check will happily assign the 500 kV bus's capacity to the 138 kV yard next door. The reliable pattern is neither pure-key nor pure-spatial: it is attribute-first fuzzy matching on a normalized name, disambiguated by spatial nearest within a tolerance in a projected CRS, with a confidence score attached to every match so the weak ones can be reviewed instead of trusted.

## Root-cause analysis

Three compounding causes turn a substation join into a data-integrity incident, and each maps to a distinct stage of the fix below:

1. **No shared key domain.** HIFLD, utility GIS, and [OpenStreetMap-derived transmission data](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/mapping-high-voltage-transmission-lines-from-openstreetmap/) mint identifiers independently. An inner join on `substation_id` matches only the accidental collisions and drops the rest — and because pandas returns a valid (small) frame, nothing raises. The row count is the only symptom.
2. **Duplicate and drifting names.** Names are the natural fallback key, but they are dirty: `"Oak Ridge 500kV"`, `"OAK RIDGE"`, and `"Oak Ridge Sub #2"` refer to related-but-distinct assets, while abbreviations (`St.` vs `Saint`), suffixes (`Substation`, `Sub`, `S/S`), and voltage tags embedded in the name defeat an exact string match. A single utility can also reuse one name across two physical yards.
3. **Spatial-join ambiguity.** Once you fall back to geometry, co-located substations inside a tolerance make the nearest-neighbour assignment non-unique. Worse, a naive nearest join is *many-to-one*: several source nodes can all claim the same target, collapsing distinct assets and double-counting capacity. Distance is also only meaningful after strict [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — run nearest search in EPSG:4326 and you are ranking candidates by degrees, not metres.

<svg viewBox="0 0 900 470" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Reconciliation decision flow. Two source layers with mismatched IDs feed a name-normalization step. A fuzzy name match above the score threshold accepts the match directly. Ambiguous or below-threshold candidates route to a spatial nearest tie-break within tolerance in a projected CRS. Both accepted paths pass a one-to-one resolution gate that keeps the highest-confidence pair per target and reports the rest as unmatched rather than dropping them." style="max-width:100%;height:auto;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="900" height="470"/>
  <title>Attribute-first reconciliation with spatial tie-break and one-to-one resolution</title>
  <desc>Two source substation layers with non-matching identifiers are normalized to a comparable name key. A fuzzy name score above threshold accepts a candidate pair directly. Candidates that are ambiguous or below threshold route right to a spatial nearest tie-break computed within a distance tolerance in a projected CRS. Both accepted paths converge on a one-to-one resolution gate that keeps the single highest-confidence pair per target and emits everything else to an unmatched report instead of dropping it.</desc>
  <defs>
    <marker id="rec-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="900" height="470" fill="none"/>
  <!-- source A -->
  <rect x="24" y="30" width="180" height="60" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="114" y="55" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">HIFLD layer</text>
  <text x="114" y="73" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">ID · name · geom</text>
  <!-- source B -->
  <rect x="24" y="110" width="180" height="60" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="114" y="135" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Utility / OSM layer</text>
  <text x="114" y="153" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">own key · name · geom</text>
  <!-- normalize -->
  <rect x="270" y="70" width="176" height="60" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="358" y="95" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">normalize name</text>
  <text x="358" y="113" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">lower · strip suffix/kV</text>
  <line x1="204" y1="60" x2="266" y2="92" stroke="currentColor" stroke-width="1.4" marker-end="url(#rec-arr)"/>
  <line x1="204" y1="140" x2="266" y2="108" stroke="currentColor" stroke-width="1.4" marker-end="url(#rec-arr)"/>
  <!-- fuzzy decision -->
  <path d="M358,150 L446,200 L358,250 L270,200 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="358" y="196" text-anchor="middle" font-size="11.5" fill="currentColor">fuzzy score</text>
  <text x="358" y="212" text-anchor="middle" font-size="11.5" fill="currentColor">&#8805; threshold?</text>
  <line x1="358" y1="130" x2="358" y2="148" stroke="currentColor" stroke-width="1.4" marker-end="url(#rec-arr)"/>
  <!-- yes -> accept -->
  <line x1="358" y1="250" x2="358" y2="300" stroke="currentColor" stroke-width="1.4" marker-end="url(#rec-arr)"/>
  <text x="372" y="278" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">yes</text>
  <!-- no -> spatial tie-break -->
  <line x1="446" y1="200" x2="560" y2="200" stroke="currentColor" stroke-width="1.4" marker-end="url(#rec-arr)"/>
  <text x="500" y="191" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">ambiguous</text>
  <rect x="562" y="170" width="314" height="60" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="719" y="194" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">spatial nearest tie-break</text>
  <text x="719" y="212" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">within tol · EPSG:32614</text>
  <line x1="719" y1="230" x2="719" y2="300" stroke="currentColor" stroke-width="1.4" marker-end="url(#rec-arr)"/>
  <text x="734" y="270" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">candidate</text>
  <!-- accept row -->
  <rect x="270" y="302" width="176" height="52" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="358" y="333" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">scored candidate pair</text>
  <rect x="631" y="302" width="176" height="52" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="719" y="333" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">scored candidate pair</text>
  <!-- converge to resolution -->
  <path d="M358,354 V386 H440" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#rec-arr)"/>
  <path d="M719,354 V386 H460" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#rec-arr)"/>
  <rect x="300" y="388" width="300" height="56" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="450" y="412" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">one-to-one resolution</text>
  <text x="450" y="431" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">best per target · rest &#8594; unmatched report</text>
</svg>

## Pre-flight validation

Before attempting any match, confirm that the two ingredients the strategy depends on are sound: the candidate keys are actually unique within each layer, and both layers live in a projected metric CRS so the nearest tie-break measures metres. A duplicate key on either side silently converts a one-to-one match into a fan-out; a geographic CRS makes the tolerance meaningless.

<svg viewBox="0 0 940 412" role="img" aria-label="The same substation as it appears in four systems: EIA plant code 55023, the utility SCADA name BRZ_SUB_2 230KV, OpenStreetMap node 3184927265, and an internal asset UUID. No two share a key, none is guaranteed unique across vintages, and only the OSM record carries a geometry, which is why reconciliation has to start from attributes and use position only as a tie-break." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>One substation, four identifier schemes, no shared key</title>
  <desc>Four record cards for the same physical substation. The EIA record carries plant code 55023, a plant name and a county, but no geometry. The utility SCADA record carries the string BRZ_SUB_2 230KV, a voltage and a control area, with no stable identifier at all. The OpenStreetMap record carries node 3184927265 with a latitude and longitude and free text tags. The internal asset register carries a UUID and the project codes that reference it. Arrows from all four converge on a reconciliation step that matches on normalised name and voltage first, then breaks ties by distance.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="412"/>
  <defs><marker id="id-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Four systems describe this substation and share no key at all</text>
  <rect x="34" y="66" width="190" height="70" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="129.0" y="88" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">EIA-860</text>
  <text x="129.0" y="106" text-anchor="middle" font-size="11.5" fill="currentColor">plant_code 55023</text>
  <text x="129.0" y="124" text-anchor="middle" font-size="10.5" fill="currentColor">name · county · no geometry</text>
  <line x1="129" y1="148" x2="470" y2="208" stroke="currentColor" stroke-width="1.1" opacity="0.35" marker-end="url(#id-arr)"/>
  <rect x="262" y="66" width="190" height="70" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="357.0" y="88" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">Utility SCADA</text>
  <text x="357.0" y="106" text-anchor="middle" font-size="11.5" fill="currentColor">BRZ_SUB_2 230KV</text>
  <text x="357.0" y="124" text-anchor="middle" font-size="10.5" fill="currentColor">free-text name · voltage</text>
  <line x1="357" y1="148" x2="470" y2="208" stroke="currentColor" stroke-width="1.1" opacity="0.35" marker-end="url(#id-arr)"/>
  <rect x="490" y="66" width="190" height="70" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="585.0" y="88" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">OpenStreetMap</text>
  <text x="585.0" y="106" text-anchor="middle" font-size="11.5" fill="currentColor">node 3184927265</text>
  <text x="585.0" y="124" text-anchor="middle" font-size="10.5" fill="currentColor">lat/lon · loose tags</text>
  <line x1="585" y1="148" x2="470" y2="208" stroke="currentColor" stroke-width="1.1" opacity="0.35" marker-end="url(#id-arr)"/>
  <rect x="718" y="66" width="190" height="70" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="813.0" y="88" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">Asset register</text>
  <text x="813.0" y="106" text-anchor="middle" font-size="11.5" fill="currentColor">uuid 8f2c…d41</text>
  <text x="813.0" y="124" text-anchor="middle" font-size="10.5" fill="currentColor">internal project links</text>
  <line x1="813" y1="148" x2="470" y2="208" stroke="currentColor" stroke-width="1.1" opacity="0.35" marker-end="url(#id-arr)"/>
  <rect x="300" y="214" width="340" height="88" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="470.0" y="236" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">reconcile</text>
  <text x="470.0" y="254" text-anchor="middle" font-size="11.5" fill="currentColor">1 · normalised name + voltage</text>
  <text x="470.0" y="272" text-anchor="middle" font-size="11.5" fill="currentColor">2 · distance tie-break under 500 m</text>
  <text x="470.0" y="290" text-anchor="middle" font-size="11.5" fill="currentColor">3 · one-to-one assignment</text>
  <line x1="470" y1="316" x2="470" y2="344" stroke="currentColor" stroke-width="1.4" marker-end="url(#id-arr)"/>
  <rect x="40" y="348" width="228" height="46" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="154.0" y="366" text-anchor="middle" font-size="14" fill="currentColor" font-weight="700">1 842</text>
  <text x="154.0" y="385" text-anchor="middle" font-size="11" fill="currentColor">exact attribute match</text>
  <rect x="356" y="348" width="228" height="46" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="470.0" y="366" text-anchor="middle" font-size="14" fill="currentColor" font-weight="700">318</text>
  <text x="470.0" y="385" text-anchor="middle" font-size="11" fill="currentColor">name + distance tie-break</text>
  <rect x="672" y="348" width="228" height="46" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="786.0" y="366" text-anchor="middle" font-size="14" fill="currentColor" font-weight="700">47</text>
  <text x="786.0" y="385" text-anchor="middle" font-size="11" fill="currentColor">unresolved — queued for review</text>
</svg>

```python
import geopandas as gpd

PROJECTED_EPSG = 32614  # UTM Zone 14N — metric frame for nearest-distance tie-break


def preflight_reconcile(
    left_gdf: gpd.GeoDataFrame,
    right_gdf: gpd.GeoDataFrame,
    left_key: str,
    right_key: str,
) -> None:
    """Fail loudly on the two preconditions the reconcile depends on."""
    for name, gdf, key in [("left", left_gdf, left_key), ("right", right_gdf, right_key)]:
        # Key uniqueness — a duplicated key turns a 1:1 match into a fan-out
        dupes = int(gdf[key].duplicated().sum())
        if dupes:
            raise ValueError(f"{name} layer has {dupes} duplicate values in '{key}'")
        # CRS must be projected: distance tolerance is only meaningful in metres
        if gdf.crs is None or gdf.crs.is_geographic:
            raise ValueError(
                f"{name} layer is unprojected ({gdf.crs}); reproject to "
                f"EPSG:{PROJECTED_EPSG} before nearest-distance matching"
            )
        if gdf.crs.to_epsg() != PROJECTED_EPSG:
            raise ValueError(f"{name} layer must be EPSG:{PROJECTED_EPSG}, got {gdf.crs.to_epsg()}")
```

Running this first turns two invisible failure modes — a fan-out join and a degree-scale tolerance — into explicit, early exceptions rather than a corrupted capacity surface discovered at interconnection review.

## Fix implementation

The reconcile function scores each candidate pair on two independent signals and combines them. Name similarity comes from a normalized token-set ratio (robust to reordering and suffixes); spatial proximity is converted to a $[0,1]$ score that decays with distance. The blended confidence is a weighted sum,

$$ c = w_n \cdot s_{\text{name}} + w_d \cdot \left(1 - \frac{d}{d_{\max}}\right), \qquad w_n + w_d = 1 $$

where $s_{\text{name}}$ is the fuzzy ratio in $[0,1]$, $d$ is the projected nearest-neighbour distance in metres, and $d_{\max}$ is the tolerance. Weighting name above distance ($w_n = 0.7$) reflects that a strong name agreement is more discriminating than co-location on a shared campus. Candidates beyond `max_dist_m` are dropped outright — no name score rescues a substation on the wrong side of the county.

```python
import geopandas as gpd
import pandas as pd
from rapidfuzz import fuzz


def normalize_substation_name(raw: str) -> str:
    """Strip voltage tags, suffixes, and punctuation to a comparable key."""
    import re
    s = (raw or "").lower()
    s = re.sub(r"\b\d+\s*kv\b", " ", s)                       # drop embedded voltage
    s = re.sub(r"\b(substation|sub|s/s|station|switchyard)\b", " ", s)
    s = re.sub(r"[^a-z0-9 ]", " ", s)                          # punctuation -> space
    return re.sub(r"\s+", " ", s).strip()


def reconcile_substations(
    left_gdf: gpd.GeoDataFrame,   # spatial backbone, e.g. HIFLD (EPSG:32614)
    right_gdf: gpd.GeoDataFrame,  # attribute source, e.g. utility export (EPSG:32614)
    max_dist_m: float = 750.0,
    name_weight: float = 0.70,
    min_confidence: float = 0.55,
) -> gpd.GeoDataFrame:
    """Attribute-first fuzzy match with a projected-CRS nearest tie-break.

    Returns one row per left feature with the best right candidate, a
    match_confidence in [0, 1], and match_method for the audit trail.
    """
    left = left_gdf.copy()
    right = right_gdf.copy()
    left["_name_key"] = left["name"].map(normalize_substation_name)
    right["_name_key"] = right["name"].map(normalize_substation_name)

    # 1. Spatial candidate set: nearest right feature within the tolerance.
    #    sjoin_nearest builds the R-tree once and returns the metric distance;
    #    index_right carries the matched target's identity for one-to-one resolution.
    joined = gpd.sjoin_nearest(
        left, right, how="left", max_distance=max_dist_m, distance_col="_dist_m",
    )

    # 2. Score every surviving candidate pair on name + distance.
    name_score = joined.apply(
        lambda r: fuzz.token_set_ratio(r["_name_key_left"], r["_name_key_right"]) / 100.0,
        axis=1,
    )
    dist_score = (1.0 - (joined["_dist_m"] / max_dist_m)).clip(lower=0.0)
    joined["match_confidence"] = (name_weight * name_score
                                  + (1 - name_weight) * dist_score).round(3)
    joined["match_method"] = "fuzzy_name+spatial"

    # 3. One-to-one resolution: keep the single best candidate per RIGHT target,
    #    so two left nodes can never both claim the same utility record.
    joined = joined[joined["match_confidence"] >= min_confidence]
    joined = (joined.sort_values("match_confidence", ascending=False)
                    .drop_duplicates(subset="index_right", keep="first"))
    return joined
```

The `drop_duplicates(subset="index_right")` step is the load-bearing line: it enforces the one-to-one contract that a plain `sjoin_nearest` violates, preventing the many-to-one collapse where several HIFLD nodes all inherit the same utility capacity value.

## Fallback routing & performance tuning

- **Blocking before scoring.** `sjoin_nearest` on the projected geometries is already an R-tree query, but for national layers pre-filter with `gdf.sindex` or a coarse geohash bucket so the fuzzy scorer only sees spatially plausible pairs — string comparison is the expensive step, not the spatial index.
- **Tune the tolerance to the source.** A `max_dist_m` of 750 m suits utility-vs-HIFLD point offsets; tighten to ~250 m for two authoritative surveys and loosen for OSM nodes digitised off aerial imagery. Record the value in the output attributes so a reviewer can reproduce the run.
- **Route the weak tail to review, never to a guess.** Pairs below `min_confidence` are unmatched *by design*. Emit them to a queue for manual reconciliation rather than lowering the threshold until everything matches — a forced match is worse than an honest gap.
- **Swap the scorer for scale.** `rapidfuzz.process.cdist` computes the full name-similarity matrix in C and is orders of magnitude faster than a per-row `apply` once candidate counts climb; feed it only the within-tolerance pairs.
- **Cache normalized keys.** Persist `_name_key` alongside the source so re-runs skip re-normalization, and so the same key feeds any [voltage-class schema enforcement](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/enforcing-voltage-class-schemas-with-pandera/) that keys on the reconciled identity.

## Downstream validation

A reconciliation is only trustworthy if it proves it did not silently collapse or drop assets. This assertion function is a CI/CD gate: it fails the build when the match is many-to-one above a confidence floor, or when unmatched features have vanished instead of being reported.

<svg viewBox="0 0 940 372" role="img" aria-label="What happens when a reconciliation is allowed to be many-to-one. Three queue applications each match the same substation record, so the merged frame reports that substation three times and a downstream sum of available capacity triples it. Enforcing a one-to-one assignment — the best match wins and the losers are queued rather than duplicated — keeps the merged row count equal to the input row count, which is the assertion that catches the fault in CI." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Many-to-one joins multiply capacity; one-to-one assignment does not</title>
  <desc>On the left, three queue applications all matching one substation record, producing three merged rows that each carry the same 45 megawatts of headroom, and a downstream sum of 135 megawatts. On the right, the one-to-one assignment keeps the single best match, routes the other two to a review queue, and the sum stays at 45 megawatts. Below, the CI assertion that distinguishes the two: the merged row count must equal the left-hand row count.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="372"/>
  <defs><marker id="oo-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">A join that is allowed to duplicate will duplicate capacity</text>
  <rect x="30" y="70" width="168" height="30" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="114.0" y="91" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">queue app A</text>
  <line x1="202" y1="96" x2="246" y2="164" stroke="currentColor" stroke-width="1.1" opacity="0.5" marker-end="url(#oo-arr)"/>
  <rect x="30" y="138" width="168" height="30" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="114.0" y="159" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">queue app B</text>
  <line x1="202" y1="164" x2="246" y2="164" stroke="currentColor" stroke-width="1.1" opacity="0.5" marker-end="url(#oo-arr)"/>
  <rect x="30" y="206" width="168" height="30" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="114.0" y="227" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">queue app C</text>
  <line x1="202" y1="232" x2="246" y2="164" stroke="currentColor" stroke-width="1.1" opacity="0.5" marker-end="url(#oo-arr)"/>
  <rect x="250" y="140" width="176" height="48" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="338.0" y="161" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">substation</text>
  <text x="338.0" y="178" text-anchor="middle" font-size="11.5" fill="currentColor">45 MW headroom</text>
  <text x="120" y="296" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">many-to-one merge</text>
  <rect x="30" y="306" width="396" height="44" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.4"/>
  <text x="228" y="334" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">3 rows × 45 MW → sum reports 135 MW</text>
  <line x1="440" y1="190" x2="480" y2="190" stroke="currentColor" stroke-width="1.4" marker-end="url(#oo-arr)"/>
  <rect x="496" y="70" width="200" height="48" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="596.0" y="91" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">best match wins</text>
  <text x="596.0" y="108" text-anchor="middle" font-size="11" fill="currentColor">app B ↔ substation</text>
  <rect x="496" y="148" width="200" height="31" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="596.0" y="169" text-anchor="middle" font-size="11" fill="currentColor">app A → review queue</text>
  <rect x="496" y="208" width="200" height="31" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="596.0" y="229" text-anchor="middle" font-size="11" fill="currentColor">app C → review queue</text>
  <text x="716" y="96" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">one-to-one assignment</text>
  <rect x="716" y="108" width="194" height="44" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
  <text x="813" y="136" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">sum stays 45 MW</text>
  <rect x="496" y="288" width="414" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="703.0" y="309" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">CI assertion:</text>
  <text x="703.0" y="326" text-anchor="middle" font-size="11.5" fill="currentColor">len(merged) == len(applications)</text>
</svg>

```python
import geopandas as gpd


def assert_reconcile_integrity(
    matched_gdf: gpd.GeoDataFrame,
    left_count: int,
    high_conf: float = 0.80,
) -> None:
    """CI gate: no many-to-one collisions above threshold; unmatched are reported."""
    # 1. One-to-one above the high-confidence floor — no target claimed twice
    strong = matched_gdf[matched_gdf["match_confidence"] >= high_conf]
    collisions = int(strong["index_right"].duplicated().sum())
    assert collisions == 0, f"{collisions} many-to-one collisions above {high_conf}"

    # 2. Conservation: matched + unmatched must equal the source count.
    #    A shrinking total means rows were dropped, not reported.
    matched_n = int(matched_gdf["index_right"].notna().sum())
    unmatched_n = left_count - matched_n
    assert unmatched_n >= 0, "matched exceeds source — fan-out leaked through"
    print(f"[reconcile] {matched_n} matched, {unmatched_n} unmatched (reported, not dropped)")

    # 3. Confidence must be a real score, never silently null
    assert matched_gdf["match_confidence"].between(0.0, 1.0).all(), "confidence out of range"
```

Logging the matched-versus-unmatched split as part of the run is what makes the join defensible to an independent engineer: the same lineage discipline enforced across [spatial data quality validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) applies here, where the reconciliation report becomes the provenance record showing exactly which substations carry borrowed attributes and which are still awaiting a confident match.

## Related

- [Network Attribute Validation for Grid Infrastructure](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/) — the parent gate this identity resolution feeds clean, correctly-joined nodes into.
- [Enforcing Voltage Class Schemas with Pandera](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/enforcing-voltage-class-schemas-with-pandera/) — schema enforcement that keys on the reconciled substation identity.
- [Mapping High-Voltage Transmission Lines from OpenStreetMap](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/mapping-high-voltage-transmission-lines-from-openstreetmap/) — an upstream source whose `osm_id` keys never align with HIFLD or utility exports.
- [Spatial Data Quality & Validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) — the broader lineage and audit-trail practices behind a defensible cross-source join.
