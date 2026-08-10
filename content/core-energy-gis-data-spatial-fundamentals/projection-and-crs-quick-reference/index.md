---
title: Projection & CRS Quick Reference for Energy GIS
description: A cross-reference of EPSG codes, projection families, and pyproj/geopandas gotchas for energy GIS — which CRS preserves distance, area, or shape, and when to use each.
slug: projection-and-crs-quick-reference
type: reference
breadcrumb: Projection & CRS Quick Reference
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Projection & CRS Quick Reference for Energy GIS

This page is the fast lookup the rest of the [Core Energy-GIS Data & Spatial Fundamentals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/) knowledge base links back to whenever a workflow needs to pick a coordinate frame. It answers one recurring question — *which EPSG code do I reproject to, given what I am about to compute?* — with three comparison tables, a decision matrix, and one runnable helper. It is deliberately terse; the conceptual treatment of datum shifts, transformation chains, and audit gating lives in [coordinate reference systems for energy projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/), and the specific web-tiling case in [aligning EPSG:4326 and EPSG:3857 for solar site mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/how-to-align-epsg4326-and-epsg3857-for-solar-site-mapping/).

The single rule that governs every table below: **you never measure on a geographic coordinate system.** Latitude and longitude are angles, not lengths. A degree of latitude is close to constant, but a degree of longitude shrinks with latitude, so on EPSG:4326 the east–west metre value of one "unit" is

$$ \Delta x_{\text{east}} \approx 111{,}320 \cdot \cos(\varphi)\ \text{metres per degree of longitude} $$

At $\varphi = 45^\circ\text{N}$ that is roughly $78{,}700$ m, and at $\varphi = 60^\circ\text{N}$ only $55{,}660$ m — while a degree of latitude stays near $110{,}540$ m throughout. Feed that anisotropy into `geometry.buffer(5000)` or `geometry.distance()` and the result is not off by a rounding error, it is off by a latitude-dependent scale factor. Project into a metric frame first, then measure.

## Common EPSG codes for energy work

These are the codes that cover the overwhelming majority of US and global renewable siting, grid, and resource work. "Property preserved" is what the projection keeps true at the expense of everything else — no map projection preserves distance, area, and shape simultaneously.

| EPSG | Name | Property preserved | Units | When to use |
|------|------|--------------------|-------|-------------|
| `EPSG:4326` | WGS 84 (geographic) | none — angular position | degrees | Storage, interchange, GPS feeds, join keys. Never for `.area`/`.length`/`.buffer`. |
| `EPSG:3857` | WGS 84 / Pseudo-Mercator | shape/angle (conformal); area badly inflated | metres | Slippy-map tiles, basemaps, drone orthomosaics. Visualization only — not area or distance. |
| `EPSG:32610` | WGS 84 / UTM zone 10N | shape/angle, locally near-true distance | metres | Distance, buffers, routing in the US West (≈126°W–120°W band). |
| `EPSG:32618` | WGS 84 / UTM zone 18N | shape/angle, locally near-true distance | metres | Same, for the US East (≈78°W–72°W band). |
| `EPSG:2277` | NAD83 / Texas Central (State Plane) | conformal, survey-grade local distance | US survey feet | Engineering/survey distance within one state zone; matches civil CAD drawings. |
| `EPSG:5070` | NAD83 / CONUS Albers | area (equal-area) | metres | Acreage, land-cover, setback area across the contiguous US. |
| `EPSG:6933` | WGS 84 / NSIDC EASE-Grid 2.0 Global | area (equal-area) | metres | Continental or global area analysis outside CONUS. |

UTM is a family of 60 six-degree zones; `EPSG:32610` and `EPSG:32618` are two examples. Pick the zone that contains your project's centroid — measured distances stay within centimetres near the central meridian and degrade toward the zone edges, where the point scale factor $k \approx 0.9996$ at the meridian grows past the outer boundary. State Plane zones (such as `EPSG:2277`) are tuned tighter than UTM for a single state and are what surveyors and permitting authorities expect on stamped drawings, but note the US survey foot unit — carry it explicitly or a buffer distance will be silently wrong by a factor of $3.28$.

## Projection family versus task

Choose the family from the operation, not from what the data happened to arrive in. Reproject at the boundary of the analysis and reproject back only for delivery.

<svg viewBox="0 0 940 372" role="img" aria-label="A matrix of four projection families against the four properties a siting workflow cares about. Geographic EPSG:4326 keeps position only. Web Mercator EPSG:3857 keeps shape and angle but distorts distance and badly distorts area. UTM and State Plane keep shape and angle and are near-true for distance inside their zone, with area near-true only locally. Albers and EASE-Grid keep area exactly, at the cost of shape and angle. No family keeps everything, which is why the task chooses the frame." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>What each projection family keeps true — and what it gives up</title>
  <desc>A four by four matrix. Rows are the projection families: geographic EPSG:4326, Web Mercator EPSG:3857, conformal local frames such as UTM and State Plane, and equal-area frames such as CONUS Albers and EASE-Grid. Columns are position, shape and angle, local distance, and area. Each cell carries one of three marks: a filled green disc for preserved, a half-filled blue disc for near-true within the zone of validity, and a hollow amber ring for distorted. Geographic preserves position only; Web Mercator preserves shape and angle; the local conformal frames preserve shape, angle and local distance; the equal-area frames preserve area alone.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="372"/>
  <defs><marker id="pm-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">No projection keeps everything — pick the family from the measurement</text>
  <text x="449.0" y="64" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700" opacity="0.85">position</text>
  <text x="587.0" y="64" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700" opacity="0.85">shape &amp; angle</text>
  <text x="725.0" y="64" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700" opacity="0.85">local distance</text>
  <text x="863.0" y="64" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700" opacity="0.85">area</text>
  <rect x="20" y="78" width="900" height="46" rx="6" fill="#DCEEF6" opacity="0.5"/>
  <text x="32" y="108" text-anchor="start" font-size="12" fill="currentColor">EPSG:4326 — geographic</text>
  <circle cx="449.0" cy="103" r="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2"/>
  <circle cx="449.0" cy="103" r="4" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="587.0" cy="103" r="9" fill="none" stroke="#F4A261" stroke-width="2" stroke-dasharray="3 2"/>
  <circle cx="725.0" cy="103" r="9" fill="none" stroke="#F4A261" stroke-width="2" stroke-dasharray="3 2"/>
  <circle cx="863.0" cy="103" r="9" fill="none" stroke="#F4A261" stroke-width="2" stroke-dasharray="3 2"/>
  <text x="32" y="162" text-anchor="start" font-size="12" fill="currentColor">EPSG:3857 — Web Mercator</text>
  <circle cx="449.0" cy="157" r="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2"/>
  <circle cx="449.0" cy="157" r="4" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="587.0" cy="157" r="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2"/>
  <circle cx="587.0" cy="157" r="4" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="725.0" cy="157" r="9" fill="none" stroke="#F4A261" stroke-width="2" stroke-dasharray="3 2"/>
  <circle cx="863.0" cy="157" r="9" fill="none" stroke="#F4A261" stroke-width="2" stroke-dasharray="3 2"/>
  <rect x="20" y="186" width="900" height="46" rx="6" fill="#DCEEF6" opacity="0.5"/>
  <text x="32" y="216" text-anchor="start" font-size="12" fill="currentColor">UTM · State Plane — conformal local</text>
  <circle cx="449.0" cy="211" r="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2"/>
  <circle cx="449.0" cy="211" r="4" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="587.0" cy="211" r="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2"/>
  <circle cx="587.0" cy="211" r="4" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="725.0" cy="211" r="9" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="2"/>
  <path d="M725.0,202 A9,9 0 0,1 725.0,220 Z" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <circle cx="863.0" cy="211" r="9" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="2"/>
  <path d="M863.0,202 A9,9 0 0,1 863.0,220 Z" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <text x="32" y="270" text-anchor="start" font-size="12" fill="currentColor">EPSG:5070 · 6933 — equal-area</text>
  <circle cx="449.0" cy="265" r="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2"/>
  <circle cx="449.0" cy="265" r="4" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="587.0" cy="265" r="9" fill="none" stroke="#F4A261" stroke-width="2" stroke-dasharray="3 2"/>
  <circle cx="725.0" cy="265" r="9" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="2"/>
  <path d="M725.0,256 A9,9 0 0,1 725.0,274 Z" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <circle cx="863.0" cy="265" r="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2"/>
  <circle cx="863.0" cy="265" r="4" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="40" cy="320" r="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2"/>
  <circle cx="40" cy="320" r="4" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="56" y="324" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">preserved</text>
  <circle cx="180" cy="320" r="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="2"/>
  <path d="M180,312 A8,8 0 0,1 180,328 Z" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <text x="196" y="324" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">near-true inside the zone of validity</text>
  <circle cx="470" cy="320" r="8" fill="none" stroke="#F4A261" stroke-width="2" stroke-dasharray="3 2"/>
  <text x="486" y="324" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">distorted — do not measure here</text>
  <text x="20" y="356" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.8">Reproject at the boundary of the analysis; reproject back only for delivery.</text>
</svg>

| Task | Use family | Avoid | Example EPSG |
|------|-----------|-------|--------------|
| Distance, buffers, nearest-feature, routing | Conformal local (UTM, State Plane) | `EPSG:4326`, `EPSG:3857` | `EPSG:32610`, `EPSG:32618`, `EPSG:2277` |
| Area, acreage, land-cover, setback footprints | Equal-area (Albers, EASE-Grid) | `EPSG:3857` above all | `EPSG:5070`, `EPSG:6933` |
| Web map, tile serving, visualization | Conformal global (Web Mercator) | measuring anything on it | `EPSG:3857` |
| Storage, interchange, join keys, GPS | Geographic | any measurement | `EPSG:4326` |

The one combination that ruins the most energy analyses is computing area in `EPSG:3857`. Web Mercator's areal scale factor is $\sec^2(\varphi)$, so a solar-array footprint or a habitat-loss polygon evaluated at $45^\circ\text{N}$ is overstated by roughly 100% before any other error enters. Capacity (MW) and land-cost estimates derived from a Web Mercator area are not conservative or optimistic — they are meaningless. Move to `EPSG:5070` for anything inside the lower 48, and to `EPSG:6933` for wider extents.

## pyproj and geopandas gotchas

The failures below rarely raise a clean exception at the point of the mistake; most surface as a plausible-but-wrong number several steps later.

<svg viewBox="0 0 940 356" role="img" aria-label="The difference between set_crs and to_crs, drawn on the same three substation points. set_crs only rewrites the label attached to the layer: the coordinates do not move, so declaring the wrong code silently relocates the asset. to_crs runs the transformation: the label and the coordinates both change together, and the points land where they belong in the new frame." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>set_crs relabels; to_crs transforms</title>
  <desc>Two panels over the same three points. In the left panel, labelled set_crs, the points stay in exactly the same place while the frame label changes from unknown to EPSG:4326, with a warning that an incorrect declaration moves the asset on the map without moving the numbers. In the right panel, labelled to_crs, the points shift to new positions as the coordinates are transformed from EPSG:4326 to EPSG:32610, and both the numbers and the label change together.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="356"/>
  <defs><marker id="sc-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">set_crs asserts what the numbers already mean · to_crs changes the numbers</text>
  <rect x="24" y="56" width="424" height="208" rx="7" fill="none" stroke="#F4A261" stroke-width="1.2" opacity="0.55"/>
  <text x="40" y="78" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">set_crs(4326)</text>
  <text x="40" y="96" text-anchor="start" font-size="11" fill="currentColor" opacity="0.8">label changes · coordinates do not move</text>
  <line x1="54" y1="112" x2="54" y2="250" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <line x1="54" y1="112" x2="414" y2="112" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <line x1="144" y1="112" x2="144" y2="250" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <line x1="54" y1="146" x2="414" y2="146" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <line x1="234" y1="112" x2="234" y2="250" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <line x1="54" y1="180" x2="414" y2="180" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <line x1="324" y1="112" x2="324" y2="250" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <line x1="54" y1="214" x2="414" y2="214" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <line x1="414" y1="112" x2="414" y2="250" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <line x1="54" y1="248" x2="414" y2="248" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <circle cx="154" cy="138" r="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.8"/>
  <circle cx="234" cy="176" r="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.8"/>
  <circle cx="192" cy="214" r="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.8"/>
  <rect x="492" y="56" width="424" height="208" rx="7" fill="none" stroke="#3D8B5F" stroke-width="1.2" opacity="0.55"/>
  <text x="508" y="78" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">to_crs(32610)</text>
  <text x="508" y="96" text-anchor="start" font-size="11" fill="currentColor" opacity="0.8">coordinates transform · label follows</text>
  <line x1="522" y1="112" x2="522" y2="250" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <line x1="522" y1="112" x2="882" y2="112" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <line x1="612" y1="112" x2="612" y2="250" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <line x1="522" y1="146" x2="882" y2="146" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <line x1="702" y1="112" x2="702" y2="250" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <line x1="522" y1="180" x2="882" y2="180" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <line x1="792" y1="112" x2="792" y2="250" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <line x1="522" y1="214" x2="882" y2="214" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <line x1="882" y1="112" x2="882" y2="250" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <line x1="522" y1="248" x2="882" y2="248" stroke="currentColor" stroke-width="0.7" opacity="0.18"/>
  <circle cx="718" cy="114" r="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.8"/>
  <circle cx="780" cy="146" r="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.8"/>
  <circle cx="720" cy="178" r="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.8"/>
  <circle cx="622" cy="138" r="5" fill="none" stroke="#3D8B5F" stroke-width="1" stroke-dasharray="3 2" opacity="0.5"/>
  <line x1="628" y1="135" x2="706" y2="117" stroke="currentColor" stroke-width="1.1" opacity="0.6" marker-end="url(#sc-arr)"/>
  <circle cx="702" cy="176" r="5" fill="none" stroke="#3D8B5F" stroke-width="1" stroke-dasharray="3 2" opacity="0.5"/>
  <line x1="708" y1="173" x2="768" y2="149" stroke="currentColor" stroke-width="1.1" opacity="0.6" marker-end="url(#sc-arr)"/>
  <circle cx="660" cy="214" r="5" fill="none" stroke="#3D8B5F" stroke-width="1" stroke-dasharray="3 2" opacity="0.5"/>
  <line x1="666" y1="211" x2="708" y2="181" stroke="currentColor" stroke-width="1.1" opacity="0.6" marker-end="url(#sc-arr)"/>
  <rect x="24" y="284" width="424" height="28" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="236.0" y="304" text-anchor="middle" font-size="11.5" fill="currentColor">Wrong code in set_crs = an asset silently relocated</text>
  <rect x="492" y="284" width="424" height="28" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="704.0" y="304" text-anchor="middle" font-size="11.5" fill="currentColor">to_crs on an unlabelled layer raises “naive geometries”</text>
</svg>

| Symptom | Cause | Fix |
|---------|-------|-----|
| Transformed coordinates come out swapped (lat/lon) | pyproj honours the authority axis order, and `EPSG:4326` is defined as (lat, lon) | Build the transformer with `always_xy=True`; geopandas already stores `x=lon, y=lat` |
| `buffer(5000)` returns a hemisphere-sized polygon | Buffering in `EPSG:4326` — `5000` is read as 5000 degrees | `to_crs()` to a metric CRS before `.buffer()` |
| `UserWarning: Geometry is in a geographic CRS. Results ... will be incorrect` | Called `.area` or `.length` on `EPSG:4326` | Reproject to equal-area (`EPSG:5070`) for area, or UTM for length, first |
| `to_crs` raises about "naive geometries" | `gdf.crs is None` | `set_crs(epsg)` to label the true source, then `to_crs()` to reproject |
| Features off by a metre or two after reprojection | Datum shift skipped (NAD27/NAD83 → WGS 84 by relabelling) | Let pyproj select a transformation grid; never overwrite the CRS label in place |

The `set_crs` versus `to_crs` distinction is the most common data-corrupting mistake for newcomers: `set_crs` **asserts** what CRS the coordinates are already in (it moves no points), while `to_crs` **reprojects** the coordinates into a new CRS (the numbers change). Calling `set_crs` on data that needs reprojecting silently mislabels it; calling `to_crs` on data with a wrong or absent source label reprojects from the wrong origin. When in doubt about which UTM zone a mixed-extent layer belongs to, let geopandas derive it from the data with `gdf.estimate_utm_crs()` rather than hard-coding a zone.

## Decision matrix: task → family → EPSG

<svg viewBox="0 0 960 430" role="img" aria-label="CRS selection decision matrix. Four analysis tasks each map to a projection family and then to concrete EPSG codes. Distance, buffers and routing map to a conformal local family and to UTM zones EPSG 32610 or 32618 and State Plane EPSG 2277. Area and acreage map to an equal-area family and to Albers EPSG 5070 or EASE-Grid EPSG 6933. Web map and visualization map to Web Mercator and EPSG 3857. Storage, interchange and join keys map to a geographic family and EPSG 4326, which must never be measured on." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="960" height="430"/>
  <title>Choosing a CRS: task drives the projection family, which fixes the EPSG code</title>
  <desc>A three-column matrix. The left column lists four analysis tasks; the middle column the projection family each requires; the right column the concrete EPSG codes. Distance and routing lead to conformal local UTM/State Plane (EPSG 32610, 32618, 2277); area leads to equal-area Albers/EASE (EPSG 5070, 6933); visualization leads to Web Mercator (EPSG 3857); storage leads to geographic (EPSG 4326).</desc>
  <defs>
    <marker id="crs-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
    </marker>
    <style>
      .task { fill:#DCEEF6; stroke:#5BA8C8; stroke-width:1.5; }
      .fam  { fill:#DCEEF6; stroke:#5BA8C8; stroke-width:1.5; }
      .ok   { fill:#DDF0E2; stroke:#3D8B5F; stroke-width:1.5; }
      .warn { fill:#FFE3BE; stroke:#F4A261; stroke-width:1.5; }
      .lbl  { fill:currentColor; text-anchor:middle; }
      .edge { stroke:currentColor; stroke-width:1.6; fill:none; opacity:0.85; }
      .head { fill:currentColor; opacity:0.7; text-anchor:middle; font-size:12px; letter-spacing:0.05em; }
    </style>
  </defs>
  <g class="head">
    <text x="120" y="26">TASK</text>
    <text x="480" y="26">FAMILY</text>
    <text x="840" y="26">EPSG</text>
  </g>
  <!-- Row 1: distance -->
  <rect class="task" x="20"  y="46"  width="200" height="64" rx="9"/>
  <rect class="fam"  x="380" y="46"  width="200" height="64" rx="9"/>
  <rect class="ok"   x="740" y="46"  width="200" height="64" rx="9"/>
  <g class="lbl" font-size="13">
    <text x="120" y="72">Distance, buffers,</text><text x="120" y="90">routing</text>
    <text x="480" y="72">Conformal local</text><text x="480" y="90">UTM / State Plane</text>
    <text x="840" y="72">32610 · 32618</text><text x="840" y="90">2277</text>
  </g>
  <!-- Row 2: area -->
  <rect class="task" x="20"  y="140" width="200" height="64" rx="9"/>
  <rect class="fam"  x="380" y="140" width="200" height="64" rx="9"/>
  <rect class="ok"   x="740" y="140" width="200" height="64" rx="9"/>
  <g class="lbl" font-size="13">
    <text x="120" y="166">Area, acreage,</text><text x="120" y="184">land-cover</text>
    <text x="480" y="166">Equal-area</text><text x="480" y="184">Albers / EASE-Grid</text>
    <text x="840" y="166">5070</text><text x="840" y="184">6933</text>
  </g>
  <!-- Row 3: web map -->
  <rect class="task" x="20"  y="234" width="200" height="64" rx="9"/>
  <rect class="fam"  x="380" y="234" width="200" height="64" rx="9"/>
  <rect class="ok"   x="740" y="234" width="200" height="64" rx="9"/>
  <g class="lbl" font-size="13">
    <text x="120" y="260">Web map,</text><text x="120" y="278">visualization</text>
    <text x="480" y="269">Web Mercator</text>
    <text x="840" y="269">3857</text>
  </g>
  <!-- Row 4: storage -->
  <rect class="task" x="20"  y="328" width="200" height="64" rx="9"/>
  <rect class="fam"  x="380" y="328" width="200" height="64" rx="9"/>
  <rect class="warn" x="740" y="328" width="200" height="64" rx="9"/>
  <g class="lbl" font-size="13">
    <text x="120" y="354">Storage, join,</text><text x="120" y="372">interchange</text>
    <text x="480" y="354">Geographic</text><text x="480" y="372">(angular degrees)</text>
    <text x="840" y="354">4326</text><text x="840" y="372">never measure on it</text>
  </g>
  <!-- edges task -> family -->
  <g class="edge">
    <line x1="220" y1="78"  x2="372" y2="78"  marker-end="url(#crs-arrow)"/>
    <line x1="220" y1="172" x2="372" y2="172" marker-end="url(#crs-arrow)"/>
    <line x1="220" y1="266" x2="372" y2="266" marker-end="url(#crs-arrow)"/>
    <line x1="220" y1="360" x2="372" y2="360" marker-end="url(#crs-arrow)"/>
    <line x1="580" y1="78"  x2="732" y2="78"  marker-end="url(#crs-arrow)"/>
    <line x1="580" y1="172" x2="732" y2="172" marker-end="url(#crs-arrow)"/>
    <line x1="580" y1="266" x2="732" y2="266" marker-end="url(#crs-arrow)"/>
    <line x1="580" y1="360" x2="732" y2="360" marker-end="url(#crs-arrow)"/>
  </g>
</svg>

## A CRS-selection and reproject helper

This helper encodes the decision matrix directly: pass a `GeoDataFrame` and the task you are about to perform, and it reprojects into the correct frame. For distance work it derives a datum-correct UTM zone from the data's own extent rather than hard-coding one; for area and visualization it maps to fixed CONUS targets. It refuses to run on a layer whose CRS is undefined — the one condition guaranteed to produce a silent wrong answer.

```python
import geopandas as gpd
import pyproj

# Fixed targets for CONUS-scale energy work (distance is derived per-layer)
TASK_CRS = {
    "area":    "EPSG:5070",   # NAD83 / CONUS Albers — equal-area, metres
    "webmap":  "EPSG:3857",   # Web Mercator — tiles/visualisation ONLY
    "storage": "EPSG:4326",   # WGS 84 — interchange / join key
}

def project_for_task(sites_gdf: gpd.GeoDataFrame, task: str) -> gpd.GeoDataFrame:
    """Reproject a layer into the CRS appropriate for `task`.

    task="distance" derives the UTM zone covering the layer's centroid so
    buffers and nearest-feature search run in near-true metres; every other
    task maps to a fixed target in TASK_CRS.
    """
    if sites_gdf.crs is None:
        raise ValueError(
            "Input CRS is undefined — call set_crs(<true source EPSG>) "
            "before reprojecting; to_crs() cannot transform naive geometries."
        )

    if task == "distance":
        target_crs = sites_gdf.estimate_utm_crs()   # e.g. EPSG:32610 in NorCal
    elif task in TASK_CRS:
        target_crs = pyproj.CRS.from_user_input(TASK_CRS[task])
    else:
        raise ValueError(
            f"Unknown task {task!r}; expected 'distance' or one of {list(TASK_CRS)}"
        )

    projected = sites_gdf.to_crs(target_crs)

    # Guard the classic mistake: measuring on a geographic frame
    if task in {"distance", "area"} and projected.crs.is_geographic:
        raise ValueError(f"{target_crs} is geographic; {task} requires a projected CRS")

    return projected


# Usage: buffer a substation layer in true metres
substation_gdf = gpd.read_file("substations.geojson")        # arrives as EPSG:4326
substation_gdf = project_for_task(substation_gdf, "distance") # -> UTM, metres
buffers_gdf = substation_gdf.assign(geometry=substation_gdf.buffer(5000))  # 5 km
```

Two details make this production-safe rather than merely correct. First, `estimate_utm_crs()` returns a single zone for the whole layer, which is right for a project-scale footprint but wrong for a layer spanning several UTM zones — for a national portfolio, partition by zone or switch to `EPSG:5070`/`EPSG:6933` and accept the equal-area trade-off. Second, when you build a raw `pyproj.Transformer` outside geopandas — for example to reproject bare coordinate tuples — always pass `always_xy=True` so the transformer emits `(lon, lat)` regardless of the authority axis order, matching what geopandas and Shapely expect.

## Guidance notes

- **Store in `EPSG:4326`, analyse in a projected frame, deliver in whatever the consumer needs.** A permitting portal usually wants `EPSG:4326` GeoJSON; a civil engineer wants the local State Plane zone; a tile server wants `EPSG:3857`. Keep the analytical CRS separate from the delivery CRS.
- **Tag every layer on ingestion.** An undefined CRS is not a neutral default — it is a landmine that only detonates at the first `to_crs`. Assert the source EPSG with `set_crs` the moment data enters the pipeline.
- **Match units, not just codes.** `EPSG:2277` is in US survey feet; a `5000`-unit buffer there is 1524 m, not 5 km. Read `crs.axis_info[0].unit_name` before trusting any distance literal.
- **Reproject before spatial indexing and distance search.** The nearest-substation and buffer routines in [proximity distance calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) assume a metric CRS; feeding them `EPSG:4326` returns degrees, not metres.
- **Keep terrain and vector layers on the same frame.** Hillshade, slope, and horizon-angle rasters in [terrain shadow analysis pipelines](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/) must share the analysis CRS with the turbine and array vectors they mask, or the shading loss lands on the wrong pixels.


## Worked example: choosing a frame for a three-state portfolio

A portfolio spanning west Texas, southern New Mexico and south-eastern Arizona illustrates every
rule on this page at once. The extent crosses UTM zones 12, 13 and 14, so no single UTM zone is
defensible for distance work across the whole portfolio. Three workable arrangements exist, and the
choice depends on what is being measured.

The first is per-site frames: reproject each site into the UTM zone containing it, measure turbine
spacing and setbacks there, and never compare raw coordinates across sites. This keeps every
distance measurement inside a zone where the scale factor stays within a few parts per ten thousand,
and it is the right choice for engineering-grade measurements. The cost is bookkeeping: each site's
outputs carry their own EPSG code, and any portfolio-level geometry operation has to reproject
first.

The second is a single custom Lambert Conformal Conic with standard parallels straddling the
portfolio latitude band. Distances are then comparable across the whole portfolio in one frame, at
the cost of a scale factor that departs slightly from unity away from the standard parallels. This
is the usual choice for corridor studies and transmission routing, where the measurement of interest
spans sites rather than sitting inside one.

The third applies only to area: reproject to `EPSG:5070` for anything expressed in acres or
hectares, regardless of which frame the distance work used. Equal-area and conformal are mutually
exclusive properties, so a portfolio that reports both buildable acreage and turbine spacing is
using two frames by necessity, not by oversight.

The failure mode all three prevent is the fourth arrangement, which is the one that happens by
accident: everything is loaded in `EPSG:4326`, one analyst reprojects to a single UTM zone because
`estimate_utm_crs()` returned it for the portfolio centroid, and every site outside that zone
carries a scale error that grows with distance from its central meridian. The numbers stay
plausible, the map looks right, and the spacing violations only appear at construction staking.

## Frequently asked questions

### Is `EPSG:3857` ever acceptable for analysis?

Only for deciding what a user sees on a slippy map. It is conformal, so shapes and angles are locally
correct, which is why it renders well; its areal scale factor is the secant squared of the latitude,
so a footprint at 45°N measures twice its true area. Anything that becomes a number in a report —
acreage, capacity density, setback area — has to be recomputed in an equal-area frame.

### Why does the same parcel report different areas in different frames?

Because area is not preserved by most projections, and the difference is not an error in either
frame. `EPSG:5070` preserves area and distorts shape; a UTM zone preserves shape and distorts area
slightly; Web Mercator preserves shape and distorts area badly. The parcel has one true area; the
frames disagree because they are answering different questions. Pick the frame from the measurement,
then state which frame produced the figure.

### What does `set_crs` do that `to_crs` does not?

`set_crs` asserts what the existing coordinates already mean and moves nothing; `to_crs` transforms
the coordinates into a new frame and moves everything. Using `set_crs` to "convert" a layer relocates
the asset on the ground while leaving the numbers untouched, which is why it is the single most
data-corrupting mistake in this list — nothing about the resulting file looks wrong.

### How do I choose between a UTM zone and a State Plane zone?

Take State Plane when the deliverable has to match surveyor or civil-engineering drawings, which are
usually published in it, and accept that most State Plane zones are in US survey feet. Take UTM when
the work is metric and the extent fits one zone. Whichever is chosen, assert the axis unit
explicitly: a 400 threshold means 400 feet in `EPSG:2225` and 400 metres in `EPSG:32610`, and the
geometry checks pass either way.

### Do I need to reproject rasters as well as vectors?

Yes, and the raster is the harder one, because reprojection resamples pixel values as well as moving
them. Choose the kernel from what the pixels mean — nearest for categorical masks, bilinear or
average for continuous surfaces — and prefer reprojecting the vector layer to the raster's frame
when the raster is large, since moving a few thousand geometries is far cheaper than resampling a
few billion pixels.


### What frame should be used for a national statistic?

An equal-area one — `EPSG:5070` for CONUS, `EPSG:6933` globally — for anything that aggregates area,
and a per-zone approach for anything that aggregates distance. A national mean of parcel areas
computed in a conformal frame is weighted by latitude in a way nobody intends, because the same
hectare occupies more map area in the north than in the south.

### Are the EPSG codes on this page stable?

The codes are; what they refer to can be revised. An EPSG code identifies a CRS definition, and the
authority occasionally deprecates one in favour of a new realisation — the NAD83(2011) to NATRF2022
transition being the live case in North America. Pin the PROJ database version alongside the code so
a rebuild resolves the same definition it did the first time.

### Should the analysis CRS be stored per layer or per project?

Per project, asserted per layer. One declared analysis frame is what lets consumers skip the
reprojection question entirely; per-layer frames put that question back into every join. Layers that
must differ — the equal-area copy used for acreage — are the deliberate exception and should be
named so that the difference is obvious in the filename.

## Related

- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — the full treatment of datum shifts, transformation chains, and audit gating behind this lookup.
- [Aligning EPSG:4326 and EPSG:3857 for Solar Site Mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/how-to-align-epsg4326-and-epsg3857-for-solar-site-mapping/) — the specific web-tiling case where conformal-vs-equal-area confusion bites.
- [Core Energy-GIS Data & Spatial Fundamentals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/) — the six-stage pipeline this reference supports, with CRS alignment as stage two.
- [Proximity Distance Calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) — where the projected-CRS discipline here becomes a hard precondition for correct grid distances.
- [Terrain Shadow Analysis Pipelines](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/) — raster-vector work that depends on a shared, metric analysis CRS.
