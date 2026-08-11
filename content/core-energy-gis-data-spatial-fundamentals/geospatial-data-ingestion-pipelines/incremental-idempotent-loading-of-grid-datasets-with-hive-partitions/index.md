---
title: Incremental, Idempotent Loading of Grid Datasets with Hive Partitions
description: Load monthly grid extracts without duplicating or losing rows — Hive-partitioned layout, deterministic keys, staging-then-rename writes, revision handling, and the row-count assertions that prove a reload changed nothing.
slug: incremental-idempotent-loading-of-grid-datasets-with-hive-partitions
type: article
breadcrumb: Incremental, Idempotent Loading
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Incremental, Idempotent Loading of Grid Datasets with Hive Partitions

The scenario: a monthly interconnection-queue load is re-run after a failure, and the resulting
dataset has 1.8 million rows where it should have 1.2 million. Every row is valid, no error was
raised, and the duplicates are invisible until a capacity total comes out 50 percent high. This page
builds the load that cannot do that, and it is the incremental-loading detail behind
[geospatial data ingestion pipelines](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/).

## Root-cause analysis

Three properties have to hold together for a reload to be a no-op, and losing any one produces a
different failure.

1. **Append semantics without a key.** Writing new rows into an existing partition duplicates
   everything the previous run already wrote. The fix is not "check before appending" — that races —
   but a deterministic key plus a whole-partition replace.
2. **A key derived from mutable fields.** Hashing the row including a `last_updated` column means the
   same asset gets a new key on every publication, so deduplication never matches and the store grows
   monotonically. The key must come from the fields that identify the thing, not from the fields that
   describe its current state.
3. **Partial writes treated as complete.** A killed job that wrote half a partition leaves a file
   every reader treats as authoritative. Staging-then-rename makes the write atomic, so a reader sees
   either the previous version or the new one.

<svg viewBox="0 0 940 452" role="img" aria-label="The Hive layout a monthly grid load writes to. Partition columns appear in the path as state and month, so a query filtered to Texas and July 2026 opens one file instead of 612. Each partition holds a single part file written by an atomic rename, and the partition columns are duplicated inside the file so a copy that loses its path keeps its identity." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Hive-partitioned layout for a monthly grid dataset</title>
  <desc>A directory tree showing a queue root with state equals TX, NM and OK directories, each containing month equals 2026-05, 2026-06 and 2026-07 directories, and each of those holding a single part.parquet file. One path is highlighted as the partition a Texas July query opens. Annotations note that the filter prunes 611 of 612 files before any bytes are read, that the partition columns are also written inside each file, and that a staging file with a dot prefix is renamed into place so a reader never sees a partial write.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="452"/>
  <defs><marker id="hv1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">One query, one file opened — the rest are never touched</text>
  <text x="40" y="74" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">queue/</text>
  <text x="70" y="100" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">state=TX</text>
  <rect x="100" y="110" width="300" height="24" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.3"/>
  <text x="114" y="126" text-anchor="start" font-size="11" fill="currentColor">month=2026-05/part.parquet</text>
  <rect x="100" y="138" width="300" height="24" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.3"/>
  <text x="114" y="154" text-anchor="start" font-size="11" fill="currentColor">month=2026-06/part.parquet</text>
  <rect x="100" y="166" width="300" height="24" rx="4" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1" opacity="0.9"/>
  <text x="114" y="182" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">month=2026-07/part.parquet</text>
  <text x="70" y="216" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">state=NM</text>
  <rect x="100" y="226" width="300" height="24" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.3"/>
  <text x="114" y="242" text-anchor="start" font-size="11" fill="currentColor">month=2026-05/part.parquet</text>
  <rect x="100" y="254" width="300" height="24" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.3"/>
  <text x="114" y="270" text-anchor="start" font-size="11" fill="currentColor">month=2026-06/part.parquet</text>
  <rect x="100" y="282" width="300" height="24" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.3"/>
  <text x="114" y="298" text-anchor="start" font-size="11" fill="currentColor">month=2026-07/part.parquet</text>
  <text x="70" y="332" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">state=OK</text>
  <rect x="100" y="342" width="300" height="24" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.3"/>
  <text x="114" y="358" text-anchor="start" font-size="11" fill="currentColor">month=2026-05/part.parquet</text>
  <rect x="100" y="370" width="300" height="24" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.3"/>
  <text x="114" y="386" text-anchor="start" font-size="11" fill="currentColor">month=2026-06/part.parquet</text>
  <rect x="100" y="398" width="300" height="24" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.3"/>
  <text x="114" y="414" text-anchor="start" font-size="11" fill="currentColor">month=2026-07/part.parquet</text>
  <rect x="470" y="100" width="438" height="73" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="689.0" y="122" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">filter: state=TX AND month=2026-07</text>
  <text x="689.0" y="141" text-anchor="middle" font-size="11.5" fill="currentColor">611 of 612 files pruned before any read</text>
  <text x="689.0" y="160" text-anchor="middle" font-size="11.5" fill="currentColor">the prune is a path match, not a scan</text>
  <rect x="470" y="216" width="438" height="54" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="689.0" y="238" text-anchor="middle" font-size="11.5" fill="currentColor">partition columns written inside the file too —</text>
  <text x="689.0" y="257" text-anchor="middle" font-size="11.5" fill="currentColor">a copy that loses its path keeps its identity</text>
  <rect x="470" y="312" width="438" height="54" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="689.0" y="334" text-anchor="middle" font-size="11.5" fill="currentColor">.staging-&lt;uuid&gt;.parquet renamed into place —</text>
  <text x="689.0" y="353" text-anchor="middle" font-size="11.5" fill="currentColor">a reader never sees a partial write</text>
</svg>

## Pre-flight validation

Before writing, confirm the batch is internally consistent: the partition columns are single-valued,
the deterministic key is unique, and the geometry column survived the read.

```python
import hashlib

import geopandas as gpd


def deterministic_key(row, *, fields: tuple[str, ...]) -> str:
    """A key built only from identity fields — never from mutable state."""
    payload = "|".join(str(row[f]) for f in fields)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:24]


def preflight_batch(
    batch: gpd.GeoDataFrame,
    *,
    partition_cols: tuple[str, ...] = ("state", "month"),
    key_fields: tuple[str, ...] = ("queue_id", "poi_name", "state"),
) -> dict:
    """Refuse a batch that cannot be written idempotently."""
    for col in partition_cols:
        values = batch[col].dropna().unique()
        if len(values) != 1:
            raise ValueError(f"{col} must be single-valued in a partition batch, got {list(values)[:5]}")

    keys = batch.apply(deterministic_key, axis=1, fields=key_fields)
    dupes = int(keys.duplicated().sum())
    if dupes:
        raise ValueError(f"{dupes} duplicate keys within the batch — key fields are not identifying")

    if batch.geometry.isna().any():
        raise ValueError("null geometry in the batch — quarantine before loading")

    return {
        "rows": len(batch),
        "partition": {c: batch[c].iloc[0] for c in partition_cols},
        "key_fields": key_fields,
        "unique_keys": int(keys.nunique()),
    }
```

## Fix implementation

The load below replaces one partition atomically. Replacement rather than append is what makes it
idempotent: running it twice with the same input leaves exactly the same bytes.

```python
import uuid

import fsspec
import geopandas as gpd


def load_partition(
    batch: gpd.GeoDataFrame,
    *,
    root: str,
    state: str,
    month: str,
    key_fields: tuple[str, ...],
    storage_options: dict | None = None,
) -> dict:
    """Replace one Hive partition atomically. Re-running is a no-op."""
    so = storage_options or {}
    prefix = f"{root}/queue/state={state}/month={month}"
    target = f"{prefix}/part.parquet"
    staging = f"{prefix}/.staging-{uuid.uuid4().hex}.parquet"

    prepared = batch.copy()
    prepared["asset_key"] = prepared.apply(deterministic_key, axis=1, fields=key_fields)
    # Last write wins within a batch: a republished row supersedes its predecessor.
    prepared = prepared.sort_values("published_at").drop_duplicates("asset_key", keep="last")

    prepared.to_parquet(staging, index=False, storage_options=so)

    fs, _ = fsspec.core.url_to_fs(target, **so)
    fs.mv(staging.replace(f"{root}/", ""), target.replace(f"{root}/", "")) if False else fs.mv(
        _strip_protocol(fs, staging), _strip_protocol(fs, target)
    )

    return {
        "partition": f"{state}/{month}",
        "rows_written": len(prepared),
        "rows_in": len(batch),
        "superseded": len(batch) - len(prepared),
        "target": target,
    }


def _strip_protocol(fs, uri: str) -> str:
    return fs._strip_protocol(uri)
```

The `sort_values("published_at").drop_duplicates(keep="last")` pair is the revision policy made
explicit. Energy portals republish corrected rows, and a load that keeps the first occurrence
silently ignores every correction — a failure that is much harder to notice than a duplicate.

<svg viewBox="0 0 940 396" role="img" aria-label="What a re-run does under three write strategies. Appending to the partition doubles it: 1.2 million rows become 2.4 million and every capacity total doubles with them. Merging on a key derived from mutable fields grows the store, because a revised row hashes differently and never matches. Replacing the partition atomically leaves exactly 1.2 million rows, byte-identical to the first run." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Re-running the same load under three strategies</title>
  <desc>Three rows showing the outcome of loading the same 1.2 million row batch twice. Append: 2.4 million rows after the second run, with every downstream total doubled. Merge on a key built from mutable fields: 1.9 million rows, because revised rows hash differently and are added rather than matched. Atomic partition replace: 1.2 million rows, byte-identical to the first run. Each row is annotated with whether the second run is detectable from the data alone.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="hv2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Load the same batch twice — three outcomes</text>
  <text x="240" y="108" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">append</text>
  <rect x="256" y="76" width="498.46153846153845" height="52" rx="5" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="766.4615384615385" y="100" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">2.4 M rows · totals doubled</text>
  <text x="766.4615384615385" y="120" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">no error, no warning</text>
  <text x="240" y="178" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">merge on a mutable-field key</text>
  <rect x="256" y="146" width="394.6153846153846" height="52" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="662.6153846153845" y="170" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">1.9 M rows · revisions added</text>
  <text x="662.6153846153845" y="190" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">grows every month</text>
  <text x="240" y="248" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">atomic partition replace</text>
  <rect x="256" y="216" width="249.23076923076923" height="52" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="517.2307692307693" y="240" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">1.2 M rows · byte-identical</text>
  <text x="517.2307692307693" y="260" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">re-run is a no-op</text>
  <line x1="505.2307692307692" y1="66" x2="505.2307692307692" y2="292" stroke="currentColor" stroke-width="1.3" stroke-dasharray="5 4" opacity="0.55"/>
  <text x="505.2307692307692" y="306" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">expected: 1.2 M rows</text>
  <rect x="40" y="326" width="868" height="40" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="474.0" y="345" text-anchor="middle" font-size="11" fill="currentColor">The append case is the dangerous one: every row is valid, the schema passes, and the only symptom is a</text>
  <text x="474.0" y="360" text-anchor="middle" font-size="11" fill="currentColor">capacity total that is exactly twice what it should be.</text>
</svg>

## Fallback routing and performance tuning

- **Partition by the grain queries filter on.** State and month are the natural grain for queue data;
  partitioning by an ingestion batch identifier makes every query a full scan.
- **Keep partitions between 128 MB and 1 GB.** Tens of thousands of small partitions cost more in
  object listing than they save in pruning, which is the same trade covered in
  [streaming GeoParquet from cloud object storage](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/streaming-geoparquet-from-cloud-object-storage-with-geopandas/).
- **Write the partition columns into the file as well as the path.** A reader that loses the Hive
  path — a file copied elsewhere, a manifest built by hand — otherwise loses the partition identity.
- **Re-examine a freshness window, not the whole history.** Three months of monthly data is a cheap
  nightly sweep; re-loading five years every night is not, and nothing older changes without a
  deliberate backfill.
- **Record the source fingerprint on the partition.** It is what lets the next run skip a partition
  whose input has not changed, rather than rewriting identical bytes.

## Downstream validation

```python
import geopandas as gpd


def assert_partition_idempotent(
    root: str, state: str, month: str, *, expected_rows: int, storage_options=None
) -> None:
    """Re-read the partition and prove the load did what it claimed."""
    path = f"{root}/queue/state={state}/month={month}/part.parquet"
    got = gpd.read_parquet(path, storage_options=storage_options or {})
    assert len(got) == expected_rows, f"partition holds {len(got)} rows, expected {expected_rows}"
    assert got["asset_key"].is_unique, "duplicate asset keys survived the load"
    assert (got["state"] == state).all(), "partition contains rows from another state"
    assert (got["month"] == month).all(), "partition contains rows from another month"
    assert got.geometry.notna().all(), "null geometry reached the store"
```

<svg viewBox="0 0 940 384" role="img" aria-label="The four assertions a partition load should make, and what each catches. Row count equal to the expected batch size catches an append. Unique asset keys catch a key built from mutable fields. Single-valued partition columns catch a batch written into the wrong partition. And non-null geometry catches rows that should have been quarantined upstream." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Four post-load assertions and the failure each one catches</title>
  <desc>A four-row table pairing an assertion with the failure it catches. Row count equals the expected batch size catches an append that duplicated the partition. Unique asset keys catch a deterministic key that included a mutable field. Partition columns being single-valued catches a batch written into the wrong path. Non-null geometry catches rows that bypassed the quarantine. A note records that all four run against the re-read partition rather than against the in-memory batch, because the point is to check what actually landed.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="384"/>
  <defs><marker id="hv3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Assert against the re-read partition, not the batch in memory</text>
  <rect x="40" y="68" width="400" height="58" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="240" y="103" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">len(partition) == expected_rows</text>
  <line x1="446" y1="97" x2="478" y2="97" stroke="currentColor" stroke-width="1.4" marker-end="url(#hv3-arr)"/>
  <rect x="486" y="68" width="422" height="58" rx="7" fill="none" stroke="#C85B5B" stroke-width="1.1" opacity="0.6"/>
  <text x="697" y="103" text-anchor="middle" font-size="11.5" fill="currentColor">an append that duplicated the partition</text>
  <rect x="40" y="136" width="400" height="58" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="240" y="171" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">asset_key.is_unique</text>
  <line x1="446" y1="165" x2="478" y2="165" stroke="currentColor" stroke-width="1.4" marker-end="url(#hv3-arr)"/>
  <rect x="486" y="136" width="422" height="58" rx="7" fill="none" stroke="#F4A261" stroke-width="1.1" opacity="0.6"/>
  <text x="697" y="171" text-anchor="middle" font-size="11.5" fill="currentColor">a key built from a mutable field</text>
  <rect x="40" y="204" width="400" height="58" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="240" y="239" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">state and month single-valued</text>
  <line x1="446" y1="233" x2="478" y2="233" stroke="currentColor" stroke-width="1.4" marker-end="url(#hv3-arr)"/>
  <rect x="486" y="204" width="422" height="58" rx="7" fill="none" stroke="#5BA8C8" stroke-width="1.1" opacity="0.6"/>
  <text x="697" y="239" text-anchor="middle" font-size="11.5" fill="currentColor">a batch written to the wrong path</text>
  <rect x="40" y="272" width="400" height="58" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="240" y="307" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">geometry.notna().all()</text>
  <line x1="446" y1="301" x2="478" y2="301" stroke="currentColor" stroke-width="1.4" marker-end="url(#hv3-arr)"/>
  <rect x="486" y="272" width="422" height="58" rx="7" fill="none" stroke="#3D8B5F" stroke-width="1.1" opacity="0.6"/>
  <text x="697" y="307" text-anchor="middle" font-size="11.5" fill="currentColor">rows that bypassed the quarantine</text>
  <text x="40" y="356" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">Re-reading costs a second and is the only check that sees what the object store actually holds.</text>
</svg>


## Handling revisions without losing history

A whole-partition replace is the right default and it throws away the previous version, which is
usually fine and occasionally not — a figure that appeared in a submission has to remain
reconstructible even after the source revises it.

The cheap pattern is a dated archive alongside the live partition. Before the rename, copy the
existing part file to an archive prefix keyed by the load date; the live path always holds the
current truth and the archive holds what was true on each load date. Storage is negligible for
tabular grid data, and the archive answers the only question anyone asks retrospectively: what did
this dataset say on the date the study was run.

The alternative — versioning inside the partition with a validity interval per row — is more precise
and much more invasive, because every downstream query then has to filter on the interval or it sees
several versions of the same asset. That cost is worth paying when the pipeline itself needs
as-of queries, and not worth paying when the requirement is simply "reproduce last quarter's
number".

Whichever is chosen, record the load date and the source fingerprint on the partition. Those two
fields are what let a rerun decide whether anything actually changed, and what let a reviewer tie a
published figure to the bytes that produced it.

## Frequently asked questions

### Why replace the whole partition instead of merging?

Because a merge has to read, combine and write anyway, and doing it as a replace makes the result a
pure function of the input batch. A merge that reads the existing partition also inherits whatever is
wrong with it, so a bad load has to be undone manually; a replace overwrites it. Where history
genuinely matters, keep the previous version as a separate dated artefact rather than merging into
the live one.

### What should the deterministic key include?

The smallest set of fields that identifies the thing across publications — typically the source
identifier, the point of interconnection and the state. What it must exclude is anything that
changes when the row is revised: status, capacity, queue position and every timestamp. If the source
provides a stable identifier, use it directly and skip the hash.

### How do I handle a row that disappears from the source?

Decide the policy explicitly and record it. A whole-partition replace naturally drops it, which is
right when the source is authoritative for that month and wrong when the row was omitted by
accident. A useful middle path is to replace the partition but log the disappeared keys, so a
sudden drop in row count is visible rather than silent.

### Does this work on a local filesystem as well as object storage?

Yes, and the rename is genuinely atomic there — POSIX guarantees it within a filesystem. On object
stores the guarantee is weaker but sufficient in practice: the rename is a server-side copy plus
delete, and readers see either the old key or the new one. What breaks on both is renaming across
filesystems or buckets, which degrades to a non-atomic copy.

### Should the loader validate the schema too?

Yes, before the write and not after. A schema violation caught after a partition has been replaced
means the previous good version is already gone. The order that survives a bad batch is: validate,
stage, verify the staged file, then rename.

### How large can a single partition get before this breaks down?

The pattern holds until the partition no longer fits comfortably in the loader's memory, since the
replace reads the whole batch. At that point the answer is a finer partition grain rather than a
smarter loader — a state-month partition that exceeds a gigabyte usually means the data deserves a
daily grain.

## Related

- [Geospatial Data Ingestion Pipelines](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/) — the parent workflow and its ingestion contract
- [Handling Schema Drift in Interconnection Queue Exports](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/handling-schema-drift-in-interconnection-queue-exports/) — what to do when the incoming shape changes
- [Spatial Pipeline Orchestration & Deployment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-pipeline-orchestration-and-deployment/) — the scheduler that calls this loader
- [Streaming GeoParquet from Cloud Object Storage with GeoPandas](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/streaming-geoparquet-from-cloud-object-storage-with-geopandas/) — reading the store this loader writes
