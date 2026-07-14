---
title: Validating Geometry Topology with Shapely 2 Predicates
description: Gate an energy GIS layer before analysis with Shapely 2 vectorized predicates — is_valid, explain_validity, is_simple, make_valid and DE-9IM relate — to kill TopologyException, self-intersections, and ring-orientation faults in overlays.
slug: validating-geometry-topology-with-shapely-2-predicates
type: article
breadcrumb: Validating Geometry Topology with Shapely 2 Predicates
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Validating Geometry Topology with Shapely 2 Predicates

`shapely.errors.GEOSException: TopologyException: Input geom 1 is invalid: Self-intersection at ...` thrown from the middle of a `union_all()` or `overlay()` is the failure this page exists to eliminate. It breaks the geometry-integrity stage of [spatial data quality validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/): a parcel, substation footprint, or transmission corridor enters an overlay carrying a self-intersecting ring, a reversed exterior, or an unclosed ring, and GEOS refuses to run the predicate. The exception is raised three stages downstream of the ingest that admitted the bad feature, its provenance already lost, and — worse — some invalid geometries do *not* raise at all: they return a plausible but wrong intersection area that only diverges from truth when a permit reviewer recomputes a setback.

Shapely 2.x turns this from a per-feature liability into a batch gate. Its predicates are NumPy ufuncs that operate on whole arrays of geometries in one vectorized GEOS pass, so `is_valid`, `is_simple`, and `explain_validity` scale to a national layer without a Python-level loop. The job is to run that gate *before* the first overlay, classify every failure by its exact GEOS reason, repair deterministically, and re-verify — the same discipline you would apply upstream in the [geospatial data ingestion pipelines](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/) that hand layers to this stage.

## Root-cause analysis

Three compounding causes account for nearly every `TopologyException` in an energy overlay, and each maps to a distinct repair below. The critical distinction: OGC **validity** (`is_valid`) and OGC **simplicity** (`is_simple`) are different contracts. A polygon can be valid yet a linestring self-cross; a ring can be topologically simple yet enclose zero area. GEOS overlay operators demand validity; some downstream consumers additionally demand simplicity.

1. **Self-intersections.** A "figure-eight" exterior ring, or a hole that crosses the shell, makes `is_valid` return `False` with reason `Self-intersection`. This is the direct trigger for the overlay `TopologyException`. It typically enters from digitizing errors or from a naive densify/simplify step applied before [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/).
2. **Ring orientation and closure.** The OGC simple-feature model expects exterior rings counter-clockwise and interior (hole) rings clockwise, and every ring's first and last coordinate identical. Shapefiles routinely ship reversed or unclosed rings; GEOS often tolerates orientation but not an open ring, which surfaces as `Ring Self-intersection` or `Too few points in geometry component`. The signed shoelace area fixes orientation deterministically — its sign *is* the winding order:

   $$ A = \tfrac{1}{2}\sum_{i=0}^{n-1}\left(x_i\,y_{i+1} - x_{i+1}\,y_i\right) $$

   $A > 0$ is counter-clockwise, $A < 0$ clockwise; `shapely.set_precision` and `orient` normalize both.
3. **GEOS version skew and precision noise.** The same layer can pass on one machine and raise on another when environments pin different GEOS builds (`shapely.geos_version`), because make_valid heuristics and predicate tolerances changed across GEOS 3.8 → 3.11. Sub-millimetre coordinate noise near a shared edge produces `Hole lies outside shell` on one build and a clean result on another. Pinning GEOS and snapping to a fixed grid removes the nondeterminism.

<svg viewBox="0 0 900 430" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A causes-to-fixes map for geometry topology repair. Three failure reasons on the left — self-intersection, reversed or unclosed ring, and OGC-valid but not simple — each pass through an explain_validity classifier and route to a specific fix on the right: make_valid with method structure, normalize plus close ring, and an is_simple gate that deduplicates nodes. All three fixes feed a single re-verify node asserting that is_valid and is_simple are 100 percent with no empty geometries." style="width:100%;max-width:900px;height:auto;font-family:inherit">
  <title>Mapping the three topology failure reasons to their deterministic Shapely 2 fixes and a final re-verify gate</title>
  <desc>On the left, three warning nodes name the failure reasons returned by explain_validity: a self-intersection, a reversed or unclosed ring, and a geometry that is OGC-valid but not simple. Each routes rightward to a matching success node: make_valid with method equals structure, shapely.normalize plus ring closure, and an is_simple gate that deduplicates coincident nodes. All three fixes collect into one highlighted success node that re-verifies is_valid and is_simple equal one hundred percent with zero empty geometries before the layer enters any overlay.</desc>
  <defs>
    <marker id="topo-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="900" height="430" fill="none"/>
  <text x="155" y="26" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">Failure reason</text>
  <text x="690" y="26" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">Deterministic fix</text>
  <!-- Row 1 -->
  <rect x="30" y="44" width="250" height="52" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="155" y="66" text-anchor="middle" font-size="12.5" fill="#7A4A1A" font-weight="600">Self-intersection</text>
  <text x="155" y="83" text-anchor="middle" font-size="11" fill="#7A4A1A">figure-eight exterior ring</text>
  <line x1="280" y1="70" x2="538" y2="70" stroke="currentColor" stroke-width="1.4" marker-end="url(#topo-arr)"/>
  <text x="409" y="62" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">explain_validity()</text>
  <rect x="540" y="44" width="300" height="52" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="690" y="66" text-anchor="middle" font-size="12.5" fill="#1F5C3A" font-weight="600">make_valid(method="structure")</text>
  <text x="690" y="83" text-anchor="middle" font-size="11" fill="#1F5C3A">rebuilds valid polygonal set</text>
  <!-- Row 2 -->
  <rect x="30" y="134" width="250" height="52" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="155" y="156" text-anchor="middle" font-size="12.5" fill="#7A4A1A" font-weight="600">Reversed / unclosed ring</text>
  <text x="155" y="173" text-anchor="middle" font-size="11" fill="#7A4A1A">wrong winding order</text>
  <line x1="280" y1="160" x2="538" y2="160" stroke="currentColor" stroke-width="1.4" marker-end="url(#topo-arr)"/>
  <text x="409" y="152" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">explain_validity()</text>
  <rect x="540" y="134" width="300" height="52" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="690" y="156" text-anchor="middle" font-size="12.5" fill="#1F5C3A" font-weight="600">normalize + close ring</text>
  <text x="690" y="173" text-anchor="middle" font-size="11" fill="#1F5C3A">signed-area orientation fix</text>
  <!-- Row 3 -->
  <rect x="30" y="224" width="250" height="52" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="155" y="246" text-anchor="middle" font-size="12.5" fill="#7A4A1A" font-weight="600">Valid but not simple</text>
  <text x="155" y="263" text-anchor="middle" font-size="11" fill="#7A4A1A">duplicate / coincident nodes</text>
  <line x1="280" y1="250" x2="538" y2="250" stroke="currentColor" stroke-width="1.4" marker-end="url(#topo-arr)"/>
  <text x="409" y="242" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">is_simple gate</text>
  <rect x="540" y="224" width="300" height="52" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="690" y="246" text-anchor="middle" font-size="12.5" fill="#1F5C3A" font-weight="600">dedup nodes + set_precision</text>
  <text x="690" y="263" text-anchor="middle" font-size="11" fill="#1F5C3A">snap to fixed grid</text>
  <!-- Collector bus -->
  <path d="M840,70 H866 V348" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <path d="M840,160 H866" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <path d="M840,250 H866" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <line x1="866" y1="348" x2="842" y2="348" stroke="currentColor" stroke-width="1.4" marker-end="url(#topo-arr)"/>
  <!-- Verify node -->
  <rect x="540" y="322" width="300" height="54" rx="8" fill="currentColor" fill-opacity="0.12" stroke="#3D8B5F" stroke-width="2"/>
  <text x="690" y="345" text-anchor="middle" font-size="12.5" fill="#1F5C3A" font-weight="700">re-verify before overlay</text>
  <text x="690" y="363" text-anchor="middle" font-size="11" fill="#1F5C3A">is_valid &amp; is_simple = 100% · no empties</text>
</svg>

## Pre-flight validation

Surface the exact GEOS reason *before* any overlay runs. The naive pattern below is the broken one — it repairs blindly and never records what was wrong, so a downstream reviewer cannot tell a fabricated geometry from a measured one:

```python
import geopandas as gpd

# Flawed: buffer(0) hides the fault, drops the reason, and can silently null a geometry
substation_gdf = gpd.read_file("substations.gpkg")
substation_gdf["geometry"] = substation_gdf.buffer(0)  # no report, no verification
result = substation_gdf.overlay(parcels_gdf, how="intersection")
```

The pre-flight report uses Shapely 2 top-level ufuncs directly on the GeoSeries array, so the whole layer is classified in one vectorized GEOS pass rather than a per-geometry `.apply`. It returns counts by failure reason — the diagnostic a CI run needs to fail fast with a precise message:

```python
import shapely
import geopandas as gpd
import pandas as pd


def validity_report(gdf: gpd.GeoDataFrame) -> pd.DataFrame:
    """Vectorized pre-flight: count geometries by exact GEOS validity reason."""
    geoms = gdf.geometry.values  # a GeometryArray backing raw GEOS pointers
    valid = shapely.is_valid(geoms)            # ufunc over the whole array
    simple = shapely.is_simple(geoms)          # OGC-simple is a separate contract
    empty = shapely.is_empty(geoms) | shapely.is_missing(geoms)

    # explain_validity() returns "Valid Geometry" or e.g. "Self-intersection[x y]"
    reasons = shapely.validation.explain_validity(geoms[~valid])
    reason_key = pd.Series(reasons).str.split("[").str[0].str.strip()

    return pd.DataFrame({
        "n_total": [len(geoms)],
        "n_invalid": [int((~valid).sum())],
        "n_not_simple": [int((valid & ~simple).sum())],
        "n_empty": [int(empty.sum())],
        "top_reason": [reason_key.value_counts().idxmax() if len(reason_key) else "—"],
        "geos_version": [shapely.geos_version_string],
    })
```

Pinning `geos_version_string` into the report is what makes a validity failure reproducible across a laptop, a CI runner, and a production container — the same environment discipline demanded when [enforcing voltage-class schemas](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/) on the attribute side of the layer.

| Check | Vectorized call | Passing outcome |
|-------|-----------------|-----------------|
| OGC validity | `shapely.is_valid(geoms)` | All `True` — no `TopologyException` in overlay |
| Simplicity | `shapely.is_simple(geoms)` | All `True` — no self-touching lines/rings |
| Non-empty | `~shapely.is_empty(geoms)` | No zero-area artefacts from repair |
| GEOS pin | `shapely.geos_version` | Identical tuple across every environment |

## Fix implementation

The corrected function repairs, then *proves* the repair, and never mutates silently. `make_valid(method="structure")` (GEOS ≥ 3.10) is chosen over the legacy `"linework"` default because it rebuilds a clean polygonal set instead of returning a `GeometryCollection` of dangling lines — the right behaviour when the consumer is an area-based overlay. `set_precision` snaps to a 1 mm grid (`grid_size=0.001` in a projected metre CRS such as EPSG:5070 or a local UTM zone like EPSG:32610) to make results deterministic across GEOS builds. Every input is reprojected to a projected CRS first, because validity in EPSG:4326 degrees is meaningless for an area repair.

```python
import shapely
import geopandas as gpd

TARGET_CRS = "EPSG:5070"   # NAD83 / Conus Albers — projected metres for valid area repair
GRID_SIZE_M = 0.001        # 1 mm snap; kills sub-mm noise that flips GEOS results


def repair_and_verify(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Repair invalid/non-simple geometries and assert the layer is overlay-safe."""
    if gdf.crs is None or gdf.crs.is_geographic:
        gdf = gdf.to_crs(TARGET_CRS)          # never repair area in degrees

    geoms = gdf.geometry.values
    invalid = ~shapely.is_valid(geoms)
    gdf["qa_repaired"] = invalid              # keep lineage; do not discard

    # Structure method rebuilds a valid polygonal set; snap to a fixed grid after
    repaired = shapely.make_valid(geoms[invalid], method="structure")
    repaired = shapely.set_precision(repaired, grid_size=GRID_SIZE_M)
    gdf.loc[invalid, "geometry"] = gpd.GeoSeries(repaired, index=gdf.index[invalid], crs=gdf.crs)

    # Drop empties the repair may have produced (collapsed slivers) and re-verify
    gdf = gdf[~gdf.geometry.is_empty].copy()
    if not bool(shapely.is_valid(gdf.geometry.values).all()):
        raise ValueError("make_valid did not resolve every geometry; inspect explain_validity output")
    return gdf
```

Because `make_valid` can collapse a degenerate figure-eight into an empty geometry, the empty-drop step runs *after* repair and *before* the assertion — otherwise the layer passes the validity gate while carrying null geometries that break a later spatial join. A collapsed feature is usually a [sliver polygon](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/detecting-and-removing-sliver-polygons-in-geopandas/), so route those to the sliver-detection workflow rather than deleting them blind.

## Fallback routing & performance tuning

- **Prefer the top-level ufuncs over `.apply`.** `shapely.is_valid(gdf.geometry.values)` executes one GEOS call over the array; `gdf.geometry.apply(lambda g: g.is_valid)` pays Python call overhead per feature and runs 20–50× slower on a national parcel layer.
- **Snap before you union.** Running `shapely.set_precision(geoms, grid_size=0.001)` across the whole layer before `union_all()` removes the near-coincident vertices that produce `Hole lies outside shell` under a stricter GEOS build — cheaper than repairing after the exception.
- **Use `relate` / `relate_pattern` for targeted topology audits.** When you need to confirm two layers share only a boundary (no overlap), the DE-9IM pattern `relate_pattern(a, b, "F***T****")` is exact where `touches` is ambiguous — the same predicate precision used when [reconciling mismatched substation ids across grid datasets](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/reconciling-mismatched-substation-ids-across-grid-datasets/).
- **Chunk national layers with dask-geopandas.** Partition the GeoDataFrame and map `repair_and_verify` per partition; validity is embarrassingly parallel and Shapely 2 releases the GIL during GEOS predicates, so it scales across cores.
- **Pin GEOS explicitly.** Add `shapely` with its bundled GEOS to `pyproject.toml` and assert `shapely.geos_version >= (3, 10, 0)` at startup so `method="structure"` is guaranteed available and results never shift between environments.

## Downstream validation

Before a repaired layer feeds an overlay, capacity model, or routing graph, gate it with an assertion suitable for a CI/CD step. This fails the build on any surviving invalidity, any non-simple geometry, or any empty introduced by repair — the contract a downstream consumer is entitled to assume:

```python
import shapely
import geopandas as gpd


def assert_overlay_ready(gdf: gpd.GeoDataFrame) -> None:
    """CI/CD gate: the layer must be 100% valid, simple, non-empty, and projected."""
    geoms = gdf.geometry.values
    assert gdf.crs is not None and gdf.crs.is_projected, "layer must be in a projected CRS before overlay"
    assert bool(shapely.is_valid(geoms).all()), "invalid geometry survived repair"
    assert bool(shapely.is_simple(geoms).all()), "non-simple geometry present (self-touching ring/line)"
    assert not bool(shapely.is_empty(geoms).any()), "empty geometry present after repair"
    assert not gdf.geometry.isna().any(), "missing/None geometry present"
```

Wiring `assert_overlay_ready` into the pull-request pipeline that guards a new boundary or interconnection layer converts geometry integrity from a manual review into an enforced gate: no layer merges unless every feature is provably overlay-safe, and the `qa_repaired` column from the fix step gives a reviewer the exact lineage of what was rebuilt. That report is the evidence a permitting or project-finance package needs to defend a computed setback or intersection area.

## Related

- [Spatial Data Quality & Validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) — the parent gate this geometry check plugs into, alongside attribute and extent scoring.
- [Detecting and Removing Sliver Polygons in GeoPandas](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/detecting-and-removing-sliver-polygons-in-geopandas/) — where collapsed and near-zero-area artefacts from repair should be routed.
- [Geospatial Data Ingestion Pipelines](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/) — the upstream stage that should hand this gate a schema-checked, projected layer.
- [Network Attribute Validation](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/) — the grid-side counterpart enforcing attribute and topology contracts on substation and line datasets.
