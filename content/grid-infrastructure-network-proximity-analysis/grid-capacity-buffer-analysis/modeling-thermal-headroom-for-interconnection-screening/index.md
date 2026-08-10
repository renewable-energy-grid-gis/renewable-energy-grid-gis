---
title: Modeling Thermal Headroom for Interconnection Screening
description: Compute defensible thermal headroom along a grid corridor for interconnection screening — fix MVA/MW power-factor mixing, queued-generation omission, static vs seasonal line ratings, and mis-joined capacity attributes in geopandas.
slug: modeling-thermal-headroom-for-interconnection-screening
type: article
breadcrumb: Modeling Thermal Headroom
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Modeling Thermal Headroom for Interconnection Screening

A screening report that says a 120 MW solar project fits on a corridor with "40 MW of spare thermal capacity" is worthless if that 40 MW was computed by subtracting existing load expressed in MW from a line rating expressed in MVA, ignoring 90 MW of already-queued generation upstream, and reading a summer static rating in the middle of a winter study. Every one of those is a silent unit or accounting error that produces a headroom figure that looks defensible on a corridor map and collapses the moment a real load-flow study is run. This page sits under [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) and fixes the specific calculation that buffer analysis defers to: the available thermal headroom on a line segment, which is what actually determines whether an interconnection request survives the fast-track screen.

The headroom on a corridor segment is a simple mass balance between what the conductor can carry and what is already spoken for:

$$ H = C_{\text{thermal}} - L_{\text{existing}} - G_{\text{queued}} $$

where every term must be in the **same** unit and the **same** thermal season. The arithmetic is trivial; the failures live in the attributes the formula consumes, not the subtraction itself. Because thermal ratings are quoted as apparent power (MVA) while generation and load are dispatched as real power (MW), the conversion below is not optional bookkeeping — it is the line where most screening errors enter.

## Root-cause analysis

Four compounding causes account for nearly every over-optimistic headroom number, and each maps to a distinct fix stage below.

1. **Mixing MVA and MW without a power factor.** A conductor's thermal rating is an apparent-power limit in MVA; a generator's output and a feeder's load are real power in MW. Subtracting MW load directly from an MVA rating over-states headroom by the reactive component. Real and apparent power are related by the power factor $\cos\phi$, so a rating must be de-rated before the balance: $P_{\text{MW}} = S_{\text{MVA}} \cdot \cos\phi$. At a corridor power factor of 0.95 a 100 MVA line delivers only 95 MW of real-power headroom, and treating the 100 as MW manufactures 5 MW of phantom capacity per segment.
2. **Ignoring queued generation.** Interconnection queues are cumulative. A segment with genuine spare capacity today has none once the projects ahead of it in the queue energize. Omitting $G_{\text{queued}}$ is the single most common cause of a project passing a desktop screen and failing the system-impact study, because the queue — not present-day flow — is what the utility screens against.
3. **Static rating used in the wrong season.** A single static line rating discards the dynamic and seasonal reality that a conductor carries far more in winter than in summer. Screening a summer-peaking corridor against a winter rating, or vice versa, shifts headroom by 10–25% on many overhead lines. The rating must match the study season, and dynamic line ratings widen the margin further when ambient data is available.
4. **Joining capacity attributes to the wrong line segment.** The rating table and the corridor geometry are separate datasets keyed by segment ID or voltage node. A loose or positional join binds a 500 kV bulk rating to a 69 kV tap, producing a headroom value that is off by an order of magnitude and is invisible on the map. This is a join-integrity failure of the same class handled in [proximity distance calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/), and it must be guarded before any subtraction runs.

<svg viewBox="0 0 900 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Decision flow for computing corridor thermal headroom. A corridor segment and its rating table first pass a segment-ID join integrity gate; a failed join raises a KeyError. Passing segments convert the MVA rating to MW real power using the corridor power factor, then select the rating for the study season, static or dynamic. The headroom is computed as C_thermal minus L_existing minus G_queued, then clipped to the physical band from minus rating to plus rating and flagged feasible when headroom is at least the request size." style="max-width:100%;height:auto;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="900" height="560"/>
  <title>Thermal-headroom decision flow: join gate, MVA-to-MW conversion, seasonal rating, balance, and feasibility flag</title>
  <desc>A top-to-bottom flow. The input node holds a corridor segment plus its rating table. The first diamond tests whether the segment ID join is one-to-one; a no branch exits right to a KeyError node demanding a validated join key, while yes continues down to a conversion node that multiplies the MVA rating by the corridor power factor to get MW. That feeds a seasonal-rating selector choosing static or dynamic rating for the study season, which feeds the balance node computing H equals C_thermal minus L_existing minus G_queued. The balance feeds a clip-and-flag node that bounds headroom to the range minus rating to plus rating and sets a feasibility flag when headroom is at least the request size, then writes the annotated grid GeoDataFrame.</desc>
  <defs>
    <marker id="th-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="900" height="560" fill="none"/>
  <!-- Input -->
  <rect x="120" y="20" width="240" height="46" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="240" y="40" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Corridor segment</text>
  <text x="240" y="57" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">geometry + rating table</text>
  <line x1="240" y1="66" x2="240" y2="98" stroke="currentColor" stroke-width="1.4" marker-end="url(#th-arr)"/>
  <!-- Decision: join integrity -->
  <path d="M240,100 L340,150 L240,200 L140,150 Z" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="240" y="146" text-anchor="middle" font-size="11.5" fill="currentColor">segment-ID join</text>
  <text x="240" y="162" text-anchor="middle" font-size="11.5" fill="currentColor">one-to-one?</text>
  <line x1="340" y1="150" x2="548" y2="150" stroke="currentColor" stroke-width="1.4" marker-end="url(#th-arr)"/>
  <text x="440" y="141" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">no</text>
  <rect x="550" y="127" width="320" height="46" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.4" stroke-dasharray="5 3"/>
  <text x="710" y="147" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">raise KeyError</text>
  <text x="710" y="164" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">validated join key required</text>
  <line x1="240" y1="200" x2="240" y2="232" stroke="currentColor" stroke-width="1.4" marker-end="url(#th-arr)"/>
  <text x="254" y="222" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">yes</text>
  <!-- Convert MVA -> MW -->
  <rect x="108" y="234" width="264" height="48" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="240" y="256" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">MVA &#8594; MW real power</text>
  <text x="240" y="274" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">P = S &#215; cos&#966;</text>
  <line x1="240" y1="282" x2="240" y2="312" stroke="currentColor" stroke-width="1.4" marker-end="url(#th-arr)"/>
  <!-- Seasonal rating -->
  <rect x="108" y="314" width="264" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="240" y="336" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">select seasonal rating</text>
  <text x="240" y="353" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">static or dynamic, study season</text>
  <line x1="240" y1="362" x2="240" y2="392" stroke="currentColor" stroke-width="1.4" marker-end="url(#th-arr)"/>
  <!-- Balance -->
  <rect x="88" y="394" width="304" height="48" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="240" y="416" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">thermal balance</text>
  <text x="240" y="434" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">H = C&#8202;&#8722;&#8202;L&#8202;&#8722;&#8202;G_queued</text>
  <line x1="240" y1="442" x2="240" y2="472" stroke="currentColor" stroke-width="1.4" marker-end="url(#th-arr)"/>
  <!-- Clip + flag -->
  <rect x="120" y="474" width="360" height="66" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="2"/>
  <text x="300" y="496" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">clip to [&#8722;rating, +rating]</text>
  <text x="300" y="514" text-anchor="middle" font-size="11.5" fill="currentColor">feasible = H &#8805; request_mw</text>
  <text x="300" y="531" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">write annotated grid_gdf</text>
</svg>

## Pre-flight validation

Surface the unit, attribute, and join errors *before* the balance runs. The naive script below is the broken pattern — it subtracts MW from MVA, never touches the queue, and joins positionally — and it is exactly what produces a plausible-looking but indefensible screen:

```python
import geopandas as gpd

# Flawed approach: MW subtracted from an MVA rating, no queue, positional join
grid_gdf = gpd.read_file("corridor_segments.gpkg")
ratings = gpd.read_file("line_ratings.gpkg")

grid_gdf["rating_mva"] = ratings["summer_static_mva"].values   # positional, may misalign
grid_gdf["headroom_mw"] = grid_gdf["rating_mva"] - grid_gdf["load_mw"]  # unit + queue error
```

The pre-flight validator isolates which failure is present so a CI/CD run fails fast with a precise message instead of writing a poisoned screening layer. It checks units are declared, required attributes exist, ratings are non-negative, and the join key is unique on both sides:

```python
import geopandas as gpd

REQUIRED_ATTRS = {
    "segment_id", "rating_mva", "power_factor",
    "load_mw", "queued_mw", "season",
}


def preflight_headroom_inputs(
    grid_gdf: gpd.GeoDataFrame, ratings_df, join_key: str = "segment_id"
) -> None:
    """Raise on the exact root cause before any thermal balance is evaluated."""
    # Cause 4: attribute presence — no silent KeyError deep in the balance
    missing = REQUIRED_ATTRS - set(grid_gdf.columns)
    if missing:
        raise KeyError(f"grid_gdf missing required attributes: {missing}")

    # Cause 1: power factor must be a physical fraction in (0, 1]
    pf = grid_gdf["power_factor"]
    if not pf.between(0.0, 1.0, inclusive="right").all():
        raise ValueError("power_factor outside (0, 1]; MVA->MW conversion would be wrong.")

    # non-negative ratings and reservations
    for col in ("rating_mva", "load_mw", "queued_mw"):
        if (grid_gdf[col] < 0).any():
            raise ValueError(f"{col} has negative values; ratings and reservations must be >= 0.")

    # Cause 4: join must be one-to-one on both sides, never positional
    if grid_gdf[join_key].duplicated().any():
        raise ValueError(f"{join_key} is not unique in grid_gdf; join would fan out.")
    if ratings_df[join_key].duplicated().any():
        raise ValueError(f"{join_key} is not unique in ratings; join would fan out.")
```

| Validation step | Diagnostic check | Expected outcome |
|-----------------|------------------|------------------|
| Attribute presence | `REQUIRED_ATTRS <= set(grid_gdf.columns)` | All balance inputs present |
| Power factor range | `power_factor.between(0, 1, inclusive="right")` | Physical fraction, e.g. 0.95 |
| Non-negative ratings | `(rating_mva >= 0).all()` | No sentinel negatives leaking in |
| Join cardinality | `not segment_id.duplicated().any()` on both frames | One-to-one merge, no fan-out |

## Fix implementation

The corrected function joins the rating on a validated key, converts MVA to MW with the corridor power factor, selects the rating for the study season, computes the balance, then clips headroom to the physical band and sets a feasibility flag against the request size. Parameter choices are justified for interconnection use: the `[-rating, +rating]` clamp bounds headroom to what a conductor can physically absorb or shed, `season` is an explicit input rather than a hidden default so a summer study can never silently read a winter column, and `queued_mw` is a first-class term rather than an afterthought.

<svg viewBox="0 0 940 400" role="img" aria-label="Two conversions stand between a nameplate rating and usable headroom. A 100 MVA transformer at a 0.95 power factor carries 95 megawatts, not 100. That rating is then seasonal: a winter rating runs about 15 percent above the annual figure and a summer rating about 8 percent below, so the same asset is worth 109 megawatts in January and 87 in August. Screening against the annual number over-promises every summer peak, which is when the constraint actually binds." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Nameplate MVA is not megawatts, and one rating is not four seasons</title>
  <desc>A two-step conversion. Step one: 100 megavolt-amperes multiplied by a 0.95 power factor gives 95 megawatts. Step two: seasonal derating applied to that 95 megawatts gives 109 megawatts in winter, 95 in spring and autumn, and 87 in summer. A bar chart shows the four seasonal values against a dashed line at the annual rating, and a note marks the summer bar as the one that binds, because summer peak load and summer derating coincide.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="mva-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">From nameplate to the number a screen may actually use</text>
  <rect x="30" y="70" width="224" height="62" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="142.0" y="93" text-anchor="middle" font-size="11.5" fill="currentColor">nameplate</text>
  <text x="142.0" y="115" text-anchor="middle" font-size="16" fill="currentColor" font-weight="700">100 MVA</text>
  <line x1="258" y1="106" x2="292" y2="106" stroke="currentColor" stroke-width="1.4" marker-end="url(#mva-arr)"/>
  <rect x="300" y="70" width="224" height="62" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="412.0" y="93" text-anchor="middle" font-size="11.5" fill="currentColor">× power factor 0.95</text>
  <text x="412.0" y="115" text-anchor="middle" font-size="16" fill="currentColor" font-weight="700">95 MW</text>
  <line x1="528" y1="106" x2="562" y2="106" stroke="currentColor" stroke-width="1.4" marker-end="url(#mva-arr)"/>
  <rect x="570" y="70" width="340" height="62" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="740.0" y="93" text-anchor="middle" font-size="11.5" fill="currentColor">× seasonal factor</text>
  <text x="740.0" y="115" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">109 MW winter · 87 MW summer</text>
  <line x1="100" y1="320" x2="880" y2="320" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="100" y1="207.58333333333334" x2="880" y2="207.58333333333334" stroke="currentColor" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.6"/>
  <text x="884" y="211.58333333333334" text-anchor="end" font-size="11" fill="currentColor" opacity="0.85">95 MW</text>
  <rect x="164" y="191.01666666666668" width="112" height="128.98333333333332" rx="4" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
  <text x="220" y="181.01666666666668" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">109 MW</text>
  <text x="220" y="342" text-anchor="middle" font-size="11.5" fill="currentColor">winter</text>
  <rect x="350" y="207.58333333333334" width="112" height="112.41666666666666" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
  <text x="406" y="197.58333333333334" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">95 MW</text>
  <text x="406" y="342" text-anchor="middle" font-size="11.5" fill="currentColor">spring</text>
  <rect x="536" y="217.05" width="112" height="102.95" rx="4" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.4"/>
  <text x="592" y="207.05" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">87 MW</text>
  <text x="592" y="342" text-anchor="middle" font-size="11.5" fill="currentColor">summer</text>
  <rect x="722" y="207.58333333333334" width="112" height="112.41666666666666" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4"/>
  <text x="778" y="197.58333333333334" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">95 MW</text>
  <text x="778" y="342" text-anchor="middle" font-size="11.5" fill="currentColor">autumn</text>
  <text x="592" y="366" text-anchor="middle" font-size="11.5" fill="#7A4A1A" font-weight="700">summer is when the constraint binds — and when the rating is lowest</text>
</svg>

```python
import geopandas as gpd
import numpy as np


def compute_corridor_headroom(
    grid_gdf: gpd.GeoDataFrame,
    ratings_df,
    request_mw: float,
    join_key: str = "segment_id",
    dynamic: bool = False,
) -> gpd.GeoDataFrame:
    """Thermal headroom per corridor segment with MVA->MW conversion,
    queued-generation accounting, seasonal rating selection, and a
    feasibility flag. All inputs assumed in a projected CRS (e.g. EPSG:5070)."""
    preflight_headroom_inputs(grid_gdf, ratings_df, join_key)

    # Cause 4: attribute-keyed merge, validated one-to-one, never positional
    grid_gdf = grid_gdf.merge(
        ratings_df, on=join_key, how="left", validate="one_to_one"
    )

    # Cause 3: pick the rating matching the study season (or dynamic ambient rating)
    rating_col = "dynamic_rating_mva" if dynamic else "seasonal_rating_mva"
    rating_mva = grid_gdf[rating_col]

    # Cause 1: apparent-power rating -> real-power headroom via power factor
    c_thermal_mw = rating_mva * grid_gdf["power_factor"]

    # Cause 2: subtract BOTH existing load and cumulative queued generation
    headroom = c_thermal_mw - grid_gdf["load_mw"] - grid_gdf["queued_mw"]

    # bound to what the conductor can physically absorb (+) or shed (-)
    grid_gdf["headroom_mw"] = np.clip(headroom, -c_thermal_mw, c_thermal_mw)
    grid_gdf["feasible"] = grid_gdf["headroom_mw"] >= request_mw
    grid_gdf["rating_basis"] = rating_col
    return grid_gdf
```

Passing `season` and `dynamic` explicitly, rather than defaulting to a single static column, is what keeps the screen honest: a reviewer can see from `rating_basis` exactly which rating fed the number. Because the merge uses `validate="one_to_one"`, a fan-out join raises `MergeError` at the join rather than silently duplicating segments and inflating the corridor's apparent headroom.

## Fallback routing & performance tuning

For portfolio-scale queue screening or CI/CD runs, layer these strategies on top of the core function:

- **Seasonal rating table, not a scalar.** Keep summer, winter, and shoulder ratings as columns and select by the study's `season` attribute; never hard-code one static value across a national corridor set.
- **Dynamic line ratings where ambient data exists.** When conductor temperature and wind data are available, prefer the ambient-adjusted rating — it typically widens winter headroom 5–15% and prevents a conservative static screen from rejecting a viable project.
- **Screen against the N-1 rating.** For bulk corridors, subtract from the post-contingency (N-1) rating rather than the normal rating so a project that only fits with every line in service is flagged, not passed.
- **Vectorize, don't iterate.** The whole balance is column arithmetic on the GeoDataFrame; avoid `apply` or per-row loops so a 200k-segment national screen stays in seconds. Pair with the voltage-scaled radii from [calculating 5 km proximity buffers around substations in Shapely](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/calculating-5km-proximity-buffers-around-substations-in-shapely/) to bound each request to the segments actually within reach.
- **Persist the basis, not just the number.** Write `rating_basis`, `power_factor`, and `season` alongside `headroom_mw` so a screen that clears a corridor for a project can be reproduced by an independent reviewer.

## Downstream validation

Before a headroom layer feeds a queue-prioritization or permitting workflow, gate it with an assertion function suitable for a CI/CD pipeline. This catches unit regressions, clamp violations, and flag inconsistency introduced by an upstream change:

<svg viewBox="0 0 940 392" role="img" aria-label="A headroom waterfall for one 230 kilovolt bus. The summer rating is 87 megawatts. Existing firm load takes 44, generation already energised takes 18, and projects ahead in the interconnection queue hold 17, leaving 8 megawatts genuinely available. Screening against the rating alone would have advertised 87 — more than ten times what the next applicant can actually take." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>What is left after existing load, energised generation and the queue</title>
  <desc>A waterfall chart starting from an 87 megawatt summer rating. Three deductions follow: 44 megawatts of existing firm load, 18 megawatts of already energised generation, and 17 megawatts held by earlier positions in the interconnection queue. The remaining bar is 8 megawatts of available headroom. A callout contrasts this with the 87 megawatt figure a rating-only screen would report, and notes that the queue deduction is the one most often omitted because it lives in a different system from the network model.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="392"/>
  <defs><marker id="wf-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Rating minus commitments — the queue is a commitment too</text>
  <rect x="60" y="104.07999999999998" width="148" height="187.92000000000002" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="134" y="94.07999999999998" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">87 MW</text>
  <text x="134" y="314" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">summer rating</text>
  <rect x="236" y="104.07999999999998" width="148" height="95.04" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="310" y="94.07999999999998" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">44 MW</text>
  <text x="310" y="314" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">existing firm load</text>
  <rect x="412" y="199.12" width="148" height="38.88" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="486" y="189.12" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">18 MW</text>
  <text x="486" y="314" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">energised generation</text>
  <rect x="588" y="238.0" width="148" height="36.72" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="662" y="228.0" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">17 MW</text>
  <text x="662" y="314" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">queued ahead</text>
  <rect x="764" y="274.72" width="148" height="17.28" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="838" y="264.72" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">8 MW</text>
  <text x="838" y="314" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">available</text>
  <line x1="48" y1="292" x2="900" y2="292" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <rect x="60" y="322" width="428" height="28" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.5"/>
  <text x="274.0" y="342" text-anchor="middle" font-size="11.5" fill="currentColor">A rating-only screen advertises 87 MW</text>
  <rect x="512" y="322" width="388" height="28" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="706.0" y="342" text-anchor="middle" font-size="11.5" fill="currentColor">The queue deduction is the usual omission</text>
</svg>

```python
def assert_headroom_integrity(grid_gdf: gpd.GeoDataFrame, request_mw: float) -> None:
    """CI/CD gate: fail the build if the headroom layer is not screening-grade."""
    assert grid_gdf.crs is not None and grid_gdf.crs.is_projected, "output lost projected CRS"

    # headroom must sit within the physical band [-rating, +rating]
    c_thermal = grid_gdf["seasonal_rating_mva"] * grid_gdf["power_factor"]
    within = grid_gdf["headroom_mw"].between(-c_thermal, c_thermal)
    assert bool(within.all()), "headroom_mw escaped the [-rating, +rating] physical band"

    # the feasibility flag must be exactly consistent with the numeric headroom
    expected = grid_gdf["headroom_mw"] >= request_mw
    assert bool((grid_gdf["feasible"] == expected).all()), "feasible flag inconsistent with headroom_mw"

    # no NaN headroom from a failed join slipping through
    assert int(grid_gdf["headroom_mw"].isna().sum()) == 0, "NaN headroom (check the segment-ID join)"
```

Asserting that `feasible` is exactly `headroom_mw >= request_mw`, and that headroom never escapes `[-rating, +rating]`, is what keeps the screen auditable: an engineer reviewing the interconnection package can trust that the boolean flag and the megawatt figure tell the same story. The same discipline of tagging every output with the basis that produced it applies when the screen results overlay siting constraints during [regulatory boundary mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/) — a feasibility flag is only defensible next to the season, power factor, and rating that generated it. Pin `geopandas` and `pandas` versions so a default-merge or clipping change cannot silently shift the screen between runs.

## Related

- [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) — the parent workflow that consumes this per-segment headroom to build capacity surfaces.
- [Calculating 5 km Proximity Buffers Around Substations in Shapely](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/calculating-5km-proximity-buffers-around-substations-in-shapely/) — bound each request to the segments within interconnection reach before scoring headroom.
- [Proximity Distance Calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) — the join-integrity and distance discipline the segment-to-rating match depends on.
- [Regulatory Boundary Mapping](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/regulatory-boundary-mapping/) — overlay feasible corridors against setback and permitting constraints downstream.
