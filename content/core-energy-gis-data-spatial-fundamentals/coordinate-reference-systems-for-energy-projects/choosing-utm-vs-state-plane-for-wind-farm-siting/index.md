---
title: Choosing UTM vs State Plane for Wind Farm Siting
description: Pick the right projected CRS when a wind farm layout straddles a UTM zone boundary or State Plane zone — avoid seam drift, feet-vs-metre unit traps (EPSG:2225), and misreported turbine spacing with a validated workflow.
slug: choosing-utm-vs-state-plane-for-wind-farm-siting
type: article
breadcrumb: UTM vs State Plane for Wind Siting
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Choosing UTM vs State Plane for Wind Farm Siting

The scenario this page fixes is quiet and expensive: a wind farm layout is measured in a projected CRS that does not actually fit its extent, so turbine spacing, micrositing setbacks, and lease-boundary offsets come out a few metres wrong — and nothing raises an exception. It is a sharp instance of the CRS-drift problem the parent [coordinate reference systems for energy projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) workflow addresses, but the failure here is not "someone measured in degrees." It is subtler: the team *did* reproject to metres, they just picked a projected frame whose zone of validity does not cover the whole site, or whose linear unit is US survey feet rather than metres. A 400 m minimum spacing rule enforced across a UTM zone seam, or a State Plane layout in `EPSG:2225` treated as if it were in metres, produces a plausible-looking layout that violates the real constraint on the ground.

For a single turbine, two adjacent projected frames agree to well under a metre. The error compounds with baseline length and with distance from the projection's central meridian, which is exactly why a sprawling 40-turbine string that crosses a zone boundary is where it bites.

## Root-cause analysis

Three distinct failure modes account for nearly every mis-projected wind layout. Each maps to a specific branch of the decision workflow and validator below.

1. **The layout spans two UTM zones.** UTM divides the globe into 6°-wide longitude zones, each with its own central meridian and its own EPSG code — `EPSG:32610` (zone 10N), `EPSG:32613` (zone 13N), `EPSG:32614` (zone 14N), and so on. A project straddling, say, 108°W sits on the zone 13N/14N boundary. Reprojecting the whole layout into one zone forces the far side of the site far from that zone's central meridian, where the transverse-Mercator scale factor departs from 1. Two turbines measured across the seam — one snapped to each zone by an upstream tool — differ from their true ground separation by several metres.

2. **The State Plane feet-vs-metre unit trap.** US State Plane Coordinate System zones are the surveyor's native frame and are frequently published in **US survey feet**, not metres. `EPSG:2225` (NAD83 / California zone 1, ftUS) and its siblings `EPSG:2226`–`EPSG:2230` all carry a foot axis unit. A spacing threshold of `400` applied to coordinates in `EPSG:2225` means 400 **feet** (≈122 m), not 400 metres — a 3.3× error that passes every geometry check because the numbers are internally consistent. The inverse mistake is just as common: measure a distance in feet, then report or compare it as metres downstream.

3. **US survey foot vs international foot.** Even once you commit to feet, two definitions exist. The US survey foot is $\tfrac{1200}{3937}$ m ≈ `0.3048006096` m; the international foot is exactly `0.3048` m. The ~2 ppm difference is invisible on a turbine footprint but reaches centimetres across a multi-kilometre lease boundary — enough to matter at survey-staking tolerance, and a live hazard now that several states redefined their zones to the international foot in the 2022 datum realignment.

<svg viewBox="0 0 940 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Decision tree for choosing a projected CRS for a wind farm layout. Start from the site extent bounding box. If the longitude span exceeds one UTM zone or crosses a 6-degree boundary, route to a custom equal-distance frame such as Albers or a Lambert Conformal Conic strip, or CONUS Albers EPSG:5070, rather than a single UTM zone. If the extent fits one zone, choose a metric UTM zone such as EPSG:32610, 32613, or 32614 for metre-native work, or a State Plane zone such as the EPSG:2225 family when the deliverable must match surveyor feet. The State Plane branch carries a mandatory unit check converting US survey feet to metres before any spacing measurement." style="width:100%;max-width:940px;height:auto;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="940" height="560"/>
  <title>CRS selection decision tree for wind farm layouts: extent to single-zone test to UTM, State Plane, or multi-zone frame</title>
  <desc>A top-to-bottom decision tree. The input is the site extent bounding box. A first diamond tests whether the layout fits inside one UTM or State Plane zone. A "no" branch exits right to a custom multi-zone frame node — an equal-distance Albers or Lambert Conformal Conic strip, or CONUS Albers EPSG:5070. A "yes" branch descends to a second diamond asking whether the deliverable must match surveyor feet. "No" leads to a metric UTM zone node listing EPSG:32610, 32613, and 32614. "Yes" leads to a State Plane zone node listing the EPSG:2225 family in US survey feet, which then passes through a mandatory unit-conversion node that turns US survey feet into metres before any turbine spacing is measured. All paths converge on a final metre-frame measurement node.</desc>
  <defs>
    <marker id="wf-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="880" height="560" fill="none"/>
  <!-- Input -->
  <rect x="330" y="18" width="220" height="46" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="440" y="38" text-anchor="middle" font-size="12.5" fill="#1F3A60" font-weight="700">Site extent (bbox in EPSG:4326)</text>
  <text x="440" y="55" text-anchor="middle" font-size="11" fill="#1F3A60">longitude span · zone membership</text>
  <line x1="440" y1="64" x2="440" y2="98" stroke="currentColor" stroke-width="1.4" marker-end="url(#wf-arr)"/>
  <!-- Decision 1: single zone? -->
  <path d="M440,100 L556,152 L440,204 L324,152 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="440" y="148" text-anchor="middle" font-size="11.5" fill="currentColor">Fits one</text>
  <text x="440" y="164" text-anchor="middle" font-size="11.5" fill="currentColor">zone?</text>
  <!-- D1 no -> custom multi-zone -->
  <line x1="556" y1="152" x2="654" y2="152" stroke="currentColor" stroke-width="1.4" marker-end="url(#wf-arr)"/>
  <text x="600" y="143" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">no</text>
  <rect x="656" y="120" width="212" height="64" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="762" y="143" text-anchor="middle" font-size="12" fill="#1F3A60" font-weight="700">Custom multi-zone frame</text>
  <text x="762" y="160" text-anchor="middle" font-size="11" fill="#1F3A60">Albers / LCC strip</text>
  <text x="762" y="175" text-anchor="middle" font-size="11" fill="#1F3A60">or EPSG:5070 (CONUS)</text>
  <!-- D1 yes -> Decision 2 -->
  <line x1="440" y1="204" x2="440" y2="248" stroke="currentColor" stroke-width="1.4" marker-end="url(#wf-arr)"/>
  <text x="454" y="230" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">yes</text>
  <!-- Decision 2: deliverable in feet? -->
  <path d="M440,250 L556,302 L440,354 L324,302 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="440" y="298" text-anchor="middle" font-size="11.5" fill="currentColor">Deliverable</text>
  <text x="440" y="314" text-anchor="middle" font-size="11.5" fill="currentColor">in feet?</text>
  <!-- D2 no -> UTM -->
  <line x1="324" y1="302" x2="214" y2="302" stroke="currentColor" stroke-width="1.4" marker-end="url(#wf-arr)"/>
  <text x="270" y="293" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">no</text>
  <rect x="8" y="270" width="204" height="64" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="110" y="293" text-anchor="middle" font-size="12" fill="#1F3A60" font-weight="700">Metric UTM zone</text>
  <text x="110" y="310" text-anchor="middle" font-size="11" fill="#1F3A60">EPSG:32610 / 32613</text>
  <text x="110" y="325" text-anchor="middle" font-size="11" fill="#1F3A60">/ 32614 — metres</text>
  <!-- D2 yes -> State Plane -->
  <line x1="556" y1="302" x2="654" y2="302" stroke="currentColor" stroke-width="1.4" marker-end="url(#wf-arr)"/>
  <text x="600" y="293" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">yes</text>
  <rect x="656" y="270" width="212" height="64" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="762" y="293" text-anchor="middle" font-size="12" fill="#1F3A60" font-weight="700">State Plane zone</text>
  <text x="762" y="310" text-anchor="middle" font-size="11" fill="#1F3A60">EPSG:2225 family</text>
  <text x="762" y="325" text-anchor="middle" font-size="11" fill="#1F3A60">(US survey feet)</text>
  <!-- State Plane -> unit conversion (mandatory) -->
  <line x1="762" y1="334" x2="762" y2="378" stroke="currentColor" stroke-width="1.4" marker-end="url(#wf-arr)"/>
  <rect x="632" y="380" width="260" height="52" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="762" y="401" text-anchor="middle" font-size="12" fill="#1F3A60" font-weight="700">Convert ftUS → m</text>
  <text x="762" y="419" text-anchor="middle" font-size="11" fill="#1F3A60">× 1200/3937 before measuring</text>
  <!-- Convergence to final measure node -->
  <path d="M110,334 V470 H432" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#wf-arr)"/>
  <path d="M762,432 V470 H448" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#wf-arr)"/>
  <path d="M762,184 V210 H916 V470 H448" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#wf-arr)"/>
  <rect x="324" y="472" width="232" height="52" rx="7" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2"/>
  <text x="440" y="493" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">Measure spacing in metres</text>
  <text x="440" y="511" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">turbine_spacing_m()</text>
</svg>

## Pre-flight validation

Before any layout is reprojected, decide *which* projected CRS is defensible for the site's extent, and refuse the run if the requested frame does not fit. The validator below takes the layout in geographic coordinates (`EPSG:4326`), derives the UTM zone(s) the extent touches, and flags the multi-zone case and the feet-unit case explicitly.

<svg viewBox="0 0 920 400" role="img" aria-label="Transverse Mercator scale factor across the width of a UTM zone, plotted from k equals 0.9996 times one plus x squared over twice the earth radius squared. The factor is 0.9996 on the central meridian, reaches exactly 1.0 about 180 kilometres either side, and rises to about 1.0007 at the zone edge. A 400 metre turbine spacing therefore measures 16 centimetres short on the central meridian and 28 centimetres long at the edge — so two turbines measured on opposite sides of a seam disagree by roughly 44 centimetres per 400 metres." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Scale factor across a UTM zone, and what it costs a 400 m turbine spacing</title>
  <desc>A symmetric curve over a horizontal axis running from 320 kilometres west of the central meridian to 320 kilometres east. The vertical axis is the scale factor from 0.9994 to 1.0008. The curve sits at its minimum of 0.9996 on the central meridian, crosses 1.0 at plus and minus 180 kilometres, and rises to 1.00071 at plus and minus 300 kilometres. Two shaded bands mark where measured distance runs short and where it runs long, with callouts converting the factor into metres of error on a 400 metre spacing.</desc>
  <rect class="svg-bg" x="0" y="0" width="920" height="400"/>
  <defs><marker id="sf-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">One UTM zone is not one scale: k varies with distance from the central meridian</text>
  <rect x="96" y="66" width="732" height="114.46666666666465" rx="0" fill="#DCEEF6" opacity="0.55"/>
  <rect x="96" y="180.46666666666465" width="732" height="87.53333333333535" rx="0" fill="#FFE3BE" opacity="0.5"/>
  <line x1="96" y1="268" x2="828" y2="268" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="96" y1="66" x2="96" y2="268" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="92" y1="261.2666666666677" x2="828" y2="261.2666666666677" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="86" y="265.2666666666677" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0.9994</text>
  <line x1="92" y1="234.33333333332337" x2="828" y2="234.33333333332337" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="86" y="238.33333333332337" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0.9996</text>
  <line x1="92" y1="207.399999999994" x2="828" y2="207.399999999994" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="86" y="211.399999999994" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0.9998</text>
  <line x1="92" y1="180.46666666666465" x2="828" y2="180.46666666666465" stroke="currentColor" stroke-width="0.8" opacity="0.5"/>
  <text x="86" y="184.46666666666465" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">1.0000</text>
  <line x1="92" y1="153.53333333333535" x2="828" y2="153.53333333333535" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="86" y="157.53333333333535" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">1.0002</text>
  <line x1="92" y1="126.60000000000596" x2="828" y2="126.60000000000596" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="86" y="130.60000000000596" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">1.0004</text>
  <line x1="92" y1="99.66666666667663" x2="828" y2="99.66666666667663" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="86" y="103.66666666667663" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">1.0006</text>
  <line x1="92" y1="72.73333333334728" x2="828" y2="72.73333333334728" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="86" y="76.73333333334728" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">1.0008</text>
  <line x1="96.0" y1="268" x2="96.0" y2="273" stroke="currentColor" stroke-width="1" opacity="0.6"/>
  <text x="96.0" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">-320 km</text>
  <line x1="256.125" y1="268" x2="256.125" y2="273" stroke="currentColor" stroke-width="1" opacity="0.6"/>
  <text x="256.125" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">-180 km</text>
  <line x1="462.0" y1="268" x2="462.0" y2="273" stroke="currentColor" stroke-width="1" opacity="0.6"/>
  <text x="462.0" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">central meridian</text>
  <line x1="667.875" y1="268" x2="667.875" y2="273" stroke="currentColor" stroke-width="1" opacity="0.6"/>
  <text x="667.875" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">+180 km</text>
  <line x1="828.0" y1="268" x2="828.0" y2="273" stroke="currentColor" stroke-width="1" opacity="0.6"/>
  <text x="828.0" y="288" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">+320 km</text>
  <path d="M96.0,64.5 L100.6,68.8 L105.2,72.9 L109.7,77.0 L114.3,81.1 L118.9,85.1 L123.5,89.0 L128.0,92.9 L132.6,96.8 L137.2,100.6 L141.8,104.3 L146.3,108.0 L150.9,111.7 L155.5,115.2 L160.1,118.8 L164.6,122.2 L169.2,125.7 L173.8,129.0 L178.4,132.3 L182.9,135.6 L187.5,138.8 L192.1,142.0 L196.7,145.1 L201.2,148.1 L205.8,151.1 L210.4,154.1 L214.9,157.0 L219.5,159.8 L224.1,162.6 L228.7,165.3 L233.2,168.0 L237.8,170.6 L242.4,173.2 L247.0,175.7 L251.5,178.2 L256.1,180.6 L260.7,183.0 L265.3,185.3 L269.9,187.5 L274.4,189.7 L279.0,191.9 L283.6,194.0 L288.1,196.0 L292.7,198.0 L297.3,199.9 L301.9,201.8 L306.4,203.7 L311.0,205.4 L315.6,207.2 L320.2,208.8 L324.8,210.5 L329.3,212.0 L333.9,213.5 L338.5,215.0 L343.1,216.4 L347.6,217.8 L352.2,219.1 L356.8,220.3 L361.3,221.5 L365.9,222.6 L370.5,223.7 L375.1,224.8 L379.7,225.7 L384.2,226.7 L388.8,227.5 L393.4,228.4 L397.9,229.1 L402.5,229.8 L407.1,230.5 L411.7,231.1 L416.2,231.7 L420.8,232.2 L425.4,232.6 L430.0,233.0 L434.6,233.4 L439.1,233.7 L443.7,233.9 L448.3,234.1 L452.8,234.2 L457.4,234.3 L462.0,234.3 L466.6,234.3 L471.1,234.2 L475.7,234.1 L480.3,233.9 L484.9,233.7 L489.4,233.4 L494.0,233.0 L498.6,232.6 L503.2,232.2 L507.8,231.7 L512.3,231.1 L516.9,230.5 L521.5,229.8 L526.0,229.1 L530.6,228.4 L535.2,227.5 L539.8,226.7 L544.4,225.7 L548.9,224.8 L553.5,223.7 L558.1,222.6 L562.6,221.5 L567.2,220.3 L571.8,219.1 L576.4,217.8 L581.0,216.4 L585.5,215.0 L590.1,213.5 L594.7,212.0 L599.2,210.5 L603.8,208.8 L608.4,207.2 L613.0,205.4 L617.6,203.7 L622.1,201.8 L626.7,199.9 L631.3,198.0 L635.9,196.0 L640.4,194.0 L645.0,191.9 L649.6,189.7 L654.1,187.5 L658.7,185.3 L663.3,183.0 L667.9,180.6 L672.4,178.2 L677.0,175.7 L681.6,173.2 L686.2,170.6 L690.8,168.0 L695.3,165.3 L699.9,162.6 L704.5,159.8 L709.1,157.0 L713.6,154.1 L718.2,151.1 L722.8,148.1 L727.4,145.1 L731.9,142.0 L736.5,138.8 L741.1,135.6 L745.6,132.3 L750.2,129.0 L754.8,125.7 L759.4,122.2 L763.9,118.8 L768.5,115.2 L773.1,111.7 L777.7,108.0 L782.2,104.3 L786.8,100.6 L791.4,96.8 L796.0,92.9 L800.6,89.0 L805.1,85.1 L809.7,81.1 L814.3,77.0 L818.9,72.9 L823.4,68.8 L828.0,64.5" fill="none" stroke="#5BA8C8" stroke-width="2.4"/>
  <circle cx="256.125" cy="180.46666666666465" r="4.5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="667.875" cy="180.46666666666465" r="4.5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="462.0" y="256.33333333332337" text-anchor="middle" font-size="11" fill="#2C6E8F" font-weight="700">k = 0.9996 — measured distance runs short</text>
  <text x="805.125" y="71.09387590624587" text-anchor="middle" font-size="11" fill="#7A4A1A" font-weight="700">k = 1.00071</text>
  <text x="256.125" y="166.46666666666465" text-anchor="middle" font-size="11" fill="#1F5C3A" font-weight="700">k = 1 exactly</text>
  <rect x="20" y="300" width="424" height="65" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="232.0" y="321" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">400 m spacing on the central meridian</text>
  <text x="232.0" y="338" text-anchor="middle" font-size="11.5" fill="currentColor">measures 399.84 m — 16 cm short</text>
  <text x="232.0" y="355" text-anchor="middle" font-size="11.5" fill="currentColor">a 5 km string loses 2.0 m end to end</text>
  <rect x="472" y="300" width="428" height="65" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="686.0" y="321" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">The same 400 m at the zone edge</text>
  <text x="686.0" y="338" text-anchor="middle" font-size="11.5" fill="currentColor">measures 400.28 m — 28 cm long</text>
  <text x="686.0" y="355" text-anchor="middle" font-size="11.5" fill="currentColor">across a seam the two disagree by 44 cm</text>
</svg>

```python
import math

import geopandas as gpd
import pyproj


def validate_projected_crs(sites_gdf: gpd.GeoDataFrame, target_epsg: int) -> dict:
    """Confirm a projected CRS is appropriate for a wind layout's extent.

    Raises when the layout spans more than one UTM zone but a single UTM zone
    was requested. Flags feet-based (State Plane) targets so downstream code
    converts to metres before measuring.
    """
    if sites_gdf.crs is None:
        raise ValueError("Layout has undefined CRS; declare EPSG:4326 first.")

    geo = sites_gdf.to_crs("EPSG:4326")
    minx, _, maxx, _ = geo.total_bounds

    # UTM zone number from longitude: zone 1 starts at -180, 6 degrees wide
    zone_lo = int((minx + 180) // 6) + 1
    zone_hi = int((maxx + 180) // 6) + 1
    spans_multiple_zones = zone_lo != zone_hi

    target = pyproj.CRS.from_epsg(target_epsg)
    if target.is_geographic:
        raise ValueError(
            f"EPSG:{target_epsg} is geographic; spacing must be measured in a "
            "projected metric frame (UTM or an equal-distance conic)."
        )

    unit = target.axis_info[0].unit_name          # 'metre' | 'US survey foot' | ...
    is_utm = "UTM" in (target.name or "").upper()

    if is_utm and spans_multiple_zones:
        raise ValueError(
            f"Layout spans UTM zones {zone_lo}N and {zone_hi}N but EPSG:{target_epsg} "
            "covers one zone. Use a custom Albers/LCC strip or EPSG:5070 for CONUS."
        )
    return {
        "target_epsg": target_epsg,
        "target_unit": unit,
        "needs_foot_conversion": unit != "metre",
        "utm_zones_touched": sorted({zone_lo, zone_hi}),
        "central_meridian_deg": target.to_dict().get("lon_0"),
        "extent_lon_span_deg": round(maxx - minx, 4),
    }
```

| Check | Diagnostic | Red flag |
|-------|-----------|----------|
| Extent fits one zone | `zone_lo == zone_hi` | Layout crosses a 6° boundary → seam drift |
| Metric target | `axis_info[0].unit_name == "metre"` | `US survey foot` → 3.28× spacing error |
| Projected, not geographic | `not CRS.is_epsg(4326)` | Distances in degrees are meaningless |
| Distance from central meridian | `abs(lon − lon_0) < 3°` | Scale factor departs from 1 near zone edge |

## Fix implementation

The corrected routine reprojects the layout into the validated frame, converts survey feet to metres when the target demands it, and only then measures nearest-neighbour turbine spacing. Measuring in the projected frame — rather than aligning `EPSG:4326` and `EPSG:3857` for a basemap overlay, which is a different job handled in [aligning EPSG:4326 and EPSG:3857 for solar site mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/how-to-align-epsg4326-and-epsg3857-for-solar-site-mapping/) — is what keeps spacing in true ground metres.

The parameter choices are deliberate: `US_SURVEY_FOOT_M` uses the exact $\tfrac{1200}{3937}$ ratio so the conversion is definition-correct rather than a rounded `0.3048`; `min_spacing_m` defaults to a typical 4-rotor-diameter turbulence separation; and the function returns the pairwise minimum so a single violating pair is never averaged away.

```python
import numpy as np
import geopandas as gpd
from scipy.spatial import cKDTree

US_SURVEY_FOOT_M = 1200.0 / 3937.0   # exact: 0.30480060960121924 m


def turbine_spacing_m(
    sites_gdf: gpd.GeoDataFrame,
    target_epsg: int,
    min_spacing_m: float = 480.0,     # ~4 rotor diameters for a 120 m rotor
) -> dict:
    """Reproject a wind layout to a validated metric frame and return the
    nearest-neighbour turbine spacing in true metres.

    Handles the State Plane feet-vs-metre trap: when the target axis unit is a
    survey foot, coordinates are scaled to metres before any distance is taken.
    """
    report = validate_projected_crs(sites_gdf, target_epsg)
    projected = sites_gdf.to_crs(epsg=target_epsg)

    xy = np.column_stack([projected.geometry.x, projected.geometry.y])
    if report["needs_foot_conversion"]:
        xy *= US_SURVEY_FOOT_M          # ftUS -> metres, applied to coordinates

    # Nearest neighbour excluding self (k=2, take the second column)
    tree = cKDTree(xy)
    dists, _ = tree.query(xy, k=2)
    nn_m = dists[:, 1]

    return {
        "target_epsg": target_epsg,
        "unit_converted_from_feet": report["needs_foot_conversion"],
        "min_spacing_m": float(nn_m.min()),
        "mean_spacing_m": float(nn_m.mean()),
        "violations": int((nn_m < min_spacing_m).sum()),
        "n_turbines": len(nn_m),
    }
```

Scaling the coordinate array by `US_SURVEY_FOOT_M` is safe because the transverse-Mercator or Lambert projection is linear in its own units — a foot-to-metre rescale of a planar coordinate is exact, unlike a re-projection, which would introduce a fresh datum operation. For the multi-zone case the validator rejects, the correct target is a single equal-distance frame spanning the whole site: a custom Albers Equal Area or Lambert Conformal Conic with standard parallels bracketing the site latitude, or `EPSG:5070` for a coarse CONUS-wide pass.

The residual seam error a single-zone choice would have introduced is bounded by the transverse-Mercator point scale factor,

$$ k \approx 1 + \frac{(\lambda - \lambda_0)^2 \cos^2\varphi}{2}, $$

where $\lambda - \lambda_0$ is the longitude offset from the zone's central meridian. Three degrees off-meridian at mid-latitude is already ~400 ppm — 0.4 m per kilometre of baseline — which is precisely the drift that pushes a cross-seam turbine pair past its spacing rule.

## Fallback routing & performance tuning

- **Prefer a custom conic over squeezing everything into one UTM zone.** When the validator reports two zones, build a Lambert Conformal Conic with `lat_1`/`lat_2` straddling the site rather than accepting edge scale error. A single project-wide frame also removes per-query reprojection cost downstream.
- **Pin the datum realignment vintage.** NAD83(2011) and the incoming NATRF2022 frames differ, and some State Plane zones switched from US survey foot to international foot. Record the exact source EPSG so a 2022-vintage layer is never silently mixed with a legacy one.
- **Cache the transformer, not per-point.** For portfolio-scale runs reuse a single `pyproj.Transformer`; re-parsing the CRS per turbine is measurable overhead when screening thousands of candidate positions.
- **Vectorise the spacing test.** `cKDTree` scales to tens of thousands of turbines; avoid Python-level pairwise loops. The same metric-frame index feeds grid-side work such as [proximity and distance calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) without a second reprojection.
- **Keep the layout and the resource grid in one frame.** Hub-height wind fields consumed during [wind speed and direction modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/) must share the layout's projected CRS, or spacing and energy-yield geometry disagree.

## Downstream validation

Gate the layout before it reaches a micrositing report or an interconnection package. This assertion, suitable for a CI/CD step, fails the build if the output frame is geographic, still in feet, or spans a zone it cannot represent — the class of regression a quick reference like the [projection and CRS quick reference](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/projection-and-crs-quick-reference/) exists to help teams check against.

<svg viewBox="0 0 920 340" role="img" aria-label="What the bare number 400 means in each axis unit a wind layout might be measured in. In metres it is 400 metres. In international feet it is 121.920 metres. In US survey feet it is 121.9202 metres. The unit trap is a factor of 3.28, while the two foot definitions differ by only 2 parts per million — invisible on one spacing, but 1.0 centimetre across a 5 kilometre lease boundary." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>The number 400 in three axis units, and the two errors it can hide</title>
  <desc>A horizontal bar chart of the true ground length of the number 400 in three axis units: 400.000 metres in metres, 121.920 metres in international feet, and 121.9202 metres in US survey feet. A callout marks the 3.28 times error of treating a State Plane foot value as metres. A second panel compares the two foot definitions over a 5 kilometre lease boundary, where the 2 parts per million difference amounts to 1.0 centimetre — below spacing tolerance but inside survey staking tolerance.</desc>
  <rect class="svg-bg" x="0" y="0" width="920" height="340"/>
  <defs><marker id="ft-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">A threshold of 400 is not a distance until the axis unit is known</text>
  <rect x="250" y="58" width="437.2" height="44.0" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="240" y="84.0" text-anchor="end" font-size="11.5" fill="currentColor">metre</text>
  <text x="695.2093023255813" y="84.0" text-anchor="start" font-size="11.5" fill="currentColor">400.0000 m on the ground</text>
  <rect x="250" y="111.0" width="133.3" height="44.0" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="240" y="137.0" text-anchor="end" font-size="11.5" fill="currentColor">international foot</text>
  <text x="391.2613953488372" y="137.0" text-anchor="start" font-size="11.5" fill="currentColor">121.9200 m on the ground</text>
  <rect x="250" y="164.0" width="133.3" height="44.0" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="240" y="190.0" text-anchor="end" font-size="11.5" fill="currentColor">US survey foot</text>
  <text x="391.26161395348834" y="190.0" text-anchor="start" font-size="11.5" fill="currentColor">121.9202 m on the ground</text>
  <rect x="20" y="232" width="424" height="65" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.5"/>
  <text x="232.0" y="253" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">Applying a 400 “metre” rule in EPSG:2225</text>
  <text x="232.0" y="270" text-anchor="middle" font-size="11.5" fill="currentColor">enforces 121.92 m — a 3.28× under-spacing</text>
  <text x="232.0" y="287" text-anchor="middle" font-size="11.5" fill="currentColor">that still passes every geometry check</text>
  <rect x="472" y="232" width="428" height="65" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="686.0" y="253" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">ftUS versus international foot: 2 ppm</text>
  <text x="686.0" y="270" text-anchor="middle" font-size="11.5" fill="currentColor">1.0 cm over a 5 km lease boundary —</text>
  <text x="686.0" y="287" text-anchor="middle" font-size="11.5" fill="currentColor">inside staking tolerance, so record the vintage</text>
</svg>

```python
import pyproj
import geopandas as gpd


def assert_spacing_frame_integrity(layout_gdf: gpd.GeoDataFrame, target_epsg: int) -> None:
    """CI/CD gate: refuse a layout measured in an indefensible projected frame."""
    crs = pyproj.CRS.from_epsg(target_epsg)
    assert not crs.is_geographic, f"EPSG:{target_epsg} is geographic; cannot measure metres"

    unit = crs.axis_info[0].unit_name
    assert unit in ("metre", "US survey foot", "foot"), f"unexpected axis unit {unit!r}"

    report = validate_projected_crs(layout_gdf, target_epsg)
    assert len(report["utm_zones_touched"]) == 1 or "UTM" not in (crs.name or "").upper(), (
        "single UTM zone selected for a multi-zone layout — seam drift will corrupt spacing"
    )
    # Record provenance so an independent engineer can reproduce the measurement
    layout_gdf.attrs["spacing_crs"] = f"EPSG:{target_epsg}"
    layout_gdf.attrs["axis_unit"] = unit
    layout_gdf.attrs["foot_to_metre_applied"] = unit != "metre"
```

Logging the axis unit and the foot-conversion flag as provenance is what makes the layout auditable: a reviewer can see whether the reported 480 m separation was measured in metres directly or converted from survey feet, and confirm the frame actually covers the site. Pin `pyproj` and `geopandas` versions so a PROJ database update cannot silently change which transformation path a zone selection resolves to between runs.

## Related

- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — the parent projection-discipline workflow this scenario specialises.
- [How to Align EPSG:4326 and EPSG:3857 for Solar Site Mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/how-to-align-epsg4326-and-epsg3857-for-solar-site-mapping/) — the companion fix for the Web Mercator basemap-overlay case.
- [Projection and CRS Quick Reference](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/projection-and-crs-quick-reference/) — EPSG lookups and unit tables to check a zone choice against.
- [Proximity & Distance Calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) — metric-frame distance work that reuses the same projected layout.
- [Wind Speed & Direction Modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/) — resource fields that must share the layout's coordinate frame.
