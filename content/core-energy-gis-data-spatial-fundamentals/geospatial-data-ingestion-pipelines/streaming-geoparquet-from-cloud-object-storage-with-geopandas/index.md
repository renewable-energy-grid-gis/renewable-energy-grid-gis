---
title: Streaming GeoParquet from Cloud Object Storage with GeoPandas
description: Read large GeoParquet from s3://, gs://, and az:// without staging to disk — fix whole-file OOM, missing fsspec/s3fs credentials, unused bbox and row-group pushdown, missing GeoParquet CRS metadata, and partition explosion.
slug: streaming-geoparquet-from-cloud-object-storage-with-geopandas
type: article
breadcrumb: Streaming GeoParquet from Object Storage
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Streaming GeoParquet from Cloud Object Storage with GeoPandas

A worker killed with `Killed` (OOM) — or a `botocore` `NoCredentialsError`, or a `GeoDataFrame` that silently comes back in `EPSG:4326` when the file never declared a frame at all — is the failure signature this page eliminates. It breaks the streaming step of the [Geospatial Data Ingestion Pipelines](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/) workflow: the moment a national interconnection-queue GeoParquet — tens of gigabytes of points partitioned by state, sitting in `s3://`, `gs://`, or `az://` — is read for a single county's worth of sites. The naive call downloads the whole object to local disk, materialises every row group into RAM, and ignores the columnar and spatial statistics that make GeoParquet worth using in the first place.

The one line that causes it looks harmless:

```python
import geopandas as gpd

# Downloads the entire object, decodes every row group, keeps every column.
sites_gdf = gpd.read_parquet("s3://grid-data/interconnection_queue/")
```

On a 40 GB dataset that call needs 40 GB of transfer and a multiple of that in decoded memory to answer a question about one bounding box. The fix is to push the spatial and column selection down into the reader so bytes flow object-store → Arrow → `GeoDataFrame` and peak memory is bounded by one batch, never the dataset.

## Root-cause analysis

Four compounding causes turn a one-line read into an OOM kill or a silently wrong frame, and each maps to a distinct fix below:

1. **Whole-file download and decode.** `read_parquet` on a URI with no filters resolves every fragment, transfers every byte, and decodes every row group into memory before you touch a row. Peak RAM scales with the dataset, not the answer, so a large national layer OOM-kills a worker that only needed one county.
2. **Missing or misconfigured object-store credentials.** `fsspec` dispatches `s3://` to `s3fs`, `gs://` to `gcsfs`, and `az://` to `adlfs`. If the backend is not installed or credentials are not on the environment, the failure surfaces deep in a `botocore`/`google.auth` stack trace at read time — after the job has already been scheduled — rather than as a clear "cannot reach this bucket" at submission.
3. **bbox and row-group pushdown never engaged.** GeoParquet is columnar and row-grouped, and GeoParquet 1.1 ships a *bbox covering column* of per-row-group `xmin/ymin/xmax/ymax` statistics. Reading the whole frame and calling `.cx[...]` or `.clip()` afterwards moves exactly the bytes the covering statistics let you skip. Column projection is the same waste in the other axis: pulling 40 attributes to compute one capacity screen.
4. **CRS metadata absent from the file.** A GeoParquet's coordinate frame lives in the file-level `geo` metadata block, not in the column dtype. When a producer writes that block with a null or absent `crs`, `geopandas` assumes `OGC:CRS84` (equivalent to [EPSG:4326](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/)) *without warning*, so a file authored in a projected frame is read back as degrees and every downstream distance is wrong.

<svg viewBox="0 0 900 470" role="img" aria-label="Four causes of failed GeoParquet streaming mapped to their fixes. Whole-file download causing OOM maps to streaming row groups by fragment via fsspec. Missing object-store credentials maps to passing storage_options and running a preflight access probe. No bbox or column pushdown maps to a bbox covering-column predicate plus column projection. Absent CRS metadata maps to asserting the geo-block CRS at the boundary." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>GeoParquet streaming failure causes mapped to fixes</title>
  <desc>A two-column matrix. On the left, four warning nodes name the causes: whole-file download OOM, missing object-store credentials, no bbox or column pushdown, and absent CRS metadata. Each connects by an arrow to a matching fix node on the right: stream row groups via fsspec, pass storage_options and preflight access, apply a bbox covering predicate plus column projection, and assert the geo-block CRS at the boundary.</desc>
  <defs>
    <style>
      .cause { fill:#FFE3BE; stroke:#F4A261; stroke-width:1.5; }
      .fix   { fill:#DDF0E2; stroke:#3D8B5F; stroke-width:1.5; }
      .lbl   { fill:currentColor; text-anchor:middle; }
      .edge  { stroke:currentColor; stroke-width:1.5; fill:none; opacity:0.85; }
      .ehead { fill:currentColor; stroke:none; opacity:0.85; }
      .hdr   { fill:currentColor; text-anchor:middle; font-weight:700; }
    </style>
  </defs>
  <text x="215" y="30" class="hdr" font-size="13">Cause</text>
  <text x="685" y="30" class="hdr" font-size="13">Fix</text>
  <!-- Row 1 -->
  <rect class="cause" x="40" y="48" width="350" height="70" rx="9"/>
  <text x="215" y="76" class="lbl" font-size="12.5" font-weight="700">Whole-file download &#8594; OOM</text>
  <text x="215" y="98" class="lbl" font-size="11">read_parquet pulls every byte to RAM</text>
  <rect class="fix" x="510" y="48" width="350" height="70" rx="9"/>
  <text x="685" y="76" class="lbl" font-size="12.5" font-weight="700">Stream row groups via fsspec</text>
  <text x="685" y="98" class="lbl" font-size="11">peak RAM bounded to one batch</text>
  <!-- Row 2 -->
  <rect class="cause" x="40" y="140" width="350" height="70" rx="9"/>
  <text x="215" y="168" class="lbl" font-size="12.5" font-weight="700">Object-store creds missing</text>
  <text x="215" y="190" class="lbl" font-size="11">fsspec / s3fs cannot authenticate</text>
  <rect class="fix" x="510" y="140" width="350" height="70" rx="9"/>
  <text x="685" y="168" class="lbl" font-size="12.5" font-weight="700">Pass storage_options</text>
  <text x="685" y="190" class="lbl" font-size="11">preflight an access + schema probe</text>
  <!-- Row 3 -->
  <rect class="cause" x="40" y="232" width="350" height="70" rx="9"/>
  <text x="215" y="260" class="lbl" font-size="12.5" font-weight="700">No bbox / column pushdown</text>
  <text x="215" y="282" class="lbl" font-size="11">full scan of every row group</text>
  <rect class="fix" x="510" y="232" width="350" height="70" rx="9"/>
  <text x="685" y="260" class="lbl" font-size="12.5" font-weight="700">bbox predicate + projection</text>
  <text x="685" y="282" class="lbl" font-size="11">prune row groups by covering box</text>
  <!-- Row 4 -->
  <rect class="cause" x="40" y="324" width="350" height="70" rx="9"/>
  <text x="215" y="352" class="lbl" font-size="12.5" font-weight="700">CRS metadata absent</text>
  <text x="215" y="374" class="lbl" font-size="11">silent EPSG:4326 assumption</text>
  <rect class="fix" x="510" y="324" width="350" height="70" rx="9"/>
  <text x="685" y="352" class="lbl" font-size="12.5" font-weight="700">Assert geo-block CRS</text>
  <text x="685" y="374" class="lbl" font-size="11">reject undeclared frames at the door</text>
  <!-- arrows -->
  <g class="edge">
    <line x1="390" y1="83" x2="504" y2="83"/><path class="ehead" d="M504 78 L512 83 L504 88 Z"/>
    <line x1="390" y1="175" x2="504" y2="175"/><path class="ehead" d="M504 170 L512 175 L504 180 Z"/>
    <line x1="390" y1="267" x2="504" y2="267"/><path class="ehead" d="M504 262 L512 267 L504 272 Z"/>
    <line x1="390" y1="359" x2="504" y2="359"/><path class="ehead" d="M504 354 L512 359 L504 364 Z"/>
  </g>
  <text x="450" y="430" class="lbl" font-size="11" opacity="0.8">Every fix runs in the preflight or the reader &#8212; never after the whole file is already in memory.</text>
</svg>

## Pre-flight validation

Surface all four causes *before* a byte of geometry is decoded. The probe below opens only the Parquet footer — the schema and file-level metadata — so it costs one small range request, not a download. It verifies object-store reachability (Cause 2), the expected columns (a schema contract), and that the file actually declares a CRS in its GeoParquet `geo` block (Cause 4):

```python
import json
import fsspec
import pyarrow.parquet as pq


def preflight_geoparquet(
    uri: str,
    *,
    storage_options: dict | None = None,
    required_cols: tuple[str, ...] = ("asset_id", "capacity_mw", "geometry"),
) -> dict:
    """Fail fast before streaming: verify object-store access, the column
    schema, and that the file declares a CRS. Reads only the Parquet footer."""
    fs, path = fsspec.core.url_to_fs(uri, **(storage_options or {}))

    # Cause 2: credentials / reachability — a clear message beats a botocore trace
    if not fs.exists(path):
        raise ConnectionError(
            f"{uri} not reachable. Check storage_options credentials "
            "(key / token / anon) and that the s3fs/gcsfs/adlfs backend is installed."
        )

    with fs.open(path, "rb") as handle:
        schema = pq.ParquetFile(handle).schema_arrow

    # Schema contract: required columns must be present
    missing = [c for c in required_cols if c not in schema.names]
    if missing:
        raise ValueError(f"{uri} missing required columns: {missing}")

    # Cause 4: GeoParquet CRS lives in the file-level 'geo' metadata, not the dtype
    geo_meta = (schema.metadata or {}).get(b"geo")
    if geo_meta is None:
        raise ValueError(f"{uri} has no GeoParquet 'geo' metadata; not valid GeoParquet.")
    geo = json.loads(geo_meta)
    primary = geo["primary_column"]
    if geo["columns"][primary].get("crs") is None:
        raise ValueError(
            f"{uri}: geometry column '{primary}' declares no CRS. geopandas would "
            "assume EPSG:4326 silently — reject and re-request a framed export instead."
        )
    return geo
```

The table below maps each probe to the failure it pre-empts:

| Pre-flight check | Cause it catches | Cost |
|------------------|------------------|------|
| `fs.exists(path)` | Missing/misconfigured credentials | One HEAD request |
| Required columns in `schema.names` | Schema drift, wrong dataset | Footer only |
| `geo` metadata present | File is not real GeoParquet | Footer only |
| `columns[primary]["crs"]` is not null | Silent EPSG:4326 assumption | Footer only |

## Fix implementation

The corrected reader streams the dataset from object storage, pushes a spatial bounding box and a column projection down into the Arrow scanner, and yields one batch at a time. Two boxes overlap exactly when their intervals overlap on both axes, and that is the predicate the GeoParquet 1.1 bbox covering column lets Arrow evaluate against each row group's statistics:

$$ \text{overlap} \iff x_{\min} \le X_{\max} \ \wedge\ x_{\max} \ge X_{\min} \ \wedge\ y_{\min} \le Y_{\max} \ \wedge\ y_{\max} \ge Y_{\min} $$

Row groups whose covering box fails that test are never opened. Parameter choices are justified for energy use: `columns` is pruned to the capacity-screen attributes, `batch_size` bounds peak memory to one batch rather than the dataset, and a true `intersects` refine follows the coarse covering-box filter so partial-overlap row groups do not leak out-of-area sites.

```python
import fsspec
import shapely
import geopandas as gpd
import pyarrow.dataset as ds
import pyarrow.compute as pc
from typing import Iterator


def stream_geoparquet_bbox(
    root_uri: str,
    bbox: tuple[float, float, float, float],
    *,
    columns: list[str] | None = None,
    storage_options: dict | None = None,
    batch_size: int = 100_000,
) -> Iterator[gpd.GeoDataFrame]:
    """Stream a GeoParquet dataset from object storage, pruning row groups by a
    spatial bbox covering column and projecting only the needed columns.
    Peak RAM ~ one batch, not the dataset."""
    preflight_geoparquet(root_uri, storage_options=storage_options)  # fail before we stream
    fs, root = fsspec.core.url_to_fs(root_uri, **(storage_options or {}))
    dataset = ds.dataset(root, filesystem=fs, format="parquet", partitioning="hive")

    minx, miny, maxx, maxy = bbox
    # GeoParquet 1.1 exposes a 'bbox' covering struct with xmin/ymin/xmax/ymax.
    b = pc.field("bbox")
    spatial = (
        (b.struct_field("xmin") <= maxx) & (b.struct_field("xmax") >= minx)
        & (b.struct_field("ymin") <= maxy) & (b.struct_field("ymax") >= miny)
    )
    clip_box = shapely.box(minx, miny, maxx, maxy)

    scanner = dataset.scanner(filter=spatial, columns=columns, batch_size=batch_size)
    for batch in scanner.to_batches():
        if batch.num_rows == 0:
            continue  # row group pruned by the covering box — never materialised
        sites_gdf = gpd.GeoDataFrame.from_arrow(batch)
        # Covering-box overlap is coarse; refine to a true geometric intersection.
        yield sites_gdf[sites_gdf.geometry.intersects(clip_box)]
```

When the covering column exists and you can hold the county-sized result in memory, `geopandas >= 1.0` collapses the whole pattern into one pushdown-aware call — it reads the same statistics and returns only the matching rows:

```python
substation_gdf = gpd.read_parquet(
    "s3://grid-data/interconnection_queue/",
    bbox=(-122.5, 37.2, -121.7, 38.0),          # county envelope in the file's CRS
    columns=["asset_id", "capacity_mw", "voltage_kv", "geometry"],
    storage_options={"anon": False},
)
```

## Fallback routing & performance tuning

Layer these strategies on top of the reader for continental datasets and CI/CD runs:

- **Contain partition explosion.** A dataset split into tens of thousands of tiny per-day, per-state files spends more time listing and opening objects than reading them. Coalesce to a few hundred megabytes per file at write time, and pass `ds.dataset(..., partitioning="hive")` a partition filter (e.g. `pc.field("state") == "CA"`) so unmatched *directories* are pruned before the bbox filter even runs.
- **Fall back gracefully when the covering column is absent.** Files written before GeoParquet 1.1 have no `bbox` struct, so the covering predicate errors. Detect its absence from the `geo` metadata (`geo["columns"][primary].get("covering")`) and fall back to a partition filter plus a post-read `.clip()`, or re-write the source with a covering column.
- **Project columns before you filter rows.** Passing `columns=[...]` reads a fraction of each row group off the wire. Combined with the bbox predicate, a one-county capacity screen against a national file can touch under 1% of the bytes.
- **Cap object-store concurrency.** Fragments are independent, so a worker pool scales linearly — but bound it, or a wide dataset opens thousands of sockets and the store throttles you. Enable `pre_buffer=True` on the scanner to coalesce the footer and column range requests.
- **Never round-trip through disk.** The entire point of `fsspec` + Arrow is that bytes stream object-store → Arrow → `GeoDataFrame`. A `download-then-read` step reintroduces the local-capacity limit and the OOM this page exists to remove.

## Downstream validation

Before a streamed frame feeds a spatial join — for example against [transmission line and substation mapping](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/) layers — gate it with an assertion suitable for a CI/CD pipeline. This catches an empty result from a mis-specified bbox, a CRS lost in the stream, and a projection that silently dropped a required column:

```python
def assert_stream_output(
    sites_gdf: gpd.GeoDataFrame,
    *,
    expected_epsg: int,
    required_cols: tuple[str, ...] = ("asset_id", "capacity_mw", "geometry"),
) -> None:
    """CI/CD gate: fail the build if the streamed frame is not join-ready."""
    assert len(sites_gdf) > 0, "empty result — bbox missed the data or over-pruned row groups"
    assert sites_gdf.crs is not None, "output lost its CRS during streaming"
    assert sites_gdf.crs.to_epsg() == expected_epsg, (
        f"CRS drift: got EPSG:{sites_gdf.crs.to_epsg()}, expected EPSG:{expected_epsg}"
    )
    missing = [c for c in required_cols if c not in sites_gdf.columns]
    assert not missing, f"projection dropped required columns: {missing}"
    assert sites_gdf.geometry.notna().all(), "null geometry rows leaked through the filter"
```

Asserting a non-empty result is not paranoia: a bounding box specified in the wrong axis order or the wrong frame silently prunes *every* row group and returns a valid, empty `GeoDataFrame` — the single most common way a streaming screen fails open. Pin `geopandas`, `pyarrow`, and the `fsspec` backend versions in `pyproject.toml` so a covering-column or metadata change cannot shift the read between runs, and validate public inputs against the schemas documented for the sources you pull, such as those from [downloading EIA and OpenEI datasets with Python requests](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/downloading-eia-and-openei-datasets-with-python-requests/).

## Related

- [Geospatial Data Ingestion Pipelines](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/) — the parent workflow whose streaming stage this page implements end to end.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — the frame discipline that makes the missing-CRS assertion enforceable.
- [Downloading EIA and OpenEI Datasets with Python Requests](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/downloading-eia-and-openei-datasets-with-python-requests/) — versioned public sources whose stable schemas back the pre-flight contract.
- [Transmission Line & Substation Mapping](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/) — a downstream consumer of the streamed, bbox-filtered site frames.
