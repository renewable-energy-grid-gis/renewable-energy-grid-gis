---
title: Spatial Index & Proximity Quick Reference
description: A quick-reference for choosing spatial indexes and proximity methods in grid GIS work — R-tree sindex, cKDTree, STRtree, H3/geohash, and PostGIS GiST compared by query type, complexity, and memory.
slug: spatial-index-and-proximity-quick-reference
type: reference
breadcrumb: Spatial Index & Proximity Reference
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Spatial Index & Proximity Quick Reference

Every proximity question in [Grid Infrastructure & Network Proximity Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/) — nearest substation, sites within a clearance buffer, the closest energized corridor to fifty thousand candidate parcels — reduces to one decision made early and often: *which spatial index, and which proximity method, for this query shape?* Get it wrong and the run is either quadratically slow, silently wrong (distances measured in degrees), or memory-bound. This page is the lookup table for that decision. It sits alongside the deep walkthrough in [proximity distance calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) and the [projection and CRS quick reference](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/projection-and-crs-quick-reference/), and it assumes the one precondition every method here shares: geometries are already in a projected, metric [coordinate reference system](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) such as EPSG:32610 (UTM 10N) or EPSG:5070 (CONUS Albers) before a single distance is measured.

Use these tables as anchors. Cross-links from the rest of the site point here when they need to justify an index choice without re-deriving it in place.

## Spatial index types at a glance

The index is the data structure that prunes the search space before any exact geometry math runs. Pick it by the query you actually issue and the geometry type you hold.

<svg viewBox="0 0 940 392" role="img" aria-label="H3 cell sizes at the four resolutions that matter for grid work, with what each is good for. Resolution 6 averages 36.1 square kilometres per cell and suits balancing-area summaries; resolution 7 averages 5.16 square kilometres and suits county-scale capacity aggregation; resolution 8 averages 0.737 square kilometres, close to a utility-scale solar block; resolution 9 averages 0.105 square kilometres, roughly a substation yard plus its immediate approach." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>H3 resolutions expressed in energy-siting terms</title>
  <desc>Four rows, one per H3 resolution. Resolution 6: 36.13 square kilometres average area, 3.23 kilometre average edge, suited to balancing-area rollups. Resolution 7: 5.16 square kilometres, 1.22 kilometre edge, suited to county-scale capacity aggregation. Resolution 8: 0.737 square kilometres, 0.46 kilometre edge, about the footprint of a utility-scale solar block. Resolution 9: 0.105 square kilometres, 0.17 kilometre edge, about a substation yard. Hexagons drawn to relative scale accompany each row.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="392"/>
  <defs><marker id="h3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Pick the resolution from the thing being counted</text>
  <rect x="40" y="68" width="868" height="68" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2" opacity="0.45"/>
  <polygon points="142.0,102.0 119.0,141.8 73.0,141.8 50.0,102.0 73.0,62.2 119.0,62.2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.8"/>
  <text x="180" y="108" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">resolution 6</text>
  <text x="400" y="108" text-anchor="start" font-size="12" fill="currentColor">36.13 km² average</text>
  <text x="600" y="108" text-anchor="start" font-size="12" fill="currentColor">3.23 km edge</text>
  <text x="892" y="108" text-anchor="end" font-size="11.5" fill="currentColor">balancing-area rollups</text>
  <rect x="40" y="144" width="868" height="68" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.45"/>
  <polygon points="126.0,178.0 111.0,204.0 81.0,204.0 66.0,178.0 81.0,152.0 111.0,152.0" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.8"/>
  <text x="180" y="184" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">resolution 7</text>
  <text x="400" y="184" text-anchor="start" font-size="12" fill="currentColor">5.16 km² average</text>
  <text x="600" y="184" text-anchor="start" font-size="12" fill="currentColor">1.22 km edge</text>
  <text x="892" y="184" text-anchor="end" font-size="11.5" fill="currentColor">county capacity aggregation</text>
  <rect x="40" y="220" width="868" height="68" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.45"/>
  <polygon points="115.0,254.0 105.5,270.5 86.5,270.5 77.0,254.0 86.5,237.5 105.5,237.5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.8"/>
  <text x="180" y="260" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">resolution 8</text>
  <text x="400" y="260" text-anchor="start" font-size="12" fill="currentColor">0.737 km² average</text>
  <text x="600" y="260" text-anchor="start" font-size="12" fill="currentColor">0.46 km edge</text>
  <text x="892" y="260" text-anchor="end" font-size="11.5" fill="currentColor">a utility-scale solar block</text>
  <rect x="40" y="296" width="868" height="68" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2" opacity="0.45"/>
  <polygon points="108.0,330.0 102.0,340.4 90.0,340.4 84.0,330.0 90.0,319.6 102.0,319.6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.8"/>
  <text x="180" y="336" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">resolution 9</text>
  <text x="400" y="336" text-anchor="start" font-size="12" fill="currentColor">0.105 km² average</text>
  <text x="600" y="336" text-anchor="start" font-size="12" fill="currentColor">0.17 km edge</text>
  <text x="892" y="336" text-anchor="end" font-size="11.5" fill="currentColor">a substation yard</text>
  <rect x="40" y="356" width="868" height="25" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="375" text-anchor="middle" font-size="11" fill="currentColor">A cell join is exact only at cell resolution — for setback or interconnection distances, hash to find candidates and measure with geometry.</text>
</svg>

| Index | Best-for query | Geometry type | Build / query complexity | Memory | Library |
|---|---|---|---|---|---|
| GeoPandas R-tree `sindex` | Geometry-to-geometry nearest, bbox intersects, overlay prune | Any (lines, polygons, points) | Build $O(M \log M)$ / query $O(\log M)$ | Moderate (bbox tree over $M$ features) | `geopandas` (via `shapely`) |
| `scipy.spatial.cKDTree` | Point-to-point k-nearest, radius neighbours | Points only (coordinate arrays) | Build $O(M \log M)$ / query $O(\log M)$ | Low, cache-friendly (float64 arrays) | `scipy` |
| Shapely `STRtree` | Static geometry bbox query, batch nearest | Any (immutable after build) | Build $O(M \log M)$ / query $O(\log M)$ | Low–moderate (packed R-tree) | `shapely >= 2.0` |
| H3 / geohash bucketing | Approximate proximity, tiling, join keys at continental scale | Points (cell-encoded) | Encode $O(M)$ / lookup $O(1)$ per cell | Very low (integer/string keys) | `h3`, `python-geohash` |
| PostGIS GiST | Server-side nearest, KNN operator, out-of-core datasets | Any (in-database) | Build $O(M \log M)$ / query $O(\log M)$ | Managed by DB (on disk, not RAM) | PostGIS / `psycopg` |

The R-tree `sindex` is the default for corridor and substation work because it queries true geometry envelopes — a `LineString` conductor, not a centroid approximation. A `cKDTree` is faster and lighter but only understands points, so it answers "nearest substation *location*" cleanly and "nearest *line*" only via midpoint or vertex proxies. `STRtree` is the right call when the reference layer is static (a fixed transmission network queried by many candidate batches), since it is immutable and cheap to reuse. H3 and geohash trade exactness for near-constant-time bucketing — ideal as a first-pass tile key across a national portfolio, not as a final distance. PostGIS GiST moves the whole problem server-side when the grid dataset outgrows a worker's RAM.

## Choosing a proximity method

The method is the operation you call on top of the index. Each maps to a distinct query shape.

| Method | Use-case | Returns | Index used | Notes |
|---|---|---|---|---|
| `gpd.sjoin_nearest` | Nearest grid geometry to each candidate site | Joined rows + `distance_col` | R-tree `sindex` | True geometry distance; honours `max_distance` |
| `cKDTree.query(k=…)` | k-nearest substation *points* to each site | Distances + integer indices | KD-tree | Points only; blazing fast for screening |
| `buffer(...)` + `sjoin` | All assets within a fixed clearance radius | Many-to-many matches | R-tree `sindex` | For 5 km setbacks and exclusion overlays |
| Network routing (async / Dijkstra) | Real path where straight-line is meaningless | Routed distance per leg | Graph / cost surface | Obstructed legs only; I/O-bound, run concurrently |

For point-to-point screening — "which substations are near this site?" — `cKDTree.query` with `k>1` returns a ranked shortlist in one vectorized call. For the authoritative geometry-to-geometry answer that feeds an interconnection screen, `sjoin_nearest` on the `sindex` is correct because it measures to the conductor, not a proxy. When the question is membership rather than ranking — every asset inside a right-of-way or environmental setback — `buffer` then `sjoin` on `intersects` is the idiom, and it is exactly how [grid capacity buffer analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) tests clearance. Network routing is the fallback reserved for legs where a ridge, wetland, or missing right-of-way makes the Euclidean distance a lie.

## Complexity cheat-sheet

The entire reason an index exists is to move the dominant term from a product to a logarithm. For $N$ candidate sites screened against $M$ grid features:

<svg viewBox="0 0 940 400" role="img" aria-label="Build and query cost for the four ways to answer a proximity question over 8,600 substations. A brute-force scan needs no build and 4.1 milliseconds per query. An STRtree builds in 0.9 seconds and answers a bounding-box query in 6 microseconds. A cKDTree builds in 0.4 seconds and answers a nearest query in 3 microseconds. An H3 cell hash builds in 0.2 seconds and looks up in 0.4 microseconds, but answers only at cell resolution. The build cost is paid once; the query cost is paid per site." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>What each index costs to build and to ask</title>
  <desc>A four-row comparison over 8,600 substations. Brute-force scan: no build, 4.1 milliseconds per query, exact, any predicate. STRtree: 0.9 seconds to build, 6 microseconds per query, exact after the candidate refine step, bounding-box queries. cKDTree: 0.4 seconds to build, 3 microseconds per query, exact for point-to-point nearest, requires projected coordinates. H3 cell hash: 0.2 seconds to build, 0.4 microseconds per lookup, approximate to the cell size, ideal for joins and aggregation.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="ic-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Four indexes over 8 600 substations — build once, query 42 000 times</text>
  <text x="60" y="74" text-anchor="start" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">index</text>
  <text x="370" y="74" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">build</text>
  <text x="500" y="74" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">per query</text>
  <text x="700" y="74" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">what it answers</text>
  <rect x="40" y="88" width="868" height="46" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="117" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">brute-force scan</text>
  <text x="370" y="117" text-anchor="middle" font-size="12" fill="currentColor">none</text>
  <text x="500" y="117" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">4.1 ms</text>
  <text x="700" y="117" text-anchor="middle" font-size="11.5" fill="currentColor">exact · any predicate</text>
  <rect x="40" y="142" width="868" height="46" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="171" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">STRtree (gdf.sindex)</text>
  <text x="370" y="171" text-anchor="middle" font-size="12" fill="currentColor">0.9 s</text>
  <text x="500" y="171" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">6 µs</text>
  <text x="700" y="171" text-anchor="middle" font-size="11.5" fill="currentColor">bbox candidates, then refine</text>
  <rect x="40" y="196" width="868" height="46" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="225" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">cKDTree</text>
  <text x="370" y="225" text-anchor="middle" font-size="12" fill="currentColor">0.4 s</text>
  <text x="500" y="225" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">3 µs</text>
  <text x="700" y="225" text-anchor="middle" font-size="11.5" fill="currentColor">nearest point · projected only</text>
  <rect x="40" y="250" width="868" height="46" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="279" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">H3 cell hash</text>
  <text x="370" y="279" text-anchor="middle" font-size="12" fill="currentColor">0.2 s</text>
  <text x="500" y="279" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">0.4 µs</text>
  <text x="700" y="279" text-anchor="middle" font-size="11.5" fill="currentColor">approximate to cell size</text>
  <rect x="40" y="316" width="424" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="252.0" y="337" text-anchor="middle" font-size="11.5" fill="currentColor">42 000 queries × 4.1 ms = 2 m 52 s of scanning</text>
  <text x="252.0" y="354" text-anchor="middle" font-size="11.5" fill="currentColor">the same queries against an STRtree: 0.25 s</text>
  <rect x="488" y="316" width="420" height="48" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="698.0" y="337" text-anchor="middle" font-size="11.5" fill="currentColor">The build cost only matters when the reference</text>
  <text x="698.0" y="354" text-anchor="middle" font-size="11.5" fill="currentColor">set changes more often than it is queried</text>
</svg>

| Approach | Complexity | 50k × 300k scale | When it applies |
|---|---|---|---|
| Nested loop / dense matrix | $O(N \times M)$ | $1.5 \times 10^{10}$ ops | Never at production scale |
| Indexed nearest (R-tree / KD-tree) | $O(N \log M)$ | $\approx 9 \times 10^{5}$ ops | Default for all proximity work |
| Bucketed / cell join (H3) | $O(N)$ amortized | $5 \times 10^{4}$ ops | Approximate first-pass only |

The pairwise cost

$$ T_\text{naive} = O(N \times M) $$

is what kills desktop workflows: it does not raise an error, it simply never returns, or is killed by the out-of-memory reaper. An index replaces it with

$$ T_\text{indexed} = O(N \log M) $$

by discarding every feature whose bounding box cannot contain the nearest geometry before one exact distance is computed. On a 50,000 × 300,000 problem that is roughly the difference between $1.5 \times 10^{10}$ and $9 \times 10^{5}$ operations — four to five orders of magnitude, which is the gap between an overnight job and a sub-second query.

## Decision matrix

Read left to right: the query shape you hold determines the index, which determines the method to call.

<svg viewBox="0 0 1000 396" role="img" aria-label="Spatial index and proximity decision matrix. Point-to-point k-nearest queries use a scipy cKDTree and the tree.query method. Geometry-to-geometry nearest queries use a GeoPandas R-tree sindex or Shapely STRtree and gpd.sjoin_nearest. Within-radius or buffer-overlay queries use the R-tree sindex bounding-box query and buffer plus sjoin. Continental approximate bucketing uses H3 or geohash cells and a cell join. Obstructed network-constrained legs use a graph or cost surface and async Dijkstra routing." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="1000" height="396"/>
  <title>Query shape to spatial index to proximity method</title>
  <desc>A matrix mapping each query shape to the spatial index and the proximity method to call: point-to-point k-nearest uses scipy cKDTree with tree.query; geometry-to-geometry nearest uses GeoPandas R-tree sindex or Shapely STRtree with gpd.sjoin_nearest; within-radius or buffer overlay uses the R-tree sindex bbox query with buffer plus sjoin; continental approximate work uses H3 or geohash bucketing with a cell join; obstructed network-constrained legs use a graph or cost surface with async Dijkstra routing.</desc>
  <g font-size="11" font-weight="700" letter-spacing="0.8" fill="currentColor" opacity="0.7">
    <text x="20" y="24">QUERY SHAPE</text>
    <text x="400" y="24">INDEX</text>
    <text x="700" y="24">METHOD TO CALL</text>
  </g>
  <line x1="20" y1="34" x2="980" y2="34" stroke="currentColor" stroke-width="1" opacity="0.35"/>
  <g font-size="13" fill="currentColor">
    <!-- Row 1: point-to-point -->
    <g>
      <text x="20" y="68">Point-to-point</text><text x="20" y="85">k-nearest</text>
      <rect x="385" y="50" width="235" height="46" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
      <text x="502" y="72" text-anchor="middle" font-weight="600">scipy cKDTree</text>
      <text x="502" y="89" text-anchor="middle" font-size="11.5">points only</text>
      <text x="700" y="79">tree.query(k=…)</text>
    </g>
    <!-- Row 2: geometry-to-geometry -->
    <g>
      <text x="20" y="132">Geometry-to-</text><text x="20" y="149">geometry nearest</text>
      <rect x="385" y="114" width="235" height="46" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
      <text x="502" y="136" text-anchor="middle" font-weight="600">R-tree sindex</text>
      <text x="502" y="153" text-anchor="middle" font-size="11.5">or STRtree</text>
      <text x="700" y="143">gpd.sjoin_nearest</text>
    </g>
    <!-- Row 3: within radius -->
    <g>
      <text x="20" y="196">Within radius /</text><text x="20" y="213">buffer overlay</text>
      <rect x="385" y="178" width="235" height="46" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
      <text x="502" y="200" text-anchor="middle" font-weight="600">sindex bbox query</text>
      <text x="502" y="217" text-anchor="middle" font-size="11.5">intersects prune</text>
      <text x="700" y="207">buffer(…) + sjoin</text>
    </g>
    <!-- Row 4: continental bucketing -->
    <g>
      <text x="20" y="260">Continental</text><text x="20" y="277">approx. bucketing</text>
      <rect x="385" y="242" width="235" height="46" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
      <text x="502" y="264" text-anchor="middle" font-weight="600">H3 / geohash</text>
      <text x="502" y="281" text-anchor="middle" font-size="11.5">cell keys</text>
      <text x="700" y="271">cell join</text>
    </g>
    <!-- Row 5: network-constrained -->
    <g>
      <text x="20" y="324">Obstructed /</text><text x="20" y="341">network-constrained</text>
      <rect x="385" y="306" width="235" height="46" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
      <text x="502" y="328" text-anchor="middle" font-weight="600">graph / cost surface</text>
      <text x="502" y="345" text-anchor="middle" font-size="11.5">fallback only</text>
      <text x="700" y="335">async Dijkstra</text>
    </g>
  </g>
  <g stroke="currentColor" stroke-width="1.5" fill="currentColor" opacity="0.8">
    <g><line x1="200" y1="73" x2="379" y2="73"/><path d="M377 68 L385 73 L377 78 Z" stroke="none"/></g>
    <g><line x1="200" y1="137" x2="379" y2="137"/><path d="M377 132 L385 137 L377 142 Z" stroke="none"/></g>
    <g><line x1="200" y1="201" x2="379" y2="201"/><path d="M377 196 L385 201 L377 206 Z" stroke="none"/></g>
    <g><line x1="200" y1="265" x2="379" y2="265"/><path d="M377 260 L385 265 L377 270 Z" stroke="none"/></g>
    <g><line x1="200" y1="329" x2="379" y2="329"/><path d="M377 324 L385 329 L377 334 Z" stroke="none"/></g>
    <g><line x1="620" y1="73" x2="694" y2="73"/><path d="M692 68 L700 73 L692 78 Z" stroke="none"/></g>
    <g><line x1="620" y1="137" x2="694" y2="137"/><path d="M692 132 L700 137 L692 142 Z" stroke="none"/></g>
    <g><line x1="620" y1="201" x2="694" y2="201"/><path d="M692 196 L700 201 L692 206 Z" stroke="none"/></g>
    <g><line x1="620" y1="265" x2="694" y2="265"/><path d="M692 260 L700 265 L692 270 Z" stroke="none"/></g>
    <g><line x1="620" y1="329" x2="694" y2="329"/><path d="M692 324 L700 329 L692 334 Z" stroke="none"/></g>
  </g>
  <text x="500" y="382" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.7">All paths assume a projected metric CRS (e.g. EPSG:32610); measure distance only after reprojection.</text>
</svg>

## cKDTree vs sindex.query in practice

The two workhorse indexes answer the same question — nearest grid asset — with different trade-offs. A `cKDTree` over substation coordinates is the fastest possible point-to-point screen but ignores line geometry; the GeoPandas `sindex` with `sjoin_nearest` measures true distance to conductors at slightly higher cost. The snippet below runs both against the same inputs so the difference is concrete. Both require the layers to already share a projected frame such as EPSG:32610.

```python
import geopandas as gpd
import numpy as np
from scipy.spatial import cKDTree

TARGET_EPSG = 32610  # UTM 10N — metric, distances in metres


def nearest_substation_kdtree(
    sites_gdf: gpd.GeoDataFrame, substation_gdf: gpd.GeoDataFrame
) -> gpd.GeoDataFrame:
    """Fast point-to-point: nearest substation LOCATION via a KD-tree."""
    assert sites_gdf.crs.to_epsg() == TARGET_EPSG, "Sites must be projected metric"
    assert substation_gdf.crs.to_epsg() == TARGET_EPSG, "Substations must be projected"

    sub_xy = np.column_stack((substation_gdf.geometry.x, substation_gdf.geometry.y))
    site_xy = np.column_stack((sites_gdf.geometry.x, sites_gdf.geometry.y))

    tree = cKDTree(sub_xy)                      # build: O(M log M)
    dist_m, idx = tree.query(site_xy, k=1)      # query: O(N log M)

    out = sites_gdf.copy()
    out["nearest_sub_id"] = substation_gdf.iloc[idx]["substation_id"].to_numpy()
    out["kdtree_distance_m"] = dist_m
    return out


def nearest_substation_sindex(
    sites_gdf: gpd.GeoDataFrame, substation_gdf: gpd.GeoDataFrame
) -> gpd.GeoDataFrame:
    """Authoritative geometry-to-geometry distance via the R-tree sindex."""
    # sjoin_nearest builds and queries substation_gdf.sindex internally
    joined = gpd.sjoin_nearest(
        sites_gdf, substation_gdf[["substation_id", "geometry"]],
        distance_col="sindex_distance_m", how="left",
    )
    # Collapse ties (a site equidistant to two assets) to the first match
    return joined[~joined.index.duplicated(keep="first")]


# Contrast on the same inputs
kd = nearest_substation_kdtree(sites_gdf, substation_gdf)
sj = nearest_substation_sindex(sites_gdf, substation_gdf)
delta = (kd["kdtree_distance_m"] - sj["sindex_distance_m"]).abs()
print(f"max |Δ| between methods: {delta.max():.2f} m")  # ~0 for point layers
```

For a point substation layer the two agree to floating-point noise, and the KD-tree wins on speed and memory. The moment the reference layer becomes lines or polygons — real transmission corridors — the KD-tree can only see midpoints or vertices, and `sjoin_nearest` on the `sindex` becomes the correct choice because it measures perpendicular distance to the conductor itself.

## Guidance notes

- **Project first, always.** Every method here assumes a metric CRS. Running any of them on EPSG:4326 returns degrees, not metres — the canonical silent bug. Enforce the reprojection covered in the [projection and CRS quick reference](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/projection-and-crs-quick-reference/) before indexing.
- **Points → KD-tree, geometries → R-tree.** Reach for `cKDTree` when the reference layer is genuinely point-like (substations, met masts) and you want ranked k-nearest. Reach for `sindex` / `sjoin_nearest` when distance-to-line or distance-to-polygon must be exact.
- **Build the index once.** Construct `substation_gdf.sindex` or the `cKDTree` a single time and reuse it across every candidate chunk; rebuilding per chunk reintroduces the very cost the index removes.
- **Bound the search with `max_distance`.** Passing a `max_distance` to `sjoin_nearest` (or a `distance_upper_bound` to `cKDTree.query`) caps work per query and makes "no asset within reach" an explicit null instead of a spurious far match.
- **Use H3 for a first pass, not the verdict.** Cell bucketing is a near-constant-time way to shard a continental portfolio into tiles; refine within each tile with an exact R-tree query rather than trusting the cell distance.
- **Push to PostGIS GiST when RAM runs out.** When the grid layer no longer fits a worker, the `<->` KNN operator over a GiST index keeps the join out-of-core and server-side.


## Worked example: sizing an index for a national screen

A concrete workload makes the trade-offs legible. Screening 42,000 candidate parcels against 8,600
substations, 61,000 transmission ways and 4,200 constraint polygons involves three different query
shapes, and each wants a different structure.

The substation query is point-to-point nearest, so a `cKDTree` built on projected coordinates is the
right structure: 0.4 seconds to build, roughly 3 microseconds per query, and an exact answer as long
as the coordinates are metric. Because the tree is built once and queried 42,000 times, the build
cost is irrelevant — it is amortised on the first few hundred queries.

The transmission query is point-to-line nearest, which a KD-tree cannot answer directly: a tree over
line vertices returns the nearest vertex, not the nearest point on the line, and the two differ by
up to half a segment length. Here the STRtree behind `gdf.sindex` is correct — query for candidate
geometries by bounding box, then call `shapely.distance` on the handful that survive. The exact
predicate runs on tens of candidates instead of tens of thousands of lines.

The constraint query is point-in-polygon over a modest polygon set with expensive geometries, which
is the case prepared geometry was built for. Preparing each constraint polygon once and testing
candidates against the prepared version turns a per-test edge walk into an indexed lookup, and the
preparation pays for itself after roughly twenty tests against the same polygon.

The fourth structure, an H3 cell hash, answers none of these correctly — it answers a different
question very fast. Hashing every parcel and every substation to resolution 8 cells and joining on
the cell identifier finds candidates in microseconds, but the answer is only exact to the cell size,
which at resolution 8 is about 0.74 square kilometres. That is fine for a portfolio rollup and
useless for a setback, so the workable pattern is to use the hash to find candidates and geometry to
measure them.

## Frequently asked questions

### Why is `sindex.query` returning features that do not intersect?

Because it is a bounding-box query by design: it returns candidates whose envelopes overlap, and the
exact predicate is the caller's job. That two-step shape is the whole point — the cheap test prunes
the population, the expensive test decides. A workflow that treats the candidate list as the answer
over-selects by whatever the difference between the envelopes and the geometries happens to be,
which for long diagonal lines is very large.

### Does building an index help for a single query?

No. One query against an unindexed frame is a linear scan; one query against a freshly built index
is a linear-time build plus a fast lookup, which is strictly slower. Indexes pay off when the
reference set is reused, which is the normal case in screening and the abnormal case in an
interactive notebook — where the index is often rebuilt implicitly on every call because the frame
was copied in between.

### Should the index be rebuilt after a filter?

Yes, if the filter removed a meaningful share of the reference set, and GeoPandas will do it lazily
on first access to `sindex` after a copy. The subtle failure is the opposite: holding a reference to
an index built over the unfiltered frame and querying it with positional indices that now refer to
different rows. Always query the index attached to the frame you are indexing into.

### How does H3 resolution map to grid work?

Resolution 6 averages about 36 square kilometres per cell and suits balancing-area rollups;
resolution 7 averages 5.2 and suits county-scale capacity aggregation; resolution 8 averages 0.74,
close to a utility-scale solar block; resolution 9 averages 0.105, roughly a substation yard. Pick
the resolution from the thing being counted, and remember that a cell join is exact only to the cell
size.

### Is a spatial index useful for temporal filtering too?

Not directly — but the same principle applies, and the two compose. Filter on time first when the
temporal predicate is selective, because dropping rows before a spatial query shrinks both the index
build and the candidate set. In a partitioned store the temporal filter is usually a partition
prune, which costs nothing at all, and the spatial index then runs over a fraction of the data.


### Why does `sjoin_nearest` return more rows than the left frame?

Because ties are returned in full by default: when two reference geometries are exactly equidistant,
both survive the join, and a downstream aggregation then double-counts that row. Exact ties are
common in gridded or snapped data, where several candidates sit at identical rounded distances.
Resolve them deterministically — lowest identifier, highest voltage, whatever the domain justifies —
rather than letting row order decide.

### What is the cheapest way to speed up a slow spatial join?

Reduce the candidate population before the join rather than optimising the join itself. Filtering the
reference set to serviceable assets, projecting to a metric frame once instead of per call, and
dropping columns that are not needed downstream routinely produce a larger speed-up than any index
change, because they shrink both sides of the operation. Reach for the index next, and for a
distributed scheduler last.

### Does a spatial index help with `contains` as well as `intersects`?

Yes — every binary predicate benefits from the same candidate-then-refine pattern, because the
bounding-box test is a necessary condition for all of them. The refinement step differs, and
`contains` is the more expensive refinement, which makes the pruning more valuable rather than less.
Prepared geometry compounds the gain when one side is reused across many tests.


### How large can a reference set get before an index stops helping?

The index keeps helping; what stops scaling is holding the whole reference set in one process. A
tree over a few million points is unremarkable, and the query cost grows only logarithmically, so
the practical ceiling is memory rather than algorithmic. Past that point the answer is to partition
the reference set spatially — by state, by balancing area, by H3 cell — and index each partition,
rather than to abandon indexing for a distributed scan.

### Should distances be cached between runs?

Cache the pairings, not the distances. Which substation is nearest to a given site changes rarely,
while the distance to it may be recomputed cheaply once the pairing is known — and a cached distance
becomes wrong silently when either geometry is edited. Storing the nearest-asset identifier with the
inputs that produced it gives the speed-up without the staleness class of bug.

## Related

- [Grid Infrastructure & Network Proximity Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/) — the parent pipeline whose proximity stage these indexes power.
- [Proximity Distance Calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) — the full chunked, indexed scoring workflow this reference distils.
- [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) — where the buffer-plus-sjoin method decides clearance and setback membership.
- [Projection and CRS Quick Reference](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/projection-and-crs-quick-reference/) — the metric-CRS choice every method here depends on.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — why an unprojected index returns degrees, not metres.
