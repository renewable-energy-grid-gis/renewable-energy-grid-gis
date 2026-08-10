---
title: Reprojecting Large Raster Stacks Without Memory Spikes
description: Warp a multi-band national raster without a MemoryError — windowed reprojection, a destination grid defined up front, per-band streaming, and the arithmetic that tells you the peak before you run it.
slug: reprojecting-large-raster-stacks-without-memory-spikes
type: article
breadcrumb: Reprojecting Large Raster Stacks
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Reprojecting Large Raster Stacks Without Memory Spikes

The scenario: `rioxarray.reproject()` on an 8,760-band hourly GHI stack raises a `MemoryError` on a
64 GB machine, and the obvious fix — a bigger machine — buys one more band before it fails again.
The problem is not the machine; it is that a naive warp holds the source array, the destination array
and an intermediate simultaneously, so peak memory is roughly three times the larger of the two. This
page reprojects the same stack in bounded memory, and it is the scaling detail behind
[coordinate reference systems for energy projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/).

## Root-cause analysis

Three compounding causes turn a routine warp into an out-of-memory failure.

1. **Whole-array semantics.** `reproject` on an in-memory array allocates the destination before it
   writes into it, and the resampling kernel needs the source resident at the same time. For a
   61,000 by 58,000 float32 band that is 14.2 GB twice over before any intermediate.
2. **A destination grid derived implicitly.** When the target transform and shape are not specified,
   the warp computes them from the source bounds, which can produce a destination substantially
   larger than the source — a rotation of a few degrees expands the bounding box, and a poorly chosen
   target resolution can multiply cell count.
3. **Band-major iteration on a band-minor file.** Reading band by band from a file chunked by tile
   means every band read touches every tile, so the I/O cost multiplies by the band count even when
   memory is under control.

<svg viewBox="0 0 940 396" role="img" aria-label="Peak resident memory for one band of a 61,000 by 58,000 float32 raster. A whole-array warp holds the source at 14.2 gigabytes, the destination at 16.8 and an intermediate, for a peak near 37 gigabytes. A windowed warp at 2,048 pixels square holds four windows of 16.8 megabytes each, for a peak of 80 megabytes — about 460 times smaller, and flat regardless of how large the raster grows." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Whole-array warp against windowed warp, one band</title>
  <desc>Two memory bars for the same single-band reprojection. The whole-array warp shows three stacked components: a 14.2 gigabyte source array, a 16.8 gigabyte destination array and a 6 gigabyte intermediate, totalling about 37 gigabytes against a 64 gigabyte machine. The windowed warp shows a single 80 megabyte bar, annotated as four 2,048 pixel square windows in flight. A note records that the windowed figure does not change when the raster grows, because it is set by the window size and the concurrency.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="rr1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">One band, two strategies, 460× difference in peak</text>
  <text x="40" y="72" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">whole-array warp</text>
  <rect x="40" y="84" width="281.0" height="56" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="182.0" y="118" text-anchor="middle" font-size="11" fill="currentColor">source 14.2 GB</text>
  <rect x="324.0" y="84" width="333.0" height="56" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="492.0" y="118" text-anchor="middle" font-size="11" fill="currentColor">destination 16.8 GB</text>
  <rect x="660.0" y="84" width="117.0" height="56" rx="5" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="720.0" y="118" text-anchor="middle" font-size="11" fill="currentColor">intermediate 6.0 GB</text>
  <line x1="40" y1="156" x2="840" y2="156" stroke="currentColor" stroke-width="0" opacity="0"/>
  <text x="40" y="166" text-anchor="start" font-size="12.5" fill="#7A4A1A" font-weight="700">peak ≈ 37 GB on a 64 GB machine</text>
  <text x="40" y="214" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">windowed warp · 2 048 px square</text>
  <rect x="40" y="226" width="7.6" height="56" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4"/>
  <text x="70" y="260" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">80 MB</text>
  <text x="200" y="260" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.9">four windows of 16.8 MB in flight</text>
  <text x="40" y="308" text-anchor="start" font-size="12" fill="#1F5C3A" font-weight="700">peak is set by the window and the concurrency, never by the raster</text>
  <rect x="40" y="328" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="347" text-anchor="middle" font-size="11" fill="currentColor">The destination is larger than the source because a reprojection rotates the footprint, and the axis-aligned</text>
  <text x="474.0" y="362" text-anchor="middle" font-size="11" fill="currentColor">bounding box of a rotated rectangle is bigger than the rectangle.</text>
</svg>

## Pre-flight validation

The peak is computable before the run, and computing it is faster than discovering it.

```python
import numpy as np
import rasterio
from rasterio.warp import calculate_default_transform


def estimate_warp_memory(
    src_path: str,
    dst_crs: str,
    *,
    dst_resolution: float | None = None,
    window_px: int = 2048,
) -> dict:
    """Peak resident bytes for a whole-array warp versus a windowed one."""
    with rasterio.open(src_path) as src:
        transform, width, height = calculate_default_transform(
            src.crs, dst_crs, src.width, src.height, *src.bounds, resolution=dst_resolution
        )
        itemsize = np.dtype(src.dtypes[0]).itemsize
        src_band = src.width * src.height * itemsize
        dst_band = width * height * itemsize
        window_bytes = window_px * window_px * itemsize
        return {
            "bands": src.count,
            "src_band_gb": src_band / 1e9,
            "dst_band_gb": dst_band / 1e9,
            "whole_array_peak_gb": (src_band + dst_band) * 1.2 / 1e9,
            "windowed_peak_gb": window_bytes * 4 * 1.2 / 1e9,
            "dst_shape": (height, width),
            "dst_transform": transform,
        }
```

The 1.2 factor is the intermediate and bookkeeping overhead; the point of the function is not
precision but the ratio, which is typically three to four orders of magnitude.

## Fix implementation

The fix has two halves: define the destination grid explicitly, then stream windows into it. Writing
directly to a `rasterio` dataset means the destination never has to be resident either.

```python
import rasterio
from rasterio.warp import Resampling, calculate_default_transform, reproject
from rasterio.windows import Window


def reproject_stack_windowed(
    src_path: str,
    dst_path: str,
    dst_crs: str,
    *,
    dst_resolution: float | None = None,
    resampling: Resampling = Resampling.bilinear,
    window_px: int = 2048,
    compress: str = "LZW",
) -> dict:
    """Warp every band through bounded-memory windows into a tiled GeoTIFF."""
    with rasterio.open(src_path) as src:
        transform, width, height = calculate_default_transform(
            src.crs, dst_crs, src.width, src.height, *src.bounds, resolution=dst_resolution
        )
        profile = src.profile.copy()
        profile.update(
            crs=dst_crs, transform=transform, width=width, height=height,
            tiled=True, blockxsize=512, blockysize=512, compress=compress,
            BIGTIFF="IF_SAFER",
        )

        written = 0
        with rasterio.open(dst_path, "w", **profile) as dst:
            for band in range(1, src.count + 1):
                for row in range(0, height, window_px):
                    for col in range(0, width, window_px):
                        w = Window(col, row,
                                   min(window_px, width - col),
                                   min(window_px, height - row))
                        dst_arr = rasterio.band(dst, band)
                        reproject(
                            source=rasterio.band(src, band),
                            destination=dst_arr,
                            src_transform=src.transform,
                            src_crs=src.crs,
                            dst_transform=dst.window_transform(w),
                            dst_crs=dst_crs,
                            dst_nodata=src.nodata,
                            resampling=resampling,
                            num_threads=2,
                        )
                        written += 1
        return {"bands": src.count, "windows_written": written,
                "dst_shape": (height, width), "dst_crs": dst_crs}
```

Specifying `tiled=True` on the destination is not cosmetic: an untiled (striped) GeoTIFF forces every
windowed read afterwards to touch whole rows, which undoes the memory discipline at the next stage.

<svg viewBox="0 0 940 396" role="img" aria-label="How a windowed warp iterates. Windows are defined on the destination grid, not the source, so each one maps back to a source region whose shape depends on the transformation — a rectangle in the destination is a curved quadrilateral in the source. The reader fetches only that region, resamples it, and writes the destination window straight to the file, so neither full array is ever resident." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Destination windows map back to curved source regions</title>
  <desc>Two grids side by side. The destination grid on the right is divided into regular square windows, with one highlighted. An arrow runs back to the source grid on the left, where the same window corresponds to a curved quadrilateral spanning parts of several source tiles, also highlighted. A note explains that windows are defined on the destination because that is where the output is written, and that sizing them from the source produces uneven work per window.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="rr2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Windows belong to the destination grid</text>
  <text x="160" y="68" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">source grid (EPSG:4326)</text>
  <rect x="40" y="84" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="76" y="84" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="112" y="84" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="148" y="84" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="184" y="84" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="220" y="84" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="256" y="84" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="292" y="84" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="40" y="114" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="76" y="114" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="112" y="114" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="148" y="114" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="184" y="114" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="220" y="114" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="256" y="114" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="292" y="114" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="40" y="144" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="76" y="144" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="112" y="144" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="148" y="144" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="184" y="144" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="220" y="144" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="256" y="144" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="292" y="144" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="40" y="174" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="76" y="174" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="112" y="174" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="148" y="174" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="184" y="174" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="220" y="174" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="256" y="174" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="292" y="174" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="40" y="204" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="76" y="204" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="112" y="204" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="148" y="204" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="184" y="204" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="220" y="204" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="256" y="204" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="292" y="204" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="40" y="234" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="76" y="234" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="112" y="234" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="148" y="234" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="184" y="234" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="220" y="234" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="256" y="234" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="292" y="234" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="40" y="264" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="76" y="264" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="112" y="264" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="148" y="264" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="184" y="264" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="220" y="264" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="256" y="264" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="292" y="264" width="34" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <path d="M118,150 C150,140 182,150 206,168 C214,196 200,224 172,232 C142,238 118,220 112,192 Z" fill="#FFE3BE" fill-opacity="0.7" stroke="#F4A261" stroke-width="1.8"/>
  <text x="160" y="320" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">a curved quadrilateral</text>
  <line x1="348" y1="200" x2="402" y2="200" stroke="currentColor" stroke-width="1.4" marker-end="url(#rr2-arr)"/>
  <text x="375" y="186" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">read</text>
  <text x="660" y="68" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">destination grid (EPSG:5070)</text>
  <rect x="500" y="84" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="540" y="84" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="580" y="84" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="620" y="84" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="660" y="84" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="700" y="84" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="740" y="84" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="780" y="84" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="500" y="114" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="540" y="114" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="580" y="114" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="620" y="114" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="660" y="114" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="700" y="114" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="740" y="114" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="780" y="114" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="500" y="144" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="540" y="144" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="580" y="144" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="620" y="144" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="660" y="144" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="700" y="144" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="740" y="144" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="780" y="144" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="500" y="174" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="540" y="174" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="580" y="174" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="620" y="174" width="38" height="28" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.6"/>
  <rect x="660" y="174" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="700" y="174" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="740" y="174" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="780" y="174" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="500" y="204" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="540" y="204" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="580" y="204" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="620" y="204" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="660" y="204" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="700" y="204" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="740" y="204" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="780" y="204" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="500" y="234" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="540" y="234" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="580" y="234" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="620" y="234" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="660" y="234" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="700" y="234" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="740" y="234" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="780" y="234" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="500" y="264" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="540" y="264" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="580" y="264" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="620" y="264" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="660" y="264" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="700" y="264" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="740" y="264" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <rect x="780" y="264" width="38" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.25"/>
  <text x="660" y="320" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">one 2 048 px window, written straight to file</text>
  <rect x="40" y="340" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="359" text-anchor="middle" font-size="11" fill="currentColor">Sizing windows from the source produces uneven work per window and an output that is written out of order;</text>
  <text x="474.0" y="374" text-anchor="middle" font-size="11" fill="currentColor">sizing them from the destination writes tile by tile, which is also how the file will be read.</text>
</svg>

## Fallback routing and performance tuning

- **Set `GDAL_CACHEMAX` explicitly.** GDAL's block cache defaults to a share of RAM and will grow to
  fill it; a 512 MB cap keeps the peak predictable and costs almost nothing in throughput.
- **Prefer VRT for a purely lazy warp.** `gdal.BuildVRT` plus a warped VRT gives a virtual reprojected
  dataset that materialises nothing until read — ideal when only a subset will ever be consumed.
- **Choose the window from the destination, not the source.** Windows are written in destination
  space; sizing them from source tiles produces uneven work per window.
- **Reproject once, reuse many times.** A warped national product is expensive and static; a pipeline
  that warps on every run is paying that cost repeatedly for an artefact that could be cached.
- **Watch the resampling kernel's read amplification.** Lanczos reads a 6 by 6 source window per
  destination cell, so its I/O is 36 times nearest's — which on a network-backed source dominates
  everything else.

## Downstream validation

```python
import numpy as np
import rasterio


def assert_warp_integrity(src_path: str, dst_path: str, *, sample_px: int = 512) -> None:
    """Cheap post-warp checks that catch the failures a MemoryError would have hidden."""
    with rasterio.open(src_path) as src, rasterio.open(dst_path) as dst:
        assert dst.count == src.count, f"band count changed: {src.count} → {dst.count}"
        assert dst.dtypes[0] == src.dtypes[0], f"dtype changed: {src.dtypes[0]} → {dst.dtypes[0]}"
        assert dst.nodata == src.nodata, "nodata value was not carried through the warp"
        assert dst.crs.to_epsg() is not None, "destination CRS did not resolve to an EPSG code"

        w = rasterio.windows.Window(0, 0, min(sample_px, dst.width), min(sample_px, dst.height))
        sample = dst.read(1, window=w, masked=True)
        assert sample.count() > 0, "top-left window is entirely nodata — check the destination bounds"
        finite = sample.compressed()
        assert np.isfinite(finite).all(), "non-finite values introduced by the warp"
```

<svg viewBox="0 0 940 384" role="img" aria-label="Read amplification by resampling kernel on a windowed warp. Nearest reads one source cell per destination cell, bilinear four, cubic sixteen and Lanczos thirty-six — so on a network-backed source the kernel choice changes the bytes fetched by a factor of 36 even though the destination is identical in size. On a national warp that is the difference between four minutes and two hours." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Source cells read per destination cell, and what that costs over a network</title>
  <desc>A chart of four resampling kernels with the number of source cells each reads per destination cell — nearest 1, bilinear 4, cubic 16 and Lanczos 36 — alongside the measured wall clock for a national warp from a network-backed source: 4.1 minutes, 6.8 minutes, 21 minutes and 118 minutes. A note observes that the destination is identical in size in every case, so the entire difference is read amplification rather than compute.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="384"/>
  <defs><marker id="rr3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The kernel decides how many bytes cross the network</text>
  <text x="180" y="106" text-anchor="end" font-size="12.5" fill="currentColor" font-weight="700">nearest</text>
  <rect x="200" y="76" width="18.368" height="48" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="230.368" y="106" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">4.1 min · 1 source cell read</text>
  <text x="180" y="168" text-anchor="end" font-size="12.5" fill="currentColor" font-weight="700">bilinear</text>
  <rect x="200" y="138" width="30.464" height="48" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="242.464" y="168" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">6.8 min · 4 source cells read</text>
  <text x="180" y="230" text-anchor="end" font-size="12.5" fill="currentColor" font-weight="700">cubic</text>
  <rect x="200" y="200" width="94.08" height="48" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="306.08" y="230" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">21.0 min · 16 source cells read</text>
  <text x="180" y="292" text-anchor="end" font-size="12.5" fill="currentColor" font-weight="700">lanczos</text>
  <rect x="200" y="262" width="528.64" height="48" rx="5" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="740.64" y="292" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">118.0 min · 36 source cells read</text>
  <rect x="40" y="330" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="349" text-anchor="middle" font-size="11" fill="currentColor">The destination is the same size in every row — every second of the difference is bytes fetched, which is</text>
  <text x="474.0" y="364" text-anchor="middle" font-size="11" fill="currentColor">why the kernel matters far more over object storage than over a local disk.</text>
</svg>


## Choosing the destination grid deliberately

The most consequential decision in a warp is one that is usually left to a default: what the
destination grid should be. `calculate_default_transform` proposes a grid that covers the reprojected
footprint at a resolution derived from the source, and its proposal is frequently wrong in two ways.

It is wrong in **extent** when the analysis only needs a study area. A national source reprojected in
full produces a national destination, most of which will be clipped away immediately — and the warp
paid for every cell. Passing explicit destination bounds cuts both the write and the read.

It is wrong in **resolution** when the source and target frames have different units or the
reprojection stretches one axis. A 0.0417-degree source becomes something like 4,632 metres in a
metric frame, and rounding that to a convenient 5,000 or 4,000 metres is usually preferable — an
awkward resolution propagates into every downstream product and makes alignment with other layers
harder than it needs to be.

Set both explicitly, record them with the output, and the warp becomes reproducible: two people
warping the same source with the same declared grid get byte-identical results, which is not true
when both rely on a default that depends on the source extent.

## Frequently asked questions

### Should I reproject the raster or the vector?

Almost always the vector. Moving a few thousand geometries is microseconds; resampling a few billion
pixels is minutes and lossy. Reproject the raster only when the analysis is raster-on-raster and the
two grids genuinely have to align — and then reproject the smaller one.

### Does `dask` solve this?

It manages it rather than solving it. `rioxarray` with a Dask-backed array will chunk the warp and
keep peak memory bounded, which is the same win as windowing, with a scheduler attached. For a single
machine the windowed loop above is simpler and has fewer failure modes; Dask earns its complexity
when the work genuinely spans machines.

### What window size should I use?

Large enough to amortise the per-window overhead and small enough to keep several windows in flight
comfortably — 1,024 to 4,096 pixels square is the usual range for float32. Below about 512 the
per-call cost starts to dominate; above 8,192 the memory advantage erodes.

### Why did the destination come out larger than the source?

Because a reprojection rotates the footprint, and the axis-aligned bounding box of a rotated rectangle
is larger than the rectangle. Reprojecting a UTM tile to a conic frame can add 10 to 20 percent of
cells, most of them nodata. Specifying the destination bounds explicitly — clipped to the study area
— avoids paying for that.

### How do I keep the band metadata?

Copy it explicitly. `rasterio` carries the dataset profile but band descriptions and per-band tags
are not part of it, so an hourly stack that loses its timestamps in the warp becomes an anonymous
cube. Reading `src.descriptions` and `src.tags(band)` and writing them onto the destination costs
two lines and preserves the only thing that makes the stack interpretable.

### Is it worth compressing the output?

Yes, with a lossless codec. LZW with a horizontal predictor typically halves a float32 raster at
negligible read cost, and the saving compounds through every downstream read. What is not worth it is
a lossy codec on data that feeds an arithmetic chain — the artefacts are small, systematic and
impossible to distinguish from signal later.


### Can a warp be resumed after a failure?

Yes, if the destination is written window by window and the windows are addressable. Recording which
destination windows have been written — a small sidecar or a per-window checksum — lets a rerun skip
the completed ones, which on a multi-hour national warp turns a crash from a full restart into a few
minutes of catch-up. Without that record the only safe action is to start again, because a partially
written GeoTIFF is indistinguishable from a complete one.

### Does the source need to be a Cloud-Optimised GeoTIFF?

Not required, but it changes the economics substantially when the source is remote. A COG's internal
tiling and overviews mean a windowed read fetches kilobytes rather than the whole file, so the
windowed strategy above is efficient over HTTP as well as over local disk. A striped, uncompressed
GeoTIFF on object storage forces each window read to fetch whole rows, which is where most of the
"windowing did not help" reports come from.

## Related

- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — the parent workflow
- [Solar Irradiance Raster Processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) — the stacks this technique is usually applied to
- [Resampling & Raster Kernel Quick Reference](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/resampling-and-raster-kernel-quick-reference/) — choosing the kernel the warp uses
- [Mosaicking Tiled GHI Rasters with rasterio.merge](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/mosaicking-tiled-ghi-rasters-with-rasterio-merge/) — the stage that usually precedes a warp
