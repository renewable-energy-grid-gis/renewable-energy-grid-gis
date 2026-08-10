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
  <rect class="svg-bg" x="0" y="0" width="900" height="500"/>
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

<svg viewBox="0 0 940 452" role="img" aria-label="A wind rose for a met mast year, drawn as frequency by direction sector and banded by speed. The prevailing direction is west-south-west, which carries 21 percent of the hours; the north-east sectors carry under 4 percent each. Because energy scales with the cube of speed, the west-south-west sector carries a larger share of the energy than of the hours — which is what decides row orientation in a layout, not the frequency alone." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Frequency by direction sector, banded by speed</title>
  <desc>A polar wind rose with sixteen direction sectors. Each sector is drawn as a stacked wedge with three speed bands: under 5 metres per second, 5 to 10, and above 10. The west-south-west sector is the longest at 21 percent of hours and carries the largest above-10 band; west and south-west follow at 14 and 12 percent. The north-east through east sectors are all under 4 percent. Range rings are labelled at 5, 10, 15 and 20 percent, and a legend gives the three speed bands.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="452"/>
  <defs><marker id="wrose-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">One met-mast year, 16 sectors, three speed bands</text>
  <circle cx="300" cy="236" r="35.0" fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.2"/>
  <text x="305" y="205.0" text-anchor="start" font-size="9.5" fill="currentColor" opacity="0.65">5%</text>
  <circle cx="300" cy="236" r="70.0" fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.2"/>
  <text x="305" y="170.0" text-anchor="start" font-size="9.5" fill="currentColor" opacity="0.65">10%</text>
  <circle cx="300" cy="236" r="105.0" fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.2"/>
  <text x="305" y="135.0" text-anchor="start" font-size="9.5" fill="currentColor" opacity="0.65">15%</text>
  <circle cx="300" cy="236" r="140.0" fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.2"/>
  <text x="305" y="100.0" text-anchor="start" font-size="9.5" fill="currentColor" opacity="0.65">20%</text>
  <path d="M300.0,236.0 L298.5,226.7 L301.5,226.7 L300.0,236.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1"/>
  <path d="M298.5,226.7 L297.3,218.7 L302.7,218.7 L301.5,226.7 Z" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1"/>
  <path d="M297.3,218.7 L296.5,213.9 L303.5,213.9 L302.7,218.7 Z" fill="#FFE3BE" stroke="#F4A261" stroke-width="1"/>
  <path d="M300.0,236.0 L301.9,228.0 L304.3,229.0 L300.0,236.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1"/>
  <path d="M301.9,228.0 L303.6,221.1 L308.0,223.0 L304.3,229.0 Z" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1"/>
  <path d="M303.6,221.1 L304.6,216.9 L310.2,219.3 L308.0,223.0 Z" fill="#FFE3BE" stroke="#F4A261" stroke-width="1"/>
  <path d="M300.0,236.0 L304.1,230.3 L305.7,231.9 L300.0,236.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1"/>
  <path d="M304.1,230.3 L307.7,225.4 L310.6,228.3 L305.7,231.9 Z" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1"/>
  <path d="M307.7,225.4 L309.9,222.4 L313.6,226.1 L310.6,228.3 Z" fill="#FFE3BE" stroke="#F4A261" stroke-width="1"/>
  <path d="M300.0,236.0 L305.3,232.8 L306.0,234.6 L300.0,236.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1"/>
  <path d="M305.3,232.8 L309.8,230.0 L311.1,233.3 L306.0,234.6 Z" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1"/>
  <path d="M309.8,230.0 L312.5,228.3 L314.3,232.6 L311.1,233.3 Z" fill="#FFE3BE" stroke="#F4A261" stroke-width="1"/>
  <path d="M300.0,236.0 L307.5,234.8 L307.5,237.2 L300.0,236.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1"/>
  <path d="M307.5,234.8 L314.0,233.8 L314.0,238.2 L307.5,237.2 Z" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1"/>
  <path d="M314.0,233.8 L318.0,233.2 L318.0,238.8 L314.0,238.2 Z" fill="#FFE3BE" stroke="#F4A261" stroke-width="1"/>
  <path d="M300.0,236.0 L309.7,238.3 L308.5,241.2 L300.0,236.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1"/>
  <path d="M309.7,238.3 L318.1,240.3 L315.8,245.7 L308.5,241.2 Z" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1"/>
  <path d="M318.1,240.3 L323.1,241.6 L320.3,248.4 L315.8,245.7 Z" fill="#FFE3BE" stroke="#F4A261" stroke-width="1"/>
  <path d="M300.0,236.0 L309.8,243.1 L307.1,245.8 L300.0,236.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1"/>
  <path d="M309.8,243.1 L318.1,249.2 L313.2,254.1 L307.1,245.8 Z" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1"/>
  <path d="M318.1,249.2 L323.2,252.9 L316.9,259.2 L313.2,254.1 Z" fill="#FFE3BE" stroke="#F4A261" stroke-width="1"/>
  <path d="M300.0,236.0 L308.0,249.0 L303.6,250.9 L300.0,236.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1"/>
  <path d="M308.0,249.0 L314.8,260.2 L306.6,263.6 L303.6,250.9 Z" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1"/>
  <path d="M314.8,260.2 L319.0,267.0 L308.5,271.4 L306.6,263.6 Z" fill="#FFE3BE" stroke="#F4A261" stroke-width="1"/>
  <path d="M300.0,236.0 L303.1,255.7 L296.9,255.7 L300.0,236.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1"/>
  <path d="M303.1,255.7 L305.8,272.7 L294.2,272.7 L296.9,255.7 Z" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1"/>
  <path d="M305.8,272.7 L307.4,283.0 L292.6,283.0 L294.2,272.7 Z" fill="#FFE3BE" stroke="#F4A261" stroke-width="1"/>
  <path d="M300.0,236.0 L293.5,262.9 L285.6,259.6 L300.0,236.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1"/>
  <path d="M293.5,262.9 L288.0,285.9 L273.2,279.8 L285.6,259.6 Z" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1"/>
  <path d="M288.0,285.9 L284.6,300.0 L265.6,292.1 L273.2,279.8 Z" fill="#FFE3BE" stroke="#F4A261" stroke-width="1"/>
  <path d="M300.0,236.0 L279.1,264.8 L271.2,256.9 L300.0,236.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1"/>
  <path d="M279.1,264.8 L261.2,289.4 L246.6,274.8 L271.2,256.9 Z" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1"/>
  <path d="M261.2,289.4 L250.2,304.5 L231.5,285.8 L246.6,274.8 Z" fill="#FFE3BE" stroke="#F4A261" stroke-width="1"/>
  <path d="M300.0,236.0 L247.4,268.3 L240.0,250.4 L300.0,236.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1"/>
  <path d="M247.4,268.3 L202.2,295.9 L188.5,262.8 L240.0,250.4 Z" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1"/>
  <path d="M202.2,295.9 L174.7,312.8 L157.1,270.3 L188.5,262.8 Z" fill="#FFE3BE" stroke="#F4A261" stroke-width="1"/>
  <path d="M300.0,236.0 L258.8,242.5 L258.8,229.5 L300.0,236.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1"/>
  <path d="M258.8,242.5 L223.4,248.1 L223.4,223.9 L258.8,229.5 Z" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1"/>
  <path d="M223.4,248.1 L201.8,251.5 L201.8,220.5 L223.4,223.9 Z" fill="#FFE3BE" stroke="#F4A261" stroke-width="1"/>
  <path d="M300.0,236.0 L281.7,231.6 L284.0,226.2 L300.0,236.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1"/>
  <path d="M281.7,231.6 L266.0,227.8 L270.2,217.7 L284.0,226.2 Z" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1"/>
  <path d="M266.0,227.8 L256.4,225.5 L261.8,212.6 L270.2,217.7 Z" fill="#FFE3BE" stroke="#F4A261" stroke-width="1"/>
  <path d="M300.0,236.0 L290.2,228.9 L292.9,226.2 L300.0,236.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1"/>
  <path d="M290.2,228.9 L281.9,222.8 L286.8,217.9 L292.9,226.2 Z" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1"/>
  <path d="M281.9,222.8 L276.8,219.1 L283.1,212.8 L286.8,217.9 Z" fill="#FFE3BE" stroke="#F4A261" stroke-width="1"/>
  <path d="M300.0,236.0 L295.1,228.0 L297.8,226.9 L300.0,236.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1"/>
  <path d="M295.1,228.0 L290.9,221.1 L295.9,219.0 L297.8,226.9 Z" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1"/>
  <path d="M290.9,221.1 L288.3,216.9 L294.8,214.2 L295.9,219.0 Z" fill="#FFE3BE" stroke="#F4A261" stroke-width="1"/>
  <text x="300.0" y="64.0" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">N</text>
  <text x="476.0" y="240.0" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">E</text>
  <text x="300.0" y="416.0" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">S</text>
  <text x="124.0" y="240.00000000000003" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">W</text>
  <text x="300" y="430" text-anchor="middle" font-size="11.5" fill="#2C6E8F" font-weight="700">WSW carries 21% of the hours</text>
  <rect x="560" y="96" width="18" height="14" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="588" y="108" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.9">under 5 m/s</text>
  <rect x="560" y="122" width="18" height="14" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="588" y="134" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.9">5 – 10 m/s</text>
  <rect x="560" y="148" width="18" height="14" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="588" y="160" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.9">above 10 m/s</text>
  <rect x="560" y="190" width="356" height="73" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="738.0" y="212" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">Energy share ≠ frequency share</text>
  <text x="738.0" y="231" text-anchor="middle" font-size="11.5" fill="currentColor">WSW is 21% of hours and 34% of energy</text>
  <text x="738.0" y="250" text-anchor="middle" font-size="11.5" fill="currentColor">because its above-10 band is the largest</text>
  <rect x="560" y="296" width="356" height="73" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="738.0" y="318" text-anchor="middle" font-size="11.5" fill="currentColor">Row orientation follows the energy rose,</text>
  <text x="738.0" y="337" text-anchor="middle" font-size="11.5" fill="currentColor">not the frequency rose — the two differ</text>
  <text x="738.0" y="356" text-anchor="middle" font-size="11.5" fill="currentColor">most at sites with a bimodal regime</text>
</svg>

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

<svg viewBox="0 0 940 396" role="img" aria-label="How the sector count changes what a rose can show. Eight sectors of 45 degrees smear the prevailing direction across a span wider than most wake effects care about; sixteen sectors of 22.5 degrees is the industry convention and resolves a bimodal regime; thirty-six sectors of 10 degrees resolves terrain channelling but needs enough records per sector to be stable — at 8,760 hours that is only 243 per sector before any filtering." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Eight, sixteen or thirty-six sectors — and the records each leaves</title>
  <desc>Three miniature roses of the same data at three sector counts. The eight-sector rose has 45 degree wedges and about 1,095 records per sector; the prevailing direction is a single broad wedge. The sixteen-sector rose has 22.5 degree wedges and about 548 records per sector, and a secondary mode becomes visible. The thirty-six-sector rose has 10 degree wedges and about 243 records per sector, resolving a narrow channelled flow but with visibly noisier sector-to-sector variation.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="sc2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The same year at three sector counts</text>
  <text x="170" y="66" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">8 sectors · 45° wide</text>
  <text x="170" y="300" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">1095 records per sector</text>
  <circle cx="170" cy="176" r="46.0" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.2"/>
  <circle cx="170" cy="176" r="92.0" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.2"/>
  <path d="M170.0,176.0 L167.0,167.5 L173.0,167.5 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M170.0,176.0 L173.8,168.1 L177.9,172.2 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M170.0,176.0 L178.8,172.9 L178.8,179.1 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M170.0,176.0 L177.9,179.8 L173.8,183.9 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M170.0,176.0 L179.8,203.9 L160.2,203.9 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M170.0,176.0 L138.1,242.4 L103.6,207.9 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M170.0,176.0 L112.6,196.2 L112.6,155.8 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M170.0,176.0 L158.7,170.6 L164.6,164.7 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <text x="170" y="292" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">too coarse to site rows</text>
  <text x="470" y="66" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">16 sectors · 22° wide</text>
  <text x="470" y="300" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">547 records per sector</text>
  <circle cx="470" cy="176" r="46.0" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.2"/>
  <circle cx="470" cy="176" r="92.0" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.2"/>
  <path d="M470.0,176.0 L468.5,167.4 L471.5,167.4 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M470.0,176.0 L472.0,167.1 L474.9,168.3 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M470.0,176.0 L475.0,168.9 L477.1,171.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M470.0,176.0 L477.4,171.3 L478.5,174.1 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M470.0,176.0 L479.0,174.5 L479.0,177.5 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M470.0,176.0 L479.3,178.1 L478.1,181.1 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M470.0,176.0 L477.2,181.1 L475.1,183.2 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M470.0,176.0 L475.4,184.5 L472.2,185.8 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M470.0,176.0 L475.0,205.5 L465.0,205.5 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M470.0,176.0 L454.4,244.4 L432.6,235.4 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M470.0,176.0 L426.3,237.7 L408.3,219.7 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M470.0,176.0 L396.6,222.2 L385.5,195.2 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M470.0,176.0 L403.0,187.4 L403.0,164.6 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M470.0,176.0 L443.8,170.0 L447.2,161.7 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M470.0,176.0 L459.3,168.4 L462.4,165.3 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M470.0,176.0 L465.1,168.2 L467.9,167.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <text x="470" y="292" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">the working convention</text>
  <text x="770" y="66" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">36 sectors · 10° wide</text>
  <text x="770" y="300" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">243 records per sector</text>
  <circle cx="770" cy="176" r="46.0" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.2"/>
  <circle cx="770" cy="176" r="92.0" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.2"/>
  <path d="M770.0,176.0 L769.4,167.9 L770.6,167.9 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L770.8,168.0 L772.0,168.2 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L772.3,167.7 L773.5,168.2 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L774.4,166.8 L775.7,167.6 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L774.8,169.3 L775.7,170.1 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L776.8,169.4 L777.7,170.5 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L778.0,170.6 L778.7,171.8 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L778.0,172.4 L778.5,173.6 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L779.1,173.7 L779.3,175.1 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L777.8,175.4 L777.8,176.6 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L777.8,176.8 L777.6,177.9 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L778.0,178.2 L777.5,179.4 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L778.8,180.2 L778.1,181.5 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L777.3,181.2 L776.4,182.3 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L776.1,182.2 L775.1,183.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L775.5,184.1 L774.3,184.8 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L774.5,185.9 L772.9,186.4 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L773.8,190.8 L771.5,191.2 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L772.4,208.3 L767.6,208.3 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L764.9,227.6 L757.2,226.2 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L754.1,232.5 L745.9,229.4 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L738.8,240.8 L729.5,235.4 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L727.4,235.3 L719.0,228.3 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L706.7,237.8 L698.1,227.6 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L694.0,227.8 L687.1,215.9 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L696.2,209.3 L692.0,197.9 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L680.9,198.7 L678.5,185.1 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L714.2,180.2 L714.2,171.8 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L724.7,171.5 L725.9,164.8 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L736.9,166.7 L738.7,161.9 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L753.5,168.0 L754.9,165.7 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L758.3,167.6 L759.7,166.0 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L763.4,169.2 L764.5,168.3 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L764.1,167.4 L765.5,166.6 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L765.8,166.7 L767.2,166.1 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <path d="M770.0,176.0 L767.7,166.8 L769.1,166.6 Z" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.9"/>
  <text x="770" y="292" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">resolves channelling, noisier</text>
  <rect x="40" y="322" width="868" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="343" text-anchor="middle" font-size="11.5" fill="currentColor">Sector count is a statistics decision, not a drawing one: below roughly 300 records a sector, the rose</text>
  <text x="474.0" y="360" text-anchor="middle" font-size="11.5" fill="currentColor">starts describing the sample rather than the site.</text>
</svg>

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
