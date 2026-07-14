---
title: Automating Interconnection Queue Screening with Async Proximity Scoring
description: Build an end-to-end interconnection queue screen in Python — project inputs, prescreen straight-line distances, async-route only the obstructed legs with a bounded aiohttp client, merge thermal headroom, and export a ranked feasibility table.
slug: automating-interconnection-queue-screening-with-async-proximity-scoring
type: article
breadcrumb: Async Interconnection Queue Screening
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Automating Interconnection Queue Screening with Async Proximity Scoring

Screening a portfolio of candidate generation sites against the grid is a pipeline, not a single distance call. You start with hundreds or thousands of parcels, you need the interconnection distance to the nearest viable point of the network for each, and you need the answer ranked by feasibility so a development team can decide what to submit into the queue. The naive version — loop each site, `await` a routing request, collect the results — is the exact pattern this page exists to fix. It compounds the [pairwise proximity-scaling problem](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) covered by the parent workflow with a second failure surface: an async client that either serializes into an unusable wall-clock time or, worse, fires every request at once and takes the routing endpoint (and your local socket pool) down with it.

The fix is a staged pipeline. Normalize and project every input, prescreen with a cheap straight-line nearest-feature query so the expensive router only ever sees the legs that genuinely need it, resolve that obstructed subset with a **bounded, retrying, order-preserving** async client, merge in capacity headroom, and emit a ranked table with the provenance a reviewer can re-run. Straight-line distance is the prescreen; a routed distance combined with thermal headroom is the verdict.

## Where the Screening Pipeline Fails

The scenario that breaks production is a screening script that mixes CPU-bound `geopandas` work and network-bound routing inside one `asyncio` event loop, then dispatches with an unbounded `asyncio.gather`. It passes on twenty test sites and falls over on a real 8,000-site portfolio. The symptoms are a cascade of `aiohttp.ClientOSError: [Errno 24] Too many open files`, `TimeoutError`, or a hung run that never returns — and if it *does* return, a feasibility table whose distances are silently misaligned to the wrong sites.

## Root-Cause Analysis

Four compounding causes turn a working demo into a broken batch, and each maps to a distinct stage of the fix below.

1. **Unbounded `asyncio.gather` exhausts sockets and the endpoint.** `gather(*[fetch(s) for s in sites])` schedules *every* coroutine immediately. Eight thousand concurrent POSTs open eight thousand connections, blow past the process file-descriptor limit, and hammer the routing service into rate-limiting or refusing you. Concurrency must be *bounded*, not merely parallel.
2. **No per-request timeout or retry.** A single slow or dropped routing response with no `ClientTimeout` blocks its slot indefinitely, and one transient 503 with no retry propagates a hard exception up through `gather` that aborts the whole run. Tail latency on one leg should never stall or fail the portfolio.
3. **Blocking `geopandas` work inside the event loop.** Calling `sjoin_nearest`, `to_crs`, or a `buffer` directly in an `async def` freezes the loop: while NumPy/GEOS holds the thread, no pending routing response can be awaited. The CPU-bound spatial work has to run *before* the loop, or be pushed to an executor.
4. **Ordering scrambled on gather.** `asyncio.gather` preserves the order of the *tasks* you pass it, but the moment you build tasks from a filtered subset, sort mid-stream, or key results by completion order, routed distances land against the wrong `site_id`. The join back to the portfolio must be by explicit key, never by position.

<svg viewBox="0 0 960 470" role="img" aria-label="Four root causes of a broken async interconnection screen mapped to their fixes. Unbounded gather exhausting sockets maps to a Semaphore-bounded dispatch. No timeout or retry maps to a per-request ClientTimeout with bounded exponential backoff. Blocking geopandas in the event loop maps to running the spatial prescreen before the loop and offloading any in-loop CPU work to an executor. Scrambled ordering maps to keying every routed result by site_id and joining back by that key. All four fixes converge on a ranked, order-safe feasibility table." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Async queue-screening failure causes mapped to their fixes</title>
  <desc>Left column lists four failure causes as warning nodes: unbounded gather exhausting sockets, no timeout or retry, blocking geopandas in the event loop, and scrambled result ordering. Each maps rightward to a neutral fix node: Semaphore-bounded dispatch, per-request ClientTimeout with bounded retry backoff, spatial prescreen run before the loop with CPU work offloaded to an executor, and results keyed by site_id joined back by key. All four fixes feed a single success node: a ranked, order-safe feasibility table.</desc>
  <defs>
    <style>
      .cause { fill:#FFE3BE; stroke:#F4A261; stroke-width:1.5; }
      .fix   { fill:#DCEEF6; stroke:#5BA8C8; stroke-width:1.5; }
      .good  { fill:#DDF0E2; stroke:#3D8B5F; stroke-width:1.5; }
      .lbl   { fill:currentColor; text-anchor:middle; }
      .edge  { stroke:currentColor; stroke-width:1.5; fill:none; opacity:0.85; }
      .ehead { fill:currentColor; stroke:none; opacity:0.85; }
      .col   { fill:currentColor; opacity:0.7; text-anchor:middle; font-weight:700; letter-spacing:0.6; }
    </style>
  </defs>
  <text x="170" y="28" class="col" font-size="11">FAILURE CAUSE</text>
  <text x="620" y="28" class="col" font-size="11">FIX STAGE</text>
  <!-- causes -->
  <rect class="cause" x="30" y="48"  width="280" height="66" rx="9"/>
  <rect class="cause" x="30" y="142" width="280" height="66" rx="9"/>
  <rect class="cause" x="30" y="236" width="280" height="66" rx="9"/>
  <rect class="cause" x="30" y="330" width="280" height="66" rx="9"/>
  <g class="lbl" font-size="12.5">
    <text x="170" y="76">Unbounded gather</text><text x="170" y="94">exhausts sockets / endpoint</text>
    <text x="170" y="170">No per-request</text><text x="170" y="188">timeout or retry</text>
    <text x="170" y="264">Blocking geopandas</text><text x="170" y="282">inside the event loop</text>
    <text x="170" y="358">Scrambled result</text><text x="170" y="376">ordering</text>
  </g>
  <!-- fixes -->
  <rect class="fix" x="470" y="48"  width="300" height="66" rx="9"/>
  <rect class="fix" x="470" y="142" width="300" height="66" rx="9"/>
  <rect class="fix" x="470" y="236" width="300" height="66" rx="9"/>
  <rect class="fix" x="470" y="330" width="300" height="66" rx="9"/>
  <g class="lbl" font-size="12.5">
    <text x="620" y="76">Semaphore-bounded</text><text x="620" y="94">dispatch</text>
    <text x="620" y="170">ClientTimeout +</text><text x="620" y="188">bounded retry backoff</text>
    <text x="620" y="264">Prescreen before loop;</text><text x="620" y="282">CPU work to executor</text>
    <text x="620" y="358">Key by site_id,</text><text x="620" y="376">join back by key</text>
  </g>
  <!-- cause -> fix edges -->
  <g class="edge">
    <line x1="310" y1="81"  x2="462" y2="81"/><path class="ehead" d="M462 76 L470 81 L462 86 Z"/>
    <line x1="310" y1="175" x2="462" y2="175"/><path class="ehead" d="M462 170 L470 175 L462 180 Z"/>
    <line x1="310" y1="269" x2="462" y2="269"/><path class="ehead" d="M462 264 L470 269 L462 274 Z"/>
    <line x1="310" y1="363" x2="462" y2="363"/><path class="ehead" d="M462 358 L470 363 L462 368 Z"/>
  </g>
  <!-- success node -->
  <rect class="good" x="800" y="188" width="132" height="90" rx="10"/>
  <g class="lbl" font-size="12.5">
    <text x="866" y="222">Ranked,</text><text x="866" y="240">order-safe</text><text x="866" y="258">feasibility table</text>
  </g>
  <!-- fixes -> success -->
  <g class="edge">
    <path d="M770 81  C 786 81, 792 200, 798 218"/>
    <path d="M770 175 C 784 175, 788 210, 798 224"/>
    <path d="M770 269 C 784 269, 788 244, 798 238"/>
    <path d="M770 363 C 786 363, 792 268, 798 250"/>
    <path class="ehead" d="M793 214 L800 222 L791 224 Z"/>
  </g>
</svg>

## Pre-Flight Validation

Before a single routing call is made, confirm the portfolio and the grid layer are screenable. A projected, meter-based frame is non-negotiable for distance work — enforce [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) up front so the straight-line prescreen and the routed distances share one metric. The validator surfaces the disqualifying condition with a precise message instead of letting it corrupt the ranking silently.

```python
import geopandas as gpd


def preflight_screen_inputs(
    sites_gdf: gpd.GeoDataFrame,
    grid_gdf: gpd.GeoDataFrame,
    target_epsg: int = 32610,
) -> None:
    """Fail fast on the conditions that would corrupt a queue screen."""
    for name, gdf in (("sites", sites_gdf), ("grid", grid_gdf)):
        if gdf.crs is None:
            raise ValueError(f"{name} layer has no CRS; distances undefined.")
        if gdf.crs.is_geographic:
            raise ValueError(
                f"{name} layer is geographic ({gdf.crs.to_epsg()}); reproject "
                f"to a projected metre frame such as EPSG:{target_epsg}."
            )
        if gdf.crs.to_epsg() != target_epsg:
            raise ValueError(
                f"{name} CRS EPSG:{gdf.crs.to_epsg()} != target EPSG:{target_epsg}."
            )
    missing = {"site_id"} - set(sites_gdf.columns)
    if missing:
        raise ValueError(f"sites layer missing required columns: {missing}")
    if "available_capacity_mw" not in grid_gdf.columns:
        raise ValueError("grid layer missing 'available_capacity_mw' for headroom merge.")
    if not sites_gdf["site_id"].is_unique:
        raise ValueError("site_id is not unique; the routed-distance join would be ambiguous.")
```

The `site_id` uniqueness check is the guard against cause 4 before the pipeline even starts: if the key you plan to join routed distances back on is not unique, no amount of order preservation downstream will save you.

## Straight-Line Prescreen with a Spatial Join

Never route every leg. The straight-line distance is cheap and, for most sites, it is the answer — a candidate that sits 800 m from an unobstructed conductor does not need a network solve. Use `sjoin_nearest` (Shapely 2.x / GeoPandas ≥ 0.14) to attach the nearest grid feature and its planar distance to every site in one vectorized call, then flag only the legs that cross a known barrier layer for the async router. This is the same nearest-feature logic detailed in [vectorized nearest-substation search with a KDTree](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/vectorized-nearest-substation-search-with-a-kdtree/); `sjoin_nearest` wraps it with the attribute join the screen needs.

The straight-line distance between a site and a grid vertex in the projected frame is the ordinary Euclidean metric,

$$ d_{\text{sl}} = \sqrt{(x_s - x_g)^2 + (y_s - y_g)^2}\,, $$

which is only valid because both layers are in metres. This spatial work is CPU-bound and runs **before** the event loop opens — cause 3 is designed out by keeping it out of any `async def`.

```python
import geopandas as gpd


def straight_line_prescreen(
    sites_gdf: gpd.GeoDataFrame,
    grid_gdf: gpd.GeoDataFrame,
    barriers_gdf: gpd.GeoDataFrame,
    obstruct_radius_m: float = 1_500.0,
) -> gpd.GeoDataFrame:
    """Attach nearest-grid distance, then flag legs crossing a barrier as obstructed."""
    nearest = gpd.sjoin_nearest(
        sites_gdf, grid_gdf[["available_capacity_mw", "geometry"]],
        how="left", distance_col="straight_line_m",
    ).reset_index(drop=True)

    # A leg is 'obstructed' if a barrier lies within the corridor to the grid.
    corridor = nearest.geometry.buffer(obstruct_radius_m)
    hit = gpd.GeoDataFrame(geometry=corridor, crs=nearest.crs).sjoin(
        barriers_gdf[["geometry"]], how="left", predicate="intersects"
    )
    nearest["obstructed"] = hit["index_right"].notna().to_numpy()
    return nearest
```

Everything with `obstructed == False` keeps its `straight_line_m` as the interconnection distance. Only the obstructed subset — typically a small fraction of the portfolio — is handed to the router, which is what makes the async stage affordable.

## Async Proximity Scoring for Obstructed Legs

This is the corrected async client. It fixes causes 1, 2, and 4 together: an `asyncio.Semaphore` caps in-flight requests regardless of portfolio size, an `aiohttp.ClientTimeout` plus bounded exponential-backoff retry contains slow and transient-failure legs, and every result is returned keyed by `site_id` so the join back is by key, never by position. Failed legs degrade to `inf` (infeasible) rather than aborting the run.

```python
import asyncio
import aiohttp
from typing import Dict


async def _route_one(
    site_id: str, x: float, y: float, endpoint: str,
    session: aiohttp.ClientSession, sem: asyncio.Semaphore,
    retries: int = 3,
) -> tuple[str, float]:
    payload = {"origin": [x, y], "mode": "grid_tie"}
    for attempt in range(retries):
        try:
            async with sem:  # bound concurrency: never more than N in flight
                async with session.post(endpoint, json=payload) as resp:
                    resp.raise_for_status()
                    data = await resp.json()
                    return site_id, float(data.get("distance_m", float("inf")))
        except (aiohttp.ClientError, asyncio.TimeoutError):
            if attempt == retries - 1:
                return site_id, float("inf")           # degrade, do not raise
            await asyncio.sleep(0.5 * 2 ** attempt)     # bounded backoff


async def resolve_obstructed_distances(
    obstructed: Dict[str, tuple[float, float]],
    endpoint: str,
    max_concurrency: int = 24,
    request_timeout_s: float = 10.0,
) -> Dict[str, float]:
    """Return {site_id: routed_distance_m}, order-independent and bounded."""
    sem = asyncio.Semaphore(max_concurrency)
    timeout = aiohttp.ClientTimeout(total=request_timeout_s)
    connector = aiohttp.TCPConnector(limit=max_concurrency)
    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
        tasks = [
            _route_one(sid, xy[0], xy[1], endpoint, session, sem)
            for sid, xy in obstructed.items()
        ]
        pairs = await asyncio.gather(*tasks)   # exceptions already handled inside
    return dict(pairs)
```

`TCPConnector(limit=max_concurrency)` and the `Semaphore` are deliberately set to the same ceiling: the connector caps the socket pool and the semaphore caps scheduled work, so neither the endpoint nor the file-descriptor table is ever swamped. Returning a `dict` keyed on `site_id` — rather than a positional list — is what structurally prevents the scrambled-ordering failure.

## Merging Capacity Headroom and Ranking the Queue

A distance alone does not rank an interconnection queue; a site 3 km from a saturated feeder is worse than one 6 km from a feeder with spare thermal capacity. Merge the routed and straight-line distances into a single `interconnection_m` column, join the [thermal headroom for interconnection screening](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/modeling-thermal-headroom-for-interconnection-screening/) already attached from the nearest asset, and compute a weighted feasibility score

$$ S_i = w_d\left(1 - \frac{d_i}{d_{\max}}\right) + w_h\,\frac{H_i}{H_{\max}}\,, $$

where $d_i$ is the interconnection distance, $H_i$ the available headroom in MW, and $w_d + w_h = 1$. The rank is stable and every input row survives — no filter drops a site without recording why.

```python
import numpy as np
import pandas as pd


def rank_queue(
    prescreened: pd.DataFrame,
    routed: dict[str, float],
    w_dist: float = 0.6,
    w_head: float = 0.4,
) -> pd.DataFrame:
    df = prescreened.copy()
    # Obstructed legs take the routed distance; clear legs keep straight-line.
    routed_series = df["site_id"].map(routed)          # join BY KEY, not position
    df["interconnection_m"] = np.where(
        df["obstructed"], routed_series, df["straight_line_m"]
    )
    d_max = df["interconnection_m"].replace(np.inf, np.nan).max()
    h_max = df["available_capacity_mw"].max()
    dist_term = 1.0 - (df["interconnection_m"] / d_max)
    head_term = df["available_capacity_mw"] / h_max
    df["feasibility_score"] = (
        w_dist * dist_term.clip(lower=0) + w_head * head_term.clip(lower=0)
    ).where(np.isfinite(df["interconnection_m"]), 0.0)

    df = df.sort_values("feasibility_score", ascending=False, kind="stable")
    df["queue_rank"] = np.arange(1, len(df) + 1)
    df["audit_timestamp"] = pd.Timestamp.utcnow().isoformat()
    return df
```

Export the result as GeoParquet or CSV; the `audit_timestamp`, the weights, and the retained `obstructed` flag are the lineage that lets a reviewer reproduce the ranking exactly.

## Fallback Routing and Performance Tuning

- **Tune `max_concurrency` to the endpoint, not the portfolio.** The right ceiling is the routing service's published rate limit, typically 16–32. Raising it to chase throughput on a strict endpoint just trades socket exhaustion for 429s.
- **Cache identical origins.** Parcels that share a centroid or snap to the same grid node produce identical routing payloads; memoize on the rounded `(x, y)` so duplicate legs cost one call, not many.
- **Offload any unavoidable in-loop CPU work.** If a leg needs an on-the-fly cost-surface solve, wrap it in `loop.run_in_executor(None, solve_fn)` so the GEOS/NumPy call never blocks the event loop mid-batch.
- **Prescreen aggressively.** Widen the barrier test only where terrain genuinely obstructs; every leg you keep as straight-line is one the router never has to serve.
- **Snapshot partial results.** Persist the routed `dict` to disk as it fills so a mid-run endpoint outage resumes from the last completed leg instead of re-routing the whole obstructed subset.

## Downstream Integrity Assertion

Gate the ranked table in CI/CD before it reaches a development committee. The assertion catches the two silent regressions this pipeline is built to prevent — a scrambled or dropped join, and a distance that leaked through as `NaN` — plus rank monotonicity.

```python
import numpy as np
import pandas as pd


def assert_queue_integrity(ranked: pd.DataFrame, n_input_sites: int) -> None:
    """CI/CD gate: fail the build if the screen is not decision-grade."""
    assert len(ranked) == n_input_sites, "row count changed — a site was dropped or duplicated"
    assert ranked["site_id"].is_unique, "duplicate site_id — join scrambled the portfolio"
    feasible = ranked.loc[ranked["feasibility_score"] > 0, "interconnection_m"]
    assert not feasible.isna().any(), "NaN interconnection distance on a feasible row"
    assert ranked["feasibility_score"].between(0.0, 1.0).all(), "score out of [0, 1] bounds"
    ranks = ranked["queue_rank"].to_numpy()
    assert np.array_equal(ranks, np.arange(1, len(ranked) + 1)), "queue_rank is not contiguous"
    assert ranked["feasibility_score"].is_monotonic_decreasing, "rank not aligned to score"
```

Asserting `len(ranked) == n_input_sites` is the single most valuable line: it fails loudly the instant an `sjoin` fan-out or a mis-keyed merge changes the portfolio size, catching the ordering failure that would otherwise ship a plausible-looking but wrong queue ranking.

## Related

- [Proximity Distance Calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) — the parent workflow this end-to-end screen assembles into a pipeline.
- [Vectorized Nearest-Substation Search with a KDTree](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/vectorized-nearest-substation-search-with-a-kdtree/) — the nearest-feature engine behind the straight-line prescreen.
- [Modeling Thermal Headroom for Interconnection Screening](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/modeling-thermal-headroom-for-interconnection-screening/) — the capacity term that turns a distance into a feasibility rank.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — the projected-frame discipline every distance in this screen depends on.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "Automate Interconnection Queue Screening with Async Proximity Scoring",
  "description": "An end-to-end Python pipeline that screens a portfolio of candidate sites against the grid: validate and project inputs, prescreen straight-line distances, async-route only the obstructed legs with a bounded aiohttp client, merge thermal headroom, and export a ranked feasibility table.",
  "step": [
    { "@type": "HowToStep", "position": 1, "name": "Validate and Project the Candidate Portfolio", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/automating-interconnection-queue-screening-with-async-proximity-scoring/#pre-flight-validation" },
    { "@type": "HowToStep", "position": 2, "name": "Prescreen Straight-Line Distances with a Spatial Join", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/automating-interconnection-queue-screening-with-async-proximity-scoring/#straight-line-prescreen-with-a-spatial-join" },
    { "@type": "HowToStep", "position": 3, "name": "Score Obstructed Legs with a Bounded Async Router", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/automating-interconnection-queue-screening-with-async-proximity-scoring/#async-proximity-scoring-for-obstructed-legs" },
    { "@type": "HowToStep", "position": 4, "name": "Merge Capacity Headroom and Rank the Queue", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/automating-interconnection-queue-screening-with-async-proximity-scoring/#merging-capacity-headroom-and-ranking-the-queue" }
  ]
}
</script>
