---
title: Building a Site Suitability Scoring Pipeline with GeoPandas and pvlib
description: Combine pvlib-modeled solar yield, slope, grid proximity, and regulatory exclusions into one 0–100 suitability score on a GeoPandas sites layer — CRS-aligned, min-max normalized, hard-masked, and CI/CD-gated.
slug: building-a-site-suitability-scoring-pipeline-with-geopandas-and-pvlib
type: article
breadcrumb: Site Suitability Scoring Pipeline
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Building a Site Suitability Scoring Pipeline with GeoPandas and pvlib

You have a few hundred candidate solar parcels and four decision layers — a modeled resource surface, a slope raster, the transmission network, and a stack of regulatory exclusion polygons — and you need one defensible number per site: a 0–100 suitability score that a development committee can rank on. This page walks the full pipeline end to end and sits under [Solar Irradiance Raster Processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/), which produces the analysis-ready Global Horizontal Irradiance (GHI) grid this workflow consumes. The scoring itself is a weighted sum; almost every real failure happens in the plumbing *around* the sum — layers arriving in different projections, raster values sampled in the wrong frame, one criterion silently dominating because it was never normalized, and banned sites still scoring because the exclusion layer was treated as a soft penalty instead of a hard mask.

## Root-cause analysis

Four compounding causes turn a one-line weighted average into a misleading ranking, and each maps to a specific fix stage below:

1. **Layers in mismatched CRS.** The sites layer might be in EPSG:4326, the GHI raster in EPSG:32610, and the grid lines in a state-plane CRS. GeoPandas will happily compute a `distance()` between geometries in different coordinate systems and return a meaningless number in degrees. Every distance, area, and buffer in the score is wrong before it starts, so strict [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) into one projected metric CRS is the precondition for the whole pipeline.
2. **Mixing raster sampling with vector overlay.** Rasterizing a continuous GHI surface to polygons, or reprojecting site points into the raster's frame ad hoc, introduces registration error and doubles the CRS surface area. The correct pattern is to bring every vector layer into one metric frame and then sample the rasters *at the site points* — never overlay a raster against a vector as if they were the same data model.
3. **Unnormalized criteria dominating.** Annual GHI is ~1600–2000 (kWh/m²), slope is ~0–30 (degrees), and distance-to-grid is ~0–40 (km). Feed those raw numbers into a weighted sum and GHI's magnitude swamps everything — the weights become decorative. Each criterion must be min-max normalized to 0–1 *before* weighting, with cost criteria (slope, distance) inverted.
4. **Exclusion zones not hard-masked.** A wetland, a setback buffer, or a protected-area polygon is not a penalty to be outweighed by a great resource — it is a disqualifier. If the exclusion enters the score as one more weighted term, a high-GHI site inside a national park can still rank in the top decile. Exclusions and hard constraints must be a multiplicative 0/1 mask applied *after* the weighted sum.

<svg viewBox="0 0 900 470" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four suitability-scoring failure modes on the left mapped by arrows to their fixes on the right. Mismatched CRS maps to reprojecting every layer to EPSG:32610. Mixing raster sampling with vector overlay maps to sampling rasters at site points into a single GeoDataFrame. Unnormalized criteria dominating maps to min-max normalizing each criterion to 0 to 1 before weighting. Exclusion zones not hard-masked maps to a multiplicative 0 or 1 hard mask that forces excluded sites to score zero." style="width:100%;max-width:900px;height:auto;font-family:inherit;">
  <rect class="svg-bg" x="0" y="0" width="900" height="470"/>
  <title>Suitability-scoring failure modes mapped to fixes</title>
  <desc>A two-column table. The left column lists four failure modes as dashed boxes; the right column lists the corresponding fix as a solid, lightly filled box; an arrow connects each failure to its fix. Row one: layers in mismatched CRS maps to reproject every layer to EPSG:32610. Row two: raster sampling mixed with vector overlay maps to sample rasters at site points into one GeoDataFrame. Row three: unnormalized criteria dominate maps to min-max normalize each criterion to zero to one before weighting. Row four: exclusion zones not hard-masked maps to a multiplicative zero-or-one hard mask so excluded sites score zero.</desc>
  <defs>
    <marker id="ss-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="900" height="470" fill="none"/>
  <text x="205" y="34" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">Failure mode</text>
  <text x="695" y="34" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">Fix</text>
  <!-- Row 1 -->
  <rect x="30" y="56" width="350" height="70" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="205" y="84" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Layers in mismatched CRS</text>
  <text x="205" y="104" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.82">degrees vs metres — distances meaningless</text>
  <line x1="384" y1="91" x2="516" y2="91" stroke="currentColor" stroke-width="1.4" marker-end="url(#ss-arr)"/>
  <rect x="520" y="56" width="350" height="70" rx="7" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-width="1.6"/>
  <text x="695" y="84" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Reproject every layer to EPSG:32610</text>
  <text x="695" y="104" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.82">one projected metric frame</text>
  <!-- Row 2 -->
  <rect x="30" y="152" width="350" height="70" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="205" y="180" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Raster sampling mixed with overlay</text>
  <text x="205" y="200" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.82">point sample ≠ polygon rasterize</text>
  <line x1="384" y1="187" x2="516" y2="187" stroke="currentColor" stroke-width="1.4" marker-end="url(#ss-arr)"/>
  <rect x="520" y="152" width="350" height="70" rx="7" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-width="1.6"/>
  <text x="695" y="180" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Sample rasters at site points</text>
  <text x="695" y="200" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.82">into one GeoDataFrame</text>
  <!-- Row 3 -->
  <rect x="30" y="248" width="350" height="70" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="205" y="276" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Unnormalized criteria dominate</text>
  <text x="205" y="296" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.82">GHI ~1800 swamps slope ~10</text>
  <line x1="384" y1="283" x2="516" y2="283" stroke="currentColor" stroke-width="1.4" marker-end="url(#ss-arr)"/>
  <rect x="520" y="248" width="350" height="70" rx="7" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-width="1.6"/>
  <text x="695" y="276" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Min–max normalize before weighting</text>
  <text x="695" y="296" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.82">each criterion scaled to 0–1</text>
  <!-- Row 4 -->
  <rect x="30" y="344" width="350" height="70" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="205" y="372" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Exclusions not hard-masked</text>
  <text x="205" y="392" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.82">weighting lets banned sites score</text>
  <line x1="384" y1="379" x2="516" y2="379" stroke="currentColor" stroke-width="1.4" marker-end="url(#ss-arr)"/>
  <rect x="520" y="344" width="350" height="70" rx="7" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-width="1.6"/>
  <text x="695" y="372" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Multiplicative 0/1 hard mask</text>
  <text x="695" y="392" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.82">excluded → score forced to 0</text>
</svg>

The composite score for site $i$ is a masked, weighted sum of normalized criteria:

$$ S_i = 100 \cdot M_i \sum_{k=1}^{K} w_k\,\hat{c}_{i,k}, \qquad \sum_{k} w_k = 1, \qquad M_i \in \{0,1\} $$

where each raw criterion $c_{i,k}$ is min-max normalized — directly for benefits (yield) and inverted for costs (slope, distance):

$$ \hat{c}_{i,k} = \begin{cases} \dfrac{c_{i,k}-c_{k}^{\min}}{c_{k}^{\max}-c_{k}^{\min}} & \text{benefit} \\[2.2mm] 1-\dfrac{c_{i,k}-c_{k}^{\min}}{c_{k}^{\max}-c_{k}^{\min}} & \text{cost} \end{cases} $$

and $M_i$ is the product of all hard masks (exclusion membership, maximum slope, maximum grid distance). Because $M_i$ multiplies the whole sum, a single failed constraint drives the score to exactly 0 regardless of how good the resource is.

## Pre-flight validation

Before any sampling or scoring, surface the two structural failures — mismatched CRS and layers that do not spatially overlap — with a compact validator. It refuses to run rather than silently sampling nodata or differencing degrees against metres. This is the guard that makes a CI/CD run fail fast with a precise message.

```python
import numpy as np
import rasterio
import geopandas as gpd


def preflight_suitability_layers(sites_gdf, ghi_raster_path, slope_raster_path,
                                 grid_gdf, exclusion_gdf, target_epsg=32610):
    """Raise on CRS drift or missing coverage before the score is computed."""
    problems = []
    for name, gdf in [("sites", sites_gdf), ("grid", grid_gdf),
                      ("exclusion", exclusion_gdf)]:
        if gdf.crs is None:
            problems.append(f"{name}: CRS is undefined")
        elif gdf.crs.to_epsg() != target_epsg:
            problems.append(f"{name}: EPSG:{gdf.crs.to_epsg()} != target EPSG:{target_epsg}")

    if not (sites_gdf.geom_type == "Point").all():
        problems.append("sites layer must be Point geometries (candidate centroids)")

    sb = sites_gdf.total_bounds  # (minx, miny, maxx, maxy) in the metric CRS
    for path in (ghi_raster_path, slope_raster_path):
        with rasterio.open(path) as src:
            code = src.crs.to_epsg() if src.crs else None
            if code != target_epsg:
                problems.append(f"{path}: raster EPSG:{code} != EPSG:{target_epsg}")
            b = src.bounds
            if sb[0] < b.left or sb[1] < b.bottom or sb[2] > b.right or sb[3] > b.top:
                problems.append(f"{path}: does not fully cover site extent — "
                                "points outside it will sample nodata")

    if problems:
        raise ValueError("Pre-flight failed:\n  - " + "\n  - ".join(problems))
```

| Validation step | Diagnostic | Expected outcome |
|-----------------|-----------|------------------|
| Vector CRS parity | `gdf.crs.to_epsg() == 32610` | Every layer on the projected metric grid |
| Raster CRS parity | `src.crs.to_epsg() == 32610` | GHI and slope share the site CRS |
| Coverage | `total_bounds` inside `src.bounds` | No site samples off the raster footprint |
| Geometry type | `(geom_type == "Point").all()` | Sampling and joins operate on centroids |

## Building the suitability score

The main function assembles every layer in EPSG:32610, samples GHI and slope at each site point, models a relative PV yield from the sampled GHI with pvlib, adds distance-to-grid and the hard exclusion mask, then normalizes and combines into the 0–100 score. The pvlib step is deliberately a *screening-grade* relative index — a temperature-corrected pvwatts estimate per unit capacity — not a bankable hourly run; for that, feed the shortlist into [Solar PV Yield Simulation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-pv-yield-simulation/) with a full `ModelChain`.

<svg viewBox="0 0 940 400" role="img" aria-label="Why a suitability model applies knock-out criteria before it applies weights. Of 4,820 candidate parcels, 1,640 fail a hard constraint — inside a wetland, slope above 15 percent, or no legal access — and are removed outright. Only the remaining 3,180 are scored on the weighted criteria. Folding the hard constraints into the weighted sum instead lets a parcel with an outstanding irradiance score outrank one that is merely good but actually buildable." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Hard constraints eliminate; weighted criteria rank</title>
  <desc>A two-stage funnel. Stage one, knock-outs, removes 1,640 of 4,820 candidate parcels: 720 inside a protected wetland, 512 above a 15 percent slope, 408 with no legal access. Stage two scores the surviving 3,180 parcels on four weighted criteria — irradiance at 0.35, distance to interconnection at 0.30, slope at 0.20 and parcel size at 0.15. A callout shows the failure mode of merging the two: a wetland parcel with a top irradiance score outranking a buildable one.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="ko-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">4 820 parcels: eliminate first, then rank what is left</text>
  <rect x="30" y="70" width="220" height="68" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="140.0" y="94" text-anchor="middle" font-size="11.5" fill="currentColor">candidate parcels</text>
  <text x="140.0" y="118" text-anchor="middle" font-size="18" fill="currentColor" font-weight="700">4 820</text>
  <rect x="300" y="72" width="300" height="28" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.5"/>
  <text x="450.0" y="92" text-anchor="middle" font-size="11.5" fill="currentColor">inside protected wetland — 720</text>
  <line x1="256" y1="110" x2="292" y2="90" stroke="currentColor" stroke-width="1.1" opacity="0.5" marker-end="url(#ko-arr)"/>
  <rect x="300" y="122" width="300" height="28" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.5"/>
  <text x="450.0" y="142" text-anchor="middle" font-size="11.5" fill="currentColor">slope above 15% — 512</text>
  <line x1="256" y1="110" x2="292" y2="140" stroke="currentColor" stroke-width="1.1" opacity="0.5" marker-end="url(#ko-arr)"/>
  <rect x="300" y="172" width="300" height="28" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.5"/>
  <text x="450.0" y="192" text-anchor="middle" font-size="11.5" fill="currentColor">no legal access — 408</text>
  <line x1="256" y1="110" x2="292" y2="190" stroke="currentColor" stroke-width="1.1" opacity="0.5" marker-end="url(#ko-arr)"/>
  <line x1="614" y1="110" x2="650" y2="110" stroke="currentColor" stroke-width="1.4" marker-end="url(#ko-arr)"/>
  <rect x="660" y="70" width="250" height="68" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="785.0" y="94" text-anchor="middle" font-size="11.5" fill="currentColor">survive the knock-outs</text>
  <text x="785.0" y="118" text-anchor="middle" font-size="18" fill="currentColor" font-weight="700">3 180</text>
  <text x="30" y="250" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">weighted criteria, applied only to the survivors</text>
  <rect x="30" y="262" width="302.0" height="44" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="181.0" y="282" text-anchor="middle" font-size="11" fill="currentColor">irradiance (POA)</text>
  <text x="181.0" y="298" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">weight 0.35</text>
  <rect x="338.0" y="262" width="258.0" height="44" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="467.0" y="282" text-anchor="middle" font-size="11" fill="currentColor">distance to interconnection</text>
  <text x="467.0" y="298" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">weight 0.30</text>
  <rect x="602.0" y="262" width="170.0" height="44" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="687.0" y="282" text-anchor="middle" font-size="11" fill="currentColor">slope</text>
  <text x="687.0" y="298" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">weight 0.20</text>
  <rect x="778.0" y="262" width="126.0" height="44" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="841.0" y="282" text-anchor="middle" font-size="11" fill="currentColor">parcel size</text>
  <text x="841.0" y="298" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">weight 0.15</text>
  <rect x="30" y="326" width="880" height="48" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="470.0" y="347" text-anchor="middle" font-size="11.5" fill="currentColor">Merge the two stages and a wetland parcel with a top irradiance score outranks a buildable one —</text>
  <text x="470.0" y="364" text-anchor="middle" font-size="11.5" fill="currentColor">the weighted sum has no way to express “this is not permittable at any score”.</text>
</svg>

```python
import numpy as np
import geopandas as gpd
import rasterio
import pvlib


def _minmax(values, invert=False):
    """Scale to 0–1; invert for cost criteria. Zero when a criterion has no spread."""
    v = np.asarray(values, dtype="float64")
    lo, hi = np.nanmin(v), np.nanmax(v)
    if not np.isfinite(lo) or (hi - lo) < 1e-9:
        return np.zeros_like(v)            # no discrimination — do not let it drive the score
    scaled = (v - lo) / (hi - lo)
    return 1.0 - scaled if invert else scaled


def relative_pv_yield(ghi_kwh_m2_yr, temp_air_c, wind_ms=2.0, gamma_pdc=-0.0035):
    """Screening-grade relative annual DC yield per kWp from annual GHI."""
    g_eff = np.asarray(ghi_kwh_m2_yr, "float64") * 1000.0 / 8760.0   # kWh/m²/yr → mean W/m²
    temp_cell = pvlib.temperature.faiman(g_eff, temp_air_c, wind_ms)
    dc_w = pvlib.pvsystem.pvwatts_dc(g_eff, temp_cell, pdc0=1000.0, gamma_pdc=gamma_pdc)
    return dc_w * 8760.0 / 1000.0          # relative kWh/kWp/yr index


def score_site_suitability(sites_gdf, ghi_raster_path, slope_raster_path,
                           grid_gdf, exclusion_gdf, target_epsg=32610,
                           weights=None, temp_air_c=15.0,
                           max_slope_deg=15.0, max_grid_km=20.0):
    weights = weights or {"yield": 0.50, "slope": 0.20, "grid": 0.30}
    assert abs(sum(weights.values()) - 1.0) < 1e-6, "criterion weights must sum to 1.0"

    # 1. Assemble one metric frame — reproject every vector layer to EPSG:32610
    sites = sites_gdf.to_crs(target_epsg).copy()
    grid = grid_gdf.to_crs(target_epsg)
    exclusion = exclusion_gdf.to_crs(target_epsg)
    preflight_suitability_layers(sites, ghi_raster_path, slope_raster_path,
                                 grid, exclusion, target_epsg)

    # 2. Sample rasters AT the site points — never overlay raster against vector
    coords = [(geom.x, geom.y) for geom in sites.geometry]
    with rasterio.open(ghi_raster_path) as ghi_src:
        ghi_nodata = ghi_src.nodata
        sites["ghi_kwh_m2_yr"] = [rec[0] for rec in ghi_src.sample(coords)]
    with rasterio.open(slope_raster_path) as slope_src:
        sites["slope_deg"] = [rec[0] for rec in slope_src.sample(coords)]
    if ghi_nodata is not None:
        sites.loc[sites["ghi_kwh_m2_yr"] == ghi_nodata, "ghi_kwh_m2_yr"] = np.nan

    # 3. Resource criterion: model relative yield from sampled GHI with pvlib
    sites["rel_yield"] = relative_pv_yield(sites["ghi_kwh_m2_yr"], temp_air_c)

    # 4a. Grid criterion: distance to nearest transmission line (tie-safe)
    near = gpd.sjoin_nearest(sites[["geometry"]], grid[["geometry"]],
                             how="left", distance_col="grid_dist_m")
    sites["grid_dist_km"] = (near.groupby(near.index)["grid_dist_m"].min()
                             .reindex(sites.index) / 1000.0)

    # 4b. HARD mask: exclusion membership + slope/distance constraints (0 or 1)
    hit = gpd.sjoin(sites[["geometry"]], exclusion[["geometry"]],
                    how="left", predicate="intersects")
    in_excl = sites.index.isin(hit.index[hit["index_right"].notna()])
    hard_mask = (~in_excl
                 & (sites["slope_deg"] <= max_slope_deg)
                 & (sites["grid_dist_km"] <= max_grid_km)).astype("float64")

    # 5. Normalize each criterion to 0–1 BEFORE weighting (cost criteria inverted)
    n_yield = _minmax(sites["rel_yield"])                  # benefit
    n_slope = _minmax(sites["slope_deg"], invert=True)     # cost
    n_grid = _minmax(sites["grid_dist_km"], invert=True)   # cost
    composite = (weights["yield"] * n_yield
                 + weights["slope"] * n_slope
                 + weights["grid"] * n_grid)

    sites["excluded"] = in_excl
    sites["suitability"] = np.round(100.0 * composite * hard_mask, 1)
    ranked = sites.sort_values("suitability", ascending=False, kind="stable")
    ranked["rank"] = range(1, len(ranked) + 1)
    return ranked
```

Three parameter choices are load-bearing. `sjoin_nearest` can emit duplicate rows when a site is equidistant from two lines, so the `groupby(...).min()` collapses ties back to one distance per site — a detail that this vectorized nearest-neighbour search shares with [proximity distance calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) across the grid layer. The default weights put half the signal on resource because it is the criterion with the widest bankability spread, but they are an argument precisely so a portfolio can re-run under alternate priorities. And `max_slope_deg=15.0` is treated as a *hard* cutoff rather than a penalty, because construction cost and racking constraints on steep ground are non-negotiable — the same reasoning that drives [hillshade and slope analysis for turbine siting](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/automating-hillshade-and-slope-analysis-for-wind-turbine-siting/). Exclusion polygons should originate from the authoritative [regulatory boundary mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/) layer so setbacks and protected areas are current.

## Fallback routing & performance tuning

- **Sites off the raster footprint.** A point outside the GHI grid samples nodata and yields `NaN`, which `_minmax` ignores but which then scores 0 — indistinguishable from a genuinely poor site. Route missing-GHI sites to a logged regional mean, or drop them with the fraction recorded, rather than letting a silent `NaN` masquerade as a real result.
- **Degenerate normalization.** When a criterion has no spread — every candidate is the same distance from grid — `_minmax` returns all zeros and that term contributes nothing. Log the min/max range of each criterion; if one collapses, redistribute its weight rather than shipping a score that is secretly built on two criteria.
- **Scale the joins with the spatial index.** GeoPandas builds an STRtree automatically for `sjoin_nearest` and `sjoin`; keep `grid_gdf` and `exclusion_gdf` pre-clipped to the study-area bounding box so the tree is small and the nearest query stays fast on tens of thousands of sites.
- **Reproject rasters once, up front.** If GHI or slope is not already in EPSG:32610, warp the *raster* once (see [Solar Irradiance Raster Processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/)) instead of reprojecting site points into the raster CRS per run — moving points into a different frame is exactly the mixed-frame bug this pipeline exists to prevent.
- **Test weight sensitivity.** Run the score under two or three weight sets and export the rank spread. A parcel that lands top-decile under only one weighting is not a robust pick; a parcel that stays top-decile across all of them is.

## Downstream validation

Before the ranked layer is exported to GeoPackage or handed to a mapping portal, gate it with an assertion function suitable for a CI/CD step. It re-checks the invariants that the four failure modes attack — score bounds, the hard mask actually holding, CRS retention, and unique ranks.

<svg viewBox="0 0 940 372" role="img" aria-label="Two of the four criteria improve as the raw value rises and two improve as it falls, so each needs its own normalisation direction. Plane-of-array irradiance and parcel size are normalised ascending: the highest raw value scores 1. Distance to interconnection and slope are normalised descending: the lowest raw value scores 1. Normalising all four the same way — the common bug — rewards the farthest, steepest parcels." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Ascending and descending normalisation, per criterion</title>
  <desc>Four criteria drawn as small ramps. Plane-of-array irradiance, from 1,450 to 2,100 kilowatt-hours per square metre per year, and parcel size, from 20 to 400 hectares, both ramp upward: the largest raw value scores 1. Distance to interconnection, from 0.4 to 38 kilometres, and slope, from 0 to 15 percent, both ramp downward: the smallest raw value scores 1. A warning notes that applying a single ascending normalisation to all four produces a model that prefers the farthest and steepest parcels.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="372"/>
  <defs><marker id="nd-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Two criteria improve upward, two improve downward</text>
  <rect x="40" y="62" width="196" height="158" rx="8" fill="none" stroke="#3D8B5F" stroke-width="1.1" opacity="0.5"/>
  <line x1="64" y1="194" x2="212" y2="194" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <line x1="64" y1="194" x2="64" y2="88" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <path d="M64,194 L212,88" fill="none" stroke="#3D8B5F" stroke-width="2.6"/>
  <text x="54" y="94" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.8">1</text>
  <text x="54" y="198" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.8">0</text>
  <text x="138" y="244" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">POA irradiance</text>
  <text x="138" y="262" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1 450 → 2 100 kWh/m²·yr</text>
  <text x="138" y="284" text-anchor="middle" font-size="11" fill="#1F5C3A" font-weight="700">ascending</text>
  <rect x="266" y="62" width="196" height="158" rx="8" fill="none" stroke="#3D8B5F" stroke-width="1.1" opacity="0.5"/>
  <line x1="290" y1="194" x2="438" y2="194" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <line x1="290" y1="194" x2="290" y2="88" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <path d="M290,194 L438,88" fill="none" stroke="#3D8B5F" stroke-width="2.6"/>
  <text x="280" y="94" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.8">1</text>
  <text x="280" y="198" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.8">0</text>
  <text x="364" y="244" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">parcel size</text>
  <text x="364" y="262" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">20 → 400 ha</text>
  <text x="364" y="284" text-anchor="middle" font-size="11" fill="#1F5C3A" font-weight="700">ascending</text>
  <rect x="492" y="62" width="196" height="158" rx="8" fill="none" stroke="#5BA8C8" stroke-width="1.1" opacity="0.5"/>
  <line x1="516" y1="194" x2="664" y2="194" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <line x1="516" y1="194" x2="516" y2="88" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <path d="M516,88 L664,194" fill="none" stroke="#5BA8C8" stroke-width="2.6"/>
  <text x="506" y="94" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.8">1</text>
  <text x="506" y="198" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.8">0</text>
  <text x="590" y="244" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">distance to POI</text>
  <text x="590" y="262" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0.4 → 38 km</text>
  <text x="590" y="284" text-anchor="middle" font-size="11" fill="#2C6E8F" font-weight="700">descending</text>
  <rect x="718" y="62" width="196" height="158" rx="8" fill="none" stroke="#5BA8C8" stroke-width="1.1" opacity="0.5"/>
  <line x1="742" y1="194" x2="890" y2="194" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <line x1="742" y1="194" x2="742" y2="88" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <path d="M742,88 L890,194" fill="none" stroke="#5BA8C8" stroke-width="2.6"/>
  <text x="732" y="94" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.8">1</text>
  <text x="732" y="198" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.8">0</text>
  <text x="816" y="244" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">slope</text>
  <text x="816" y="262" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0 → 15%</text>
  <text x="816" y="284" text-anchor="middle" font-size="11" fill="#2C6E8F" font-weight="700">descending</text>
  <rect x="40" y="306" width="868" height="48" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="474.0" y="327" text-anchor="middle" font-size="11.5" fill="currentColor">One ascending normalisation for all four is the common bug: it produces a model that prefers the</text>
  <text x="474.0" y="344" text-anchor="middle" font-size="11.5" fill="currentColor">farthest, steepest parcels and still returns a perfectly plausible ranked list.</text>
</svg>

```python
def assert_suitability_output(ranked, target_epsg=32610):
    """CI/CD gate: fail the build if the ranked scores are not defensible."""
    assert ranked.crs is not None and ranked.crs.to_epsg() == target_epsg, \
        "output CRS drifted from EPSG:32610"
    score = ranked["suitability"]
    assert score.between(0, 100).all(), "suitability outside 0–100 — normalization broke"
    # Every excluded site MUST score exactly 0 — proves the hard mask held.
    assert (ranked.loc[ranked["excluded"], "suitability"] == 0).all(), \
        "excluded site scored > 0 — hard mask leaked into the weighted sum"
    assert ranked["ghi_kwh_m2_yr"].notna().any(), \
        "all GHI samples are nodata — sites miss the raster footprint"
    assert ranked["rank"].is_unique, "duplicate ranks — tie handling failed"
```

The exclusion assertion is the one that matters most for permitting review: it is a machine-checkable proof that no disqualified parcel can surface in the shortlist, which is exactly the kind of guarantee a regulator or lender will ask you to demonstrate. Pin `geopandas`, `shapely`, `rasterio`, and `pvlib` versions in `pyproject.toml` so a default-behaviour change in a spatial join or a pvlib model cannot silently shift the ranking between runs, and persist the weights and constraint thresholds alongside the output as provenance.

## Related

- [Solar Irradiance Raster Processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) — produces the CRS-aligned GHI grid this scorer samples.
- [Solar PV Yield Simulation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-pv-yield-simulation/) — the full pvlib `ModelChain` run for shortlisted sites once screening narrows the field.
- [Automating Hillshade and Slope Analysis for Wind Turbine Siting](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/automating-hillshade-and-slope-analysis-for-wind-turbine-siting/) — derives the slope raster the terrain criterion consumes.
- [Proximity Distance Calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) — vectorized nearest-line distance underpinning the grid-proximity criterion.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "headline": "Building a Site Suitability Scoring Pipeline with GeoPandas and pvlib",
      "description": "Combine pvlib-modeled solar yield, slope, grid proximity, and regulatory exclusions into one 0–100 suitability score on a GeoPandas sites layer — CRS-aligned, min-max normalized, hard-masked, and CI/CD-gated.",
      "datePublished": "2026-07-14",
      "dateModified": "2026-07-14",
      "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/building-a-site-suitability-scoring-pipeline-with-geopandas-and-pvlib/",
      "about": ["GIS", "Solar energy", "Site selection", "Multi-criteria analysis", "Python", "pvlib"]
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Solar & Wind Resource Modeling Workflows", "item": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/" },
        { "@type": "ListItem", "position": 2, "name": "Solar Irradiance Raster Processing", "item": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/" },
        { "@type": "ListItem", "position": 3, "name": "Building a Site Suitability Scoring Pipeline with GeoPandas and pvlib", "item": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/building-a-site-suitability-scoring-pipeline-with-geopandas-and-pvlib/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Score Candidate Solar Sites with GeoPandas and pvlib",
      "description": "A deterministic multi-criteria pipeline that combines pvlib-modeled yield, slope, grid proximity, and regulatory exclusions into one 0–100 suitability score on a GeoPandas sites layer.",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Align all layers to EPSG:32610 and validate coverage", "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/building-a-site-suitability-scoring-pipeline-with-geopandas-and-pvlib/#pre-flight-validation" },
        { "@type": "HowToStep", "position": 2, "name": "Sample GHI and slope at each candidate site point", "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/building-a-site-suitability-scoring-pipeline-with-geopandas-and-pvlib/#building-the-suitability-score" },
        { "@type": "HowToStep", "position": 3, "name": "Model relative PV yield from GHI with pvlib", "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/building-a-site-suitability-scoring-pipeline-with-geopandas-and-pvlib/#building-the-suitability-score" },
        { "@type": "HowToStep", "position": 4, "name": "Add distance-to-grid and apply hard exclusion masks", "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/building-a-site-suitability-scoring-pipeline-with-geopandas-and-pvlib/#building-the-suitability-score" },
        { "@type": "HowToStep", "position": 5, "name": "Combine criteria into a weighted, normalized 0–100 score and rank", "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/building-a-site-suitability-scoring-pipeline-with-geopandas-and-pvlib/#building-the-suitability-score" },
        { "@type": "HowToStep", "position": 6, "name": "Gate the ranked output before export", "url": "https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/building-a-site-suitability-scoring-pipeline-with-geopandas-and-pvlib/#downstream-validation" }
      ]
    }
  ]
}
</script>
