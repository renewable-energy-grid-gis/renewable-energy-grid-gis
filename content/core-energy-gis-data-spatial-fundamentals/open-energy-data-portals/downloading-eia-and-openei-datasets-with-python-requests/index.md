---
title: Downloading EIA and OpenEI Datasets with Python Requests
description: Robustly pull EIA API v2 and OpenEI/NREL datasets with requests — handle API keys, 429 rate limits, pagination, silent HTML-as-200 error pages, gzip, and retries with backoff, then schema-check and cache to a validated GeoDataFrame.
slug: downloading-eia-and-openei-datasets-with-python-requests
type: article
breadcrumb: Downloading EIA & OpenEI Datasets
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Downloading EIA and OpenEI Datasets with Python Requests

A `requests.get(url).json()` one-liner against the EIA API v2 or an OpenEI/NREL endpoint works exactly once — in a notebook, on a small query, on a good day. In an unattended batch it fails in ways that never raise an exception: a truncated result set because you never paginated past the first 5,000 rows, an `HTTP 200` whose body is an HTML rate-limit page rather than JSON, or a silently gzipped payload that `json.loads` chokes on. This is the ingestion boundary that feeds every downstream workflow described in the [open energy data portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/) pattern, so a defect here propagates straight into capacity aggregates, resource rasters, and permitting deliverables. This page hardens the download step itself: a resilient `requests.Session` helper that survives real portal behavior and hands off a schema-checked, cached, coordinate-tagged table.

## The failure scenario

The concrete signatures you will hit against `api.eia.gov/v2/` and `developer.nrel.gov` / OpenEI:

- `json.decoder.JSONDecodeError: Expecting value: line 1 column 1` — the response is HTML (a rate-limit or maintenance page) or gzip bytes, not JSON, yet `response.status_code == 200`.
- A DataFrame that is exactly 5,000 rows when the series has 40,000 — EIA v2 caps `length` per request and you took the first page as the whole.
- `HTTP 429 Too Many Requests` mid-batch, or an NREL `403` once the daily key quota is spent, killing an overnight run with no retry.
- A `KeyError: 'response'` because the JSON came back shaped `{"error": "invalid api_key"}` and you indexed straight into the happy-path structure.

## Root-cause analysis

Four compounding causes account for nearly every broken portal download, and each maps to a fix stage below:

1. **API-key and envelope handling.** EIA v2 takes the key as an `api_key` query parameter and wraps data in a `{"response": {"data": [...], "total": N}}` envelope; NREL/OpenEI also key on `api_key` but return errors as `200 OK` with an `errors` array. A script that reads `payload["response"]["data"]` without first checking for an error envelope raises an opaque `KeyError` instead of the real message.
2. **Rate limiting and quotas.** Both portals throttle. EIA returns `429`; NREL enforces a rolling hourly and daily cap and returns `403`/`429` with `X-RateLimit-Remaining` headers. Without honoring `Retry-After` and backing off, a burst of parallel requests gets the whole IP throttled.
3. **Pagination.** EIA v2 paginates with `offset`/`length` and reports `response.total`; taking only the first page silently truncates every series longer than one page.
4. **Content-type and encoding traps.** A throttle or WAF response is `text/html` with a `200`, and gzip-encoded bodies decode to bytes. Trusting `status_code == 200` as "success" and calling `.json()` blindly turns both into a `JSONDecodeError` far from the cause.

<svg viewBox="0 0 900 500" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Decision flow for a resilient portal download. A request goes out through a retrying session. The response is first checked for a 200 status; non-200 with 429 or 503 routes to backoff and retry, other non-200 raises. A 200 response is then checked for a JSON content type; an HTML or gzip body routes to a decode-and-detect-error branch that raises a portal error. Valid JSON is checked for an error envelope; if an errors array or error key is present it raises the portal message, otherwise the data array is validated against a schema, cached to disk, and returned." style="width:100%;max-width:900px;height:auto;font-family:inherit">
  <title>Resilient portal download: status gate, content-type gate, error-envelope gate, then schema-validate and cache</title>
  <desc>A top-to-bottom flow with a right-hand exception lane. The request passes through a retrying session. A status gate checks for HTTP 200; 429 or 503 routes right to a backoff-and-retry node, other non-200 codes raise. A content-type gate checks for application/json; an HTML or gzip body routes right to a decode-and-detect node that raises the underlying portal error. An error-envelope gate checks the parsed JSON for an errors array; if present it raises the portal message. Otherwise the data array is schema-validated, cached to disk idempotently, and returned as a validated table.</desc>
  <defs>
    <marker id="dl-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="900" height="500" fill="none"/>
  <!-- Request -->
  <rect x="150" y="18" width="220" height="44" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="260" y="38" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="600">Session.get()</text>
  <text x="260" y="55" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">Retry adapter mounted</text>
  <line x1="260" y1="62" x2="260" y2="94" stroke="currentColor" stroke-width="1.4" marker-end="url(#dl-arr)"/>
  <!-- Status gate -->
  <path d="M260,96 L360,142 L260,188 L160,142 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="260" y="139" text-anchor="middle" font-size="11.5" fill="currentColor">status</text>
  <text x="260" y="155" text-anchor="middle" font-size="11.5" fill="currentColor">== 200?</text>
  <line x1="360" y1="142" x2="560" y2="142" stroke="currentColor" stroke-width="1.4" marker-end="url(#dl-arr)"/>
  <text x="455" y="133" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">429 / 503</text>
  <rect x="562" y="119" width="296" height="46" rx="7" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 3"/>
  <text x="710" y="139" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">honor Retry-After</text>
  <text x="710" y="156" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">exponential backoff, retry</text>
  <line x1="260" y1="188" x2="260" y2="218" stroke="currentColor" stroke-width="1.4" marker-end="url(#dl-arr)"/>
  <text x="274" y="208" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">yes</text>
  <!-- Content-type gate -->
  <path d="M260,220 L360,266 L260,312 L160,266 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="260" y="263" text-anchor="middle" font-size="11.5" fill="currentColor">JSON</text>
  <text x="260" y="279" text-anchor="middle" font-size="11.5" fill="currentColor">content-type?</text>
  <line x1="360" y1="266" x2="560" y2="266" stroke="currentColor" stroke-width="1.4" marker-end="url(#dl-arr)"/>
  <text x="455" y="257" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">html / gzip</text>
  <rect x="562" y="243" width="296" height="46" rx="7" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 3"/>
  <text x="710" y="263" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">decode &amp; detect error</text>
  <text x="710" y="280" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">raise portal message</text>
  <line x1="260" y1="312" x2="260" y2="342" stroke="currentColor" stroke-width="1.4" marker-end="url(#dl-arr)"/>
  <text x="274" y="332" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">yes</text>
  <!-- Error envelope gate -->
  <path d="M260,344 L360,390 L260,436 L160,390 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="260" y="387" text-anchor="middle" font-size="11.5" fill="currentColor">error</text>
  <text x="260" y="403" text-anchor="middle" font-size="11.5" fill="currentColor">envelope?</text>
  <line x1="360" y1="390" x2="560" y2="390" stroke="currentColor" stroke-width="1.4" marker-end="url(#dl-arr)"/>
  <text x="455" y="381" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">yes</text>
  <rect x="562" y="367" width="296" height="46" rx="7" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 3"/>
  <text x="710" y="387" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">raise portal error</text>
  <text x="710" y="404" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">e.g. invalid api_key</text>
  <line x1="160" y1="390" x2="70" y2="390" stroke="currentColor" stroke-width="1.4"/>
  <text x="120" y="381" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.75">no</text>
  <path d="M70,390 V462 H150" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#dl-arr)"/>
  <!-- Output -->
  <rect x="152" y="440" width="256" height="46" rx="7" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2"/>
  <text x="280" y="460" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">schema-check + cache</text>
  <text x="280" y="477" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">validated table returned</text>
</svg>

## Pre-flight validation

Before a batch spends a quota, confirm the key is live and the endpoint is reachable. EIA v2 exposes a cheap metadata route (`/v2/<route>` with no data rows) that returns the series envelope; a single `HEAD`-like probe surfaces an invalid key or a dead route in one call instead of failing 400 requests deep.

```python
import os
import requests


def preflight_portal(base_url: str, api_key: str, probe_route: str) -> None:
    """Fail fast if the API key is missing/invalid or the endpoint is unreachable."""
    if not api_key:
        raise ValueError("No API key set. Export EIA_API_KEY / NREL_API_KEY.")

    probe = requests.get(
        f"{base_url}/{probe_route}",
        params={"api_key": api_key, "length": 1},
        headers={"Accept": "application/json"},
        timeout=15,
    )
    ctype = probe.headers.get("Content-Type", "")
    if "json" not in ctype:
        # A 200 with text/html is a throttle or WAF page, not data.
        raise RuntimeError(
            f"Non-JSON probe response ({ctype}); endpoint likely throttling or down."
        )
    body = probe.json()
    if isinstance(body, dict) and (body.get("error") or body.get("errors")):
        raise RuntimeError(f"Portal rejected the key/route: {body.get('error') or body['errors']}")
    print(f"[preflight] {base_url}/{probe_route} reachable; key accepted.")
```

## Fix implementation

The resilient helper mounts a `urllib3` `Retry` adapter so transient `429`/`5xx` responses back off automatically, then explicitly gates content-type and the error envelope before touching the data. `raise_on_status=False` lets the retry logic exhaust its budget before we inspect the final response ourselves; `respect_retry_after_header=True` honors the portal's own `Retry-After`.

The backoff between attempt $n$ retries follows `urllib3`'s formula, so with `backoff_factor = 0.5` the delays grow geometrically:

$$t_n = \text{backoff\_factor} \times 2^{\,n-1}, \qquad n = 1, 2, 3, \dots$$

giving `0.5s, 1s, 2s, 4s` — enough to clear a short EIA throttle without stalling a pipeline for minutes.

```python
import gzip
import json
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def build_session(total_retries: int = 5, backoff_factor: float = 0.5) -> requests.Session:
    """A Session that retries 429/5xx with exponential backoff and honors Retry-After."""
    retry = Retry(
        total=total_retries,
        backoff_factor=backoff_factor,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        respect_retry_after_header=True,
        raise_on_status=False,
    )
    session = requests.Session()
    adapter = HTTPAdapter(max_retries=retry, pool_connections=8, pool_maxsize=8)
    session.mount("https://", adapter)
    session.headers.update({"Accept": "application/json", "Accept-Encoding": "gzip"})
    return session


def _parse_portal_json(resp: requests.Response) -> dict:
    """Decode a portal response, catching HTML/gzip-as-200 and error envelopes."""
    ctype = resp.headers.get("Content-Type", "")
    if "json" not in ctype:
        # requests auto-inflates declared gzip; a raw gzip body with a wrong
        # header will not be, so detect the magic bytes and inflate manually.
        raw = resp.content
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        try:
            body = json.loads(raw)
        except json.JSONDecodeError as exc:
            snippet = resp.text[:200].replace("\n", " ")
            raise RuntimeError(f"Expected JSON, got {ctype}: {snippet!r}") from exc
    else:
        body = resp.json()

    # EIA wraps errors as {"error": ...}; NREL/OpenEI as {"errors": [...]}.
    if isinstance(body, dict) and (body.get("error") or body.get("errors")):
        raise RuntimeError(f"Portal error: {body.get('error') or body['errors']}")
    return body
```

With the transport hardened, the paginated fetch walks EIA v2's `offset`/`length` window until `response.total` is exhausted, accumulating every page instead of truncating at the first:

```python
def fetch_eia_series(
    session: requests.Session,
    base_url: str,
    route: str,
    api_key: str,
    params: dict,
    page_size: int = 5000,
) -> list[dict]:
    """Fetch a full EIA v2 series across all pages; returns the flat data rows."""
    rows: list[dict] = []
    offset = 0
    while True:
        page_params = {**params, "api_key": api_key, "offset": offset, "length": page_size}
        resp = session.get(f"{base_url}/{route}", params=page_params, timeout=30)
        if resp.status_code != 200:
            raise RuntimeError(f"HTTP {resp.status_code} at offset {offset}: {resp.text[:200]}")

        envelope = _parse_portal_json(resp)["response"]
        rows.extend(envelope["data"])

        total = int(envelope.get("total", len(rows)))
        offset += page_size
        if offset >= total or not envelope["data"]:
            break
    return rows
```

Downloads are cached to disk idempotently — a deterministic filename keyed on the query means a re-run reads the parquet instead of re-hitting the quota, and a partial file is written atomically so an interrupted run never leaves corrupt cache:

```python
import hashlib
from pathlib import Path
import pandas as pd
import geopandas as gpd


def load_or_download(cache_dir: str, base_url: str, route: str, api_key: str,
                     params: dict, session: requests.Session) -> gpd.GeoDataFrame:
    """Idempotent cache: return cached parquet or download, validate, and persist."""
    key = hashlib.sha256(f"{route}:{sorted(params.items())}".encode()).hexdigest()[:16]
    cache_path = Path(cache_dir) / f"{route.replace('/', '_')}_{key}.parquet"
    if cache_path.exists():
        return gpd.read_parquet(cache_path)

    rows = fetch_eia_series(session, base_url, route, api_key, params)
    sites_df = pd.DataFrame(rows)

    # Schema check: fail loudly if the portal dropped or renamed a column.
    required = {"period", "latitude", "longitude", "capacity_mw"}
    missing = required - set(sites_df.columns)
    if missing:
        raise KeyError(f"Portal schema drift: missing columns {missing}")

    sites_df["capacity_mw"] = pd.to_numeric(sites_df["capacity_mw"], errors="coerce")
    sites_gdf = gpd.GeoDataFrame(
        sites_df,
        geometry=gpd.points_from_xy(sites_df["longitude"], sites_df["latitude"]),
        crs="EPSG:4326",  # portal lat/lon is geographic; reproject downstream
    )
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = cache_path.with_suffix(".parquet.tmp")
    sites_gdf.to_parquet(tmp)
    tmp.replace(cache_path)  # atomic swap; no half-written cache on interrupt
    return sites_gdf
```

The resulting `sites_gdf` is tagged `EPSG:4326` — the geographic frame the portals publish in — and must be reprojected to a projected zone before any distance or area math, exactly the [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) discipline the rest of the ingestion chain depends on.

## Fallback routing & performance tuning

- **Cap concurrency below the quota.** NREL enforces an hourly and daily key ceiling; run serial or with a small semaphore (2–3 in flight) and read `X-RateLimit-Remaining` to pause before you are throttled rather than after.
- **Widen the retry budget for overnight batches.** Bump `total_retries` to 8 and `backoff_factor` to 1.0 for unattended runs, where a longer stall is cheaper than a failed job.
- **Prefer bulk archives for national pulls.** When you need every EIA-860 plant or an OpenEI dataset in full, download the published CSV/ZIP archive once rather than paging the API thousands of times — reserve the API for incremental refreshes.
- **Set an explicit `timeout` on every call.** A missing timeout lets a hung portal connection block a worker indefinitely; 30s per page is a safe ceiling.
- **Key the cache on portal version.** Include the dataset's `last_updated` (or EIA release date) in the cache filename so a portal revision invalidates stale parquet instead of serving it silently, feeding the same auditable lineage the broader [geospatial data ingestion pipelines](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/) rely on.

## Downstream validation

Before the cached table feeds a scoring or resource workflow, gate it with an assertion suitable for a CI/CD pipeline. This catches truncated pagination (row-count shortfall), coordinate corruption, and dtype drift introduced by an upstream portal change:

```python
def assert_download_integrity(sites_gdf: gpd.GeoDataFrame, expected_min_rows: int) -> None:
    """CI/CD gate: fail the build if the downloaded table is not analysis-grade."""
    assert len(sites_gdf) >= expected_min_rows, (
        f"only {len(sites_gdf)} rows (< {expected_min_rows}); pagination likely truncated"
    )
    assert sites_gdf.crs is not None and sites_gdf.crs.to_epsg() == 4326, "expected EPSG:4326"

    expected_cols = {"period", "latitude", "longitude", "capacity_mw"}
    assert expected_cols <= set(sites_gdf.columns), "expected column contract violated"
    assert str(sites_gdf["capacity_mw"].dtype).startswith("float"), "capacity_mw not numeric"

    # Reject impossible coordinates that signal a lon/lat swap or nodata sentinel.
    lat, lon = sites_gdf.geometry.y, sites_gdf.geometry.x
    assert lat.between(-90, 90).all() and lon.between(-180, 180).all(), "coordinates out of range"
    assert not sites_gdf["capacity_mw"].isna().all(), "capacity_mw fully null after coercion"
```

Logging the row count and portal version alongside this assertion is what makes the download reproducible: an independent engineer can confirm the exact series, page count, and quota state behind a resource layer — the same provenance rigor applied when [validating NREL solar datasets with Python](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/validating-nrel-solar-datasets-with-python/). Pin `requests`, `urllib3`, and `geopandas` versions so a retry-semantics change cannot silently alter batch behavior between runs.

## Related

- [Open Energy Data Portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/) — the parent ingestion pattern this download step feeds.
- [Validating NREL Solar Datasets with Python](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/validating-nrel-solar-datasets-with-python/) — portal-specific schema and quality checks for NSRDB, PVWatts, and TMY3.
- [Geospatial Data Ingestion Pipelines](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/) — idempotent loading and lineage patterns the cache layer plugs into.
- [Solar Irradiance Raster Processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) — the raster stage that consumes downloaded GHI and DNI layers.
