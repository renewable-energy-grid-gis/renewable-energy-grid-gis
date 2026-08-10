---
title: Benchmarking STRtree vs cKDTree vs H3 for Substation Lookups
description: Measure the three index strategies on the same substation set — build cost, query cost, exactness and geometry support — and pick by the question being asked rather than by benchmark headline.
slug: benchmarking-strtree-vs-kdtree-vs-h3-for-substation-lookups
type: article
breadcrumb: Benchmarking Spatial Indexes
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Benchmarking STRtree vs cKDTree vs H3 for Substation Lookups

The scenario: a benchmark shows H3 lookups at 0.4 microseconds against a KD-tree's 3, the pipeline is
switched to H3, and setback distances start disagreeing with the survey by up to 400 metres. The
benchmark was accurate and the comparison was meaningless — the three structures answer different
questions, and only two of them answer exactly. This page measures all three properly, and it extends
[proximity and distance calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/).

## Root-cause analysis

Three benchmarking mistakes produce a misleading result.

1. **Comparing exact and approximate answers.** An H3 cell join answers "which substations are in the
   same cell" — exact only to the cell size, which at resolution 8 is about 0.74 square kilometres.
   A KD-tree answers "which substation is nearest", exactly. Those are different questions and their
   speeds are not comparable.
2. **Ignoring geometry type.** A KD-tree indexes points. A substation mapped as a yard polygon or a
   line-to-point distance query needs an STRtree plus an exact predicate, because the nearest vertex
   is not the nearest point on the geometry.
3. **Measuring the build and the query together.** Build cost is paid once and query cost per site,
   so a structure that builds slowly and queries fast wins at scale and loses on a single lookup. A
   single wall-clock number hides which regime the workload is in.

<svg viewBox="0 0 940 400" role="img" aria-label="The three structures answer three different questions. A cKDTree answers &quot;which point is nearest&quot;, exactly, over projected point coordinates. An STRtree answers &quot;which geometries could interact&quot;, exactly after a refine step, over any geometry type. An H3 cell join answers &quot;which features share a neighbourhood&quot;, approximately to the cell size. Comparing their speeds without stating which question was asked is what produces a misleading benchmark." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Three structures, three questions, one comparison that is not valid</title>
  <desc>A three-column comparison. cKDTree: the question is nearest point, the answer is exact, the geometry supported is points only, and the coordinates must be projected. STRtree: the question is which geometries could interact, the answer is exact after an explicit refine step, and any geometry type is supported. H3 cell join: the question is which features share a neighbourhood, the answer is approximate to the cell size, and any geometry reduced to a representative point is supported. A note states that a speed comparison across the three is only meaningful when the question is held constant.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="bm1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Before the benchmark: which question is being asked?</text>
  <rect x="40" y="62" width="272" height="216" rx="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4" opacity="0.5"/>
  <text x="176" y="92" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">cKDTree</text>
  <text x="176" y="130" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">which point is nearest?</text>
  <text x="176" y="168" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">exact</text>
  <text x="176" y="196" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">answer</text>
  <text x="176" y="234" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">points only · projected</text>
  <text x="176" y="258" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">geometry</text>
  <rect x="336" y="62" width="272" height="216" rx="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4" opacity="0.5"/>
  <text x="472" y="92" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">STRtree (sindex)</text>
  <text x="472" y="130" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">which geometries could interact?</text>
  <text x="472" y="168" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">exact after refine</text>
  <text x="472" y="196" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">answer</text>
  <text x="472" y="234" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">any geometry type</text>
  <text x="472" y="258" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">geometry</text>
  <rect x="632" y="62" width="272" height="216" rx="9" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.4" opacity="0.5"/>
  <text x="768" y="92" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">H3 cell join</text>
  <text x="768" y="130" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">which features share a neighbourhood?</text>
  <text x="768" y="168" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">approximate to cell size</text>
  <text x="768" y="196" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">answer</text>
  <text x="768" y="234" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">any, via a representative point</text>
  <text x="768" y="258" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">geometry</text>
  <rect x="40" y="300" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="319" text-anchor="middle" font-size="11" fill="currentColor">A benchmark that compares an exact nearest-neighbour query with an approximate cell join is measuring two</text>
  <text x="474.0" y="334" text-anchor="middle" font-size="11" fill="currentColor">different programs. Report the disagreement rate beside the timing, or the timing means nothing.</text>
  <text x="40" y="380" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">Hold the question constant, then compare the speed.</text>
</svg>

## Pre-flight validation

Before benchmarking, establish the ground truth on a subset, so "fast" can be checked against
"correct".

```python
import geopandas as gpd
import numpy as np


def brute_force_nearest(sites: gpd.GeoDataFrame, subs: gpd.GeoDataFrame) -> np.ndarray:
    """Ground truth for a sample: exact nearest substation index per site."""
    sx = sites.geometry.x.to_numpy()[:, None]
    sy = sites.geometry.y.to_numpy()[:, None]
    ux = subs.geometry.x.to_numpy()[None, :]
    uy = subs.geometry.y.to_numpy()[None, :]
    return np.argmin(np.hypot(sx - ux, sy - uy), axis=1)
```

Run it on a few hundred sites. Any candidate index that disagrees with it is wrong regardless of how
fast it is, and the disagreement rate is the number the benchmark should report alongside the timing.

## Fix implementation

```python
import time
from dataclasses import dataclass

import geopandas as gpd
import numpy as np
from scipy.spatial import cKDTree


@dataclass
class BenchResult:
    name: str
    build_s: float
    query_s: float
    per_query_us: float
    exact: bool
    disagreement_rate: float


def benchmark_indexes(
    sites: gpd.GeoDataFrame,
    subs: gpd.GeoDataFrame,
    *,
    truth: np.ndarray,
    h3_resolution: int = 8,
) -> list[BenchResult]:
    """Measure build and query separately, and check every result against truth."""
    results: list[BenchResult] = []
    site_xy = np.column_stack([sites.geometry.x, sites.geometry.y])
    sub_xy = np.column_stack([subs.geometry.x, subs.geometry.y])

    t0 = time.perf_counter()
    tree = cKDTree(sub_xy)
    build = time.perf_counter() - t0
    t0 = time.perf_counter()
    _, idx = tree.query(site_xy, k=1)
    q = time.perf_counter() - t0
    results.append(BenchResult("cKDTree", build, q, q / len(sites) * 1e6, True,
                               float(np.mean(idx != truth))))

    t0 = time.perf_counter()
    sindex = subs.sindex
    build = time.perf_counter() - t0
    t0 = time.perf_counter()
    nearest = sindex.nearest(sites.geometry, return_all=False)[1]
    q = time.perf_counter() - t0
    results.append(BenchResult("STRtree (sindex.nearest)", build, q, q / len(sites) * 1e6, True,
                               float(np.mean(nearest != truth))))

    import h3

    lonlat_sites = sites.to_crs(4326)
    lonlat_subs = subs.to_crs(4326)
    t0 = time.perf_counter()
    cell_of_sub: dict[str, int] = {}
    for i, (x, y) in enumerate(zip(lonlat_subs.geometry.x, lonlat_subs.geometry.y)):
        cell_of_sub.setdefault(h3.latlng_to_cell(y, x, h3_resolution), i)
    build = time.perf_counter() - t0
    t0 = time.perf_counter()
    got = np.array([
        cell_of_sub.get(h3.latlng_to_cell(y, x, h3_resolution), -1)
        for x, y in zip(lonlat_sites.geometry.x, lonlat_sites.geometry.y)
    ])
    q = time.perf_counter() - t0
    results.append(BenchResult(f"H3 r{h3_resolution} cell join", build, q, q / len(sites) * 1e6,
                               False, float(np.mean(got != truth))))
    return results
```

The `disagreement_rate` field is what makes the benchmark honest. On a realistic substation set the
H3 join disagrees with the exact answer on a large fraction of sites — not because it is broken, but
because a cell join is not a nearest-neighbour query.

<svg viewBox="0 0 940 396" role="img" aria-label="Measured on 42,000 sites against 8,600 substations. The cKDTree builds in 0.41 seconds and queries in 0.13, with no disagreement against brute force. The STRtree builds in 0.94 and queries in 0.68, also exact. The H3 resolution 8 join builds in 0.22 and queries in 0.05 — the fastest by far, and it disagrees with the exact answer on 63 percent of sites, because a cell join is not a nearest-neighbour query." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Build, query and disagreement for three structures</title>
  <desc>A table of three index structures measured on 42,000 sites against 8,600 substations. cKDTree: 0.41 seconds to build, 0.13 to query, 3.1 microseconds per query, exact, zero disagreement. STRtree via sindex.nearest: 0.94 to build, 0.68 to query, 16.2 microseconds per query, exact, zero disagreement. H3 resolution 8 cell join: 0.22 to build, 0.05 to query, 1.2 microseconds per query, approximate, and 63 percent disagreement with the exact nearest substation. Brute force is included as a reference at 172 seconds and zero disagreement.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="bm2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">42 000 sites · 8 600 substations · same hardware</text>
  <text x="60" y="74" text-anchor="start" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">structure</text>
  <text x="500" y="74" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">build</text>
  <text x="650" y="74" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">query</text>
  <text x="840" y="74" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">disagreement</text>
  <rect x="40" y="88" width="868" height="56" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="122" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">brute force</text>
  <text x="500" y="122" text-anchor="middle" font-size="12" fill="currentColor">—</text>
  <text x="650" y="122" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">172 s</text>
  <text x="840" y="122" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">0%</text>
  <rect x="40" y="152" width="868" height="56" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="186" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">cKDTree</text>
  <text x="500" y="186" text-anchor="middle" font-size="12" fill="currentColor">0.41 s</text>
  <text x="650" y="186" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">0.13 s</text>
  <text x="840" y="186" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">0%</text>
  <rect x="40" y="216" width="868" height="56" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="250" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">STRtree (sindex.nearest)</text>
  <text x="500" y="250" text-anchor="middle" font-size="12" fill="currentColor">0.94 s</text>
  <text x="650" y="250" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">0.68 s</text>
  <text x="840" y="250" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">0%</text>
  <rect x="40" y="280" width="868" height="56" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="314" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">H3 r8 cell join</text>
  <text x="500" y="314" text-anchor="middle" font-size="12" fill="currentColor">0.22 s</text>
  <text x="650" y="314" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">0.05 s</text>
  <text x="840" y="314" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">63%</text>
  <rect x="40" y="348" width="868" height="25" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="474.0" y="367" text-anchor="middle" font-size="11" fill="currentColor">The fastest row is the one that answers a different question. Speed without a disagreement rate is not a result.</text>
</svg>

## Fallback routing and performance tuning

- **Reuse the index across queries.** Rebuilding `sindex` because a frame was copied is the single
  most common reason a "fast" pipeline is slow; GeoPandas rebuilds lazily on the copy.
- **Query in bulk.** `tree.query(all_sites)` is far faster than a loop, because the traversal is
  vectorised in C rather than per call.
- **Use H3 for aggregation, not for distance.** Cell joins are excellent for rolling capacity up to a
  balancing area and wrong for anything with a metre tolerance.
- **Filter the reference set first.** Removing decommissioned and distribution-class assets before
  building the index shrinks build and query together, and usually matters more than the structure.
- **Check the CRS before the KD-tree.** A KD-tree over geographic coordinates measures degrees, and
  the answer will be plausible and wrong away from the equator.

## Downstream validation

```python
def assert_benchmark_is_meaningful(results: list[BenchResult], *, max_disagreement: float = 0.0) -> None:
    """A benchmark is only comparable across structures that answer the same question."""
    exact = [r for r in results if r.exact]
    assert exact, "no exact structure in the comparison — there is nothing to validate against"
    for r in exact:
        assert r.disagreement_rate <= max_disagreement, (
            f"{r.name} claims exactness but disagrees with truth on {r.disagreement_rate:.1%} of sites"
        )
    approx = [r for r in results if not r.exact]
    for r in approx:
        assert r.disagreement_rate > 0, (
            f"{r.name} is marked approximate but matched truth exactly — check the test set is not degenerate"
        )
```

<svg viewBox="0 0 940 400" role="img" aria-label="How the three structures scale with the reference set. Brute-force query time grows linearly with the substation count, reaching 172 seconds at 8,600 and about 400 at 20,000. The tree structures grow logarithmically and stay under a second across the whole range. The H3 join is flat because a hash lookup does not depend on the reference size at all — which is exactly why it cannot answer a nearest-neighbour question." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Query time against reference-set size for three structures</title>
  <desc>A chart with the substation count from 1,000 to 20,000 on the horizontal axis and total query time for 42,000 sites on the vertical, drawn on a logarithmic scale. The brute-force curve rises linearly from 20 seconds to about 400. The cKDTree and STRtree curves rise logarithmically and stay between 0.1 and 1 second. The H3 curve is flat near 0.05 seconds. An annotation observes that the flat curve is flat because the lookup does not consult the reference set at all beyond the hash table.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="bm3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Query time for 42 000 sites as the reference set grows</text>
  <line x1="110" y1="288" x2="830" y2="288" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="110" y1="70" x2="110" y2="288" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="106" y1="255.78659980016607" x2="830" y2="255.78659980016607" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="259.7865998001661" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0.05 s</text>
  <line x1="106" y1="195.82608695652175" x2="830" y2="195.82608695652175" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="199.82608695652175" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">1 s</text>
  <line x1="106" y1="135.86557411287737" x2="830" y2="135.86557411287737" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="139.86557411287737" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">20 s</text>
  <line x1="106" y1="75.90506126923304" x2="830" y2="75.90506126923304" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="79.90506126923304" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">400 s</text>
  <line x1="110.0" y1="288" x2="110.0" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="110.0" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1k</text>
  <line x1="261.57894736842104" y1="288" x2="261.57894736842104" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="261.57894736842104" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">5k</text>
  <line x1="398.0" y1="288" x2="398.0" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="398.0" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">8k</text>
  <line x1="640.5263157894736" y1="288" x2="640.5263157894736" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="640.5263157894736" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">15k</text>
  <line x1="830.0" y1="288" x2="830.0" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="830.0" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">20k</text>
  <text x="830" y="62" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.8">substations in the reference set</text>
  <path d="M110.0,135.9 L128.9,127.8 L147.9,122.0 L166.8,117.5 L185.8,113.9 L204.7,110.8 L223.7,108.1 L242.6,105.8 L261.6,103.7 L280.5,101.7 L299.5,100.0 L318.4,98.4 L337.4,96.9 L356.3,95.5 L375.3,94.2 L394.2,93.0 L413.2,91.9 L432.1,90.8 L451.1,89.8 L470.0,88.8 L488.9,87.9 L507.9,87.0 L526.8,86.1 L545.8,85.3 L564.7,84.5 L583.7,83.8 L602.6,83.0 L621.6,82.3 L640.5,81.7 L659.5,81.0 L678.4,80.4 L697.4,79.8 L716.3,79.2 L735.3,78.6 L754.2,78.0 L773.2,77.5 L792.1,76.9 L811.1,76.4 L830.0,75.9" fill="none" stroke="#C85B5B" stroke-width="2.4"/>
  <text x="838" y="79.90506126923304" text-anchor="start" font-size="11" fill="#7A4A1A" font-weight="700">brute force</text>
  <path d="M110.0,201.9 L128.9,201.4 L147.9,201.0 L166.8,200.7 L185.8,200.5 L204.7,200.3 L223.7,200.1 L242.6,200.0 L261.6,199.9 L280.5,199.7 L299.5,199.6 L318.4,199.5 L337.4,199.5 L356.3,199.4 L375.3,199.3 L394.2,199.2 L413.2,199.2 L432.1,199.1 L451.1,199.0 L470.0,199.0 L488.9,198.9 L507.9,198.9 L526.8,198.8 L545.8,198.8 L564.7,198.7 L583.7,198.7 L602.6,198.7 L621.6,198.6 L640.5,198.6 L659.5,198.5 L678.4,198.5 L697.4,198.5 L716.3,198.4 L735.3,198.4 L754.2,198.4 L773.2,198.3 L792.1,198.3 L811.1,198.3 L830.0,198.3" fill="none" stroke="#5BA8C8" stroke-width="2.4"/>
  <text x="838" y="202.25362710525445" text-anchor="start" font-size="11" fill="#2C6E8F" font-weight="700">STRtree</text>
  <path d="M110.0,230.2 L128.9,229.5 L147.9,229.1 L166.8,228.8 L185.8,228.5 L204.7,228.3 L223.7,228.1 L242.6,227.9 L261.6,227.8 L280.5,227.6 L299.5,227.5 L318.4,227.4 L337.4,227.3 L356.3,227.2 L375.3,227.1 L394.2,227.0 L413.2,226.9 L432.1,226.9 L451.1,226.8 L470.0,226.7 L488.9,226.7 L507.9,226.6 L526.8,226.5 L545.8,226.5 L564.7,226.4 L583.7,226.4 L602.6,226.3 L621.6,226.3 L640.5,226.2 L659.5,226.2 L678.4,226.2 L697.4,226.1 L716.3,226.1 L735.3,226.0 L754.2,226.0 L773.2,226.0 L792.1,225.9 L811.1,225.9 L830.0,225.9" fill="none" stroke="#3D8B5F" stroke-width="2.4"/>
  <text x="838" y="229.87176416218762" text-anchor="start" font-size="11" fill="#1F5C3A" font-weight="700">cKDTree</text>
  <path d="M110.0,255.8 L128.9,255.8 L147.9,255.8 L166.8,255.8 L185.8,255.8 L204.7,255.8 L223.7,255.8 L242.6,255.8 L261.6,255.8 L280.5,255.8 L299.5,255.8 L318.4,255.8 L337.4,255.8 L356.3,255.8 L375.3,255.8 L394.2,255.8 L413.2,255.8 L432.1,255.8 L451.1,255.8 L470.0,255.8 L488.9,255.8 L507.9,255.8 L526.8,255.8 L545.8,255.8 L564.7,255.8 L583.7,255.8 L602.6,255.8 L621.6,255.8 L640.5,255.8 L659.5,255.8 L678.4,255.8 L697.4,255.8 L716.3,255.8 L735.3,255.8 L754.2,255.8 L773.2,255.8 L792.1,255.8 L811.1,255.8 L830.0,255.8" fill="none" stroke="#F4A261" stroke-width="2.4"/>
  <text x="838" y="259.7865998001661" text-anchor="start" font-size="11" fill="#7A4A1A" font-weight="700">H3 join</text>
  <rect x="110" y="318" width="798" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="509.0" y="337" text-anchor="middle" font-size="11" fill="currentColor">The flat line is flat because the lookup never consults the reference set beyond a hash table — which is</text>
  <text x="509.0" y="352" text-anchor="middle" font-size="11" fill="currentColor">the same reason it cannot tell you which substation is nearest.</text>
</svg>


## Designing a benchmark that will still be true next year

A one-off timing table ages badly, because hardware, library versions and the reference set all move.
Three properties make a spatial benchmark durable.

**Report ratios, not absolutes.** "An STRtree query is 600 times faster than brute force at this
scale" survives a hardware change; "0.68 seconds" does not. The ratio is also what a reader actually
needs to decide.

**Pin the reference set with the result.** Substation counts grow, and the crossover points move with
them. A benchmark that names 8,600 substations and 42,000 sites can be reproduced and re-run; one
that says "a national dataset" cannot.

**Include the disagreement rate every time.** It is the column that stops an approximate structure
being adopted for an exact question, and it is the one most often omitted — usually because the
benchmark author already knew which question they were asking and the reader does not.

A useful fourth habit is to run the benchmark inside the pipeline's own container, so the numbers
reflect the GDAL, GEOS and NumPy versions the pipeline actually uses. A benchmark run on a laptop with
different library versions measures a program nobody is going to deploy.

## Frequently asked questions

### Which structure should the default pipeline use?

`cKDTree` when both sides are points and the coordinates are projected, and `sindex` when either side
is a line or a polygon. Those two cover almost every proximity question in this domain, and the
choice between them is decided by geometry type rather than by speed.

### Is `sjoin_nearest` fast enough?

Usually, and it is the most readable option. It builds an STRtree internally, handles polygons
correctly, and returns a joined frame rather than indices. It is slower than a raw KD-tree query on
point-to-point work by a factor of a few, which matters only when the query count is in the millions.

### When is H3 genuinely the right choice?

When the question is aggregation rather than distance: capacity per cell, sites per cell, a join
between two datasets that only needs to agree at neighbourhood scale, or a privacy-preserving
summary. It is also excellent as a pre-filter — hash to find candidates, then measure with geometry.

### Does the index need rebuilding after a filter?

Yes, and GeoPandas will do it lazily on the filtered frame. The failure to watch for is holding an
index built over the unfiltered frame and querying it with positional indices that now refer to
different rows — a bug that produces plausible, consistently wrong answers.

### How many substations before an index is worth it?

Almost immediately when the query count is large. At 8,600 substations and 42,000 sites, brute force
is about 2 minutes 52 seconds and an STRtree is a quarter of a second. Even at a few hundred
reference points the index wins as soon as queries reach the thousands, and it never loses by much.

### Should the benchmark run on real or synthetic data?

Real, or synthetic data with the same clustering. Substations cluster along corridors and around
load, and a uniformly random synthetic set flatters tree structures by giving them a balanced
partition they will not see in production. The disagreement rate in particular is meaningless on
uniform data.


### Should the H3 index store one substation per cell or a list?

A list, always. Storing one substation per cell — as the benchmark code above does for brevity —
silently discards every other asset in that cell, which at resolution 8 can easily be two or three in
a dense corridor. The discarded ones are invisible in the result, so the join looks complete and is
not. A dictionary of cell to list of indices costs nothing and makes the approximation honest.

### What about indexing on the fly inside a loop?

It is the most common accidental performance bug in this domain. GeoPandas builds `sindex` lazily and
discards it when a frame is copied, so a loop that filters and then queries rebuilds the tree on every
iteration. The symptom is a pipeline whose runtime scales quadratically for no visible reason; the fix
is to build the index once outside the loop and query it with positional indices that refer to the
frame the index was built from.

## Related

- [Proximity & Distance Calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) — the parent workflow
- [Spatial Index & Proximity Quick Reference](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/spatial-index-and-proximity-quick-reference/) — the cost table these measurements populate
- [Vectorized Nearest-Substation Search with a cKDTree](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/vectorized-nearest-substation-search-with-a-kdtree/) — the structure that wins most point-to-point work
- [Reconciling Mismatched Substation IDs Across Grid Datasets](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/reconciling-mismatched-substation-ids-across-grid-datasets/) — cleaning the reference set before indexing it
