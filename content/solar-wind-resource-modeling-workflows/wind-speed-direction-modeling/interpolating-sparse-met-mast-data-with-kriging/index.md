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
  <rect class="svg-bg" x="0" y="0" width="900" height="430"/>
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

<svg viewBox="0 0 940 400" role="img" aria-label="An experimental variogram and the spherical model fitted to it, for hub-height wind speed across 14 met masts. Semivariance rises from a nugget of 0.15 at zero separation to a sill of 1.05 at a range of 12 kilometres, beyond which pairs of masts carry no mutual information. The three parameters are what kriging actually uses: the nugget is measurement noise plus micro-scale variation, the range is how far a mast can speak for, and the sill is the field variance." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Nugget, range and sill — the three numbers kriging runs on</title>
  <desc>A variogram plot with lag distance from 0 to 25 kilometres on the horizontal axis and semivariance from 0 to 1.3 on the vertical. Experimental points computed from binned mast pairs rise from about 0.2 at short lags to a plateau near 1.05 beyond 12 kilometres. A fitted spherical model runs through them, with the nugget of 0.15 marked at the intercept, the range of 12 kilometres marked where the model reaches its plateau, and the sill of 1.05 marked as the plateau value. Annotations explain what each parameter means for interpolation.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="vg-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">14 met masts: the experimental variogram and its spherical fit</text>
  <line x1="110" y1="292" x2="700" y2="292" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="110" y1="68" x2="110" y2="292" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="106" y1="292.0" x2="700" y2="292.0" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="296.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0.0</text>
  <line x1="106" y1="208.15384615384616" x2="700" y2="208.15384615384616" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="212.15384615384616" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0.5</text>
  <line x1="106" y1="124.30769230769232" x2="700" y2="124.30769230769232" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="128.30769230769232" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">1.0</text>
  <line x1="110.0" y1="292" x2="110.0" y2="297" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="110.0" y="312" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0</text>
  <line x1="228.0" y1="292" x2="228.0" y2="297" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="228.0" y="312" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">5</text>
  <line x1="346.0" y1="292" x2="346.0" y2="297" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="346.0" y="312" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">10</text>
  <line x1="464.0" y1="292" x2="464.0" y2="297" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="464.0" y="312" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">15</text>
  <line x1="582.0" y1="292" x2="582.0" y2="297" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="582.0" y="312" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">20</text>
  <line x1="700.0" y1="292" x2="700.0" y2="297" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="700.0" y="312" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">25</text>
  <text x="700" y="334" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.8">lag distance, km</text>
  <text x="100" y="60" text-anchor="start" font-size="11" fill="currentColor" opacity="0.8">semivariance</text>
  <path d="M110.0,266.8 L112.4,265.0 L114.7,263.1 L117.1,261.2 L119.4,259.3 L121.8,257.4 L124.2,255.5 L126.5,253.7 L128.9,251.8 L131.2,249.9 L133.6,248.0 L136.0,246.2 L138.3,244.3 L140.7,242.4 L143.0,240.6 L145.4,238.7 L147.8,236.8 L150.1,235.0 L152.5,233.1 L154.8,231.3 L157.2,229.5 L159.6,227.6 L161.9,225.8 L164.3,224.0 L166.6,222.2 L169.0,220.4 L171.4,218.6 L173.7,216.8 L176.1,215.0 L178.4,213.2 L180.8,211.4 L183.2,209.7 L185.5,207.9 L187.9,206.2 L190.2,204.4 L192.6,202.7 L195.0,201.0 L197.3,199.3 L199.7,197.6 L202.0,195.9 L204.4,194.2 L206.8,192.5 L209.1,190.8 L211.5,189.2 L213.8,187.6 L216.2,185.9 L218.6,184.3 L220.9,182.7 L223.3,181.1 L225.6,179.5 L228.0,178.0 L230.4,176.4 L232.7,174.9 L235.1,173.4 L237.4,171.8 L239.8,170.4 L242.2,168.9 L244.5,167.4 L246.9,165.9 L249.2,164.5 L251.6,163.1 L254.0,161.7 L256.3,160.3 L258.7,158.9 L261.0,157.6 L263.4,156.2 L265.8,154.9 L268.1,153.6 L270.5,152.3 L272.8,151.0 L275.2,149.8 L277.6,148.5 L279.9,147.3 L282.3,146.1 L284.6,144.9 L287.0,143.8 L289.4,142.6 L291.7,141.5 L294.1,140.4 L296.4,139.3 L298.8,138.3 L301.2,137.2 L303.5,136.2 L305.9,135.2 L308.2,134.3 L310.6,133.3 L313.0,132.4 L315.3,131.5 L317.7,130.6 L320.0,129.7 L322.4,128.9 L324.8,128.1 L327.1,127.3 L329.5,126.5 L331.8,125.8 L334.2,125.1 L336.6,124.4 L338.9,123.7 L341.3,123.1 L343.6,122.5 L346.0,121.9 L348.4,121.3 L350.7,120.8 L353.1,120.3 L355.4,119.8 L357.8,119.3 L360.2,118.9 L362.5,118.5 L364.9,118.1 L367.2,117.8 L369.6,117.5 L372.0,117.2 L374.3,116.9 L376.7,116.7 L379.0,116.5 L381.4,116.3 L383.8,116.2 L386.1,116.1 L388.5,116.0 L390.8,115.9 L393.2,115.9 L395.6,115.9 L397.9,115.9 L400.3,115.9 L402.6,115.9 L405.0,115.9 L407.4,115.9 L409.7,115.9 L412.1,115.9 L414.4,115.9 L416.8,115.9 L419.2,115.9 L421.5,115.9 L423.9,115.9 L426.2,115.9 L428.6,115.9 L431.0,115.9 L433.3,115.9 L435.7,115.9 L438.0,115.9 L440.4,115.9 L442.8,115.9 L445.1,115.9 L447.5,115.9 L449.8,115.9 L452.2,115.9 L454.6,115.9 L456.9,115.9 L459.3,115.9 L461.6,115.9 L464.0,115.9 L466.4,115.9 L468.7,115.9 L471.1,115.9 L473.4,115.9 L475.8,115.9 L478.2,115.9 L480.5,115.9 L482.9,115.9 L485.2,115.9 L487.6,115.9 L490.0,115.9 L492.3,115.9 L494.7,115.9 L497.0,115.9 L499.4,115.9 L501.8,115.9 L504.1,115.9 L506.5,115.9 L508.8,115.9 L511.2,115.9 L513.6,115.9 L515.9,115.9 L518.3,115.9 L520.6,115.9 L523.0,115.9 L525.4,115.9 L527.7,115.9 L530.1,115.9 L532.4,115.9 L534.8,115.9 L537.2,115.9 L539.5,115.9 L541.9,115.9 L544.2,115.9 L546.6,115.9 L549.0,115.9 L551.3,115.9 L553.7,115.9 L556.0,115.9 L558.4,115.9 L560.8,115.9 L563.1,115.9 L565.5,115.9 L567.8,115.9 L570.2,115.9 L572.6,115.9 L574.9,115.9 L577.3,115.9 L579.6,115.9 L582.0,115.9 L584.4,115.9 L586.7,115.9 L589.1,115.9 L591.4,115.9 L593.8,115.9 L596.2,115.9 L598.5,115.9 L600.9,115.9 L603.2,115.9 L605.6,115.9 L608.0,115.9 L610.3,115.9 L612.7,115.9 L615.0,115.9 L617.4,115.9 L619.8,115.9 L622.1,115.9 L624.5,115.9 L626.8,115.9 L629.2,115.9 L631.6,115.9 L633.9,115.9 L636.3,115.9 L638.6,115.9 L641.0,115.9 L643.4,115.9 L645.7,115.9 L648.1,115.9 L650.4,115.9 L652.8,115.9 L655.2,115.9 L657.5,115.9 L659.9,115.9 L662.2,115.9 L664.6,115.9 L667.0,115.9 L669.3,115.9 L671.7,115.9 L674.0,115.9 L676.4,115.9 L678.8,115.9 L681.1,115.9 L683.5,115.9 L685.8,115.9 L688.2,115.9 L690.6,115.9 L692.9,115.9 L695.3,115.9 L697.6,115.9 L700.0,115.9" fill="none" stroke="#5BA8C8" stroke-width="2.6"/>
  <circle cx="138.32" cy="240.01538461538462" r="4.5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="176.07999999999998" cy="214.86153846153846" r="4.5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="206.76" cy="188.03076923076924" r="4.5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="249.24" cy="167.90769230769232" r="4.5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="289.36" cy="144.43076923076924" r="4.5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="331.84000000000003" cy="129.33846153846156" r="4.5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="374.32" cy="120.95384615384614" r="4.5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="435.68" cy="109.21538461538461" r="4.5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="497.03999999999996" cy="122.63076923076923" r="4.5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="560.76" cy="112.56923076923076" r="4.5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <circle cx="643.36" cy="119.27692307692308" r="4.5" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <line x1="110" y1="266.84615384615387" x2="157.2" y2="266.84615384615387" stroke="#F4A261" stroke-width="1.6"/>
  <text x="166.64" y="270.84615384615387" text-anchor="start" font-size="11" fill="#7A4A1A" font-weight="700">nugget 0.15</text>
  <line x1="393.2" y1="292.0" x2="393.2" y2="115.9230769230769" stroke="#F4A261" stroke-width="1.4" stroke-dasharray="5 4"/>
  <text x="401.2" y="233.30769230769232" text-anchor="start" font-size="11" fill="#7A4A1A" font-weight="700">range 12 km</text>
  <line x1="110" y1="115.9230769230769" x2="700" y2="115.9230769230769" stroke="#F4A261" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.7"/>
  <text x="694" y="107.9230769230769" text-anchor="end" font-size="11" fill="#7A4A1A" font-weight="700">sill 1.05</text>
  <rect x="720" y="78" width="196" height="65" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="818.0" y="99" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">nugget</text>
  <text x="818.0" y="116" text-anchor="middle" font-size="11" fill="currentColor">sensor noise +</text>
  <text x="818.0" y="133" text-anchor="middle" font-size="11" fill="currentColor">micro-scale variation</text>
  <rect x="720" y="170" width="196" height="65" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="818.0" y="191" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">range</text>
  <text x="818.0" y="208" text-anchor="middle" font-size="11" fill="currentColor">how far one mast</text>
  <text x="818.0" y="225" text-anchor="middle" font-size="11" fill="currentColor">can speak for</text>
  <rect x="720" y="262" width="196" height="48" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="818.0" y="283" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">sill</text>
  <text x="818.0" y="300" text-anchor="middle" font-size="11" fill="currentColor">the field variance</text>
  <rect x="110" y="336" width="590" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="405.0" y="357" text-anchor="middle" font-size="11.5" fill="currentColor">A model fitted by eye is still a model — record the three</text>
  <text x="405.0" y="374" text-anchor="middle" font-size="11.5" fill="currentColor">parameters with the surface, or it cannot be challenged.</text>
</svg>

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

<svg viewBox="0 0 940 412" role="img" aria-label="Kriging returns two surfaces and the second one is the honest part. Prediction variance is near the nugget at each mast and grows with distance from the network, exceeding the sill wherever the interpolation is effectively extrapolating. Publishing only the predicted wind-speed surface hides that a turbine position 18 kilometres from the nearest mast carries roughly six times the uncertainty of one sited between two masts." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>The prediction surface and the variance surface, side by side</title>
  <desc>Two maps of the same area. The left map is the predicted hub-height wind speed, a smooth field with fourteen mast positions marked. The right map is the kriging variance over the same extent: low near each mast, rising through the gaps between them, and highest in the north-east corner where no mast lies within the variogram range. Two candidate turbine positions are marked on both maps: one between two masts with a variance near 0.2, and one 18 kilometres from the nearest mast with a variance near 1.2.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="412"/>
  <defs><marker id="kv-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Prediction and variance are two outputs of one solve</text>
  <text x="240.0" y="66" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">predicted hub-height wind speed</text>
  <rect x="40" y="76" width="400" height="240" rx="6" fill="none" stroke="#5BA8C8" stroke-width="1.3"/>
  <path d="M46,102 C170,88 310,120 434,98" fill="none" stroke="#5BA8C8" stroke-width="1.4" opacity="0.35"/>
  <path d="M46,132 C170,118 310,150 434,128" fill="none" stroke="#5BA8C8" stroke-width="1.4" opacity="0.35"/>
  <path d="M46,162 C170,148 310,180 434,158" fill="none" stroke="#5BA8C8" stroke-width="1.4" opacity="0.35"/>
  <path d="M46,192 C170,178 310,210 434,188" fill="none" stroke="#5BA8C8" stroke-width="1.4" opacity="0.35"/>
  <path d="M46,222 C170,208 310,240 434,218" fill="none" stroke="#5BA8C8" stroke-width="1.4" opacity="0.35"/>
  <path d="M46,252 C170,238 310,270 434,248" fill="none" stroke="#5BA8C8" stroke-width="1.4" opacity="0.35"/>
  <path d="M46,282 C170,268 310,300 434,278" fill="none" stroke="#5BA8C8" stroke-width="1.4" opacity="0.35"/>
  <text x="130" y="240" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">7.2 m/s</text>
  <text x="340" y="130" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">8.6 m/s</text>
  <circle cx="96.0" cy="263.20000000000005" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="168.0" cy="280.0" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="136.0" cy="200.8" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="216.0" cy="229.6" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="88.0" cy="167.2" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="184.0" cy="148.0" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="272.0" cy="258.4" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="248.0" cy="176.8" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="312.0" cy="205.60000000000002" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="128.0" cy="114.4" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="224.0" cy="104.8" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="288.0" cy="133.6" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="160.0" cy="234.39999999999998" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="240.0" cy="287.2" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="200.0" cy="244.0" r="7" fill="none" stroke="#3D8B5F" stroke-width="2"/>
  <circle cx="384.0" cy="100.0" r="7" fill="none" stroke="#C85B5B" stroke-width="2"/>
  <text x="700.0" y="66" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">kriging variance</text>
  <rect x="500" y="76" width="400" height="240" rx="6" fill="none" stroke="#F4A261" stroke-width="1.3"/>
  <path d="M900,76 L900,316.0 L900.0,76 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.1"/>
  <path d="M900,76 L900,263.20000000000005 L812.0,76 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.16"/>
  <path d="M900,76 L900,210.4 L724.0,76 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.26"/>
  <path d="M900,76 L900,157.60000000000002 L636.0,76 Z" fill="#FFE3BE" stroke="none" stroke-width="1.4" opacity="0.4"/>
  <text x="816" y="116" text-anchor="middle" font-size="11" fill="#7A4A1A" font-weight="700">no mast within</text>
  <text x="816" y="134" text-anchor="middle" font-size="11" fill="#7A4A1A" font-weight="700">the 12 km range</text>
  <circle cx="556.0" cy="263.20000000000005" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="628.0" cy="280.0" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="596.0" cy="200.8" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="676.0" cy="229.6" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="548.0" cy="167.2" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="644.0" cy="148.0" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="732.0" cy="258.4" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="708.0" cy="176.8" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="772.0" cy="205.60000000000002" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="588.0" cy="114.4" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="684.0" cy="104.8" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="748.0" cy="133.6" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="620.0" cy="234.39999999999998" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="700.0" cy="287.2" r="3.4" fill="currentColor" stroke="currentColor" stroke-width="0.8"/>
  <circle cx="660.0" cy="244.0" r="7" fill="none" stroke="#3D8B5F" stroke-width="2"/>
  <circle cx="844.0" cy="100.0" r="7" fill="none" stroke="#C85B5B" stroke-width="2"/>
  <rect x="40" y="336" width="400" height="48" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="240.0" y="357" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">turbine A — between two masts</text>
  <text x="240.0" y="374" text-anchor="middle" font-size="11.5" fill="currentColor">variance 0.19 · ±0.4 m/s at 95%</text>
  <rect x="500" y="336" width="400" height="48" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.5"/>
  <text x="700.0" y="357" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">turbine B — 18 km from the nearest mast</text>
  <text x="700.0" y="374" text-anchor="middle" font-size="11.5" fill="currentColor">variance 1.21 · ±1.1 m/s at 95%</text>
</svg>

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
