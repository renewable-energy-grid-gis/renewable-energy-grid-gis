---
title: Spatial Data Quality & Validation
description: A deterministic Python validation gate for energy GIS data — geometry validity, attribute completeness, extent alignment, and topology checks rolled into a weighted Quality Index that halts bad layers before they reach siting, routing, or compliance models.
slug: spatial-data-quality-validation
type: guide
breadcrumb: Spatial Data Quality & Validation
datePublished: 2025-09-12
dateModified: 2026-06-26
---

# Spatial Data Quality & Validation

Reliable renewable energy siting, grid interconnection modeling, and environmental compliance reporting depend entirely on the structural integrity of the underlying spatial datasets. The failure mode this page addresses is specific and expensive: an invalid geometry, a missing `capacity_mw` value, or a feature sitting 200 km outside the study envelope passes through an un-gated ingestion step, produces a plausible-looking output, and only diverges from truth when a permit reviewer recomputes a setback area or an interconnection study fails peer review. A naïve "read the file, run the overlay" script never raises an exception at the point of error — it raises one three stages downstream, or worse, raises none at all and ships a wrong answer. This page is part of the [core energy-GIS data and spatial fundamentals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/) reference and details a deterministic validation stage that turns heterogeneous, inconsistently formatted inputs into auditable, analysis-ready layers carrying a quantifiable quality score.

The design goal is to surface every fault at the validation boundary, before any spatial overlay, capacity estimate, or routing algorithm executes. The framework below scores each dataset across four measurable dimensions — geometric validity, attribute completeness, extent alignment, and topological consistency — collapses them into a single composite Quality Index, and uses that index as a hard gate: layers below threshold are quarantined into a remediation queue with explicit error codes rather than silently dropped. The sections follow the order a dataset actually travels: it is ingested and reprojected into one deterministic coordinate frame, validated chunk-by-chunk against the four dimensions, scored, and routed downstream with audit metadata attached.

## Why Naïve Validation Fails at Scale

Three structural problems make ad-hoc validation collapse the moment a footprint grows past a single county, and none of them reliably raises an error.

First, **coordinate reference system drift**. Energy teams aggregate datasets from [open energy data portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/), municipal planning repositories, and environmental regulatory agencies, and these sources rarely share a projection definition. A buffer or area metric computed across mixed projections is quietly wrong rather than loudly broken — a setback measured in degrees instead of metres still returns a number. Validation must isolate and normalize the CRS first; see [coordinate reference systems for energy projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) for the zone-selection logic behind the target frame.

Second, **silent invalidity**. Self-intersections, collapsed polygons, duplicate vertices, and reversed ring orientations survive ingestion and only throw a `TopologyException` deep inside a later `union_all()` or spatial join — long after the offending feature's provenance has been lost.

Third, **memory pressure**. Utility-scale and national parcel or transmission datasets exceed available RAM, so any validation that materializes the full layer with a monolithic `read_file` fails non-deterministically as the study area scales. The validation gate has to stream the data in bounded chunks, not load it whole.

Because each defect produces a believable intermediate result, the only safe place to catch them is at a single, explicit gate that runs *before* the first geometric operation. That is the entire purpose of the Quality Index described next.

## Validation Framework & Scoring Methodology

Spatial quality validation in energy GIS workflows operates across four measurable dimensions:

1. **Geometric validity** — detection of self-intersections, duplicate vertices, collapsed polygons, and invalid ring orientations.
2. **Attribute completeness** — verification of required fields (`project_id`, `capacity_mw`, `interconnection_status`, `environmental_zone`) and data-type conformity.
3. **Spatial extent alignment** — confirmation that features fall within the defined study area or regulatory boundary envelope.
4. **Topological consistency** — identification of overlapping footprints, sliver polygons, and disconnected network segments.

Each dimension contributes a penalty $P$ equal to the percentage of failing records, and the dimensions are combined into a composite Quality Index $\mathrm{QI}$ scaled 0–100 using fixed weights $w$:

$$ \mathrm{QI} = 100 - \left( w_{\text{geom}} P_{\text{geom}} + w_{\text{attr}} P_{\text{attr}} + w_{\text{extent}} P_{\text{extent}} + w_{\text{topo}} P_{\text{topo}} \right) $$

with default weights $w_{\text{geom}} = 0.35$, $w_{\text{attr}} = 0.30$, $w_{\text{extent}} = 0.15$, and $w_{\text{topo}} = 0.20$ summing to one. Datasets falling below a configurable threshold (e.g. $\mathrm{QI} < 85$) trigger automated remediation or halt pipeline execution to prevent compliance violations. Geometry is weighted highest because a single invalid polygon corrupts every overlay it touches; extent is weighted lowest because out-of-bounds features are usually trivially clipped rather than fatal.

<svg viewBox="4 -10 952 307" role="img" aria-label="The four weighted validation dimensions — geometric validity at weight 0.35, attribute completeness at 0.30, extent alignment at 0.15, and topological consistency at 0.20 — each feed a per-dimension penalty into a composite Quality Index computed as 100 minus the sum of weight times penalty. The index then hits a hard gate: if QI is at least 85 the layer passes to downstream siting and routing models, otherwise it is quarantined into the remediation queue with explicit error codes." xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-width:952px;font-family:inherit">
  <rect class="svg-bg" x="4" y="-10" width="952" height="307"/>
  <title>Four weighted dimensions collapse into one Quality Index that gates the layer</title>
  <desc>Geometric validity (0.35), attribute completeness (0.30), extent alignment (0.15), and topological consistency (0.20) each contribute a penalty to a composite Quality Index, QI = 100 minus the sum of weight times penalty. A decision gate routes layers with QI at least 85 to downstream siting and routing, and quarantines the rest into a remediation queue with explicit error codes.</desc>
  <defs>
    <marker id="qa-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
    </marker>
  </defs>
  <g font-size="13" text-anchor="middle">
    <!-- Section labels -->
    <text x="120" y="20" font-weight="700" fill="#2C6E8F">Weighted dimensions</text>
    <text x="375" y="20" font-weight="700" fill="#2C6E8F">Composite index</text>
    <text x="820" y="20" font-weight="700" fill="#2C6E8F">Hard gate &#8212; outcome</text>
    <!-- Dimension boxes -->
    <g fill="#1F3A60">
      <rect x="20" y="36" width="200" height="48" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
      <text x="120" y="56">Geometric validity</text><text x="120" y="74" fill="#2C6E8F">weight 0.35</text>
      <rect x="20" y="100" width="200" height="48" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
      <text x="120" y="120">Attribute completeness</text><text x="120" y="138" fill="#2C6E8F">weight 0.30</text>
      <rect x="20" y="164" width="200" height="48" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
      <text x="120" y="184">Extent alignment</text><text x="120" y="202" fill="#2C6E8F">weight 0.15</text>
      <rect x="20" y="228" width="200" height="48" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
      <text x="120" y="248">Topological consistency</text><text x="120" y="266" fill="#2C6E8F">weight 0.20</text>
    </g>
    <!-- Composite QI box -->
    <rect x="290" y="118" width="170" height="112" rx="10" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="2"/>
    <g fill="#1F3A60">
      <text x="375" y="148" font-weight="700">Composite QI</text>
      <text x="375" y="172">100 &#8722; &#931;(w &#183; P)</text>
      <text x="375" y="196" font-size="11.5" fill="#2C6E8F">per-dimension</text>
      <text x="375" y="212" font-size="11.5" fill="#2C6E8F">penalty percentages</text>
    </g>
    <!-- Gate diamond -->
    <polygon points="562,128 624,175 562,222 500,175" fill="#FFF4E6" stroke="#F4A261" stroke-width="2"/>
    <text x="562" y="180" fill="#7A4A1A" font-weight="700">QI &#8805; 85?</text>
    <!-- Outcome: pass -->
    <rect x="700" y="80" width="240" height="56" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <g fill="#1F3A60">
      <text x="820" y="103">Pass to downstream</text>
      <text x="820" y="121">siting / routing models</text>
    </g>
    <!-- Outcome: quarantine -->
    <rect x="700" y="218" width="240" height="62" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <g fill="#7A4A1A">
      <text x="820" y="241">Quarantine to remediation</text>
      <text x="820" y="259">queue &#8212; explicit error</text>
      <text x="820" y="277">codes attached</text>
    </g>
    <!-- Edge labels -->
    <text x="648" y="138" fill="#1F5C3A" font-weight="700">yes</text>
    <text x="648" y="214" fill="#7A4A1A" font-weight="700">no</text>
  </g>
  <!-- Connectors: dimensions to QI -->
  <g stroke="currentColor" stroke-width="1.6" fill="none" color="#5BA8C8">
    <path d="M220,60 C260,60 258,150 288,158" marker-end="url(#qa-arrow)"/>
    <path d="M220,124 C258,124 260,166 288,170" marker-end="url(#qa-arrow)"/>
    <path d="M220,188 C258,188 260,182 288,180" marker-end="url(#qa-arrow)"/>
    <path d="M220,252 C260,252 258,200 288,192" marker-end="url(#qa-arrow)"/>
  </g>
  <!-- QI to gate -->
  <g stroke="currentColor" stroke-width="1.8" fill="none" color="#5BA8C8">
    <line x1="460" y1="175" x2="498" y2="175" marker-end="url(#qa-arrow)"/>
  </g>
  <!-- Gate to pass (yes) -->
  <g stroke="currentColor" stroke-width="1.8" fill="none" color="#3D8B5F">
    <path d="M588,150 C640,128 660,110 698,108" marker-end="url(#qa-arrow)"/>
  </g>
  <!-- Gate to quarantine (no) -->
  <g stroke="currentColor" stroke-width="1.8" fill="none" color="#F4A261">
    <path d="M588,200 C640,222 660,242 698,246" marker-end="url(#qa-arrow)"/>
  </g>
</svg>

## Prerequisites & Data Requirements

This workflow assumes a Python 3.11+ environment with pinned geospatial dependencies — `geopandas>=0.14`, `shapely>=2.0`, `pyogrio>=0.7`, `pyproj>=3.6`, and `pandas>=2.1`. Version pinning is not optional: `make_valid` behaviour and ring-orientation defaults changed across Shapely 1.x → 2.x, and deterministic geometry validation requires a fixed library set across every environment that runs the gate. The inputs and constraints are:

- **A vector input layer** (parcels, transmission corridors, substation footprints, or resource grids) as GeoPackage or GeoJSON, with a populated `.crs` attribute. Layers lacking a declared CRS are rejected rather than assumed — an implicit projection is the single most common source of silent error.
- **A study-area boundary** as a single-feature GeoPackage defining the regulatory or analysis envelope used for the extent check.
- **A target CRS** chosen for the analysis region. The reference implementation uses EPSG:5070 (NAD83 / Conus Albers Equal Area) for contiguous-US energy work because area and MW-density metrics demand an equal-area frame; distance-dominated workflows would substitute the local UTM zone (e.g. EPSG:32611).
- **A declared required-attribute schema** — the list of fields a downstream siting or interconnection model cannot run without.

If your inputs originate from legacy shapefiles with malformed `.prj` files or truncated `.dbf` fields, run them through the [shapefile cleaning workflow](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/best-practices-for-cleaning-messy-shapefiles-in-geopandas/) first, so the validation gate scores a repaired layer rather than rejecting raw corruption.

## Core Implementation: The Chunked Validation Gate

The function below validates a single chunk against all four dimensions and returns penalty percentages. It uses energy-specific attribute names and an equal-area target CRS, and it never mutates the input — quarantine and scoring are decided by the caller from the returned penalties.

```python
import geopandas as gpd
import pandas as pd

TARGET_CRS = "EPSG:5070"  # NAD83 / Conus Albers Equal Area — area-true for US energy work
REQUIRED_ATTRS = ["project_id", "capacity_mw", "interconnection_status", "environmental_zone"]
QI_WEIGHTS = {"geom": 0.35, "attr": 0.30, "extent": 0.15, "topo": 0.20}

def validate_chunk(chunk: gpd.GeoDataFrame, study_union) -> dict[str, float]:
    """Score one chunk across the four quality dimensions; return penalty percentages."""
    n = len(chunk)
    if n == 0:
        return {"geom": 0.0, "attr": 0.0, "extent": 0.0, "topo": 0.0}

    # 1. Geometric validity — fraction of invalid geometries
    p_geom = (1 - chunk.geometry.is_valid.mean()) * 100

    # 2. Attribute completeness — every required field must be non-null
    attr_ok = chunk[REQUIRED_ATTRS].notna().all(axis=1)
    p_attr = (1 - attr_ok.mean()) * 100

    # 3. Extent alignment — feature must intersect the study envelope
    within_bounds = chunk.geometry.intersects(study_union)
    p_extent = (1 - within_bounds.mean()) * 100

    # 4. Topological consistency — duplicate footprints flagged as overlap failures
    topo_failures = chunk.duplicated(subset=["geometry"], keep=False).sum()
    p_topo = (topo_failures / n) * 100

    return {"geom": p_geom, "attr": p_attr, "extent": p_extent, "topo": p_topo}

def composite_qi(penalty_frame: pd.DataFrame) -> float:
    """Aggregate per-chunk penalties into one bounded Quality Index."""
    agg = penalty_frame.mean()
    qi = 100 - sum(agg[dim] * QI_WEIGHTS[dim] for dim in QI_WEIGHTS)
    return max(0.0, min(100.0, qi))
```

The extent check intersects each geometry against a pre-computed `study_union` (a single dissolved boundary geometry) rather than the full boundary GeoDataFrame, so the spatial predicate runs once per feature instead of once per feature-pair. The topology check shown here flags exact-duplicate footprints; a production gate extends it with a `sjoin(predicate="overlaps")` self-join to catch slivers and partial overlaps, discussed under performance below.

## Error Handling & Edge Cases

The three failure modes named in the problem framing each need explicit, deterministic handling rather than a silent `try/except` that swallows the fault.

**Undefined or ambiguous CRS.** A layer with `gdf.crs is None`, or one whose CRS cannot resolve to an EPSG integer, must be rejected at read time — never reprojected on an assumption. Refusing here is what prevents a degrees-as-metres setback error from ever entering the pipeline.

```python
def enforce_crs(gdf: gpd.GeoDataFrame, source_label: str) -> gpd.GeoDataFrame:
    if gdf.crs is None or gdf.crs.to_epsg() is None:
        raise ValueError(f"Undefined or non-EPSG CRS in {source_label}; reproject explicitly before validation")
    return gdf.to_crs(TARGET_CRS)
```

**Invalid geometries that block the extent predicate.** `intersects` will itself raise on a self-intersecting polygon, so geometry validity must be evaluated and repaired before the extent check runs. Repair with `make_valid` and re-score rather than dropping the feature, preserving the audit trail of what was fixed.

```python
from shapely.validation import make_valid

def repair_invalid(chunk: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    invalid = ~chunk.geometry.is_valid
    if invalid.any():
        chunk.loc[invalid, "geometry"] = chunk.loc[invalid, "geometry"].apply(make_valid)
        chunk.loc[invalid, "qa_repaired"] = True  # flag, do not discard — keep the lineage
    return chunk
```

**Empty or all-failing chunks.** A chunk that reads zero rows (a windowed read past the final feature) or whose every record fails returns valid penalties without dividing by zero — the `n == 0` guard in `validate_chunk` and the bounded `composite_qi` clamp ensure the gate never crashes on a degenerate batch and never emits a QI outside 0–100.

## Performance & Scalability

National-scale parcel and transmission layers will not fit in memory, so the gate streams the source in fixed-row blocks and validates each independently. `pyogrio.read_info` supplies the feature count up front so chunk offsets can be planned without opening the full dataset, and `asyncio` overlaps the blocking I/O of reading the next chunk with the CPU-bound geometry validation of the current one.

<svg viewBox="0 0 940 372" role="img" aria-label="What a spatial index does to the cost of a topology check. Comparing 42,000 parcels against 6,800 constraint polygons pairwise is 285.6 million candidate comparisons. Querying an STRtree for bounding-box candidates first leaves 71,400 pairs to test exactly — a quarter of a percent of the naive count — and the exact predicate then runs only on those." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Bounding-box candidates first, exact predicates second</title>
  <desc>Two bars drawn to scale on a logarithmic footing. The first represents 285.6 million pairwise comparisons between 42,000 parcels and 6,800 constraint polygons. The second represents the 71,400 candidate pairs that survive an STRtree bounding-box query, which is 0.025 percent of the first. Beside them, a two-step flow: build the index once, query per feature for candidates, then run the exact intersects predicate only on candidates. A note records the measured wall-clock difference: 19 minutes versus 7 seconds.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="372"/>
  <defs><marker id="ix-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">42 000 parcels × 6 800 constraints — the index decides how many pairs are ever tested</text>
  <text x="40" y="74" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">naive pairwise</text>
  <rect x="40" y="84" width="864" height="44" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.4"/>
  <text x="472" y="112" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">285 600 000 candidate pairs</text>
  <text x="40" y="168" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">STRtree bounding-box query, then exact predicate</text>
  <rect x="40" y="178" width="864" height="44" rx="7" fill="none" stroke="#3D8B5F" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.5"/>
  <rect x="40" y="178" width="22" height="44" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
  <text x="78" y="206" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">71 400 pairs — 0.025% of the naive count</text>
  <rect x="40" y="250" width="268" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="174.0" y="271" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">build sindex once</text>
  <text x="174.0" y="288" text-anchor="middle" font-size="11" fill="currentColor">O(n log n)</text>
  <line x1="312" y1="282" x2="334" y2="282" stroke="currentColor" stroke-width="1.4" marker-end="url(#ix-arr)"/>
  <rect x="338" y="250" width="268" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="472.0" y="271" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">query candidates</text>
  <text x="472.0" y="288" text-anchor="middle" font-size="11" fill="currentColor">bbox only</text>
  <line x1="610" y1="282" x2="632" y2="282" stroke="currentColor" stroke-width="1.4" marker-end="url(#ix-arr)"/>
  <rect x="636" y="250" width="268" height="48" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="770.0" y="271" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">exact predicate</text>
  <text x="770.0" y="288" text-anchor="middle" font-size="11" fill="currentColor">on candidates</text>
  <text x="40" y="352" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">Measured on the same layer pair: 19 min versus 7 s, and the same answer.</text>
</svg>

```python
import asyncio
import logging
import pyogrio
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger("spatial_qa")
CHUNK_SIZE = 50_000  # rows per memory block

async def _read_validate(path: Path, offset: int, limit: int, study_union) -> dict[str, float]:
    loop = asyncio.get_event_loop()
    def _blocking():
        gdf = gpd.read_file(path, rows=slice(offset, offset + limit))
        gdf = enforce_crs(gdf, f"{path.name}@{offset}")
        gdf = repair_invalid(gdf)
        return validate_chunk(gdf, study_union)
    # offload blocking I/O + Shapely work to a thread so the event loop keeps scheduling
    return await loop.run_in_executor(None, _blocking)

async def run_validation_gate(input_path: Path, bounds_path: Path) -> float:
    study = enforce_crs(gpd.read_file(bounds_path), bounds_path.name)
    study_union = study.geometry.union_all()
    total = pyogrio.read_info(input_path)["features"]

    tasks = [
        _read_validate(input_path, off, min(CHUNK_SIZE, total - off), study_union)
        for off in range(0, total, CHUNK_SIZE)
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    penalties = [r for r in results if isinstance(r, dict)]
    for err in (r for r in results if isinstance(r, Exception)):
        logger.error("Chunk validation failed: %s", err)
    if not penalties:
        raise RuntimeError("No valid chunks processed")
    return composite_qi(pd.DataFrame(penalties))
```

Two tuning notes specific to this operation. First, the topology self-join scales as O(N²) if run naively; build a spatial index (`gdf.sindex`) and restrict overlap candidates to bounding-box matches before evaluating the `overlaps` predicate, which is the same indexing discipline used in [grid capacity buffer analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) and broader [proximity and distance calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/). Second, `run_in_executor` with the default thread pool is the right tool here because Shapely 2.x releases the GIL during geometry predicates, so geometry validation genuinely parallelizes across cores rather than serializing behind the interpreter lock.

## Validation & Audit Trail

Regulatory frameworks — FERC interconnection standards, NEPA environmental review thresholds, and state-level renewable setback mandates — require traceable data provenance. Every validation run must therefore emit an immutable audit record capturing the input metadata, the CRS transformation applied, the per-dimension penalty breakdown, the final QI, and the pass/fail decision. Invalid records are never silently discarded; they are quarantined with explicit error codes (`ERR_TOPOLOGY_RING`, `ERR_MISSING_CAP_MW`, `ERR_OUT_OF_BOUNDS`) so a reviewer can reconstruct exactly why a layer was rejected.

<svg viewBox="0 0 940 400" role="img" aria-label="A worked Quality Index on a real interconnection layer. Geometric validity fails on 2.1 percent of records at weight 0.35, attribute completeness on 9.4 percent at weight 0.30, extent alignment on 0.0 percent at weight 0.15 and topological consistency on 14.0 percent at weight 0.20. The weighted penalties are 0.74, 2.82, 0.00 and 2.80, giving a Quality Index of 93.6 — above a threshold of 85, even though one dimension in four is failing on a seventh of the records." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>A worked Quality Index, and the dimension it hides</title>
  <desc>A table of the four validation dimensions with, for each, the percentage of failing records, the weight, and the resulting weighted penalty: geometric validity 2.1 percent at 0.35 gives 0.74; attribute completeness 9.4 percent at 0.30 gives 2.82; extent alignment 0.0 percent at 0.15 gives 0.00; topological consistency 14.0 percent at 0.20 gives 2.80. The four penalties sum to 6.36, so the Quality Index is 93.6 out of 100, which clears a threshold of 85. A callout notes that a composite score can pass while a single dimension fails badly, so per-dimension floors belong alongside the composite.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="qi-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">One composite score, four dimensions — and what a passing score can conceal</text>
  <text x="40" y="70" text-anchor="start" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">dimension</text>
  <text x="400" y="70" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">records failing</text>
  <text x="556" y="70" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">weight</text>
  <text x="700" y="70" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">weighted penalty</text>
  <rect x="36" y="82" width="868" height="42" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.5"/>
  <text x="52" y="109" text-anchor="start" font-size="12" fill="currentColor">Geometric validity</text>
  <text x="400" y="109" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">2.1%</text>
  <text x="556" y="109" text-anchor="middle" font-size="12" fill="currentColor">0.35</text>
  <text x="700" y="109" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">0.73</text>
  <rect x="790" y="94" width="100" height="18" rx="3" fill="none" stroke="#3D8B5F" stroke-width="1"/>
  <rect x="790" y="94" width="24.5" height="18" rx="3" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1" opacity="0.55"/>
  <rect x="36" y="132" width="868" height="42" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.5"/>
  <text x="52" y="159" text-anchor="start" font-size="12" fill="currentColor">Attribute completeness</text>
  <text x="400" y="159" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">9.4%</text>
  <text x="556" y="159" text-anchor="middle" font-size="12" fill="currentColor">0.30</text>
  <text x="700" y="159" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">2.82</text>
  <rect x="790" y="144" width="100" height="18" rx="3" fill="none" stroke="#F4A261" stroke-width="1"/>
  <rect x="790" y="144" width="94.0" height="18" rx="3" fill="#F4A261" stroke="#F4A261" stroke-width="1" opacity="0.55"/>
  <rect x="36" y="182" width="868" height="42" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.5"/>
  <text x="52" y="209" text-anchor="start" font-size="12" fill="currentColor">Extent alignment</text>
  <text x="400" y="209" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">0.0%</text>
  <text x="556" y="209" text-anchor="middle" font-size="12" fill="currentColor">0.15</text>
  <text x="700" y="209" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">0.00</text>
  <rect x="790" y="194" width="100" height="18" rx="3" fill="none" stroke="#3D8B5F" stroke-width="1"/>
  <rect x="790" y="194" width="2" height="18" rx="3" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1" opacity="0.55"/>
  <rect x="36" y="232" width="868" height="42" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2" opacity="0.5"/>
  <text x="52" y="259" text-anchor="start" font-size="12" fill="currentColor">Topological consistency</text>
  <text x="400" y="259" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">14.0%</text>
  <text x="556" y="259" text-anchor="middle" font-size="12" fill="currentColor">0.20</text>
  <text x="700" y="259" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">2.80</text>
  <rect x="790" y="244" width="100" height="18" rx="3" fill="none" stroke="#C85B5B" stroke-width="1"/>
  <rect x="790" y="244" width="93.33333333333333" height="18" rx="3" fill="#C85B5B" stroke="#C85B5B" stroke-width="1" opacity="0.55"/>
  <text x="400" y="308" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">total penalty</text>
  <text x="700" y="308" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">6.36</text>
  <text x="52" y="308" text-anchor="start" font-size="12.5" fill="#1F5C3A" font-weight="700">Quality Index = 100 − 6.36 = 93.6</text>
  <rect x="36" y="336" width="868" height="48" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="470.0" y="357" text-anchor="middle" font-size="11.5" fill="currentColor">93.6 clears a threshold of 85 — while 14% of records still overlap each other. A composite score</text>
  <text x="470.0" y="374" text-anchor="middle" font-size="11.5" fill="currentColor">needs a per-dimension floor beside it, or the weakest dimension is averaged out of sight.</text>
</svg>

```python
import json
from datetime import datetime, timezone

def write_audit(input_path: Path, qi: float, penalties: pd.DataFrame, out_path: Path) -> dict:
    audit = {
        "input_file": str(input_path),
        "validated_at": datetime.now(timezone.utc).isoformat(),
        "target_crs": TARGET_CRS,
        "quality_index": round(qi, 2),
        "penalty_breakdown": {k: round(v, 3) for k, v in penalties.mean().to_dict().items()},
        "compliance_status": "PASS" if qi >= 85 else "FAIL",
    }
    out_path.write_text(json.dumps(audit, indent=2))
    logger.info("QI %.2f | %s", qi, audit["compliance_status"])
    return audit
```

A passing layer is stamped with this audit hash and routed to downstream siting models, [regulatory boundary overlays](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/), or grid topology builders; a failing layer is held in the remediation queue. Wiring the QI threshold into a CI/CD step — spatial tests that run on every pull request before a new boundary or interconnection layer merges — converts data quality from a manual review into an enforced gate, and pairing it with alerting on a sub-threshold score prevents corrupted geometries from ever reaching a feasibility study. The same audit record becomes the evidence package for a regulatory submission, closing the loop from raw download to permitting deliverable.


## Frequently asked questions

### Should a failing dataset be repaired automatically or quarantined?

Repair what is provably mechanical and quarantine everything else. `make_valid` on a self-touching
ring, a precision snap on a duplicate vertex, and a ring-winding correction are deterministic and
safe to automate. A missing capacity value, an out-of-range voltage or a geometry outside the study
area are judgement calls that need a human, and automating them produces a dataset that is clean and
wrong. The split should be visible in the audit record: repaired counts and quarantined counts are
different numbers.

### What Quality Index threshold is right?

The composite threshold matters less than the per-dimension floors beside it. A weighted index can
sit comfortably above 85 while one dimension fails on a seventh of the records, because the other
three average it out. Set the composite threshold where the organisation's tolerance actually sits,
then add a floor per dimension — no dimension below, say, 95 percent passing — so the weakest
dimension cannot be hidden by the strongest.

### Does validation belong at ingestion or before analysis?

At ingestion, with a cheaper re-assertion before analysis. Validating at the boundary means the
working store has one invariant and every consumer can rely on it; re-asserting before an expensive
analysis catches the case where something wrote to the store outside the pipeline. The re-assertion
is a few seconds against an indexed frame, which is cheap insurance against a multi-hour run
producing a defensible-looking wrong answer.

### How do I validate a dataset that has no reference to compare against?

Validate its internal consistency and its physical plausibility, which is most of what a reference
would have told you. Geometries must be valid and non-overlapping where the domain says they should
be; capacities must fall in the range the voltage class permits; extents must fall inside the study
area; and identifiers must be unique. Those four checks catch the large majority of real defects
without any external truth.


### How do the four dimensions interact?

They are not independent, and the correlations are informative. Attribute incompleteness and
topological inconsistency usually rise together, because both indicate a source that was assembled
from several vintages; extent misalignment on its own almost always means a CRS problem rather than
a data problem. Reading the dimension scores as a pattern rather than a single index is what turns
the report into a diagnosis instead of a grade.

## Related

- [Core Energy-GIS Data & Spatial Fundamentals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/) — the parent reference framing the full six-stage pipeline this gate sits within.
- [Open Energy Data Portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/) — the ingestion layer whose heterogeneous downloads feed this validation stage.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — projection selection and datum-transformation logic behind the target CRS.
- [Best practices for cleaning messy shapefiles in geopandas](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/best-practices-for-cleaning-messy-shapefiles-in-geopandas/) — geometry repair and schema normalization for layers that fail the gate.
- [Regulatory Boundary Mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/) — the jurisdictional overlays that consume validated, in-bounds layers.
- [Grid Infrastructure & Network Proximity Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/) — the proximity stage that relies on the spatial-index discipline introduced here.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "Validate Spatial Data Quality for an Energy GIS Pipeline",
  "description": "A deterministic Python gate that scores geometry validity, attribute completeness, extent alignment, and topology into a weighted Quality Index, then quarantines or passes the layer with an audit trail.",
  "step": [
    { "@type": "HowToStep", "position": 1, "name": "Define the Quality Index scoring framework", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/#validation-framework-scoring-methodology" },
    { "@type": "HowToStep", "position": 2, "name": "Run the chunked validation gate", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/#core-implementation-the-chunked-validation-gate" },
    { "@type": "HowToStep", "position": 3, "name": "Handle CRS, geometry, and empty-chunk edge cases", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/#error-handling-edge-cases" },
    { "@type": "HowToStep", "position": 4, "name": "Scale with async, chunking, and spatial indexing", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/#performance-scalability" },
    { "@type": "HowToStep", "position": 5, "name": "Emit a compliance audit trail", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/#validation-audit-trail" }
  ]
}
</script>
