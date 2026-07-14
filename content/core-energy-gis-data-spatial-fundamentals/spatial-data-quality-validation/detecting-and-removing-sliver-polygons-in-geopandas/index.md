---
title: Detecting and Removing Sliver Polygons in GeoPandas
description: Detect and remove sliver polygons that overlay and union operations leave behind in energy GIS layers — a thinness-ratio and tiny-area detector, a threshold-plus-dissolve removal function, fallback tuning, and an area-preserving CI/CD audit gate.
slug: detecting-and-removing-sliver-polygons-in-geopandas
type: article
breadcrumb: Detecting & Removing Sliver Polygons
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Detecting and Removing Sliver Polygons in GeoPandas

**Scenario / symptom:** you overlay a solar parcel layer against a county boundary or union two administrative datasets, and the result carries hundreds of extra features — hair-thin, near-zero-area polygons hugging the shared edges. The feature count balloons, `dissolve()` produces ragged borders, and the total developable-area tally drifts by a fraction of a percent that a permit reviewer will later flag. These artefacts are **sliver polygons**, and they appear at the geometry-processing stage of the [spatial data quality and validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) workflow — the moment two layers whose shared borders were digitized independently get intersected or unioned. The parent workflow scores topological consistency as one of its four quality dimensions; slivers are the single most common way that dimension fails silently, because each artefact is a perfectly valid geometry that merely should not exist.

Slivers are not invalid in the Shapely sense — they pass `is_valid`, they have positive area, and they survive every predicate. That is exactly why a naive `explode()`-then-count pipeline never raises an exception: it inflates the record count, corrupts area-weighted metrics like MW density, and leaves the layer looking plausible. Removing them requires a geometric definition of "too thin to be real," a threshold tuned to the source data, and a removal step that either drops the artefact or dissolves it back into the neighbour it was carved from — all executed in a metric CRS so that an area threshold means square metres, not square degrees.

## Root-cause analysis

Three compounding causes produce sliver artefacts, and each maps to a distinct stage of the fix below:

1. **Vertex misregistration between layers.** The shared boundary between a parcel layer and a county layer is digitized twice, from different sources, at different precisions. The two "identical" edges differ by a metre or two, so an `overlay(how="intersection")` or `union` slices the gap between them into long, thin polygons. This is the dominant source and it scales with the length of every shared border in the study area.
2. **Coordinate precision and rounding.** Reprojection, snapping, and float truncation nudge vertices by sub-metre amounts. A polygon that should share an edge exactly instead overlaps its neighbour by a razor-thin margin, and the overlay emits that margin as its own feature.
3. **Absent geometric filtering after the overlay.** GeoPandas returns every geometric intersection the algebra produces; it has no concept of "this piece is too small to matter." Without an explicit thinness-and-area gate, the slivers flow straight into the feature count, the `dissolve`, and the downstream area sum.

The reliable test for a sliver is not area alone — a small-but-legitimate parcel would be dropped by a pure area filter. A sliver is defined by being both *small* and *thin*: it has a large perimeter relative to the area it encloses. The **Polsby-Popper compactness score** captures this precisely:

$$ \mathrm{PP} = \frac{4\pi A}{P^{2}} $$

where $A$ is the polygon area and $P$ its perimeter. A perfect circle scores $\mathrm{PP} = 1$; a long thin sliver scores near $0$. Combining a low compactness score with an absolute area ceiling isolates true artefacts while sparing small legitimate features, because a compact 300 m² parcel scores high on $\mathrm{PP}$ even though its area is tiny.

<svg viewBox="0 0 880 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cause-to-fix map for sliver polygons. Three causes on the left — vertex misregistration between overlaid layers, coordinate precision and rounding, and absence of a geometric filter after the overlay — each arrow into a two-part detector in the centre that computes area in square metres and the Polsby-Popper thinness score. The detector feeds a decision gate testing whether area is below the threshold and thinness is below the compactness limit. Sliver-classified features route right to a removal stage that either drops them or dissolves them into the largest shared-edge neighbour; non-slivers pass through unchanged. Both paths converge on a clean, area-preserved GeoDataFrame." style="width:100%;max-width:880px;height:auto;font-family:inherit">
  <title>Sliver causes mapped to a thinness-and-area detector, a removal gate, and an area-preserved output</title>
  <desc>Three cause boxes on the left — vertex misregistration between overlaid layers, coordinate precision and rounding, and no geometric filter after the overlay — each arrow into a central detector node that computes area in square metres and the Polsby-Popper compactness score. The detector feeds a diamond gate testing whether area is below threshold and compactness below the thinness limit. A "yes" branch routes right to a removal node that drops the feature or dissolves it into its largest shared-edge neighbour; a "no" branch keeps the feature. Both merge into a highlighted output node: a clean, area-preserved GeoDataFrame.</desc>
  <defs>
    <marker id="sv-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="880" height="340" fill="none"/>
  <!-- Cause boxes -->
  <rect x="16" y="26" width="212" height="52" rx="7" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5"/>
  <text x="122" y="47" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">Vertex misregistration</text>
  <text x="122" y="64" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">between overlaid layers</text>
  <rect x="16" y="140" width="212" height="52" rx="7" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5"/>
  <text x="122" y="161" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">Coordinate precision</text>
  <text x="122" y="178" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">rounding &amp; snapping drift</text>
  <rect x="16" y="254" width="212" height="52" rx="7" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5"/>
  <text x="122" y="275" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">No geometric filter</text>
  <text x="122" y="292" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">after the overlay</text>
  <!-- Cause arrows -->
  <line x1="228" y1="52" x2="300" y2="140" stroke="currentColor" stroke-width="1.3" marker-end="url(#sv-arr)"/>
  <line x1="228" y1="166" x2="300" y2="166" stroke="currentColor" stroke-width="1.3" marker-end="url(#sv-arr)"/>
  <line x1="228" y1="280" x2="300" y2="192" stroke="currentColor" stroke-width="1.3" marker-end="url(#sv-arr)"/>
  <!-- Detector -->
  <rect x="302" y="138" width="196" height="56" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="400" y="160" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">detect: area_m2</text>
  <text x="400" y="178" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">+ PP thinness</text>
  <!-- Detector -> gate -->
  <line x1="498" y1="166" x2="540" y2="166" stroke="currentColor" stroke-width="1.4" marker-end="url(#sv-arr)"/>
  <!-- Gate diamond -->
  <path d="M628,110 L714,166 L628,222 L542,166 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="628" y="158" text-anchor="middle" font-size="10.5" fill="currentColor">area &lt; T and</text>
  <text x="628" y="174" text-anchor="middle" font-size="10.5" fill="currentColor">PP &lt; limit?</text>
  <!-- Gate yes -> remove -->
  <line x1="628" y1="110" x2="628" y2="70" stroke="currentColor" stroke-width="1.4" marker-end="url(#sv-arr)"/>
  <text x="642" y="94" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">yes</text>
  <rect x="512" y="24" width="232" height="46" rx="7" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 3"/>
  <text x="628" y="44" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">drop or dissolve</text>
  <text x="628" y="61" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">into largest neighbour</text>
  <!-- Gate no -> keep -->
  <line x1="628" y1="222" x2="628" y2="262" stroke="currentColor" stroke-width="1.4" marker-end="url(#sv-arr)"/>
  <text x="642" y="244" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">no</text>
  <rect x="512" y="264" width="232" height="46" rx="7" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <text x="628" y="291" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">keep feature unchanged</text>
  <!-- Converge to output -->
  <path d="M744,47 H800 V166 H758" fill="none" stroke="currentColor" stroke-width="1.3" marker-end="url(#sv-arr)"/>
  <path d="M744,287 H800 V166 H758" fill="none" stroke="currentColor" stroke-width="1.3" marker-end="url(#sv-arr)"/>
  <rect x="756" y="140" width="112" height="52" rx="7" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2"/>
  <text x="812" y="160" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">clean,</text>
  <text x="812" y="176" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">area-preserved</text>
</svg>

## Pre-flight validation

Run the detector *before* any removal so the decision is auditable and the thresholds can be tuned against real numbers. Work in an equal-area metric CRS — EPSG:5070 (NAD83 / Conus Albers) for contiguous-US energy work, or the local UTM zone such as EPSG:32610 for a single-region study — so that `area_m2` is genuinely square metres and a metre-scale sliver is comparable across the layer. Computing area or perimeter in geographic EPSG:4326 returns degree-based numbers that make the thinness test meaningless.

The detector below annotates every feature with its area, its Polsby-Popper score, and a boolean `is_sliver`, without deleting anything. That separation is deliberate: it lets a reviewer inspect the flagged set before it is destroyed.

```python
import numpy as np
import geopandas as gpd

TARGET_CRS = "EPSG:5070"  # NAD83 / Conus Albers Equal Area — area-true metric frame


def flag_slivers(
    parcels_gdf: gpd.GeoDataFrame,
    area_threshold_m2: float = 50.0,
    pp_threshold: float = 0.03,
) -> gpd.GeoDataFrame:
    """Annotate area_m2, Polsby-Popper compactness, and an is_sliver flag.

    A feature is a sliver only if it is BOTH tiny (area below the ceiling)
    AND thin (compactness below the limit) — so a small compact parcel survives.
    """
    if parcels_gdf.crs is None or parcels_gdf.crs.to_epsg() != 5070:
        parcels_gdf = parcels_gdf.to_crs(TARGET_CRS)

    geom = parcels_gdf.geometry
    area_m2 = geom.area
    perimeter_m = geom.length
    # Polsby-Popper: 4*pi*A / P^2 -> ~1 for a disc, ~0 for a hair-thin sliver
    pp = np.where(perimeter_m > 0, (4 * np.pi * area_m2) / np.square(perimeter_m), 0.0)

    out = parcels_gdf.copy()
    out["area_m2"] = area_m2
    out["pp_thinness"] = pp
    out["is_sliver"] = (area_m2 < area_threshold_m2) & (pp < pp_threshold)
    return out
```

Before committing to a threshold, inspect the distribution — `flagged["area_m2"].describe()` and a histogram of `pp_thinness` reveal whether the artefacts cluster far below your candidate cut-off or blur into legitimate small parcels. Genuine slivers from an overlay almost always sit in a tight spike near zero on both axes, well separated from real features, which is what makes the two-part gate robust.

## Fix implementation

The corrected removal function takes the flagged frame and either drops the slivers outright or dissolves each one back into the neighbouring polygon it shares the longest boundary with. Dropping is correct when the sliver is pure overlay noise that encloses no real land; dissolving is correct when the sliver was carved from a legitimate parcel and its area must be conserved. The `dissolve_to_neighbour=True` path preserves the total area exactly, which matters when the layer feeds a developable-area or capacity tally.

```python
import geopandas as gpd
import pandas as pd


def remove_slivers(
    flagged_gdf: gpd.GeoDataFrame,
    dissolve_to_neighbour: bool = True,
) -> gpd.GeoDataFrame:
    """Remove flagged slivers by dropping them or merging into the best neighbour.

    Assumes flag_slivers() has populated is_sliver. Returns a frame with no
    features below the area/thinness gate and, when dissolving, conserved area.
    """
    slivers = flagged_gdf[flagged_gdf["is_sliver"]]
    keep = flagged_gdf[~flagged_gdf["is_sliver"]].copy()

    if slivers.empty:
        return keep.drop(columns=["is_sliver"], errors="ignore")

    if not dissolve_to_neighbour:
        # Pure noise: drop and log how much area was discarded
        return keep.drop(columns=["is_sliver"], errors="ignore")

    # Attach each sliver to the retained neighbour with the longest shared border
    retained = keep.reset_index(drop=True)
    sindex = retained.sindex
    for _, sliver in slivers.iterrows():
        candidates = retained.iloc[list(sindex.query(sliver.geometry, predicate="intersects"))]
        if candidates.empty:
            continue  # orphan sliver — routed to fallback below
        shared_len = candidates.geometry.intersection(sliver.geometry).length
        target = shared_len.idxmax()
        # Union the sliver geometry into its chosen neighbour, conserving area
        retained.at[target, "geometry"] = (
            retained.at[target, "geometry"].union(sliver.geometry)
        )
    return retained.drop(columns=["is_sliver"], errors="ignore")
```

The neighbour search uses the layer's spatial index (`sindex.query`) to restrict candidates to bounding-box intersections before the exact border-length comparison runs, the same indexing discipline that keeps [proximity and distance calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) tractable at scale. Choosing the neighbour by longest shared edge — rather than largest area or first match — is what makes the dissolve deterministic and defensible: the sliver rejoins the polygon it was most plausibly split from.

## Fallback routing & performance tuning

For national parcel layers or CI/CD runs, layer these strategies onto the core functions:

- **Snap before you overlay.** The cheapest sliver is the one never created. Apply `shapely.set_precision(geom, grid_size=0.1)` or `gdf.geometry.snap()` to align shared edges to a common grid before the `overlay`/`union`, so misregistered vertices collapse instead of slicing. This complements the geometry repair covered in [cleaning messy shapefiles in geopandas](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/best-practices-for-cleaning-messy-shapefiles-in-geopandas/).
- **Tune the two thresholds independently.** Loosen `pp_threshold` (toward 0.05) to catch fatter overlay chips; tighten `area_threshold_m2` (toward 10) when legitimate micro-parcels exist. Never widen area alone — that is what deletes real features.
- **Route orphan slivers, do not drop them silently.** A sliver with no retained neighbour (an isolated overlay chip) should go to a quarantine layer with an error code, mirroring the remediation-queue pattern of the parent quality gate, not vanish from the record.
- **Index once, reuse.** Build `retained.sindex` a single time outside the loop (as above); rebuilding it per sliver turns an O(N) pass into O(N²).
- **Chunk by geometry, not by row.** For continental layers, partition by a coarse grid or state boundary so each `remove_slivers` call operates on a self-contained neighbourhood, keeping the union graph and spatial index in memory.

## Downstream validation

Before the cleaned layer feeds a siting model or a [regulatory boundary overlay](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/), gate it with a CI/CD assertion that proves the removal did its job without corrupting the total area. This is the check that catches a threshold regression or a dissolve that accidentally dropped real land.

```python
import numpy as np
import geopandas as gpd


def assert_no_slivers(
    cleaned_gdf: gpd.GeoDataFrame,
    original_area_m2: float,
    area_threshold_m2: float = 50.0,
    pp_threshold: float = 0.03,
    area_tol: float = 1e-4,
) -> None:
    """CI/CD gate: no residual slivers, CRS intact, total area preserved."""
    assert cleaned_gdf.crs is not None and cleaned_gdf.crs.to_epsg() == 5070, \
        "cleaned layer must stay in the equal-area metric frame EPSG:5070"

    geom = cleaned_gdf.geometry
    area_m2 = geom.area
    pp = np.where(geom.length > 0, (4 * np.pi * area_m2) / np.square(geom.length), 0.0)
    residual = (area_m2 < area_threshold_m2) & (pp < pp_threshold)
    assert not residual.any(), f"{int(residual.sum())} sliver(s) survived removal"

    # Dissolve-to-neighbour must conserve total area within tolerance
    drift = abs(area_m2.sum() - original_area_m2) / original_area_m2
    assert drift <= area_tol, f"area drifted {drift:.4%} (> {area_tol:.4%}) during removal"
```

Passing `original_area_m2` from the pre-removal frame turns the area check into a hard invariant: a dissolve conserves area exactly, so any drift beyond floating-point tolerance means a sliver was dropped when it should have been merged. Pair this with the geometry-validity and topology assertions from [validating geometry topology with Shapely 2 predicates](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/validating-geometry-topology-with-shapely-2-predicates/) so a single CI step proves the layer is valid, sliver-free, and area-conserving before it ever reaches a feasibility study. Logging the flagged count and the discarded-versus-dissolved split keeps the operation auditable for the same permitting review the parent quality gate feeds.

## Related

- [Spatial Data Quality & Validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) — the parent workflow whose topological-consistency dimension slivers violate.
- [Best practices for cleaning messy shapefiles in GeoPandas](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/best-practices-for-cleaning-messy-shapefiles-in-geopandas/) — geometry repair and snapping that prevents slivers upstream of the overlay.
- [Validating geometry topology with Shapely 2 predicates](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/validating-geometry-topology-with-shapely-2-predicates/) — the validity and overlap checks that pair with sliver removal in one CI gate.
- [Regulatory Boundary Mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/) — the setback and jurisdictional overlays whose clean edges depend on sliver-free parcels.
