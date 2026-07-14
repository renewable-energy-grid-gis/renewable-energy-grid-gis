---
title: Interpolating Sparse Met Mast Data with Kriging
description: Interpolate sparse met-mast data into a wind-speed surface with ordinary kriging in pykrige — projected-CRS variograms, universal kriging, and IDW fallback.
slug: interpolating-sparse-met-mast-data-with-kriging
type: article
breadcrumb: Interpolating Sparse Met Mast Data with Kriging
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Interpolating Sparse Met Mast Data with Kriging

You have five or six met masts scattered across a prospect and you need a continuous mean-wind-speed surface — a smooth raster of `wind_speed_ms` covering every candidate turbine pad, not just the point measurements. Ordinary kriging is the defensible tool for this because, unlike a naive fill, it returns both a prediction and a per-cell variance you can audit. But run it carelessly and it fails in ways that never raise an exception: the fitted variogram is meaningless, the surface bulges to impossible values between masts, or the whole field silently tilts with terrain. This scenario sits directly under [Wind Speed & Direction Modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/), which handles the directional field; here the target is the scalar magnitude, and the enemy is sparsity.

Ordinary kriging predicts the value at an unsampled location $x_0$ as a weighted linear combination of the observed masts,

$$ \hat{Z}(x_0) = \sum_{i=1}^{n} \lambda_i\, Z(x_i), \qquad \sum_{i=1}^{n} \lambda_i = 1 $$

where the weights $\lambda_i$ are chosen to minimise the estimation variance subject to unbiasedness. The weights come from the **variogram** — a model of how quickly wind speed decorrelates with distance — so everything downstream depends on that model being fitted from real, projected, non-degenerate distances.

## Root-cause analysis

Four compounding causes account for nearly every broken kriging surface built from a handful of masts, and each maps to a distinct fix below.

1. **Kriging in a geographic CRS.** If `mast_gdf` is still in EPSG:4326 when it reaches `pykrige`, the empirical semivariogram is computed on *degrees*, and its fitted range — the distance at which spatial correlation flattens out — is a number like `0.4` that means nothing physical. A degree of longitude is not a degree of latitude, so the field is anisotropically stretched before a single weight is solved. Enforce [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) into a metric frame first.
2. **Too few points for a stable variogram.** The empirical semivariance at lag $h$ is the mean squared difference of all mast pairs that distance apart, $\hat{\gamma}(h) = \frac{1}{2\,|N(h)|}\sum_{(i,j)\in N(h)}\bigl(z_i - z_j\bigr)^2$. With six masts you have only 15 pairs total; binned into lags, each point of the variogram is an average of two or three differences. The least-squares fit of nugget, sill, and range to that cloud is wildly unstable, and a bad range poisons every weight.
3. **Extrapolation beyond the convex hull.** Kriging will happily return a value for a grid cell far outside the masts, but that value is an extrapolation with a variance that balloons. Left unmasked, those cells produce physically impossible speeds at the domain edges and get treated as real by whatever consumes the raster.
4. **Ignoring the elevation trend.** Wind speed climbs with exposure and elevation. Ordinary kriging assumes a constant mean across the domain, so over a ridge-and-valley prospect it systematically under-predicts the ridges and over-predicts the valleys. When speed is correlated with terrain, the mean is not stationary and you need **universal (regression) kriging** with an elevation drift term instead.

<svg viewBox="0 0 900 430" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A two-column map of four met-mast kriging failure modes to their fixes. Kriging in geographic CRS EPSG 4326, whose variogram range is in degrees, is fixed by reprojecting masts to metric CRS EPSG 32614 so the range is in metres. Too few masts to fit a stable variogram is fixed by an inverse-distance-weighting fallback that needs no variogram. Prediction beyond the convex hull, an unbounded extrapolation, is fixed by clipping to the hull and flagging cells of high kriging variance. Elevation trend ignored by ordinary kriging, which biases ridges and valleys, is fixed by universal kriging with an elevation drift term." style="width:100%;max-width:900px;height:auto;font-family:inherit;">
  <title>Four sparse-kriging failure modes mapped to their fixes</title>
  <desc>A table of four rows. Each left cell states a failure cause and each right cell states the correction, with an arrow from cause to fix. Row one: kriging run in a geographic CRS with a variogram range in degrees is corrected by reprojecting masts to metric CRS EPSG 32614. Row two: too few masts to fit a stable variogram is corrected by an inverse-distance-weighting fallback needing no variogram. Row three: prediction beyond the convex hull as an unbounded extrapolation is corrected by clipping to the hull and flagging high kriging variance. Row four: elevation trend ignored by ordinary kriging is corrected by universal kriging with an elevation drift term.</desc>
  <defs>
    <marker id="kr-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="900" height="430" fill="none"/>
  <text x="222" y="34" text-anchor="middle" font-size="13.5" fill="currentColor" font-weight="700">Failure mode</text>
  <text x="678" y="34" text-anchor="middle" font-size="13.5" fill="currentColor" font-weight="700">Correct handling</text>
  <!-- Row 1 -->
  <rect x="36" y="52" width="372" height="58" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="222" y="76" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">Kriging run in geographic CRS (EPSG:4326)</text>
  <text x="222" y="94" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">variogram range measured in degrees</text>
  <line x1="408" y1="81" x2="490" y2="81" stroke="currentColor" stroke-width="1.4" marker-end="url(#kr-arr)"/>
  <rect x="492" y="52" width="372" height="58" rx="7" fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-width="1.5"/>
  <text x="678" y="76" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">Reproject masts to metric CRS EPSG:32614</text>
  <text x="678" y="94" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">range now in metres</text>
  <!-- Row 2 -->
  <rect x="36" y="134" width="372" height="58" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="222" y="158" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">Too few masts for a stable variogram</text>
  <text x="222" y="176" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">singular / noisy semivariance fit</text>
  <line x1="408" y1="163" x2="490" y2="163" stroke="currentColor" stroke-width="1.4" marker-end="url(#kr-arr)"/>
  <rect x="492" y="134" width="372" height="58" rx="7" fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-width="1.5"/>
  <text x="678" y="158" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">IDW fallback · widen the catchment</text>
  <text x="678" y="176" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">no variogram required</text>
  <!-- Row 3 -->
  <rect x="36" y="216" width="372" height="58" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="222" y="240" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">Prediction beyond the convex hull</text>
  <text x="222" y="258" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">unbounded extrapolation</text>
  <line x1="408" y1="245" x2="490" y2="245" stroke="currentColor" stroke-width="1.4" marker-end="url(#kr-arr)"/>
  <rect x="492" y="216" width="372" height="58" rx="7" fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-width="1.5"/>
  <text x="678" y="240" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">Clip to hull · flag high kriging variance</text>
  <text x="678" y="258" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">variance is the audit signal</text>
  <!-- Row 4 -->
  <rect x="36" y="298" width="372" height="58" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="222" y="322" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">Elevation trend ignored (ordinary kriging)</text>
  <text x="222" y="340" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">biased over ridges &amp; valleys</text>
  <line x1="408" y1="327" x2="490" y2="327" stroke="currentColor" stroke-width="1.4" marker-end="url(#kr-arr)"/>
  <rect x="492" y="298" width="372" height="58" rx="7" fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-width="1.5"/>
  <text x="678" y="322" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">Universal kriging with elevation drift</text>
  <text x="678" y="340" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">trend modelled explicitly</text>
  <!-- footnote -->
  <text x="450" y="392" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.75">The kriging variance surface is what separates a defensible interpolation from a plausible-looking guess.</text>
</svg>

## Pre-flight validation

Every one of those causes is cheaper to catch before the variogram is fitted than after a wrong surface has propagated into a yield model. The validator below enforces a projected metric CRS, collapses coincident masts that would make the kriging matrix singular, and refuses to proceed when too few unique points remain for a stable fit.

```python
import numpy as np
import geopandas as gpd


def preflight_kriging_masts(mast_gdf: gpd.GeoDataFrame,
                            min_masts: int = 6,
                            dedup_tol_m: float = 1.0) -> gpd.GeoDataFrame:
    """Surface every kriging failure mode before a variogram is fitted."""
    # Cause 1: a geographic CRS makes the variogram range meaningless (degrees, not metres)
    if mast_gdf.crs is None or mast_gdf.crs.is_geographic:
        raise ValueError(
            f"Masts are in {mast_gdf.crs}; kriging needs a projected metric CRS. "
            "Reproject to EPSG:32614 (UTM 14N) so the variogram range is in metres."
        )
    if "wind_speed_ms" not in mast_gdf.columns:
        raise ValueError("Missing 'wind_speed_ms' column for the interpolation target.")

    # Cause 3 prep: coincident masts produce a singular kriging system
    xy = np.column_stack((mast_gdf.geometry.x, mast_gdf.geometry.y))
    rounded = np.round(xy / dedup_tol_m).astype(np.int64)
    _, keep = np.unique(rounded, axis=0, return_index=True)
    n_dup = len(mast_gdf) - len(keep)
    clean = mast_gdf.iloc[np.sort(keep)].copy()

    # Cause 2: too few unique points -> the fitted variogram is unstable
    if len(clean) < min_masts:
        raise ValueError(
            f"Only {len(clean)} unique masts (< {min_masts}); a fitted variogram "
            "will be unstable. Route to the IDW fallback or widen the catchment."
        )
    if n_dup:
        print(f"[preflight] collapsed {n_dup} coincident masts within {dedup_tol_m} m.")
    return clean
```

The `min_masts=6` floor is deliberately conservative. Below roughly six points the variogram cloud is too thin to distinguish nugget from range, and the honest response is to drop to a model-free interpolator rather than pretend a fitted covariance means something.

## Fix implementation

With clean, projected masts, fit the variogram and predict the grid. `pykrige` returns two arrays from `execute`: the interpolated `wind_speed` surface and the **kriging variance** — keep both, because the variance is what makes the result auditable. When per-mast elevation is available and wind speed tracks terrain, switch to universal kriging with a specified elevation drift; the spherical model,

$$ \gamma(h) = \begin{cases} c_0 + c\left[\dfrac{3h}{2a} - \dfrac{1}{2}\left(\dfrac{h}{a}\right)^3\right] & 0 < h \le a \\[4pt] c_0 + c & h > a \end{cases} $$

with nugget $c_0$, partial sill $c$, and range $a$, is the sensible default for a wind field: it flattens cleanly at the range and does not assume the unbounded growth a linear model implies.

```python
import numpy as np
from pykrige.ok import OrdinaryKriging
from pykrige.uk import UniversalKriging


def krige_wind_surface(mast_gdf, gridx, gridy, elev_grid=None,
                       variogram_model="spherical", nlags=6):
    """Interpolate a mean-wind-speed surface plus kriging variance from met masts.

    If per-mast elevation is present and an elevation grid is supplied, model the
    terrain trend with universal kriging; otherwise fall back to ordinary kriging.
    Returns (wind_speed, krige_var) as 2-D arrays over the gridx/gridy axes.
    """
    x = mast_gdf.geometry.x.to_numpy(dtype="float64")
    y = mast_gdf.geometry.y.to_numpy(dtype="float64")
    z = mast_gdf["wind_speed_ms"].to_numpy(dtype="float64")

    if elev_grid is not None and "elev_m" in mast_gdf.columns:
        # Cause 4: model the elevation trend explicitly (regression / universal kriging)
        uk = UniversalKriging(
            x, y, z,
            variogram_model=variogram_model,
            nlags=nlags,
            drift_terms=["specified"],
            specified_drift=[mast_gdf["elev_m"].to_numpy(dtype="float64")],
        )
        wind_speed, krige_var = uk.execute(
            "grid", gridx, gridy, specified_drift_arrays=[elev_grid]
        )
    else:
        ok = OrdinaryKriging(
            x, y, z,
            variogram_model=variogram_model,
            nlags=nlags,
            coordinates_type="euclidean",   # distances in projected metres, not degrees
        )
        wind_speed, krige_var = ok.execute("grid", gridx, gridy)

    return np.asarray(wind_speed), np.asarray(krige_var)
```

Two parameter choices matter. `coordinates_type="euclidean"` is only correct because the preflight guaranteed a projected CRS — pass geographic coordinates here and `pykrige` will still run, silently, on degrees. And `nlags=6` keeps the empirical variogram from being fragmented into near-empty bins on a sparse network; with few pairs, fewer, fuller lags fit more stably than many thin ones.

### Why kriging over IDW

Inverse-distance weighting predicts the same weighted average, $\hat{Z}(x_0) = \left.\sum_i w_i Z(x_i)\middle/\sum_i w_i\right.$ with $w_i = d_i^{-p}$, but it is an *exact* interpolator that produces "bullseye" artefacts around each mast and, critically, returns **no uncertainty**. Kriging derives its weights from the fitted spatial correlation structure and hands back a variance surface, so you can distinguish a well-constrained cell between two masts from a guess at the domain edge. That variance is the whole reason to prefer it when masts are sparse — but it only pays off if you actually use it downstream, which the audit step below does.

## Fallback routing & performance tuning

- **Drop to IDW when the network is too thin.** If the preflight raises on `min_masts`, do not force a variogram — an unfitted or manually-pinned variogram is a fiction. Use inverse-distance weighting instead: `from scipy.spatial import cKDTree; w = 1.0 / np.maximum(dist, 1e-6) ** power`, taking the `k` nearest masts per grid cell. It is honest about being a smoother, not an estimator.
- **Choose the variogram model deliberately.** Try `"spherical"`, `"exponential"`, and `"gaussian"` and compare the fitted residuals; a `"gaussian"` model over-smooths and can overshoot between masts, which is exactly the artefact you are trying to avoid on a wind surface. Prefer the simplest model whose fit is stable.
- **Reach for universal kriging only when the trend is real.** Regress `wind_speed_ms` on `elev_m` first; if the relationship is weak, the extra drift term just adds variance. Terrain-driven acceleration is better handled together with the slope and aspect masks from [terrain shadow analysis pipelines](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/).
- **Grid coarsely, then refine.** Kriging cost scales with the number of prediction points, so build `gridx`/`gridy` at a coarse resolution for iteration and only densify for the final deliverable. The mast solve is fixed; the grid is what makes runs slow.
- **Keep the working dtype at float32 on write.** The surface never needs float64 precision once predicted; cast on serialization to halve the raster footprint, the same discipline the parent workflow applies to its U/V bands.

## Downstream validation

Before the surface feeds a resource assessment, gate it. This assertion checks that predictions stay physically plausible, confirms the variance was actually returned, and — the key protection against silent extrapolation — masks every cell that falls outside the convex hull of the masts or whose kriging variance blows past a multiple of the observed variance. It is suitable for a CI/CD job that blocks a release when the surface regresses.

```python
import numpy as np
from shapely import contains_xy          # shapely >= 2.0
from shapely.geometry import MultiPoint


def assert_kriged_surface(wind_speed, krige_var, mast_gdf, gridx, gridy,
                          plausible=(0.0, 30.0), max_var_ratio=3.0):
    """CI/CD gate: physical range, variance mapped, hull-bounded extrapolation."""
    finite = wind_speed[np.isfinite(wind_speed)]
    assert finite.min() >= plausible[0], "negative interpolated wind speed"
    assert finite.max() <= plausible[1], "wind speed above physical plausibility"
    assert np.isfinite(krige_var).any(), "kriging variance was not returned"

    # No wild extrapolation (1): clip to the convex hull of the masts
    hull = MultiPoint(list(zip(mast_gdf.geometry.x, mast_gdf.geometry.y))).convex_hull
    grid_x, grid_y = np.meshgrid(gridx, gridy)
    inside = contains_xy(hull, grid_x, grid_y)

    # No wild extrapolation (2): variance far above the sampled variance marks a
    # cell too far from any mast to defend, even when it sits inside the hull.
    obs_var = float(np.var(mast_gdf["wind_speed_ms"].to_numpy()))
    trusted = inside & (krige_var <= max_var_ratio * obs_var)
    frac_dropped = float((~trusted).mean())
    assert frac_dropped < 0.6, (
        f"{frac_dropped:.0%} of cells fall outside the hull or exceed the variance "
        "ceiling; the mast network is too sparse for a defensible surface."
    )
    return np.where(trusted, wind_speed, np.nan)
```

Logging `frac_dropped` alongside the fitted range and sill gives an independent reviewer the whole provenance trail: how much of the deliverable was interpolated between masts versus extrapolated and masked out. That auditability is the same standard enforced across [spatial data quality validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/), and it is what lets a downstream [wind rose built from the same met-mast data](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/building-wind-roses-from-met-mast-data-with-python/) and the vertical [wind shear scaling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/calculating-wind-shear-coefficients-with-python/) trust the surface they consume. Pin `pykrige`, `numpy`, and `shapely` in `pyproject.toml` so a change in default variogram fitting cannot shift the surface silently between runs.

## Related

- [Wind Speed & Direction Modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/) — parent workflow for the directional field this scalar surface complements.
- [Building Wind Roses from Met Mast Data with Python](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/building-wind-roses-from-met-mast-data-with-python/) — the per-mast directional summary that pairs with the interpolated speed surface.
- [Calculating Wind Shear Coefficients with Python](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/calculating-wind-shear-coefficients-with-python/) — scale the kriged surface vertically to turbine hub height.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — the projected metric frame the variogram requires.
