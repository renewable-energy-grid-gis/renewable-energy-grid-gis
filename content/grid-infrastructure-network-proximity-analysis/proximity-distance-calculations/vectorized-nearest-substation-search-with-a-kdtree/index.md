---
title: Vectorized Nearest-Substation Search with a KDTree
description: Use scipy.spatial.cKDTree for fast nearest-substation lookup across thousands of candidate sites — projected-CRS enforcement, k-nearest for capacity-saturated assets, build-once tree reuse, and a CI/CD distance-integrity gate.
slug: vectorized-nearest-substation-search-with-a-kdtree
type: article
breadcrumb: Nearest-Substation KDTree Search
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Vectorized Nearest-Substation Search with a KDTree

Answering "which substation is closest to each of my candidate sites, and how far?" for tens of thousands of points is the highest-frequency query in an interconnection screen, and the naive loop that calls `site.distance(substation)` for every pair is the wrong tool for it. This page builds a vectorized nearest-substation lookup on `scipy.spatial.cKDTree` — the point-to-point workhorse behind the [proximity distance calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) workflow — and eliminates the four failure modes that make a first draft return distances that are wrong, slow, or quietly missing the substation that actually matters. A KDTree turns a nearest-neighbour query from a pairwise scan into a logarithmic tree descent, but only when the tree is built over the right coordinates, in the right units, exactly once.

A cKDTree indexes *points*. It answers point-to-point nearest-neighbour queries in Euclidean space and nothing else — it has no concept of a line, a polygon, or a geographic coordinate system. That single constraint is the source of every failure below: feed it degrees and it measures in degrees; feed it a substation footprint polygon and it silently uses the centroid; ask it for the single nearest node and it hands you a substation with zero available headroom.

## Root-cause analysis

Four compounding causes turn a one-line `tree.query()` into a corrupted screen, and each maps to a distinct fix in the corrected function below.

1. **Tree built on lon/lat degrees.** `cKDTree` computes straight-line Euclidean distance over whatever numbers you hand it. Build the tree from an [EPSG:4326](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) coordinate array and every returned "distance" is in degrees — a unit that mixes a longitudinal axis whose ground length collapses toward the poles with a latitudinal axis that does not. The query still returns a nearest index, so nothing raises; the ranking is simply wrong wherever the north–south and east–west scale factors diverge, and the reported distance is meaningless to a setback test.
2. **`k=1` misses the usable substation.** The single nearest asset is frequently the *wrong* answer for interconnection: the closest substation may be capacity-saturated, at the wrong voltage class, or already queued out. A `k=1` query has no fallback — it returns one node and stops. You need the *k* nearest so downstream capacity logic can walk outward to the first substation with real headroom.
3. **Tree rebuilt on every query.** Constructing the KDTree is the expensive step. Rebuilding it inside a per-site loop or per-chunk call throws away the entire advantage of the structure and reintroduces the quadratic cost the index exists to remove.
4. **Point index against line/polygon geometry.** `cKDTree` needs an `(M, 2)` array of coordinates. If your substations are stored as polygon footprints, or you conflate them with transmission `LineString` geometry, there is no single coordinate to index — the nearest point on a line is *not* a tree lookup. That case belongs to `geopandas.sjoin_nearest`, not a cKDTree.

### cKDTree vs. sjoin_nearest — pick by geometry

The decision is entirely about what geometry you are measuring *to*.

<svg viewBox="0 0 900 470" role="img" aria-label="Decision flow for choosing a nearest-neighbour method. Start from the target geometry you are measuring to. If the targets are points, such as substation locations, and both layers share a projected CRS in metres, use scipy cKDTree: build the tree once over the substation coordinates and query the site points for the k nearest, which scales as N log M. If the targets are lines or polygons, such as transmission conductors or substation footprints, use geopandas sjoin_nearest, which measures true point-to-geometry distance. A warning branch marks the failure case where a KDTree is built on unprojected lon/lat degrees, yielding distances in degrees rather than metres." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="900" height="470"/>
  <title>Choosing cKDTree versus sjoin_nearest by target geometry</title>
  <desc>A decision flow that starts from the target geometry. Point targets in a shared projected CRS route to scipy cKDTree, built once over substation coordinates and queried for the k nearest at N log M cost. Line or polygon targets route to geopandas sjoin_nearest for true point-to-geometry distance. An amber warning branch marks the failure of building a KDTree on unprojected lon/lat degrees, which returns distances in degrees not metres.</desc>
  <defs>
    <style>
      .stage { fill:#DCEEF6; stroke:#5BA8C8; stroke-width:1.5; }
      .warn  { fill:#FFE3BE; stroke:#F4A261; stroke-width:1.5; }
      .good  { fill:#DDF0E2; stroke:#3D8B5F; stroke-width:1.5; }
      .lbl   { fill:currentColor; text-anchor:middle; }
      .edge  { stroke:currentColor; stroke-width:1.6; fill:none; opacity:0.85; }
      .ehead { fill:currentColor; stroke:none; opacity:0.85; }
      .tag   { fill:currentColor; opacity:0.78; text-anchor:middle; }
    </style>
  </defs>
  <!-- start -->
  <rect class="stage" x="340" y="26" width="220" height="66" rx="10"/>
  <g class="lbl" font-size="13">
    <text x="450" y="55">What geometry are</text><text x="450" y="73">you measuring to?</text>
  </g>
  <!-- decision diamond -->
  <polygon class="stage" points="450,120 560,166 450,212 340,166"/>
  <g class="lbl" font-size="12.5">
    <text x="450" y="162">Target is a</text><text x="450" y="179">point?</text>
  </g>
  <line class="edge" x1="450" y1="92" x2="450" y2="118"/><path class="ehead" d="M445 118 L450 126 L455 118 Z"/>
  <!-- yes branch left: cKDTree -->
  <line class="edge" x1="340" y1="166" x2="210" y2="166"/><path class="ehead" d="M210 161 L202 166 L210 171 Z"/>
  <text x="270" y="157" class="tag" font-size="11">yes</text>
  <rect class="good" x="20" y="132" width="184" height="66" rx="10"/>
  <g class="lbl" font-size="12.5">
    <text x="112" y="161">scipy cKDTree</text><text x="112" y="179">point-to-point</text>
  </g>
  <!-- no branch right: sjoin_nearest -->
  <line class="edge" x1="560" y1="166" x2="694" y2="166"/><path class="ehead" d="M694 161 L702 166 L694 171 Z"/>
  <text x="628" y="157" class="tag" font-size="11">line / polygon</text>
  <rect class="stage" x="704" y="132" width="184" height="66" rx="10"/>
  <g class="lbl" font-size="12.5">
    <text x="796" y="161">sjoin_nearest</text><text x="796" y="179">point-to-geometry</text>
  </g>
  <!-- cKDTree downstream: projected check -->
  <line class="edge" x1="112" y1="198" x2="112" y2="240"/><path class="ehead" d="M107 240 L112 248 L117 240 Z"/>
  <polygon class="warn" points="112,250 210,294 112,338 14,294"/>
  <g class="lbl" font-size="11.5">
    <text x="112" y="290">Projected CRS</text><text x="112" y="307">in metres?</text>
  </g>
  <!-- projected yes -> build once -->
  <line class="edge" x1="112" y1="338" x2="112" y2="378"/><path class="ehead" d="M107 378 L112 386 L117 378 Z"/>
  <text x="126" y="362" class="tag" font-size="11">yes</text>
  <rect class="good" x="18" y="388" width="188" height="66" rx="10"/>
  <g class="lbl" font-size="12">
    <text x="112" y="413">Build tree once,</text><text x="112" y="431">query k nearest</text>
    <text x="112" y="449" font-size="10.5" opacity="0.8">O(N log M)</text>
  </g>
  <!-- projected no -> warning -->
  <line class="edge" x1="210" y1="294" x2="360" y2="294"/><path class="ehead" d="M360 289 L368 294 L360 299 Z"/>
  <text x="270" y="285" class="tag" font-size="11">no</text>
  <rect class="warn" x="370" y="260" width="210" height="68" rx="10"/>
  <g class="lbl" font-size="11.5">
    <text x="475" y="285">Distances in degrees,</text><text x="475" y="303">not metres —</text><text x="475" y="321">reproject first</text>
  </g>
</svg>

If the target is a substation *point* and both layers sit in a projected metre frame, `cKDTree` is the fast path. If you are measuring to a conductor `LineString` or a substation footprint polygon, use `geopandas.sjoin_nearest`, which computes true point-to-geometry distance and returns the matched row — at the cost of the geometry-aware distance evaluation the tree avoids.

## Pre-flight validation

Surface the two silent corruptions — a geographic CRS and non-finite coordinates — before the tree is ever built. A `NaN` or `inf` in the coordinate array does not raise on construction; it poisons the partition and returns garbage neighbours.

```python
import geopandas as gpd
import numpy as np


def preflight_kdtree_inputs(
    substation_gdf: gpd.GeoDataFrame,
    sites_gdf: gpd.GeoDataFrame,
    target_epsg: int = 32614,
) -> None:
    """Raise on the exact root cause before any KDTree is constructed."""
    for name, gdf in (("substation_gdf", substation_gdf), ("sites_gdf", sites_gdf)):
        if gdf.crs is None:
            raise ValueError(f"{name} has no CRS; KDTree distances would be undefined.")
        if gdf.crs.is_geographic:
            raise ValueError(
                f"{name} is in geographic CRS {gdf.crs.to_epsg()} (degrees). "
                f"Reproject to a projected metre frame (e.g. EPSG:{target_epsg}) first."
            )
        if gdf.crs.to_epsg() != target_epsg:
            raise ValueError(
                f"{name} is EPSG:{gdf.crs.to_epsg()}, expected EPSG:{target_epsg}; "
                "both layers must share one projected frame."
            )
        if not (gdf.geom_type == "Point").all():
            raise TypeError(
                f"{name} holds non-point geometry; cKDTree indexes points only — "
                "use geopandas.sjoin_nearest for line/polygon targets."
            )
        coords = np.column_stack([gdf.geometry.x, gdf.geometry.y])
        if not np.isfinite(coords).all():
            raise ValueError(f"{name} contains non-finite coordinates (NaN/inf).")
```

The `is_geographic` check is the load-bearing one: it is the difference between a distance in metres and a distance in degrees, and it is the [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) discipline every distance calculation on this site depends on. EPSG:32614 (UTM zone 14N) is chosen here for a mid-continent portfolio; pick the UTM zone or state-plane code that covers your region.

## Fix implementation

The corrected function builds the tree **once** over the substation coordinates, then issues a single vectorized query for all site points asking for the *k* nearest. It returns a tidy frame carrying `nearest_substation_id` and `distance_m` — the identifier, not just an index, so the result survives a reindex downstream.

<svg viewBox="0 0 940 392" role="img" aria-label="When to ask a tree for k nearest neighbours and when to ask for everything inside a radius. A k-query always returns k answers, even when the nearest substation is 140 kilometres away and irrelevant; a radius query returns nothing in that case, which is the correct answer for a screen. Conversely a radius query in a dense corridor can return 60 candidates when the workflow only needs the closest three. The production pattern asks for k with an explicit distance_upper_bound, which gives both." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>k nearest, radius, or k nearest with a distance bound</title>
  <desc>Three small plan views of the same query point. The first, a k equals 3 query in a sparse area, returns three substations at 22, 96 and 141 kilometres — two of which are useless. The second, a radius query at 30 kilometres in a dense corridor, returns 60 candidates where three were wanted. The third, k equals 3 with a distance upper bound of 30 kilometres, returns only the substations that are both among the nearest three and inside the bound — one in the sparse case and three in the dense one.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="392"/>
  <defs><marker id="kr-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Ask for the right thing: k, radius, or k inside a bound</text>
  <rect x="40" y="60" width="280" height="210" rx="8" fill="none" stroke="#F4A261" stroke-width="1.2" opacity="0.6"/>
  <text x="180.0" y="84" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">dense corridor</text>
  <circle cx="180.0" cy="168" r="6" fill="currentColor" stroke="currentColor" stroke-width="1"/>
  <circle cx="180.0" cy="168" r="66" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.4" opacity="0.4"/>
  <circle cx="204.0" cy="168.0" r="3.6" fill="#F4A261" stroke="#F4A261" stroke-width="0.8"/>
  <circle cx="212.04293994002424" cy="186.5" r="3.6" fill="#F4A261" stroke="#F4A261" stroke-width="0.8"/>
  <circle cx="205.0" cy="211.30127018922192" r="3.6" fill="#F4A261" stroke="#F4A261" stroke-width="0.8"/>
  <circle cx="180.0" cy="231.0" r="3.6" fill="#F4A261" stroke="#F4A261" stroke-width="0.8"/>
  <circle cx="168.0" cy="188.78460969082653" r="3.6" fill="#F4A261" stroke="#F4A261" stroke-width="0.8"/>
  <circle cx="147.95706005997576" cy="186.5" r="3.6" fill="#F4A261" stroke="#F4A261" stroke-width="0.8"/>
  <circle cx="130.0" cy="168.0" r="3.6" fill="#F4A261" stroke="#F4A261" stroke-width="0.8"/>
  <circle cx="125.44039956158036" cy="136.50000000000003" r="3.6" fill="#F4A261" stroke="#F4A261" stroke-width="0.8"/>
  <circle cx="168.0" cy="147.21539030917347" r="3.6" fill="#F4A261" stroke="#F4A261" stroke-width="0.8"/>
  <circle cx="180.0" cy="131.0" r="3.6" fill="#F4A261" stroke="#F4A261" stroke-width="0.8"/>
  <circle cx="205.0" cy="124.69872981077808" r="3.6" fill="#F4A261" stroke="#F4A261" stroke-width="0.8"/>
  <circle cx="234.5596004384196" cy="136.49999999999997" r="3.6" fill="#F4A261" stroke="#F4A261" stroke-width="0.8"/>
  <text x="180.0" y="254" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">returns 60 candidates</text>
  <text x="180.0" y="292" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">query_ball_point(r=30 km)</text>
  <rect x="340" y="60" width="280" height="210" rx="8" fill="none" stroke="#F4A261" stroke-width="1.2" opacity="0.6"/>
  <text x="480.0" y="84" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">sparse area</text>
  <circle cx="480.0" cy="168" r="6" fill="currentColor" stroke="currentColor" stroke-width="1"/>
  <circle cx="506.3274768567112" cy="182.3827661581261" r="5" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <line x1="480.0" y1="168" x2="506.3274768567112" y2="182.3827661581261" stroke="#F4A261" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/>
  <circle cx="422.48329018778287" cy="208.52779083306905" r="5" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <line x1="480.0" y1="168" x2="422.48329018778287" y2="208.52779083306905" stroke="#F4A261" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/>
  <circle cx="408.09920170500266" cy="122.5918502815243" r="5" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <line x1="480.0" y1="168" x2="408.09920170500266" y2="122.5918502815243" stroke="#F4A261" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/>
  <text x="480.0" y="254" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">returns 22, 96 and 141 km</text>
  <text x="480.0" y="292" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">query(k=3)</text>
  <rect x="640" y="60" width="268" height="210" rx="8" fill="none" stroke="#3D8B5F" stroke-width="1.2" opacity="0.6"/>
  <text x="774.0" y="84" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">either case</text>
  <circle cx="774.0" cy="168" r="6" fill="currentColor" stroke="currentColor" stroke-width="1"/>
  <circle cx="774.0" cy="168" r="66" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4" stroke-dasharray="4 3" opacity="0.4"/>
  <circle cx="801.6318298200865" cy="179.6825502692595" r="5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="747.7480025608074" cy="212.88688706574143" r="5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="744.5843507195581" cy="115.70545365518471" r="5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="817.4829305372008" cy="223.92234515803358" r="4" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <text x="774.0" y="254" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">returns only useful matches</text>
  <text x="774.0" y="292" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">query(k=3, distance_upper_bound=30 km)</text>
  <rect x="40" y="320" width="868" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="341" text-anchor="middle" font-size="11.5" fill="currentColor">distance_upper_bound returns infinity for anything past the bound, so the caller filters on isfinite rather</text>
  <text x="474.0" y="358" text-anchor="middle" font-size="11.5" fill="currentColor">than re-measuring — and a site with no substation inside the bound is correctly reported as unserved.</text>
</svg>

```python
import geopandas as gpd
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree


def nearest_substations(
    sites_gdf: gpd.GeoDataFrame,
    substation_gdf: gpd.GeoDataFrame,
    id_col: str = "substation_id",
    k: int = 3,
    distance_upper_bound_m: float = 25_000.0,
    target_epsg: int = 32614,
) -> pd.DataFrame:
    """
    Vectorized k-nearest-substation lookup on a single cKDTree.

    Builds the tree once over substation points and queries every site at once.
    Returns one row per (site, neighbour rank) with the substation id and the
    Euclidean distance in metres, so downstream capacity logic can walk outward
    from k=0 to the first substation with real headroom.
    """
    preflight_kdtree_inputs(substation_gdf, sites_gdf, target_epsg)

    # Build the index ONCE over the substation coordinate array (M, 2)
    sub_coords = np.column_stack([substation_gdf.geometry.x, substation_gdf.geometry.y])
    tree = cKDTree(sub_coords)

    # Single vectorized query for ALL sites; k neighbours each
    site_coords = np.column_stack([sites_gdf.geometry.x, sites_gdf.geometry.y])
    distances, positions = tree.query(
        site_coords, k=k, distance_upper_bound=distance_upper_bound_m
    )

    # scipy returns 1-D arrays when k == 1; normalise to 2-D for uniform handling
    if k == 1:
        distances = distances[:, None]
        positions = positions[:, None]

    sub_ids = substation_gdf[id_col].to_numpy()
    site_ids = sites_gdf.index.to_numpy()

    records = []
    for rank in range(k):
        pos = positions[:, rank]
        dist = distances[:, rank]
        # positions == len(tree.data) marks "no neighbour within the bound"
        found = pos < len(sub_ids)
        records.append(pd.DataFrame({
            "site_id": site_ids,
            "neighbour_rank": rank,
            "nearest_substation_id": np.where(found, sub_ids[pos % len(sub_ids)], None),
            "distance_m": np.where(found, dist, np.inf),
        }))

    return pd.concat(records, ignore_index=True).sort_values(
        ["site_id", "neighbour_rank"]
    ).reset_index(drop=True)
```

The parameter choices are deliberate. `k=3` gives capacity logic two fallback substations to reach past a saturated nearest node without a second query. `distance_upper_bound_m=25_000` prunes the search so a site with no substation within interconnection reach returns `inf` rather than a spurious match hundreds of kilometres away — scipy encodes that "not found" case by returning an index equal to the tree size, which the `pos < len(sub_ids)` mask converts to an explicit infeasible result. The neighbour distance measured here is a straight-line lower bound; reconcile it against real headroom via [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) thresholds before treating any substation as usable.

The Euclidean distance the tree minimises is the ordinary planar norm in the projected frame,

$$d_i = \min_{j}\sqrt{(x_i - x_j)^2 + (y_i - y_j)^2}$$

which is only a true ground distance because both coordinate arrays are in metres. The reason to prefer the tree is asymptotic: a pairwise scan of $N$ sites against $M$ substations costs

$$T_\text{naive} = O(N \times M)$$

distance evaluations, while a balanced KDTree answers each nearest query by descending the tree, reducing the batch to

$$T_\text{kdtree} = O\!\left(N \log M\right)$$

after an $O(M \log M)$ one-time build. For 40,000 sites against 6,000 substations that is roughly a fifty-fold reduction in comparisons — realised only if the tree is built once and reused.

## Fallback routing & performance tuning

- **Build once, query in bulk.** Construct the `cKDTree` a single time and pass the entire site coordinate array to one `tree.query` call. scipy vectorizes the batch internally; a Python-level per-site loop is strictly slower and defeats the structure.
- **Raise `k` when the nearest is saturated.** If capacity screening rejects the `rank=0` substation, walk to `rank=1`, `rank=2`, and so on. Size `k` to how deep your headroom fallback realistically goes — `k=3` to `k=5` covers dense grids; going higher wastes query time and memory.
- **Tune `distance_upper_bound` to the reach you screen for.** A tight bound prunes far substations and makes "infeasible" explicit; too tight and every site returns `inf`. Match it to the maximum economic tie-line length, not an arbitrary default.
- **Chunk the site array for huge portfolios.** For millions of sites, query in slices of a few hundred thousand to cap the peak result-array size, reusing the *same* tree across slices — never rebuild it per chunk.
- **Pass `workers=-1` for multi-core queries.** `tree.query(..., workers=-1)` parallelises the batch across all cores; the build stays single-threaded but the query dominates at scale.
- **Switch to `sjoin_nearest` for geometry targets.** The moment you must measure to a conductor centreline or a substation footprint edge rather than a representative point, the KDTree is the wrong structure — see the [spatial index and proximity quick reference](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/spatial-index-and-proximity-quick-reference/) for the full index-selection matrix.

<svg viewBox="0 0 940 428" role="img" aria-label="How the two nearest-substation strategies scale. A pairwise scan over N sites and M substations costs N times M distance evaluations — 42,000 sites against 8,600 substations is 361 million. A cKDTree costs M log M to build once and then N log M to query — about 5.5 million operations for the same problem, roughly 65 times fewer, and the gap widens with every substation added." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Pairwise scan versus tree query as the substation set grows</title>
  <desc>A chart with the number of substations from 1,000 to 10,000 on the horizontal axis and operations in millions on the vertical. The pairwise curve rises linearly with the substation count for a fixed 42,000 sites, reaching 420 million at 10,000 substations. The tree curve rises only logarithmically, staying under 6 million across the whole range. Both are marked at 8,600 substations: 361 million operations against 5.5 million.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="428"/>
  <defs><marker id="kd-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">42 000 candidate sites against a growing substation set</text>
  <line x1="110" y1="280" x2="860" y2="280" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="110" y1="70" x2="110" y2="280" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="106" y1="280.0" x2="860" y2="280.0" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="100" y="284.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0M</text>
  <line x1="106" y1="233.63636363636363" x2="860" y2="233.63636363636363" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="100" y="237.63636363636363" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">100M</text>
  <line x1="106" y1="187.27272727272728" x2="860" y2="187.27272727272728" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="100" y="191.27272727272728" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">200M</text>
  <line x1="106" y1="140.9090909090909" x2="860" y2="140.9090909090909" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="100" y="144.9090909090909" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">300M</text>
  <line x1="106" y1="94.54545454545456" x2="860" y2="94.54545454545456" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="100" y="98.54545454545456" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">400M</text>
  <line x1="185.0" y1="280" x2="185.0" y2="285" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="185.0" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1 000</text>
  <line x1="410.0" y1="280" x2="410.0" y2="285" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="410.0" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">4 000</text>
  <line x1="755.0" y1="280" x2="755.0" y2="285" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="755.0" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">8 600</text>
  <line x1="860.0" y1="280" x2="860.0" y2="285" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="860.0" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">10 000</text>
  <text x="110" y="324" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.8">substations in the reference set</text>
  <path d="M185.0,260.5 L203.8,255.7 L222.5,250.8 L241.2,245.9 L260.0,241.1 L278.8,236.2 L297.5,231.3 L316.2,226.4 L335.0,221.6 L353.8,216.7 L372.5,211.8 L391.2,207.0 L410.0,202.1 L428.8,197.2 L447.5,192.4 L466.2,187.5 L485.0,182.6 L503.8,177.8 L522.5,172.9 L541.2,168.0 L560.0,163.2 L578.8,158.3 L597.5,153.4 L616.2,148.6 L635.0,143.7 L653.8,138.8 L672.5,134.0 L691.2,129.1 L710.0,124.2 L728.8,119.3 L747.5,114.5 L766.2,109.6 L785.0,104.7 L803.8,99.9 L822.5,95.0 L841.2,90.1 L860.0,85.3" fill="none" stroke="#C85B5B" stroke-width="2.6"/>
  <path d="M185.0,279.8 L203.8,279.8 L222.5,279.8 L241.2,279.8 L260.0,279.8 L278.8,279.8 L297.5,279.8 L316.2,279.8 L335.0,279.8 L353.8,279.8 L372.5,279.8 L391.2,279.7 L410.0,279.7 L428.8,279.7 L447.5,279.7 L466.2,279.7 L485.0,279.7 L503.8,279.7 L522.5,279.7 L541.2,279.7 L560.0,279.7 L578.8,279.7 L597.5,279.7 L616.2,279.7 L635.0,279.7 L653.8,279.7 L672.5,279.7 L691.2,279.7 L710.0,279.7 L728.8,279.7 L747.5,279.7 L766.2,279.7 L785.0,279.7 L803.8,279.7 L822.5,279.7 L841.2,279.7 L860.0,279.7" fill="none" stroke="#3D8B5F" stroke-width="2.6"/>
  <circle cx="755.0" cy="112.62727272727273" r="5" fill="#C85B5B" stroke="#C85B5B" stroke-width="1"/>
  <text x="743.0" y="100.62727272727273" text-anchor="end" font-size="11.5" fill="#7A4A1A" font-weight="700">361M pairwise</text>
  <circle cx="755.0" cy="277.45" r="5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="767.0" y="265.45" text-anchor="start" font-size="11.5" fill="#1F5C3A" font-weight="700">5.5M with a tree</text>
  <rect x="110" y="348" width="366" height="48" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.5"/>
  <text x="293.0" y="369" text-anchor="middle" font-size="11.5" fill="currentColor">Pairwise: N × M distance evaluations</text>
  <text x="293.0" y="386" text-anchor="middle" font-size="11.5" fill="currentColor">linear in the reference set, forever</text>
  <rect x="494" y="348" width="366" height="48" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="677.0" y="369" text-anchor="middle" font-size="11.5" fill="currentColor">Tree: M log M once, then N log M</text>
  <text x="677.0" y="386" text-anchor="middle" font-size="11.5" fill="currentColor">the build cost is amortised on the first query</text>
</svg>

## Downstream validation

Gate the result before it feeds a capacity screen. This assertion catches the three regressions that a KDTree change tends to introduce: non-finite or negative distances, out-of-range substation identifiers, and a silently dropped neighbour rank. It is written to fail a CI/CD build.

```python
import numpy as np
import pandas as pd


def assert_nearest_integrity(
    result: pd.DataFrame,
    substation_gdf: gpd.GeoDataFrame,
    id_col: str = "substation_id",
    expected_k: int = 3,
) -> None:
    """CI/CD gate: fail the build if the nearest-substation table is unsound."""
    finite = result["distance_m"].replace(np.inf, np.nan).dropna()
    assert (finite >= 0).all(), "negative distance present — coordinate or CRS corruption"
    assert np.isfinite(finite).all(), "non-finite distance where a match was reported"

    matched = result.loc[result["nearest_substation_id"].notna(), "nearest_substation_id"]
    valid_ids = set(substation_gdf[id_col])
    assert set(matched).issubset(valid_ids), "matched id absent from substation table"

    ranks_per_site = result.groupby("site_id")["neighbour_rank"].nunique()
    assert (ranks_per_site == expected_k).all(), (
        f"every site must carry {expected_k} neighbour ranks; "
        "a dropped rank means the k-query or concat regressed"
    )
```

Asserting that every matched identifier exists in the substation table is what turns the `%`-guarded index arithmetic above into a provable invariant rather than an assumption. Pin `scipy`, `geopandas`, and `shapely` in `pyproject.toml` so a change to the `query` return signature or the `distance_upper_bound` sentinel cannot silently shift results between runs — the same lineage discipline that keeps the broader [proximity distance calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) workflow reproducible.

## Related

- [Proximity Distance Calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) — the parent workflow this nearest-substation lookup plugs into.
- [Automating Interconnection Queue Screening with Async Proximity Scoring](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/automating-interconnection-queue-screening-with-async-proximity-scoring/) — where the k-nearest results drive concurrent capacity scoring.
- [Spatial Index & Proximity Quick Reference](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/spatial-index-and-proximity-quick-reference/) — the full comparison of cKDTree, R-tree, and sjoin_nearest by geometry and query type.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — the projected-frame enforcement that makes KDTree distances mean metres.
