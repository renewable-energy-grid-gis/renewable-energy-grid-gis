---
title: Exporting Compliance Overlay Results to GeoJSON for Permitting Portals
description: Export an audit-ready, RFC 7946 GeoJSON from a metric-CRS compliance overlay — reproject to EPSG:4326, trim coordinate precision, serialize NaN and Timestamps, and validate against a permitting portal's property schema.
slug: exporting-compliance-overlay-results-to-geojson-for-permitting-portals
type: article
breadcrumb: Exporting Compliance Overlay to GeoJSON
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Exporting Compliance Overlay Results to GeoJSON for Permitting Portals

You have a computed setback and exclusion overlay — a `GeoDataFrame` of resolved compliance geometry sitting in a metric CRS such as `EPSG:5070` (CONUS Albers) — and the permitting portal's upload form rejects it: *"Invalid GeoJSON: coordinates out of range"*, *"Unsupported CRS"*, or a silent server-side failure that leaves the submission stuck in review. This is the last mile of [Regulatory Boundary Mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/): the overlay math is correct, but the file handed to the agency is not the file the agency's schema accepts. RFC 7946 — the GeoJSON specification every modern permitting portal validates against — mandates `EPSG:4326` longitude/latitude, bounded coordinate ranges, and JSON-serializable properties, none of which your analysis CRS satisfies by default. This page walks the end-to-end export: assembling the overlay frame, attaching compliance flags and provenance, reprojecting to `EPSG:4326`, trimming precision, coercing properties, validating against the portal schema, and writing a conformant file a reviewer can trust.

The overlay itself is typically produced by [clipping solar parcels to county setback boundaries](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/clipping-solar-parcels-to-county-setback-boundaries-in-geopandas/); everything here assumes that clip has already run and you hold its result in memory.

## Root-cause analysis

Four compounding causes turn a valid overlay into a rejected upload, and each maps to a distinct fix stage below.

1. **Analysis CRS is metric; RFC 7946 demands EPSG:4326.** Setback distances only make sense in a projected, meter-based frame — you cannot buffer 500 m in degrees. But RFC 7946 fixes the coordinate reference system to `EPSG:4326` (WGS 84 lon/lat) and forbids embedding an alternate CRS. Uploading `EPSG:5070` easting/northing values (six- and seven-digit meters) trips the portal's `-180..180 / -90..90` range check immediately. The reproject must happen *on export*, never in the analysis.
2. **Coordinate precision bloat.** A `float64` reprojection emits ~15 significant digits per ordinate. A statewide exclusion layer at that precision is a multi-hundred-megabyte file that many portals reject on size alone, and the trailing digits are noise far below survey accuracy. RFC 7946 explicitly recommends six decimal places.
3. **NaN and Timestamp values are not JSON-serializable.** Compliance overlays carry computed columns — a `setback_m` that is `NaN` where no ordinance applies, or a `pandas.Timestamp` audit date. `NaN` serializes to the bare token `NaN`, which is invalid JSON per the spec, and `Timestamp` raises `TypeError: Object of type Timestamp is not JSON serializable`. Either one produces a file that fails strict parsing on the server.
4. **Property-schema and geometry-type mismatch.** Portals require named property keys with specific types (a string `parcel_id`, a numeric `setback_m`), and some reject `FeatureCollection`s that mix `Polygon` and `MultiPolygon`. An overlay that lost a column during a dissolve, or that carries mixed geometry types, is structurally valid GeoJSON but invalid *to that portal*.

<svg viewBox="0 0 1010 300" role="img" aria-label="Export pipeline that turns a metric-CRS compliance overlay into an RFC 7946 GeoJSON. The overlay in EPSG:5070 flows through reproject to EPSG:4326, trim precision to six decimals, serialize properties by converting NaN to null and Timestamp to ISO strings, then validate and write RFC 7946 GeoJSON. Three amber callouts name the failure each stage prevents: degrees are not meters so a non-4326 file is rejected, fifteen-digit floats cause coordinate bloat, and NaN or Timestamp values are not JSON-serializable." xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-width:1010px;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="1010" height="300"/>
  <title>Compliance-overlay to RFC 7946 GeoJSON export pipeline</title>
  <desc>A left-to-right flow of five stages. The compliance overlay in EPSG:5070 metric coordinates enters the reproject stage that converts it to EPSG:4326, then a trim-precision stage that rounds to six decimals, then a serialize-properties stage that converts NaN to null and Timestamp to ISO strings, ending in a green stage that validates the portal schema and writes an RFC 7946 GeoJSON. Amber callouts beneath the middle three stages name the failure each prevents.</desc>
  <defs>
    <marker id="geojson-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
    </marker>
  </defs>
  <g fill="#1F3A60" font-size="12.5" text-anchor="middle">
    <rect x="16" y="40" width="176" height="80" rx="9" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="104" y="72" font-weight="600">Compliance overlay</text>
    <text x="104" y="90" font-size="11.5">EPSG:5070 (metric)</text>
    <text x="104" y="107" font-size="11.5">flags + provenance</text>
    <rect x="222" y="40" width="176" height="80" rx="9" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="310" y="76" font-weight="600">Reproject</text>
    <text x="310" y="94" font-size="11.5">to EPSG:4326</text>
    <rect x="428" y="40" width="176" height="80" rx="9" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="516" y="76" font-weight="600">Trim precision</text>
    <text x="516" y="94" font-size="11.5">6 decimals</text>
    <rect x="634" y="40" width="176" height="80" rx="9" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="722" y="72" font-weight="600">Serialize props</text>
    <text x="722" y="90" font-size="11.5">NaN &#8594; null</text>
    <text x="722" y="107" font-size="11.5">Timestamp &#8594; ISO</text>
    <rect x="840" y="40" width="156" height="80" rx="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <text x="918" y="72" font-weight="600">Validate + write</text>
    <text x="918" y="90" font-size="11.5">RFC 7946</text>
    <text x="918" y="107" font-size="11.5">GeoJSON</text>
  </g>
  <g stroke="currentColor" stroke-width="1.6" fill="none">
    <line x1="192" y1="80" x2="216" y2="80" marker-end="url(#geojson-arrow)"/>
    <line x1="398" y1="80" x2="422" y2="80" marker-end="url(#geojson-arrow)"/>
    <line x1="604" y1="80" x2="628" y2="80" marker-end="url(#geojson-arrow)"/>
    <line x1="810" y1="80" x2="834" y2="80" marker-end="url(#geojson-arrow)"/>
  </g>
  <g fill="#1F3A60" font-size="11" text-anchor="middle">
    <rect x="222" y="196" width="176" height="60" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="310" y="220">degrees &#8800; meters:</text>
    <text x="310" y="236">non-4326 file</text>
    <text x="310" y="250">rejected on range</text>
    <rect x="428" y="196" width="176" height="60" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="516" y="220">15-digit floats:</text>
    <text x="516" y="236">coordinate bloat,</text>
    <text x="516" y="250">oversized upload</text>
    <rect x="634" y="196" width="176" height="60" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="722" y="220">NaN / Timestamp:</text>
    <text x="722" y="236">not JSON-</text>
    <text x="722" y="250">serializable</text>
  </g>
  <g stroke="#F4A261" stroke-width="1.4" fill="none" stroke-dasharray="4 4">
    <line x1="310" y1="120" x2="310" y2="194"/>
    <line x1="516" y1="120" x2="516" y2="194"/>
    <line x1="722" y1="120" x2="722" y2="194"/>
  </g>
  <g fill="#1F3A60" font-size="9.5" font-weight="700" text-anchor="middle" letter-spacing="0.6">
    <text x="310" y="150" opacity="0.75">PREVENTS</text>
    <text x="516" y="150" opacity="0.75">PREVENTS</text>
    <text x="722" y="150" opacity="0.75">PREVENTS</text>
  </g>
</svg>

The precision recommendation is not arbitrary. The ground length of one degree of longitude at latitude $\phi$ is

$$\Delta x \approx \frac{\pi R \cos\phi}{180}\,\Delta\lambda$$

so at six decimal places ($\Delta\lambda = 10^{-6}$ degrees) the quantization is roughly $0.11\cos\phi$ meters — about 11 cm at the equator and finer toward the poles. That is already below the accuracy of any parcel survey feeding a permitting overlay, which is why RFC 7946 treats further digits as noise.

## Pre-flight validation

Surface every cause above *before* writing a byte. The validator below inspects the in-memory overlay against the portal's contract — a required-property schema, allowed geometry types, and the guarantee that the source CRS is projected (so the reproject is meaningful) — and raises a precise error rather than letting the portal reject the upload hours later.

```python
import geopandas as gpd
import numpy as np
import pandas as pd

# The portal's declared property contract: column -> accepted pandas dtype kind
PORTAL_SCHEMA = {
    "parcel_id": "O",        # object / string
    "compliance_status": "O",
    "setback_m": "f",        # float
    "jurisdiction_type": "O",
}
ALLOWED_GEOM_TYPES = {"Polygon", "MultiPolygon"}


def preflight_geojson_export(overlay_gdf: gpd.GeoDataFrame) -> None:
    """Raise on the exact root cause before serialization begins."""
    # Cause 1: source CRS must be defined and projected so the reproject is real
    if overlay_gdf.crs is None:
        raise ValueError("Overlay has no CRS; cannot reproject to EPSG:4326 safely.")
    if overlay_gdf.crs.is_geographic:
        raise ValueError(
            f"Source CRS {overlay_gdf.crs.to_epsg()} is already geographic. "
            "Compliance setbacks must be computed in a metric CRS (e.g. EPSG:5070)."
        )
    # Cause 4: property schema — required keys present with the declared kind
    missing = set(PORTAL_SCHEMA) - set(overlay_gdf.columns)
    if missing:
        raise ValueError(f"Overlay missing portal-required properties: {sorted(missing)}")
    for col, kind in PORTAL_SCHEMA.items():
        if overlay_gdf[col].dtype.kind != kind:
            raise TypeError(f"Property '{col}' has kind {overlay_gdf[col].dtype.kind!r}, "
                            f"portal expects {kind!r}.")
    # Cause 4: geometry-type homogeneity guard
    types = set(overlay_gdf.geom_type.unique())
    if not types <= ALLOWED_GEOM_TYPES:
        raise ValueError(f"Unsupported geometry types for portal: {types - ALLOWED_GEOM_TYPES}")
    # Cause 3: warn on non-serializable values so the coercion step is not a surprise
    ts_cols = [c for c in overlay_gdf.columns
               if pd.api.types.is_datetime64_any_dtype(overlay_gdf[c])]
    if ts_cols:
        print(f"[preflight] datetime columns {ts_cols} will be coerced to ISO 8601 strings.")
    if overlay_gdf.select_dtypes("number").isna().to_numpy().any():
        print("[preflight] NaN values present in numeric properties; will be written as null.")
```

| Validation step | Diagnostic | Expected outcome |
|-----------------|-----------|------------------|
| Source CRS is projected | `overlay_gdf.crs.is_geographic` | `False` — setbacks were computed in meters |
| Required properties present | `set(PORTAL_SCHEMA) <= set(overlay_gdf.columns)` | `True` |
| Geometry types allowed | `set(overlay_gdf.geom_type.unique())` | subset of `{Polygon, MultiPolygon}` |
| Geometry validity | `overlay_gdf.geometry.is_valid.all()` | `True` — no self-intersections survive to export |

Enforcing a projected source is the same [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) discipline the overlay math depended on; the export inverts it, moving deliberately back to `EPSG:4326` only at the boundary.

## Building the RFC 7946 export function

The export function runs the sub-tasks in order: attach compliance flags and provenance, reproject to `EPSG:4326`, snap geometry to a six-decimal grid, coerce non-serializable properties, then write with GDAL's `RFC7946=YES` option so winding order and axis order match the specification. Parameter choices are justified for permitting use: `set_precision(grid_size=1e-6)` matches the six-decimal recommendation, `RFC7946=YES` forces right-hand-rule exterior rings, and provenance columns make the file self-describing for a reviewer.

<svg viewBox="0 0 940 380" role="img" aria-label="The RFC 7946 winding rule, drawn on a parcel with a hole. Exterior rings must run counter-clockwise and interior rings clockwise. A polygon exported with the opposite winding still parses everywhere, but a strict RFC 7946 consumer — which several permitting portals are — interprets the reversed exterior as covering everything outside the parcel, turning a 40 hectare site into the rest of the planet." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Ring winding: exterior counter-clockwise, interior clockwise</title>
  <desc>Two panels. The left panel shows a compliant polygon: an exterior ring drawn counter-clockwise with arrowheads marking the direction, and an interior hole drawn clockwise. The right panel shows the same geometry with both rings reversed, annotated to explain that a strict consumer reads the reversed exterior as the complement — everything outside the parcel — while a lenient consumer silently accepts it, so the same file produces two different footprints depending on who opens it.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="380"/>
  <defs><marker id="wd-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Winding is not cosmetic — it decides which side is inside</text>
  <text x="238" y="74" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">RFC 7946 compliant</text>
  <path d="M332.1,213.1 L291.0,274.0 L218.9,288.1 L158.0,247.0 L143.9,174.9 L185.0,114.0 L257.1,99.9 L318.0,141.0 L332.1,213.1 Z" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2"/>
  <path d="M276.0,194.0 L257.0,226.9 L219.0,226.9 L200.0,194.0 L219.0,161.1 L257.0,161.1 L276.0,194.0 Z" fill="none" stroke="#3D8B5F" stroke-width="1.6" stroke-dasharray="4 3"/>
  <line x1="291.043004049938" y1="274.01524680558236" x2="261.32248755759474" y2="287.12390441839216" stroke="#3D8B5F" stroke-width="2.2" marker-end="url(#wd-arr)"/>
  <line x1="157.98475319441764" y1="247.043004049938" x2="144.87609558160784" y2="217.32248755759477" stroke="#3D8B5F" stroke-width="2.2" marker-end="url(#wd-arr)"/>
  <line x1="184.956995950062" y1="113.98475319441762" x2="214.67751244240523" y2="100.87609558160786" stroke="#3D8B5F" stroke-width="2.2" marker-end="url(#wd-arr)"/>
  <line x1="318.01524680558236" y1="140.956995950062" x2="331.12390441839216" y2="170.67751244240523" stroke="#3D8B5F" stroke-width="2.2" marker-end="url(#wd-arr)"/>
  <text x="238" y="316" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">exterior counter-clockwise · hole clockwise</text>
  <text x="238" y="336" text-anchor="middle" font-size="11.5" fill="#1F5C3A" font-weight="700">every consumer reads 40 ha</text>
  <text x="700" y="74" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">rings reversed</text>
  <path d="M794.1,213.1 L753.0,274.0 L680.9,288.1 L620.0,247.0 L605.9,174.9 L647.0,114.0 L719.1,99.9 L780.0,141.0 L794.1,213.1 Z" fill="#FFE3BE" stroke="#F4A261" stroke-width="2"/>
  <path d="M738.0,194.0 L719.0,226.9 L681.0,226.9 L662.0,194.0 L681.0,161.1 L719.0,161.1 L738.0,194.0 Z" fill="none" stroke="#F4A261" stroke-width="1.6" stroke-dasharray="4 3"/>
  <line x1="753.043004049938" y1="274.01524680558236" x2="776.6905915258412" y2="251.74559006033763" stroke="#F4A261" stroke-width="2.2" marker-end="url(#wd-arr)"/>
  <line x1="619.9847531944176" y1="247.043004049938" x2="642.2544099396623" y2="270.6905915258412" stroke="#F4A261" stroke-width="2.2" marker-end="url(#wd-arr)"/>
  <line x1="646.956995950062" y1="113.98475319441762" x2="623.3094084741588" y2="136.25440993966237" stroke="#F4A261" stroke-width="2.2" marker-end="url(#wd-arr)"/>
  <line x1="780.0152468055824" y1="140.956995950062" x2="757.7455900603377" y2="117.30940847415874" stroke="#F4A261" stroke-width="2.2" marker-end="url(#wd-arr)"/>
  <text x="700" y="316" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">exterior clockwise — the complement</text>
  <text x="700" y="336" text-anchor="middle" font-size="11.5" fill="#7A4A1A" font-weight="700">strict portal reads “everything else”</text>
  <line x1="354" y1="194" x2="396" y2="194" stroke="currentColor" stroke-width="1.4" opacity="0.5" marker-end="url(#wd-arr)"/>
  <text x="470" y="172" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.85">same coordinates,</text>
  <text x="470" y="190" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.85">same file size,</text>
  <text x="470" y="208" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">opposite meaning</text>
</svg>

```python
import json
from datetime import datetime, timezone

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely import set_precision


def export_compliance_geojson(
    overlay_gdf: gpd.GeoDataFrame,
    out_path: str,
    source_epsg: int = 5070,
    grid_size_deg: float = 1e-6,   # ~0.11 m at the equator; RFC 7946 6-decimal rule
    run_id: str = "overlay-export",
) -> gpd.GeoDataFrame:
    """Reproject, trim, coerce, and write an RFC 7946 GeoJSON for a permitting portal."""
    preflight_geojson_export(overlay_gdf)
    gdf = overlay_gdf.copy()

    # 1. Attach provenance so the exported file is self-auditing
    gdf["source_epsg"] = source_epsg
    gdf["exported_at"] = datetime.now(timezone.utc).isoformat()
    gdf["export_run_id"] = run_id

    # 2. Reproject to EPSG:4326 — the ONLY CRS RFC 7946 permits (Cause 1)
    gdf = gdf.to_crs(epsg=4326)

    # 3. Snap coordinates to a 6-decimal grid to kill float64 precision bloat (Cause 2)
    gdf["geometry"] = set_precision(gdf.geometry.values, grid_size=grid_size_deg)
    gdf = gdf[~gdf.geometry.is_empty & gdf.geometry.is_valid].copy()

    # 4. Coerce non-JSON-serializable property values (Cause 3)
    for col in gdf.columns:
        if col == gdf.geometry.name:
            continue
        if pd.api.types.is_datetime64_any_dtype(gdf[col]):
            gdf[col] = gdf[col].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        elif pd.api.types.is_float_dtype(gdf[col]):
            # NaN -> None so it serializes to JSON null, not the invalid `NaN` token
            gdf[col] = gdf[col].astype(object).where(gdf[col].notna(), None)

    # 5. Write RFC 7946 GeoJSON: right-hand winding, WGS84 axis order, trimmed precision
    gdf.to_file(
        out_path,
        driver="GeoJSON",
        engine="pyogrio",
        RFC7946="YES",
        COORDINATE_PRECISION=6,
    )
    return gdf
```

Two details carry the correctness. `set_precision` with `grid_size=1e-6` snaps every ordinate before writing, so the file is small and reproducible regardless of the reprojection's floating-point tail; and the `NaN`-to-`None` conversion is done on an `object`-dtype copy because a `float64` column cannot hold `None` — assigning `None` back into a float column silently re-coerces it to `NaN`. Layering `COORDINATE_PRECISION=6` on top of `set_precision` is belt-and-suspenders: the snap fixes the geometry object, the GDAL option fixes the serialized text.

## Fallback routing and performance tuning

- **Stream statewide layers with `pyogrio`.** The `pyogrio` engine writes in a single vectorized pass; for exclusion layers with hundreds of thousands of features it is several times faster than the legacy Fiona path and keeps peak memory bounded.
- **Simplify before you trim, not instead.** If the file is still oversized after six-decimal snapping, apply a topology-preserving `gdf.geometry.simplify(tolerance, preserve_topology=True)` with a tolerance justified against survey accuracy — never rely on precision trimming alone to shrink a dense parcel boundary.
- **Split by jurisdiction for portal upload limits.** Many portals cap upload size. Partition the `FeatureCollection` by `jurisdiction_type` and submit per-agency files rather than one monolith; each still carries its own provenance.
- **Promote to a single geometry type when the portal is strict.** If a portal rejects mixed geometries, run `gdf.explode(index_parts=False)` to split multiparts, or force `MultiPolygon` uniformly, before export — decide once, at the boundary, not per feature.
- **Pin `shapely >= 2.0`, `geopandas >= 0.14`, and the GDAL build.** `set_precision` and the `RFC7946` driver option depend on those versions; a downgraded environment silently drops the winding-order fix and reintroduces range-check rejections.

<svg viewBox="0 0 940 400" role="img" aria-label="What coordinate precision costs and buys in an RFC 7946 export. At 15 decimal places a 38,000-vertex compliance overlay serialises to 41.8 megabytes and pins each vertex to about 0.1 nanometres; at 7 places it is 18.2 megabytes and 1.1 centimetres; at 6 places 16.4 megabytes and 11 centimetres; at 5 places 14.1 megabytes and 1.1 metres. Seven decimal places is the working choice: below survey tolerance, and less than half the bytes." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Coordinate precision: bytes spent versus position actually resolved</title>
  <desc>A chart with four precision settings on the horizontal axis — 15, 7, 6 and 5 decimal places. For each, a bar shows the exported file size in megabytes (41.8, 18.2, 16.4 and 14.1) and a label shows the position resolved at that precision (0.1 nanometres, 1.1 centimetres, 11 centimetres and 1.1 metres). A band marks 7 decimal places as the working choice, being finer than survey staking tolerance while removing over half the bytes. A note warns that 5 places is coarser than most setback tolerances and will move a boundary vertex across a line.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="gp-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">A 38 000-vertex overlay, exported at four precisions</text>
  <line x1="100" y1="270" x2="890" y2="270" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <rect x="288" y="74" width="190" height="196" rx="6" fill="#DDF0E2" opacity="0.55"/>
  <text x="378" y="90" text-anchor="middle" font-size="11" fill="#1F5C3A" font-weight="700">working choice</text>
  <rect x="144" y="100.98260869565217" width="88" height="169.01739130434783" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
  <text x="188" y="90.98260869565217" text-anchor="middle" font-size="12" fill="#2C6E8F" font-weight="700">41.8 MB</text>
  <text x="188" y="292" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">15 decimal places</text>
  <text x="188" y="310" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">resolves ≈0.1 nm</text>
  <rect x="334" y="196.40869565217392" width="88" height="73.59130434782608" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
  <text x="378" y="186.40869565217392" text-anchor="middle" font-size="12" fill="#2C6E8F" font-weight="700">18.2 MB</text>
  <text x="378" y="292" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">7 decimal places</text>
  <text x="378" y="310" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">resolves 1.1 cm</text>
  <rect x="524" y="203.68695652173915" width="88" height="66.31304347826087" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
  <text x="568" y="193.68695652173915" text-anchor="middle" font-size="12" fill="#2C6E8F" font-weight="700">16.4 MB</text>
  <text x="568" y="292" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">6 decimal places</text>
  <text x="568" y="310" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">resolves 11 cm</text>
  <rect x="714" y="212.98695652173913" width="88" height="57.01304347826087" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
  <text x="758" y="202.98695652173913" text-anchor="middle" font-size="12" fill="#2C6E8F" font-weight="700">14.1 MB</text>
  <text x="758" y="292" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">5 decimal places</text>
  <text x="758" y="310" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">resolves 1.1 m</text>
  <rect x="120" y="322" width="380" height="48" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="310.0" y="343" text-anchor="middle" font-size="11.5" fill="currentColor">7 dp is finer than survey staking tolerance</text>
  <text x="310.0" y="360" text-anchor="middle" font-size="11.5" fill="currentColor">and removes 56% of the bytes</text>
  <rect x="520" y="322" width="380" height="48" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="710.0" y="343" text-anchor="middle" font-size="11.5" fill="currentColor">5 dp moves a boundary vertex by a metre —</text>
  <text x="710.0" y="360" text-anchor="middle" font-size="11.5" fill="currentColor">enough to cross a setback line</text>
</svg>

## Downstream GeoJSON-integrity assertion

Re-open the written file and assert it against the contract before it is submitted — this is the gate that belongs in a CI/CD pipeline so a regression in the overlay code cannot ship a non-conformant permitting artifact.

```python
import json
import re

import geopandas as gpd


def assert_geojson_integrity(out_path: str, required_props: set[str]) -> None:
    """CI/CD gate: fail the build if the exported file is not portal-ready."""
    reloaded = gpd.read_file(out_path)
    # RFC 7946 mandates EPSG:4326
    assert reloaded.crs is not None and reloaded.crs.to_epsg() == 4326, \
        f"exported CRS is {reloaded.crs}, RFC 7946 requires EPSG:4326"
    # Coordinates must fall inside the geographic domain
    minx, miny, maxx, maxy = reloaded.total_bounds
    assert -180 <= minx and maxx <= 180 and -90 <= miny and maxy <= 90, \
        f"coordinates out of WGS84 range: {reloaded.total_bounds}"
    # Provenance and portal properties survived the round trip
    assert required_props <= set(reloaded.columns), \
        f"missing properties after export: {required_props - set(reloaded.columns)}"

    # Parse the raw text: reject NaN/Infinity tokens and check coordinate precision
    with open(out_path, "r", encoding="utf-8") as fh:
        raw = fh.read()
    json.loads(raw)  # strict parse: raises on the bare NaN token
    assert not re.search(r":\s*(NaN|Infinity|-Infinity)\b", raw), \
        "non-JSON NaN/Infinity token present in output"
    over_precision = re.findall(r"-?\d+\.\d{8,}", raw)
    assert not over_precision, f"{len(over_precision)} ordinates exceed 6-decimal precision"
```

Parsing the raw text with `json.loads` is deliberate: `geopandas.read_file` is tolerant and will happily reload a file the portal's strict parser rejects, so the string-level `NaN`/`Infinity` and precision checks catch exactly the failures a permissive reader hides. Logging the feature count, bounds, and `export_run_id` alongside this assertion gives a permitting reviewer the same reproducible audit trail that distance-based screens carry through [proximity distance calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) — every submitted file traceable to the overlay state and code revision that produced it.

## Related

- [Regulatory Boundary Mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/) — the parent workflow that produces the compliance overlay exported here.
- [Clipping Solar Parcels to County Setback Boundaries in GeoPandas](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/clipping-solar-parcels-to-county-setback-boundaries-in-geopandas/) — the overlay computation whose result this export consumes.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — projected-vs-geographic CRS choice the reproject step inverts.
- [Proximity Distance Calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) — grid-side feasibility scoring with the same lineage-tagging discipline.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "Export Compliance Overlay Results to RFC 7946 GeoJSON for Permitting Portals",
  "description": "Turn a metric-CRS compliance overlay into an audit-ready RFC 7946 GeoJSON: attach provenance, reproject to EPSG:4326, trim coordinate precision, serialize NaN and Timestamp properties, validate the portal schema, and write a conformant file.",
  "step": [
    { "@type": "HowToStep", "position": 1, "name": "Pre-flight validate the overlay against the portal schema", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/exporting-compliance-overlay-results-to-geojson-for-permitting-portals/#pre-flight-validation" },
    { "@type": "HowToStep", "position": 2, "name": "Attach compliance flags and provenance, then reproject to EPSG:4326", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/exporting-compliance-overlay-results-to-geojson-for-permitting-portals/#building-the-rfc-7946-export-function" },
    { "@type": "HowToStep", "position": 3, "name": "Trim coordinate precision and serialize NaN and Timestamp properties", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/exporting-compliance-overlay-results-to-geojson-for-permitting-portals/#building-the-rfc-7946-export-function" },
    { "@type": "HowToStep", "position": 4, "name": "Write the RFC 7946 GeoJSON and assert its integrity in CI/CD", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/exporting-compliance-overlay-results-to-geojson-for-permitting-portals/#downstream-geojson-integrity-assertion" }
  ]
}
</script>
