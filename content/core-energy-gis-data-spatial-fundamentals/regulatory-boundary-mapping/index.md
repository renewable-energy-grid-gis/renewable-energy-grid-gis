# Regulatory Boundary Mapping

Regulatory boundary mapping is the spatial filter that decides whether a renewable energy project is legally siteable before a single capacity-factor calculation runs. The failure mode this workflow exists to eliminate is the *silent jurisdictional overlap*: a wind or solar footprint that passes resource screening but quietly straddles a federal conservation unit, a county setback ordinance, and a municipal zoning overlay that each carry incompatible constraints. Naive scripts that union a handful of downloaded shapefiles produce a mask that *looks* authoritative but resolves overlaps in load order rather than by statutory precedence — so the same input data yields a different buildable area on every run. This article sits within the [Core Energy-GIS Data & Spatial Fundamentals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/) workflow and specifies a deterministic pipeline that ingests heterogeneous boundary sources, enforces topological and projection integrity, and emits a single reproducible compliance mask that downstream siting code can consume without ambiguity.

The hard part is not drawing polygons — it is reconciling boundaries that are published by different authorities, in different projections, on different update cadences, with overlapping and sometimes contradictory legal effect. A robust pipeline must therefore treat precedence as a first-class input, validate geometry before any overlay, and record provenance for every constraint so that a permitting reviewer can trace exactly which dataset and which statute produced an exclusion.

## Why Naive Boundary Unions Fail

Three compounding failure paths corrupt regulatory masks in production, and none of them raise an exception — they return plausible but wrong geometry.

1. **Precedence collapse.** A plain `pandas.concat` followed by `unary_union` flattens every jurisdiction into one undifferentiated exclusion layer. Once dissolved, you can no longer tell whether a parcel is excluded by a hard federal prohibition or a negotiable municipal setback, and the buildable area depends on which file loaded last.
2. **Projection drift.** Boundaries arrive in legacy state plane feet, geographic [coordinate reference systems](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) (EPSG:4326), and assorted UTM zones. Overlaying layers that disagree on CRS yields geometrically invalid intersections and area metrics that can be off by double-digit percentages — fatal when a setback is measured in meters.
3. **Topological invalidity.** Self-intersecting rings, slivers, and multipart features published by municipal GIS departments silently poison `intersection` and `buffer` operations, producing empty or exploded geometries that a downstream join treats as "no constraint."

The diagram below traces how a single mismatched source propagates through an unguarded pipeline into a corrupt mask.

<svg viewBox="0 0 760 240" role="img" aria-label="Three boundary sources in mismatched coordinate reference systems — federal EPSG:4269, state EPSG:2226 state-plane feet, and municipal EPSG:4326 — feed an unguarded hierarchical dissolve that flattens statutory precedence and emits a load-order-dependent compliance mask." xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-width:760px;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="760" height="240"/>
  <title>How a mismatched source corrupts an unguarded boundary union</title>
  <desc>Three source layers on the left arrive in different coordinate reference systems: a federal conservation layer in EPSG:4269, state setbacks in EPSG:2226 state-plane feet, and municipal zoning in EPSG:4326. All three flow into a single unguarded hierarchical-dissolve stage that flattens precedence, producing a compliance mask in EPSG:5070 GeoParquet whose buildable area depends on file load order rather than statute.</desc>
  <defs>
    <marker id="rbm-fail-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
    </marker>
  </defs>
  <g fill="#1F3A60" font-size="12.5" text-anchor="middle">
    <rect x="16" y="20" width="180" height="56" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="106" y="44" font-weight="600">Federal conservation</text>
    <text x="106" y="62" font-size="11.5">EPSG:4269 (NAD83)</text>
    <rect x="16" y="96" width="180" height="56" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="106" y="120" font-weight="600">State setbacks</text>
    <text x="106" y="138" font-size="11.5">EPSG:2226 ftUS</text>
    <rect x="16" y="172" width="180" height="56" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="106" y="196" font-weight="600">Municipal zoning</text>
    <text x="106" y="214" font-size="11.5">EPSG:4326</text>
    <rect x="300" y="80" width="176" height="88" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="388" y="110" font-weight="600">Hierarchical dissolve</text>
    <text x="388" y="128" font-size="11.5">(unguarded merge)</text>
    <text x="388" y="146" font-size="11.5">precedence flattened</text>
    <rect x="560" y="88" width="184" height="72" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="652" y="112" font-weight="600">Compliance mask</text>
    <text x="652" y="130" font-size="11.5">EPSG:5070 · GeoParquet</text>
    <text x="652" y="148" font-size="11.5">load-order dependent</text>
  </g>
  <g stroke="currentColor" stroke-width="1.6" fill="none" color="#5BA8C8">
    <line x1="196" y1="48" x2="300" y2="104" marker-end="url(#rbm-fail-arrow)"/>
    <line x1="196" y1="124" x2="300" y2="124" marker-end="url(#rbm-fail-arrow)"/>
    <line x1="196" y1="200" x2="300" y2="144" marker-end="url(#rbm-fail-arrow)"/>
    <line x1="476" y1="124" x2="560" y2="124" marker-end="url(#rbm-fail-arrow)"/>
  </g>
</svg>

The fix is structural: carry a `precedence` rank and a `jurisdiction_type` attribute through every stage, reproject at the ingestion boundary rather than at overlay time, and gate every geometry through a validity check before it reaches the dissolve.

## Prerequisites & Data Requirements

This workflow assumes the following inputs and library baseline:

- **Target projection:** an equal-area CRS for any analysis that compares areas or applies metric setbacks. For continental US portfolios use `EPSG:5070` (CONUS Albers); for a single project use the local UTM zone (e.g. `EPSG:32610`). Never compute setbacks in `EPSG:4326` — degrees are not meters.
- **Input geometries:** `Polygon` and `MultiPolygon` only. Line and point sources (e.g. a transmission centerline) must be buffered to polygons before they enter the mask; that buffering belongs in [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/), not here.
- **Authoritative sources:** federal layers from `EPSG:4269` (NAD83) registries, state public utility commission setback layers (often state plane feet), and municipal zoning, frequently sourced through aggregated [open energy data portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/). Each source needs a stable URL and a published checksum.
- **Library versions:** `geopandas >= 0.14`, `shapely >= 2.0` (the vectorized engine that absorbed the former `pygeos` project), `pyproj >= 3.4`, and `pyarrow` for GeoParquet output. `aiohttp` is used for concurrent ingestion.
- **A precedence schema:** every source must be tagged with an integer `precedence` (higher wins) and a `jurisdiction_type` string before processing. This is the single most important input and cannot be inferred from geometry.

A useful sanity check on projection choice: an equal-area projection preserves the area integral

$$A = \iint_{\Omega} dx\,dy$$

so that a 500 m statutory setback ring around a protected parcel encloses the same physical hectares everywhere in the analysis extent — a guarantee that conformal or geographic CRS definitions do not provide.

## Core Implementation

The pipeline below ingests sources asynchronously with integrity checks, enforces explicit CRS alignment and geometry validity at the ingestion boundary, then resolves overlaps by statutory precedence rather than load order. Variable names are kept specific to the regulatory-boundary domain.

```python
import asyncio
import io
import logging
import hashlib
from pathlib import Path

import aiohttp
import geopandas as gpd
import pandas as pd
from shapely.validation import make_valid

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

TARGET_EPSG = 5070            # CONUS Albers equal-area for setback-accurate masks
CHUNK_ROWS = 5_000           # rows per memory chunk for statewide layers
OUTPUT_DIR = Path("compliance_masks")
OUTPUT_DIR.mkdir(exist_ok=True)


async def fetch_boundary(session: aiohttp.ClientSession, url: str, expected_sha256: str) -> bytes:
    """Fetch one boundary file with retry/backoff and cryptographic integrity verification."""
    for attempt in range(4):
        try:
            timeout = aiohttp.ClientTimeout(total=30)
            async with session.get(url, timeout=timeout) as resp:
                resp.raise_for_status()
                payload = await resp.read()
            digest = hashlib.sha256(payload).hexdigest()
            if digest != expected_sha256:
                raise ValueError(f"Checksum mismatch for {url}: expected {expected_sha256}, got {digest}")
            return payload
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            wait = 2 ** attempt
            logging.warning("Retry %d for %s after %s (sleeping %ss)", attempt + 1, url, exc, wait)
            await asyncio.sleep(wait)
    raise RuntimeError(f"Exhausted retries fetching {url}")


def align_and_validate(boundary_gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Enforce explicit CRS alignment and topological validity at the ingestion boundary."""
    if boundary_gdf.crs is None:
        raise ValueError("Source CRS undefined; refusing to reproject blindly.")
    if boundary_gdf.crs.to_epsg() != TARGET_EPSG:
        boundary_gdf = boundary_gdf.to_crs(epsg=TARGET_EPSG)

    invalid = ~boundary_gdf.geometry.is_valid
    if invalid.any():
        logging.warning("Repairing %d invalid geometries.", int(invalid.sum()))
        boundary_gdf.loc[invalid, "geometry"] = boundary_gdf.loc[invalid, "geometry"].apply(make_valid)
    # Drop anything that survived repair as a non-polygonal remnant.
    boundary_gdf = boundary_gdf[boundary_gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    return boundary_gdf[boundary_gdf.geometry.is_valid].copy()


def resolve_by_precedence(boundary_gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Resolve overlaps by statutory precedence so the mask is independent of load order.

    Higher `precedence` wins. Lower-ranked geometry is differenced out of the area
    already claimed by higher-ranked jurisdictions, preserving per-tier provenance.
    """
    ranked = boundary_gdf.sort_values("precedence", ascending=False)
    claimed = None
    resolved = []
    for _, tier in ranked.groupby("precedence", sort=False):
        tier_union = tier.union_all()
        if claimed is not None:
            tier_union = tier_union.difference(claimed)
        tier_out = tier.copy()
        tier_out["geometry"] = tier_out.geometry.intersection(tier_union)
        resolved.append(tier_out[~tier_out.geometry.is_empty])
        claimed = tier_union if claimed is None else claimed.union(tier_union)
    return gpd.GeoDataFrame(pd.concat(resolved, ignore_index=True), crs=f"EPSG:{TARGET_EPSG}")


async def build_regulatory_mask(sources: dict[str, dict]) -> gpd.GeoDataFrame:
    """Orchestrate async ingestion, alignment, precedence resolution, and deterministic export."""
    async with aiohttp.ClientSession() as session:
        payloads = await asyncio.gather(*[
            fetch_boundary(session, src["url"], src["sha256"]) for src in sources.values()
        ])

    frames = []
    for (name, src), raw in zip(sources.items(), payloads):
        layer = gpd.read_file(io.BytesIO(raw))
        layer["jurisdiction_type"] = src["jurisdiction_type"]
        layer["precedence"] = src["precedence"]
        layer["source_id"] = name
        layer["source_sha256"] = src["sha256"]
        frames.append(align_and_validate(layer))

    boundaries = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs=f"EPSG:{TARGET_EPSG}")
    mask = resolve_by_precedence(boundaries)

    out_path = OUTPUT_DIR / "regulatory_compliance_mask.parquet"
    mask.to_parquet(out_path, index=False)
    logging.info("Wrote %d resolved exclusion features to %s", len(mask), out_path)
    return mask


# asyncio.run(build_regulatory_mask({
#     "federal_conservation": {"url": "https://...", "sha256": "...", "jurisdiction_type": "federal",   "precedence": 30},
#     "state_setbacks":       {"url": "https://...", "sha256": "...", "jurisdiction_type": "state",     "precedence": 20},
#     "municipal_zoning":     {"url": "https://...", "sha256": "...", "jurisdiction_type": "municipal", "precedence": 10},
# }))
```

The `resolve_by_precedence` routine is the deterministic core: because it differences each tier against the area already claimed by higher-ranked jurisdictions, the output is invariant to the order in which sources are fetched, and every output feature still carries its `jurisdiction_type`, `source_id`, and `source_sha256` for audit.

<svg viewBox="0 0 760 264" role="img" aria-label="Three overlapping jurisdictional exclusion polygons — federal precedence 30, state precedence 20, municipal precedence 10 — are resolved by precedence into a single non-overlapping compliance mask in which each lower tier is differenced against higher-ranked area, and every resolved feature retains its source_id and sha256 provenance." xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-width:760px;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="760" height="264"/>
  <title>Resolving overlapping exclusions by statutory precedence</title>
  <desc>On the left, three overlapping polygons represent federal (precedence 30), state (precedence 20), and municipal (precedence 10) exclusions whose areas conflict. The resolve_by_precedence step on the right differences each lower tier against the area already claimed by higher-ranked jurisdictions, yielding three mutually exclusive bands: federal claimed in full, state minus federal, and municipal minus the union of state and federal. Each resolved feature keeps its jurisdiction_type, source_id, and source_sha256 provenance.</desc>
  <defs>
    <marker id="rbm-resolve-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
    </marker>
  </defs>
  <text x="140" y="22" fill="#1F3A60" font-size="12.5" text-anchor="middle" font-weight="600">Overlapping exclusions</text>
  <g fill-opacity="0.55">
    <circle cx="120" cy="96" r="48" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <circle cx="160" cy="154" r="48" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <circle cx="95" cy="156" r="48" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  </g>
  <g fill="#1F3A60" font-size="11.5" text-anchor="middle">
    <text x="120" y="50" font-weight="600">Federal · p30</text>
    <text x="46" y="210" font-weight="600">Municipal · p10</text>
    <text x="206" y="206" font-weight="600">State · p20</text>
  </g>
  <rect x="266" y="100" width="168" height="64" rx="8" fill="#F4F7FB" stroke="#9DB2C9" stroke-width="1.2"/>
  <g fill="#1F3A60" font-size="12" text-anchor="middle">
    <text x="350" y="120" font-weight="600">resolve_by_precedence()</text>
    <text x="350" y="138" font-size="11">higher rank wins;</text>
    <text x="350" y="153" font-size="11">lower tier differenced out</text>
  </g>
  <g stroke="currentColor" stroke-width="1.6" fill="none" color="#5BA8C8">
    <line x1="206" y1="132" x2="266" y2="132" marker-end="url(#rbm-resolve-arrow)"/>
    <line x1="434" y1="132" x2="470" y2="132" marker-end="url(#rbm-resolve-arrow)"/>
  </g>
  <text x="595" y="22" fill="#1F3A60" font-size="12.5" text-anchor="middle" font-weight="600">Non-overlapping mask</text>
  <g fill="#1F3A60" font-size="12.5" text-anchor="middle">
    <rect x="470" y="36" width="250" height="52" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="595" y="58" font-weight="600">Federal exclusion · p30</text>
    <text x="595" y="76" font-size="11">claimed in full</text>
    <rect x="470" y="96" width="250" height="52" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <text x="595" y="118" font-weight="600">State setback · p20</text>
    <text x="595" y="136" font-size="11">minus federal area</text>
    <rect x="470" y="156" width="250" height="52" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="595" y="178" font-weight="600">Municipal zoning · p10</text>
    <text x="595" y="196" font-size="11">minus state ∪ federal</text>
  </g>
  <text x="380" y="240" fill="#1F3A60" font-size="11" text-anchor="middle">Each resolved feature retains its jurisdiction_type · source_id · sha256 provenance</text>
</svg>

## Error Handling & Edge Cases

Each of the three failure paths named above gets an explicit guard.

**Precedence collapse — refuse untagged sources.** If a source reaches the resolver without a `precedence` rank, the dissolve order becomes meaningless. Fail fast rather than emit a non-deterministic mask:

```python
def assert_precedence_schema(boundary_gdf: gpd.GeoDataFrame) -> None:
    required = {"precedence", "jurisdiction_type", "source_id"}
    missing = required - set(boundary_gdf.columns)
    if missing:
        raise ValueError(f"Sources missing precedence schema columns: {sorted(missing)}")
    if boundary_gdf["precedence"].isna().any():
        bad = boundary_gdf.loc[boundary_gdf["precedence"].isna(), "source_id"].unique()
        raise ValueError(f"Null precedence for sources: {list(bad)}")
```

**Projection drift — detect a CRS-of-convenience.** A source that *claims* `EPSG:4326` but carries coordinates in the thousands is mislabeled state plane. A cheap bounds check catches it before it reaches `to_crs`:

```python
def detect_mislabeled_crs(boundary_gdf: gpd.GeoDataFrame) -> None:
    if boundary_gdf.crs and boundary_gdf.crs.is_geographic:
        minx, miny, maxx, maxy = boundary_gdf.total_bounds
        if not (-180 <= minx <= 180 and -90 <= miny <= 90 and abs(maxx) <= 180 and abs(maxy) <= 90):
            raise ValueError(
                f"CRS declares geographic but bounds {boundary_gdf.total_bounds} are projected. "
                "Reassign the true source CRS before reprojecting."
            )
```

This is the same class of CRS bug covered in depth by [spatial data quality validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/); catch it at ingestion rather than after the overlay has already produced wrong areas.

**Topological invalidity — quarantine, don't crash.** When `make_valid` cannot rescue a feature (degenerate ring, zero-area sliver), route it to a quarantine layer for manual review instead of silently dropping a real constraint:

```python
def quarantine_invalid(boundary_gdf: gpd.GeoDataFrame) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    repaired = boundary_gdf.copy()
    repaired["geometry"] = repaired.geometry.apply(make_valid)
    keep = repaired.geometry.is_valid & ~repaired.geometry.is_empty
    return repaired[keep].copy(), boundary_gdf[~keep].copy()
```

A non-empty quarantine layer is a signal to the data steward, not a number to ignore — a dropped federal exclusion is a permitting liability.

## Performance & Scalability

Statewide zoning and federal conservation catalogs routinely exceed available RAM when loaded as a single GeoDataFrame, and pairwise overlay against thousands of project footprints is the dominant cost.

<svg viewBox="0 0 940 440" role="img" aria-label="How much of a 100 hectare rectangular parcel survives each additional statutory setback. A 30 metre road setback leaves 88.6 hectares; adding a 60 metre dwelling setback on one edge leaves 77.2; adding a 90 metre wetland buffer leaves 66.9; adding a 150 metre property-line setback for turbines leaves 49.4 — less than half the parcel — and the order the setbacks are applied in does not change the result only because they are unioned before subtraction rather than subtracted one at a time." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Each statutory setback takes another bite out of the buildable envelope</title>
  <desc>On the left, a plan view of a 1000 by 1000 metre parcel with four setback bands drawn inward from its edges: a 30 metre road setback, a 60 metre dwelling setback, a 90 metre wetland buffer and a 150 metre turbine property-line setback, leaving a shrinking central buildable envelope. On the right, a bar chart of the hectares remaining after each band is applied: 88.6, 77.2, 66.9 and 49.4 hectares out of 100. A note records that the bands are unioned before subtraction so that overlapping jurisdictions are never counted twice.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="440"/>
  <defs><marker id="sb-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="26" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Buildable area after each setback band, on a 100 ha parcel</text>
  <rect x="44" y="64" width="280" height="280" rx="0" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
  <rect x="52.4" y="72.4" width="263.2" height="263.2" rx="0" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3" opacity="0.55"/>
  <rect x="60.8" y="80.8" width="246.4" height="246.4" rx="0" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3" opacity="0.55"/>
  <rect x="69.2" y="89.2" width="229.6" height="229.6" rx="0" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3" opacity="0.55"/>
  <rect x="86.0" y="106.0" width="196.0" height="196.0" rx="0" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3" opacity="0.55"/>
  <text x="184.0" y="208.0" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">buildable</text>
  <text x="44" y="56" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">1 000 m × 1 000 m parcel</text>
  <rect x="600" y="76" width="237.4" height="39.2" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="590" y="99.58" text-anchor="end" font-size="11" fill="currentColor">road 30 m</text>
  <text x="845.448" y="99.58" text-anchor="start" font-size="11.5" fill="currentColor">88.6 ha</text>
  <rect x="600" y="122.28" width="206.9" height="39.2" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="590" y="145.86" text-anchor="end" font-size="11" fill="currentColor">+ dwelling 60 m</text>
  <text x="814.896" y="145.86" text-anchor="start" font-size="11.5" fill="currentColor">77.2 ha</text>
  <rect x="600" y="168.56" width="179.3" height="39.2" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="590" y="192.14" text-anchor="end" font-size="11" fill="currentColor">+ wetland 90 m</text>
  <text x="787.292" y="192.14" text-anchor="start" font-size="11.5" fill="currentColor">66.9 ha</text>
  <rect x="600" y="214.84" width="132.4" height="39.2" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="590" y="238.42000000000002" text-anchor="end" font-size="11" fill="currentColor">+ turbine 150 m</text>
  <text x="740.392" y="238.42000000000002" text-anchor="start" font-size="11.5" fill="currentColor">49.4 ha</text>
  <text x="600" y="276" text-anchor="start" font-size="11" fill="currentColor" opacity="0.8">hectares remaining of 100</text>
  <rect x="44" y="366" width="876" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="482.0" y="387" text-anchor="middle" font-size="11.5" fill="currentColor">Union the bands, then subtract once. Subtracting them one at a time double-counts every overlap and</text>
  <text x="482.0" y="404" text-anchor="middle" font-size="11.5" fill="currentColor">leaves the answer dependent on the order the jurisdictions happened to be loaded in.</text>
</svg>

- **Chunked ingestion.** Stream large layers through `align_and_validate` in `CHUNK_ROWS`-sized slices so validation and reprojection never hold the full layer plus its transformed copy in memory simultaneously. For genuinely out-of-core work, `dask-geopandas` partitions the same logic across workers, but explicit row chunking is sufficient for most state-level masks.
- **Spatial indexing.** Build the R-tree (`boundary_gdf.sindex`) once before any point-in-polygon or overlay query. This drops proximity screening from O(N×M) toward near-linear and is the same index the [proximity and distance calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) workflow relies on.
- **Columnar I/O.** Persist intermediate and final masks as GeoParquet rather than shapefile. Predicate pushdown lets you read only the `jurisdiction_type` partitions a given screening run needs, and the format preserves CRS metadata that shapefile silently truncates.
- **Reproject once.** Transforming at the ingestion boundary (not per overlay) means each geometry crosses `pyproj` exactly one time; repeated `to_crs` calls inside a loop are the most common avoidable hotspot.

```python
def stream_align(layer: gpd.GeoDataFrame, chunk_rows: int = CHUNK_ROWS) -> gpd.GeoDataFrame:
    """Validate and reproject a large layer in bounded-memory slices, then index once."""
    parts = [align_and_validate(layer.iloc[i:i + chunk_rows].copy())
             for i in range(0, len(layer), chunk_rows)]
    out = gpd.GeoDataFrame(pd.concat(parts, ignore_index=True), crs=f"EPSG:{TARGET_EPSG}")
    _ = out.sindex  # materialize the R-tree before downstream overlay
    return out
```

For repeatable jurisdictional extraction at national scale — pulling county polygons on demand rather than caching every state — see [automating US county boundary extraction with OSMnx](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/automating-us-county-boundary-extraction-with-osmnx/), which handles the rate-limiting and fallback routing those bulk pulls require.

## Validation & Audit Trail

A regulatory mask is only defensible if a reviewer can reconstruct how it was built. Two assertions belong in every run, and both should emit structured log records that land in the project's permitting evidence store.

```python
def audit_mask(mask: gpd.GeoDataFrame) -> None:
    """Post-processing assertions that gate the mask before it informs siting decisions."""
    assert mask.crs.to_epsg() == TARGET_EPSG, "Mask drifted off the equal-area target CRS."
    assert mask.geometry.is_valid.all(), "Mask contains invalid geometry after resolution."
    assert {"jurisdiction_type", "source_id", "source_sha256"}.issubset(mask.columns), \
        "Mask lost provenance columns; cannot trace exclusions to source."

    # Non-overlap invariant: precedence resolution must leave tiers mutually exclusive.
    overlap_area = mask.union_all().area
    summed_area = mask.geometry.area.sum()
    assert abs(summed_area - overlap_area) / overlap_area < 1e-6, \
        "Resolved tiers still overlap; precedence resolution failed."

    logging.info(
        "Mask audit OK: %d features, %.1f km2 excluded, sources=%s",
        len(mask),
        mask.geometry.area.sum() / 1e6,
        sorted(mask["source_id"].unique()),
    )
```

The non-overlap invariant — that the summed per-feature area equals the area of the dissolved whole — is the machine-checkable proof that precedence resolution actually produced mutually exclusive tiers. Pair it with immutable, checksum-versioned mask outputs so that any siting decision can be replayed against the exact boundary state that produced it during an environmental review.


## Frequently asked questions

### Which boundary wins when two jurisdictions overlap?

The more restrictive one, unless statute says otherwise — and statute often does. A county setback
and a municipal setback over the same parcel are not alternatives to choose between; both apply, so
the buildable envelope is the parcel minus the union of both. Where a state pre-emption statute
overrides a local ordinance the precedence is reversed, which is why the precedence rule belongs in
configuration with a citation attached rather than in a hard-coded ordering.

### How current do boundary layers need to be?

Current enough that annexations since the last vintage cannot change which jurisdiction a parcel
sits in. In practice that means checking the vintage against the project's own timeline: a
TIGER/Line release lags annexations by up to a year, and a parcel annexed into a municipality during
that window is screened against the wrong ordinance. For a screening study the lag is acceptable if
recorded; for a permit submission it is not.

### Should setback distances be buffered from the parcel edge or from the feature?

From the feature, always. A 60 metre dwelling setback is a 60 metre buffer around the dwelling, not
a 60 metre inward offset from the parcel boundary — the two coincide only when the dwelling sits
exactly on the line. Buffering the parcel is faster and produces a plausible envelope, which is what
makes it a durable mistake; it under-states buildable area on large parcels and over-states it on
irregular ones.

### Why union the setback bands before subtracting them?

Because overlapping bands otherwise get subtracted twice, and the result depends on the order the
jurisdictions happened to load in. Unioning first makes the operation order-independent and removes
the double-count: a wetland buffer overlapping a dwelling setback removes the shared area once, not
twice. The difference on a real parcel is typically a few percent of buildable area — enough to move
a layout decision.

### How should a parcel that is entirely excluded be recorded?

As a zero-area result with the binding constraint named, not as a dropped row. A parcel that
disappears from the output is indistinguishable from a parcel that was never in the input, and the
question "why is this parcel not in the report" is one a landowner will eventually ask. Keeping the
row with `buildable_ha = 0` and `binding_constraint = 'wetland buffer'` answers it without a rerun.


### How should ordinances that reference a variable be encoded?

As a rule with its inputs, not as a distance. A setback of "three times the total turbine height"
is not 450 metres until a turbine model is chosen, and the same parcel changes its buildable area
when the model does. Encoding the rule keeps a layout study honest across machine options; encoding
the resolved distance silently freezes one option into the constraint layer.

### Do boundary changes require re-running historical screens?

Only when a decision still depends on them. A screen that supported a submitted application is a
record of what was true at submission and should not be quietly restated. What does need re-running
is anything still in flight — and the cheapest way to know which is which is to record the boundary
vintage with each screening output, so a boundary refresh can list exactly the studies it affects.


### Can a constraint layer be shared between projects?

The geometry can; the interpretation cannot. Two projects in the same county may face different
setbacks because their turbine models, land-use classifications or interconnection points differ, so
a shared exclusion layer that has already resolved those choices will be wrong for one of them. Share
the source boundaries and the ordinance rules, and let each project resolve them against its own
parameters at run time.

## Related

- [Core Energy-GIS Data & Spatial Fundamentals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/) — the parent workflow this stage feeds.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — projection selection and transformation that the ingestion guard depends on.
- [Open Energy Data Portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/) — programmatic sourcing of the boundary datasets ingested here.
- [Spatial Data Quality Validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) — geometry repair and CRS-label diagnostics in depth.
- [Automating US County Boundary Extraction with OSMnx](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/automating-us-county-boundary-extraction-with-osmnx/) — on-demand jurisdictional polygons for national portfolios.
- [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) — converting line and point infrastructure into the polygon constraints this mask consumes.
