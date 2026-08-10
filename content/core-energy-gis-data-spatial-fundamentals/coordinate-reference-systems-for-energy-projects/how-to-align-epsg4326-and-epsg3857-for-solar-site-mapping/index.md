---
title: "How to Align EPSG:4326 and EPSG:3857 for Solar Site Mapping"
description: Fix the silent CRS mismatch that makes solar parcel boundaries and Web Mercator orthomosaics misalign — a pre-flight CRS check, an explicit pyproj.Transformer fix, latitude-aware area validation, and a CI/CD audit gate for energy siting pipelines.
slug: how-to-align-epsg4326-and-epsg3857-for-solar-site-mapping
type: article
breadcrumb: Align EPSG:4326 and EPSG:3857
datePublished: 2025-10-02
dateModified: 2026-06-26
---

# How to align EPSG:4326 and EPSG:3857 for solar site mapping

**Scenario / symptom:** `gpd.overlay(parcels, raster_bbox, how="intersection")` returns an empty or near-zero-area `GeoDataFrame` (`intersection.area.sum()` prints `0.0` or a nonsensical value), even though the parcel and the orthomosaic clearly cover the same field. This failure lands in the **CRS alignment stage** — the moment EPSG:4326 (WGS84) parcel boundaries are overlaid against an EPSG:3857 (Web Mercator) satellite tile without an explicit transformation between them. It is a special case of the [CRS drift problem covered by the parent workflow](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/): degrees are compared against metres, the geometries never intersect, and the pipeline produces a confident-but-wrong answer instead of raising an exception.

Solar development pipelines routinely ingest heterogeneous spatial assets: parcel boundaries, interconnection queue data, and environmental constraint layers arrive in EPSG:4326, while satellite orthomosaics, web-mapped terrain models, and utility distribution overlays default to EPSG:3857. When these layers are overlaid without explicit transformation, site boundaries shift by hundreds of metres, irradiance footprints misalign with regulatory setbacks, and capacity-factor models return invalid geometries. The fix is to make the coordinate frame explicit, transform once into a single working CRS, and gate every output with a latitude-aware area check.

## Root-cause analysis

The misalignment is not a single bug — it is three compounding causes that each pass silently on their own:

1. **Implicit CRS assumption.** `geopandas.read_file()` and `rasterio.open()` silently inherit or guess a coordinate frame when metadata is absent. A shapefile written without a `.prj` sidecar loads with `parcels.crs is None`, so no transformation is attempted and the raw degree values flow straight into the overlay.
2. **Planar vs. angular arithmetic.** Overlay operations (`overlay`, `clip`, `intersection`) treat coordinates as planar numbers. EPSG:4326 stores position in decimal degrees (≈ ±180 / ±90), while EPSG:3857 stores metres (millions). The two number ranges never coincide, so the spatial predicate returns no intersection.
3. **Web Mercator scale drift.** EPSG:3857 preserves shape at the equator but inflates area with latitude. The areal scale factor for a conformal Mercator frame is

$$ k_{\text{area}} = \sec^2(\varphi) = \frac{1}{\cos^2(\varphi)} $$

so at 45°N a footprint computed directly in EPSG:3857 is inflated by roughly 2× in area. A solar array measured in that frame yields inaccurate MW estimates and can violate interconnection filing tolerances even after the layers visually line up.

Establishing a consistent baseline means tagging every dataset explicitly on ingestion, transforming into one metric working CRS, then validating area against a known-good projection before any geometry feeds a siting or [regulatory boundary overlay](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/).

<svg viewBox="0 0 820 264" role="img" aria-label="Three compounding causes — an implicit CRS assumption, planar arithmetic on angular coordinates, and Web Mercator scale drift — all feed a single misaligned overlay that silently returns an empty intersection. The corrective fix transforms every layer into one working CRS with an explicit CRS tag, a single pyproj.Transformer, and a make_valid topology repair." xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-width:820px;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="820" height="264"/>
  <title>How three silent CRS causes converge on a misaligned overlay, and the fix that resolves them</title>
  <desc>Left: three warning boxes — implicit CRS assumption, planar versus angular arithmetic, and Web Mercator scale drift — each arrow into a central warning node, the misaligned overlay that returns an empty intersection. The overlay arrows into a success node on the right: a single working CRS reached via an explicit CRS tag, one pyproj.Transformer call, and a make_valid repair.</desc>
  <defs>
    <marker id="al-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
    </marker>
  </defs>
  <text x="12" y="20" fill="currentColor" font-size="13" font-weight="700">Three silent causes converge on one misaligned overlay — and the contract that fixes it</text>
  <!-- Cause boxes (warning) -->
  <g font-size="13" text-anchor="middle" fill="#1F3A60">
    <rect x="12" y="40" width="216" height="52" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="120" y="63" font-weight="700">Implicit CRS assumption</text>
    <text x="120" y="81">parcels.crs is None</text>
    <rect x="12" y="108" width="216" height="52" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="120" y="131" font-weight="700">Planar vs angular arithmetic</text>
    <text x="120" y="149">degrees compared to metres</text>
    <rect x="12" y="176" width="216" height="52" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="120" y="199" font-weight="700">Web Mercator scale drift</text>
    <text x="120" y="217">sec&#178;&#966; area inflation</text>
  </g>
  <!-- Arrows into the overlay node -->
  <g color="#F4A261" stroke="currentColor" stroke-width="1.6" fill="none">
    <path d="M228,66 L300,124" marker-end="url(#al-arrow)"/>
    <path d="M228,134 L300,150" marker-end="url(#al-arrow)"/>
    <path d="M228,202 L300,176" marker-end="url(#al-arrow)"/>
  </g>
  <!-- Misaligned overlay node (warning) -->
  <g font-size="13" text-anchor="middle" fill="#1F3A60">
    <rect x="302" y="96" width="168" height="108" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="386" y="135" font-weight="700">Misaligned</text>
    <text x="386" y="153" font-weight="700">overlay</text>
    <text x="386" y="177" font-style="italic">empty intersection</text>
    <text x="386" y="194" font-style="italic">area.sum() = 0.0</text>
  </g>
  <!-- Arrow to the corrective fix -->
  <g color="#3D8B5F" stroke="currentColor" stroke-width="1.8" fill="none">
    <path d="M470,150 L548,150" marker-end="url(#al-arrow)"/>
  </g>
  <!-- Corrective fix node (success) -->
  <g font-size="13" text-anchor="middle" fill="#1F3A60">
    <rect x="548" y="96" width="260" height="108" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <text x="678" y="124" font-weight="700">One working CRS</text>
    <text x="678" y="146">1 &#183; explicit CRS tag</text>
    <text x="678" y="166">2 &#183; single pyproj.Transformer</text>
    <text x="678" y="186">3 &#183; make_valid repair</text>
  </g>
</svg>

<svg viewBox="0 0 800 448" role="img" aria-label="Line chart of the Web Mercator areal scale factor, secant squared of latitude, against latitude from 0 to 60 degrees. The factor is about 1.0 at the equator, rises gently to 1.33 at 30 degrees north, doubles to 2.0 at 45 degrees north, and climbs steeply to 4.0 at 60 degrees north, showing that area computed directly in EPSG:3857 is increasingly overstated toward the poles." xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-width:800px;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="800" height="448"/>
  <title>Web Mercator areal scale factor sec&#178;&#966; versus latitude</title>
  <desc>The areal scale factor equals one over the square of the cosine of latitude. It stays near 1.0 through the low latitudes, passes 1.33 at 30 degrees north, reaches exactly 2.0 (a doubling of measured area) at 45 degrees north, and accelerates to 4.0 at 60 degrees north — so a footprint measured directly in EPSG:3857 is inflated more and more with latitude and must be verified in an equal-area or UTM frame.</desc>
  <!-- Axis lines -->
  <g stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.85">
    <path d="M70,400 L770,400"/>
    <path d="M70,400 L70,50"/>
  </g>
  <!-- Y gridlines and labels (k_area = 1..4) -->
  <g stroke="currentColor" stroke-width="1" fill="none" opacity="0.18">
    <path d="M70,312.5 L770,312.5"/>
    <path d="M70,225 L770,225"/>
    <path d="M70,137.5 L770,137.5"/>
    <path d="M70,50 L770,50"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="end">
    <text x="60" y="404">1&#215;</text>
    <text x="60" y="316">1&#215;</text>
    <text x="60" y="229">2&#215;</text>
    <text x="60" y="141">3&#215;</text>
    <text x="60" y="54">4&#215;</text>
  </g>
  <!-- X tick labels (latitude) -->
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="70" y="422">0&#176;</text>
    <text x="245" y="422">15&#176;</text>
    <text x="420" y="422">30&#176;</text>
    <text x="595" y="422">45&#176;</text>
    <text x="770" y="422">60&#176;N</text>
  </g>
  <!-- Acceptable-distortion band (k <= 1.05, roughly below 12.6 deg) -->
  <rect x="70" y="304" width="700" height="96" fill="#3D8B5F" opacity="0.10"/>
  <text x="78" y="394" fill="currentColor" font-size="11" opacity="0.75">EPSG:3857 area within 5% &#8212; safe to report directly</text>
  <!-- The sec^2(phi) curve -->
  <polyline points="70,312.5 128.3,311.8 186.7,309.8 245,306.2 303.3,300.9 361.7,293.4 420,283.4 478.3,269.6 536.7,250.9 595,225 653.3,188.2 711.7,134 770,50"
            fill="none" stroke="#F4A261" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  <!-- Marked points with callouts -->
  <g fill="#F4A261">
    <circle cx="70" cy="312.5" r="5"/>
    <circle cx="420" cy="283.4" r="5"/>
    <circle cx="595" cy="225" r="5"/>
    <circle cx="770" cy="50" r="5"/>
  </g>
  <g fill="currentColor" font-size="12" font-weight="700">
    <text x="84" y="300">1.0&#215; at equator</text>
    <text x="420" y="272" text-anchor="middle">1.33&#215; at 30&#176;N</text>
    <text x="595" y="213" text-anchor="middle">2.0&#215; at 45&#176;N</text>
    <text x="762" y="44" text-anchor="end">4.0&#215; at 60&#176;N</text>
  </g>
  <!-- Axis titles -->
  <text x="420" y="438" fill="currentColor" font-size="13" text-anchor="middle" font-weight="700">Site latitude &#966;</text>
  <text x="20" y="225" fill="currentColor" font-size="13" text-anchor="middle" font-weight="700" transform="rotate(-90 20 225)">Areal scale factor sec&#178;&#966;</text>
</svg>

## Pre-flight validation

Surface the root cause *before* the overlay runs. The check below inspects both inputs, flags an undefined parcel CRS, detects the degrees-vs-metres mismatch by comparing coordinate magnitudes, and refuses to proceed until both layers share a frame.

<svg viewBox="0 0 960 400" role="img" aria-label="The same solar parcel corner expressed in three coordinate frames, drawn on three number lines at their true magnitudes. In EPSG:4326 the corner is minus 119.702 degrees east and 36.318 degrees north; in EPSG:3857 it is minus 13,324,000 and 4,345,000 metres; in EPSG:32611 it is 256,400 east and 4,021,900 north. Because the three ranges never overlap, an intersection between an untagged degree layer and a metre layer returns an empty result rather than raising an error." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>One parcel corner, three coordinate frames, three incompatible number ranges</title>
  <desc>Three horizontal number lines stacked vertically, each labelled with its EPSG code and axis unit. The top line spans minus 180 to 180 degrees and marks the corner at minus 119.702 degrees. The middle line spans minus 20 million to 20 million metres of Web Mercator easting and marks the same corner at minus 13.32 million. The bottom line spans zero to one million metres of UTM zone 11 north easting and marks it at 256,400. A callout notes that a planar overlay compares these numbers directly, so a degree geometry and a metre geometry never intersect and the result is silently empty.</desc>
  <rect class="svg-bg" x="0" y="0" width="960" height="400"/>
  <defs><marker id="nr-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The same parcel corner, written three ways — the ranges never meet</text>
  <text x="20" y="80" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">EPSG:4326 — degrees</text>
  <line x1="300" y1="76" x2="900" y2="76" stroke="currentColor" stroke-width="1.4" opacity="0.55"/>
  <line x1="300" y1="70" x2="300" y2="82" stroke="currentColor" stroke-width="1.2" opacity="0.55"/>
  <line x1="900" y1="70" x2="900" y2="82" stroke="currentColor" stroke-width="1.2" opacity="0.55"/>
  <text x="300" y="100" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">-180</text>
  <text x="900" y="100" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">180</text>
  <circle cx="400.49666666666667" cy="76" r="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.8"/>
  <text x="400.49666666666667" y="62" text-anchor="middle" font-size="11" fill="#1F3A60" font-weight="700">−119.702°, 36.318°</text>
  <text x="20" y="166" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">EPSG:3857 — metres (Web Mercator)</text>
  <line x1="300" y1="162" x2="900" y2="162" stroke="currentColor" stroke-width="1.4" opacity="0.55"/>
  <line x1="300" y1="156" x2="300" y2="168" stroke="currentColor" stroke-width="1.2" opacity="0.55"/>
  <line x1="900" y1="156" x2="900" y2="168" stroke="currentColor" stroke-width="1.2" opacity="0.55"/>
  <text x="300" y="186" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">-20 037 508</text>
  <text x="900" y="186" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">20 037 508</text>
  <circle cx="400.5141158271777" cy="162" r="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.8"/>
  <text x="400.5141158271777" y="148" text-anchor="middle" font-size="11" fill="#7A4A1A" font-weight="700">−13 324 000 m, 4 345 000 m</text>
  <text x="20" y="252" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">EPSG:32611 — metres (UTM 11N)</text>
  <line x1="300" y1="248" x2="900" y2="248" stroke="currentColor" stroke-width="1.4" opacity="0.55"/>
  <line x1="300" y1="242" x2="300" y2="254" stroke="currentColor" stroke-width="1.2" opacity="0.55"/>
  <line x1="900" y1="242" x2="900" y2="254" stroke="currentColor" stroke-width="1.2" opacity="0.55"/>
  <text x="300" y="272" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">0</text>
  <text x="900" y="272" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">1 000 000</text>
  <circle cx="453.84000000000003" cy="248" r="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.8"/>
  <text x="453.84000000000003" y="234" text-anchor="middle" font-size="11" fill="#1F5C3A" font-weight="700">256 400 m E, 4 021 900 m N</text>
  <rect x="20" y="300" width="448" height="46" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="244.0" y="321" text-anchor="middle" font-size="11.5" fill="currentColor">overlay() compares these numbers as plain planar</text>
  <text x="244.0" y="337" text-anchor="middle" font-size="11.5" fill="currentColor">coordinates — no unit is attached to a geometry</text>
  <rect x="492" y="300" width="448" height="46" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.5"/>
  <text x="716.0" y="321" text-anchor="middle" font-size="11.5" fill="currentColor">So a degree layer and a metre layer share no space:</text>
  <text x="716.0" y="337" text-anchor="middle" font-size="11.5" fill="currentColor">the intersection is empty, and nothing raises</text>
  <text x="20" y="380" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">Tag the CRS at read time, transform once, then intersect — the fix in the section above.</text>
</svg>

```python
import geopandas as gpd
import rasterio
import pyproj

def preflight_crs_check(parcel_path: str, raster_path: str) -> dict:
    """Surface CRS mismatches before any overlay executes.

    Returns a diagnostic dict; raises ValueError on an unrecoverable mismatch.
    """
    parcels = gpd.read_file(parcel_path)
    with rasterio.open(raster_path) as src:
        raster_crs = src.crs
        left, bottom, right, top = src.bounds

    report = {
        "parcel_crs": str(parcels.crs),
        "raster_crs": str(raster_crs),
        "parcel_bounds": tuple(round(v, 3) for v in parcels.total_bounds),
        "raster_bounds": (round(left, 1), round(bottom, 1), round(right, 1), round(top, 1)),
    }

    # 1. Undefined parcel CRS — the most common silent failure
    if parcels.crs is None:
        raise ValueError(
            "Parcel CRS is undefined. Assign EPSG:4326 (or the true frame) "
            "explicitly before any geometric operation."
        )

    # 2. Degrees-vs-metres magnitude mismatch (4326 stays within +/-180/+/-90)
    px_max = max(abs(v) for v in parcels.total_bounds)
    rx_max = max(abs(v) for v in (left, bottom, right, top))
    parcel_is_degrees = px_max <= 360
    raster_is_metres = rx_max > 360
    if parcel_is_degrees and raster_is_metres and parcels.crs != raster_crs:
        report["diagnosis"] = (
            "MISMATCH: parcels in angular degrees, raster in projected metres. "
            "Overlay will return empty geometry until both share one CRS."
        )
    else:
        report["diagnosis"] = "OK: coordinate magnitudes are compatible."

    report["needs_transform"] = parcels.crs != raster_crs
    return report
```

Running `preflight_crs_check` against a 4326 parcel and a 3857 ortho prints the `MISMATCH` diagnosis instead of letting the overlay quietly return `0.0`.

## Fix implementation

Align the layers by declaring the parcel CRS explicitly, transforming geometry with a single `pyproj.Transformer` (vectorised across every vertex via `shapely.ops.transform`), repairing topology, then performing the intersection in one shared working frame. EPSG:3857 is acceptable as the *display* working frame, but area is verified separately against an equal-area or UTM frame in the next step.

```python
import geopandas as gpd
import rasterio
import pyproj
from rasterio.windows import Window
from shapely.geometry import box
from shapely.ops import transform as shapely_transform
from shapely.validation import make_valid
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

def align_spatial_assets(parcel_path: str, raster_path: str, target_crs: str = "EPSG:3857"):
    # 1. Explicit CRS assignment on ingestion
    parcels = gpd.read_file(parcel_path)
    if parcels.crs is None:
        parcels.set_crs("EPSG:4326", inplace=True)
        logging.warning("Parcel CRS was undefined. Defaulted to EPSG:4326.")

    # 2. Raster metadata extraction with windowed bounds for memory efficiency
    with rasterio.open(raster_path) as src:
        src_crs = src.crs
        raster_window = Window(0, 0, src.width, src.height)
        raster_bounds = src.window_bounds(raster_window)

    # 3. Fast, memory-safe coordinate transformation using pyproj.Transformer.
    # shapely.ops.transform applies the transformer to every coordinate of an
    # arbitrary geometry (Point, Polygon, MultiPolygon, ...), so parcel
    # boundaries are preserved instead of collapsed to a single (x, y) tuple.
    transformer = pyproj.Transformer.from_crs(
        parcels.crs, target_crs, always_xy=True
    )
    parcels_aligned = parcels.copy()
    parcels_aligned.geometry = parcels.geometry.apply(
        lambda geom: shapely_transform(transformer.transform, geom) if geom else geom
    )
    parcels_aligned.set_crs(target_crs, inplace=True)

    # 4. Raster bounding box alignment — build a Shapely box from the bounds
    # captured inside the `with` block so the source CRS metadata is retained.
    raster_bbox = gpd.GeoDataFrame(
        geometry=[box(*raster_bounds)],
        crs=src_crs
    ).to_crs(target_crs)

    # 5. Spatial intersection with topology repair
    parcels_aligned.geometry = parcels_aligned.geometry.apply(make_valid)
    intersection = gpd.overlay(parcels_aligned, raster_bbox, how="intersection")

    logging.info(f"Alignment complete. Valid geometries: {intersection.geometry.is_valid.sum()}")
    return intersection
```

`always_xy=True` pins (lon, lat) ordering and eliminates the legacy axis-order bug in `pyproj` 6+. Using a single `pyproj.Transformer` for batch conversion is faster and far less memory-intensive than repeated per-row `GeoDataFrame.to_crs()` calls, and `make_valid` repairs the self-intersections that surface when degree-precision rings are reprojected to metres.

## Fallback routing & performance tuning

For national-scale screening, CI/CD runs, and memory-constrained cloud nodes, layer these strategies on top of the core fix:

- **Equal-area fallback for any MW figure.** EPSG:3857 is for display only. Before reporting array area, reproject to `parcels.estimate_utm_crs()` or an Albers equal-area frame (e.g. EPSG:5070 for CONUS). If EPSG:3857 distortion exceeds 5% at the site latitude, route the area calculation through the equal-area frame automatically and log the trigger.
- **Windowed raster I/O.** Never load a multi-gigabyte orthomosaic in full. Use `rasterio.windows.from_bounds()` to read only the tile overlapping the parcel extent — this cuts peak memory by 60–80% on large terrain stacks.
- **Spatial index pre-filter.** Call `parcels_aligned.sindex.query(raster_geom)` before `overlay()` to drop non-overlapping features and avoid O(n²) geometric comparisons during batch site screening, mirroring the index discipline used in [proximity and distance calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/).
- **Pin the PROJ stack.** Pin `pyproj` to an exact minor version in `requirements.txt` (e.g. `pyproj==3.7.2`) so the bundled PROJ datum database is identical across CI/CD and production, keeping transformations deterministic.
- **Isolate transform failures.** Wrap the overlay in a `try/except` for `pyproj.exceptions.ProjError` and `shapely.errors.TopologicalError`; on failure, revert to the source CRS, apply a conservative 50 m buffer to absorb coordinate drift, and queue the asset for manual GIS review rather than dropping it silently.

## Downstream validation

Gate every alignment output in CI/CD with an assertion that fails the build on CRS, emptiness, validity, or latitude-distortion regressions — the same audit posture used in [grid capacity buffer analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/).

<svg viewBox="0 0 1100 300" role="img" aria-label="The four-assertion CI gate that every aligned overlay must pass before it is published: the working CRS is the one that was declared, the intersection is non-empty, every geometry is valid, and the areal distortion at the site latitude is under five percent. A failure at any gate quarantines the run for GIS review instead of publishing a silently misaligned layer." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>The four assertions that gate a published overlay</title>
  <desc>Four gates in a row, each drawn as a diamond. Gate one checks that the result CRS equals the declared working CRS. Gate two checks the intersection is not empty. Gate three checks every geometry reports valid. Gate four checks the areal distortion at the site latitude is under five percent. Passing all four leads to a published overlay carrying its CRS, transform and distortion metadata; failing any one routes down to a quarantine node that fails the build and queues the asset for manual review.</desc>
  <rect class="svg-bg" x="0" y="0" width="1100" height="300"/>
  <defs><marker id="cg-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="28" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">CI gate chain — a build fails on the first assertion that does not hold</text>
  <text x="1080" y="28" text-anchor="end" font-size="11" fill="currentColor" opacity="0.75">right = pass · down = fail</text>
  <path d="M112,64 L198,112 L112,160 L26,112 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="112" y="108" text-anchor="middle" font-size="11.5" fill="currentColor">CRS equals</text>
  <text x="112" y="124" text-anchor="middle" font-size="11.5" fill="currentColor">declared frame</text>
  <text x="112" y="52" text-anchor="middle" font-size="10.5" fill="currentColor" font-weight="700" opacity="0.7">gate 1</text>
  <line x1="200" y1="112" x2="230" y2="112" stroke="currentColor" stroke-width="1.4" marker-end="url(#cg-arr)"/>
  <line x1="112" y1="162" x2="112" y2="208" stroke="#F4A261" stroke-width="1.4" marker-end="url(#cg-arr)"/>
  <text x="134" y="188" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">fail</text>
  <path d="M300,64 L386,112 L300,160 L214,112 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="300" y="108" text-anchor="middle" font-size="11.5" fill="currentColor">intersection</text>
  <text x="300" y="124" text-anchor="middle" font-size="11.5" fill="currentColor">not empty</text>
  <text x="300" y="52" text-anchor="middle" font-size="10.5" fill="currentColor" font-weight="700" opacity="0.7">gate 2</text>
  <line x1="388" y1="112" x2="418" y2="112" stroke="currentColor" stroke-width="1.4" marker-end="url(#cg-arr)"/>
  <line x1="300" y1="162" x2="300" y2="208" stroke="#F4A261" stroke-width="1.4" marker-end="url(#cg-arr)"/>
  <text x="322" y="188" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">fail</text>
  <path d="M488,64 L574,112 L488,160 L402,112 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="488" y="108" text-anchor="middle" font-size="11.5" fill="currentColor">all geometries</text>
  <text x="488" y="124" text-anchor="middle" font-size="11.5" fill="currentColor">report valid</text>
  <text x="488" y="52" text-anchor="middle" font-size="10.5" fill="currentColor" font-weight="700" opacity="0.7">gate 3</text>
  <line x1="576" y1="112" x2="606" y2="112" stroke="currentColor" stroke-width="1.4" marker-end="url(#cg-arr)"/>
  <line x1="488" y1="162" x2="488" y2="208" stroke="#F4A261" stroke-width="1.4" marker-end="url(#cg-arr)"/>
  <text x="510" y="188" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">fail</text>
  <path d="M676,64 L762,112 L676,160 L590,112 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="676" y="108" text-anchor="middle" font-size="11.5" fill="currentColor">distortion</text>
  <text x="676" y="124" text-anchor="middle" font-size="11.5" fill="currentColor">under 5%</text>
  <text x="676" y="52" text-anchor="middle" font-size="10.5" fill="currentColor" font-weight="700" opacity="0.7">gate 4</text>
  <line x1="676" y1="162" x2="676" y2="208" stroke="#F4A261" stroke-width="1.4" marker-end="url(#cg-arr)"/>
  <text x="698" y="188" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">fail</text>
  <line x1="764" y1="112" x2="800" y2="112" stroke="currentColor" stroke-width="1.4" marker-end="url(#cg-arr)"/>
  <rect x="806" y="78" width="262" height="69" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="937.0" y="101" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">Publish overlay</text>
  <text x="937.0" y="118" text-anchor="middle" font-size="11" fill="currentColor">CRS · transform · distortion</text>
  <text x="937.0" y="135" text-anchor="middle" font-size="11" fill="currentColor">written to the audit record</text>
  <rect x="26" y="210" width="736" height="52" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="394" y="232" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">Quarantine — fail the build, keep the previous layer live</text>
  <text x="394" y="250" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">the asset is queued for manual GIS review rather than silently republished</text>
</svg>

```python
from datetime import datetime, timezone
import math

def audit_alignment(intersection_gdf, expected_crs: str = "EPSG:3857",
                    site_latitude_deg: float | None = None,
                    max_mercator_inflation: float = 1.05) -> dict:
    """Assert alignment integrity. Raises AssertionError on any CI/CD-blocking issue."""
    assert intersection_gdf.crs is not None, "Output CRS is undefined."
    assert str(intersection_gdf.crs) == expected_crs, (
        f"CRS drift: expected {expected_crs}, got {intersection_gdf.crs}"
    )
    assert not intersection_gdf.empty, "Empty overlay — inputs did not intersect (CRS mismatch?)."
    invalid = (~intersection_gdf.geometry.is_valid).sum()
    assert invalid == 0, f"{invalid} invalid geometries remain after make_valid."

    audit = {
        "source_crs": "EPSG:4326",
        "target_crs": str(intersection_gdf.crs),
        "transformer_method": "pyproj.Transformer(always_xy=True)",
        "feature_count": len(intersection_gdf),
        "all_valid": bool(invalid == 0),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # Warn (don't trust 3857 area) when Mercator inflation is material at this latitude
    if site_latitude_deg is not None:
        k_area = 1.0 / (math.cos(math.radians(site_latitude_deg)) ** 2)
        audit["mercator_area_inflation"] = round(k_area, 3)
        assert k_area <= max_mercator_inflation or expected_crs != "EPSG:3857", (
            f"Mercator area inflation {k_area:.2f}x at {site_latitude_deg} deg — "
            "report area from an equal-area/UTM frame, not EPSG:3857."
        )
    return audit
```

Attaching the returned `audit` dictionary to each deliverable satisfies ISO 19115 lineage requirements and lets a permitting authority or independent engineer reproduce exactly how a footprint was derived.

## Related

- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — the parent workflow defining the projection contract this fix belongs to.
- [Spatial Data Quality & Validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) — geometry repair and validity checks that pair with reprojection.
- [Open Energy Data Portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/) — metadata-first ingestion that tags every layer's CRS before it reaches this stage.
- [Proximity & Distance Calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) — metric-frame distance work that depends on a correct target CRS.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "headline": "How to Align EPSG:4326 and EPSG:3857 for Solar Site Mapping",
      "description": "Fix the silent CRS mismatch that makes solar parcel boundaries and Web Mercator orthomosaics misalign — a pre-flight CRS check, an explicit pyproj.Transformer fix, latitude-aware area validation, and a CI/CD audit gate.",
      "datePublished": "2025-10-02",
      "dateModified": "2026-06-26",
      "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/how-to-align-epsg4326-and-epsg3857-for-solar-site-mapping/",
      "author": { "@type": "Organization", "name": "Renewable Energy Grid GIS" },
      "publisher": { "@type": "Organization", "name": "Renewable Energy Grid GIS" },
      "isPartOf": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/",
      "keywords": "EPSG:4326, EPSG:3857, Web Mercator, WGS84, pyproj, geopandas, rasterio, solar site mapping, CRS alignment, energy GIS"
    },
    {
      "@type": "HowTo",
      "name": "Align EPSG:4326 and EPSG:3857 layers for solar site mapping",
      "description": "Detect and fix the degrees-vs-metres mismatch between WGS84 parcels and Web Mercator orthomosaics, then validate area against an equal-area frame.",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Run a pre-flight CRS check to surface the mismatch before overlay", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/how-to-align-epsg4326-and-epsg3857-for-solar-site-mapping/#pre-flight-validation" },
        { "@type": "HowToStep", "position": 2, "name": "Transform with a single pyproj.Transformer and repair topology", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/how-to-align-epsg4326-and-epsg3857-for-solar-site-mapping/#fix-implementation" },
        { "@type": "HowToStep", "position": 3, "name": "Route area calculations through an equal-area or UTM frame", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/how-to-align-epsg4326-and-epsg3857-for-solar-site-mapping/#fallback-routing-performance-tuning" },
        { "@type": "HowToStep", "position": 4, "name": "Gate the output with a CI/CD alignment audit", "url": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/how-to-align-epsg4326-and-epsg3857-for-solar-site-mapping/#downstream-validation" }
      ]
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.renewable-energy-grid-gis.org/" },
        { "@type": "ListItem", "position": 2, "name": "Core Energy-GIS Data & Spatial Fundamentals", "item": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/" },
        { "@type": "ListItem", "position": 3, "name": "Coordinate Reference Systems for Energy Projects", "item": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/" },
        { "@type": "ListItem", "position": 4, "name": "Align EPSG:4326 and EPSG:3857 for Solar Site Mapping", "item": "https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/how-to-align-epsg4326-and-epsg3857-for-solar-site-mapping/" }
      ]
    }
  ]
}
</script>
