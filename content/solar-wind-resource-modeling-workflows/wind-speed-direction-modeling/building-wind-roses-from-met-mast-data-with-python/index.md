---
title: Building Wind Roses from Met Mast Data with Python
description: Bin met-mast speed and direction into a wind rose without the 350°/10° circular-averaging trap — half-sector North offset, calm handling, and a normalised numpy histogram2d frequency table.
slug: building-wind-roses-from-met-mast-data-with-python
type: article
breadcrumb: Building Wind Roses from Met Mast Data
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Building Wind Roses from Met Mast Data with Python

A wind rose that points its prevailing sector at the wrong compass bearing is the failure signature this page exists to eliminate. It is the tabulation stage of the [Wind Speed & Direction Modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/) workflow: raw 10-minute anemometer and vane records from a met mast are reduced to a frequency table — direction sectors on one axis, speed bins on the other — that drives turbine layout, sector-wise energy yield, and wake allocation. Because direction is a circular quantity, a naive binning script does not raise an error. It returns a smooth, plausible-looking rose whose North sector is split in two, whose calm periods have been smeared into a real direction, and whose raw counts cannot be compared against a neighbouring mast. Every one of those defects biases the layout an EPC contractor treats as final.

The arithmetic of a wind rose is a two-dimensional histogram. The production failures live entirely in how the direction axis is binned across the 0°/360° seam and in what is allowed onto that axis in the first place.

## Root-cause analysis

Four compounding causes account for nearly every rotated or mis-normalised rose, and each maps to a distinct fix stage below.

1. **Bearings binned as plain numbers.** Wind direction wraps: 350° and 10° are 20° apart physically but 340° apart numerically. Any code that averages bearings, or that lets a histogram treat them as an ordinary real axis, produces a spurious gradient across North — the same discontinuity that forces vector decomposition in the parent [wind speed and direction modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/) workflow.
2. **Sector edges straddling North.** For an N-sector rose, the North sector is *centred* on 0°, so it must span from just below 360° to just above 0°. Edges placed naively at `0, 22.5, 45, …` split that physical sector into two half-bins on either side of the seam, and the rose double-counts nothing at North while over-representing the two flanking sectors.
3. **Calm and sensor sentinel contamination.** A wind vane's reading is undefined below the anemometer cut-in speed; the sensor often parks at 0° or reports 360° as a sentinel. Feed those records into the direction axis and calm periods pile up in the North sector as phantom wind.
4. **Unequal record counts.** Two masts, or two seasons of one mast, almost never share the same number of valid records. Raw tallies are therefore incomparable — only a table normalised to frequency (summing to one) can be merged, averaged, or plotted on a common scale.

<svg viewBox="0 0 900 500" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four wind-rose binning failures mapped to their fixes. First, bearings binned as plain numbers so 350 and 10 degrees average to 180; the fix bins on a sector index after a half-sector shift. Second, sector edges straddle North and split the zero-degree sector in two; the fix uses a half-sector offset so North is one contiguous bin. Third, calm periods and 0-or-360 sentinels fill a direction sector; the fix pulls calms below a threshold out and normalises 360 degrees to 0. Fourth, unequal record counts make tallies incomparable; the fix divides by total valid records so frequencies sum to one." style="width:100%;max-width:900px;height:auto;font-family:inherit;">
  <title>Wind-rose binning failures mapped to their fixes</title>
  <desc>Two columns of four rows. The left column lists each failure cause; the right column lists the corresponding correct handling; an arrow runs from each cause to its fix. Row one: bearings binned as plain numbers, so 350 and 10 average to 180, is fixed by binning on a sector index after a half-sector shift. Row two: sector edges straddling North split the zero-degree sector into two half-bins, fixed by a half-sector offset that makes North a single contiguous bin. Row three: calm periods and 0-or-360 vane sentinels contaminate a direction sector, fixed by pulling calms below a threshold out and normalising 360 to 0. Row four: unequal record counts make raw tallies incomparable, fixed by dividing by total valid records so the frequencies sum to one.</desc>
  <defs>
    <marker id="wr-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="900" height="500" fill="none"/>
  <text x="182" y="30" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">Failure cause</text>
  <text x="718" y="30" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">Correct handling</text>
  <!-- Row 1 -->
  <rect x="24" y="52" width="316" height="80" rx="7" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="182" y="86" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">Bearings binned as plain numbers</text>
  <text x="182" y="107" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">350° and 10° average to 180°</text>
  <line x1="344" y1="92" x2="556" y2="92" stroke="currentColor" stroke-width="1.5" marker-end="url(#wr-arr)"/>
  <rect x="560" y="52" width="316" height="80" rx="7" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-width="1.5"/>
  <text x="718" y="86" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">Bin on a sector index</text>
  <text x="718" y="107" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">shift half a sector, then histogram</text>
  <!-- Row 2 -->
  <rect x="24" y="148" width="316" height="80" rx="7" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="182" y="182" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">Sector edges straddle North</text>
  <text x="182" y="203" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">the 0° sector split into two bins</text>
  <line x1="344" y1="188" x2="556" y2="188" stroke="currentColor" stroke-width="1.5" marker-end="url(#wr-arr)"/>
  <rect x="560" y="148" width="316" height="80" rx="7" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-width="1.5"/>
  <text x="718" y="182" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">Half-sector offset centres North</text>
  <text x="718" y="203" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">one contiguous [348.75°, 11.25°) bin</text>
  <!-- Row 3 -->
  <rect x="24" y="244" width="316" height="80" rx="7" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="182" y="278" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">Calm + 0°/360° sentinels</text>
  <text x="182" y="299" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">undefined vane fills a sector</text>
  <line x1="344" y1="284" x2="556" y2="284" stroke="currentColor" stroke-width="1.5" marker-end="url(#wr-arr)"/>
  <rect x="560" y="244" width="316" height="80" rx="7" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-width="1.5"/>
  <text x="718" y="278" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">Pull calms out below threshold</text>
  <text x="718" y="299" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">count separately; normalise 360°→0°</text>
  <!-- Row 4 -->
  <rect x="24" y="340" width="316" height="80" rx="7" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="182" y="374" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">Unequal record counts</text>
  <text x="182" y="395" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">raw tallies not comparable</text>
  <line x1="344" y1="380" x2="556" y2="380" stroke="currentColor" stroke-width="1.5" marker-end="url(#wr-arr)"/>
  <rect x="560" y="340" width="316" height="80" rx="7" fill="currentColor" fill-opacity="0.10" stroke="currentColor" stroke-width="1.5"/>
  <text x="718" y="374" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">Divide by total valid records</text>
  <text x="718" y="395" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">frequencies sum to 1</text>
  <!-- footer note -->
  <text x="450" y="456" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.75">Every fix is a binning decision, not a plotting option — the rose inherits whatever the table encodes.</text>
</svg>

The sector geometry is worth stating precisely, because the entire fix hinges on it. With $N$ sectors the sector width is

$$ \Delta = \frac{360°}{N} $$

and sector $k$ is centred on $c_k = k\,\Delta$ for $k = 0, 1, \dots, N-1$, covering the half-open interval

$$ \left[\, c_k - \tfrac{\Delta}{2},\; c_k + \tfrac{\Delta}{2} \,\right). $$

The North sector ($k = 0$) therefore wraps the seam, from $360° - \tfrac{\Delta}{2}$ up to $\tfrac{\Delta}{2}$. To turn that wrap-around interval into an ordinary contiguous histogram bin, shift every bearing by half a sector before binning and take the floor:

$$ \phi' = \left(\phi + \tfrac{\Delta}{2}\right) \bmod 360°, \qquad \operatorname{sector}(\phi) = \left\lfloor \frac{\phi'}{\Delta} \right\rfloor. $$

After the shift, bearings of 350° and 10° both map to `sector 0`, and `np.histogram2d` can bin the direction axis with plain contiguous edges `0, Δ, 2Δ, …, 360`.

## Pre-flight validation

Surface the bad records *before* the histogram runs. The validator below normalises the vane (so a sentinel 360° becomes 0°), flags calms rather than binning them, and rejects the two conditions that silently corrupt a rose: negative speeds from nodata sentinels, and thin temporal coverage that over-weights whichever period happened to report densely.

```python
import numpy as np
import pandas as pd


def preflight_met_mast(
    df: pd.DataFrame,
    calm_threshold_ms: float = 0.5,
    min_coverage: float = 0.90,
    sample_period: str = "10min",
) -> pd.DataFrame:
    """Validate met-mast records before binning; return a cleaned frame with a
    normalised bearing column and a boolean calm flag."""
    required = {"timestamp", "wind_speed_ms", "wind_dir_deg"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    # Cause 3: nodata sentinels (-9999) enter as negative "speeds"
    if (df["wind_speed_ms"] < 0).any():
        raise ValueError("Negative wind speed present; check nodata sentinels (-9999).")

    # Cause 3: a sensor 360 means due North, i.e. 0 in [0, 360)
    bearing = df["wind_dir_deg"].to_numpy(dtype="float64") % 360.0
    if not np.isfinite(bearing).all():
        raise ValueError("Non-finite bearings after normalisation; drop NaN vane records first.")

    out = df.copy()
    out["bearing_deg"] = bearing
    # Vane direction is undefined below cut-in: flag calms, never bin them
    out["is_calm"] = out["wind_speed_ms"] < calm_threshold_ms

    # Cause 4: uneven sampling biases the rose toward dense periods
    ts = pd.to_datetime(out["timestamp"], utc=True, errors="coerce")
    if ts.isna().any():
        raise ValueError("Unparseable timestamps; a wind rose needs a regular time base.")
    expected = (ts.max() - ts.min()) / pd.Timedelta(sample_period)
    coverage = len(ts) / max(expected, 1)
    if coverage < min_coverage:
        raise ValueError(
            f"Only {coverage:.0%} temporal coverage (< {min_coverage:.0%}); "
            "gap-fill before binning or the rose over-weights dense periods."
        )
    return out
```

Coverage is checked against the mast's nominal sampling cadence (10-minute records are the IEC standard) so that a feed with large gaps is caught here rather than silently distorting the frequencies. Filling those gaps defensibly — rather than binning around them — is the job of [interpolating sparse met-mast data with kriging](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/interpolating-sparse-met-mast-data-with-kriging/), and it belongs upstream of the rose.

## Fix implementation

The corrected function applies the half-sector offset, separates calms onto their own tally, clips extreme gusts into the top speed bin so nothing is dropped, and normalises by *all* valid records so the directional frequencies and the calm frequency together sum to one. Parameter choices are justified for wind assessment: `n_sectors=16` (22.5° sectors) is the industry default; the speed edges track a turbine power-curve's operating regions; and `calm_threshold_ms` matches typical anemometer cut-in.

```python
def build_wind_rose(
    df: pd.DataFrame,
    n_sectors: int = 16,
    speed_bins_ms=(0.5, 3.0, 6.0, 9.0, 12.0, 25.0),
    calm_threshold_ms: float = 0.5,
) -> dict:
    """Bin met-mast speed and direction into a normalised frequency matrix.

    The North sector is a single contiguous bin — never split across the
    0°/360° seam — because bearings are offset by half a sector first."""
    clean = preflight_met_mast(df, calm_threshold_ms=calm_threshold_ms)

    total = len(clean)                      # all valid records, calms included
    calm_mask = clean["is_calm"].to_numpy()
    calm_freq = float(calm_mask.mean())

    directional = clean.loc[~calm_mask]
    bearing = directional["bearing_deg"].to_numpy()
    speed = directional["wind_speed_ms"].to_numpy()

    sector_width = 360.0 / n_sectors
    # Half-sector offset centres bin 0 on due North (see sector-edge math above)
    shifted = (bearing + sector_width / 2.0) % 360.0

    dir_edges = np.linspace(0.0, 360.0, n_sectors + 1)      # N+1 contiguous edges
    speed_edges = np.asarray(speed_bins_ms, dtype="float64")

    # Clip so under-cut-in and extreme gusts land in the first/last bin,
    # never dropped — this keeps the table exactly normalisable.
    speed = np.clip(speed, speed_edges[0], speed_edges[-1])

    counts, _, _ = np.histogram2d(shifted, speed, bins=[dir_edges, speed_edges])

    # Normalise by the FULL valid count so freq.sum() + calm_freq == 1
    freq = counts / total
    sector_centres = np.arange(n_sectors) * sector_width     # 0=N, clockwise

    return {
        "frequency": freq,                    # shape (n_sectors, len(speed_bins) - 1)
        "calm_frequency": calm_freq,
        "sector_centres_deg": sector_centres,
        "speed_edges_ms": speed_edges,
        "n_records": total,
    }
```

The returned `frequency` matrix is a ready-to-render polar rose: row `k` is the North-anchored sector centred on `sector_centres_deg[k]`, and each column is a speed band whose stacked length gives that sector's total frequency. Feeding it to an inline SVG or a `matplotlib` polar bar chart is a pure presentation step — the seam-safety and normalisation are already baked into the table, which is exactly where they must live.

## Fallback routing & performance tuning

For sparse masts, multi-mast campaigns, or CI/CD runs, layer these strategies on top of the core function.

- **Tune the sector count to record depth.** Drop to 12 sectors (30°) when a mast has only a few thousand valid records, so each sector keeps a statistically meaningful count; reserve 36 sectors (10°) for multi-year records where the tails are populated. Over-sectoring a thin dataset produces a spiky, unstable rose.
- **Match the calm threshold to the instrument.** Align `calm_threshold_ms` to the anemometer cut-in and vane stall speed (commonly 0.5–1.0 m/s) rather than a round number, and always carry `calm_frequency` into the output metadata — a rose that hides its calm fraction is not auditable.
- **Normalise before merging, never sum raw counts.** To combine masts with unequal record counts, convert each to its own frequency table first, then take a coverage-weighted mean of the frequency matrices. Summing raw `histogram2d` counts lets the mast with the most records dominate the blended rose.
- **Align speed edges to the power curve.** Choose speed-bin edges at the turbine's cut-in, rated, and cut-out speeds so the rose reads directly as an energy-relevant distribution feeding downstream [temporal data aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) into AEP and P50/P90 bands.
- **Vectorise, don't loop.** `np.histogram2d` bins the whole record set in one pass; never accumulate sectors in a Python `for` loop over rows. For very large multi-mast archives, bin each mast independently and reduce the frequency matrices — the operation is embarrassingly parallel once each table is normalised.

## Downstream validation

Before a rose feeds a layout or yield model, gate it with an assertion suitable for a CI/CD pipeline. This catches the two defects that survive a plausible-looking plot: a table that no longer normalises, and a sector grid that has silently double-counted North after an upstream edit to the binning code.

```python
def assert_wind_rose_integrity(rose: dict, tol: float = 1e-9) -> None:
    """CI/CD gate: a wind rose must be a normalised, seam-safe frequency table."""
    freq = rose["frequency"]
    calm = rose["calm_frequency"]

    assert np.all(freq >= 0.0), "negative frequency in wind rose"
    total = float(freq.sum()) + calm
    assert abs(total - 1.0) <= tol, f"frequencies sum to {total:.6f}, not 1.0"

    # No sector double-count at North: contiguous edges, exactly N+1 of them
    centres = rose["sector_centres_deg"]
    n = len(centres)
    edges = np.linspace(0.0, 360.0, n + 1)
    assert edges[0] == 0.0 and edges[-1] == 360.0, "sector edges do not close the circle"
    assert len(np.unique(edges)) == n + 1, "duplicate sector edge; North bin double-counted"
    assert centres[0] == 0.0, "sector 0 is not centred on due North"
```

Logging `calm_frequency`, `n_records`, and the sector/speed edges alongside the matrix is what keeps the rose defensible: an independent reviewer assembling an interconnection or project-finance package can see how many records were measured versus calm, and confirm the North sector was binned once. Applying the same [spatial data quality validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) discipline to the input records — and pinning `numpy` and `pandas` versions so a default histogram change cannot shift the edges between runs — closes the loop from raw vane readings to a bankable directional distribution. The same seam-safe distribution is what the parent workflow's hub-height field relies on when [calculating wind shear coefficients with Python](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/calculating-wind-shear-coefficients-with-python/) scales the rose vertically to the rotor.

## Related

- [Wind Speed & Direction Modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/) — the parent workflow that produces the projected, quality-gated records this rose bins.
- [Calculating Wind Shear Coefficients with Python](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/calculating-wind-shear-coefficients-with-python/) — scale the sector-wise speeds from mast height to hub height.
- [Interpolating Sparse Met-Mast Data with Kriging](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/interpolating-sparse-met-mast-data-with-kriging/) — fill temporal and spatial gaps before the rose over-weights dense periods.
- [Temporal Data Aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) — turn the binned distribution into AEP and P50/P90 yield bands.
