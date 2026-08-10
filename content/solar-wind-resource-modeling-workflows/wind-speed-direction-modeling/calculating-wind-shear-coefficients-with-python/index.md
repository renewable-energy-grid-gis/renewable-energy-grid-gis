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
  <rect class="svg-bg" x="0" y="0" width="900" height="630"/>
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

<svg viewBox="0 0 940 436" role="img" aria-label="The power law profile for four shear exponents, all anchored at 7.0 metres per second at 50 metres. At a 120 metre hub the same anchor gives 7.64 metres per second at alpha 0.10, 7.91 at 0.14, 8.34 at 0.20 and 9.11 at 0.30. Because power scales with the cube of speed, that spread is a 1.53 times difference in energy between the lowest and highest exponent — from one measurement and one assumption." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>One measured speed, four shear exponents, four hub-height answers</title>
  <desc>Four vertical wind profiles plotted with height from 0 to 140 metres on the vertical axis and wind speed from 5 to 10 metres per second on the horizontal. All four pass through 7.0 metres per second at 50 metres, the measurement height. At the 120 metre hub height, marked with a dashed line, they separate: alpha 0.10 gives 7.64, alpha 0.14 gives 7.91, alpha 0.20 gives 8.34 and alpha 0.30 gives 9.11 metres per second. A panel converts the speed spread into an energy spread of 1.53 times, since power goes with the cube of speed.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="436"/>
  <defs><marker id="sh-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">v(z) = v₅₀ · (z / 50)^α — anchored at 7.0 m/s at 50 m</text>
  <line x1="110" y1="300" x2="640" y2="300" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="110" y1="68" x2="110" y2="300" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="110.0" y1="300" x2="110.0" y2="305" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="110.0" y="320" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">5</text>
  <line x1="216.0" y1="300" x2="216.0" y2="305" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="216.0" y="320" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">6</text>
  <line x1="322.0" y1="300" x2="322.0" y2="305" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="322.0" y="320" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">7</text>
  <line x1="428.0" y1="300" x2="428.0" y2="305" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="428.0" y="320" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">8</text>
  <line x1="534.0" y1="300" x2="534.0" y2="305" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="534.0" y="320" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">9</text>
  <line x1="640.0" y1="300" x2="640.0" y2="305" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="640.0" y="320" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">10</text>
  <line x1="106" y1="300.0" x2="640" y2="300.0" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="304.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0 m</text>
  <line x1="106" y1="219.28571428571428" x2="640" y2="219.28571428571428" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="223.28571428571428" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">50 m</text>
  <line x1="106" y1="138.57142857142856" x2="640" y2="138.57142857142856" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="142.57142857142856" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">100 m</text>
  <line x1="106" y1="74.0" x2="640" y2="74.0" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="78.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">140 m</text>
  <text x="640" y="60" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.8">wind speed, m/s</text>
  <line x1="110" y1="106.2857142857143" x2="640" y2="106.2857142857143" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 4" opacity="0.6"/>
  <text x="118" y="98.2857142857143" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">hub height 120 m</text>
  <path d="M180.2,290.3 L197.8,287.1 L211.7,283.9 L223.3,280.6 L233.3,277.4 L242.1,274.2 L249.9,270.9 L257.0,267.7 L263.5,264.5 L269.5,261.3 L275.0,258.0 L280.2,254.8 L285.0,251.6 L289.6,248.3 L293.9,245.1 L298.0,241.9 L301.9,238.7 L305.6,235.4 L309.2,232.2 L312.6,229.0 L315.8,225.7 L319.0,222.5 L322.0,219.3 L324.9,216.1 L327.7,212.8 L330.5,209.6 L333.1,206.4 L335.7,203.1 L338.1,199.9 L340.5,196.7 L342.9,193.5 L345.2,190.2 L347.4,187.0 L349.6,183.8 L351.7,180.5 L353.7,177.3 L355.7,174.1 L357.7,170.9 L359.6,167.6 L361.5,164.4 L363.4,161.2 L365.2,157.9 L366.9,154.7 L368.7,151.5 L370.4,148.3 L372.0,145.0 L373.7,141.8 L375.3,138.6 L376.8,135.3 L378.4,132.1 L379.9,128.9 L381.4,125.7 L382.9,122.4 L384.3,119.2 L385.7,116.0 L387.1,112.7 L388.5,109.5 L389.9,106.3 L391.2,103.1 L392.5,99.8 L393.8,96.6 L395.1,93.4 L396.4,90.1 L397.6,86.9 L398.9,83.7 L400.1,80.5 L401.3,77.2 L402.5,74.0" fill="none" stroke="#5BA8C8" stroke-width="2.4"/>
  <circle cx="389.8881218084795" cy="106.2857142857143" r="4.5" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <path d="M131.4,290.3 L154.1,287.1 L172.3,283.9 L187.6,280.6 L200.9,277.4 L212.6,274.2 L223.1,270.9 L232.7,267.7 L241.4,264.5 L249.5,261.3 L257.1,258.0 L264.1,254.8 L270.8,251.6 L277.1,248.3 L283.0,245.1 L288.6,241.9 L294.0,238.7 L299.2,235.4 L304.1,232.2 L308.8,229.0 L313.4,225.7 L317.8,222.5 L322.0,219.3 L326.1,216.1 L330.0,212.8 L333.9,209.6 L337.6,206.4 L341.2,203.1 L344.7,199.9 L348.1,196.7 L351.4,193.5 L354.6,190.2 L357.8,187.0 L360.9,183.8 L363.9,180.5 L366.8,177.3 L369.7,174.1 L372.5,170.9 L375.2,167.6 L377.9,164.4 L380.5,161.2 L383.1,157.9 L385.6,154.7 L388.1,151.5 L390.6,148.3 L393.0,145.0 L395.3,141.8 L397.6,138.6 L399.9,135.3 L402.1,132.1 L404.3,128.9 L406.5,125.7 L408.6,122.4 L410.7,119.2 L412.8,116.0 L414.8,112.7 L416.8,109.5 L418.8,106.3 L420.7,103.1 L422.6,99.8 L424.5,96.6 L426.4,93.4 L428.2,90.1 L430.0,86.9 L431.8,83.7 L433.6,80.5 L435.3,77.2 L437.0,74.0" fill="none" stroke="#3D8B5F" stroke-width="2.4"/>
  <circle cx="418.7518268926202" cy="106.2857142857143" r="4.5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <path d="M65.6,290.3 L94.3,287.1 L117.8,283.9 L137.8,280.6 L155.2,277.4 L170.8,274.2 L184.9,270.9 L197.8,267.7 L209.6,264.5 L220.7,261.3 L231.0,258.0 L240.8,254.8 L249.9,251.6 L258.6,248.3 L266.9,245.1 L274.8,241.9 L282.4,238.7 L289.6,235.4 L296.6,232.2 L303.3,229.0 L309.7,225.7 L316.0,222.5 L322.0,219.3 L327.8,216.1 L333.5,212.8 L339.0,209.6 L344.4,206.4 L349.6,203.1 L354.6,199.9 L359.6,196.7 L364.4,193.5 L369.1,190.2 L373.7,187.0 L378.1,183.8 L382.5,180.5 L386.8,177.3 L391.0,174.1 L395.1,170.9 L399.2,167.6 L403.1,164.4 L407.0,161.2 L410.8,157.9 L414.6,154.7 L418.2,151.5 L421.9,148.3 L425.4,145.0 L428.9,141.8 L432.3,138.6 L435.7,135.3 L439.0,132.1 L442.3,128.9 L445.6,125.7 L448.7,122.4 L451.9,119.2 L455.0,116.0 L458.0,112.7 L461.0,109.5 L464.0,106.3 L466.9,103.1 L469.8,99.8 L472.7,96.6 L475.5,93.4 L478.3,90.1 L481.0,86.9 L483.7,83.7 L486.4,80.5 L489.0,77.2 L491.7,74.0" fill="none" stroke="#F4A261" stroke-width="2.4"/>
  <circle cx="463.987560439982" cy="106.2857142857143" r="4.5" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <path d="M-27.2,290.3 L8.2,287.1 L37.8,283.9 L63.6,280.6 L86.5,277.4 L107.2,274.2 L126.1,270.9 L143.7,267.7 L160.0,264.5 L175.4,261.3 L189.8,258.0 L203.5,254.8 L216.6,251.6 L229.0,248.3 L240.9,245.1 L252.4,241.9 L263.4,238.7 L274.0,235.4 L284.2,232.2 L294.1,229.0 L303.7,225.7 L313.0,222.5 L322.0,219.3 L330.8,216.1 L339.3,212.8 L347.7,209.6 L355.8,206.4 L363.7,203.1 L371.5,199.9 L379.0,196.7 L386.4,193.5 L393.7,190.2 L400.8,187.0 L407.8,183.8 L414.6,180.5 L421.3,177.3 L427.9,174.1 L434.4,170.9 L440.7,167.6 L447.0,164.4 L453.1,161.2 L459.1,157.9 L465.1,154.7 L470.9,151.5 L476.7,148.3 L482.4,145.0 L488.0,141.8 L493.5,138.6 L499.0,135.3 L504.3,132.1 L509.6,128.9 L514.8,125.7 L520.0,122.4 L525.1,119.2 L530.1,116.0 L535.1,112.7 L540.0,109.5 L544.9,106.3 L549.7,103.1 L554.4,99.8 L559.1,96.6 L563.7,93.4 L568.3,90.1 L572.9,86.9 L577.3,83.7 L581.8,80.5 L586.2,77.2 L590.5,74.0" fill="none" stroke="#C85B5B" stroke-width="2.4"/>
  <circle cx="544.8666105482438" cy="106.2857142857143" r="4.5" fill="#C85B5B" stroke="#C85B5B" stroke-width="1"/>
  <circle cx="322.0" cy="219.28571428571428" r="5.5" fill="currentColor" stroke="currentColor" stroke-width="1"/>
  <text x="312.0" y="237.28571428571428" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">measured 7.0 m/s at 50 m</text>
  <rect x="690" y="80" width="220" height="46" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3" opacity="0.55"/>
  <text x="710" y="109" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">α = 0.10</text>
  <text x="890" y="109" text-anchor="end" font-size="12.5" fill="currentColor" font-weight="700">7.64 m/s</text>
  <rect x="690" y="134" width="220" height="46" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3" opacity="0.55"/>
  <text x="710" y="163" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">α = 0.14</text>
  <text x="890" y="163" text-anchor="end" font-size="12.5" fill="currentColor" font-weight="700">7.91 m/s</text>
  <rect x="690" y="188" width="220" height="46" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3" opacity="0.55"/>
  <text x="710" y="217" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">α = 0.20</text>
  <text x="890" y="217" text-anchor="end" font-size="12.5" fill="currentColor" font-weight="700">8.34 m/s</text>
  <rect x="690" y="242" width="220" height="46" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3" opacity="0.55"/>
  <text x="710" y="271" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">α = 0.30</text>
  <text x="890" y="271" text-anchor="end" font-size="12.5" fill="currentColor" font-weight="700">9.10 m/s</text>
  <rect x="690" y="296" width="220" height="50" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="800.0" y="317" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">energy spread</text>
  <text x="800.0" y="335" text-anchor="middle" font-size="12" fill="currentColor">(9.11 / 7.64)³ = 1.70×</text>
  <rect x="110" y="360" width="560" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="390.0" y="381" text-anchor="middle" font-size="11.5" fill="currentColor">The exponent is an assumption unless two heights are</text>
  <text x="390.0" y="398" text-anchor="middle" font-size="11.5" fill="currentColor">measured. With one, the honest output is a range.</text>
</svg>

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

<svg viewBox="0 0 940 392" role="img" aria-label="How an error in the shear exponent propagates into energy. Extrapolating from 50 metres to a 120 metre hub, an exponent that is wrong by 0.02 moves the hub-height speed by about 1.8 percent and annual energy by about 5.4 percent; an error of 0.05 moves energy by roughly 14 percent. The extrapolation ratio matters as much as the error: the same exponent error costs three times as much energy at a 160 metre hub as at an 80 metre one." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Energy error against shear-exponent error, by extrapolation height</title>
  <desc>A chart with shear exponent error from 0 to 0.06 on the horizontal axis and resulting annual energy error on the vertical. Three curves show the effect for hub heights of 80, 120 and 160 metres, all extrapolated from a 50 metre measurement. At an exponent error of 0.02 the energy error is about 2.8 percent at 80 metres, 5.4 percent at 120 metres and 7.6 percent at 160 metres. The curves are near-linear and diverge with height, and a note records that this error is systematic, not random, so it does not average out across a portfolio.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="392"/>
  <defs><marker id="se-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">A 0.02 error in α is a 5% error in energy at a 120 m hub</text>
  <line x1="110" y1="282" x2="780" y2="282" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="110" y1="68" x2="110" y2="282" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="106" y1="282.0" x2="780" y2="282.0" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="100" y="286.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0%</text>
  <line x1="106" y1="242.0" x2="780" y2="242.0" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="100" y="246.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">5%</text>
  <line x1="106" y1="202.0" x2="780" y2="202.0" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="100" y="206.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">10%</text>
  <line x1="106" y1="162.0" x2="780" y2="162.0" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="100" y="166.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">15%</text>
  <line x1="106" y1="122.0" x2="780" y2="122.0" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="100" y="126.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">20%</text>
  <line x1="106" y1="82.0" x2="780" y2="82.0" stroke="currentColor" stroke-width="0.8" opacity="0.18"/>
  <text x="100" y="86.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">25%</text>
  <line x1="110.0" y1="282" x2="110.0" y2="287" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="110.0" y="302" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0.00</text>
  <line x1="333.33333333333337" y1="282" x2="333.33333333333337" y2="287" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="333.33333333333337" y="302" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0.02</text>
  <line x1="556.6666666666667" y1="282" x2="556.6666666666667" y2="287" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="556.6666666666667" y="302" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0.04</text>
  <line x1="780.0" y1="282" x2="780.0" y2="287" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="780.0" y="302" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0.06</text>
  <text x="780" y="60" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.8">error in the shear exponent α</text>
  <path d="M110.0,282.0 L121.2,280.9 L132.3,279.7 L143.5,278.6 L154.7,277.5 L165.8,276.3 L177.0,275.2 L188.2,274.1 L199.3,272.9 L210.5,271.8 L221.7,270.6 L232.8,269.5 L244.0,268.3 L255.2,267.2 L266.3,266.1 L277.5,264.9 L288.7,263.7 L299.8,262.6 L311.0,261.4 L322.2,260.3 L333.3,259.1 L344.5,258.0 L355.7,256.8 L366.8,255.6 L378.0,254.5 L389.2,253.3 L400.3,252.1 L411.5,251.0 L422.7,249.8 L433.8,248.6 L445.0,247.4 L456.2,246.3 L467.3,245.1 L478.5,243.9 L489.7,242.7 L500.8,241.5 L512.0,240.3 L523.2,239.2 L534.3,238.0 L545.5,236.8 L556.7,235.6 L567.8,234.4 L579.0,233.2 L590.2,232.0 L601.3,230.8 L612.5,229.6 L623.7,228.4 L634.8,227.2 L646.0,226.0 L657.2,224.8 L668.3,223.6 L679.5,222.4 L690.7,221.1 L701.8,219.9 L713.0,218.7 L724.2,217.5 L735.3,216.3 L746.5,215.0 L757.7,213.8 L768.8,212.6 L780.0,211.4" fill="none" stroke="#5BA8C8" stroke-width="2.6"/>
  <text x="788.0" y="215.3740976854457" text-anchor="start" font-size="11.5" fill="#2C6E8F" font-weight="700">80 m hub</text>
  <path d="M110.0,282.0 L121.2,279.9 L132.3,277.8 L143.5,275.7 L154.7,273.6 L165.8,271.4 L177.0,269.3 L188.2,267.2 L199.3,265.0 L210.5,262.9 L221.7,260.7 L232.8,258.6 L244.0,256.4 L255.2,254.2 L266.3,252.0 L277.5,249.9 L288.7,247.7 L299.8,245.5 L311.0,243.3 L322.2,241.1 L333.3,238.9 L344.5,236.6 L355.7,234.4 L366.8,232.2 L378.0,229.9 L389.2,227.7 L400.3,225.5 L411.5,223.2 L422.7,221.0 L433.8,218.7 L445.0,216.4 L456.2,214.1 L467.3,211.9 L478.5,209.6 L489.7,207.3 L500.8,205.0 L512.0,202.7 L523.2,200.4 L534.3,198.0 L545.5,195.7 L556.7,193.4 L567.8,191.0 L579.0,188.7 L590.2,186.4 L601.3,184.0 L612.5,181.6 L623.7,179.3 L634.8,176.9 L646.0,174.5 L657.2,172.1 L668.3,169.7 L679.5,167.3 L690.7,164.9 L701.8,162.5 L713.0,160.1 L724.2,157.7 L735.3,155.2 L746.5,152.8 L757.7,150.4 L768.8,147.9 L780.0,145.5" fill="none" stroke="#3D8B5F" stroke-width="2.6"/>
  <text x="788.0" y="149.45637821182834" text-anchor="start" font-size="11.5" fill="#1F5C3A" font-weight="700">120 m hub</text>
  <path d="M110.0,282.0 L121.2,279.2 L132.3,276.4 L143.5,273.6 L154.7,270.8 L165.8,267.9 L177.0,265.1 L188.2,262.2 L199.3,259.4 L210.5,256.5 L221.7,253.6 L232.8,250.7 L244.0,247.8 L255.2,244.9 L266.3,241.9 L277.5,239.0 L288.7,236.1 L299.8,233.1 L311.0,230.1 L322.2,227.2 L333.3,224.2 L344.5,221.2 L355.7,218.2 L366.8,215.1 L378.0,212.1 L389.2,209.1 L400.3,206.0 L411.5,203.0 L422.7,199.9 L433.8,196.8 L445.0,193.7 L456.2,190.6 L467.3,187.5 L478.5,184.4 L489.7,181.2 L500.8,178.1 L512.0,174.9 L523.2,171.7 L534.3,168.6 L545.5,165.4 L556.7,162.2 L567.8,159.0 L579.0,155.7 L590.2,152.5 L601.3,149.2 L612.5,146.0 L623.7,142.7 L634.8,139.4 L646.0,136.1 L657.2,132.8 L668.3,129.5 L679.5,126.2 L690.7,122.8 L701.8,119.5 L713.0,116.1 L724.2,112.7 L735.3,109.4 L746.5,106.0 L757.7,102.5 L768.8,99.1 L780.0,95.7" fill="none" stroke="#F4A261" stroke-width="2.6"/>
  <text x="788.0" y="99.68194514672746" text-anchor="start" font-size="11.5" fill="#7A4A1A" font-weight="700">160 m hub</text>
  <line x1="333.33333333333337" y1="68" x2="333.33333333333337" y2="282" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.5"/>
  <text x="341.33333333333337" y="84" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">a typical α uncertainty</text>
  <rect x="110" y="316" width="400" height="48" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="310.0" y="337" text-anchor="middle" font-size="11.5" fill="currentColor">The error is systematic, not random —</text>
  <text x="310.0" y="354" text-anchor="middle" font-size="11.5" fill="currentColor">it does not average out across a portfolio</text>
  <rect x="530" y="316" width="380" height="48" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="720.0" y="337" text-anchor="middle" font-size="11.5" fill="currentColor">Two measurement heights remove the</text>
  <text x="720.0" y="354" text-anchor="middle" font-size="11.5" fill="currentColor">assumption entirely; nothing else does</text>
</svg>

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


## Frequently asked questions

### Can the shear exponent be negative?

Physically, yes — a low-level jet or a strongly stable nocturnal boundary layer can put more wind at
50 metres than at 80 — but a negative exponent derived from a routine pair of anemometers is far
more often a sensor fault, an icing event or a mast-shadow artefact. Treat a negative α as a signal
to inspect rather than a value to extrapolate with, and clamp the production path to a physically
defensible band.

### Should shear be computed per hour or per year?

Per hour, then summarised. A single annual exponent hides the diurnal cycle, where nights are
typically far more sheared than days, and hub-height energy is sensitive to that cycle because power
follows the cube of speed. Compute hourly, extrapolate hourly, and report the distribution of α
alongside the mean so a reviewer can see how much of the year the mean actually describes.

### What if only one measurement height exists?

Then the exponent is an assumption, and the honest output is a range rather than a number. A
terrain-and-roughness table gives a defensible central value — near 0.14 for open country, higher
for forest — but an error of 0.02 in α moves hub-height energy by roughly 5 percent at a 120 metre
hub, which is larger than most of the uncertainties the yield report quotes. The range belongs in
the deliverable.

## Related

- [Wind Speed & Direction Modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/) — parent workflow for the hub-height field this exponent scales
- [Temporal Data Aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) — reduce hourly speeds to the annual layers shear consumes
- [Terrain Shadow Analysis Pipelines](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/) — terrain masking and complex-relief boundary handling
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — projected-CRS enforcement before any raster math
