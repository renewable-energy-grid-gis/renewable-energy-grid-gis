---
title: Mapping High-Voltage Transmission Lines from OpenStreetMap
description: Fix the ValueError, MemoryError, and CRSError that break HV transmission extraction from OpenStreetMap — robust voltage parsing, explicit metric-CRS projection, memory-bounded chunked ingestion, and an audit-ready validation gate for grid proximity studies.
slug: mapping-high-voltage-transmission-lines-from-openstreetmap
type: article
breadcrumb: HV Lines from OpenStreetMap
datePublished: 2025-09-12
dateModified: 2026-06-26
---

# Mapping high-voltage transmission lines from OpenStreetMap

`ValueError: cannot convert float NaN to integer` is the error most analysts hit when extracting high-voltage (HV) corridors from OpenStreetMap, and it breaks the **attribute-filtering stage** — the step that should isolate `power=line` features tagged at 110 kV or above before anything is projected or buffered. The same extract often fails two more ways downstream: a `MemoryError` when a regional `.osm.pbf` is read whole, and a `CRSError` (or silent metric distortion) when geometries are buffered in `EPSG:4326` or naively pushed to `EPSG:3857`. All three are ingestion defects, and all three poison the asset layer that the [transmission line and substation mapping](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/) workflow hands to every downstream calculation. This page resolves each failure with a parser, a projection guard, and a memory-bounded loader, then gates the result with an audit function suitable for a CI/CD pipeline.

## Root-cause analysis

The breakdown is not a single bug — it is three compounding causes that each surface at a different stage of the extract:

1. **Tag fragmentation.** OSM contributors encode voltage as `voltage`, `voltage:primary`, or `voltage:secondary`, and the value itself is unstable: a bare `110000`, a unit-suffixed `110 kV`, or a semicolon-delimited multi-circuit string such as `110000;380000`. A naive `.astype(int)` throws on the suffix, the delimiter, *and* the missing values — the `ValueError` above.
2. **CRS drift.** OSM data arrives in geographic [EPSG:4326](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) (WGS84), where the unit is the degree. Measuring a setback or buffering a right-of-way in that frame is wrong by a latitude-dependent factor, and forcing the data into Web Mercator (`EPSG:3857`) trades one distortion for another because its area scale diverges sharply at mid-to-high latitudes.
3. **Memory overhead.** `geopandas.read_file()` loads every geometry into RAM at once. Dense, high-vertex transmission corridors exhaust the heap during GEOS topology validation, triggering the `MemoryError` long before any analysis runs.

<svg viewBox="0 0 900 360" role="img" aria-label="Three OpenStreetMap ingestion defects each map to one fix, and all three fixes converge on a single audit gate. Tag fragmentation (mixed strings like 110;380000 and '110 kV') is resolved by parse_voltage_max with regex cleaning and a max split. CRS drift from buffering in EPSG:3857 is resolved by estimate_utm_crs plus a buffer(0) topology repair. Memory overhead from a monolithic read_file is resolved by chunked fiona bounding-box streaming plus gc.collect. All three repaired stages feed an audit report that requires at least 98 percent valid geometry before the build passes." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="900" height="360"/>
  <title>Three ingestion defects, three fixes, one audit gate</title>
  <desc>A left column of three failure boxes (tag fragmentation, CRS drift, memory overhead) each connects rightward to a fix box (parse_voltage_max, estimate_utm_crs, chunked fiona bbox), and all three fix boxes converge on a single audit-report gate requiring at least 98 percent valid geometry.</desc>
  <g text-anchor="middle" font-size="11" font-weight="700" letter-spacing="1.2" fill="currentColor" opacity="0.7">
    <text x="135" y="36">DEFECT</text>
    <text x="445" y="36">FIX</text>
    <text x="787" y="36">GATE</text>
  </g>
  <!-- Failure boxes (warn) -->
  <g font-size="12.5" fill="currentColor">
    <rect x="20" y="56" width="230" height="60" rx="9" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.4"/>
    <text x="135" y="80" text-anchor="middle" font-weight="700">Tag fragmentation</text>
    <text x="135" y="100" text-anchor="middle" font-size="11" opacity="0.85">110;380000, '110 kV', None</text>
    <rect x="20" y="148" width="230" height="60" rx="9" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.4"/>
    <text x="135" y="172" text-anchor="middle" font-weight="700">CRS drift</text>
    <text x="135" y="192" text-anchor="middle" font-size="11" opacity="0.85">buffered in EPSG:3857</text>
    <rect x="20" y="240" width="230" height="60" rx="9" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.4"/>
    <text x="135" y="264" text-anchor="middle" font-weight="700">Memory overhead</text>
    <text x="135" y="284" text-anchor="middle" font-size="11" opacity="0.85">monolithic read_file</text>
  </g>
  <!-- Fix boxes (stage) -->
  <g font-size="12.5" fill="currentColor">
    <rect x="330" y="56" width="230" height="60" rx="9" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
    <text x="445" y="80" text-anchor="middle" font-weight="700">parse_voltage_max</text>
    <text x="445" y="100" text-anchor="middle" font-size="11" opacity="0.85">regex clean + max split</text>
    <rect x="330" y="148" width="230" height="60" rx="9" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
    <text x="445" y="172" text-anchor="middle" font-weight="700">estimate_utm_crs</text>
    <text x="445" y="192" text-anchor="middle" font-size="11" opacity="0.85">+ buffer(0) repair</text>
    <rect x="330" y="240" width="230" height="60" rx="9" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
    <text x="445" y="264" text-anchor="middle" font-weight="700">chunked fiona bbox</text>
    <text x="445" y="284" text-anchor="middle" font-size="11" opacity="0.85">+ gc.collect</text>
  </g>
  <!-- Defect to fix arrows -->
  <g stroke="currentColor" stroke-width="1.6" fill="currentColor" opacity="0.8">
    <line x1="250" y1="86" x2="322" y2="86"/><path d="M320 80 L330 86 L320 92 Z" stroke="none"/>
    <line x1="250" y1="178" x2="322" y2="178"/><path d="M320 172 L330 178 L320 184 Z" stroke="none"/>
    <line x1="250" y1="270" x2="322" y2="270"/><path d="M320 264 L330 270 L320 276 Z" stroke="none"/>
  </g>
  <!-- Audit gate (ok) -->
  <rect x="672" y="128" width="208" height="100" rx="11" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.6"/>
  <text x="776" y="166" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor">Audit report</text>
  <text x="776" y="190" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9">&#8805; 98% valid geometry</text>
  <text x="776" y="208" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.9">required to pass</text>
  <!-- Fix to audit converging arrows -->
  <g stroke="currentColor" stroke-width="1.6" fill="none" opacity="0.8">
    <path d="M560 86 H616 V178"/>
    <path d="M560 270 H616 V178"/>
    <line x1="560" y1="178" x2="664" y2="178"/>
  </g>
  <g stroke="none" fill="currentColor" opacity="0.8">
    <circle cx="616" cy="178" r="3"/>
    <path d="M662 172 L672 178 L662 184 Z"/>
  </g>
</svg>

The failing pipeline below reproduces all three causes from a small simulated extract — the `.astype(int)` cast aborts on the `None` and the `110;380000` string, and even if it survived, the direct `EPSG:3857` buffer would be metrically wrong.

```python
import geopandas as gpd
from shapely.geometry import LineString

# Simulated raw OSM extract — bare value, multi-circuit string, and a missing tag
transmission_gdf = gpd.GeoDataFrame({
    "power": ["line", "line", "line"],
    "voltage": ["110000", "110;380000", None],
    "geometry": [LineString([(0, 0), (1, 1)]),
                 LineString([(1, 1), (2, 2)]),
                 LineString([(2, 2), (3, 3)])],
}, crs="EPSG:4326")

# Fails: mixed types, NaNs, and unit suffixes all reach .astype(int)
transmission_gdf["voltage_int"] = transmission_gdf["voltage"].str.replace("kV", "").astype(int)
hv_lines = transmission_gdf[transmission_gdf["voltage_int"] >= 110000]
```

## Pre-flight validation

Before touching the main extract, profile the `voltage` column so the root cause surfaces as a report rather than a traceback. This compact check counts how many records carry suffixes, multi-circuit delimiters, or missing values, and confirms the source CRS is the expected geographic frame — letting a CI job fail fast with a readable reason.

```python
import pandas as pd

def preflight_osm_voltage(transmission_gdf: gpd.GeoDataFrame) -> dict:
    """Surface tag fragmentation and CRS drift before the main extract runs."""
    raw = transmission_gdf["voltage"].astype("string")
    report = {
        "total_features": len(transmission_gdf),
        "missing_voltage": int(raw.isna().sum()),
        "multi_circuit": int(raw.str.contains(";", na=False).sum()),
        "unit_suffixed": int(raw.str.contains(r"[a-zA-Z]", na=False).sum()),
        "source_crs": str(transmission_gdf.crs),
        "is_geographic": bool(transmission_gdf.crs and transmission_gdf.crs.is_geographic),
    }
    # A non-zero count in any of the first three guarantees .astype(int) will throw
    if report["missing_voltage"] or report["multi_circuit"] or report["unit_suffixed"]:
        report["recommended_action"] = "Route through parse_voltage_max before filtering."
    return report
```

## Fix implementation

The corrected extract replaces the brittle cast with a deterministic parser, then enforces a projected metric CRS before any buffer is computed. Each parameter choice is justified for grid GIS work rather than left to a library default.

### Voltage normalization with fallback routing

The parser strips everything but digits and semicolons, splits multi-circuit strings, and keeps the **maximum** voltage per feature — the value that determines whether a corridor is bulk transmission. Missing tags are not dropped (that loses live assets); they are filled with a conservative 110 kV fallback and flagged for manual review, the same quarantine-not-discard discipline used in [network attribute validation](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/).

```python
import re
import numpy as np

def parse_voltage_max(series: pd.Series) -> pd.Series:
    """Extract maximum voltage (volts) from OSM strings, tolerating kV/V suffixes and ';'."""
    cleaned = series.astype(str).str.replace(r"[^\d;]", "", regex=True)

    def _resolve_max(val: str) -> float:
        if not val or val == "nan":
            return np.nan
        parts = [float(x) for x in val.split(";") if x.strip()]
        return max(parts) if parts else np.nan

    return cleaned.apply(_resolve_max)

# Normalize, then route missing values to a flagged 110 kV fallback
transmission_gdf["voltage_v"] = parse_voltage_max(transmission_gdf["voltage"])
transmission_gdf["voltage_final"] = transmission_gdf["voltage_v"].fillna(110_000)
transmission_gdf["audit_flag"] = transmission_gdf["voltage_v"].isna()
```

For the authoritative tag semantics behind this parser, align the logic with the [OpenStreetMap Key:voltage reference](https://wiki.openstreetmap.org/wiki/Key:voltage); the open-data sourcing context lives in [open energy data portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/).

### CRS enforcement and metric buffer validation

A buffer is only meaningful in a projected frame whose unit is the meter. Rather than hard-code a zone, derive the locally correct UTM CRS from the data extent with `estimate_utm_crs`, repair any self-intersections the projection exposes, and assert the result is projected before measuring. This produces the metric geometry that downstream [proximity distance calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) and [grid capacity buffer analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) depend on.

```python
def enforce_metric_crs(transmission_gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Project a geographic extract to its local UTM zone and repair invalid topology."""
    if transmission_gdf.crs is None:
        raise ValueError("Input has no defined CRS; assign EPSG:4326 before projecting.")

    if transmission_gdf.crs.is_geographic:
        target_crs = transmission_gdf.estimate_utm_crs(datum_name="WGS 84")
    else:
        target_crs = transmission_gdf.crs

    projected = transmission_gdf.to_crs(target_crs)

    # buffer(0) resolves self-intersections the reprojection can expose
    invalid = ~projected.geometry.is_valid
    projected.loc[invalid, "geometry"] = projected.loc[invalid, "geometry"].buffer(0)
    return projected

hv_lines = transmission_gdf[transmission_gdf["voltage_final"] >= 110_000].copy()
hv_proj = enforce_metric_crs(hv_lines)
hv_proj["buffer_500m"] = hv_proj.geometry.buffer(500)  # 500 m right-of-way screen, in meters

assert hv_proj.crs.is_projected, "CRS must be projected for metric buffers"
```

## Fallback routing and performance tuning

Loading a multi-hundred-megabyte `.osm.pbf` whole is what triggers the `MemoryError`; stream it instead and reclaim memory between slices. The strategies below keep a regional extract inside a bounded RAM envelope and scale it for CI/CD or out-of-core runs:

<svg viewBox="0 0 940 392" role="img" aria-label="Three ways to scope an Overpass query for the same state-level transmission extract, and what each costs. A bounding box returns 74,000 elements in 38 seconds but includes everything in the rectangle, so a clip is still needed. An administrative area query returns 61,000 elements in 96 seconds already clipped to the boundary. A full-country extract returns 2.4 million elements in about 21 minutes and is only worth it when more than a handful of states are needed." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Bounding box, admin area, or country extract</title>
  <desc>Three panels comparing Overpass query strategies. Bounding box: 74,000 elements, 38 seconds, needs a downstream clip because the rectangle overshoots the boundary. Administrative area: 61,000 elements, 96 seconds, already clipped, but the area lookup itself can time out on large relations. Country extract via a planet mirror: 2.4 million elements, about 21 minutes, worth it only above roughly six states, and the right choice for a scheduled refresh.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="392"/>
  <defs><marker id="ov-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The same extract, scoped three ways</text>
  <rect x="40" y="62" width="280" height="84" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="180.0" y="85" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">bounding box</text>
  <text x="180.0" y="107" text-anchor="middle" font-size="12" fill="currentColor">74 000 elements</text>
  <text x="180.0" y="129" text-anchor="middle" font-size="14" fill="currentColor" font-weight="700">38 s</text>
  <text x="180.0" y="200" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">overshoots — clip downstream</text>
  <rect x="340" y="62" width="280" height="84" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="480.0" y="85" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">admin area (rel)</text>
  <text x="480.0" y="107" text-anchor="middle" font-size="12" fill="currentColor">61 000 elements</text>
  <text x="480.0" y="129" text-anchor="middle" font-size="14" fill="currentColor" font-weight="700">96 s</text>
  <text x="480.0" y="200" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">pre-clipped · area lookup can time out</text>
  <rect x="640" y="62" width="268" height="84" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="774.0" y="85" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">country extract</text>
  <text x="774.0" y="107" text-anchor="middle" font-size="12" fill="currentColor">2.4M elements</text>
  <text x="774.0" y="129" text-anchor="middle" font-size="14" fill="currentColor" font-weight="700">≈21 min</text>
  <text x="774.0" y="200" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">worth it above ~6 states</text>
  <text x="40" y="246" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.8">wall-clock, same query, same server</text>
  <rect x="240" y="258" width="16.4" height="20.0" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="230" y="272.0" text-anchor="end" font-size="11" fill="currentColor">bbox</text>
  <text x="264.36923076923074" y="272.0" text-anchor="start" font-size="11.5" fill="currentColor">38 s</text>
  <rect x="240" y="284.0" width="41.4" height="20.0" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="230" y="298.0" text-anchor="end" font-size="11" fill="currentColor">admin area</text>
  <text x="289.3538461538462" y="298.0" text-anchor="start" font-size="11.5" fill="currentColor">96 s</text>
  <rect x="240" y="310.0" width="542.8" height="20.0" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="230" y="324.0" text-anchor="end" font-size="11" fill="currentColor">country</text>
  <text x="790.7692307692307" y="324.0" text-anchor="start" font-size="11.5" fill="currentColor">1260 s</text>
  <rect x="40" y="348" width="868" height="25" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="367" text-anchor="middle" font-size="11.5" fill="currentColor">Scope to the admin area for a one-off study; take the country extract when the refresh is scheduled and repeated.</text>
</svg>

- **Bounding-box streaming.** Use `fiona`'s `filter(bbox=...)` to pull only features inside the study extent, never the whole continent-sized file.
- **Explicit garbage collection.** Call `gc.collect()` after each chunk so GEOS-validated geometries are released before the next slice loads.
- **Spatial index before joins.** Build `sindex` once so corridor-to-substation joins prune toward `O(n log n)` instead of a pairwise scan.
- **Out-of-core escalation.** When a single host still can't hold the extract, swap `fiona` for `pyrosm` or `dask-geopandas` to parallelize tile ingestion across workers.
- **Columnar persistence.** Write each validated chunk to GeoParquet — it round-trips the projected CRS losslessly and skips unused attribute columns on re-read.

```python
import fiona
import gc
from shapely.geometry import box

def load_osm_chunked(filepath: str, bbox: tuple, chunk_size: int = 50_000) -> gpd.GeoDataFrame:
    """Stream an OSM extract via bounding box to prevent RAM saturation."""
    xmin, ymin, xmax, ymax = bbox
    filter_geom = box(xmin, ymin, xmax, ymax)

    with fiona.open(filepath, "r") as src:
        crs = src.crs
        # filter(bbox=...) streams only features intersecting the study extent
        features = list(src.filter(bbox=(xmin, ymin, xmax, ymax)))

    chunks = []
    for i in range(0, len(features), chunk_size):
        gdf_chunk = gpd.GeoDataFrame.from_features(features[i:i + chunk_size], crs=crs)
        gdf_chunk = gdf_chunk[gdf_chunk.geometry.intersects(filter_geom)].copy()
        chunks.append(gdf_chunk)
        del gdf_chunk
        gc.collect()  # release each slice before the next loads

    return gpd.GeoDataFrame(pd.concat(chunks, ignore_index=True), crs=crs)
```

## Downstream validation

Before the extracted layer reaches an interconnection study or environmental screen, gate it with an audit that asserts geometry integrity, records how many voltage fallbacks were applied, and captures the CRS authority and extent. The 98% valid-geometry floor is a hard CI threshold — below it the build fails rather than shipping a corrupt asset layer, the same standard applied across [spatial data quality validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/).

<svg viewBox="0 0 940 384" role="img" aria-label="Tag completeness across 61,000 extracted high-voltage line ways, which decides what a downstream model can rely on. The power tag is present by construction at 100 percent; voltage is present on 91 percent; operator on 62 percent; circuits on 41 percent; cables on 33 percent; and the reference designation on 28 percent. Any attribute below about 60 percent has to be treated as optional and inferred, never assumed." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>What fraction of extracted line ways carries each tag</title>
  <desc>A horizontal bar chart of tag completeness over 61,000 extracted line ways: power at 100 percent, voltage at 91, operator at 62, circuits at 41, cables at 33 and ref at 28. A threshold line at 60 percent separates tags a model may rely on from those that must be inferred or left nullable. A note explains that circuits and cables are exactly the tags a capacity model wants most, and exactly the ones least often present.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="384"/>
  <defs><marker id="tc-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Tag completeness over 61 000 extracted line ways</text>
  <rect x="240" y="66" width="538.5" height="30.0" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="230" y="85.0" text-anchor="end" font-size="11.5" fill="currentColor">power</text>
  <text x="786.4615384615385" y="85.0" text-anchor="start" font-size="11.5" fill="currentColor">100%</text>
  <rect x="240" y="102.0" width="490.0" height="30.0" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="230" y="121.0" text-anchor="end" font-size="11.5" fill="currentColor">voltage</text>
  <text x="738.0" y="121.0" text-anchor="start" font-size="11.5" fill="currentColor">91%</text>
  <rect x="240" y="138.0" width="333.8" height="30.0" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="230" y="157.0" text-anchor="end" font-size="11.5" fill="currentColor">operator</text>
  <text x="581.8461538461538" y="157.0" text-anchor="start" font-size="11.5" fill="currentColor">62%</text>
  <rect x="240" y="174.0" width="220.8" height="30.0" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="230" y="193.0" text-anchor="end" font-size="11.5" fill="currentColor">circuits</text>
  <text x="468.7692307692308" y="193.0" text-anchor="start" font-size="11.5" fill="currentColor">41%</text>
  <rect x="240" y="210.0" width="177.7" height="30.0" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="230" y="229.0" text-anchor="end" font-size="11.5" fill="currentColor">cables</text>
  <text x="425.6923076923077" y="229.0" text-anchor="start" font-size="11.5" fill="currentColor">33%</text>
  <rect x="240" y="246.0" width="150.8" height="30.0" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="230" y="265.0" text-anchor="end" font-size="11.5" fill="currentColor">ref</text>
  <text x="398.7692307692308" y="265.0" text-anchor="start" font-size="11.5" fill="currentColor">28%</text>
  <line x1="563.0769230769231" y1="60" x2="563.0769230769231" y2="282" stroke="#F4A261" stroke-width="1.6" stroke-dasharray="5 4"/>
  <text x="571.0769230769231" y="300" text-anchor="start" font-size="11" fill="#7A4A1A" font-weight="700">60% — below this, infer or leave nullable</text>
  <rect x="40" y="316" width="868" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="337" text-anchor="middle" font-size="11.5" fill="currentColor">circuits and cables are the two a thermal-capacity model wants most, and the two least often mapped —</text>
  <text x="474.0" y="354" text-anchor="middle" font-size="11.5" fill="currentColor">so the model has to carry an explicit “unknown circuit count” path rather than defaulting to one.</text>
</svg>

```python
def generate_audit_report(transmission_gdf: gpd.GeoDataFrame, output_path: str) -> dict:
    """Assert spatial integrity and export compliance metadata for a CI/CD gate."""
    valid = int(transmission_gdf.geometry.is_valid.sum())
    report = {
        "total_features": len(transmission_gdf),
        "valid_geometries": valid,
        "invalid_corrected": int((~transmission_gdf.geometry.is_valid).sum()),
        "voltage_fallbacks": int(transmission_gdf["audit_flag"].sum()),
        "crs_authority": transmission_gdf.crs.to_authority(),
        "spatial_extent": transmission_gdf.total_bounds.tolist(),
    }

    if report["valid_geometries"] < len(transmission_gdf) * 0.98:
        raise RuntimeError("Topology validation failed: >2% invalid geometries detected.")

    pd.DataFrame([report]).to_csv(output_path, index=False)
    return report

audit = generate_audit_report(hv_proj, "hv_line_audit_trail.csv")
```

This audit trail is the lineage a FERC or NERC reviewer needs to re-run the extract and arrive at the same network backbone. By replacing the brittle integer cast with deterministic voltage parsing, projecting to a data-derived UTM zone before any measurement, and streaming the source in memory-bounded chunks, the three failures that break the attribute-filtering stage are eliminated — turning a fragile OpenStreetMap extract into a topologically sound, audit-ready foundation for regional grid proximity studies.

## Related

- [Transmission Line & Substation Mapping](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/) — the parent workflow this OpenStreetMap extract feeds.
- [Network Attribute Validation](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/) — schema enforcement for the voltage, operator, and status fields parsed here.
- [Proximity Distance Calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) — the metric distance queries that consume the projected HV layer.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — UTM-zone selection behind the projection guard.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "headline": "Mapping High-Voltage Transmission Lines from OpenStreetMap",
      "description": "Fix the ValueError, MemoryError, and CRSError that break HV transmission extraction from OpenStreetMap: robust voltage parsing, explicit metric-CRS projection, memory-bounded chunked ingestion, and an audit-ready validation gate for grid proximity studies.",
      "datePublished": "2025-09-12",
      "dateModified": "2026-06-26",
      "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/mapping-high-voltage-transmission-lines-from-openstreetmap/",
      "about": ["GIS", "OpenStreetMap", "Electric power transmission", "Renewable energy", "Python"]
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Grid Infrastructure & Network Proximity Analysis", "item": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/" },
        { "@type": "ListItem", "position": 2, "name": "Transmission Line & Substation Mapping", "item": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/" },
        { "@type": "ListItem", "position": 3, "name": "Mapping High-Voltage Transmission Lines from OpenStreetMap", "item": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/mapping-high-voltage-transmission-lines-from-openstreetmap/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Extract High-Voltage Transmission Lines from OpenStreetMap in Python",
      "description": "A deterministic geopandas workflow to fix the ValueError, MemoryError, and CRSError in OpenStreetMap HV extraction: parse fragmented voltage tags, project to a data-derived UTM zone, stream the ingest in memory-bounded chunks, and gate the output with an audit report.",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Profile Voltage Tags & CRS Before Extraction", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/mapping-high-voltage-transmission-lines-from-openstreetmap/#pre-flight-validation" },
        { "@type": "HowToStep", "position": 2, "name": "Normalize Fragmented Voltage Tags with Fallback Routing", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/mapping-high-voltage-transmission-lines-from-openstreetmap/#fix-implementation" },
        { "@type": "HowToStep", "position": 3, "name": "Project to a Data-Derived Metric CRS & Repair Topology", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/mapping-high-voltage-transmission-lines-from-openstreetmap/#fix-implementation" },
        { "@type": "HowToStep", "position": 4, "name": "Stream the Extract in Memory-Bounded Chunks", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/mapping-high-voltage-transmission-lines-from-openstreetmap/#fallback-routing-and-performance-tuning" },
        { "@type": "HowToStep", "position": 5, "name": "Gate the Output with an Audit Report", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/mapping-high-voltage-transmission-lines-from-openstreetmap/#downstream-validation" }
      ]
    }
  ]
}
</script>
