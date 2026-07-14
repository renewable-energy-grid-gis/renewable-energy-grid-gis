---
title: Calculating Wind Shear Coefficients with Python
description: Fix NaN, -inf, and MemoryError failures when computing the power-law wind shear exponent (alpha) across paired height rasters — safe logarithmic evaluation, CRS/affine parity checks, dask chunking, terrain fallback routing, and a CI/CD audit gate.
slug: calculating-wind-shear-coefficients-with-python
type: article
breadcrumb: Calculating Wind Shear Coefficients with Python
datePublished: 2025-09-26
dateModified: 2026-06-26
---

# Calculating Wind Shear Coefficients with Python

`RuntimeWarning: invalid value encountered in log` followed by an all-`NaN` shear map — or a `MemoryError` during `xarray` broadcasting — is the failure signature this page exists to eliminate. It breaks the **hub-height scaling stage** of the [Wind Speed & Direction Modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/) workflow: the moment a paired set of height rasters is reduced to a power-law exponent (α), zero-wind cells, mismatched projections, and unchunked temporal stacks turn a one-line calculation into a corrupted resource assessment. Vertical wind speed extrapolation feeds turbine hub-height estimates and every downstream energy-yield number a lender treats as ground truth, so a silently wrong α propagates straight into capacity-factor projections without ever raising a hard error.

The power-law exponent is derived from two wind speeds measured at two heights:

$$ \alpha = \frac{\ln(V_2 / V_1)}{\ln(h_2 / h_1)} $$

The arithmetic is trivial. The production failures are not — they live in the data the formula consumes, not the formula itself.

## Root-cause analysis

Three compounding causes account for nearly every broken shear pipeline, and each maps to a distinct fix stage below:

1. **Zero or negative wind speeds.** `ln(0)` is `-inf` and `ln(<0)` is `NaN`. Calm periods, sensor dropouts, and nodata sentinels (often `-9999`) enter the logarithm directly. Aggregated across hourly or sub-hourly steps during [temporal data aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/), a single bad cell poisons the annual mean for that pixel and corrupts the downstream wake model.
2. **CRS and affine divergence.** Height layers sourced from different reanalysis products or LiDAR campaigns frequently carry mismatched projections or affine transforms. Without strict [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/), `xarray` broadcasts on index position rather than geography, so cell *(i, j)* in the 80 m grid is divided by a different physical location in the 120 m grid. The result is a smooth-looking raster of physically impossible exponents (α > 0.6 or α < 0.0) that no exception flags.
3. **Memory bloat from unchunked stacks.** Loading a full multi-year stack into RAM before broadcasting triggers `MemoryError` on standard analytical workstations, particularly for 10+ years of ERA5 or WRF output at 100 m resolution.

<svg viewBox="0 0 900 630" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Decision flow for computing a shear exponent. Paired v_low and v_high rasters first pass a CRS-and-affine parity gate; failure raises a ValueError demanding reproject_match. Passing rasters reach a positivity gate testing whether both wind speeds exceed zero. Positive cells compute alpha as ln(v2 over v1) divided by ln(h2 over h1); non-positive cells route to a terrain fallback exponent of 0.14 for open ground or 0.22 for forest. Both paths merge into a clip to the physical range 0.0 to 0.50, then write an audited NetCDF carrying provenance attributes." style="width:100%;max-width:900px;height:auto;font-family:inherit;">
  <title>Shear-exponent decision flow: parity gate, positivity gate, fallback routing, and physical clamp</title>
  <desc>A top-to-bottom flow on a left spine with a right exception-and-fallback lane. The input node holds the paired v_low and v_high rasters. The first diamond tests CRS and affine parity; a "no" branch exits right to a ValueError node that demands reproject_match, while "yes" continues down. The second diamond tests whether both v1 and v2 exceed zero; "yes" leads to the power-law calculation alpha equals ln of v2 over v1 divided by ln of h2 over h1, while "no" branches right to a terrain fallback exponent of 0.14 for open ground or 0.22 for forest. The calculation and the fallback both feed a clip node that bounds alpha to the range 0.0 to 0.50, which then writes an audited NetCDF with provenance attributes.</desc>
  <defs>
    <marker id="ws-flow-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="900" height="630" fill="none"/>
  <!-- Input -->
  <rect x="130" y="22" width="200" height="46" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="230" y="42" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Paired height rasters</text>
  <text x="230" y="59" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">v_low · v_high</text>
  <!-- Edge In -> C1 -->
  <line x1="230" y1="68" x2="230" y2="106" stroke="currentColor" stroke-width="1.4" marker-end="url(#ws-flow-arr)"/>
  <!-- Decision 1: CRS + affine parity -->
  <path d="M230,108 L326,160 L230,212 L134,160 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="230" y="156" text-anchor="middle" font-size="11.5" fill="currentColor">CRS + affine</text>
  <text x="230" y="172" text-anchor="middle" font-size="11.5" fill="currentColor">parity?</text>
  <!-- C1 no -> Err -->
  <line x1="326" y1="160" x2="538" y2="160" stroke="currentColor" stroke-width="1.4" marker-end="url(#ws-flow-arr)"/>
  <text x="430" y="151" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">no</text>
  <rect x="540" y="137" width="318" height="46" rx="7" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 3"/>
  <text x="699" y="157" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">raise ValueError</text>
  <text x="699" y="174" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">reproject_match() required</text>
  <!-- C1 yes -> C2 -->
  <line x1="230" y1="212" x2="230" y2="262" stroke="currentColor" stroke-width="1.4" marker-end="url(#ws-flow-arr)"/>
  <text x="244" y="240" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">yes</text>
  <!-- Decision 2: positivity -->
  <path d="M230,264 L326,316 L230,368 L134,316 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="230" y="312" text-anchor="middle" font-size="11.5" fill="currentColor">v1 &gt; 0 and</text>
  <text x="230" y="328" text-anchor="middle" font-size="11.5" fill="currentColor">v2 &gt; 0?</text>
  <!-- C2 no -> Fallback -->
  <line x1="326" y1="316" x2="538" y2="316" stroke="currentColor" stroke-width="1.4" marker-end="url(#ws-flow-arr)"/>
  <text x="430" y="307" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">no</text>
  <rect x="540" y="293" width="318" height="46" rx="7" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 3"/>
  <text x="699" y="313" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">terrain fallback α</text>
  <text x="699" y="330" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">0.14 open · 0.22 forest</text>
  <!-- C2 yes -> Calc -->
  <line x1="230" y1="368" x2="230" y2="418" stroke="currentColor" stroke-width="1.4" marker-end="url(#ws-flow-arr)"/>
  <text x="244" y="396" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">yes</text>
  <!-- Calc -->
  <rect x="98" y="420" width="264" height="48" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="230" y="442" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">power-law exponent</text>
  <text x="230" y="460" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">α = ln(v₂/v₁) / ln(h₂/h₁)</text>
  <!-- Calc -> Clip -->
  <line x1="230" y1="468" x2="230" y2="500" stroke="currentColor" stroke-width="1.4" marker-end="url(#ws-flow-arr)"/>
  <!-- Fallback -> Clip (down then left) -->
  <path d="M699,339 V522 H364" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#ws-flow-arr)"/>
  <!-- Clip -->
  <rect x="130" y="502" width="232" height="46" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="246" y="522" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">clip to physical bounds</text>
  <text x="246" y="539" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">0.0 ≤ α ≤ 0.50</text>
  <!-- Clip -> Out -->
  <line x1="246" y1="548" x2="246" y2="578" stroke="currentColor" stroke-width="1.4" marker-end="url(#ws-flow-arr)"/>
  <!-- Out (highlighted) -->
  <rect x="130" y="580" width="232" height="46" rx="7" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2"/>
  <text x="246" y="600" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">audited NetCDF</text>
  <text x="246" y="617" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">+ provenance attrs</text>
</svg>

## Pre-flight validation

Surface the root cause *before* the logarithm runs. The naive script below is the broken pattern — no spatial check, no zero handling, no chunking — and it is exactly what produces the silent corruption:

```python
import numpy as np
import rioxarray  # xr.open_rasterio was removed in xarray 2022.06; use rioxarray instead

# Flawed approach: no CRS validation, no zero-handling, no chunking
v_low = rioxarray.open_rasterio("wind_80m.tif")
v_high = rioxarray.open_rasterio("wind_120m.tif")

alpha = np.log(v_high / v_low) / np.log(120 / 80)  # -inf / NaN on calm cells
alpha.to_netcdf("shear_coeff.nc")
```

The pre-flight function isolates which of the three causes is present, so a CI/CD run fails fast with a precise message instead of writing a poisoned NetCDF:

```python
import numpy as np
import rioxarray
import xarray as xr


def preflight_shear_inputs(v_low: xr.DataArray, v_high: xr.DataArray) -> None:
    """Raise on the exact root cause before any logarithm is evaluated."""
    # Cause 2: CRS parity — both grids must share an identical EPSG/WKT
    if v_low.rio.crs != v_high.rio.crs:
        raise ValueError(
            f"CRS mismatch: {v_low.rio.crs} vs {v_high.rio.crs}. "
            "Reproject inputs to a common projected grid (e.g. EPSG:32610) first."
        )
    # Cause 2: affine transform parity — origin and resolution must align
    if not np.allclose(v_low.rio.transform(), v_high.rio.transform(), atol=1e-6):
        raise ValueError(
            "Affine transform divergence. Realign with rioxarray.reproject_match()."
        )
    # Cause 1: surface the prevalence of non-positive speeds rather than hiding it
    bad = int(((v_low <= 0) | (v_high <= 0)).sum())
    if bad:
        print(f"[preflight] {bad} cells have non-positive wind speed; "
              "these will route to terrain fallback, not NaN.")
```

| Validation step | Diagnostic command | Expected outcome |
|-----------------|--------------------|------------------|
| CRS parity | `v_low.rio.crs == v_high.rio.crs` | Identical EPSG/WKT strings (e.g. EPSG:32610) |
| Affine alignment | `np.allclose(v_low.rio.transform(), v_high.rio.transform(), atol=1e-6)` | Grid origin and resolution match within tolerance |
| Extent overlap | `v_low.rio.bounds() == v_high.rio.bounds()` | Identical footprint; prevents edge-NaN propagation |
| Coordinate precision | `v_low.coords["x"].dtype == "float64"` | No float truncation during interpolation |

## Fix implementation

The corrected function enforces safe logarithmic evaluation, applies dask chunking for out-of-core processing, and routes invalid cells to a terrain-classified fallback exponent. Parameter choices are justified for energy use: `chunk_size=1024` matches common COG tile geometry, the `[0.0, 0.50]` clamp bounds α to physically plausible values, and `nodata`-driven calm cells fall back to a documented terrain default rather than `NaN`.

```python
import numpy as np
import xarray as xr
import rioxarray


def compute_wind_shear_exponent(
    v_low_path: str,
    v_high_path: str,
    h_low: float,
    h_high: float,
    fallback_alpha: float = 0.14,   # open terrain; use 0.22 for forested
    chunk_size: int = 1024,
    min_alpha: float = 0.0,
    max_alpha: float = 0.50,
) -> xr.DataArray:
    """Power-law shear exponent with CRS alignment, zero-wind masking,
    out-of-core chunking, and deterministic terrain fallback routing."""
    # 1. Open lazily with dask chunks for memory-safe execution
    chunks = {"band": 1, "y": chunk_size, "x": chunk_size}
    v_low = rioxarray.open_rasterio(v_low_path, chunks=chunks)
    v_high = rioxarray.open_rasterio(v_high_path, chunks=chunks)

    # 2. Spatial validation (Cause 2) — fail before broadcasting
    preflight_shear_inputs(v_low, v_high)

    # 3. Safe logarithm (Cause 1) — mask non-positive speeds out of ln()
    valid = (v_low > 0) & (v_high > 0)
    log_ratio = np.log(v_high.where(valid) / v_low.where(valid)) / np.log(h_high / h_low)

    # 4. Fallback routing + physical bounds clamp
    alpha = xr.where(valid, log_ratio, fallback_alpha).clip(min_alpha, max_alpha)

    # 5. Audit-ready provenance metadata
    alpha.rio.write_crs(v_low.rio.crs, inplace=True)
    alpha.attrs.update({
        "method": "power_law_shear",
        "fallback_exponent": fallback_alpha,
        "h_low_m": h_low,
        "h_high_m": h_high,
        "alpha_bounds": [min_alpha, max_alpha],
        "processing_note": "non-positive speeds routed to terrain fallback; clipped to physical bounds",
        "spatial_validation": "CRS & affine transform parity enforced",
    })
    return alpha
```

Calling `v.where(valid)` before the division keeps the lazy dask graph intact and ensures the logarithm never sees a non-positive operand, so the `RuntimeWarning` disappears at its source rather than being suppressed after the fact.

## Fallback routing & performance tuning

For continental-scale or CI/CD runs where the full stack will not fit in RAM, layer these strategies on top of the core function:

- **Match chunk geometry to tile size.** Align `chunk_size` with the raster's internal tiling (typically 256×256 or 512×512). Mismatched chunks force dask to re-block, multiplying I/O and latency.
- **Compress on write.** Persist with `encoding={"zlib": True, "complevel": 4}` to balance throughput against storage footprint on multi-terabyte shear archives.
- **Stay lazy.** Avoid `.load()`, `.values`, or `.compute()` until the final aggregation. Let `xarray` defer execution until `.to_netcdf()` so dask can fuse the logarithm, mask, and clip into one pass.
- **Slice time sequentially.** Process annual or seasonal slabs one at a time instead of broadcasting a full multi-year array; ingest with `xr.open_mfdataset(..., parallel=True)`.
- **Mask non-representative terrain.** Power-law assumptions break over coastlines and complex relief, so clip with a validated land-use polygon — the same boundary discipline used in [terrain shadow analysis pipelines](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/) — and let those cells inherit the documented fallback rather than a spurious extrapolation.

## Downstream validation

Before a shear map feeds a yield model, gate it with an assertion function suitable for a CI/CD pipeline. This catches nodata bleed, out-of-bounds exponents, and CRS loss introduced by an upstream regression:

```python
def assert_shear_integrity(alpha: xr.DataArray, max_fallback_frac: float = 0.25) -> None:
    """CI/CD gate: fail the build if the shear map is not assessment-grade."""
    assert alpha.rio.crs is not None, "output lost its CRS"
    finite = alpha.where(np.isfinite(alpha))
    assert float(finite.min()) >= 0.0, "negative shear exponent present"
    assert float(finite.max()) <= 0.50, "non-physical shear exponent (>0.50)"
    assert int(np.isnan(alpha).sum()) == 0, "NaN bleed into shear output"

    fb = alpha.attrs.get("fallback_exponent")
    frac = float((alpha == fb).mean())
    assert frac <= max_fallback_frac, (
        f"{frac:.0%} of cells routed to fallback (> {max_fallback_frac:.0%}); "
        "inputs are too sparse to be defensible"
    )
```

Logging the fallback fraction as part of the provenance trail is what keeps the assessment auditable: an independent engineer reviewing the interconnection or project-finance package can see exactly how many cells were extrapolated versus measured, mirroring the metadata discipline enforced in [spatial data quality validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/). Pin `xarray`, `rioxarray`, and `dask` versions in `pyproject.toml` so a default-broadcasting change cannot silently shift the map between runs.

## Related

- [Wind Speed & Direction Modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/) — parent workflow for the hub-height field this exponent scales
- [Temporal Data Aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) — reduce hourly speeds to the annual layers shear consumes
- [Terrain Shadow Analysis Pipelines](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/) — terrain masking and complex-relief boundary handling
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — projected-CRS enforcement before any raster math
