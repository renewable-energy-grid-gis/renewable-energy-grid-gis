---
title: "Best Practices for Cleaning Messy Shapefiles in GeoPandas"
description: Fix the TopologyException, CRSError, and attribute truncation failures that messy shapefiles trigger in energy GIS pipelines — a pre-flight diagnostic, a deterministic make_valid + CRS-enforce cleaning routine, quarantine routing, and a CI/CD audit gate.
slug: best-practices-for-cleaning-messy-shapefiles-in-geopandas
type: article
breadcrumb: Cleaning Messy Shapefiles in GeoPandas
datePublished: 2025-10-09
dateModified: 2026-06-26
---

# Best practices for cleaning messy shapefiles in GeoPandas

**Scenario / symptom:** a regulatory boundary or substation footprint shapefile loads fine, but the next overlay raises `shapely.errors.TopologyException: Input geom 1 is invalid: Self-intersection`, or `gdf.to_crs(...)` throws `pyproj.exceptions.CRSError: Invalid projection`, or capacity attributes silently vanish because the `.dbf` field name was truncated past 10 characters. This failure lands in the **ingestion and validation stage** of a renewable siting pipeline — the moment a 1990s-era shapefile feeds modern Python geometry operations without first being repaired. It is a recurring case of the broader data-integrity problem covered by the parent workflow on [spatial data quality and validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/): an unclean input passes the read, then surfaces as a confident-but-wrong buffer, a misaligned parcel, or a crashed overlay several stages downstream.

Shapefiles remain the default exchange format for regulatory agencies, utility operators, and legacy environmental databases, so an energy GIS team cannot simply refuse them. In transmission corridor routing, interconnection queue modeling, and constraint screening, unvalidated geometries cascade into erroneous setback zones, distorted area calculations, and flawed yield estimates. The fix is a deterministic, idempotent cleaning routine that repairs geometry before it normalises attributes, enforces an explicit coordinate frame, and quarantines anything it cannot safely repair instead of dropping it silently.

## Root-cause analysis

Three structural deficiencies compound to produce the symptoms above, and each passes silently on its own:

1. **Invalid topologies.** Self-intersections, bowtie polygons, and duplicate vertices originate from CAD exports, manual digitizing, or coordinate rounding. They survive `read_file()` untouched and only break when a spatial predicate (`overlay`, `clip`, `intersects`) evaluates them — exactly when the geometry feeds a [grid capacity buffer analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) or a constraint overlay.
2. **CRS ambiguity.** A missing, corrupted, or implicit `.prj` sidecar forces downstream operations into unprojected lat/lon space. Area and distance computed on degrees are geometrically meaningless, which is why every cleaning routine has to resolve [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) before any metric calculation runs.
3. **Attribute corruption.** Mixed character encodings (CP1252 vs UTF-8), null geometries, and string contamination in numeric MW-capacity or queue-position fields all flow through the legacy `.dbf` container, whose 10-character field-name limit truncates columns and collides keys.

Addressing these requires ordering the repair correctly — geometry first, then CRS, then attributes — with explicit fallback routing when automated validation fails.

<svg viewBox="0 0 860 280" role="img" aria-label="Cause-to-fix map. Three silent shapefile defects each map to a repair stage and converge on one clean GeoDataFrame. Invalid topology, which raises TopologyException, is fixed by make_valid plus a buffer(0) fallback. CRS ambiguity, which raises CRSError and degree-space area errors, is fixed by set_crs then to_crs to EPSG:5070. Attribute corruption, which truncates and contaminates fields, is fixed by a 10-character truncate and numeric coercion. All three repairs converge on a clean, projected, audited GeoDataFrame." xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-width:860px;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="860" height="280"/>
  <title>Three messy-shapefile defects mapped to their repair stages</title>
  <desc>Left column: three warning boxes naming a defect and the error it raises — invalid topology raising TopologyException, CRS ambiguity raising CRSError and degree-space area, and attribute corruption truncating and contaminating fields. Each arrows right into a matching repair stage — make_valid plus buffer(0), set_crs then to_crs EPSG:5070, and a 10-character truncate plus numeric coercion. The three repair stages converge with arrows into a single success node on the right: a clean, projected, audited GeoDataFrame.</desc>
  <defs>
    <marker id="sc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
    </marker>
  </defs>
  <g fill="currentColor" font-size="12" font-weight="700" text-anchor="middle" opacity="0.75">
    <text x="118" y="40">Defect &#8594; error</text>
    <text x="440" y="40">Repair stage</text>
    <text x="747" y="40">Output</text>
  </g>
  <!-- Defect boxes (warning) -->
  <g text-anchor="middle" fill="#1F3A60">
    <rect x="12" y="50" width="212" height="60" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="118" y="74" font-size="13" font-weight="700">Invalid topology</text>
    <text x="118" y="93" font-size="11.5">TopologyException</text>
    <rect x="12" y="120" width="212" height="60" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="118" y="144" font-size="13" font-weight="700">CRS ambiguity</text>
    <text x="118" y="163" font-size="11.5">CRSError &#183; degree-space area</text>
    <rect x="12" y="190" width="212" height="60" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="118" y="214" font-size="13" font-weight="700">Attribute corruption</text>
    <text x="118" y="233" font-size="11.5">truncated &#183; contaminated fields</text>
  </g>
  <!-- Defect to repair arrows -->
  <g color="#F4A261" stroke="currentColor" stroke-width="1.6" fill="none">
    <path d="M224,80 L318,80" marker-end="url(#sc-arrow)"/>
    <path d="M224,150 L318,150" marker-end="url(#sc-arrow)"/>
    <path d="M224,220 L318,220" marker-end="url(#sc-arrow)"/>
  </g>
  <!-- Repair stages -->
  <g text-anchor="middle" fill="#1F3A60">
    <rect x="322" y="50" width="236" height="60" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="440" y="76" font-size="13" font-weight="700">make_valid</text>
    <text x="440" y="94" font-size="11.5">+ buffer(0) fallback</text>
    <rect x="322" y="120" width="236" height="60" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="440" y="146" font-size="13" font-weight="700">set_crs &#8594; to_crs</text>
    <text x="440" y="164" font-size="11.5">EPSG:5070 (equal-area)</text>
    <rect x="322" y="190" width="236" height="60" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="440" y="216" font-size="13" font-weight="700">truncate 10-char</text>
    <text x="440" y="234" font-size="11.5">+ numeric coerce</text>
  </g>
  <!-- Repair to output (converging) arrows -->
  <g color="#3D8B5F" stroke="currentColor" stroke-width="1.7" fill="none">
    <path d="M558,80 C600,80 604,150 644,150" marker-end="url(#sc-arrow)"/>
    <path d="M558,150 L644,150" marker-end="url(#sc-arrow)"/>
    <path d="M558,220 C600,220 604,150 644,150" marker-end="url(#sc-arrow)"/>
  </g>
  <!-- Output node (success) -->
  <g text-anchor="middle" fill="#1F3A60">
    <rect x="646" y="118" width="202" height="64" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <text x="747" y="146" font-size="13" font-weight="700">Clean GeoDataFrame</text>
    <text x="747" y="165" font-size="11.5">valid &#183; projected &#183; audited</text>
  </g>
</svg>

## Pre-flight validation

Surface the root cause *before* the cleaning routine runs, so a broken input is diagnosed rather than half-repaired. The check below inspects geometry validity, CRS presence, and `.dbf` field-name length, and returns a diagnostic dict without mutating the source.

```python
import geopandas as gpd


def preflight_shapefile_check(input_path: str) -> dict:
    """Diagnose a shapefile's integrity before any cleaning runs.

    Returns a report dict; never mutates the source layer.
    """
    gdf = gpd.read_file(input_path, engine="pyogrio")

    null_geom = int(gdf.geometry.isna().sum() + gdf.geometry.is_empty.sum())
    invalid_geom = int((~gdf.geometry.is_valid).sum())
    long_fields = [c for c in gdf.columns if c != "geometry" and len(c) > 10]

    report = {
        "feature_count": len(gdf),
        "crs": str(gdf.crs) if gdf.crs is not None else None,
        "null_or_empty_geometries": null_geom,
        "invalid_geometries": invalid_geom,
        "fields_exceeding_dbf_10char": long_fields,
        "needs_cleaning": bool(null_geom or invalid_geom or long_fields or gdf.crs is None),
    }

    if gdf.crs is None:
        report["crs_warning"] = "No .prj/CRS metadata — distance & area will be wrong until set."
    return report
```

Running `preflight_shapefile_check` against a raw regulatory layer reports the exact invalid-geometry count and any over-length field names instead of letting the first overlay throw a `TopologyException` deep in the pipeline.

## Fix implementation

The corrected routine isolates geometry repair, CRS enforcement, and attribute sanitization into discrete, auditable steps. It is engineered for batch processing of regulatory boundary layers, substation footprints, and land-use constraint datasets, with explicit memory controls and quarantine routing. Geometry is repaired before attributes are touched, EPSG:5070 (NAD83 / Conus Albers, an equal-area frame) is enforced so area-based capacity-density figures are trustworthy, and out-of-bounds or null records are written to dedicated quarantine layers rather than dropped.

<svg viewBox="0 0 700 720" role="img" aria-label="Ordered cleaning pipeline with quarantine branches. A raw shapefile is loaded via pyogrio, then checked for null or empty geometry: matching records are quarantined to null_geometries.shp, the rest pass to make_valid with a buffer(0) fallback, then CRS enforcement to EPSG:5070. A bounds check follows: records outside the expected bounds are quarantined to out_of_bounds.shp, the rest are sanitized with a 10-character truncate and numeric coercion, producing a clean GeoDataFrame." xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-width:700px;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="700" height="720"/>
  <title>Deterministic shapefile cleaning pipeline with quarantine routing</title>
  <desc>A top-to-bottom flow down the centre — raw shapefile, load via pyogrio, a null-or-empty-geometry decision, make_valid plus buffer(0) fallback, CRS enforce to EPSG:5070, a within-expected-bounds decision, sanitize attributes (10-character truncate plus numeric coercion), and a clean GeoDataFrame. The null decision branches right on yes to a quarantine box, null_geometries.shp; the bounds decision branches right on no to a quarantine box, out_of_bounds.shp. Repair steps are blue, quarantine boxes are amber, and the final clean output is green.</desc>
  <defs>
    <marker id="pl-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
    </marker>
  </defs>
  <!-- Central flow arrows -->
  <g color="#5BA8C8" stroke="currentColor" stroke-width="1.7" fill="none">
    <path d="M240,70 L240,98" marker-end="url(#pl-arrow)"/>
    <path d="M240,150 L240,183" marker-end="url(#pl-arrow)"/>
    <path d="M240,241 L240,278" marker-end="url(#pl-arrow)"/>
    <path d="M240,336 L240,368" marker-end="url(#pl-arrow)"/>
    <path d="M240,426 L240,458" marker-end="url(#pl-arrow)"/>
    <path d="M240,516 L240,548" marker-end="url(#pl-arrow)"/>
    <path d="M240,606 L240,638" marker-end="url(#pl-arrow)"/>
  </g>
  <!-- Branch labels for central no/yes path -->
  <g fill="currentColor" font-size="11" font-weight="700">
    <text x="248" y="270">no</text>
    <text x="248" y="540">yes</text>
  </g>
  <!-- Quarantine branch arrows -->
  <g color="#F4A261" stroke="currentColor" stroke-width="1.7" fill="none">
    <path d="M350,213 L468,213" marker-end="url(#pl-arrow)"/>
    <path d="M350,488 L468,488" marker-end="url(#pl-arrow)"/>
  </g>
  <g fill="currentColor" font-size="11" font-weight="700">
    <text x="392" y="206">yes</text>
    <text x="396" y="481">no</text>
  </g>
  <!-- Central nodes -->
  <g text-anchor="middle" fill="#1F3A60">
    <!-- Raw shapefile (input) -->
    <rect x="130" y="30" width="220" height="40" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="240" y="55" font-size="13" font-weight="700">Raw shapefile</text>
    <!-- Load -->
    <rect x="130" y="100" width="220" height="50" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="240" y="130" font-size="13">1 &#183; Load via pyogrio</text>
    <!-- Null decision -->
    <rect x="130" y="185" width="220" height="56" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="2" stroke-dasharray="5 3"/>
    <text x="240" y="210" font-size="13" font-weight="700">2 &#183; Null / empty</text>
    <text x="240" y="228" font-size="12">geometry?</text>
    <!-- make_valid -->
    <rect x="130" y="280" width="220" height="56" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="240" y="305" font-size="13">3 &#183; make_valid</text>
    <text x="240" y="323" font-size="12">+ buffer(0) fallback</text>
    <!-- CRS enforce -->
    <rect x="130" y="370" width="220" height="56" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="240" y="395" font-size="13">4 &#183; CRS enforce</text>
    <text x="240" y="413" font-size="12">to EPSG:5070</text>
    <!-- Bounds decision -->
    <rect x="130" y="460" width="220" height="56" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="2" stroke-dasharray="5 3"/>
    <text x="240" y="485" font-size="13" font-weight="700">5 &#183; Within</text>
    <text x="240" y="503" font-size="12">expected bounds?</text>
    <!-- Sanitize -->
    <rect x="130" y="550" width="220" height="56" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="240" y="575" font-size="13">6 &#183; Sanitize attrs</text>
    <text x="240" y="593" font-size="12">10-char + numeric coerce</text>
    <!-- Clean output -->
    <rect x="130" y="640" width="220" height="50" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <text x="240" y="670" font-size="13" font-weight="700">Clean GeoDataFrame</text>
  </g>
  <!-- Quarantine nodes (warning) -->
  <g text-anchor="middle" fill="#1F3A60">
    <rect x="470" y="185" width="218" height="56" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="579" y="210" font-size="13" font-weight="700">Quarantine</text>
    <text x="579" y="228" font-size="12">null_geometries.shp</text>
    <rect x="470" y="460" width="218" height="56" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="579" y="485" font-size="13" font-weight="700">Quarantine</text>
    <text x="579" y="503" font-size="12">out_of_bounds.shp</text>
  </g>
</svg>

```python
import geopandas as gpd
import pandas as pd
from shapely.validation import make_valid
from shapely.geometry import box
import logging
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


def clean_shapefile_pipeline(
    input_path: str,
    target_crs: str = "EPSG:5070",
    encoding: str = "utf-8",
    expected_bounds: tuple = None,
    quarantine_dir: str = "quarantine",
) -> gpd.GeoDataFrame:
    """Deterministic cleaning routine for messy shapefiles in energy GIS pipelines.

    Enforces topology repair, CRS normalization, and attribute sanitization.
    Returns a validated GeoDataFrame and logs/quarantines failed records.
    """
    input_path = Path(input_path)
    quarantine_path = Path(quarantine_dir)
    quarantine_path.mkdir(parents=True, exist_ok=True)

    # 1. Load with explicit engine and encoding; fall back to fiona on failure
    try:
        gdf = gpd.read_file(input_path, engine="pyogrio", encoding=encoding)
    except Exception as e:
        logging.error(f"pyogrio read failed: {e}. Attempting fiona fallback...")
        gdf = gpd.read_file(input_path, encoding=encoding)

    if gdf.empty:
        raise ValueError("Empty dataset or failed attribute read. Verify shapefile integrity.")

    # 2. Null geometry handling & topology repair
    null_mask = gdf.geometry.isna() | gdf.geometry.is_empty
    if null_mask.any():
        logging.warning(f"Quarantining {null_mask.sum()} records with null/empty geometries.")
        gdf[null_mask].to_file(quarantine_path / "null_geometries.shp", driver="ESRI Shapefile")
        gdf = gdf.loc[~null_mask].copy()

    # Shapely 2.x make_valid as primary repair, buffer(0) as fallback
    valid_mask = gdf.geometry.is_valid
    if not valid_mask.all():
        invalid_count = int((~valid_mask).sum())
        logging.info(f"Repairing {invalid_count} invalid geometries via make_valid.")
        gdf.loc[~valid_mask, "geometry"] = gdf.loc[~valid_mask].geometry.apply(make_valid)

        still_invalid = ~gdf.geometry.is_valid
        if still_invalid.any():
            logging.warning(f"Applying zero-buffer fallback to {still_invalid.sum()} geometries.")
            gdf.loc[still_invalid, "geometry"] = gdf.loc[still_invalid].geometry.buffer(0)

    # 3. CRS enforcement & validation
    if gdf.crs is None:
        logging.warning("Missing CRS metadata. Assuming EPSG:4326 before reprojection.")
        gdf.set_crs("EPSG:4326", inplace=True)

    if str(gdf.crs) != target_crs:
        logging.info(f"Transforming from {gdf.crs} to {target_crs}.")
        gdf = gdf.to_crs(target_crs)

    # 4. Spatial bounds validation (upstream/downstream alignment)
    if expected_bounds:
        bounds_box = box(*expected_bounds)
        out_of_bounds = ~gdf.geometry.intersects(bounds_box)
        if out_of_bounds.any():
            logging.warning(f"Quarantining {out_of_bounds.sum()} records outside project bounds.")
            gdf[out_of_bounds].to_file(quarantine_path / "out_of_bounds.shp", driver="ESRI Shapefile")
            gdf = gdf[~out_of_bounds]

    # 5. Attribute sanitization (10-char limit, numeric coercion, encoding safety)
    gdf.columns = [col[:10] if (col != "geometry" and len(col) > 10) else col for col in gdf.columns]

    for col in gdf.select_dtypes(include=["object"]).columns:
        if col == "geometry":
            continue
        coerced = pd.to_numeric(gdf[col], errors="coerce")
        # Only adopt coercion when it does not destroy a genuinely textual column
        if coerced.notna().mean() >= 0.9:
            gdf[col] = coerced

    gdf = gdf.reset_index(drop=True)
    logging.info(f"Pipeline complete. {len(gdf)} valid records retained.")
    return gdf
```

### Why these parameter choices

- **`make_valid` before `buffer(0)`.** `shapely.validation.make_valid` decomposes invalid rings into valid components while preserving topology; `buffer(0)` is a cruder ring-normaliser kept only as a fallback for geometries `make_valid` cannot resolve. After repair, assert `gdf.geometry.area > 0` — zero- or negative-area geometries are collapsed rings that will skew capacity-density figures. For transmission corridor routing, explode multipart geometries with `gdf.explode(index_parts=True)` before a routing algorithm consumes them, consistent with the [transmission line and substation mapping](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/) workflow.
- **EPSG:5070 as the target.** An equal-area frame keeps continental-US area calculations honest. Default to EPSG:4326 *only* when metadata is absent, then reproject. After transformation, projected metres should fall roughly within `[-2e6, 3e6]` for CONUS; lat/lon-range values surviving in a projected CRS signal a failed transform.
- **Conditional numeric coercion.** `pd.to_numeric(..., errors="coerce")` is only adopted when at least 90% of values parse, so a genuinely textual land-use or regulatory-ID column is never silently nulled. Maintain a companion metadata CSV mapping full column names to their truncated `.dbf` headers to preserve audit traceability without violating the shapefile spec.

## Fallback routing & performance tuning

For national-scale layers, CI/CD runs, and memory-constrained cloud nodes, layer these strategies on top of the core routine:

<svg viewBox="0 0 940 400" role="img" aria-label="The Shapefile format limits that produce most of the defects a cleaning pipeline has to repair, compared against GeoPackage and GeoParquet. A .dbf attribute file caps field names at 10 characters and the file at 2 gigabytes, has no reliable encoding declaration and no null value, and stores dates but not timestamps. GeoPackage and GeoParquet impose none of these, which is why the durable fix is to convert once at ingestion rather than repair repeatedly downstream." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>The format limits behind the mess — and the two formats without them</title>
  <desc>A comparison table with three columns — Shapefile, GeoPackage and GeoParquet — over five rows. Field name length: 10 characters for Shapefile, unlimited for the other two. File size ceiling: 2 gigabytes per component for Shapefile, effectively unlimited otherwise. Text encoding: undeclared and often mis-guessed for Shapefile, UTF-8 for both others. Null handling: no null, so a zero means both zero and missing, versus true nulls. Timestamps: date only for Shapefile, full timestamps for the others.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="fl-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Most “messy shapefile” defects are the format, not the author</text>
  <text x="396" y="70" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">Shapefile (.shp/.dbf)</text>
  <text x="608" y="70" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">GeoPackage</text>
  <text x="820" y="70" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">GeoParquet</text>
  <text x="28" y="108" text-anchor="start" font-size="11.5" fill="currentColor">Field name length</text>
  <rect x="300" y="84" width="196" height="38" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2"/>
  <text x="398" y="108" text-anchor="middle" font-size="11" fill="currentColor">10 characters</text>
  <rect x="512" y="84" width="196" height="38" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="610" y="108" text-anchor="middle" font-size="11" fill="currentColor">unlimited</text>
  <rect x="724" y="84" width="196" height="38" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="822" y="108" text-anchor="middle" font-size="11" fill="currentColor">unlimited</text>
  <text x="28" y="154" text-anchor="start" font-size="11.5" fill="currentColor">File size ceiling</text>
  <rect x="300" y="130" width="196" height="38" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2"/>
  <text x="398" y="154" text-anchor="middle" font-size="11" fill="currentColor">2 GB per component</text>
  <rect x="512" y="130" width="196" height="38" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="610" y="154" text-anchor="middle" font-size="11" fill="currentColor">effectively none</text>
  <rect x="724" y="130" width="196" height="38" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="822" y="154" text-anchor="middle" font-size="11" fill="currentColor">effectively none</text>
  <text x="28" y="200" text-anchor="start" font-size="11.5" fill="currentColor">Text encoding</text>
  <rect x="300" y="176" width="196" height="38" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2"/>
  <text x="398" y="200" text-anchor="middle" font-size="11" fill="currentColor">undeclared — guessed</text>
  <rect x="512" y="176" width="196" height="38" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="610" y="200" text-anchor="middle" font-size="11" fill="currentColor">UTF-8</text>
  <rect x="724" y="176" width="196" height="38" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="822" y="200" text-anchor="middle" font-size="11" fill="currentColor">UTF-8</text>
  <text x="28" y="246" text-anchor="start" font-size="11.5" fill="currentColor">Null values</text>
  <rect x="300" y="222" width="196" height="38" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2"/>
  <text x="398" y="246" text-anchor="middle" font-size="11" fill="currentColor">none — 0 means both</text>
  <rect x="512" y="222" width="196" height="38" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="610" y="246" text-anchor="middle" font-size="11" fill="currentColor">true nulls</text>
  <rect x="724" y="222" width="196" height="38" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="822" y="246" text-anchor="middle" font-size="11" fill="currentColor">true nulls</text>
  <text x="28" y="292" text-anchor="start" font-size="11.5" fill="currentColor">Time values</text>
  <rect x="300" y="268" width="196" height="38" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="398" y="292" text-anchor="middle" font-size="11" fill="currentColor">date only</text>
  <rect x="512" y="268" width="196" height="38" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="610" y="292" text-anchor="middle" font-size="11" fill="currentColor">full timestamp</text>
  <rect x="724" y="268" width="196" height="38" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="822" y="292" text-anchor="middle" font-size="11" fill="currentColor">full timestamp</text>
  <rect x="28" y="322" width="876" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="466.0" y="343" text-anchor="middle" font-size="11.5" fill="currentColor">Cleaning a shapefile fixes one delivery. Converting to GeoPackage or GeoParquet at ingestion fixes every</text>
  <text x="466.0" y="360" text-anchor="middle" font-size="11.5" fill="currentColor">delivery after it — the truncated field names and the guessed encoding simply stop happening.</text>
</svg>

- **Prune columns at read time.** Pass `columns=["geometry", "OBJECTID", "CAP_MW"]` to `gpd.read_file()` so the heavy `.dbf` attributes never enter memory before repair — this cuts peak RAM sharply on wide regulatory tables.
- **Chunk or convert beyond ~500k features.** Topology validation is the memory hot spot; for very large environmental layers, process in batches or stage intermediates as GeoParquet rather than re-reading the shapefile, which also sidesteps the `.dbf` encoding round-trip.
- **Quarantine, never drop.** `null_geometries.shp` and `out_of_bounds.shp` carry the same attribute schema as the source, so an analyst can correct source digitizing errors and re-ingest without halting the automated run.
- **Pin the GDAL/PROJ stack.** Pin `pyogrio`/`pyproj` to exact versions in `requirements.txt` so the bundled PROJ datum database is identical across CI/CD and production, keeping reprojection deterministic.
- **Isolate repair failures.** Wrap the per-feature repair in a `try/except` for `shapely.errors.GEOSException`; on failure, route the feature to quarantine and continue rather than crashing the whole batch.

## Downstream validation

Gate the cleaned output in CI/CD with an assertion that fails the build on residual invalidity, CRS drift, or attribute regressions — the same audit posture used across the [grid capacity buffer analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) and proximity workflows.

```python
from datetime import datetime, timezone


def audit_clean_shapefile(gdf, expected_crs: str = "EPSG:5070") -> dict:
    """Assert cleaning integrity. Raises AssertionError on any CI/CD-blocking issue."""
    assert gdf.crs is not None, "Output CRS is undefined."
    assert str(gdf.crs) == expected_crs, f"CRS drift: expected {expected_crs}, got {gdf.crs}"

    invalid = int((~gdf.geometry.is_valid).sum())
    assert invalid == 0, f"{invalid} invalid geometries remain after repair."

    null_geom = int(gdf.geometry.isna().sum() + gdf.geometry.is_empty.sum())
    assert null_geom == 0, f"{null_geom} null/empty geometries leaked past quarantine."

    long_fields = [c for c in gdf.columns if c != "geometry" and len(c) > 10]
    assert not long_fields, f"Fields exceed .dbf 10-char limit: {long_fields}"

    return {
        "feature_count": len(gdf),
        "target_crs": str(gdf.crs),
        "all_geometries_valid": invalid == 0,
        "min_area_m2": round(float(gdf.geometry.area.min()), 2),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
```

Attaching the returned audit dictionary to each deliverable preserves data lineage, satisfies ISO 19115 metadata expectations, and lets a permitting authority or independent engineer reproduce exactly how a cleaned layer was derived before it feeds an interconnection study or environmental screening.

## Related

- [Spatial Data Quality & Validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) — the parent workflow defining the validation contract this cleaning routine belongs to.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — the projection discipline that the CRS-enforcement step depends on.
- [Automating US County Boundary Extraction with OSMnx](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/automating-us-county-boundary-extraction-with-osmnx/) — a sibling ingestion routine that produces layers this pipeline cleans.
- [Mapping High-Voltage Transmission Lines from OpenStreetMap](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/mapping-high-voltage-transmission-lines-from-openstreetmap/) — a downstream consumer of repaired, multipart-exploded geometry.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "headline": "Best Practices for Cleaning Messy Shapefiles in GeoPandas",
      "description": "Fix the TopologyException, CRSError, and attribute truncation failures that messy shapefiles trigger in energy GIS pipelines — a pre-flight diagnostic, a deterministic make_valid + CRS-enforce cleaning routine, quarantine routing, and a CI/CD audit gate.",
      "datePublished": "2025-10-09",
      "dateModified": "2026-06-26",
      "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/best-practices-for-cleaning-messy-shapefiles-in-geopandas/",
      "author": { "@type": "Organization", "name": "Renewable Energy Grid GIS" },
      "publisher": { "@type": "Organization", "name": "Renewable Energy Grid GIS" },
      "isPartOf": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/",
      "keywords": "geopandas, shapefile cleaning, make_valid, TopologyException, EPSG:5070, EPSG:4326, pyogrio, CRS validation, dbf field limit, energy GIS"
    },
    {
      "@type": "HowTo",
      "name": "Clean a messy shapefile for an energy GIS pipeline",
      "description": "Diagnose, repair geometry, enforce CRS, sanitize attributes, and audit a shapefile so it is safe for renewable siting and grid routing workflows.",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Run a pre-flight diagnostic to surface invalid geometry, missing CRS, and over-length fields", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/best-practices-for-cleaning-messy-shapefiles-in-geopandas/#pre-flight-validation" },
        { "@type": "HowToStep", "position": 2, "name": "Repair geometry with make_valid and a buffer(0) fallback, enforce EPSG:5070, and sanitize attributes", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/best-practices-for-cleaning-messy-shapefiles-in-geopandas/#fix-implementation" },
        { "@type": "HowToStep", "position": 3, "name": "Route null and out-of-bounds records to quarantine layers instead of dropping them", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/best-practices-for-cleaning-messy-shapefiles-in-geopandas/#fallback-routing-performance-tuning" },
        { "@type": "HowToStep", "position": 4, "name": "Gate the cleaned output with a CI/CD audit assertion", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/best-practices-for-cleaning-messy-shapefiles-in-geopandas/#downstream-validation" }
      ]
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.renewable-energy-grid-gis.org/" },
        { "@type": "ListItem", "position": 2, "name": "Core Energy-GIS Data & Spatial Fundamentals", "item": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/" },
        { "@type": "ListItem", "position": 3, "name": "Spatial Data Quality & Validation", "item": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/" },
        { "@type": "ListItem", "position": 4, "name": "Cleaning Messy Shapefiles in GeoPandas", "item": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/best-practices-for-cleaning-messy-shapefiles-in-geopandas/" }
      ]
    }
  ]
}
</script>
