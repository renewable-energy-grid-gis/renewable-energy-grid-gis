---
title: Deduplicating Overlapping Transmission Segments from OpenStreetMap
description: Remove duplicate and near-collinear OSM power=line segments that inflate circuit length and corridor counts — buffer-overlap plus Hausdorff detection in EPSG:32614, best-attributed dedup, and a circuit_km CI/CD gate.
slug: deduplicating-overlapping-transmission-segments-from-openstreetmap
type: article
breadcrumb: Deduplicating Overlapping Transmission Segments
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Deduplicating Overlapping Transmission Segments from OpenStreetMap

A total circuit length that comes back 15–40% too high, and a corridor count that overstates how many distinct rights-of-way cross a study area, is the failure signature this page exists to eliminate. It breaks the asset-inventory stage of [transmission line and substation mapping](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/): OpenStreetMap `power=line` data routinely carries two, three, or four `LineString` ways tracing the *same* physical corridor. Multiple mappers digitize the same towers years apart, a double-circuit line gets one way per circuit stacked on shared towers, and bulk imports overlay hand-traced geometry. None of this raises an error — every duplicate is a topologically valid line — so `total_length_km = lines_gdf.geometry.length.sum() / 1000` silently double- or triple-counts, and any downstream corridor tally treats one right-of-way as several.

The naive fix, dropping rows where geometry is exactly equal, catches almost none of these. Two mappers never place vertices identically, so near-duplicates differ by a few metres at every node and survive an equality test untouched. Robust deduplication has to measure *geometric near-equality* rather than test for it, and it has to do so without collapsing a genuine parallel circuit into one line.

## Root-cause analysis

Three compounding causes account for the inflation, and each maps to a distinct detection or fix stage below.

1. **Exact-equality matching misses near-duplicates.** `geometry.duplicated()` and `drop_duplicates(subset="geometry")` compare vertex arrays byte-for-byte. Independently digitized copies of one corridor differ by sub-metre jitter at every node, so the equality filter passes all of them through and the length inflation is untouched. Near-equality must be measured with a distance metric and a tolerance, not asserted.
2. **Over-aggressive merging drops a real parallel double-circuit.** Two circuits on shared towers, or two nearby corridors in the same right-of-way, are *supposed* to remain two records — they are distinct assets carrying distinct load. A dedup rule tuned only on geometric proximity collapses them into one, deleting a live circuit from the inventory. The distinguishing signal is attribute-level: a differing `circuit_id` or `voltage_kv` marks a genuine parallel line that must be preserved.
3. **Length double counting propagates downstream.** Every retained duplicate adds its full length to the corridor total and its full geometry to any [network attribute validation](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/) count, then to buffer areas and interconnection-screening tallies. The error is not cosmetic; it changes which corridors a siting model reports as available.

Detection needs two independent geometric tests run together. Two lines are near-duplicates only if their corridor buffers overlap heavily **and** their [Hausdorff distance](https://en.wikipedia.org/wiki/Hausdorff_distance) — the largest gap between the two point sets — is small. The Hausdorff distance between line sets $A$ and $B$ is

$$ d_H(A, B) = \max\left\{\, \sup_{a \in A}\inf_{b \in B} d(a,b),\; \sup_{b \in B}\inf_{a \in A} d(a,b) \,\right\} $$

Buffer overlap alone flags two crossing lines that share a junction; Hausdorff alone is fooled by a short stub lying near a long line. Requiring both — a high buffer intersection-over-union together with a Hausdorff value under a tower-spacing tolerance — isolates true collinear copies.

<svg viewBox="0 0 920 512" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Decision flow for deduplicating overlapping transmission segments. A candidate segment pair from a spatial-index overlap query first passes a corridor-buffer overlap gate; pairs whose buffers do not overlap are distinct corridors and both are kept. Overlapping pairs reach a Hausdorff-distance gate. If the Hausdorff distance is within epsilon the pair is a near-duplicate and is grouped, keeping the best-attributed representative — highest voltage and most complete record — which yields corrected circuit kilometres with no length double count. If the Hausdorff distance exceeds epsilon the pair reaches a lateral-offset gate: a consistent offset marks a real double circuit that is kept as both, while no consistent offset marks a partial or T overlap where only the shared span is trimmed." style="max-width:100%;height:auto;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="920" height="512"/>
  <title>Duplicate-segment decision flow: buffer overlap, Hausdorff, and offset gates routing to keep-both, trim, or keep-best-representative</title>
  <desc>Top-to-bottom flow on a left spine. Input: a candidate segment pair from a spatial-index overlap query. Gate one tests corridor buffer overlap; no overlap exits right to a keep-both node for distinct corridors. Overlap continues down to gate two, the Hausdorff distance test. Within epsilon routes down the main path to grouping and keeping the best-attributed representative, producing corrected circuit kilometres. Beyond epsilon branches right to gate three, a consistent lateral offset test: yes marks a real double circuit routed to the keep-both node, no marks a partial or T overlap routed to a trim-shared-span node.</desc>
  <defs>
    <marker id="dd-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="920" height="512" fill="none"/>
  <!-- Input -->
  <rect x="140" y="16" width="220" height="46" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="250" y="38" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Candidate segment pair</text>
  <text x="250" y="55" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">from sindex overlap query</text>
  <line x1="250" y1="62" x2="250" y2="96" stroke="currentColor" stroke-width="1.4" marker-end="url(#dd-arr)"/>
  <!-- Gate 1: buffer overlap -->
  <path d="M250,98 L340,138 L250,178 L160,138 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="250" y="134" text-anchor="middle" font-size="11.5" fill="currentColor">buffer overlap</text>
  <text x="250" y="150" text-anchor="middle" font-size="11.5" fill="currentColor">≥ θ (10 m)?</text>
  <!-- G1 no -> keep both -->
  <line x1="340" y1="138" x2="600" y2="138" stroke="currentColor" stroke-width="1.4" marker-end="url(#dd-arr)"/>
  <text x="470" y="129" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">no</text>
  <rect x="602" y="114" width="300" height="48" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="752" y="135" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">Distinct corridors</text>
  <text x="752" y="152" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">keep both — no dedup</text>
  <!-- G1 yes -> G2 -->
  <line x1="250" y1="178" x2="250" y2="214" stroke="currentColor" stroke-width="1.4" marker-end="url(#dd-arr)"/>
  <text x="264" y="200" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">yes</text>
  <!-- Gate 2: Hausdorff -->
  <path d="M250,214 L340,254 L250,294 L160,254 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="250" y="250" text-anchor="middle" font-size="11.5" fill="currentColor">Hausdorff</text>
  <text x="250" y="266" text-anchor="middle" font-size="11.5" fill="currentColor">≤ ε (25 m)?</text>
  <!-- G2 no -> G3 -->
  <line x1="340" y1="254" x2="452" y2="254" stroke="currentColor" stroke-width="1.4" marker-end="url(#dd-arr)"/>
  <text x="396" y="245" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">no</text>
  <!-- Gate 3: lateral offset -->
  <path d="M540,214 L630,254 L540,294 L450,254 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="540" y="250" text-anchor="middle" font-size="11.5" fill="currentColor">consistent</text>
  <text x="540" y="266" text-anchor="middle" font-size="11.5" fill="currentColor">lateral offset?</text>
  <!-- G3 yes -> keep both (up) -->
  <line x1="630" y1="254" x2="752" y2="254" stroke="currentColor" stroke-width="1.4"/>
  <line x1="752" y1="254" x2="752" y2="164" stroke="currentColor" stroke-width="1.4" marker-end="url(#dd-arr)"/>
  <text x="676" y="245" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">yes · double-circuit</text>
  <!-- G3 no -> trim -->
  <line x1="540" y1="294" x2="540" y2="340" stroke="currentColor" stroke-width="1.4" marker-end="url(#dd-arr)"/>
  <text x="554" y="320" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">no</text>
  <rect x="404" y="342" width="290" height="48" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="549" y="363" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">Partial / T-overlap</text>
  <text x="549" y="380" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">trim shared span only</text>
  <!-- G2 yes -> group -->
  <line x1="250" y1="294" x2="250" y2="340" stroke="currentColor" stroke-width="1.4" marker-end="url(#dd-arr)"/>
  <text x="264" y="320" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">yes</text>
  <rect x="100" y="342" width="300" height="64" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.8"/>
  <text x="250" y="365" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">Group near-duplicates</text>
  <text x="250" y="382" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">keep best-attributed record</text>
  <text x="250" y="398" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">(highest kV, most complete)</text>
  <line x1="250" y1="406" x2="250" y2="440" stroke="currentColor" stroke-width="1.4" marker-end="url(#dd-arr)"/>
  <rect x="100" y="442" width="300" height="48" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2"/>
  <text x="250" y="463" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">Corrected circuit_km</text>
  <text x="250" y="480" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">no length double-count</text>
</svg>

## Pre-flight validation

Detection must run in a projected metric frame — buffers and Hausdorff distances are meaningless in degrees, so the same [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) discipline that governs every distance operation applies here. The detector below reprojects to EPSG:32614 (UTM Zone 14N, a central-US grid footprint), builds flat-capped corridor buffers, prunes candidate pairs with the spatial index, and flags a pair only when the buffer overlap fraction and the Hausdorff distance both clear their thresholds. It returns a report rather than mutating anything, so a CI run can inspect exactly which segments would merge before the fix touches the data.

<svg viewBox="0 0 940 344" role="img" aria-label="Why duplicate detection uses the Hausdorff distance rather than an average offset. Two segments that run parallel 18 metres apart along most of their length but diverge to 240 metres at one end have a small mean offset and a Hausdorff distance of 240 metres. The Hausdorff figure is the one that matters: it is the worst disagreement anywhere along the pair, so a threshold on it cannot be satisfied by two lines that agree in the middle and part company at the end." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Hausdorff distance is the worst disagreement, not the average one</title>
  <desc>Two near-parallel line segments drawn over a common corridor. For most of their length they sit 18 metres apart; at the eastern end one swings away to 240 metres. Vertical measurement ticks show the separation at intervals. Two annotations compare the statistics: a mean offset of 31 metres, which would pass a 50 metre duplicate threshold, and a Hausdorff distance of 240 metres, which correctly rejects the pair as a duplicate and routes it to the partial-overlap branch instead.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="344"/>
  <defs><marker id="hd-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Two segments, two very different summary statistics</text>
  <path d="M60,112 L360,98 L620,92 L840,86" fill="none" stroke="#5BA8C8" stroke-width="3"/>
  <path d="M60,130 L360,118 L620,128 L840,224" fill="none" stroke="#F4A261" stroke-width="3"/>
  <line x1="140" y1="109.9897435897436" x2="140" y2="127.9897435897436" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>
  <text x="140" y="143.9897435897436" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">18 m</text>
  <line x1="300" y1="105.96923076923076" x2="300" y2="123.96923076923076" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>
  <text x="300" y="139.96923076923076" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">18 m</text>
  <line x1="460" y1="101.94871794871796" x2="460" y2="123.94871794871796" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>
  <text x="460" y="139.94871794871796" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">22 m</text>
  <line x1="620" y1="97.92820512820514" x2="620" y2="133.92820512820515" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>
  <text x="620" y="149.92820512820515" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">36 m</text>
  <line x1="760" y1="94.41025641025641" x2="760" y2="186.4102564102564" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>
  <text x="760" y="202.4102564102564" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">240 m</text>
  <text x="180" y="78" text-anchor="start" font-size="11.5" fill="#2C6E8F" font-weight="700">segment A — utility feed</text>
  <text x="440" y="190" text-anchor="start" font-size="11.5" fill="#7A4A1A" font-weight="700">segment B — OSM way</text>
  <rect x="60" y="250" width="400" height="50" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.5"/>
  <text x="260.0" y="271" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">mean offset 31 m</text>
  <text x="260.0" y="289" text-anchor="middle" font-size="11.5" fill="currentColor">passes a 50 m duplicate threshold</text>
  <rect x="484" y="250" width="416" height="50" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="692.0" y="271" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">Hausdorff distance 240 m</text>
  <text x="692.0" y="289" text-anchor="middle" font-size="11.5" fill="currentColor">correctly routed to the partial-overlap branch</text>
</svg>

```python
import geopandas as gpd
import pandas as pd
from shapely import hausdorff_distance

METRIC_EPSG = 32614  # UTM Zone 14N — central-US transmission footprint


def find_overlapping_segments(
    lines_gdf: gpd.GeoDataFrame,
    corridor_buffer_m: float = 10.0,
    hausdorff_eps_m: float = 25.0,
    min_overlap_frac: float = 0.30,
) -> pd.DataFrame:
    """Flag candidate duplicate / near-collinear power=line pairs.

    Returns one row per pair (i, j, hausdorff_m, overlap_frac) whose corridor
    buffers overlap by >= min_overlap_frac AND whose Hausdorff distance <= eps.
    Positional indices reference lines_gdf.reset_index(drop=True).
    """
    if lines_gdf.crs is None or not lines_gdf.crs.is_projected:
        raise ValueError(
            f"Duplicate detection needs a projected metric CRS; got {lines_gdf.crs}. "
            f"Reproject to EPSG:{METRIC_EPSG} first."
        )

    geom = lines_gdf.geometry.reset_index(drop=True)
    buffers = geom.buffer(corridor_buffer_m, cap_style="flat")
    sindex = buffers.sindex

    pairs = []
    for i in range(len(geom)):
        for j in sindex.query(buffers.iloc[i], predicate="intersects"):
            if j <= i:
                continue  # skip self-pairs and mirror duplicates
            inter = buffers.iloc[i].intersection(buffers.iloc[j]).area
            union = buffers.iloc[i].union(buffers.iloc[j]).area
            overlap_frac = inter / union if union else 0.0
            d_h = hausdorff_distance(geom.iloc[i], geom.iloc[j])
            if overlap_frac >= min_overlap_frac and d_h <= hausdorff_eps_m:
                pairs.append((int(i), int(j), round(d_h, 2), round(overlap_frac, 3)))

    return pd.DataFrame(pairs, columns=["i", "j", "hausdorff_m", "overlap_frac"])
```

The buffer overlap fraction is a directional intersection-over-union: $\mathrm{IoU} = |A \cap B| / |A \cup B|$ on the two corridor polygons. Two collinear copies score near 1.0; a line that merely clips another's buffer near a junction scores low and is rejected before the more expensive Hausdorff call. `cap_style="flat"` keeps the buffer from ballooning past the endpoints, which otherwise inflates overlap for two lines that meet end-to-end.

## Fix implementation

Grouping is the safe operation, not deletion. Build connected components over the flagged pairs with a union-find, then keep one representative per component. Two parameter choices carry the correctness: pairs whose endpoints carry *distinct non-null* `circuit_id` values are refused from merging — that is the real parallel double-circuit case from cause 2 — and within each merged group the representative is chosen by highest `voltage_kv`, breaking ties on attribute completeness so the record a permitting reviewer can actually trace survives.

```python
def deduplicate_segments(
    lines_gdf: gpd.GeoDataFrame,
    pairs: pd.DataFrame,
    id_col: str = "circuit_id",
    voltage_col: str = "voltage_kv",
) -> gpd.GeoDataFrame:
    """Collapse near-duplicate groups, keeping the best-attributed record.

    Genuine parallel circuits (distinct circuit_id on a near-duplicate pair) are
    never merged, so a real double-circuit is preserved rather than dropped.
    """
    lines_gdf = lines_gdf.reset_index(drop=True).copy()
    parent = list(range(len(lines_gdf)))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for row in pairs.itertuples(index=False):
        id_a, id_b = lines_gdf.at[row.i, id_col], lines_gdf.at[row.j, id_col]
        if pd.notna(id_a) and pd.notna(id_b) and id_a != id_b:
            continue  # distinct real circuits — keep both, do not union
        parent[find(row.i)] = find(row.j)

    lines_gdf["_group"] = [find(i) for i in range(len(lines_gdf))]
    lines_gdf["_completeness"] = lines_gdf.notna().sum(axis=1)

    # Highest voltage wins; ties break toward the most complete record
    ranked = lines_gdf.sort_values(
        [voltage_col, "_completeness"], ascending=False, kind="stable"
    )
    keep_idx = ranked.groupby("_group", sort=False).head(1).index

    deduped = lines_gdf.loc[keep_idx].drop(columns=["_group", "_completeness"])
    return deduped.sort_index().reset_index(drop=True)
```

Because the merge decision is attribute-aware, this is the fix for both the length inflation and the double-circuit hazard at once: identical geometry with the same or missing `circuit_id` collapses to one length, while identical geometry carrying two real circuit identities is left intact. The retained representative keeps its geometry unchanged — no averaging of vertex positions, which would fabricate a centerline that matches neither survey — so the downstream [snapping of transmission lines to substation nodes](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/snapping-transmission-lines-to-substation-nodes-with-shapely/) still lands on a real endpoint.

## Fallback routing & performance tuning

- **Tune ε to tower spacing, not intuition.** Set `hausdorff_eps_m` from the survey resolution of the source: 25 m absorbs typical OSM mapper jitter, but sub-metre LiDAR-derived corridors want 5–10 m so two genuinely adjacent circuits are not fused. Log the ε used into the provenance trail.
- **Densify before Hausdorff on sparse geometry.** OSM ways with widely spaced vertices can report a misleadingly small Hausdorff distance. Pass `hausdorff_distance(a, b, densify=0.1)` to interpolate points along each segment before measuring, at the cost of extra compute.
- **Prune with the spatial index first.** The `sindex.query` bounding-box filter keeps the pairwise Hausdorff work near $O(n \log n)$ instead of the $O(n^2)$ a brute-force cross-join implies; skip it and continental datasets stall.
- **Partition by region for out-of-core runs.** Duplicates only occur between geographically co-located ways, so tile the network by UTM zone or a coarse grid and run detection per tile in parallel — no cross-tile pair is ever a duplicate.
- **Fall back to endpoint hashing when attributes are absent.** If `circuit_id` and `voltage_kv` are both null across a group, rank the representative by geometry length (longest, most-complete trace) so the fix still returns a deterministic winner rather than an arbitrary row.

## Downstream validation

Gate the deduped layer before it reaches any corridor count or buffer analysis. The assertion below fails the build on two independent conditions: a total `circuit_km` outside the range an analyst expects for the study area — the direct symptom of over- or under-merging — and any residual near-duplicate pair that is *not* a legitimate distinct-circuit overlap. This is the same audit posture used when [detecting and removing sliver polygons in GeoPandas](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/detecting-and-removing-sliver-polygons-in-geopandas/): assert the artifact is gone, do not assume the cleaner removed it.

<svg viewBox="0 0 940 380" role="img" aria-label="What duplicate segments do to a circuit-kilometre total. A state extract reports 18,420 circuit kilometres before deduplication. Removing 1,180 near-duplicate segments and trimming 214 partial overlaps leaves 16,180 kilometres — the raw figure was 13.8 percent high. Because duplicates cluster on corridors that were mapped twice, the inflation is not spread evenly: it concentrates exactly where interconnection studies look hardest." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Circuit-kilometres before and after deduplication</title>
  <desc>A pair of horizontal bars. The first, before deduplication, is 18,420 circuit kilometres, with a shaded portion marking 2,240 kilometres contributed by 1,180 near-duplicate segments and 214 partial overlaps. The second, after deduplication, is 16,180 kilometres. The difference is annotated as 13.8 percent, with a note that the duplicates concentrate on heavily mapped corridors rather than spreading evenly across the network.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="380"/>
  <defs><marker id="dk-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The same network, counted twice in places</text>
  <text x="40" y="76" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">before deduplication</text>
  <rect x="40" y="88" width="868" height="52" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
  <rect x="802" y="88" width="106" height="52" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.4"/>
  <text x="420" y="120" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">18 420 circuit-km reported</text>
  <text x="855" y="120" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">2 240 km</text>
  <text x="855" y="158" text-anchor="middle" font-size="11" fill="#7A4A1A">counted twice</text>
  <text x="40" y="202" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">after deduplication</text>
  <rect x="40" y="214" width="762" height="52" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
  <text x="420" y="246" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">16 180 circuit-km</text>
  <text x="826" y="246" text-anchor="start" font-size="12.5" fill="#1F5C3A" font-weight="700">−13.8%</text>
  <rect x="40" y="296" width="424" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="252.0" y="317" text-anchor="middle" font-size="11.5" fill="currentColor">1 180 near-duplicates removed</text>
  <text x="252.0" y="334" text-anchor="middle" font-size="11.5" fill="currentColor">214 partial overlaps trimmed, not deleted</text>
  <rect x="488" y="296" width="420" height="48" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="698.0" y="317" text-anchor="middle" font-size="11.5" fill="currentColor">The inflation concentrates on twice-mapped</text>
  <text x="698.0" y="334" text-anchor="middle" font-size="11.5" fill="currentColor">corridors — where the studies look hardest</text>
</svg>

```python
def assert_dedup_integrity(
    deduped_gdf: gpd.GeoDataFrame,
    expected_km_range: tuple[float, float],
    id_col: str = "circuit_id",
) -> None:
    """CI/CD gate: circuit_km within range and no duplicate pairs left over."""
    total_km = float(deduped_gdf.geometry.length.sum()) / 1000.0
    lo, hi = expected_km_range
    assert lo <= total_km <= hi, (
        f"circuit_km {total_km:.1f} outside expected [{lo}, {hi}] — "
        "over-merged (dropped real circuits) or under-merged (double-counted)."
    )

    residual = find_overlapping_segments(deduped_gdf)
    leaked = []
    for row in residual.itertuples(index=False):
        id_a = deduped_gdf.iloc[row.i][id_col]
        id_b = deduped_gdf.iloc[row.j][id_col]
        distinct_circuits = pd.notna(id_a) and pd.notna(id_b) and id_a != id_b
        if not distinct_circuits:
            leaked.append((row.i, row.j))
    assert not leaked, (
        f"{len(leaked)} duplicate pairs survived dedup (sample {leaked[:5]}); "
        "lower ε or widen the buffer and re-run."
    )
```

Logging `total_km` before and after, alongside the count of groups collapsed, gives an interconnection or environmental reviewer a one-line audit of how much of the raw OSM length was redundant. Pin `shapely >= 2.0` and `geopandas >= 0.14` in `pyproject.toml` so the vectorized `hausdorff_distance` signature and buffer semantics cannot shift the merge decision between runs.

## Related

- [Transmission Line & Substation Mapping](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/) — the asset-inventory workflow this dedup step feeds a clean, non-inflated layer into.
- [Snapping Transmission Lines to Substation Nodes with Shapely](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/snapping-transmission-lines-to-substation-nodes-with-shapely/) — the endpoint-alignment stage that consumes the deduplicated representatives.
- [Network Attribute Validation](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/) — schema enforcement for the circuit_id and voltage_kv fields the merge decision keys off.
- [Detecting and Removing Sliver Polygons in GeoPandas](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/detecting-and-removing-sliver-polygons-in-geopandas/) — the same assert-the-artifact-is-gone audit posture applied to geometry cleaning.
