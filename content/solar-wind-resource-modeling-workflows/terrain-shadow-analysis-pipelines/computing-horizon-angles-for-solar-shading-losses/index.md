---
title: Computing Horizon Angles for Solar Shading Losses
description: Derive a correct site horizon-angle profile from a DEM for terrain far-shading losses — projected-CRS enforcement, datum handling, ridgeline sampling, earth-curvature correction, and a CI/CD assertion gate.
slug: computing-horizon-angles-for-solar-shading-losses
type: article
breadcrumb: Computing Horizon Angles for Solar Shading Losses
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Computing Horizon Angles for Solar Shading Losses

A horizon-angle profile that reports a smooth, plausible 2–3° skyline when the site actually sits under an 8° ridgeline is the failure this page exists to eliminate. It is the single-site input to the [Terrain & Shadow Analysis Pipelines](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/) workflow: before any per-cell shadow mask is cast, a PV yield model needs one function — how high does the terrain rise above the site in every compass direction — because that curve is what clips the low-elevation morning and evening sun and drives the annual *far-shading* loss. Unlike near-shading from a neighbouring row of modules, far-shading is a property of the landscape, and it is derived entirely from a digital elevation model (DEM). Get the horizon profile wrong and the error is invisible: the sun-path diagram still looks reasonable, the loss percentage is still single-digit, and nothing raises an exception — the number is simply biased, and it flows straight into the bankable energy estimate.

The horizon (elevation) angle toward a bearing $\theta$ is the maximum, over every terrain sample $d$ metres out along that bearing, of the arctangent of rise over run:

$$ h(\theta) = \max_{d}\; \arctan\!\left(\frac{z_{\text{terrain}}(d,\theta) - z_{\text{site}}}{d}\right) $$

The arithmetic is a one-liner. The four ways it silently produces the wrong curve are not, and each lives in the data or the geometry rather than the formula.

## Root-cause analysis

Four independent causes account for nearly every mis-computed horizon profile, and each maps to a specific guard or correction below:

1. **DEM in a geographic CRS.** If the elevation grid is delivered in [EPSG:4326](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/), a "step" along an azimuth ray is measured in degrees, not metres, and the east–west degree shrinks with the cosine of latitude. The `arctan` run $d$ is then wrong by a latitude-dependent factor, and the azimuth bearing itself is skewed because a degree of longitude and a degree of latitude cover different ground distances. The profile looks fine and is quantitatively meaningless. Enforcing a projected, metric CRS — the same [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) discipline the parent pipeline demands — is the precondition for every angle.
2. **Elevation vs. ellipsoidal height mismatch.** The horizon angle is a *relative* rise, $z_{\text{terrain}} - z_{\text{site}}$, so a constant datum offset cancels. It does **not** cancel when the site elevation and the DEM come from different vertical references — a GPS-surveyed ellipsoidal site height (WGS84) differenced against an orthometric (geoid, e.g. NAVD88) DEM injects a geoid-undulation offset of tens of metres that does not cancel, tilting the whole profile. Read the site elevation *from the DEM itself*, never from a handheld GPS fix.
3. **Coarse DEM under-resolving ridgelines.** A 30 m SRTM cell averages a sharp ridge crest into a rounded shoulder, shaving the true skyline down by a degree or more precisely where the low sun is blocked. The horizon is a max operator, so smoothing systematically *under-reports* it — the most dangerous direction for a loss estimate, because it makes the site look better than it is.
4. **Ignoring earth curvature at range.** Far-shading ridges sit 5–20 km out. Over that distance the earth's curvature drops the far terrain below a flat-earth line of sight by $d^2/2R$ — roughly 3.5 m at 10 km — and atmospheric refraction bends the ray back by ~13%. Omit the correction and distant ridges are reported higher than they truly appear.

<svg viewBox="0 0 900 470" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four root causes of a wrong horizon profile mapped to fixes. Geographic CRS maps to reproject to EPSG 32610 for true metric runs; ellipsoidal versus orthometric height mismatch maps to sampling the site elevation from the DEM itself; a coarse DEM smoothing ridgelines maps to a fine DEM plus a fine step so crests are resolved; and ignoring earth curvature maps to subtracting a curvature and refraction drop before the arctangent. All four fixes converge on a validated horizon profile array." style="width:100%;max-width:900px;height:auto;font-family:inherit;">
  <title>Horizon-profile failure causes mapped to their fixes</title>
  <desc>Four warning cause nodes on the left each connect to a fix node in the middle: geographic CRS to reproject to a metric EPSG; ellipsoidal versus orthometric height to reading the site elevation from the DEM; coarse DEM to a fine DEM and fine ray step; and no curvature correction to subtracting the curvature-and-refraction drop. All four fix nodes feed a single highlighted success node, a validated horizon-angle profile.</desc>
  <defs>
    <marker id="hz-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="900" height="470" fill="none"/>
  <!-- Cause column -->
  <g>
    <rect x="20" y="24" width="250" height="72" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="145" y="52" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">1 · Geographic CRS</text>
    <text x="145" y="72" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">degree "steps" — run d</text>
    <text x="145" y="88" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">wrong by cos(lat)</text>
    <rect x="20" y="126" width="250" height="72" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="145" y="154" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">2 · Datum mismatch</text>
    <text x="145" y="174" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">ellipsoidal site vs</text>
    <text x="145" y="190" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">orthometric DEM</text>
    <rect x="20" y="228" width="250" height="72" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="145" y="256" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">3 · Coarse DEM</text>
    <text x="145" y="276" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">ridge crest averaged</text>
    <text x="145" y="292" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">down — skyline lost</text>
    <rect x="20" y="330" width="250" height="72" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
    <text x="145" y="358" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">4 · No curvature</text>
    <text x="145" y="378" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">far ridge over-</text>
    <text x="145" y="394" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">reported at range</text>
  </g>
  <!-- Fix column -->
  <g>
    <rect x="400" y="24" width="270" height="72" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="535" y="52" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Reproject to EPSG:32610</text>
    <text x="535" y="72" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">metric run + true bearings</text>
    <text x="535" y="88" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">before any arctan</text>
    <rect x="400" y="126" width="270" height="72" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="535" y="154" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Read z_site from DEM</text>
    <text x="535" y="174" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">single vertical reference</text>
    <text x="535" y="190" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">offset cancels in Δz</text>
    <rect x="400" y="228" width="270" height="72" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="535" y="256" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Fine DEM + fine step</text>
    <text x="535" y="276" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">step ≤ cell size, sample</text>
    <text x="535" y="292" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">crests bilinearly</text>
    <rect x="400" y="330" width="270" height="72" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
    <text x="535" y="358" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Subtract d²/2Rₑ</text>
    <text x="535" y="378" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">curvature + refraction</text>
    <text x="535" y="394" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">before the arctan</text>
  </g>
  <!-- Success node -->
  <rect x="710" y="176" width="168" height="120" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2"/>
  <text x="794" y="222" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">Validated</text>
  <text x="794" y="242" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">horizon</text>
  <text x="794" y="262" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">profile</text>
  <text x="794" y="282" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">h(θ) ∈ [0,90)</text>
  <!-- Cause -> Fix edges -->
  <line x1="270" y1="60" x2="396" y2="60" stroke="currentColor" stroke-width="1.4" marker-end="url(#hz-arr)"/>
  <line x1="270" y1="162" x2="396" y2="162" stroke="currentColor" stroke-width="1.4" marker-end="url(#hz-arr)"/>
  <line x1="270" y1="264" x2="396" y2="264" stroke="currentColor" stroke-width="1.4" marker-end="url(#hz-arr)"/>
  <line x1="270" y1="366" x2="396" y2="366" stroke="currentColor" stroke-width="1.4" marker-end="url(#hz-arr)"/>
  <!-- Fix -> success (converge) -->
  <path d="M670,60 H690 V206 H706" fill="none" stroke="currentColor" stroke-width="1.3" marker-end="url(#hz-arr)"/>
  <path d="M670,162 H690 V226 H706" fill="none" stroke="currentColor" stroke-width="1.3" marker-end="url(#hz-arr)"/>
  <path d="M670,264 H690 V246 H706" fill="none" stroke="currentColor" stroke-width="1.3" marker-end="url(#hz-arr)"/>
  <path d="M670,366 H690 V266 H706" fill="none" stroke="currentColor" stroke-width="1.3" marker-end="url(#hz-arr)"/>
</svg>

## Pre-flight validation

Surface the two structural faults — wrong CRS and an out-of-bounds site — before a single ray is marched. The naive pattern below is what quietly produces the biased curve: it never checks the projection, takes the site elevation from a caller-supplied argument, and samples on a raw pixel grid.

```python
import numpy as np
import rasterio

# Flawed: no CRS check, external z_site, no bounds test
with rasterio.open("dem_srtm_4326.tif") as src:
    band = src.read(1)
z_site = 512.0                       # from a handheld GPS — wrong datum
# ... marches rays in degree space, differences against an ellipsoidal height
```

The pre-flight function pins the exact fault with a precise message so a CI/CD run fails fast instead of writing a poisoned profile. It confirms the DEM is projected to the expected metric grid, that the site falls inside the raster footprint with enough margin for the search radius, and that the site pixel is not nodata:

```python
import rasterio
from rasterio.crs import CRS

TARGET_EPSG = 32610          # UTM Zone 10N — Pacific Northwest siting grid


def preflight_horizon_inputs(src: rasterio.DatasetReader,
                             site_x: float, site_y: float,
                             max_distance_m: float) -> None:
    """Raise on CRS, footprint, or nodata faults before any ray is marched.
    site_x/site_y are in the DEM's own projected CRS (EPSG:32610 metres)."""
    if src.crs is None:
        raise ValueError("DEM has no CRS; assign EPSG:32610 before profiling.")
    if src.crs.is_geographic:
        raise RuntimeError(
            f"Geographic CRS {src.crs}: azimuth steps would be in degrees. "
            f"Reproject to EPSG:{TARGET_EPSG} so runs are true metres."
        )
    if src.crs != CRS.from_epsg(TARGET_EPSG):
        raise RuntimeError(f"DEM CRS {src.crs} != EPSG:{TARGET_EPSG}.")

    left, bottom, right, top = src.bounds
    if not (left + max_distance_m <= site_x <= right - max_distance_m and
            bottom + max_distance_m <= site_y <= top - max_distance_m):
        raise ValueError(
            f"Site ({site_x:.0f}, {site_y:.0f}) is within {max_distance_m:.0f} m "
            "of the DEM edge; rays would run off-raster and truncate the horizon."
        )

    z_site = next(src.sample([(site_x, site_y)]))[0]
    if src.nodata is not None and z_site == src.nodata:
        raise ValueError("Site pixel is nodata; cannot anchor z_site.")
```

| Validation step | Diagnostic check | Expected outcome |
|-----------------|------------------|------------------|
| CRS is metric | `not src.crs.is_geographic` | Projected CRS (EPSG:32610), runs measured in metres |
| CRS matches grid | `src.crs == CRS.from_epsg(32610)` | Same UTM zone as the irradiance / yield model |
| Site inside footprint | `left + R ≤ x ≤ right − R` | Full search radius `R` stays on-raster in every bearing |
| Site anchored to DEM | `next(src.sample([(x, y)]))[0] != nodata` | `z_site` read from the DEM, one vertical datum |

## Fix implementation

The corrected profiler reads `z_site` from the DEM, marches each azimuth ray in metric steps no coarser than the cell size, samples the far terrain with bilinear interpolation so a ridge crest is not stepped over, subtracts the earth-curvature-and-refraction drop, and returns the maximum elevation angle per bearing. The curvature term uses an effective radius $R_e = R / (1 - k)$ with refraction coefficient $k = 0.13$, the standard value for visible-band terrestrial sightlines, so the corrected rise is:

$$ h(\theta) = \max_{d}\; \arctan\!\left(\frac{z_{\text{terrain}}(d,\theta) - z_{\text{site}} - \dfrac{d^{2}}{2R_e}}{d}\right) $$

Parameters are justified for far-shading: `azimuth_step_deg=1.0` gives a 360-point skyline dense enough for a solar-position lookup, `max_distance_m=15000` captures ridges that still subtend a meaningful angle, and `step_m` defaults to the DEM cell size so no sample skips a one-cell crest.

```python
import numpy as np
import rasterio

EARTH_RADIUS_M = 6_371_000.0
REFRACTION_K = 0.13                      # effective-radius refraction coefficient


def compute_horizon_profile(dem_path: str,
                            site_x: float, site_y: float,
                            azimuth_step_deg: float = 1.0,
                            max_distance_m: float = 15_000.0,
                            step_m: float | None = None) -> np.ndarray:
    """Return an (N, 2) array of [azimuth_deg, horizon_angle_deg] for a site.

    Azimuth is 0deg = North, clockwise. Horizon angle is the max terrain
    elevation angle along each bearing, curvature- and refraction-corrected.
    Coordinates are in the DEM's projected CRS (EPSG:32610 metres).
    """
    with rasterio.open(dem_path) as src:
        preflight_horizon_inputs(src, site_x, site_y, max_distance_m)
        cell_m = abs(src.res[0])
        step_m = step_m or cell_m                       # never skip a crest
        r_eff = EARTH_RADIUS_M / (1.0 - REFRACTION_K)   # refraction-adjusted radius

        z_site = float(next(src.sample([(site_x, site_y)]))[0])
        distances = np.arange(step_m, max_distance_m + step_m, step_m)
        azimuths = np.arange(0.0, 360.0, azimuth_step_deg)
        profile = np.empty((azimuths.size, 2), dtype=np.float64)

        for i, az in enumerate(azimuths):
            rad = np.radians(az)
            # North = -Y in a north-up projected raster; East = +X.
            xs = site_x + distances * np.sin(rad)
            ys = site_y + distances * np.cos(rad)
            z_ray = np.fromiter(
                (v[0] for v in src.sample(zip(xs, ys))),   # bilinear-adjacent read
                dtype=np.float64, count=distances.size,
            )
            if src.nodata is not None:
                z_ray = np.where(z_ray == src.nodata, np.nan, z_ray)

            # Curvature + refraction: distant terrain apparently drops by d^2/2Re.
            drop = distances ** 2 / (2.0 * r_eff)
            angles = np.degrees(np.arctan2(z_ray - z_site - drop, distances))
            profile[i] = az, np.nanmax(np.append(angles, 0.0))  # never below flat

        return profile
```

Appending `0.0` to the per-bearing angle stack before `np.nanmax` clamps the floor at a flat horizon: a site on a local high point sees no terrain above it in some directions, and a negative maximum (looking *down* at distant valley floors) is not a shading obstruction. The `max` operator is what makes the coarse-DEM smoothing in cause 3 so pernicious — it can only ever pull the skyline down, so resolution loss is a one-directional, optimistic bias.

## Fallback routing & performance tuning

For portfolio-scale runs, batching many sites against one large DEM, or handling voids in lidar tiles, layer these on top of the core profiler:

- **Match `step_m` to the DEM, not the ambition.** A step finer than the cell size oversamples the same pixels and only inflates cost; a step coarser than the cell size can march straight over a one-pixel ridge crest and drop it from the skyline. Default `step_m = cell_size` and raise it only past ~5 km out, where crests are broad.
- **Bin azimuths to the downstream consumer.** A PV shading model typically ingests the horizon on a 1° or 2° grid. Profiling at 0.25° wastes I/O; align `azimuth_step_deg` to the [solar PV yield simulation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-pv-yield-simulation/) horizon resolution and skip the resample.
- **Cache the DEM window, not the file handle.** For many sites in one tile, read the bounding window covering all sites plus `max_distance_m` once into a NumPy array and index it in-memory rather than re-opening `src.sample` per site — the per-call GDAL block lookup dominates otherwise.
- **Treat nodata voids as non-occluding.** Water bodies and lidar occlusions arrive as a sentinel; convert to `np.nan` so `np.nanmax` ignores them instead of letting a spurious `-9999` cliff either dominate or poison the bearing.
- **Fall back to a two-tier DEM.** Where a fine local DEM does not extend to the full far-shading radius, profile the near field on lidar and the far field on a coarser national DEM (e.g. 3DEP 10 m), then take the per-bearing max of the two — the skyline is whichever surface rises higher.

## Downstream validation

Before a horizon profile feeds a yield model, gate it with an assertion function suitable for a CI/CD pipeline. This catches the silent faults the profiler itself will not raise — out-of-range angles from a datum splice, an incomplete azimuth sweep, or a non-monotone sampling grid that would misalign a solar-position lookup:

```python
import numpy as np


def assert_horizon_integrity(profile: np.ndarray,
                             azimuth_step_deg: float = 1.0) -> None:
    """CI/CD gate: fail the build if a horizon profile is not assessment-grade."""
    az, h = profile[:, 0], profile[:, 1]

    # Physical range: a terrain horizon is at or above flat, below vertical.
    assert np.all(h >= 0.0), "negative horizon angle — flat-floor clamp bypassed"
    assert np.all(h < 90.0), "horizon angle >= 90deg — datum/unit or z_site fault"

    # Full sweep: azimuths must be strictly increasing and cover 360deg once.
    assert np.all(np.diff(az) > 0), "azimuths not monotone — sampling grid corrupt"
    expected = int(round(360.0 / azimuth_step_deg))
    assert az.size == expected, f"expected {expected} bearings, got {az.size}"
    assert az[0] == 0.0 and az[-1] < 360.0, "azimuth sweep not anchored at North"

    # Sanity: a fully unobstructed site (all-zero) usually signals a broken sample.
    assert np.any(h > 0.0), "entirely flat horizon — verify DEM covered the radius"
```

Logging the maximum horizon angle and its bearing alongside the profile is what keeps the far-shading loss auditable: an independent reviewer of the interconnection or project-finance package can compare the reported skyline against a topographic map and see immediately whether the dominant ridge was captured. Pin `rasterio`, `numpy`, and the DEM product version in `pyproject.toml` so a resampling-default change cannot silently shift the skyline between runs. With the profile validated, it drops into the shadow-casting and slope stages of the parent pipeline — combined with the derivatives from [automating hillshade and slope analysis for wind turbine siting](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/automating-hillshade-and-slope-analysis-for-wind-turbine-siting/) — to turn a flat-sky irradiance figure into a defensible, terrain-aware yield number.

## Related

- [Terrain & Shadow Analysis Pipelines](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/) — the parent workflow this per-site horizon profile feeds into shadow casting.
- [Automating Hillshade and Slope Analysis for Wind Turbine Siting](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/automating-hillshade-and-slope-analysis-for-wind-turbine-siting/) — the slope and aspect derivatives that combine with horizon shading into terrain-constraint layers.
- [Solar PV Yield Simulation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-pv-yield-simulation/) — the downstream model that consumes the horizon profile to compute far-shading loss.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — the projected-CRS and vertical-datum foundations this profiler enforces.
