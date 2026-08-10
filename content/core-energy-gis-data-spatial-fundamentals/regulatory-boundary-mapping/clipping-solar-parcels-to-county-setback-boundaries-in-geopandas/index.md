---
title: Clipping Solar Parcels to County Setback Boundaries in GeoPandas
description: Compute buildable solar area after county setbacks in GeoPandas — why gpd.clip on EPSG:4326 returns wrong areas, how invalid geometry and negative-buffer collapse break overlays, and a corrected erode-and-erase workflow with a CI area gate.
slug: clipping-solar-parcels-to-county-setback-boundaries-in-geopandas
type: article
breadcrumb: Clipping Parcels to Setbacks
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Clipping Solar Parcels to County Setback Boundaries in GeoPandas

You run `gpd.clip` on a parcel layer, subtract the county setback, and the reported buildable area comes back as `0.0007` — or the whole overlay dies with a `GEOSException: TopologyException`, or every parcel silently returns an empty envelope. This is the failure this page exists to eliminate: turning a parcel and a county setback ordinance into a defensible `buildable_area_ha` figure that a solar developer can size a project against. It is a downstream step of [Regulatory Boundary Mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/) — the compliance mask tells you *which* land is excluded, and this operation measures *how much* of a given parcel survives once the setback rule is applied. Get the projection or the geometry handling wrong and the buildable acreage feeding the entire financial model is wrong, usually without an exception to warn you.

The operation itself is small. The buildable geometry is the parcel eroded inward by the setback distance $s$, with hard exclusions $E$ (roads, wetlands, occupied structures) removed:

$$ A_{\text{build}} = \big( P \ominus s \big) \setminus E, \qquad \text{ha} = \frac{A_{\text{build}}}{10^{4}} $$

where $P \ominus s$ is the morphological erosion — a negative buffer — and division by $10^4$ converts square metres to hectares. Every production failure lives in the data $P$ and $E$ consume, and in the CRS the area is measured in, not in that formula.

## Root-cause analysis

Four compounding causes account for nearly every broken setback calculation, and each maps to a distinct fix below.

1. **`clip` / `overlay` run on a geographic CRS.** If `parcels_gdf.crs` is `EPSG:4326`, `.area` and `.buffer(-30)` operate in *degrees*, not metres. A 30 m setback becomes a 30-degree buffer that erases the parcel to empty, and areas print as tiny decimal degree² values that are physically meaningless. This is the single most common cause and it never raises — it just returns nonsense.
2. **Invalid parcel geometry aborts the overlay.** County parcel fabrics are full of self-intersecting rings, duplicate vertices, and bowtie polygons. `gpd.overlay` and `gpd.clip` push these straight into the GEOS engine, which throws a `TopologyException` mid-run and kills the batch — or, worse, returns a partially corrupted result.
3. **Negative-buffer collapse.** `geometry.buffer(-s)` on a parcel narrower than $2s$ returns an *empty* polygon; on an L-shaped or pinched parcel it returns a *multipart* polygon of disconnected slivers. Feed either downstream and you get empty overlays, exploded row counts, or buildable fragments too small to site a single table on.
4. **One global setback for every county.** Setback ordinances vary by jurisdiction — property-line, occupied-dwelling, and road setbacks differ from county to county. Hard-coding a single `setback_m` applies the wrong rule to most parcels in a multi-county portfolio, and the error is invisible in the output geometry.

<svg viewBox="0 0 840 384" role="img" aria-label="Four failure causes mapped to their fixes when clipping solar parcels to county setbacks. Cause one, clip or overlay run on EPSG:4326, produces areas in degrees squared, and is fixed by reprojecting to EPSG:5070 or a UTM zone before measuring. Cause two, invalid parcel rings, raises a GEOSException, and is fixed by running make_valid before the overlay. Cause three, negative-buffer collapse producing empty and multipart geometry, is fixed by dropping empties, exploding parts, and filtering by minimum area. Cause four, one global setback value producing a wrong per-county result, is fixed by joining a per-county setback rule table." xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-width:840px;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="840" height="384"/>
  <title>County setback failure causes mapped to their fixes</title>
  <desc>Four warning-coloured cause boxes on the left, each connected by an arrow to a success-coloured fix box on the right. Row one: clip or overlay on EPSG:4326 giving areas in degrees squared maps to reproject to EPSG:5070 or UTM then measure in metres squared and hectares. Row two: invalid parcel rings raising a GEOSException maps to make_valid before the overlay. Row three: negative-buffer collapse producing empty and multipart geometry maps to drop empties, explode parts, filter by minimum area. Row four: one global setback value giving a wrong per-county result maps to join a per-county setback rule table.</desc>
  <defs>
    <marker id="csb-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
    </marker>
  </defs>
  <text x="185" y="22" fill="#1F3A60" font-size="12.5" text-anchor="middle" font-weight="600">Failure cause</text>
  <text x="655" y="22" fill="#1F3A60" font-size="12.5" text-anchor="middle" font-weight="600">Fix stage</text>
  <g fill="#1F3A60" font-size="12" text-anchor="middle">
    <!-- Row 1 -->
    <rect x="20" y="40" width="330" height="56" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="185" y="63" font-weight="600">clip / overlay on EPSG:4326</text>
    <text x="185" y="81" font-size="11">areas come out in degrees²</text>
    <rect x="490" y="40" width="330" height="56" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <text x="655" y="63" font-weight="600">reproject to EPSG:5070 / UTM</text>
    <text x="655" y="81" font-size="11">then measure in m² and ha</text>
    <!-- Row 2 -->
    <rect x="20" y="118" width="330" height="56" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="185" y="141" font-weight="600">invalid parcel rings</text>
    <text x="185" y="159" font-size="11">overlay raises GEOSException</text>
    <rect x="490" y="118" width="330" height="56" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <text x="655" y="141" font-weight="600">make_valid() before overlay</text>
    <text x="655" y="159" font-size="11">topology repaired in place</text>
    <!-- Row 3 -->
    <rect x="20" y="196" width="330" height="56" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="185" y="219" font-weight="600">negative-buffer collapse</text>
    <text x="185" y="237" font-size="11">empty &amp; multipart geometry</text>
    <rect x="490" y="196" width="330" height="56" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <text x="655" y="219" font-weight="600">drop empties · explode · area filter</text>
    <text x="655" y="237" font-size="11">keep real buildable polygons</text>
    <!-- Row 4 -->
    <rect x="20" y="274" width="330" height="56" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="185" y="297" font-weight="600">one global setback value</text>
    <text x="185" y="315" font-size="11">wrong per-county result</text>
    <rect x="490" y="274" width="330" height="56" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
    <text x="655" y="297" font-weight="600">join per-county setback table</text>
    <text x="655" y="315" font-size="11">per-parcel setback_m applied</text>
  </g>
  <g stroke="currentColor" stroke-width="1.6" fill="none" color="#5BA8C8">
    <line x1="350" y1="68" x2="490" y2="68" marker-end="url(#csb-arrow)"/>
    <line x1="350" y1="146" x2="490" y2="146" marker-end="url(#csb-arrow)"/>
    <line x1="350" y1="224" x2="490" y2="224" marker-end="url(#csb-arrow)"/>
    <line x1="350" y1="302" x2="490" y2="302" marker-end="url(#csb-arrow)"/>
  </g>
</svg>

## Pre-flight validation

Surface the root cause *before* the buffer and overlay run. Refusing a geographic CRS and a missing per-county setback column up front converts three of the four silent failures into a fast, precise error — which is exactly what you want in a CI/CD screening job that processes thousands of parcels unattended.

```python
import geopandas as gpd


def preflight_setback_inputs(
    parcels_gdf: gpd.GeoDataFrame,
    exclusions_gdf: gpd.GeoDataFrame,
) -> None:
    """Raise on the exact root cause before any buffer or overlay is evaluated."""
    # Cause 1: geographic CRS makes buffer() and area() return degrees, not metres
    for name, gdf in (("parcels", parcels_gdf), ("exclusions", exclusions_gdf)):
        if gdf.crs is None:
            raise ValueError(f"{name} has no CRS; refusing to buffer or measure blindly.")
        if gdf.crs.is_geographic:
            raise ValueError(
                f"{name} is geographic ({gdf.crs.to_epsg()}); reproject to a metric CRS "
                "(EPSG:5070 or a local UTM zone) before applying a metre setback."
            )
    # Cause 4: a per-county rule must be attached per parcel, not hard-coded
    if "setback_m" not in parcels_gdf.columns:
        raise ValueError(
            "parcels missing per-county 'setback_m'; join the county rule table first."
        )
    if parcels_gdf["setback_m"].isna().any():
        raise ValueError("null setback_m present; every parcel needs a county setback rule.")
    # Cause 2: report invalid rings so the repair step is not a surprise
    invalid = int((~parcels_gdf.geometry.is_valid).sum())
    if invalid:
        print(f"[preflight] {invalid} parcels have invalid geometry; make_valid will repair them.")
```

| Validation step | Diagnostic command | Expected outcome |
|-----------------|--------------------|------------------|
| Projected CRS | `not parcels_gdf.crs.is_geographic` | True — area and buffer are in metres |
| Metric target | `parcels_gdf.crs.to_epsg() in (5070, 32610, ...)` | An equal-area or UTM EPSG, never `EPSG:4326` |
| Geometry validity | `parcels_gdf.geometry.is_valid.all()` | True after `make_valid` repair |
| Per-county rule | `"setback_m" in parcels_gdf.columns` | Column present, no nulls |

## Fix implementation

The corrected function reprojects to a metric CRS, repairs geometry, applies the per-parcel setback as a negative buffer, erases hard exclusions with `overlay(how="difference")`, then cleans up the collapse artefacts before measuring. Parameter choices are justified for solar siting: `EPSG:5070` (CONUS Albers equal-area) keeps hectare totals comparable across a multi-county portfolio; a single project can instead use its local UTM zone. The `min_fragment_m2` floor discards slivers too small to hold a module table, and `keep_geom_type=True` stops the difference from leaking stray lines or points into the result.

<svg viewBox="0 0 940 420" role="img" aria-label="A worked clip of one 42 hectare parcel against three county setbacks. The gross parcel is 42.0 hectares. A 30 metre setback from the road frontage removes 2.4 hectares, a 60 metre setback from the two neighbouring dwellings removes 6.9, and a 45 metre stream buffer removes 5.3 with 0.6 hectares of that overlapping the dwelling setback. Union first, then subtract once: the buildable envelope is 28.0 hectares, not the 27.4 that subtracting each band in turn would report." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>One parcel, three setbacks, and why the bands are unioned before subtraction</title>
  <desc>A plan view of a parcel with a road along its southern edge, two dwellings to the east, and a stream crossing its north-west corner. Three setback bands are drawn: 30 metres from the road, 60 metres around each dwelling, and 45 metres from the stream centreline. The dwelling and stream bands overlap in one small area. The remaining buildable envelope is shaded. Beside the plan, the arithmetic: 42.0 hectares gross, minus 2.4 for the road, 6.9 for the dwellings and 5.3 for the stream, with 0.6 hectares counted in two bands, giving 28.0 hectares buildable.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="420"/>
  <defs><marker id="cl-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Overlapping setbacks: subtract the union, not the bands</text>
  <rect x="40" y="60" width="460" height="280" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <rect x="40" y="300" width="460" height="40" rx="0" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3" opacity="0.7"/>
  <text x="124" y="324" text-anchor="middle" font-size="11" fill="#7A4A1A">road setback 30 m</text>
  <line x1="40" y1="344" x2="500" y2="344" stroke="currentColor" stroke-width="2.4" opacity="0.7"/>
  <text x="460" y="362" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">county road</text>
  <circle cx="470" cy="130" r="74" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3" opacity="0.55"/>
  <circle cx="470" cy="130" r="5" fill="currentColor" stroke="currentColor" stroke-width="1"/>
  <circle cx="470" cy="230" r="74" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3" opacity="0.55"/>
  <circle cx="470" cy="230" r="5" fill="currentColor" stroke="currentColor" stroke-width="1"/>
  <text x="392" y="84" text-anchor="end" font-size="11" fill="#7A4A1A">dwelling setbacks 60 m</text>
  <path d="M40,130 L170,90 L250,60" fill="none" stroke="#5BA8C8" stroke-width="3" opacity="0.8"/>
  <path d="M40,172 L190,122 L272,84 L272,60 L40,60 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2" opacity="0.45"/>
  <text x="136" y="156" text-anchor="middle" font-size="11" fill="#2C6E8F">stream buffer 45 m</text>
  <text x="240" y="260" text-anchor="middle" font-size="12" fill="#1F5C3A" font-weight="700">buildable envelope</text>
  <rect x="150" y="274" width="180" height="4" rx="2" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1" opacity="0.7"/>
  <rect x="540" y="66" width="368" height="42" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2" opacity="0.6"/>
  <text x="556" y="93" text-anchor="start" font-size="12" fill="currentColor">gross parcel</text>
  <text x="892" y="93" text-anchor="end" font-size="12.5" fill="currentColor" font-weight="700">42.0 ha</text>
  <rect x="540" y="114" width="368" height="42" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.6"/>
  <text x="556" y="141" text-anchor="start" font-size="12" fill="currentColor">− road setback</text>
  <text x="892" y="141" text-anchor="end" font-size="12.5" fill="currentColor" font-weight="700">2.4 ha</text>
  <rect x="540" y="162" width="368" height="42" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.6"/>
  <text x="556" y="189" text-anchor="start" font-size="12" fill="currentColor">− dwelling setbacks</text>
  <text x="892" y="189" text-anchor="end" font-size="12.5" fill="currentColor" font-weight="700">6.9 ha</text>
  <rect x="540" y="210" width="368" height="42" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.6"/>
  <text x="556" y="237" text-anchor="start" font-size="12" fill="currentColor">− stream buffer</text>
  <text x="892" y="237" text-anchor="end" font-size="12.5" fill="currentColor" font-weight="700">5.3 ha</text>
  <rect x="540" y="258" width="368" height="42" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.6"/>
  <text x="556" y="285" text-anchor="start" font-size="12" fill="currentColor">+ overlap counted twice</text>
  <text x="892" y="285" text-anchor="end" font-size="12.5" fill="currentColor" font-weight="700">0.6 ha</text>
  <rect x="540" y="306" width="368" height="42" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.6"/>
  <text x="556" y="333" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">= buildable</text>
  <text x="892" y="333" text-anchor="end" font-size="12.5" fill="currentColor" font-weight="700">28.0 ha</text>
  <text x="40" y="396" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">Band-by-band subtraction would report 27.4 ha — the 0.6 ha overlap removed twice.</text>
</svg>

```python
import geopandas as gpd
import pandas as pd


def compute_buildable_area(
    parcels_gdf: gpd.GeoDataFrame,
    exclusions_gdf: gpd.GeoDataFrame,
    target_epsg: int = 5070,          # CONUS Albers equal-area; use a UTM zone for one project
    min_fragment_m2: float = 100.0,   # drop buildable slivers smaller than one table footprint
) -> gpd.GeoDataFrame:
    """Erode each parcel by its county setback, erase hard exclusions, and
    return per-parcel buildable_area_m2 / buildable_area_ha in a metric CRS."""
    preflight_setback_inputs(parcels_gdf, exclusions_gdf)

    # 1. Reproject once so buffer() and area() are in metres (Cause 1)
    parcels = parcels_gdf.to_crs(epsg=target_epsg).copy()
    exclusions = exclusions_gdf.to_crs(epsg=target_epsg).copy()

    # 2. Repair topology before any overlay (Cause 2) — shapely 2.0 / geopandas >= 0.14
    parcels["geometry"] = parcels.geometry.make_valid()
    exclusions["geometry"] = exclusions.geometry.make_valid()

    # 3. Per-parcel negative buffer = county setback from the parcel boundary (Cause 4)
    #    Passing an array-like distance applies each row's own setback_m.
    parcels["geometry"] = parcels.geometry.buffer(-parcels["setback_m"].to_numpy())

    # 4. Negative-buffer collapse cleanup (Cause 3): drop parcels eroded to nothing
    parcels = parcels[~parcels.geometry.is_empty & parcels.geometry.notna()]

    # 5. Erase hard exclusions — difference keeps parcel land NOT covered by exclusions
    buildable = gpd.overlay(parcels, exclusions, how="difference", keep_geom_type=True)

    # 6. Explode multipart remnants and filter slivers, then re-dissolve per parcel
    buildable = buildable.explode(index_parts=False)
    buildable = buildable[buildable.geometry.area >= min_fragment_m2]
    per_parcel = buildable.dissolve(by="parcel_id", as_index=True, aggfunc="first")

    # 7. Report area in both units for siting and audit
    per_parcel["buildable_area_m2"] = per_parcel.geometry.area
    per_parcel["buildable_area_ha"] = per_parcel["buildable_area_m2"] / 1e4
    return per_parcel
```

Applying the negative buffer as a NumPy array of per-row distances is what keeps the county rule attached to the right parcel — `buffer(-30)` would silently overwrite every jurisdiction's ordinance with a single value. Using `overlay(how="difference")` rather than `gpd.clip` is deliberate: `clip` keeps the *intersection* with a mask, whereas here you want the parcel land that the exclusions do **not** cover, which is the set difference.

Once you have hectares, the developable capacity follows from a packing density $\rho$ (typically ~0.2–0.4 MW/ha for fixed-tilt utility PV):

$$ \text{capacity\_mw} = \text{buildable\_area\_ha} \times \rho $$

so a defensible `buildable_area_ha` is the load-bearing number the rest of the model rests on.

## Fallback routing & performance tuning

For statewide parcel fabrics or unattended CI/CD screening runs, layer these strategies on top of the core function:

- **Reproject once, at the boundary.** Transform `parcels` and `exclusions` a single time up front, never inside a per-county loop — repeated `to_crs` is the most common avoidable hotspot in setback batches.
- **Pre-buffer exclusions before the difference.** Roads and property lines usually arrive as lines or points; buffer them to their own statutory setback first, the same line-to-polygon step covered in [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/), so the difference operates polygon-on-polygon.
- **Build the spatial index once.** Call `exclusions.sindex` before the overlay so GEOS prunes non-intersecting pairs, dropping the cost from O(N×M) toward near-linear on large county layers.
- **Tune the sliver floor per technology.** A single-axis tracker needs a larger contiguous `min_fragment_m2` than a rooftop array; expose it as a parameter rather than hard-coding `100.0`.
- **Chunk by county with `dask-geopandas`.** Partition parcels by `county_fips` and map the function across workers; each partition already shares one setback rule, so the join and buffer stay cache-friendly.

## Downstream validation

Before a buildable figure feeds a capacity model, gate it with assertions suitable for a CI/CD pipeline. The two invariants that catch the failures above are that no parcel reports a **negative** buildable area, and that buildable area never **exceeds** the source parcel area — a setback can only ever remove land, so a result larger than its parent means a CRS or geometry regression slipped through.

<svg viewBox="0 0 940 340" role="img" aria-label="Four assertions that separate a correct clip from a plausible one: the clipped area must never exceed the gross parcel area, the clipped geometry must lie inside the original, every output geometry must be valid, and the count of parcels reduced to zero area must match the count of parcels genuinely fully covered. Each has a matching symptom when it fails." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Four assertions, and the specific bug each one catches</title>
  <desc>A four-row table. Assertion one, clipped area is less than or equal to gross area, catches a clip performed in a geographic CRS where areas are meaningless. Assertion two, the clipped geometry is within the original, catches a swapped argument order in the overlay. Assertion three, all geometries report valid, catches self-intersections introduced by the difference operation. Assertion four, the count of zero-area outputs matches the count of fully covered parcels, catches an over-broad setback union.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="340"/>
  <defs><marker id="ca-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">What each assertion is actually protecting against</text>
  <rect x="40" y="62" width="400" height="52" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="240" y="94" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">area_clipped &lt;= area_gross</text>
  <line x1="444" y1="88" x2="476" y2="88" stroke="currentColor" stroke-width="1.4" marker-end="url(#ca-arr)"/>
  <rect x="484" y="62" width="416" height="52" rx="7" fill="none" stroke="#3D8B5F" stroke-width="1.1" opacity="0.6"/>
  <text x="692" y="94" text-anchor="middle" font-size="11.5" fill="currentColor">a clip run in a geographic CRS</text>
  <rect x="40" y="124" width="400" height="52" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="240" y="156" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">clipped.within(original).all()</text>
  <line x1="444" y1="150" x2="476" y2="150" stroke="currentColor" stroke-width="1.4" marker-end="url(#ca-arr)"/>
  <rect x="484" y="124" width="416" height="52" rx="7" fill="none" stroke="#3D8B5F" stroke-width="1.1" opacity="0.6"/>
  <text x="692" y="156" text-anchor="middle" font-size="11.5" fill="currentColor">the overlay arguments were swapped</text>
  <rect x="40" y="186" width="400" height="52" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="240" y="218" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">clipped.is_valid.all()</text>
  <line x1="444" y1="212" x2="476" y2="212" stroke="currentColor" stroke-width="1.4" marker-end="url(#ca-arr)"/>
  <rect x="484" y="186" width="416" height="52" rx="7" fill="none" stroke="#F4A261" stroke-width="1.1" opacity="0.6"/>
  <text x="692" y="218" text-anchor="middle" font-size="11.5" fill="currentColor">difference() introduced a self-intersection</text>
  <rect x="40" y="248" width="400" height="52" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="240" y="280" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">n_zero_area == n_fully_covered</text>
  <line x1="444" y1="274" x2="476" y2="274" stroke="currentColor" stroke-width="1.4" marker-end="url(#ca-arr)"/>
  <rect x="484" y="248" width="416" height="52" rx="7" fill="none" stroke="#C85B5B" stroke-width="1.1" opacity="0.6"/>
  <text x="692" y="280" text-anchor="middle" font-size="11.5" fill="currentColor">the setback union swallowed whole parcels</text>
  <text x="40" y="322" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">Assertions are cheap; a permitting submission built on a swapped overlay is not.</text>
</svg>

```python
def assert_buildable_integrity(
    result_gdf: gpd.GeoDataFrame,
    parcels_gdf: gpd.GeoDataFrame,
    target_epsg: int = 5070,
    area_tol_m2: float = 1.0,
) -> None:
    """CI/CD gate: fail the build if buildable areas are not physically defensible."""
    assert result_gdf.crs.to_epsg() == target_epsg, "result drifted off the metric CRS"
    assert result_gdf.geometry.is_valid.all(), "invalid buildable geometry after overlay"
    assert (result_gdf["buildable_area_m2"] >= 0).all(), "negative buildable area present"

    # buildable must never exceed the original parcel footprint
    src_area = parcels_gdf.to_crs(epsg=target_epsg).set_index("parcel_id").geometry.area
    check = result_gdf["buildable_area_m2"].to_frame().join(src_area.rename("parcel_area_m2"))
    breach = check["buildable_area_m2"] > check["parcel_area_m2"] + area_tol_m2
    assert not breach.any(), f"buildable exceeds parcel area for {list(check.index[breach])}"
```

Logging the buildable-to-parcel ratio per county as part of the run is what keeps the screening auditable: a reviewer preparing a permitting package can see at a glance that a 640-acre parcel yielded, say, 71% buildable land after setbacks rather than an implausible 103%. The same geometry-integrity discipline is enforced in depth by [Spatial Data Quality Validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/); pin `geopandas`, `shapely`, and `pyproj` versions in `pyproject.toml` so a `make_valid` or `overlay` behaviour change cannot silently shift the buildable area between runs.

## Related

- [Regulatory Boundary Mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/) — the parent workflow that produces the exclusion mask this operation clips against.
- [Automating US County Boundary Extraction with OSMnx](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/automating-us-county-boundary-extraction-with-osmnx/) — pull the county polygons that carry each jurisdiction's setback rule.
- [Spatial Data Quality Validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) — geometry repair and validity checks the overlay depends on.
- [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) — buffer line and point infrastructure into the polygon exclusions erased here.
