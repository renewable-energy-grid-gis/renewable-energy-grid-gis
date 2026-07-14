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

<svg viewBox="0 0 904 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Decision tree for choosing a projected CRS for a wind farm layout. Start from the site extent bounding box. If the longitude span exceeds one UTM zone or crosses a 6-degree boundary, route to a custom equal-distance frame such as Albers or a Lambert Conformal Conic strip, or CONUS Albers EPSG:5070, rather than a single UTM zone. If the extent fits one zone, choose a metric UTM zone such as EPSG:32610, 32613, or 32614 for metre-native work, or a State Plane zone such as the EPSG:2225 family when the deliverable must match surveyor feet. The State Plane branch carries a mandatory unit check converting US survey feet to metres before any spacing measurement." style="width:100%;max-width:904px;height:auto;font-family:inherit">
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
  <path d="M762,184 V210 H812 V470 H448" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#wf-arr)"/>
  <rect x="324" y="472" width="232" height="52" rx="7" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2"/>
  <text x="440" y="493" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">Measure spacing in metres</text>
  <text x="440" y="511" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">turbine_spacing_m()</text>
</svg>

## Pre-flight validation

Before any layout is reprojected, decide *which* projected CRS is defensible for the site's extent, and refuse the run if the requested frame does not fit. The validator below takes the layout in geographic coordinates (`EPSG:4326`), derives the UTM zone(s) the extent touches, and flags the multi-zone case and the feet-unit case explicitly.

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
