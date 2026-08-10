---
title: Mosaicking Tiled GHI Rasters with rasterio.merge
description: Fix seams, black nodata borders, dtype/resolution errors, and MemoryError when mosaicking adjacent GHI tiles with rasterio.merge — CRS/nodata preflight, corrected merge, VRT fallback, and a CI/CD bleed assertion.
slug: mosaicking-tiled-ghi-rasters-with-rasterio-merge
type: article
breadcrumb: Mosaicking Tiled GHI Rasters
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Mosaicking Tiled GHI Rasters with rasterio.merge

Satellite and reanalysis GHI archives ship as adjacent tiles — one GeoTIFF per NSRDB grid cell or per PVGIS download box — and turning them into a single seamless surface is the first thing that breaks before any of the alignment work in [Solar Irradiance Raster Processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) can proceed. The naive call `merge([rasterio.open(p) for p in tile_paths])` returns something that *looks* like a mosaic but carries visible seams along tile boundaries, black rectangular borders where nodata was never declared, or it dies outright with `MemoryError` on a continental extent. Worse, the borders that bleed into the array are not obviously wrong: a `0` from an undeclared nodata region reads as "zero irradiance," and a mean taken over that mosaic silently understates the resource a lender treats as ground truth. This page names the four failure signatures, shows a preflight that catches them before the merge runs, and gives a corrected merge plus a windowed VRT fallback for archives too large to hold in RAM.

The whole point of a mosaic is to compute honest area statistics over it. The area-weighted mean of a merged GHI surface is only meaningful once nodata is excluded from both the numerator and the weight:

$$ \overline{\mathrm{GHI}} = \frac{\sum_{i} \mathrm{GHI}_i \, A_i}{\sum_{i} A_i}, \qquad \mathrm{GHI}_i \neq \mathrm{nodata} $$

where $A_i$ is the ground area of pixel $i$. If black-border pixels leak in with value `0` and area weight, the denominator inflates while the numerator does not, and $\overline{\mathrm{GHI}}$ drifts low in direct proportion to how much of the mosaic footprint is padding.

## Root-cause analysis

Four compounding causes account for nearly every broken GHI mosaic, and each maps to a specific fix below:

1. **Tiles in different CRS.** `rasterio.merge` does *not* reproject. It assumes every input shares one CRS and pastes pixels by their affine transforms. Feed it one tile in EPSG:4326 and its neighbour in EPSG:32610 and you get seams, gaps, or a mosaic where half the tiles land in the wrong place — no exception is raised because each file is individually valid. Uniform [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) across the tile set is a precondition, not an afterthought.
2. **nodata not set, so black borders bleed.** When a tile has no `nodata` declared, `merge` treats its fill value (often `0`) as valid data. Overlapping fill from one tile overwrites real irradiance in its neighbour, and the padded edges enter every downstream mean as spurious zeros — the black-border artefact.
3. **dtype or resolution mismatch.** `merge` requires a single output dtype and a single pixel size. A `uint16` scaled-integer tile beside a `float32` tile, or a 0.5° tile beside a 0.01° tile, triggers a dtype error or forces a silent, unintended resample that shifts pixel registration by a fraction of a cell.
4. **Overlapping tiles, wrong merge method.** Adjacent downloads usually overlap by a few pixels. The default `method="first"` keeps whichever tile was read first in the overlap zone; if that tile's edge is cloud-contaminated or nodata-padded, its garbage wins. Choosing the method deliberately (`"last"`, `"min"`, `"max"`, or a custom callable) is what controls the seam.

Beyond these, a whole-mosaic merge that materialises every tile in memory at once is the classic `MemoryError` on continental extents — addressed by the VRT fallback rather than by buying RAM.

<svg viewBox="0 0 900 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Decision flow for mosaicking GHI tiles. A tile set first passes a uniform-CRS gate; a mismatch exits to a reproject-tiles fix. It then passes a nodata-and-dtype gate; a miss exits to a set-nodata and cast-to-float32 fix. A size decision then routes small mosaics to rasterio.merge with an explicit nodata and method, and large mosaics to a windowed VRT build. Both paths converge on a downstream assertion checking no nodata bleed, expected bounds, and band count and dtype, ending at an audited mosaic." style="max-width:100%;height:auto;font-family:inherit;">
  <rect class="svg-bg" x="0" y="0" width="900" height="560"/>
  <title>GHI mosaic decision flow: CRS gate, nodata and dtype gate, size routing, and downstream assertion</title>
  <desc>A top-to-bottom flow on a left spine with a right fix lane. The input node is the tile set. The first diamond tests uniform CRS; a no branch exits right to a reproject-all-tiles fix that returns to the spine. The second diamond tests whether nodata is declared and dtype is uniform; a no branch exits right to a set-nodata and cast-to-float32 fix. A third diamond tests whether the mosaic fits in RAM; a yes path leads to rasterio.merge with explicit nodata and method, while a no path leads to a windowed VRT build with block writes. Both merge paths feed a downstream assertion node checking no nodata bleed, expected bounds, and band count and dtype, which then writes an audited mosaic.</desc>
  <defs>
    <marker id="ms-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="900" height="560" fill="none"/>
  <!-- Input -->
  <rect x="120" y="20" width="200" height="46" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="220" y="40" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Adjacent GHI tiles</text>
  <text x="220" y="57" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">tile_paths[]</text>
  <line x1="220" y1="66" x2="220" y2="98" stroke="currentColor" stroke-width="1.4" marker-end="url(#ms-arr)"/>
  <!-- Decision 1: CRS -->
  <path d="M220,100 L312,148 L220,196 L128,148 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="220" y="145" text-anchor="middle" font-size="11.5" fill="currentColor">uniform CRS?</text>
  <text x="220" y="161" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">EPSG:32610</text>
  <line x1="312" y1="148" x2="556" y2="148" stroke="currentColor" stroke-width="1.4" marker-end="url(#ms-arr)"/>
  <text x="430" y="139" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">no</text>
  <rect x="558" y="125" width="300" height="46" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="708" y="145" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">reproject all tiles</text>
  <text x="708" y="162" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">to one metric grid</text>
  <line x1="708" y1="125" x2="708" y2="90" stroke="currentColor" stroke-width="1.4"/>
  <line x1="708" y1="90" x2="222" y2="90" stroke="currentColor" stroke-width="1.4" stroke-dasharray="4 3" marker-end="url(#ms-arr)"/>
  <line x1="220" y1="196" x2="220" y2="228" stroke="currentColor" stroke-width="1.4" marker-end="url(#ms-arr)"/>
  <text x="234" y="220" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">yes</text>
  <!-- Decision 2: nodata + dtype -->
  <path d="M220,230 L312,278 L220,326 L128,278 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="220" y="274" text-anchor="middle" font-size="11.5" fill="currentColor">nodata set +</text>
  <text x="220" y="290" text-anchor="middle" font-size="11.5" fill="currentColor">dtype uniform?</text>
  <line x1="312" y1="278" x2="556" y2="278" stroke="currentColor" stroke-width="1.4" marker-end="url(#ms-arr)"/>
  <text x="430" y="269" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">no</text>
  <rect x="558" y="255" width="300" height="46" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="708" y="275" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">set nodata · cast</text>
  <text x="708" y="292" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">to float32 NaN</text>
  <line x1="558" y1="278" x2="316" y2="278" stroke="currentColor" stroke-width="1.4" stroke-dasharray="4 3" marker-end="url(#ms-arr)"/>
  <line x1="220" y1="326" x2="220" y2="358" stroke="currentColor" stroke-width="1.4" marker-end="url(#ms-arr)"/>
  <text x="234" y="350" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">yes</text>
  <!-- Decision 3: fits RAM -->
  <path d="M220,360 L312,408 L220,456 L128,408 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="220" y="405" text-anchor="middle" font-size="11.5" fill="currentColor">fits in RAM?</text>
  <!-- yes -> merge -->
  <line x1="220" y1="456" x2="220" y2="488" stroke="currentColor" stroke-width="1.4" marker-end="url(#ms-arr)"/>
  <text x="234" y="480" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">yes</text>
  <rect x="70" y="490" width="300" height="46" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="220" y="510" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="600">rasterio.merge</text>
  <text x="220" y="527" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">nodata=nan · method=</text>
  <!-- no -> VRT -->
  <line x1="312" y1="408" x2="556" y2="408" stroke="currentColor" stroke-width="1.4" marker-end="url(#ms-arr)"/>
  <text x="430" y="399" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">no</text>
  <rect x="558" y="385" width="300" height="46" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="708" y="405" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">build VRT · window</text>
  <text x="708" y="422" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">block writes · LZW</text>
  <line x1="708" y1="431" x2="708" y2="513" stroke="currentColor" stroke-width="1.4"/>
  <line x1="708" y1="513" x2="374" y2="513" stroke="currentColor" stroke-width="1.4" marker-end="url(#ms-arr)"/>
  <!-- converge to assertion -->
  <line x1="220" y1="536" x2="220" y2="556" stroke="currentColor" stroke-width="0"/>
  <rect x="120" y="540" width="470" height="0" fill="none"/>
</svg>

## Pre-flight validation

Surface all four causes *before* `merge` runs. The validator opens each tile's header only — never its full array — and raises on the exact defect so a CI/CD run fails fast with a precise message instead of writing a mosaic riddled with seams and bleed:

<svg viewBox="0 0 940 400" role="img" aria-label="Three things that go wrong where two GHI tiles meet. If nodata is left undeclared, the fill value — commonly minus 9999 — is treated as data and the seam appears as a trench in every downstream statistic. If the tiles carry different scale factors, the seam is a step. If the overlap is resolved by taking the last tile written rather than a defined rule, the seam moves when the file order changes. All three are invisible on a rendered map at national zoom." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>A seam is where three separate defects show up at once</title>
  <desc>A profile across the boundary between two GHI tiles, drawn three times. In the first, an undeclared nodata value of minus 9999 drops the profile into a deep trench at the seam. In the second, tiles with different scale factors produce a step of about 40 watts per square metre. In the third, an undefined overlap rule makes the seam position depend on file ordering, drawn as two alternative profiles. Below each, the fix: declare nodata, normalise scale before merge, and choose an explicit merge method.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="sm-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The seam between two tiles, three ways it breaks</text>
  <rect x="40" y="60" width="268" height="190" rx="8" fill="none" stroke="#5BA8C8" stroke-width="1.1" opacity="0.5"/>
  <line x1="62" y1="176" x2="286" y2="176" stroke="currentColor" stroke-width="1" opacity="0.35"/>
  <line x1="174.0" y1="74" x2="174.0" y2="216" stroke="currentColor" stroke-width="1" stroke-dasharray="4 4" opacity="0.4"/>
  <text x="174.0" y="236" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">tile seam</text>
  <path d="M62,130 L160.0,132 L168.0,204 L180.0,204 L188.0,132 L286,128" fill="none" stroke="#C85B5B" stroke-width="2.4"/>
  <text x="174.0" y="222" text-anchor="middle" font-size="10.5" fill="#7A4A1A" font-weight="700">reads as −9999</text>
  <text x="174" y="274" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">undeclared nodata</text>
  <text x="174" y="294" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">declare nodata=NaN before merge</text>
  <rect x="340" y="60" width="268" height="190" rx="8" fill="none" stroke="#5BA8C8" stroke-width="1.1" opacity="0.5"/>
  <line x1="362" y1="176" x2="586" y2="176" stroke="currentColor" stroke-width="1" opacity="0.35"/>
  <line x1="474.0" y1="74" x2="474.0" y2="216" stroke="currentColor" stroke-width="1" stroke-dasharray="4 4" opacity="0.4"/>
  <text x="474.0" y="236" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">tile seam</text>
  <path d="M362,136 L474.0,134 L474.0,104 L586,102" fill="none" stroke="#F4A261" stroke-width="2.4"/>
  <text x="530.0" y="92" text-anchor="middle" font-size="10.5" fill="#7A4A1A" font-weight="700">step ≈ 40 W/m²</text>
  <text x="474" y="274" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">mismatched scale factors</text>
  <text x="474" y="294" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">normalise scale, then merge</text>
  <rect x="640" y="60" width="268" height="190" rx="8" fill="none" stroke="#5BA8C8" stroke-width="1.1" opacity="0.5"/>
  <line x1="662" y1="176" x2="886" y2="176" stroke="currentColor" stroke-width="1" opacity="0.35"/>
  <line x1="774.0" y1="74" x2="774.0" y2="216" stroke="currentColor" stroke-width="1" stroke-dasharray="4 4" opacity="0.4"/>
  <text x="774.0" y="236" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">tile seam</text>
  <path d="M662,132 L774.0,130 L886,112" fill="none" stroke="#5BA8C8" stroke-width="2.4"/>
  <path d="M662,126 L774.0,112 L886,116" fill="none" stroke="#F4A261" stroke-width="2.4" stroke-dasharray="5 4"/>
  <text x="774.0" y="222" text-anchor="middle" font-size="10.5" fill="#7A4A1A" font-weight="700">depends on file order</text>
  <text x="774" y="274" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">undefined overlap rule</text>
  <text x="774" y="294" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">set method= explicitly</text>
  <rect x="40" y="318" width="868" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="339" text-anchor="middle" font-size="11.5" fill="currentColor">None of the three is visible on a rendered national map — they surface as a zonal mean that moves when</text>
  <text x="474.0" y="356" text-anchor="middle" font-size="11.5" fill="currentColor">the tile list is reordered, which is why the seam assertion belongs in the merge function itself.</text>
</svg>

```python
import rasterio
from rasterio.crs import CRS


def preflight_tile_set(tile_paths: list[str], target_epsg: int = 32610) -> None:
    """Raise on CRS, nodata, dtype, or resolution divergence before merge()."""
    target_crs = CRS.from_epsg(target_epsg)
    crs_seen, dtype_seen, res_seen, missing_nodata = set(), set(), set(), []

    for path in tile_paths:
        with rasterio.open(path) as tile:
            crs_seen.add(tile.crs.to_epsg() if tile.crs else None)
            dtype_seen.add(tile.dtypes[0])
            res_seen.add((round(tile.res[0], 6), round(tile.res[1], 6)))
            if tile.nodata is None:
                missing_nodata.append(path)

    # Cause 1: every tile must share the one metric CRS merge() will assume
    if crs_seen != {target_epsg}:
        raise ValueError(
            f"CRS divergence across tiles: {crs_seen}. "
            f"Reproject all tiles to EPSG:{target_epsg} before mosaicking."
        )
    # Cause 3: merge() cannot reconcile mixed dtypes or pixel sizes
    if len(dtype_seen) > 1:
        raise ValueError(f"dtype mismatch across tiles: {dtype_seen}. Cast to one dtype first.")
    if len(res_seen) > 1:
        raise ValueError(f"resolution mismatch across tiles: {res_seen}. Resample to one grid first.")
    # Cause 2: undeclared nodata is what bleeds black borders into the mean
    if missing_nodata:
        raise ValueError(
            f"{len(missing_nodata)} tile(s) have no nodata declared; "
            "fill pixels will bleed into the mosaic. Set nodata before merge()."
        )
```

| Validation step | Diagnostic | Expected outcome |
|-----------------|-----------|------------------|
| CRS uniformity | `{t.crs.to_epsg() for t in tiles}` | Single value, e.g. `{32610}` |
| nodata declared | `all(t.nodata is not None for t in tiles)` | `True` on every tile |
| dtype uniformity | `{t.dtypes[0] for t in tiles}` | Single value, e.g. `{'float32'}` |
| Resolution match | `{t.res for t in tiles}` | One pixel size within rounding tolerance |

## Fix implementation

The corrected function runs the preflight, then calls `rasterio.merge` with an explicit `nodata` and a deliberately chosen `method` so overlap zones resolve predictably. Parameter choices are justified for GHI use: `nodata=np.nan` with a `float32` output keeps padded edges out of every downstream mean; `method="max"` favours the cloud-free reading in overlaps (clouds depress GHI, so the maximum of two co-located samples is the clearer-sky value); and `resampling=Resampling.bilinear` preserves radiometric continuity if `merge` must nudge a tile onto the common grid.

<svg viewBox="0 0 940 380" role="img" aria-label="What each rasterio merge method does where two tiles overlap. first keeps the earliest tile in the list, last keeps the final one — both make the answer depend on ordering. min and max bias the overlap systematically, which is defensible only when the bias is the point, such as a conservative resource estimate. Taking a mean of the overlap is the honest default for continuous data drawn from the same source and epoch." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Five merge methods on the same overlapping pair</title>
  <desc>A row of five small panels showing the same two overlapping tile values, 640 and 682 watts per square metre, resolved by each merge method: first gives 640, last gives 682, min gives 640, max gives 682 and mean gives 661. Each is annotated with when it is the right choice — first and last only when the tile order encodes priority such as a newer vintage, min for conservative resource estimates, max for worst-case thermal studies, and mean for continuous data from one source and epoch.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="380"/>
  <defs><marker id="mm-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Overlap values 640 and 682 W/m² — five defensible answers</text>
  <rect x="40" y="62" width="156" height="150" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3" opacity="0.55"/>
  <text x="118" y="92" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">first</text>
  <text x="118" y="138" text-anchor="middle" font-size="20" fill="currentColor" font-weight="700">640</text>
  <text x="118" y="162" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">W/m²</text>
  <text x="118" y="232" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">only if order encodes priority</text>
  <rect x="218" y="62" width="156" height="150" rx="8" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3" opacity="0.55"/>
  <text x="296" y="92" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">last</text>
  <text x="296" y="138" text-anchor="middle" font-size="20" fill="currentColor" font-weight="700">682</text>
  <text x="296" y="162" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">W/m²</text>
  <text x="296" y="232" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">only if order encodes vintage</text>
  <rect x="396" y="62" width="156" height="150" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3" opacity="0.55"/>
  <text x="474" y="92" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">min</text>
  <text x="474" y="138" text-anchor="middle" font-size="20" fill="currentColor" font-weight="700">640</text>
  <text x="474" y="162" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">W/m²</text>
  <text x="474" y="232" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">conservative resource estimate</text>
  <rect x="574" y="62" width="156" height="150" rx="8" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3" opacity="0.55"/>
  <text x="652" y="92" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">max</text>
  <text x="652" y="138" text-anchor="middle" font-size="20" fill="currentColor" font-weight="700">682</text>
  <text x="652" y="162" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">W/m²</text>
  <text x="652" y="232" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">worst-case thermal study</text>
  <rect x="752" y="62" width="156" height="150" rx="8" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3" opacity="0.55"/>
  <text x="830" y="92" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">mean</text>
  <text x="830" y="138" text-anchor="middle" font-size="20" fill="currentColor" font-weight="700">661</text>
  <text x="830" y="162" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">W/m²</text>
  <text x="830" y="232" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.85">same source and epoch</text>
  <rect x="40" y="262" width="868" height="48" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="474.0" y="283" text-anchor="middle" font-size="11.5" fill="currentColor">first and last are not merge rules — they are accidents of the order the file list arrived in. If the tile</text>
  <text x="474.0" y="300" text-anchor="middle" font-size="11.5" fill="currentColor">order genuinely encodes vintage, sort on the vintage field explicitly and say so in the audit record.</text>
  <text x="40" y="348" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">Record the method with the output: two mosaics of the same tiles are not comparable without it.</text>
</svg>

```python
import numpy as np
import rasterio
from rasterio.merge import merge


def mosaic_ghi_tiles(
    tile_paths: list[str],
    dst_path: str,
    target_epsg: int = 32610,
    merge_method: str = "max",   # clouds depress GHI; max favours clear-sky overlap
) -> dict:
    """Mosaic aligned GHI tiles with explicit nodata and overlap handling."""
    preflight_tile_set(tile_paths, target_epsg)  # fail fast on the four root causes

    srcs = [rasterio.open(p) for p in tile_paths]
    try:
        ghi_array, out_transform = merge(
            srcs,
            nodata=np.nan,          # padded edges excluded from data, not read as 0
            method=merge_method,    # deterministic winner in overlap zones
            resampling=rasterio.enums.Resampling.bilinear,
            dtype="float32",
        )
        profile = srcs[0].profile | {
            "driver": "GTiff",
            "height": ghi_array.shape[1],
            "width": ghi_array.shape[2],
            "count": ghi_array.shape[0],
            "dtype": "float32",
            "nodata": np.nan,
            "crs": rasterio.crs.CRS.from_epsg(target_epsg),
            "transform": out_transform,
            "tiled": True, "blockxsize": 512, "blockysize": 512,
            "compress": "lzw",      # GHI surfaces compress well; keeps archives small
        }
        with rasterio.open(dst_path, "w", **profile) as dst:
            dst.write(ghi_array)
            dst.update_tags(SOURCE="NSRDB tiles", MERGE_METHOD=merge_method, CRS_EPSG=str(target_epsg))
    finally:
        for src in srcs:
            src.close()

    valid = np.isfinite(ghi_array)
    return {
        "shape": tuple(ghi_array.shape),
        "valid_frac": float(valid.mean()),
        "mean_ghi": float(np.nanmean(ghi_array)),
    }
```

Passing `nodata=np.nan` is the single detail that eliminates the black-border artefact: `merge` writes NaN into every gap and every masked overlap, so `np.nanmean` and the area-weighted mean above see only real irradiance. Choosing `method="max"` over the default `"first"` removes the "whichever tile loaded first wins" nondeterminism that makes mosaics irreproducible between runs.

## Fallback routing & performance tuning

When the mosaic will not fit in RAM — a continental NSRDB stack at native resolution routinely exceeds a workstation's memory — layer these strategies on top of the core function:

- **Build a VRT instead of a materialised mosaic.** `gdal.BuildVRT("stack.vrt", tile_paths)` (or `gdalbuildvrt` on the CLI) creates a virtual mosaic that references the tiles on disk with zero pixel copies. Read and write it in windows so peak memory stays proportional to one block, not the whole extent.
- **Window the write.** Iterate `dst.block_windows()` and `merge(srcs, bounds=window_bounds, ...)` per block, writing each tile of output as it is computed. This is the memory-safe equivalent of the in-RAM path and is what continental runs should default to.
- **Cast to `float32`, compress with LZW.** `float32` halves the footprint of a `float64` intermediate at no cost to GHI precision, and LZW compresses smooth irradiance fields well — both shrink the archive and the I/O the merge must stream.
- **Cap `GDAL_CACHEMAX`.** Set it (e.g. `512` MB) so GDAL's block cache, not the data, stops driving peak memory during a batch mosaic.
- **Match block size to the source tiling.** Aligning `blockxsize`/`blockysize` with the tiles' internal geometry (often 256 or 512) avoids re-blocking overhead on every window read. For the kernel trade-offs when a resample is unavoidable, see the [resampling and raster kernel quick reference](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/resampling-and-raster-kernel-quick-reference/).

## Downstream validation

Before a mosaic feeds a yield model or a spatial join, gate it with an assertion suitable for a CI/CD pipeline. This catches nodata bleed, an unexpected footprint, and any band-count or dtype regression introduced upstream:

```python
import numpy as np
import rasterio


def assert_mosaic_integrity(
    dst_path: str,
    expected_epsg: int = 32610,
    expected_bounds: tuple | None = None,
    max_zero_frac: float = 0.001,
) -> None:
    """CI/CD gate: fail the build if the GHI mosaic is not assessment-grade."""
    with rasterio.open(dst_path) as mosaic:
        assert mosaic.crs.to_epsg() == expected_epsg, "mosaic lost its target CRS"
        assert mosaic.count == 1, f"expected 1 GHI band, got {mosaic.count}"
        assert mosaic.dtypes[0] == "float32", f"expected float32, got {mosaic.dtypes[0]}"
        assert np.isnan(mosaic.nodata), "nodata must be NaN so borders stay excluded"

        ghi_array = mosaic.read(1)
        # nodata bleed check: near-zero pixels signal undeclared fill leaking in as 0
        finite = ghi_array[np.isfinite(ghi_array)]
        zero_frac = float((finite == 0).mean()) if finite.size else 1.0
        assert zero_frac <= max_zero_frac, (
            f"{zero_frac:.2%} of pixels are exactly 0 — black-border bleed suspected"
        )
        assert np.nanmax(ghi_array) <= 13.0, "GHI exceeds physical ceiling (kWh/m²/day)"

        if expected_bounds is not None:
            assert np.allclose(mosaic.bounds, expected_bounds, atol=mosaic.res[0]), (
                f"mosaic footprint {tuple(mosaic.bounds)} != expected {expected_bounds}"
            )
```

The zero-fraction test is the specific guard against Cause 2: a correctly masked mosaic has essentially no exactly-zero pixels, so a spike in that fraction is the fingerprint of undeclared nodata bleeding in as `0`. Logging `valid_frac` and the merge method as provenance keeps the mosaic auditable — an independent reviewer can see how much of the footprint was real data versus padding, mirroring the alignment discipline the aligned surfaces carry into [Stacking NASA POWER and PVGIS rasters in rasterio](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/stacking-nasa-power-and-pvgis-rasters-in-rasterio/). Pin `rasterio` and `GDAL` versions in `pyproject.toml` so a default-method change in `merge` cannot silently shift the mosaic between runs.

## Related

- [Solar Irradiance Raster Processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) — the parent workflow this mosaic feeds, with the full reproject-and-validate stage.
- [Stacking NASA POWER and PVGIS rasters in rasterio](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/stacking-nasa-power-and-pvgis-rasters-in-rasterio/) — resolving overlap and registration when combining multi-source surfaces.
- [Resampling and Raster Kernel Quick Reference](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/resampling-and-raster-kernel-quick-reference/) — choosing bilinear vs average vs nearest when a merge must resample.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — the uniform-CRS enforcement mosaicking depends on.
