---
title: "Calculating 5km Proximity Buffers Around Substations in Shapely"
description: "Fix the silent planar-vs-geodetic bug that turns substation.buffer(5000) in EPSG:4326 into a 600,000 km² blob — a pre-flight CRS guard, a projected per-asset buffer pipeline, memory-safe chunking, and a CI/CD area-sanity audit for grid screening."
slug: calculating-5km-proximity-buffers-around-substations-in-shapely
type: article
breadcrumb: 5km Substation Buffers in Shapely
datePublished: 2025-09-18
dateModified: 2026-06-26
---

# Calculating 5km proximity buffers around substations in Shapely

**Scenario / symptom:** you call `substation.buffer(5000)` on a `shapely.geometry.Point` in EPSG:4326 expecting a 5 km exclusion circle, and instead `buffer.area` prints `78539816.34` — a number in square *degrees*, not square metres. Plotted, the buffer swallows several states; passed into a siting query it qualifies thousands of phantom parcels. No exception is raised. This failure lands in the **buffer-generation stage** of the screening pipeline, and it is the single-asset root case of the additive over-allocation dissected in the parent workflow, [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/). Because Shapely and the underlying GEOS engine operate purely in planar Cartesian space, the literal `5000` is interpreted in whatever units the coordinates carry — and geographic coordinates carry degrees.

This page isolates the compounding causes, gives a pre-flight guard that surfaces the bug before a single buffer is generated, then builds a projected, memory-safe pipeline that produces audit-ready 5 km zones suitable for interconnection routing and environmental screening. The fix is the same discipline applied across the site: enforce a projected [coordinate reference system](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) before any distance call, buffer in metres, and gate the output against an equal-area area check.

## Root-cause analysis

The distorted buffer is not one bug — it is up to four causes that each pass silently on their own:

1. **Planar-vs-geodetic mismatch.** GEOS treats `buffer(5000)` as 5000 *map units*. In EPSG:4326 those units are decimal degrees, so the result is a ~5000-degree disc that wraps the globe rather than a 5 km circle. At 34°N one degree of longitude is ≈ 92 km, so the radius is overstated by roughly five orders of magnitude.
2. **Latitude-dependent distortion.** Even a "small" degree-based buffer is an anisotropic ellipse, not a circle: a degree of longitude shrinks with `cos(latitude)` while a degree of latitude stays roughly constant, so the east–west and north–south reach diverge and the exclusion zone is wrong by the cosine of the latitude.
3. **Static UTM-zone assignment.** Hard-coding one projected CRS for a national substation set introduces >1% linear distortion for assets far from the central meridian, quietly invalidating a compliance setback near a zone edge.
4. **Invalid input geometry.** Duplicate vertices, self-intersecting rings, or `NaN` coordinates raise a `GEOSException` mid-batch — or worse, produce an invalid buffer polygon that downstream `union`/`overlay` calls silently drop.

The relationship between radius and screened area is quadratic, $A = \pi r^2$, which is why a units error of this magnitude does not merely shift the answer — it detonates it. A correct 5 km radius screens $\pi \times 5000^2 \approx 7.854 \times 10^{7}\ \text{m}^2$ (≈ 78.54 km²); the degree-based buffer screens an area larger than many countries.

<svg viewBox="0 0 1000 320" role="img" aria-label="Two buffer paths compared. The broken path sends a Point in EPSG:4326 into .buffer(5000), where 5000 is read as degrees, producing a roughly 600,000 square-kilometre blob with no error raised. The corrected path transforms the point into a local UTM zone, buffers 5000 in metres for a true 5 km radius, then transforms back to EPSG:4326 with a crs_source tag, yielding an audit-ready zone of about 78.54 square kilometres." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Degree-based buffer versus a projected metre-based buffer</title>
  <desc>The broken path takes a Point in EPSG:4326 straight into buffer(5000); GEOS reads 5000 as map units, which are decimal degrees, so the result is a roughly 600,000 km blob that swallows several states and raises no exception. The corrected path reprojects the point to its local UTM zone, buffers 5000 in metres for a true 5 km radius, then reprojects back to EPSG:4326 with a crs_source lineage tag, producing an audit-ready 78.54 km exclusion zone.</desc>
  <defs>
    <marker id="buf-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="currentColor"/>
    </marker>
  </defs>
  <g font-size="11" font-weight="700" letter-spacing="0.8" fill="currentColor" opacity="0.7">
    <text x="15" y="24">BROKEN &#8212; RADIUS TREATED AS DEGREES</text>
    <text x="15" y="207">CORRECTED &#8212; RADIUS IN METRES</text>
  </g>
  <!-- broken row -->
  <g stroke-width="1.5">
    <rect x="15"  y="44" width="215" height="72" rx="10" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.5"/>
    <rect x="300" y="44" width="200" height="72" rx="10" fill="#FFE3BE" stroke="#F4A261"/>
    <rect x="570" y="44" width="235" height="72" rx="10" fill="#FFE3BE" stroke="#F4A261"/>
  </g>
  <g stroke="currentColor" stroke-width="1.6" fill="none" opacity="0.85">
    <line x1="230" y1="80" x2="296" y2="80" marker-end="url(#buf-arrow)"/>
    <line x1="500" y1="80" x2="566" y2="80" marker-end="url(#buf-arrow)"/>
  </g>
  <g fill="currentColor" text-anchor="middle">
    <text x="122" y="80" font-size="13" font-weight="600">Point geometry</text>
    <text x="122" y="98" font-size="11" opacity="0.75">EPSG:4326 &#183; units = &#176;</text>
    <text x="400" y="78" font-size="13" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">.buffer(5000)</text>
    <text x="400" y="96" font-size="11" opacity="0.75">5000 read as degrees</text>
    <text x="687" y="78" font-size="13" font-weight="600">&#8776; 600,000 km&#178; blob</text>
    <text x="687" y="96" font-size="11" opacity="0.75">swallows several states</text>
    <text x="905" y="74" font-size="12" font-style="italic" opacity="0.8">no exception</text>
    <text x="905" y="92" font-size="12" font-style="italic" opacity="0.8">is raised</text>
  </g>
  <!-- corrected row -->
  <g stroke-width="1.5">
    <rect x="15"  y="235" width="170" height="72" rx="10" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.5"/>
    <rect x="215" y="235" width="170" height="72" rx="10" fill="#DCEEF6" stroke="#5BA8C8"/>
    <rect x="415" y="235" width="170" height="72" rx="10" fill="#DCEEF6" stroke="#5BA8C8"/>
    <rect x="615" y="235" width="170" height="72" rx="10" fill="#DCEEF6" stroke="#5BA8C8"/>
    <rect x="815" y="235" width="170" height="72" rx="10" fill="#DDF0E2" stroke="#3D8B5F"/>
  </g>
  <g stroke="currentColor" stroke-width="1.6" fill="none" opacity="0.85">
    <line x1="185" y1="271" x2="211" y2="271" marker-end="url(#buf-arrow)"/>
    <line x1="385" y1="271" x2="411" y2="271" marker-end="url(#buf-arrow)"/>
    <line x1="585" y1="271" x2="611" y2="271" marker-end="url(#buf-arrow)"/>
    <line x1="785" y1="271" x2="811" y2="271" marker-end="url(#buf-arrow)"/>
  </g>
  <g fill="currentColor" text-anchor="middle">
    <text x="100" y="271" font-size="12.5" font-weight="600">Point geometry</text>
    <text x="100" y="289" font-size="11" opacity="0.75">EPSG:4326</text>
    <text x="300" y="268" font-size="12.5">Transform &#8594; UTM</text>
    <text x="300" y="286" font-size="10.5" opacity="0.75" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">always_xy=True</text>
    <text x="500" y="268" font-size="12.5" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">.buffer(5000)</text>
    <text x="500" y="286" font-size="11" opacity="0.75">metres &#8594; true 5 km</text>
    <text x="700" y="268" font-size="12.5">Transform &#8594; 4326</text>
    <text x="700" y="286" font-size="11" opacity="0.75">store + crs_source tag</text>
    <text x="900" y="268" font-size="12.5" font-weight="600">&#8776; 78.54 km&#178; zone</text>
    <text x="900" y="286" font-size="11" opacity="0.75">audit-ready</text>
  </g>
</svg>

## Pre-flight validation

Catch the bug before it propagates. This guard inspects the source CRS and the magnitude of a trial buffer's area, raising a precise error instead of letting a degree-based blob flow downstream. Run it once per input layer at the head of the pipeline.

```python
import math
from pyproj import CRS
from shapely.geometry import Point

def assert_buffer_is_metric(
    substation_pt: Point,
    source_epsg: int,
    buffer_meters: float = 5000.0,
) -> dict:
    """Surface the planar/geodetic mismatch before generating real buffers.

    Raises ValueError if the working CRS is geographic (degrees) or if a
    trial buffer's area is wildly off the expected pi*r^2 metric target.
    """
    crs = CRS.from_epsg(source_epsg)
    audit = {"source_epsg": source_epsg, "is_geographic": crs.is_geographic}

    if crs.is_geographic:
        raise ValueError(
            f"EPSG:{source_epsg} is geographic (units=degrees). "
            f"buffer({buffer_meters}) would be interpreted as degrees — "
            "reproject to a projected metre-based CRS (e.g. a local UTM) first."
        )

    expected_area_m2 = math.pi * buffer_meters**2
    trial_area = substation_pt.buffer(buffer_meters).area
    ratio = trial_area / expected_area_m2
    audit["area_ratio"] = round(ratio, 4)
    if not 0.99 <= ratio <= 1.01:
        raise ValueError(
            f"Buffer area {trial_area:.1f} deviates from expected "
            f"{expected_area_m2:.1f} m^2 (ratio {ratio:.3f}) — likely a unit "
            "or projection-distortion error."
        )
    return audit
```

The naive failure it exists to stop is one line:

```python
from shapely.geometry import Point

substation = Point(-118.2437, 34.0522)   # EPSG:4326, Los Angeles
distorted = substation.buffer(5000)       # interpreted as 5000 DEGREES
print(f"{distorted.area:.2f}")            # -> 78539816.34  (square degrees!)
```

## Fix implementation

The corrected pipeline derives a UTM zone per asset from its own longitude and latitude, transforms into that metre-based frame with an explicit `pyproj.Transformer` (`always_xy=True` to lock lon/lat order), buffers in metres, repairs any invalid output, then transforms back to EPSG:4326 for storage. It streams features in bounded chunks so a national substation set never materialises in memory at once, and it tags every output with the CRS it was computed in for lineage.

```python
import logging
from typing import Any, Iterator

import pyproj
from shapely.geometry import Point, mapping
from shapely.ops import transform
from shapely.validation import make_valid

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger("substation_buffer_pipeline")


def utm_epsg_for(lon: float, lat: float) -> int:
    """Return the EPSG code of the UTM zone containing (lon, lat)."""
    zone = int((lon + 180) / 6) + 1
    return (32600 if lat >= 0 else 32700) + zone  # 326xx north, 327xx south


def generate_substation_buffers(
    substations: Iterator[dict[str, Any]],
    buffer_meters: float = 5000.0,
    chunk_size: int = 2500,
) -> Iterator[list[dict[str, Any]]]:
    """Yield validated GeoJSON features of 5 km buffers, computed in metres.

    Input features carry EPSG:4326 (lon, lat) coordinates; output geometry is
    returned in EPSG:4326 with a `crs_source` UTM tag for audit reproducibility.
    """
    chunk: list[dict[str, Any]] = []

    for idx, sub in enumerate(substations):
        coords = sub.get("geometry", {}).get("coordinates", [None, None])
        if any(c is None for c in coords):
            logger.warning("record %s skipped: missing coordinates", idx)
            continue

        lon, lat = coords[0], coords[1]
        target_epsg = utm_epsg_for(lon, lat)
        to_utm = pyproj.Transformer.from_crs(4326, target_epsg, always_xy=True)
        to_wgs84 = pyproj.Transformer.from_crs(target_epsg, 4326, always_xy=True)

        try:
            utm_point = transform(to_utm.transform, Point(lon, lat))
            utm_buffer = utm_point.buffer(buffer_meters)        # metres -> true 5 km
            if not utm_buffer.is_valid:
                utm_buffer = make_valid(utm_buffer)
            wgs84_buffer = transform(to_wgs84.transform, utm_buffer)
        except Exception as exc:  # GEOSException, transform failure
            logger.error("record %s failed during buffer/transform: %s", idx, exc)
            continue

        chunk.append({
            "type": "Feature",
            "properties": {
                **sub.get("properties", {}),
                "buffer_m": buffer_meters,
                "crs_source": f"EPSG:{target_epsg}",
            },
            "geometry": mapping(wgs84_buffer),
        })

        if len(chunk) >= chunk_size:
            yield chunk
            chunk = []

    if chunk:
        yield chunk
```

Explicit parameter choices, justified for grid-GIS use: the per-asset UTM zone keeps linear distortion under ~0.04% near the central meridian (far tighter than the 1% a static zone risks); `always_xy=True` eliminates the legacy lon/lat axis-swap that silently mirrors geometry in `pyproj` 6+; `make_valid` is a deterministic repair rather than a `buffer(0)` heuristic; and `chunk_size=2500` bounds peak heap during the GEOS C-extension calls and any downstream serialisation. The buffer radius itself should not stay a hard-coded scalar for production capacity work — derive it per asset from voltage class and thermal rating as the parent [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) workflow does, and feed it geometry that has already passed [spatial data quality validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/).

<svg viewBox="0 0 1040 330" role="img" aria-label="Fixed buffer pipeline data flow. Streaming EPSG:4326 features pass through per-asset UTM zone selection with utm_epsg_for, transform to UTM and buffer 5000 metres, make_valid repair, then reproject back to EPSG:4326. Each result is appended to a chunk buffer held inside a bounded-memory region capped at chunk_size 2500; when the chunk fills it is yielded to downstream proximity work, so a national substation set never materialises in memory at once." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Streaming per-asset buffer pipeline with a bounded-memory chunk buffer</title>
  <desc>EPSG:4326 features stream through five per-record stages: utm_epsg_for picks the local UTM zone, a Transformer projects the point and buffers 5000 metres for a true 5 km radius, make_valid repairs any invalid polygon, and a second Transformer reprojects back to EPSG:4326 with a crs_source tag. Each finished feature is appended to a chunk buffer that lives inside a dashed bounded-memory region capped at chunk_size 2500. When the chunk fills it is yielded to downstream proximity work and reset, so the full national set never materialises in memory at once.</desc>
  <defs>
    <marker id="pipe-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="currentColor"/>
    </marker>
  </defs>
  <!-- per-asset pipeline stages -->
  <g stroke-width="1.5">
    <rect x="14"  y="70" width="152" height="66" rx="10" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.5"/>
    <rect x="190" y="70" width="152" height="66" rx="10" fill="#DCEEF6" stroke="#5BA8C8"/>
    <rect x="366" y="70" width="152" height="66" rx="10" fill="#DCEEF6" stroke="#5BA8C8"/>
    <rect x="542" y="70" width="152" height="66" rx="10" fill="#DCEEF6" stroke="#5BA8C8"/>
    <rect x="718" y="70" width="152" height="66" rx="10" fill="#DCEEF6" stroke="#5BA8C8"/>
  </g>
  <g stroke="currentColor" stroke-width="1.6" fill="none" opacity="0.85">
    <line x1="166" y1="103" x2="186" y2="103" marker-end="url(#pipe-arrow)"/>
    <line x1="342" y1="103" x2="362" y2="103" marker-end="url(#pipe-arrow)"/>
    <line x1="518" y1="103" x2="538" y2="103" marker-end="url(#pipe-arrow)"/>
    <line x1="694" y1="103" x2="714" y2="103" marker-end="url(#pipe-arrow)"/>
  </g>
  <g fill="currentColor" text-anchor="middle">
    <g font-size="12.5">
      <text x="90"  y="100" font-weight="600">Stream features</text>
      <text x="266" y="100" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">utm_epsg_for()</text>
      <text x="442" y="100">to_utm + buffer</text>
      <text x="618" y="100" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">make_valid()</text>
      <text x="794" y="100" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">to_wgs84</text>
    </g>
    <g font-size="11" opacity="0.75">
      <text x="90"  y="118">EPSG:4326 lon,lat</text>
      <text x="266" y="118">per-asset zone</text>
      <text x="442" y="118">5000 m &#8594; 5 km</text>
      <text x="618" y="118">repair output</text>
      <text x="794" y="118">back to 4326</text>
    </g>
  </g>
  <!-- bounded-memory region -->
  <rect x="886" y="40" width="148" height="248" rx="12" fill="currentColor" fill-opacity="0.03" stroke="currentColor" stroke-opacity="0.55" stroke-width="1.4" stroke-dasharray="6 5"/>
  <g fill="currentColor" text-anchor="middle">
    <text x="960" y="58" font-size="10.5" font-weight="700" letter-spacing="0.5" opacity="0.7">BOUNDED HEAP</text>
    <text x="960" y="72" font-size="10.5" opacity="0.7" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">chunk_size=2500</text>
  </g>
  <g stroke-width="1.5">
    <rect x="900" y="86"  width="120" height="60" rx="10" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.5"/>
    <rect x="900" y="198" width="120" height="62" rx="10" fill="#DDF0E2" stroke="#3D8B5F"/>
  </g>
  <g fill="currentColor" text-anchor="middle">
    <text x="960" y="112" font-size="12.5" font-weight="600">Chunk buffer</text>
    <text x="960" y="130" font-size="11" opacity="0.75">accumulate</text>
    <text x="960" y="224" font-size="12.5" font-weight="600">yield chunk</text>
    <text x="960" y="242" font-size="11" opacity="0.75">len &#8805; 2500</text>
  </g>
  <!-- connectors into / through / out of the boundary -->
  <g stroke="currentColor" stroke-width="1.6" fill="none" opacity="0.85">
    <path d="M870 103 C 884 103, 888 116, 898 116" marker-end="url(#pipe-arrow)"/>
    <line x1="960" y1="146" x2="960" y2="194" marker-end="url(#pipe-arrow)"/>
    <path d="M900 246 C 868 246, 868 116, 894 116" stroke-dasharray="4 4" opacity="0.6" marker-end="url(#pipe-arrow)"/>
    <line x1="960" y1="260" x2="960" y2="300" marker-end="url(#pipe-arrow)"/>
  </g>
  <text x="960" y="318" font-size="11" fill="currentColor" text-anchor="middle" opacity="0.78">&#8594; downstream proximity</text>
  <text x="846" y="180" font-size="10" fill="currentColor" text-anchor="middle" opacity="0.6" transform="rotate(-90 846 180)">reset []</text>
</svg>

## Fallback routing & performance tuning

- **Polar and offshore assets (>84° latitude):** UTM is undefined beyond the standard zones, so fall back to a global equal-area frame ([EPSG:6933](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/)) or a regional state-plane CRS, and log the substitution explicitly rather than letting `utm_epsg_for` return a meaningless zone.
- **Zone-boundary substations:** for a point within 5 km of a UTM zone edge the buffer straddles two zones; reproject all affected buffers to one shared frame and `shapely.union_all()` adjacent zones before export to keep exclusion polygons contiguous.
- **Batch scale (>100k assets):** push the per-asset transform into a vectorised `geopandas.GeoSeries.to_crs()` grouped by UTM zone, or distribute chunks with `dask-geopandas`, so transformer construction is amortised across the group instead of rebuilt per record.
- **Spatial-index reuse:** when buffers feed a proximity query, build an STRtree once over the buffered set rather than per query — see [proximity & distance calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) for the indexing pattern.
- **CI/CD memory ceiling:** if `GEOSException` persists under tight runners, lower `chunk_size` to 500 and confirm the GEOS C-extension is linked against the expected `libgeos`; pin versions so the deterministic gate runs against the same engine as production.

## Downstream validation

Before buffers reach a permitting or routing engine, assert their integrity in a form a CI/CD gate can run. This audit checks validity, emptiness, the metric-area sanity bound, and that every feature carries its `crs_source` lineage tag.

```python
import math
from shapely.geometry import shape

def audit_buffer_features(
    features: list[dict],
    buffer_meters: float = 5000.0,
    tolerance: float = 0.02,
) -> dict:
    """Assert buffer outputs are valid, non-empty, correctly sized and tagged."""
    expected_area_km2 = math.pi * (buffer_meters / 1000.0) ** 2  # ~78.54 km^2
    report = {"checked": 0, "failures": []}

    for feat in features:
        report["checked"] += 1
        geom = shape(feat["geometry"])
        props = feat.get("properties", {})

        if geom.is_empty or not geom.is_valid:
            report["failures"].append((props.get("id"), "invalid_or_empty"))
        if "crs_source" not in props:
            report["failures"].append((props.get("id"), "missing_crs_lineage"))

        # area sanity in an equal-area frame (EPSG:6933), reported in km^2
        from pyproj import Geod
        area_m2 = abs(Geod(ellps="WGS84").geometry_area_perimeter(geom)[0])
        ratio = (area_m2 / 1e6) / expected_area_km2
        if abs(ratio - 1.0) > tolerance:
            report["failures"].append((props.get("id"), f"area_ratio={ratio:.3f}"))

    assert not report["failures"], f"buffer audit failed: {report['failures'][:5]}"
    return report
```

A 5 km buffer that audits to ≈ 78.54 km² with a valid geometry and a `crs_source` tag is reproducible: an interconnection study or environmental reviewer can confirm exactly which projection produced each zone, which is what turns a map artefact into evidence.

## Related

- [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) — the parent workflow that scales these buffers by voltage class and reconciles overlapping capacity.
- [Proximity & Distance Calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) — metric-frame distance and spatial-index patterns that consume buffered zones.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — the projection contract behind every metric buffer.
- [Spatial Data Quality & Validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) — geometry repair and validity checks that gate the input to this pipeline.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "headline": "Calculating 5km Proximity Buffers Around Substations in Shapely",
      "description": "Fix the silent planar-vs-geodetic bug that turns substation.buffer(5000) in EPSG:4326 into a 600,000 km² blob — a pre-flight CRS guard, a projected per-asset buffer pipeline, memory-safe chunking, and a CI/CD area-sanity audit.",
      "datePublished": "2025-09-18",
      "dateModified": "2026-06-26",
      "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/calculating-5km-proximity-buffers-around-substations-in-shapely/",
      "author": { "@type": "Organization", "name": "Renewable Energy Grid GIS" },
      "publisher": { "@type": "Organization", "name": "Renewable Energy Grid GIS" },
      "isPartOf": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/",
      "keywords": "Shapely, buffer, substation, EPSG:4326, UTM, pyproj, GEOS, proximity buffer, grid capacity, energy GIS"
    },
    {
      "@type": "HowTo",
      "name": "Generate correct 5 km substation buffers in Shapely",
      "description": "Detect the degrees-vs-metres buffer bug, reproject per-asset to UTM, buffer in metres, and validate buffer area against an equal-area frame.",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Run a pre-flight metric-CRS guard before buffering", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/calculating-5km-proximity-buffers-around-substations-in-shapely/#pre-flight-validation" },
        { "@type": "HowToStep", "position": 2, "name": "Reproject per-asset to UTM, buffer in metres, reproject back", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/calculating-5km-proximity-buffers-around-substations-in-shapely/#fix-implementation" },
        { "@type": "HowToStep", "position": 3, "name": "Apply fallback routing for polar, zone-edge and large-batch cases", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/calculating-5km-proximity-buffers-around-substations-in-shapely/#fallback-routing-performance-tuning" },
        { "@type": "HowToStep", "position": 4, "name": "Gate the output with an area-sanity CI/CD audit", "url": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/calculating-5km-proximity-buffers-around-substations-in-shapely/#downstream-validation" }
      ]
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.renewable-energy-grid-gis.org/" },
        { "@type": "ListItem", "position": 2, "name": "Grid Infrastructure & Network Proximity Analysis", "item": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/" },
        { "@type": "ListItem", "position": 3, "name": "Grid Capacity Buffer Analysis", "item": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/" },
        { "@type": "ListItem", "position": 4, "name": "Calculating 5km Proximity Buffers Around Substations in Shapely", "item": "https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/calculating-5km-proximity-buffers-around-substations-in-shapely/" }
      ]
    }
  ]
}
</script>
