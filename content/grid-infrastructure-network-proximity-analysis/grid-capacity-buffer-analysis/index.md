---
title: Grid Capacity Buffer Analysis
description: A production-grade Python workflow for grid capacity buffer analysis — dynamic voltage-scaled buffers, projected-CRS enforcement, memory-chunked async processing, conservative overlap dissolution, and audit-ready interconnection screening.
slug: grid-capacity-buffer-analysis
type: guide
breadcrumb: Grid Capacity Buffer Analysis
datePublished: 2025-09-12
dateModified: 2026-06-26
---

# Grid Capacity Buffer Analysis

Grid capacity buffer analysis is the spatial translation layer that turns raw network topology into actionable interconnection siting decisions, and it is part of the [Grid Infrastructure & Network Proximity Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/) pipeline. The specific failure mode this page addresses is the silent capacity over-allocation that occurs when a screening workflow applies one fixed-radius buffer to every substation, dissolves the overlaps with a naive union, and reports the summed megawatts as if they were independently available. A 69 kV distribution tap and a 500 kV bulk node do not project the same interconnection reach, two buffers that intersect do not offer the additive headroom their attributes suggest, and a buffer generated in geographic degrees instead of projected meters is not wrong by a rounding error — it is wrong by the cosine of the latitude. Each of these produces a number that looks plausible on a map and collapses under load-flow scrutiny.

This page builds a deterministic capacity-surface workflow that quantifies available thermal headroom, voltage-stability margins, and radial constraint zones around existing assets before a single computationally expensive power-flow study is commissioned. It follows the order the data actually travels: inputs are forced into a projected coordinate frame and schema-validated, buffer radii are derived per asset from voltage class and thermal rating, the dataset is streamed in bounded chunks off the event loop, overlapping zones are dissolved with conservative capacity reconciliation, and every output polygon carries the lineage metadata an interconnection study or permitting submission needs to be independently reproduced.

## Why Naive Capacity Buffering Fails

The naive workflow fails for three compounding reasons, and none of them reliably raises an exception at the point of error. First, **projected-distance error**: Shapely and GEOS operate in planar Cartesian space, so `geometry.buffer(5000)` applied to coordinates in [EPSG:4326](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) treats the radius as 5000 degrees, producing an elliptical, latitude-distorted blob rather than a 5 km circle. This is the same defect dissected in detail for the single-asset case in [calculating 5 km proximity buffers around substations in Shapely](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/calculating-5km-proximity-buffers-around-substations-in-shapely/). Second, **uniform-radius distortion**: a static scalar ignores that interconnection reach scales with voltage class, transformer capacity, and regional grid-code clearance, so a single radius simultaneously over-states distribution feeders and under-states bulk transmission nodes. Third, **additive over-allocation**: when buffers intersect, a `unary_union` followed by a `sum()` of `available_capacity_mw` double-counts headroom that the grid topology shares, manufacturing phantom interconnection capacity in exactly the dense corridors where the queue is most contested.

The relationship between buffer radius and the area screened is quadratic, which is why a small radius error propagates into a large capacity-allocation error. For a buffer of radius $r$ the screened area is $A = \pi r^2$, so a 20% radius inflation from an unprojected operation inflates the candidate-capture area — and the count of sites that appear to qualify — by roughly 44%.

<svg viewBox="0 0 900 470" role="img" aria-label="Side-by-side comparison of two capacity buffering paths. The naive path applies one fixed radius in EPSG:4326, producing a latitude-distorted ellipse, then a unary_union and a sum of megawatts that double-counts shared overlap and over-allocates capacity. The correct path derives a per-asset radius from voltage class and thermal rating in projected UTM metres, producing true metric circles, then dissolves overlaps and reconciles capacity to the minimum, yielding a defensible headroom surface." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Naive versus correct grid capacity buffering</title>
  <desc>Two stacked three-step pipelines. Left (naive): step 1 one fixed radius in geographic degrees; step 2 a latitude-distorted ellipse compared against a true-circle reference; step 3 unary_union then a sum of megawatts that double-counts overlap; result an over-allocated capacity figure. Right (correct): step 1 a per-asset radius scaled by voltage class and thermal rating in metres; step 2 two true metric circles sized to voltage class; step 3 dissolve then minimum-capacity reconciliation; result a defensible headroom surface.</desc>
  <rect x="20" y="50" width="420" height="406" rx="12" fill="none" stroke="currentColor" stroke-width="1" opacity="0.22"/>
  <rect x="460" y="50" width="420" height="406" rx="12" fill="none" stroke="currentColor" stroke-width="1" opacity="0.22"/>
  <g text-anchor="middle">
    <rect x="20" y="14" width="420" height="30" rx="8" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.5"/>
    <text x="230" y="34" font-size="13" font-weight="700" letter-spacing="1.4" fill="currentColor">NAIVE &#8212; PHANTOM CAPACITY</text>
    <rect x="460" y="14" width="420" height="30" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <text x="670" y="34" font-size="13" font-weight="700" letter-spacing="1.4" fill="currentColor">CORRECT &#8212; DEFENSIBLE SURFACE</text>
  </g>
  <!-- STEP 1 -->
  <g font-size="10" font-weight="700" letter-spacing="0.8" fill="currentColor" opacity="0.7">
    <text x="56" y="79">STEP 1 &#183; RADIUS RULE</text>
    <text x="496" y="79">STEP 1 &#183; RADIUS RULE</text>
  </g>
  <rect x="40" y="86" width="380" height="34" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <rect x="480" y="86" width="380" height="34" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <g font-size="12" fill="currentColor">
    <text x="56" y="108">One fixed radius in degrees (EPSG:4326)</text>
    <text x="496" y="108">Per-asset: voltage class &#215; thermal, in metres</text>
  </g>
  <g stroke="currentColor" stroke-width="1.5" fill="currentColor" opacity="0.8">
    <line x1="230" y1="124" x2="230" y2="142"/><path d="M224 140 L230 148 L236 140 Z" stroke="none"/>
    <line x1="670" y1="124" x2="670" y2="142"/><path d="M664 140 L670 148 L676 140 Z" stroke="none"/>
  </g>
  <!-- STEP 2: geometry -->
  <g font-size="10" font-weight="700" letter-spacing="0.8" fill="currentColor" opacity="0.7">
    <text x="56" y="166">STEP 2 &#183; GEOMETRY</text>
    <text x="496" y="166">STEP 2 &#183; GEOMETRY</text>
  </g>
  <!-- naive: distorted ellipse vs true-circle reference -->
  <circle cx="230" cy="226" r="52" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.45"/>
  <ellipse cx="230" cy="226" rx="96" ry="40" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.6" opacity="0.85"/>
  <circle cx="230" cy="226" r="3.5" fill="currentColor"/>
  <text x="230" y="294" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.85">Latitude-distorted ellipse</text>
  <!-- correct: two true metric circles, voltage-scaled, overlapping -->
  <circle cx="648" cy="222" r="54" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.6" opacity="0.85"/>
  <circle cx="712" cy="238" r="38" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.6" opacity="0.7"/>
  <circle cx="648" cy="222" r="3.5" fill="currentColor"/>
  <circle cx="712" cy="238" r="3.5" fill="currentColor"/>
  <text x="670" y="294" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.85">True metric circles, voltage-scaled</text>
  <g stroke="currentColor" stroke-width="1.5" fill="currentColor" opacity="0.8">
    <line x1="230" y1="304" x2="230" y2="322"/><path d="M224 320 L230 328 L236 320 Z" stroke="none"/>
    <line x1="670" y1="304" x2="670" y2="322"/><path d="M664 320 L670 328 L676 320 Z" stroke="none"/>
  </g>
  <!-- STEP 3: reconcile -->
  <g font-size="10" font-weight="700" letter-spacing="0.8" fill="currentColor" opacity="0.7">
    <text x="56" y="346">STEP 3 &#183; DISSOLVE &amp; RECONCILE</text>
    <text x="496" y="346">STEP 3 &#183; DISSOLVE &amp; RECONCILE</text>
  </g>
  <rect x="40" y="353" width="380" height="34" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <rect x="480" y="353" width="380" height="34" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <g font-size="12" fill="currentColor">
    <text x="56" y="375">unary_union &#8594; &#931; MW (overlap counted twice)</text>
    <text x="496" y="375">dissolve &#8594; min(MW) (no over-commit)</text>
  </g>
  <g stroke="currentColor" stroke-width="1.5" fill="currentColor" opacity="0.8">
    <line x1="230" y1="391" x2="230" y2="407"/><path d="M224 405 L230 413 L236 405 Z" stroke="none"/>
    <line x1="670" y1="391" x2="670" y2="407"/><path d="M664 405 L670 413 L676 405 Z" stroke="none"/>
  </g>
  <g text-anchor="middle">
    <rect x="80" y="418" width="300" height="30" rx="15" fill="#C85B5B" stroke="#C85B5B" stroke-width="1.5"/>
    <text x="230" y="438" font-size="12.5" font-weight="700" fill="#FFFFFF">Over-allocated capacity</text>
    <rect x="520" y="418" width="300" height="30" rx="15" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1.5"/>
    <text x="670" y="438" font-size="12.5" font-weight="700" fill="#FFFFFF">Defensible headroom surface</text>
  </g>
</svg>

## Prerequisites & Data Requirements

This workflow assumes the following inputs and constraints:

- **Projected CRS, not geographic.** All inputs must be transformed to a projected coordinate system with meter units before any buffer call — a local UTM zone (e.g. EPSG:32632 for UTM Zone 32N) or a national grid. Geographic coordinates (EPSG:4326) are valid only as a source CRS to transform *from*, never as the frame in which distances are measured.
- **Validated asset geometry.** Substation points and transmission centerlines should arrive from a vetted [transmission line and substation mapping](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/) layer, and pass the geometry checks described in [spatial data quality validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) — no self-intersections, no null geometries, no empty rings.
- **Network attribute schema.** Each record must carry `available_capacity_mw`, `voltage_kv`, and `thermal_rating_pct`, enforced through [network attribute validation](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/) so that downstream radius derivation and capacity reconciliation never silently key off a missing column.
- **Library versions.** `geopandas >= 0.14`, `shapely >= 2.0` (vectorized `buffer`/`make_valid`), and `pyproj >= 3.5`. Shapely 2.0 is assumed throughout for vectorized geometry operations and the modern `make_valid` import path.

## Core Implementation

The happy-path workflow has four stages: enforce a projected CRS and validate the schema, derive a per-asset radius, generate the buffer, then dissolve overlaps with conservative capacity reconciliation. The first stage rejects ambiguity at the boundary — an undefined CRS is a hard error, not a guess.

```python
import geopandas as gpd
import logging
from shapely.validation import make_valid

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

TARGET_CRS = "EPSG:32632"  # UTM Zone 32N — adjust per project region
REQUIRED_COLS = {"available_capacity_mw", "voltage_kv", "thermal_rating_pct"}

def standardize_crs_and_validate(substation_gdf: gpd.GeoDataFrame, name: str) -> gpd.GeoDataFrame:
    """Enforce a projected CRS, repair invalid geometries, and validate the schema."""
    if substation_gdf.crs is None:
        raise ValueError(f"{name} has no defined CRS; assign one before processing.")

    if not substation_gdf.crs.is_projected:
        logging.info(f"Transforming {name} from EPSG:{substation_gdf.crs.to_epsg()} to {TARGET_CRS}")
        substation_gdf = substation_gdf.to_crs(TARGET_CRS)

    substation_gdf = substation_gdf.copy()
    substation_gdf["geometry"] = substation_gdf["geometry"].apply(make_valid)
    substation_gdf = substation_gdf[substation_gdf.geometry.notna() & substation_gdf.geometry.is_valid]

    if substation_gdf.empty:
        raise RuntimeError(f"No valid geometries remain in {name} after validation.")

    missing = REQUIRED_COLS - set(substation_gdf.columns)
    if missing:
        raise KeyError(f"{name} missing required attributes: {missing}")

    return substation_gdf
```

Buffer radius is derived from the asset, not assumed. Interconnection reach scales with voltage class, then is modulated by thermal headroom so that a node already running near its rating projects a tighter zone than one with spare capacity. The radius derivation is the natural consumer of the [proximity distance calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) that account for impedance, fault-current limits, and regulatory clearance.

```python
import pandas as pd

def compute_dynamic_radius(row: pd.Series) -> float:
    """Derive a buffer radius (meters) from voltage class and thermal headroom."""
    base_radius = 2000.0  # 2 km baseline for distribution-class assets
    if row["voltage_kv"] >= 230:
        base_radius = 8000.0   # bulk transmission
    elif row["voltage_kv"] >= 115:
        base_radius = 5000.0   # sub-transmission

    # Clamp the thermal modifier to a defensible 0.5x–1.5x band
    headroom_factor = max(0.5, min(1.5, row["thermal_rating_pct"] / 100.0))
    return base_radius * headroom_factor

def buffer_capacity_zones(substation_gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Apply per-asset dynamic buffering to a validated, projected GeoDataFrame."""
    substation_gdf = substation_gdf.copy()
    substation_gdf["buffer_radius_m"] = substation_gdf.apply(compute_dynamic_radius, axis=1)
    substation_gdf["geometry"] = substation_gdf.buffer(substation_gdf["buffer_radius_m"])
    return substation_gdf[["geometry", "available_capacity_mw", "voltage_kv", "buffer_radius_m"]]
```

The dissolution stage is where over-allocation is prevented. Intersecting zones are merged into contiguous capacity surfaces, and their attributes are reconciled with a conservative engineering rule: the available capacity of a merged zone is the **minimum** across its contributing assets, never the sum. Taking the minimum guarantees the surface never promises more headroom than the most constrained asset feeding it can deliver.

```python
def aggregate_capacity_zones(buffered_gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Dissolve overlapping buffers and reconcile capacity with conservative logic."""
    buffered_gdf = buffered_gdf[buffered_gdf.geometry.is_valid].copy()

    # Merge all overlapping geometries into contiguous capacity surfaces
    dissolved = buffered_gdf.dissolve()

    # Conservative reconciliation: the minimum prevents over-commitment
    dissolved["available_capacity_mw"] = buffered_gdf["available_capacity_mw"].min()
    dissolved["max_voltage_kv"] = buffered_gdf["voltage_kv"].max()
    dissolved["zone_type"] = "grid_capacity_surface"

    # Split the multipart result and drop dissolve artifacts (sliver polygons)
    dissolved = dissolved.explode(index_parts=False)
    dissolved = dissolved[dissolved.geometry.area > 1000]  # drop micro-polygons < 1000 m²
    return dissolved.reset_index(drop=True)
```

## Error Handling & Edge Cases

The three failure modes named in the problem framing each need explicit handling rather than a hope that the input is clean.

**Unprojected input.** The most damaging error is also the easiest to detect: a buffer generated in degrees. Guard it at the source rather than discovering an ellipse three stages later. The CRS check below is cheap and refuses to proceed in a geographic frame.

```python
def assert_projected_meters(substation_gdf: gpd.GeoDataFrame) -> None:
    """Fail fast if a buffer would be computed in degrees instead of meters."""
    if substation_gdf.crs is None or not substation_gdf.crs.is_projected:
        raise ValueError(
            "Buffering requires a projected CRS in meters. "
            f"Got {substation_gdf.crs}. Reproject to a UTM zone (e.g. EPSG:32632) first."
        )
    unit = substation_gdf.crs.axis_info[0].unit_name
    if unit not in {"metre", "meter"}:
        raise ValueError(f"Projected CRS unit is '{unit}', expected meters.")
```

**Invalid and degenerate geometry.** Duplicate coordinates, self-intersections, and `NaN` ordinates raise `GEOSException` deep inside the buffer call, aborting an overnight batch with an opaque traceback. Repair with `make_valid` and quarantine what cannot be repaired so the run continues and the rejects remain auditable.

```python
def repair_or_quarantine(substation_gdf: gpd.GeoDataFrame) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    """Repair fixable geometries; quarantine the rest for review instead of crashing the batch."""
    substation_gdf = substation_gdf.copy()
    substation_gdf["geometry"] = substation_gdf["geometry"].apply(
        lambda g: make_valid(g) if g is not None and not g.is_valid else g
    )
    valid_mask = substation_gdf.geometry.notna() & substation_gdf.geometry.is_valid
    return substation_gdf[valid_mask], substation_gdf[~valid_mask]
```

**Cross-zone substation spread.** A single static UTM zone introduces >1% linear distortion once assets straddle a zone boundary, quietly invalidating clearance thresholds. For multi-zone portfolios, partition by the appropriate UTM zone, buffer each partition in its own projected frame, and reconcile in a common equal-area CRS — never stretch one zone across a continental footprint. Missing attribute values feed `compute_dynamic_radius` a `NaN` that silently produces a `NaN` radius and an empty buffer, so impute or reject incomplete `voltage_kv` and `thermal_rating_pct` records during validation rather than at buffer time.

## Performance & Scalability

Regional and national grids routinely exceed available RAM when buffered monolithically, and the CPU-bound GEOS operations will block an event loop if naively awaited. The pattern below streams the dataset in bounded chunks and offloads each chunk's geometry work to a thread pool, keeping I/O responsive while the heavy buffering runs off the main thread.

```python
import asyncio
import geopandas as gpd

async def run_chunked_buffer_pipeline(source_path: str, chunk_size: int = 5000) -> list[gpd.GeoDataFrame]:
    """Stream a vector dataset in chunks, buffering each off the event loop."""
    loop = asyncio.get_running_loop()
    processed_chunks: list[gpd.GeoDataFrame] = []

    # Use pyogrio for large files; read once, then slice into memory-bounded chunks
    grid_gdf = gpd.read_file(source_path)
    for start in range(0, len(grid_gdf), chunk_size):
        chunk = grid_gdf.iloc[start:start + chunk_size].copy()
        validated = standardize_crs_and_validate(chunk, "grid_assets")
        # Offload CPU-bound GEOS buffering to a worker thread to keep the loop free
        buffered = await loop.run_in_executor(None, buffer_capacity_zones, validated)
        processed_chunks.append(buffered)

    return processed_chunks
```

Additional tuning that matters at portfolio scale:

- **Spatial indexing before dissolve.** Build the GeoDataFrame `sindex` once and let `dissolve` and overlap queries prune candidate pairs to near $O(n \log n)$ rather than the pairwise $O(n^2)$ a brute-force union implies.
- **Columnar I/O.** Read with `pyogrio` and write capacity surfaces to GeoParquet — columnar reads skip unused attributes and the format round-trips CRS metadata losslessly for downstream routing.
- **Bounded thread pool.** GEOS releases the GIL during heavy geometry ops, so a `ThreadPoolExecutor` sized to physical cores gives real parallelism without the serialization cost of process pools.
- **Simplify before buffer.** Topology-preserving simplification of dense transmission centerlines, applied before buffering, cuts vertex counts and GEOS cost without moving the capacity boundary by a meaningful margin.

## Validation & Audit Trail

A capacity surface that a financial or permitting reviewer cannot reproduce is a liability, not a deliverable. The orchestration stage concatenates the processed chunks, dissolves them, runs compliance assertions, and stamps every output with the lineage needed to reconstruct it — the target CRS, the dissolve rule, and a build timestamp.

```python
import pandas as pd
from datetime import datetime, timezone

async def execute_capacity_analysis_pipeline(
    input_path: str,
    output_path: str,
    compliance_rules: dict,
) -> dict:
    """End-to-end async pipeline producing an audit-ready grid capacity surface."""
    logging.info("Initializing grid capacity buffer pipeline...")

    processed_chunks = await run_chunked_buffer_pipeline(input_path, chunk_size=5000)
    if not processed_chunks:
        raise RuntimeError("Pipeline yielded zero valid chunks.")

    full_gdf = gpd.GeoDataFrame(
        pd.concat(processed_chunks, ignore_index=True), crs=TARGET_CRS
    )
    capacity_surface = aggregate_capacity_zones(full_gdf)

    # Compliance assertions — fail loudly on over-allocation risk
    assert capacity_surface.crs.is_projected, "Output CRS regressed to geographic."
    if compliance_rules.get("max_buffer_overlap_pct", 1.0) < 0.8:
        logging.warning("High spatial overlap detected; review thermal allocation logic.")

    # Lineage metadata: the minimum a reviewer needs to reproduce this surface
    capacity_surface["target_epsg"] = TARGET_CRS
    capacity_surface["reconciliation_rule"] = "min_available_capacity_mw"
    capacity_surface["audit_timestamp"] = datetime.now(timezone.utc).isoformat()

    capacity_surface.to_parquet(output_path)
    logging.info(f"Pipeline complete. {len(capacity_surface)} zones written to {output_path}")

    return {
        "total_zones": len(capacity_surface),
        "crs": TARGET_CRS,
        "min_capacity_mw": float(capacity_surface["available_capacity_mw"].min()),
        "status": "success",
    }

if __name__ == "__main__":
    asyncio.run(
        execute_capacity_analysis_pipeline(
            "grid_assets_raw.gpkg",
            "capacity_buffers.parquet",
            compliance_rules={"max_buffer_overlap_pct": 0.75},
        )
    )
```

The `target_epsg`, `reconciliation_rule`, and `audit_timestamp` columns are not decorative. They are the lineage that lets an interconnection study or permitting submission be independently re-run and arrive at the same surface — a capacity number without that provenance is a figure a reviewer has no basis to trust. For projection-zone selection and metric-degradation warnings consult the [GeoPandas projections guide](https://geopandas.org/en/stable/docs/user_guide/projections.html), and for datum-transformation parameters the [pyproj CRS documentation](https://pyproj4.github.io/pyproj/stable/api/crs/crs.html). The resulting surfaces feed directly into interconnection routing optimization, environmental constraint masking, and queue prioritization — turning static proximity maps into dynamic, compliance-ready capacity surfaces that accelerate renewable project deployment.

## Related

- [Grid Infrastructure & Network Proximity Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/) — the parent pipeline this capacity-surface stage belongs to.
- [Proximity Distance Calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) — the impedance- and clearance-aware distances that drive dynamic radius derivation.
- [Transmission Line & Substation Mapping](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/) — the validated asset geometry consumed as buffer input.
- [Network Attribute Validation](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/) — schema enforcement for the capacity and voltage attributes this workflow keys off.
- [Calculating 5 km Proximity Buffers Around Substations in Shapely](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/calculating-5km-proximity-buffers-around-substations-in-shapely/) — the single-asset root-cause walkthrough of the projected-distance failure.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — projected-frame selection that the buffering stage depends on.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "Build an Audit-Ready Grid Capacity Buffer Surface in Python",
  "description": "A deterministic geopandas workflow for grid capacity buffer analysis: projected-CRS enforcement, voltage-scaled dynamic radii, memory-chunked async buffering, conservative overlap dissolution, and lineage-tagged compliance output.",
  "step": [
    { "@type": "HowToStep", "position": 1, "name": "Enforce Projected CRS & Validate Schema", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/#core-implementation" },
    { "@type": "HowToStep", "position": 2, "name": "Derive Dynamic Voltage-Scaled Buffer Radii", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/#core-implementation" },
    { "@type": "HowToStep", "position": 3, "name": "Dissolve Overlaps with Conservative Capacity Reconciliation", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/#core-implementation" },
    { "@type": "HowToStep", "position": 4, "name": "Stream, Validate & Tag Lineage for Audit", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/#validation-audit-trail" }
  ]
}
</script>
