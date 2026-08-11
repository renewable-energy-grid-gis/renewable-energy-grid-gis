---
title: Comparing Equal-Area Projections for National Solar Statistics
description: Pick the right equal-area frame for national acreage and resource statistics — Albers, Lambert Azimuthal and EASE-Grid compared on distortion, extent and convention, with the shape error each one costs.
slug: comparing-equal-area-projections-for-national-solar-statistics
type: article
breadcrumb: Comparing Equal-Area Projections
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Comparing Equal-Area Projections for National Solar Statistics

The scenario: two teams report the national land area suitable for utility-scale solar, one gets
41.2 million hectares and the other 41.9. Both used an equal-area projection, both are internally
consistent, and the 700,000-hectare gap is entirely the choice of frame — one used CONUS Albers with
its standard parallels, the other a Lambert Azimuthal centred on the continent. Equal-area preserves
area exactly, but only relative to the datum and the parameters the frame was defined with, and this
page is about choosing between them deliberately. It extends
[coordinate reference systems for energy projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/).

## Root-cause analysis

Three things separate two equal-area answers for the same geography.

1. **Datum and ellipsoid.** `EPSG:5070` is defined on NAD83 (GRS80); `EPSG:6933` is on WGS84. The two
   ellipsoids differ enough that the same polygon measures a few parts per hundred thousand apart —
   small, systematic, and enough to move a national total by hundreds of hectares.
2. **Parameter choice within the same family.** Albers takes two standard parallels, and the usual
   CONUS values of 29.5°N and 45.5°N are a convention rather than a law. Moving them changes nothing
   about area — Albers is equal-area at any parallels — but it changes shape distortion, which
   changes the result of anything that touches a boundary, buffers a feature or rasterises a mask.
3. **Extent mismatch.** A frame optimised for the contiguous states behaves badly over Alaska, and a
   global equal-area frame gives up shape fidelity everywhere. Applying a CONUS frame to a national
   statistic that includes Alaska and Hawaii is the most common source of a large, unexplained
   discrepancy.

<svg viewBox="0 0 940 400" role="img" aria-label="Equal-area frames all preserve area and differ in what they give up. Across CONUS, Albers with the conventional standard parallels holds maximum angular distortion to about 1.6 degrees, a Lambert Azimuthal centred on the continent to about 3.4, and EASE-Grid to about 9.1. Area is identical in all three; every buffer, clip and rasterisation that follows is not, because those depend on shape." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Angular distortion across CONUS for three equal-area frames</title>
  <desc>A comparison of three equal-area frames over the contiguous United States. For each, a row gives the maximum angular distortion within the extent and a small shape sample showing a circle as it appears in that frame: CONUS Albers at 1.6 degrees with a nearly circular sample, Lambert Azimuthal Equal Area at 3.4 degrees with a slightly elliptical sample, and EASE-Grid 2.0 Global at 9.1 degrees with a visibly elliptical sample. All three are annotated as exactly equal-area, with a note that the differences affect buffering, clipping and rasterisation rather than acreage.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="ea1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">All three preserve area exactly — they differ in shape</text>
  <text x="900" y="30" text-anchor="end" font-size="11" fill="currentColor" opacity="0.8">dashed circle = true shape</text>
  <rect x="40" y="76" width="868" height="84" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3" opacity="0.45"/>
  <text x="64" y="112" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">EPSG:5070 · CONUS Albers</text>
  <text x="64" y="136" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">area preserved exactly</text>
  <text x="600" y="124" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">max angular distortion 1.6°</text>
  <ellipse cx="760" cy="118" rx="30.6" ry="29.41176470588235" fill="none" stroke="#3D8B5F" stroke-width="2"/>
  <circle cx="760" cy="118" r="30" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.4"/>
  <rect x="40" y="172" width="868" height="84" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3" opacity="0.45"/>
  <text x="64" y="208" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">Lambert Azimuthal, continent-centred</text>
  <text x="64" y="232" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">area preserved exactly</text>
  <text x="600" y="220" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">max angular distortion 3.4°</text>
  <ellipse cx="760" cy="214" rx="32.7" ry="27.52293577981651" fill="none" stroke="#5BA8C8" stroke-width="2"/>
  <circle cx="760" cy="214" r="30" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.4"/>
  <rect x="40" y="268" width="868" height="84" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3" opacity="0.45"/>
  <text x="64" y="304" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">EPSG:6933 · EASE-Grid 2.0 Global</text>
  <text x="64" y="328" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">area preserved exactly</text>
  <text x="600" y="316" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">max angular distortion 9.1°</text>
  <ellipse cx="760" cy="310" rx="38.1" ry="23.62204724409449" fill="none" stroke="#F4A261" stroke-width="2"/>
  <circle cx="760" cy="310" r="30" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.4"/>
  <rect x="40" y="350" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="369" text-anchor="middle" font-size="11" fill="currentColor">Equal-area is a promise about one property. Everything downstream that touches a boundary — setback</text>
  <text x="474.0" y="384" text-anchor="middle" font-size="11" fill="currentColor">buffers, constraint clips, mask rasterisation — depends on the property these frames trade away.</text>
</svg>

## Pre-flight validation

The check that settles most arguments is direct: measure a known reference polygon in each candidate
frame and compare. Any frame that is genuinely equal-area agrees on area to floating-point precision
within a datum; the differences that appear are datum differences, and seeing them is the point.

```python
import geopandas as gpd

CANDIDATES = {
    "EPSG:5070": "NAD83 / CONUS Albers",
    "EPSG:6933": "WGS84 / NSIDC EASE-Grid 2.0 Global",
    "EPSG:9822": "Albers Equal Area (generic, parameterised)",
    "ESRI:102003": "USA Contiguous Albers Equal Area Conic",
}


def compare_equal_area_frames(layer: gpd.GeoDataFrame, *, frames=CANDIDATES) -> gpd.pd.DataFrame:
    """Area of the same layer in each candidate frame, with the spread made explicit."""
    rows = []
    for code, name in frames.items():
        try:
            projected = layer.to_crs(code)
        except Exception as exc:                      # unsupported or missing grid
            rows.append({"crs": code, "name": name, "hectares": None, "error": str(exc)[:80]})
            continue
        rows.append({
            "crs": code,
            "name": name,
            "hectares": float(projected.area.sum()) / 10_000.0,
            "error": None,
        })
    df = gpd.pd.DataFrame(rows)
    valid = df["hectares"].dropna()
    if len(valid) > 1:
        df["delta_pct"] = (df["hectares"] / valid.iloc[0] - 1.0) * 100.0
    return df
```

A spread of a few thousandths of a percent is the datum; a spread of a percent or more means one of
the frames is not equal-area, or the layer left its declared CRS somewhere upstream.

## Fix implementation

For a national statistic the defensible pattern is one declared reporting frame, chosen by extent,
with every figure measured in it and the frame recorded beside the number.

```python
import geopandas as gpd

REPORTING_FRAMES = {
    "conus": 5070,        # NAD83 / CONUS Albers — the default for the lower 48
    "alaska": 3338,       # NAD83 / Alaska Albers
    "hawaii": 102007,     # ESRI: Hawaii Albers
    "global": 6933,       # EASE-Grid 2.0 — anything outside North America
}


def national_area_by_region(
    parcels: gpd.GeoDataFrame,
    *,
    region_field: str = "region",
) -> dict:
    """Measure each region in the frame built for it, then sum. Never one frame for all."""
    totals: dict[str, float] = {}
    for region, epsg in REPORTING_FRAMES.items():
        subset = parcels[parcels[region_field] == region]
        if subset.empty:
            continue
        totals[region] = float(subset.to_crs(epsg).area.sum()) / 10_000.0

    return {
        "by_region_ha": totals,
        "total_ha": sum(totals.values()),
        "frames": {r: REPORTING_FRAMES[r] for r in totals},
        "note": "each region measured in its own equal-area frame; totals summed afterwards",
    }
```

Summing regional totals measured in regional frames is more defensible than measuring everything in
one global frame, because each regional frame is optimised for the shape fidelity of its own extent —
and shape fidelity is what every buffer, clip and rasterisation in the pipeline depends on.

<svg viewBox="0 0 940 400" role="img" aria-label="One national statistic, measured four ways. CONUS Albers applied to the lower 48 alone gives 41.19 million hectares. Adding Alaska and Hawaii measured in their own Albers frames gives 41.94 million. Measuring everything in CONUS Albers, including Alaska, gives 41.62 million and is wrong — Alaska sits far outside the frame’s intended extent. Measuring everything in EASE-Grid gives 41.93 million, which agrees with the regional approach to within the datum difference." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Four ways to compute the same national suitable-area figure</title>
  <desc>A table of four measurement strategies for the national suitable-area statistic. CONUS Albers over the lower 48 only: 41.19 million hectares, correct but incomplete. Regional frames per region, summed: 41.94 million hectares, marked as the defensible answer. CONUS Albers applied to all states including Alaska: 41.62 million hectares, marked as wrong because Alaska falls far outside the frame extent. EASE-Grid Global for everything: 41.93 million hectares, which agrees with the regional total to within four parts per hundred thousand.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="ea2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The same question, four framings, a 750 000 ha spread</text>
  <rect x="40" y="76" width="868" height="62" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3" opacity="0.5"/>
  <text x="64" y="114" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">CONUS Albers · lower 48 only</text>
  <text x="560" y="114" text-anchor="end" font-size="13.5" fill="currentColor" font-weight="700">41.19 M ha</text>
  <text x="888" y="114" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.9">correct but incomplete</text>
  <rect x="40" y="146" width="868" height="62" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3" opacity="0.5"/>
  <text x="64" y="184" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">regional frames, summed</text>
  <text x="560" y="184" text-anchor="end" font-size="13.5" fill="currentColor" font-weight="700">41.94 M ha</text>
  <text x="888" y="184" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.9">the defensible answer</text>
  <rect x="40" y="216" width="868" height="62" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3" opacity="0.5"/>
  <text x="64" y="254" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">CONUS Albers · all states</text>
  <text x="560" y="254" text-anchor="end" font-size="13.5" fill="currentColor" font-weight="700">41.62 M ha</text>
  <text x="888" y="254" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.9">Alaska outside the frame extent</text>
  <rect x="40" y="286" width="868" height="62" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3" opacity="0.5"/>
  <text x="64" y="324" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">EASE-Grid Global · everything</text>
  <text x="560" y="324" text-anchor="end" font-size="13.5" fill="currentColor" font-weight="700">41.93 M ha</text>
  <text x="888" y="324" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.9">agrees to 4e-5 with regional</text>
  <rect x="40" y="358" width="868" height="40" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="474.0" y="377" text-anchor="middle" font-size="11" fill="currentColor">The failing row is the one that looks most convenient: one frame, one call, one number — and Alaska measured</text>
  <text x="474.0" y="392" text-anchor="middle" font-size="11" fill="currentColor">thousands of kilometres outside the extent the frame was designed for.</text>
</svg>

## Fallback routing and performance tuning

- **Reproject once, at the reporting boundary.** Area measurement is the last step, not something
  every intermediate stage should do; reprojecting a national parcel layer repeatedly is pure cost.
- **Keep the analysis frame and the reporting frame separate.** Distance work belongs in a conformal
  frame and area work in an equal-area one, and the pipeline should carry both explicitly rather than
  compromising on one.
- **Watch for `ESRI:` codes in a pinned PROJ.** They resolve through a different authority and can
  disappear between PROJ versions; prefer an EPSG code where one exists.
- **Do not simplify before measuring.** A `simplify(tolerance=10)` on a national parcel layer changes
  the total area by more than the difference between any two equal-area frames.
- **Cache the reprojected geometry when iterating.** A national reprojection is tens of seconds;
  doing it inside a loop over scenarios is the usual reason a statistics run takes an hour.

## Downstream validation

```python
def assert_equal_area_consistency(df, *, max_spread_pct: float = 0.05) -> None:
    """Frames that claim to be equal-area must agree to within the datum difference."""
    valid = df.dropna(subset=["hectares"])
    assert len(valid) >= 2, "need at least two frames to compare"
    spread = (valid["hectares"].max() / valid["hectares"].min() - 1.0) * 100.0
    assert spread <= max_spread_pct, (
        f"equal-area frames disagree by {spread:.3f}% — one of them is not equal-area, "
        "or the source layer lost its CRS upstream"
    )
```

<svg viewBox="0 0 940 372" role="img" aria-label="What has to travel with a published area figure. The frame and its EPSG code, the datum, the source layer and its vintage, whether the geometry was simplified, and the region breakdown if more than one frame was used. Without those five, two correct figures from two teams cannot be reconciled, and the reconciliation is what the review will ask for." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>The five fields that make an area figure reconcilable</title>
  <desc>A record card listing the five metadata fields that must accompany a published area figure: the reporting frame with its EPSG code, the datum, the source layer name and vintage, a simplification flag with its tolerance, and the per-region breakdown when more than one frame contributed. Beside it, three questions a reviewer asks, each mapped to the field that answers it: which frame produced this number, was the geometry generalised before measurement, and how were Alaska and Hawaii handled.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="372"/>
  <defs><marker id="ea3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">A number without its frame cannot be reconciled</text>
  <rect x="40" y="66" width="440" height="46" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="95" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">reporting_frame</text>
  <text x="462" y="95" text-anchor="end" font-size="11" fill="currentColor" opacity="0.9">EPSG:5070 (+ 3338, 102007)</text>
  <rect x="40" y="120" width="440" height="46" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="149" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">datum</text>
  <text x="462" y="149" text-anchor="end" font-size="11" fill="currentColor" opacity="0.9">NAD83 (GRS80)</text>
  <rect x="40" y="174" width="440" height="46" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="203" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">source_layer</text>
  <text x="462" y="203" text-anchor="end" font-size="11" fill="currentColor" opacity="0.9">parcels_v2026-07</text>
  <rect x="40" y="228" width="440" height="46" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="257" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">simplified</text>
  <text x="462" y="257" text-anchor="end" font-size="11" fill="currentColor" opacity="0.9">false</text>
  <rect x="40" y="282" width="440" height="46" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.5"/>
  <text x="60" y="311" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">by_region_ha</text>
  <text x="462" y="311" text-anchor="end" font-size="11" fill="currentColor" opacity="0.9">{conus: …, alaska: …, hawaii: …}</text>
  <rect x="520" y="66" width="388" height="72" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2" opacity="0.45"/>
  <text x="540" y="96" text-anchor="start" font-size="11.5" fill="currentColor">which frame produced this?</text>
  <text x="540" y="118" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">→ reporting_frame</text>
  <rect x="520" y="148" width="388" height="72" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2" opacity="0.45"/>
  <text x="540" y="178" text-anchor="start" font-size="11.5" fill="currentColor">was the geometry generalised?</text>
  <text x="540" y="200" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">→ simplified</text>
  <rect x="520" y="230" width="388" height="72" rx="6" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2" opacity="0.45"/>
  <text x="540" y="260" text-anchor="start" font-size="11.5" fill="currentColor">how were AK and HI handled?</text>
  <text x="540" y="282" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">→ by_region_ha</text>
  <text x="40" y="350" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">Publish the record beside the figure and the reconciliation takes seconds instead of a rerun.</text>
</svg>


## Why the shape trade-off shows up downstream

An equal-area frame buys exact area by distorting angles, and the distortion is not uniform — it
grows with distance from the frame's standard parallels or centre. Three downstream operations
inherit that distortion, and all three are routine in a siting pipeline.

**Buffering.** A setback buffer is a constant-distance offset, and in a frame where local scale varies
with direction, the offset is only constant in the direction the frame preserves. Over CONUS Albers
the error at the extremes of the extent is fractions of a percent — irrelevant for a 500-metre
setback and visible when the same buffer is compared against one computed in a UTM zone.

**Clipping.** An intersection between two layers is exact in any frame, but the vertices that define
the result move, so the clipped boundary is a slightly different line in each frame. For screening
that difference is noise; for a boundary that will be staked it is not, which is why the final
delineation belongs in a local conformal frame and only the acreage belongs here.

**Rasterisation.** A mask burned into a grid inherits the frame's cell geometry, so a mask rasterised
in EASE-Grid and one in Albers do not align cell for cell even at the same nominal resolution. Two
masks that will be combined must be rasterised in the same frame on the same grid, which is the same
alignment discipline that governs any raster stack.

The practical resolution is to keep two frames in the pipeline and be explicit about which produced
each number: a conformal local frame for geometry that will be measured in distance or staked, and
one declared equal-area frame for every figure quoted in hectares or acres.

## Frequently asked questions

### If every equal-area frame gives the same area, why does the choice matter?

Because area is not the only thing the frame is used for. The same projected geometry gets buffered
for setbacks, clipped against constraints and rasterised into masks, and all three depend on shape
fidelity, which equal-area frames trade away at a rate that depends on their parameters and extent. A
frame that is equal-area everywhere and badly distorted at your latitude produces correct acreage and
wrong setback geometry.

### Should Albers standard parallels be tuned to the study area?

For a regional study, yes — placing them at roughly one-sixth and five-sixths of the latitude range
minimises shape distortion across the extent. For a national statistic, no: use the published
convention so the figure is comparable with everyone else's. A custom frame produces a defensible
number that nobody can reconcile.

### Is EASE-Grid a reasonable default?

Outside North America, yes, and it is the right choice for anything that has to align with satellite
products already distributed on it. Inside CONUS it gives up noticeably more shape fidelity than
Albers for no gain, so the regional frame wins.

### How large is the datum difference in practice?

Between NAD83 and WGS84, a few parts per hundred thousand on area — about 400 hectares on a 41
million hectare national figure. It is far too small to matter for a screening decision and exactly
the size that produces an unexplained discrepancy between two reports, which is why the frame belongs
in the metadata rather than in the analyst's head.

### What about areas that cross a frame's zone of validity?

Split them. A parcel layer spanning CONUS and Canada should be measured in CONUS Albers for the part
below the border and in a Canadian frame above it, or in one global equal-area frame for both — the
one thing that is not defensible is applying a frame outside its intended extent and reporting the
result as if it were.

### Does the same reasoning apply to raster statistics?

Yes, with an extra step: a raster's cell area varies across the grid unless the raster is itself in
an equal-area frame. Computing a zonal sum over a geographic raster and multiplying by a nominal cell
area is the raster equivalent of measuring in degrees, and it produces a latitude-dependent error in
the same direction every time.

## Related

- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — the parent workflow
- [Projection & CRS Quick Reference](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/projection-and-crs-quick-reference/) — the family-versus-task table this page refines
- [Calculating Buildable Area After Setback and Habitat Exclusions](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/environmental-constraint-and-exclusion-screening/calculating-buildable-area-after-setback-and-habitat-exclusions/) — the largest consumer of an equal-area frame
- [Zonal Statistics of GHI over Candidate Parcels with rasterstats](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/zonal-statistics-of-ghi-over-candidate-parcels-with-rasterstats/) — the raster equivalent of the same problem
