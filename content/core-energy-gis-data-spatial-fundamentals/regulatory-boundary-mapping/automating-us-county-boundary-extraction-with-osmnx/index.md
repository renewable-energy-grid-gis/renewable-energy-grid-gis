# Automating US County Boundary Extraction with OSMnx

`TopologyException: side location conflict` and empty `GeoDataFrame` returns are the two outputs that quietly break automated US county extraction with OSMnx — and both surface at the boundary-ingestion stage, before any siting, interconnection-queue, or setback math ever runs. OSMnx is architecturally optimized for street-network topology, but its `geocode_to_gdf()` helper is routinely repurposed to pull `boundary=administrative` polygons for energy-GIS work. At national scale that pattern triggers Nominatim rate limits, `shapely` topology exceptions, and silent CRS mismatches that corrupt downstream spatial joins and permitting calculations. This page is part of the [Regulatory Boundary Mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/) workflow within [Core Energy-GIS Data & Spatial Fundamentals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/); it resolves each failure mode with root-cause mitigation, a pre-flight check, memory-aware batching, and authoritative fallback routing so the geometry entering your compliance mask is deterministic and audit-ready.

## Root-Cause Analysis: Why OSMnx Fails on County Boundaries

OSMnx queries OpenStreetMap's Nominatim geocoder, which returns community-edited `boundary=administrative` features. Three compounding causes dominate county-level extraction failures in energy pipelines, and none of them reliably raise on the first call:

1. **Ambiguous place queries.** Nominatim returns multiple matches for generic county names (`"Washington County"` resolves in 30+ states). Without an explicit state qualifier and a deterministic `which_result`, OSMnx silently returns the first hit or an empty `GeoDataFrame`, contaminating siting models with the wrong polygon.
2. **Topology exceptions.** OSM administrative rings frequently contain self-intersections, duplicate nodes, and sliver polygons from edits. Passed to `geopandas.overlay()` or `shapely.intersection()`, these raise `TopologyException: side location conflict` and halt automated corridor or exclusion modeling.
3. **CRS and area distortion.** OSMnx returns `EPSG:4326` (WGS84) by default. Computing acreage, setback buffers, or transmission right-of-way zones in unprojected degrees yields mathematically invalid results — degrees are not meters. This is the same projection-drift hazard covered under [coordinate reference systems for energy projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/).

The diagram below maps each cause to the fix stage that neutralizes it.

<svg viewBox="0 0 860 300" role="img" aria-label="Decision flow for county boundary extraction: a county name plus state enters two gates — does the Nominatim geocode succeed, and is the resulting topology repairable. Passing both gates projects the polygon to EPSG:5070 and yields a validated county GeoDataFrame. Failing either gate routes to a TIGER/Line or state GIS portal fallback, which also yields the validated GeoDataFrame." xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-width:860px;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="860" height="300"/>
  <title>How each county-extraction failure mode maps to the stage that neutralises it</title>
  <desc>A query of county name plus state flows into a Nominatim geocode decision. On yes it reaches a topology-repairable decision; on no it routes down to a fallback box for US Census TIGER/Line or a state GIS portal. The topology decision routes yes to a "Project to EPSG:5070" step and no down to the same fallback. The projection step and the fallback both converge on a validated county GeoDataFrame.</desc>
  <defs>
    <marker id="cty-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
    </marker>
  </defs>
  <text x="12" y="22" fill="currentColor" font-size="13" font-weight="700">From raw query to audit-ready geometry: two gates, one fallback</text>
  <!-- Main-path arrows -->
  <g color="#5BA8C8" stroke="currentColor" stroke-width="1.6" fill="none">
    <path d="M132,110 L150,110" marker-end="url(#cty-arrow)"/>
    <path d="M315,110 L370,110" marker-end="url(#cty-arrow)"/>
    <path d="M535,110 L570,110" marker-end="url(#cty-arrow)"/>
    <path d="M706,110 L732,110" marker-end="url(#cty-arrow)"/>
    <path d="M564,251 L794,251 L794,143" marker-end="url(#cty-arrow)"/>
  </g>
  <!-- Fallback (no) arrows -->
  <g color="#F4A261" stroke="currentColor" stroke-width="1.6" fill="none">
    <path d="M235,162 L318,219" marker-end="url(#cty-arrow)"/>
    <path d="M455,162 L463,219" marker-end="url(#cty-arrow)"/>
  </g>
  <!-- Edge labels -->
  <g font-size="11" font-weight="700" text-anchor="middle">
    <text x="343" y="101" fill="#2F6B49">yes</text>
    <text x="553" y="101" fill="#2F6B49">yes</text>
    <text x="258" y="186" fill="#7A4A1A">no</text>
    <text x="486" y="190" fill="#7A4A1A">no</text>
  </g>
  <!-- Process / input nodes (neutral) -->
  <g font-size="12" text-anchor="middle" fill="#1F3A60">
    <rect x="12" y="80" width="120" height="60" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="72" y="106" font-weight="700">County name</text>
    <text x="72" y="123">+ state</text>
    <rect x="574" y="80" width="132" height="60" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="640" y="106" font-weight="700">Project to</text>
    <text x="640" y="123">EPSG:5070</text>
  </g>
  <!-- Decision diamonds (neutral) -->
  <g font-size="12" text-anchor="middle" fill="#1F3A60">
    <polygon points="235,58 315,110 235,162 155,110" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="235" y="106" font-weight="700">Nominatim</text>
    <text x="235" y="123">geocode ok?</text>
    <polygon points="455,58 535,110 455,162 375,110" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="455" y="106" font-weight="700">Topology</text>
    <text x="455" y="123">repairable?</text>
  </g>
  <!-- Fallback node (warning) -->
  <g font-size="12" text-anchor="middle" fill="#1F3A60">
    <rect x="300" y="222" width="264" height="58" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="432" y="247" font-weight="700">Fallback: TIGER/Line</text>
    <text x="432" y="266">or state GIS portal</text>
  </g>
  <!-- Validated output (success) -->
  <g font-size="12" text-anchor="middle" fill="#1F3A60">
    <rect x="734" y="80" width="118" height="60" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <text x="793" y="106" font-weight="700">Validated county</text>
    <text x="793" y="123">GeoDataFrame</text>
  </g>
</svg>

## Pre-flight Validation: Surface the Root Cause Before Overlay

Run a cheap geocode probe before committing the polygon to your pipeline. This function surfaces ambiguity, emptiness, and invalidity up front, so the fault is logged at ingestion rather than masked as a vanished constraint three stages later.

<svg viewBox="0 0 940 380" role="img" aria-label="Why an OSM administrative relation can return an invalid polygon. The county outline is stored as an ordered set of way segments; if one way is missing from the extract, the ring never closes, and the polygonisation step either drops the feature or returns a self-touching shape whose area is meaningless. Closing the ring against a reference boundary, then running make_valid, is what turns the relation into a usable polygon." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>An unclosed relation ring, and what closing it costs</title>
  <desc>On the left, a county outline drawn as five way segments with one segment missing, leaving a visible gap; the resulting polygonisation is marked as invalid with an area of zero. In the middle, the repair: the gap is bridged, the ring closes, and make_valid returns a single valid polygon. On the right, three consequences of skipping the repair — a dropped county, a wrongly clipped parcel set, and a setback overlay that silently reports no constraints.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="380"/>
  <defs><marker id="rr-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">A relation is a set of ways — nothing guarantees they close</text>
  <line x1="60" y1="210" x2="120" y2="120" stroke="#5BA8C8" stroke-width="2.4"/>
  <line x1="120" y1="120" x2="230" y2="96" stroke="#5BA8C8" stroke-width="2.4"/>
  <line x1="230" y1="96" x2="300" y2="170" stroke="#5BA8C8" stroke-width="2.4"/>
  <line x1="300" y1="170" x2="268" y2="262" stroke="#5BA8C8" stroke-width="2.4"/>
  <line x1="268" y1="262" x2="150" y2="280" stroke="#C85B5B" stroke-width="2" stroke-dasharray="4 4" opacity="0.85"/>
  <line x1="150" y1="280" x2="60" y2="210" stroke="#5BA8C8" stroke-width="2.4"/>
  <circle cx="60" cy="210" r="3.5" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <circle cx="120" cy="120" r="3.5" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <circle cx="230" cy="96" r="3.5" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <circle cx="300" cy="170" r="3.5" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <circle cx="268" cy="262" r="3.5" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <circle cx="150" cy="280" r="3.5" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <text x="180" y="62" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">relation as extracted</text>
  <text x="214" y="300" text-anchor="middle" font-size="11" fill="#7A4A1A">one way missing — ring never closes</text>
  <text x="180" y="322" text-anchor="middle" font-size="11.5" fill="#7A4A1A" font-weight="700">polygonise() → invalid · area 0</text>
  <line x1="330" y1="190" x2="372" y2="190" stroke="currentColor" stroke-width="1.4" marker-end="url(#rr-arr)"/>
  <path d="M420,210 L480,120 L590,96 L660,170 L628,262 L510,280 Z" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2.2"/>
  <text x="540" y="62" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">ring closed, then make_valid()</text>
  <text x="540" y="322" text-anchor="middle" font-size="11.5" fill="#1F5C3A" font-weight="700">one valid polygon · area defensible</text>
  <line x1="700" y1="190" x2="742" y2="190" stroke="currentColor" stroke-width="1.4" marker-end="url(#rr-arr)"/>
  <rect x="750" y="96" width="170" height="44" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="835.0" y="116" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">County</text>
  <text x="835.0" y="132" text-anchor="middle" font-size="11" fill="currentColor">silently dropped</text>
  <rect x="750" y="172" width="170" height="44" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="835.0" y="192" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">Parcels</text>
  <text x="835.0" y="208" text-anchor="middle" font-size="11" fill="currentColor">clipped to nothing</text>
  <rect x="750" y="248" width="170" height="44" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="835.0" y="268" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">Overlay</text>
  <text x="835.0" y="284" text-anchor="middle" font-size="11" fill="currentColor">reports no constraint</text>
</svg>

```python
import osmnx as ox
import geopandas as gpd


def preflight_county(query: str, state_abbr: str) -> dict:
    """Probe a county query and report the failure mode without raising mid-pipeline."""
    full_query = f"{query} County, {state_abbr}, USA"
    report = {"query": full_query, "ok": False, "reason": None, "n_features": 0}

    try:
        candidate = ox.geocode_to_gdf(full_query, which_result=1)
    except Exception as exc:  # Nominatim miss, 429, or network fault
        report["reason"] = f"geocode_failed: {exc}"
        return report

    report["n_features"] = len(candidate)
    if candidate.empty:
        report["reason"] = "empty_result: no admin boundary matched the query"
        return report
    if not candidate.geometry.is_valid.all():
        report["reason"] = "invalid_topology: self-intersection or sliver present"
        return report

    report["ok"] = True
    return report
```

A clean run returns `{"ok": True, ...}`; anything else is a flag to route to a fallback source or tighten the query before the geometry pollutes a spatial join.

## Fix Implementation: Deterministic Extraction with Topology Repair

The corrected extractor replaces fragile single-call logic with an explicit state-qualified query, `make_valid` topology repair, an empty-geometry guard, and an equal-area projection. `EPSG:5070` (CONUS Albers Equal Area) is chosen deliberately: acreage and metric setbacks demand an equal-area projected CRS, never the source `EPSG:4326`.

```python
import osmnx as ox
import geopandas as gpd
from shapely.validation import make_valid
import warnings

warnings.filterwarnings("ignore", category=RuntimeWarning)


def extract_validated_county(query: str, state_abbr: str, target_epsg: str = "EPSG:5070") -> gpd.GeoDataFrame:
    """Extract county geometry with deterministic query, topology repair, and equal-area projection."""
    # 1. Deterministic Nominatim query with state qualifier
    full_query = f"{query} County, {state_abbr}, USA"
    county_gdf = ox.geocode_to_gdf(full_query, which_result=1)

    # 2. Topology validation & repair (resolves side-location conflicts)
    county_gdf["geometry"] = county_gdf["geometry"].apply(make_valid)

    # 3. Drop invalid/empty geometries before projecting
    valid_mask = county_gdf.geometry.is_valid & ~county_gdf.geometry.is_empty
    county_gdf = county_gdf[valid_mask].copy()
    if county_gdf.empty:
        raise ValueError(f"No valid geometry returned for {full_query}.")

    # 4. Project to CONUS Albers Equal Area for accurate acreage/buffer math
    return county_gdf.to_crs(target_epsg)
```

Validate the area before trusting the polygon. Convert the projected area in square meters to acres with the exact survey-acre constant:

$$\text{acres} = \frac{A_{m^2}}{4046.8564224}$$

```python
county_gdf = extract_validated_county("Riverside", "CA")
acres = county_gdf.area.sum() / 4046.8564224
```

Cross-check `acres` against the US Census reference for that FIPS code; a double-digit deviation almost always means the CRS step was skipped or the wrong polygon was geocoded. For systematic geometry checks across a batch, fold these assertions into your [spatial data quality validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) gates.

## Fallback Routing & Performance Tuning

Batch extraction across 3,000+ counties requires chunked requests, aggressive caching, and strict memory control. Unmanaged loops trigger Nominatim 429 bans and exhaust RAM during geometry serialization.

<svg viewBox="0 0 940 344" role="img" aria-label="Three sources for the same county boundary compared on the four properties that decide whether it can carry a permitting decision: currency, topological cleanliness, attribute completeness and licence. OpenStreetMap is current and richly attributed but topologically unreliable; Census TIGER/Line is topologically clean and public domain but lags annexations by up to a year; a state GIS portal is authoritative and current but is published per state with no national schema." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Choosing a county boundary source: three trade-offs, no free option</title>
  <desc>A comparison of OpenStreetMap, Census TIGER/Line, and state GIS portals across four rows. Currency: OSM is updated continuously, TIGER annually, state portals on their own schedule. Topology: OSM relations frequently fail to close, TIGER is topologically clean, state portals vary. Attributes: OSM carries rich but inconsistent tags, TIGER carries stable FIPS codes, state portals carry local statutory fields. Licence: OSM is share-alike under ODbL, TIGER is public domain, state portals vary by state.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="344"/>
  <defs><marker id="cs-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">No single boundary source is both current and topologically safe</text>
  <text x="382" y="68" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">OpenStreetMap</text>
  <text x="600" y="68" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">Census TIGER/Line</text>
  <text x="818" y="68" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">State GIS portal</text>
  <text x="28" y="104" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">Currency</text>
  <rect x="284" y="80" width="196" height="38" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="382" y="104" text-anchor="middle" font-size="11" fill="currentColor">continuous</text>
  <rect x="502" y="80" width="196" height="38" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="600" y="104" text-anchor="middle" font-size="11" fill="currentColor">annual vintage</text>
  <rect x="720" y="80" width="196" height="38" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="818" y="104" text-anchor="middle" font-size="11" fill="currentColor">varies by state</text>
  <text x="28" y="150" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">Topology</text>
  <rect x="284" y="126" width="196" height="38" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2"/>
  <text x="382" y="150" text-anchor="middle" font-size="11" fill="currentColor">rings often open</text>
  <rect x="502" y="126" width="196" height="38" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="600" y="150" text-anchor="middle" font-size="11" fill="currentColor">clean, validated</text>
  <rect x="720" y="126" width="196" height="38" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="818" y="150" text-anchor="middle" font-size="11" fill="currentColor">varies</text>
  <text x="28" y="196" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">Attributes</text>
  <rect x="284" y="172" width="196" height="38" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="382" y="196" text-anchor="middle" font-size="11" fill="currentColor">rich, inconsistent</text>
  <rect x="502" y="172" width="196" height="38" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="600" y="196" text-anchor="middle" font-size="11" fill="currentColor">stable FIPS codes</text>
  <rect x="720" y="172" width="196" height="38" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="818" y="196" text-anchor="middle" font-size="11" fill="currentColor">statutory fields</text>
  <text x="28" y="242" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">Licence</text>
  <rect x="284" y="218" width="196" height="38" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="382" y="242" text-anchor="middle" font-size="11" fill="currentColor">ODbL share-alike</text>
  <rect x="502" y="218" width="196" height="38" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="600" y="242" text-anchor="middle" font-size="11" fill="currentColor">public domain</text>
  <rect x="720" y="218" width="196" height="38" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="818" y="242" text-anchor="middle" font-size="11" fill="currentColor">varies by state</text>
  <rect x="28" y="274" width="892" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="295" text-anchor="middle" font-size="11.5" fill="currentColor">The workable pattern is OSM for currency, TIGER for the topology check, and the state portal as the tie-break</text>
  <text x="474.0" y="312" text-anchor="middle" font-size="11.5" fill="currentColor">whenever a permitting decision depends on which side of the line a parcel falls.</text>
</svg>

```python
import osmnx as ox
import geopandas as gpd
import pandas as pd
import time
import gc
from pathlib import Path


def batch_extract_counties(county_df: pd.DataFrame, output_dir: Path, chunk_size: int = 50) -> None:
    """Memory-optimized batch extraction with rate-limit compliance and fallback routing."""
    # OSMnx >= 2.0 uses the settings object rather than the removed ox.config()
    ox.settings.log_console = True
    ox.settings.use_cache = True
    ox.settings.cache_folder = str(Path(".osmnx_cache"))

    for i in range(0, len(county_df), chunk_size):
        chunk = county_df.iloc[i:i + chunk_size].copy()
        valid_geoms = []

        for _, row in chunk.iterrows():
            try:
                county_gdf = extract_validated_county(row["county_name"], row["state_abbr"])
                valid_geoms.append(county_gdf)
            except Exception as exc:
                # Route to authoritative TIGER/Line or USGS when OSM is unusable
                # https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html
                print(f"[FALLBACK] OSM failed for {row['county_name']}, {row['state_abbr']}: {exc}")
                continue

            time.sleep(1.1)  # Nominatim hard limit: 1 request/second

        if valid_geoms:
            chunk_gdf = gpd.GeoDataFrame(pd.concat(valid_geoms, ignore_index=True))
            chunk_gdf.to_parquet(output_dir / f"chunk_{i:04d}.parquet", index=False)
            del chunk_gdf

        del valid_geoms
        gc.collect()  # Explicit reclamation for large geometry arrays
```

Apply these strategies when extraction runs at scale or inside CI/CD:

- **Rate-limit compliance.** Nominatim enforces 1 request/second; bursts earn IP bans that stall interconnection-queue refreshes. Keep the `time.sleep(1.1)` throttle, or self-host a Nominatim instance for production volume.
- **Authoritative fallback registry.** When OSM topology is irreparable, route to US Census TIGER/Line or a state GIS portal sourced through curated [open energy data portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/). Maintain a deterministic source registry so every fallback is reproducible.
- **Chunked Parquet writes.** `geopandas` holds geometry arrays in memory until released; windowed writes to GeoParquet prevent OOM crashes over a full national run.
- **Persistent cache.** Setting `ox.settings.use_cache = True` makes re-runs idempotent and removes redundant Nominatim hits — critical for CI gates that re-execute on every commit.
- **Lock the projection once.** Reproject at ingestion to `EPSG:5070`, never per-operation, so buffer and overlay stages never re-trigger an implicit reproject. Centerline inputs that need buffering belong in [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/), not here.

## Downstream Validation & Audit Trail

Energy developers and environmental teams need deterministic outputs for regulatory submissions. Gate every extracted batch through an assertion function before it feeds a compliance mask, and tag provenance so a permitting reviewer can trace each geometry to its source.

```python
import geopandas as gpd


def audit_county_batch(gdf: gpd.GeoDataFrame, expected_epsg: int = 5070) -> None:
    """CI/CD-safe assertions on an extracted county batch."""
    assert not gdf.empty, "empty batch — all geocodes failed or were dropped"
    assert gdf.crs is not None and gdf.crs.to_epsg() == expected_epsg, \
        f"CRS drift: expected EPSG:{expected_epsg}, got {gdf.crs}"
    assert gdf.geometry.is_valid.all(), "invalid topology survived into the batch"
    assert (gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"])).all(), \
        "non-areal geometry present — masks require Polygon/MultiPolygon"
    assert (gdf.area > 0).all(), "zero-area geometry indicates a failed projection"
```

Pair the assertions with provenance metadata on every output row — `source="osm_nominatim"`, `extraction_utc`, and `topology_repaired=True/False` — and log the deviation reason, source URL, and a validation checksum whenever a county is served from a fallback dataset. That lineage is what makes the resulting mask defensible in a permitting audit, and it lets the parent [Regulatory Boundary Mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/) pipeline consume county geometry without ambiguity.


## Frequently asked questions

### Why does OSMnx return a MultiPolygon for a single county?

Usually because the administrative relation legitimately has more than one part — an exclave, an
island, or a detached parcel of jurisdiction — and occasionally because the relation's ways did not
close and the polygonisation produced fragments. The two cases need opposite treatment: keep the
genuine multipart geometry, and repair the fragmented one. Distinguish them by area ratio; a genuine
exclave is a meaningful fraction of the county, while a fragment from a broken ring is usually a
sliver.

### Is it safe to cache OSM boundary extracts?

Yes, and it is necessary at any scale — but cache the extract with its query and its fetch date, and
treat the cache as a snapshot rather than a source of truth. OSM changes continuously, so two runs
weeks apart legitimately disagree. A permitting decision should name the snapshot it used.

### What tolerance should the topology repair use?

Small enough that it cannot move a boundary across a parcel, large enough to close the digitising
gaps that break rings — a metre or two in a projected metric frame is the usual working range.
Express it in metres, never in degrees, and assert the repaired geometry's area against the original
so a "repair" that swallowed a neighbouring polygon fails rather than ships.

## Related

- [Regulatory Boundary Mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/) — the parent workflow that consumes these validated county polygons.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — projection choice behind the `EPSG:5070` decision.
- [Spatial Data Quality Validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) — systematic geometry and topology gates.
- [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) — where buffered linear features enter the compliance mask.

## External Reference Standards

- OSMnx geocoding & configuration: [https://osmnx.readthedocs.io/en/stable/](https://osmnx.readthedocs.io/en/stable/)
- Shapely geometry validation: [https://shapely.readthedocs.io/en/stable/manual.html#shapely.validation.make_valid](https://shapely.readthedocs.io/en/stable/manual.html#shapely.validation.make_valid)
- US Census TIGER/Line files: [https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html)
