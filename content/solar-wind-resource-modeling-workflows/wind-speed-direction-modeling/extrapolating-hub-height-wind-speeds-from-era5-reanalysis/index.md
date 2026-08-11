---
title: Extrapolating Hub-Height Wind Speeds from ERA5 Reanalysis
description: Turn 10 m and 100 m reanalysis winds into a hub-height estimate you can defend — derive shear from the pair, correct for terrain and roughness, bias-correct against a mast, and quantify what is left.
slug: extrapolating-hub-height-wind-speeds-from-era5-reanalysis
type: article
breadcrumb: Hub-Height Winds from ERA5
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Extrapolating Hub-Height Wind Speeds from ERA5 Reanalysis

The scenario: a prospecting screen ranks sites on ERA5 100-metre wind speed, a developer builds a
campaign around the top of the list, and the first met mast comes in 12 percent below the reanalysis.
ERA5 is not wrong — it is a 31-kilometre grid representing an area average over terrain it barely
resolves, and using it as a site value skips two corrections and an uncertainty. This page does the
extrapolation properly, and it extends
[wind speed and direction modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/).

## Root-cause analysis

Four gaps separate a reanalysis grid value from a hub-height site estimate.

1. **Resolution.** ERA5 cells are roughly 31 kilometres across and the model terrain is smoothed to
   match. A ridge that gains 15 percent over the surrounding plain does not exist in the model, and
   neither does the sheltering behind it.
2. **Height.** ERA5 publishes 10-metre and 100-metre winds; hubs are commonly 120 to 160 metres. The
   pair gives a shear exponent per hour, which is far better than assuming one — but extrapolating
   above 100 metres is still extrapolation.
3. **Surface roughness.** The model's roughness is its own, derived from a land-cover climatology at
   model resolution. Where the real site is smoother or rougher, the whole profile shifts.
4. **Bias.** Reanalysis has known regional biases, often several percent and signed consistently
   within a region. A measure-correlate-predict step against any nearby mast removes most of it.

<svg viewBox="0 0 940 412" role="img" aria-label="The correction chain from an ERA5 grid value to a defensible hub-height estimate. The raw 100-metre cell value is 7.9 metres per second. Hourly shear from the 10 and 100 metre pair extrapolates it to 8.3 at a 140-metre hub. A roughness correction for a site smoother than the model cell adds 0.2. A measure-correlate-predict step against a nearby mast removes a regional high bias of 7 percent, landing at 7.9 — the same number as the raw value, by coincidence rather than by luck." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>From a reanalysis cell value to a site hub-height estimate</title>
  <desc>A four-step waterfall. The raw ERA5 100-metre cell value is 7.9 metres per second. Extrapolation to a 140-metre hub using hourly shear derived from the 10 and 100 metre pair adds 0.4. A roughness correction for a site smoother than the model cell adds 0.2. A measure-correlate-predict correction against a nearby mast removes 0.6, reflecting a regional high bias of about 7 percent. The corrected estimate is 7.9 metres per second, annotated as coincidentally equal to the raw value — each step was still necessary, and skipping any one of them would have produced a different answer.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="412"/>
  <defs><marker id="er1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">ERA5 cell → hub-height site estimate</text>
  <rect x="70" y="104.73333333333332" width="148" height="163.26666666666668" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="144" y="95.73333333333332" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">7.9</text>
  <text x="144" y="290" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">ERA5</text>
  <text x="144" y="306" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">100 m cell</text>
  <rect x="236" y="96.46666666666664" width="148" height="8.266666666666667" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="310" y="87.46666666666664" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">0.4</text>
  <text x="310" y="290" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">+</text>
  <text x="310" y="306" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">shear to 140 m</text>
  <rect x="402" y="92.33333333333331" width="148" height="4.133333333333334" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="476" y="83.33333333333331" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">0.2</text>
  <text x="476" y="290" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">+</text>
  <text x="476" y="306" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">roughness correction</text>
  <rect x="568" y="92.33333333333331" width="148" height="12.4" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="642" y="83.33333333333331" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">0.6</text>
  <text x="642" y="290" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">−</text>
  <text x="642" y="306" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">regional bias (MCP)</text>
  <rect x="734" y="104.73333333333332" width="148" height="163.26666666666668" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.8"/>
  <text x="808" y="95.73333333333332" text-anchor="middle" font-size="13" fill="#1F5C3A" font-weight="700">7.9</text>
  <text x="808" y="290" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">corrected</text>
  <text x="808" y="306" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">hub estimate</text>
  <line x1="60" y1="268" x2="900" y2="268" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <rect x="70" y="332" width="838" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="489.0" y="351" text-anchor="middle" font-size="11" fill="currentColor">The corrected value equals the raw one by coincidence. Skipping any single step would have produced a</text>
  <text x="489.0" y="366" text-anchor="middle" font-size="11" fill="currentColor">different answer — which is why &quot;ERA5 says 7.9&quot; is not the same claim as this one.</text>
</svg>

## Pre-flight validation

The two ERA5 levels are the most useful input, so check they are both present and physically
consistent before using either.

```python
import numpy as np
import xarray as xr


def preflight_era5_pair(ds: xr.Dataset) -> dict:
    """Both levels present, both plausible, and a shear exponent that is physical."""
    required = {"u10", "v10", "u100", "v100"}
    missing = required - set(ds.data_vars)
    if missing:
        raise ValueError(f"ERA5 extract missing {sorted(missing)} — both levels are needed for shear")

    ws10 = np.hypot(ds["u10"], ds["v10"])
    ws100 = np.hypot(ds["u100"], ds["v100"])

    with np.errstate(divide="ignore", invalid="ignore"):
        alpha = np.log(ws100 / ws10) / np.log(100.0 / 10.0)

    finite = alpha.where(np.isfinite(alpha))
    return {
        "hours": int(ds.sizes.get("time", 0)),
        "mean_ws10": float(ws10.mean()),
        "mean_ws100": float(ws100.mean()),
        "median_alpha": float(finite.median()),
        "alpha_p5": float(finite.quantile(0.05)),
        "alpha_p95": float(finite.quantile(0.95)),
        "negative_alpha_share": float((finite < 0).mean()),
        "note": "negative alpha is physical at night but a large share suggests a level mix-up",
    }
```

A median shear exponent far outside 0.10 to 0.30 over land, or a negative share above about 15
percent, usually means the two levels were swapped or one is a different variable than assumed.

## Fix implementation

```python
import numpy as np
import xarray as xr


def hub_height_from_era5(
    ds: xr.Dataset,
    *,
    hub_height_m: float,
    site_roughness_m: float | None = None,
    era5_roughness_m: float | None = None,
    alpha_clip: tuple[float, float] = (0.05, 0.40),
) -> xr.DataArray:
    """Hourly hub-height wind speed from the ERA5 10 m / 100 m pair."""
    ws10 = np.hypot(ds["u10"], ds["v10"])
    ws100 = np.hypot(ds["u100"], ds["v100"])

    # Hourly shear from the pair, clipped to a physical band so a calm hour
    # cannot produce an exponent that explodes on extrapolation.
    alpha = np.log(ws100 / ws10.where(ws10 > 0.5)) / np.log(10.0)
    alpha = alpha.clip(*alpha_clip).fillna(0.14)

    ws_hub = ws100 * (hub_height_m / 100.0) ** alpha

    # Optional roughness correction: shift the profile when the site surface
    # differs from the model's own roughness for that cell.
    if site_roughness_m and era5_roughness_m:
        log_ratio = (
            np.log(hub_height_m / site_roughness_m) / np.log(hub_height_m / era5_roughness_m)
        )
        ws_hub = ws_hub * log_ratio

    ws_hub.name = "wind_speed_hub"
    ws_hub.attrs.update({
        "hub_height_m": hub_height_m,
        "method": "ERA5 10/100 m shear, clipped, power-law extrapolation",
        "alpha_clip": alpha_clip,
        "roughness_corrected": bool(site_roughness_m and era5_roughness_m),
    })
    return ws_hub


def bias_correct_against_mast(
    modelled: xr.DataArray,
    mast_ws: xr.DataArray,
    *,
    method: str = "ratio",
) -> tuple[xr.DataArray, dict]:
    """Measure-correlate-predict, in its simplest defensible form."""
    common = xr.align(modelled, mast_ws, join="inner")
    m, o = common[0], common[1]
    if len(m) < 24 * 30 * 6:
        raise ValueError("under six months of concurrent data — MCP is not defensible")

    if method == "ratio":
        factor = float(o.mean() / m.mean())
        corrected = modelled * factor
        params = {"method": "ratio", "factor": factor}
    else:
        slope = float(((m - m.mean()) * (o - o.mean())).sum() / ((m - m.mean()) ** 2).sum())
        intercept = float(o.mean() - slope * m.mean())
        corrected = modelled * slope + intercept
        params = {"method": "linear", "slope": slope, "intercept": intercept}

    resid = o - (m * params.get("factor", params.get("slope", 1.0)))
    params["r"] = float(np.corrcoef(m.values.ravel(), o.values.ravel())[0, 1])
    params["residual_std_ms"] = float(resid.std())
    params["concurrent_hours"] = int(len(m))
    return corrected, params
```

Clipping the hourly shear exponent is the detail that prevents the worst failure. In a calm hour the
10-metre speed approaches zero, the ratio explodes, and an unclipped exponent extrapolated to 140
metres produces a wind speed of hundreds of metres per second in a handful of hours — which then
dominates any energy calculation because power goes with the cube.

<svg viewBox="0 0 940 392" role="img" aria-label="The three uncertainty terms left in a reanalysis-derived hub-height mean, at two site types. On flat terrain, representativeness contributes about 3 percent, extrapolation from 100 to 140 metres about 3, and the bias-correction residual about 4, combining to roughly 6 percent on speed. In complex terrain representativeness alone is 15 percent and dominates everything else, combining to about 16." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Uncertainty terms on a reanalysis hub-height estimate</title>
  <desc>A stacked comparison for two site types. On flat terrain: representativeness 3 percent, extrapolation 3 percent, bias-correction residual 4 percent, combining in quadrature to about 5.8 percent on wind speed and roughly 17 percent on energy. In complex terrain: representativeness 15 percent, extrapolation 4 percent, bias residual 5 percent, combining to about 16.3 percent on speed and about 50 percent on energy. A note observes that no post-processing reduces the representativeness term — only measurement or downscaling does.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="392"/>
  <defs><marker id="er2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">What is left after every correction</text>
  <text x="40" y="76" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">flat terrain</text>
  <rect x="40" y="88" width="84.0" height="42" rx="4" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2"/>
  <rect x="128.0" y="88" width="84.0" height="42" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <rect x="216.0" y="88" width="112.0" height="42" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="346.0" y="114" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">≈ 5.8% on speed · ≈ 17% on energy</text>
  <text x="40" y="172" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">complex terrain</text>
  <rect x="40" y="184" width="420.0" height="42" rx="4" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2"/>
  <text x="250.0" y="210" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">15%</text>
  <rect x="464.0" y="184" width="112.0" height="42" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <rect x="580.0" y="184" width="140.0" height="42" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="738.0" y="210" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">≈ 16.3% on speed · ≈ 50% on energy</text>
  <rect x="40" y="268" width="14" height="14" rx="3" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.1"/>
  <text x="60" y="280" text-anchor="start" font-size="11" fill="currentColor" opacity="0.88">representativeness</text>
  <rect x="280" y="268" width="14" height="14" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1"/>
  <text x="300" y="280" text-anchor="start" font-size="11" fill="currentColor" opacity="0.88">extrapolation 100→140 m</text>
  <rect x="520" y="268" width="14" height="14" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1"/>
  <text x="540" y="280" text-anchor="start" font-size="11" fill="currentColor" opacity="0.88">MCP residual</text>
  <rect x="40" y="304" width="868" height="40" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="474.0" y="323" text-anchor="middle" font-size="11" fill="currentColor">Only measurement or mesoscale downscaling reduces the representativeness term. Every other correction on</text>
  <text x="474.0" y="338" text-anchor="middle" font-size="11" fill="currentColor">this page leaves it exactly where it was, which is why it dominates in complex terrain.</text>
</svg>

## Fallback routing and performance tuning

- **Download the pair, not just 100 metres.** The 10-metre level is what makes the shear hourly rather
  than assumed, and it doubles the transfer for a large improvement.
- **Extract by point, not by area, for a site.** ERA5 is served as gridded NetCDF, and the nearest-cell
  time series for one site is a few megabytes against tens of gigabytes for a regional extract.
- **Interpolate between cells with care.** Bilinear interpolation of wind components is defensible;
  interpolating speed and direction separately is not, for the same reason bearings cannot be averaged
  directly.
- **Cache by cell, not by site.** Several prospects usually fall in one ERA5 cell, so a cache keyed on
  the cell index serves them all from one download.
- **Do the MCP once per region.** The bias is regional and slowly varying, so a correction derived
  from one good mast usually improves every site within tens of kilometres.

## Downstream validation

```python
def assert_hub_estimate_defensible(ws_hub, params: dict, *, hub_height_m: float) -> None:
    """Bounds and provenance for a reanalysis-derived hub-height series."""
    mean_ws = float(ws_hub.mean())
    assert 2.0 <= mean_ws <= 12.0, f"mean hub-height wind {mean_ws:.2f} m/s outside a plausible band"
    assert float(ws_hub.max()) < 45.0, "extrapolated speeds above 45 m/s — check the shear clip"
    assert ws_hub.attrs.get("hub_height_m") == hub_height_m, "hub height not recorded on the output"
    assert "method" in ws_hub.attrs, "extrapolation method not recorded"
    if params:
        assert params.get("concurrent_hours", 0) >= 24 * 30 * 6, "MCP on under six months of data"
        assert params.get("r", 0) >= 0.7, (
            f"correlation {params.get('r'):.2f} too low for a defensible bias correction"
        )
```

## What the residual uncertainty actually is

After extrapolation, roughness correction and bias correction, a reanalysis-derived hub-height mean
still carries uncertainty, and stating it is what separates a prospecting number from a made-up one.

**Representativeness** is the largest term at complex sites: the ERA5 cell is an area average, and the
site may sit on a ridge or in a valley the model does not resolve. On flat terrain this is a few
percent; in complex terrain it can exceed 15 and no post-processing removes it.

**Extrapolation above 100 metres** adds a term that grows with the height ratio and with the spread of
the hourly shear exponent. From 100 to 140 metres with a well-behaved shear distribution it is
typically 2 to 4 percent on the mean speed — and because energy goes with the cube, 6 to 12 percent
on energy.

**Bias correction residual** is what the MCP leaves behind, and it is measurable: the residual
standard deviation and the correlation coefficient from the fit quantify it directly. A correlation
of 0.85 and a residual of 1.1 metres per second is a useful correction; 0.6 and 2.4 is a warning that
the mast and the cell are not describing the same wind.

Reporting a single hub-height number without these three is what produced the opening scenario. A
prospecting estimate should read "7.6 metres per second, plus or minus 0.6, from ERA5 with a
ridge-representativeness caveat" — which ranks sites just as well and does not promise what it cannot
deliver.

<svg viewBox="0 0 940 392" role="img" aria-label="What a measure-correlate-predict fit actually reports. Twelve months of concurrent hourly data between the ERA5 cell and a site mast give a correlation of 0.87, a ratio of 0.93 — the reanalysis reads 7 percent high — and a residual standard deviation of 1.1 metres per second. Those three numbers are the correction and its own uncertainty; a correction reported as a single factor hides the second and third." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>The three numbers a bias correction should report</title>
  <desc>A scatter of concurrent hourly wind speeds with the ERA5 cell value on the horizontal axis and the site mast on the vertical, with a fitted line of slope 0.93 passing near the origin and a one-to-one reference line above it. Three summary values are given beside it: a correlation of 0.87, a ratio of 0.93 meaning the reanalysis reads 7 percent high, and a residual standard deviation of 1.1 metres per second over 8,760 concurrent hours. A note records that a correction reported as a single factor hides the correlation and the residual, which together say how much the factor can be trusted.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="392"/>
  <defs><marker id="er3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">8 760 concurrent hours · ERA5 cell against the site mast</text>
  <line x1="90" y1="300" x2="470" y2="300" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="90" y1="70" x2="90" y2="300" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="90.0" y1="300" x2="90.0" y2="305" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="90.0" y="320" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0</text>
  <line x1="86" y1="300.0" x2="470" y2="300.0" stroke="currentColor" stroke-width="0.8" opacity="0.14"/>
  <text x="80" y="304.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0</text>
  <line x1="216.66666666666666" y1="300" x2="216.66666666666666" y2="305" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="216.66666666666666" y="320" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">6</text>
  <line x1="86" y1="225.33333333333334" x2="470" y2="225.33333333333334" stroke="currentColor" stroke-width="0.8" opacity="0.14"/>
  <text x="80" y="229.33333333333334" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">6</text>
  <line x1="343.3333333333333" y1="300" x2="343.3333333333333" y2="305" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="343.3333333333333" y="320" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">12</text>
  <line x1="86" y1="150.66666666666669" x2="470" y2="150.66666666666669" stroke="currentColor" stroke-width="0.8" opacity="0.14"/>
  <text x="80" y="154.66666666666669" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">12</text>
  <line x1="470.0" y1="300" x2="470.0" y2="305" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="470.0" y="320" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">18</text>
  <line x1="86" y1="76.0" x2="470" y2="76.0" stroke="currentColor" stroke-width="0.8" opacity="0.14"/>
  <text x="80" y="80.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">18</text>
  <text x="470" y="342" text-anchor="end" font-size="11" fill="currentColor" opacity="0.8">ERA5 m/s</text>
  <text x="20" y="62" text-anchor="start" font-size="11" fill="currentColor" opacity="0.8">mast m/s</text>
  <circle cx="308.36331449285007" cy="181.54835666765734" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="409.5537009738437" cy="149.1625241851322" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="345.41232644542254" cy="157.04672604822582" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="258.5582849975111" cy="209.1519399635951" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="409.84073816057713" cy="142.11360247551556" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="146.95966658460682" cy="292.4743791568297" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="259.6496429087963" cy="206.6270242728727" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="292.8591539550097" cy="171.64518432089366" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="115.26393781426347" cy="283.8499492040951" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="401.28714551715257" cy="118.50687131371546" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="353.59083746033934" cy="142.3438023553354" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="155.05412693743045" cy="243.72442763739696" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="306.6377425920481" cy="180.66614492306144" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="387.0559469404671" cy="136.56771915810324" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="177.43896556789844" cy="243.69058775663825" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="387.37357016609843" cy="98.97219477188435" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="202.72441423097118" cy="221.65922172480515" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="325.757428907132" cy="174.83971090360626" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="175.9579573801455" cy="233.33340618872631" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="417.1898100115563" cy="128.2306336407051" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="394.1293090103293" cy="137.1839640470186" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="163.66386253553054" cy="247.26119814365097" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="157.25004913232723" cy="252.4972423008807" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="302.095943623535" cy="179.11325879662158" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="112.18243224632408" cy="293.27778260535246" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="209.26445611876858" cy="245.79627363835294" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="370.3085014160169" cy="158.1705226675778" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="263.49693341945135" cy="203.44787438024366" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="334.2563369223991" cy="131.25473942192514" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="118.351872807806" cy="271.4164562415342" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="348.5462015033476" cy="156.79457091805097" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="360.5615740382486" cy="153.83840293242852" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="227.06952846103363" cy="226.48532749447676" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="125.9080320324426" cy="281.19036298721835" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="168.4022822956096" cy="248.32026503546814" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="350.427641720695" cy="159.74739521492754" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="405.50196231699283" cy="115.28477269070919" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="223.46229271278332" cy="231.31447156976935" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="277.26668766393243" cy="196.28986773158536" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="348.1038289979211" cy="164.96657711754227" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="363.56622568169985" cy="147.64980543645382" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="410.61450304113595" cy="127.12190607172087" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="139.9847347655045" cy="282.74863595546276" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="401.8387198633266" cy="113.21494779177567" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="218.76496120929525" cy="214.13957235889833" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="210.0537280696983" cy="242.06301891430496" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="211.43110657118058" cy="230.99925659463278" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="158.25265857513983" cy="257.622776764766" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="329.34973043825494" cy="160.66205926401832" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="126.4859629014556" cy="280.1651109922061" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="423.56582889279576" cy="130.79603484696133" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="186.26770233163543" cy="250.1463395579907" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="299.19851433065514" cy="178.35181273450092" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="244.66758371644772" cy="228.60527494878508" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="128.7517342636107" cy="275.7045871005515" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="267.40644061104126" cy="204.52089536273436" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="376.613716814353" cy="127.7339052633441" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="411.8806559413791" cy="107.30110307957654" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="310.7375540294694" cy="177.45159235013818" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="248.72025480124952" cy="219.3039522085822" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="158.37213688219276" cy="256.10250787203813" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="254.61016705277024" cy="219.2326387166218" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="427.5560946664427" cy="92.54584607918963" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="254.73210781512518" cy="239.62602219896027" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="265.6947939869358" cy="205.68979564163186" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="203.26827320765318" cy="253.40847042134962" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="238.97775926548763" cy="210.26662853521117" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="424.1005495732797" cy="106.24319676062049" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="415.0528075473832" cy="133.04680461319728" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="218.29605186427867" cy="241.19206182609577" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="139.33795959734812" cy="276.29083485850225" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="385.7835999239234" cy="114.1890304072713" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="225.53108490164084" cy="220.39535495204512" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="331.06674843722766" cy="190.88194446370588" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="321.38361868577516" cy="172.36561055022474" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="334.1931428799004" cy="179.11730010788222" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="200.04759545161704" cy="263.0361262582092" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="329.89071395708294" cy="166.38216232008216" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="204.16425895121645" cy="218.73602159419633" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="294.98703945651044" cy="194.27591708199301" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="114.7783191682282" cy="296.3662934457035" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="323.79803701407593" cy="174.8556771130667" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="257.70845758679474" cy="200.01928210279462" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="363.6926608915348" cy="168.01560972361887" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="221.27453865321607" cy="241.86652053557407" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="373.3708560583796" cy="162.27085977759793" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="221.9587423972369" cy="212.42488633353508" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="329.08448078722137" cy="192.00272941417137" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="420.21647074005904" cy="103.04391980805718" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="278.7354700214198" cy="200.9965947047007" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="163.73244003799357" cy="242.89429679794515" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="262.23677318638056" cy="233.14600244875578" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="330.0625463117201" cy="172.59096523440797" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="165.5229167456629" cy="280.3595949689444" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="358.2287933828439" cy="170.6563471372851" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="244.3619207893795" cy="225.2318290264023" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="308.62785737269644" cy="177.13359784643" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="339.24236139377615" cy="182.61274852840984" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="119.8580827625731" cy="275.7216305061054" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="316.9815145144171" cy="163.0984146228484" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="180.4731964759875" cy="257.9701110500512" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="124.3673178151539" cy="298.94185032206167" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="260.4465208884046" cy="205.88016499331633" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="153.39462464539722" cy="260.72978101251647" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="211.6055443541411" cy="229.59279362975263" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="122.40266877259299" cy="274.0799678977702" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="258.46566297166424" cy="221.39691847305107" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="297.99650512838014" cy="173.1090512398405" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="186.4291408379404" cy="246.72814962473615" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="239.4800981411535" cy="218.33784347769998" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="199.31166688533784" cy="245.79023206880902" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="374.378296699493" cy="140.4754473826775" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="229.50633548900186" cy="205.1269921202022" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="141.13797134951733" cy="267.7249625250998" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="283.76438444773845" cy="203.3895727469253" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="414.57293729162194" cy="106.7849790334651" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="370.30974437636246" cy="168.22886176498787" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="314.5050160043762" cy="164.72426181383918" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="228.10130569032162" cy="212.73409200474765" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="289.66650495888393" cy="176.18659295301666" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="414.2284316466902" cy="103.88256119058579" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="222.29787048409196" cy="231.21778980262508" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="394.0423274915473" cy="126.77889422217527" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="290.28491536110386" cy="190.1627555496566" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="305.91432347674936" cy="169.40373252516258" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="393.350341550376" cy="118.78372003891707" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="230.1297406961707" cy="232.0965155961617" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="203.4177286482421" cy="233.74179418045074" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="419.05507653839953" cy="145.00781630832194" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="400.46441236571144" cy="105.8826406664204" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="299.78427087495635" cy="187.37132062575614" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="268.2745209713318" cy="163.80632499578797" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="242.68348759749136" cy="232.90384905182137" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="266.83343835108974" cy="167.27399927692372" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="201.80392266013598" cy="245.61417719280809" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="307.97854147716373" cy="179.4939664831419" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="251.5425284700889" cy="217.829857651528" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="372.9327906902534" cy="121.88135153213858" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="115.29215505458022" cy="296.8557876384014" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="407.2746028930713" cy="128.29152180742835" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="358.71506991881" cy="152.39296234113803" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="160.1202355127785" cy="250.75782250818588" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="424.23909241484813" cy="121.78842060118927" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="261.4110624019672" cy="187.98104492092952" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="315.32204334183086" cy="194.4174953159244" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="148.53445907938178" cy="281.6217578215445" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="351.9040262609655" cy="161.71484549570258" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="217.5496322402348" cy="214.0216508347692" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="205.10479698920955" cy="251.92524702987848" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <circle cx="225.44024900679798" cy="228.60380322415176" r="2.6" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="0.5" opacity="0.55"/>
  <path d="M90.0,300.0 L470.0,76.0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="5 4" opacity="0.55"/>
  <path d="M90.0,300.0 L470.0,91.67999999999995" fill="none" stroke="#3D8B5F" stroke-width="2.4"/>
  <text x="385.55555555555554" y="88.44444444444446" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">1:1</text>
  <rect x="520" y="90" width="388" height="48" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.5"/>
  <text x="540" y="120" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">correlation r</text>
  <text x="890" y="120" text-anchor="end" font-size="13" fill="currentColor" font-weight="700">0.87</text>
  <rect x="520" y="148" width="388" height="48" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.5"/>
  <text x="540" y="178" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">ratio (mast ÷ ERA5)</text>
  <text x="890" y="178" text-anchor="end" font-size="13" fill="currentColor" font-weight="700">0.93</text>
  <rect x="520" y="206" width="388" height="48" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2" opacity="0.5"/>
  <text x="540" y="236" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">residual σ</text>
  <text x="890" y="236" text-anchor="end" font-size="13" fill="currentColor" font-weight="700">1.1 m/s</text>
  <rect x="520" y="264" width="388" height="48" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.5"/>
  <text x="540" y="294" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">concurrent hours</text>
  <text x="890" y="294" text-anchor="end" font-size="13" fill="currentColor" font-weight="700">8 760</text>
  <rect x="520" y="330" width="388" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="714.0" y="351" text-anchor="middle" font-size="11.5" fill="currentColor">A factor without r and σ is a</text>
  <text x="714.0" y="368" text-anchor="middle" font-size="11.5" fill="currentColor">correction with no error bar</text>
</svg>

## Frequently asked questions

### Is ERA5 good enough to site a project?

For prospecting and for long-term correlation, yes. For a financeable energy estimate, no — that
needs on-site measurement, with the reanalysis used to extend the short measurement record to a
long-term climatology. That is exactly the division of labour the MCP step above implements.

### Should I use ERA5 or a mesoscale downscaled product?

A downscaled product where one exists for the region, because the representativeness term is the
dominant uncertainty and downscaling is what reduces it. ERA5's advantages are global coverage, a
long consistent record and no licensing friction, which make it the right default when a downscaled
product is unavailable or its vintage is unknown.

### How many years should the extract cover?

Twenty or more for a long-term mean, because interannual variability in wind speed is several percent
and energy scales with the cube. For a bias correction against a mast, only the concurrent period
matters, and six months is the practical minimum — a full year is better because it covers the
seasonal cycle.

### Can the same approach give a wind rose?

Yes, and it is one of the more reliable things reanalysis provides. Direction is far less sensitive to
resolution than speed, so an ERA5-derived rose is usually a good approximation of the site regime even
where the speed needs substantial correction. Decompose to components before any interpolation, for
the reasons given in the parent workflow.

### What does a negative shear exponent mean?

That wind speed decreased with height in that hour, which is physical during a low-level jet or a
strongly stable night, and also what a sensor fault or an icing event looks like. A small share of
negative hours is expected; a large share means the levels were swapped. Clipping handles the
production path and the share belongs in the pre-flight report.

### How should the estimate be recorded?

With the hub height, the extrapolation method, the shear clip, whether a roughness correction was
applied, the MCP parameters and the concurrent period they came from. Those six fields are what let
someone else reproduce the number — and the assertion above refuses to publish a series that is
missing them.

## Related

- [Wind Speed & Direction Modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/) — the parent workflow
- [Calculating Wind Shear Coefficients with Python](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/calculating-wind-shear-coefficients-with-python/) — the exponent this page derives hourly rather than assuming
- [Interpolating Sparse Met Mast Data with Kriging](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/interpolating-sparse-met-mast-data-with-kriging/) — combining reanalysis with the masts that correct it
- [Wind Farm Layout & Wake Modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-farm-layout-and-wake-modeling/) — the consumer of the hub-height field
