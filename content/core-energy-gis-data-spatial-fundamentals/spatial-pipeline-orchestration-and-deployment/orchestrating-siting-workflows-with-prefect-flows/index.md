---
title: Orchestrating Siting Workflows with Prefect Flows
description: Wire a screening pipeline into Prefect without losing idempotency — partition-parameterised tasks, concurrency limits that respect portal quotas, retries that only retry transient failures, and run records that survive the scheduler.
slug: orchestrating-siting-workflows-with-prefect-flows
type: article
breadcrumb: Orchestrating Siting Workflows with Prefect
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Orchestrating Siting Workflows with Prefect Flows

The scenario: a screening pipeline is moved from a shell script to Prefect, the DAG renders nicely,
and three weeks later a backfill produces different numbers from the nightly run for the same month.
Nothing about the geometry changed. The difference is that the backfill and the schedule reached the
same task through different code paths, and one of them passed a default parameter the other did not.
This page wires the task discipline from
[spatial pipeline orchestration and deployment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-pipeline-orchestration-and-deployment/)
into Prefect specifically.

## Root-cause analysis

Three orchestration-specific faults account for most divergence between scheduled and manual runs.

1. **Two entry points.** A `flow` invoked by the schedule and a script invoked by a human are two
   implementations that drift. Every parameter with a default is a place they can differ, and
   partition parameters are exactly the ones that get defaults.
2. **Retries that retry everything.** A schema violation retried three times is three identical
   failures and a delayed alert; a transient object-store error not retried at all is an unnecessary
   page. Prefect's `retries` argument applies to the task, so the discrimination has to happen in the
   exception types.
3. **Concurrency that ignores the far end.** A flow mapped over 51 states will happily open 51
   concurrent connections to a portal with a 10-request quota. The scheduler is not aware of the
   quota; the task has to be.

<svg viewBox="0 0 940 372" role="img" aria-label="Two entry points versus one. When the schedule calls a flow and a backfill calls a script, every parameter with a default is a place the two can differ — and the partition parameters are exactly the ones that carry defaults. Routing both through one flow, with the schedule passing a freshness window and the backfill passing an explicit partition list, removes the divergence by construction." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Two entry points drift; one entry point cannot</title>
  <desc>Two panels. The left shows a schedule calling a flow and a human calling a backfill script, each with its own defaults for the target CRS, the force flag and the quarantine threshold, converging on the same task but with different parameters. The right shows both calling one flow: the schedule passes no partitions and receives the freshness window, the backfill passes an explicit list, and every other parameter has exactly one default. The left panel is annotated as producing different numbers for the same month.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="372"/>
  <defs><marker id="pf1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The divergence is in the defaults, not in the geometry</text>
  <rect x="30" y="62" width="420" height="232" rx="9" fill="none" stroke="#C85B5B" stroke-width="1.2" opacity="0.6"/>
  <text x="240" y="88" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">two entry points</text>
  <rect x="50" y="104" width="180" height="60" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="140.0" y="124" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">schedule</text>
  <text x="140.0" y="140" text-anchor="middle" font-size="10.5" fill="currentColor">force=False</text>
  <text x="140.0" y="156" text-anchor="middle" font-size="10.5" fill="currentColor">epsg=5070</text>
  <rect x="254" y="104" width="180" height="60" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="344.0" y="124" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">backfill script</text>
  <text x="344.0" y="140" text-anchor="middle" font-size="10.5" fill="currentColor">force=True</text>
  <text x="344.0" y="156" text-anchor="middle" font-size="10.5" fill="currentColor">epsg=32614</text>
  <line x1="140" y1="176" x2="220" y2="216" stroke="currentColor" stroke-width="1.4" opacity="0.6" marker-end="url(#pf1-arr)"/>
  <line x1="344" y1="176" x2="264" y2="216" stroke="currentColor" stroke-width="1.4" opacity="0.6" marker-end="url(#pf1-arr)"/>
  <rect x="140" y="220" width="204" height="44" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.5"/>
  <text x="242.0" y="240" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">screen_partition()</text>
  <text x="242.0" y="256" text-anchor="middle" font-size="10.5" fill="currentColor">two different answers</text>
  <rect x="490" y="62" width="420" height="232" rx="9" fill="none" stroke="#3D8B5F" stroke-width="1.2" opacity="0.6"/>
  <text x="700" y="88" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">one entry point</text>
  <rect x="510" y="104" width="180" height="44" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="600.0" y="124" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">schedule</text>
  <text x="600.0" y="140" text-anchor="middle" font-size="10.5" fill="currentColor">months=None</text>
  <rect x="714" y="104" width="180" height="44" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="804.0" y="124" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">backfill</text>
  <text x="804.0" y="140" text-anchor="middle" font-size="10.5" fill="currentColor">months=[…]</text>
  <line x1="600" y1="158" x2="680" y2="216" stroke="currentColor" stroke-width="1.4" opacity="0.6" marker-end="url(#pf1-arr)"/>
  <line x1="804" y1="158" x2="724" y2="216" stroke="currentColor" stroke-width="1.4" opacity="0.6" marker-end="url(#pf1-arr)"/>
  <rect x="600" y="220" width="204" height="44" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="702.0" y="240" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">siting_screen()</text>
  <text x="702.0" y="256" text-anchor="middle" font-size="10.5" fill="currentColor">one set of defaults</text>
  <rect x="30" y="316" width="880" height="28" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="470.0" y="336" text-anchor="middle" font-size="11.5" fill="currentColor">A backfill is a scheduled run with a different partition parameter — never a second implementation.</text>
</svg>

## Pre-flight validation

Before the flow runs, assert that the partition parameters are complete and that the container stack
is the validated one. Prefect will happily run a task with `state=None` and produce a partition path
containing the string "None".

```python
from datetime import date

from prefect import get_run_logger


def validate_partition(state: str | None, month: str | None) -> tuple[str, str]:
    """Refuse to build a partition whose identity is not fully specified."""
    logger = get_run_logger()
    if not state or len(state) != 2 or not state.isalpha():
        raise ValueError(f"state must be a two-letter code, got {state!r}")
    try:
        year, mon = month.split("-")
        date(int(year), int(mon), 1)
    except (AttributeError, ValueError) as exc:
        raise ValueError(f"month must be YYYY-MM, got {month!r}") from exc
    logger.info("partition validated: %s/%s", state.upper(), month)
    return state.upper(), month
```

## Fix implementation

The flow below has one entry point. The schedule calls it with a freshness window; a backfill calls
the same flow with an explicit partition list. There is no second code path, which is what makes the
two produce identical results.

```python
from datetime import date, timedelta

from prefect import flow, task
from prefect.concurrency.sync import concurrency
from prefect.tasks import exponential_backoff


class TransientPortalError(RuntimeError):
    """Raised for 429/503 and connection resets — worth retrying."""


class SchemaViolation(ValueError):
    """Raised when the payload does not match the contract — never worth retrying."""


@task(
    retries=4,
    retry_delay_seconds=exponential_backoff(backoff_factor=2),
    retry_jitter_factor=1.0,
    retry_condition_fn=lambda task, run, state: isinstance(
        state.result(raise_on_failure=False), TransientPortalError
    ),
    tags=["portal"],
)
def fetch_queue_partition(state: str, month: str, *, root: str) -> str:
    """Fetch one state-month queue extract. Retries only transient failures."""
    with concurrency("portal-quota", occupy=1):        # global limit, not per-flow
        return _download(state, month, root=root)


@task(retries=1)
def screen_partition_task(src_uri: str, *, target_epsg: int, force: bool) -> dict:
    from src.pipeline import screen_partition
    record = screen_partition(src_uri, target_epsg=target_epsg, force=force)
    return record.__dict__


@flow(name="siting-screen", log_prints=True)
def siting_screen(
    states: list[str] | None = None,
    months: list[str] | None = None,
    *,
    root: str,
    target_epsg: int = 5070,
    freshness_months: int = 3,
    force: bool = False,
) -> list[dict]:
    """One entry point for both the schedule and any backfill.

    The schedule passes nothing and gets the freshness window; a backfill passes
    an explicit list. Same task, same defaults, same result.
    """
    if months is None:
        today = date.today().replace(day=1)
        months = [
            (today - timedelta(days=31 * i)).strftime("%Y-%m")
            for i in range(freshness_months)
        ]
    states = states or US_STATES

    fetched = fetch_queue_partition.map(
        state=[s for s in states for _ in months],
        month=[m for _ in states for m in months],
        root=root,
    )
    return screen_partition_task.map(fetched, target_epsg=target_epsg, force=force).result()
```

<svg viewBox="0 0 940 388" role="img" aria-label="Which failures are worth retrying and which are not. A 429 rate limit, a 503 and a reset connection all succeed on a later attempt and should retry with exponential backoff and jitter. A schema violation, an invalid geometry and a missing partition will fail identically every time, so retrying them delays the alert by the full retry budget without improving anything." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Retry the transient, fail fast on the deterministic</title>
  <desc>A two-column classification of failures. The retry column lists HTTP 429 rate limits, HTTP 503 service unavailable, connection resets and object-store throttling, each annotated with the fact that a later attempt usually succeeds, and marked with exponential backoff plus jitter over four attempts. The fail-fast column lists schema violations, invalid geometry, a missing partition and an unauthorised credential, each annotated as producing an identical failure on every attempt. A note gives the cost of getting it wrong: a four-attempt retry on a deterministic failure delays the alert by the full backoff budget.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="388"/>
  <defs><marker id="pf2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Two failure classes, two policies</text>
  <text x="248" y="66" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">retry — 4 attempts, backoff + jitter</text>
  <rect x="40" y="80" width="416" height="52" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.5"/>
  <text x="58" y="102" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">HTTP 429 rate limit</text>
  <text x="58" y="120" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">quota resets</text>
  <rect x="40" y="140" width="416" height="52" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.5"/>
  <text x="58" y="162" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">HTTP 503</text>
  <text x="58" y="180" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">service recovers</text>
  <rect x="40" y="200" width="416" height="52" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.5"/>
  <text x="58" y="222" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">connection reset</text>
  <text x="58" y="240" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">transport blip</text>
  <rect x="40" y="260" width="416" height="52" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.5"/>
  <text x="58" y="282" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">store throttling</text>
  <text x="58" y="300" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">backs off and succeeds</text>
  <text x="700" y="66" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">fail fast — alert immediately</text>
  <rect x="492" y="80" width="416" height="52" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2" opacity="0.5"/>
  <text x="510" y="102" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">schema violation</text>
  <text x="510" y="120" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">identical every time</text>
  <rect x="492" y="140" width="416" height="52" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2" opacity="0.5"/>
  <text x="510" y="162" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">invalid geometry</text>
  <text x="510" y="180" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">identical every time</text>
  <rect x="492" y="200" width="416" height="52" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2" opacity="0.5"/>
  <text x="510" y="222" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">missing partition</text>
  <text x="510" y="240" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">upstream has not run</text>
  <rect x="492" y="260" width="416" height="52" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2" opacity="0.5"/>
  <text x="510" y="282" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">401 / 403</text>
  <text x="510" y="300" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">credential is wrong</text>
  <rect x="40" y="328" width="868" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="349" text-anchor="middle" font-size="11.5" fill="currentColor">Prefect applies retries per task, so the discrimination has to live in the exception types — a single</text>
  <text x="474.0" y="366" text-anchor="middle" font-size="11.5" fill="currentColor">retry policy over both classes delays every deterministic alert by the whole backoff budget.</text>
</svg>

## Fallback routing and performance tuning

- **Use a global concurrency limit, not a task-level one.** `concurrency("portal-quota")` is enforced
  across every flow run; a `task_runner` limit is per run, and two overlapping runs will exceed the
  quota together.
- **Map over partitions, not over rows.** A mapped task per state-month is 600 task runs a year; a
  mapped task per record is millions, and Prefect's own bookkeeping becomes the bottleneck.
- **Keep task returns small.** Return the artefact URI and a record, never a GeoDataFrame. Large
  returns are serialised into the result store and turn a fast flow into a slow one.
- **Set `persist_result` deliberately.** Persisting a run record is useful; persisting a geometry is
  a duplicate copy of an artefact that already exists in object storage.
- **Pin the flow to the pipeline image.** Running the flow in the same container the pipeline
  validated against is what keeps the CI result meaningful, as covered in
  [containerizing a GeoPandas pipeline](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-pipeline-orchestration-and-deployment/containerizing-a-geopandas-pipeline-with-docker-and-gdal/).

## Downstream validation

The run record has to outlive the scheduler. Prefect's own state is excellent for operating the flow
and wrong as a system of record: it rotates, it is scoped to the deployment, and it does not answer
"what produced this artefact" once the flow is renamed.

```python
import json

from prefect import get_run_logger


def emit_run_record(record: dict, *, root: str, storage_options: dict | None = None) -> None:
    """Append the record to durable storage as well as to the scheduler's own state."""
    import fsspec

    logger = get_run_logger()
    line = json.dumps(record, sort_keys=True)
    uri = f"{root}/_runs/{record['partition'].replace('/', '_')}.jsonl"
    with fsspec.open(uri, "a", **(storage_options or {})) as fh:
        fh.write(line + "\n")
    logger.info("record: %s", line)
```

<svg viewBox="0 0 940 396" role="img" aria-label="Why the concurrency limit has to be global. A single flow run mapped over 51 states with a per-run limit of 8 respects the portal quota; two overlapping runs with the same per-run limit open 16 connections and exhaust a quota of 10. A global limit named on the task holds across every run, so a backfill and the nightly schedule share the budget instead of competing for it." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Per-run limits do not compose; a global limit does</title>
  <desc>Two timelines. In the first, a nightly run and a backfill each hold a per-run concurrency limit of 8, so during the overlap 16 requests are in flight against a portal quota of 10, and the excess returns 429s that consume the retry budget. In the second, both runs occupy slots in one global limit of 8, so the overlap simply serialises: the backfill waits for slots the nightly run releases, total in-flight never exceeds 8, and no request is refused.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="pf3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Two runs, one portal quota</text>
  <text x="40" y="64" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">per-run limit of 8, twice</text>
  <rect x="40" y="76" width="400" height="40" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="240" y="102" text-anchor="middle" font-size="11.5" fill="currentColor">nightly run · 8 in flight</text>
  <rect x="300" y="124" width="400" height="40" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="500" y="150" text-anchor="middle" font-size="11.5" fill="currentColor">backfill · 8 in flight</text>
  <rect x="300" y="76" width="140" height="88" rx="5" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.6" opacity="0.35"/>
  <text x="370" y="72" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">overlap</text>
  <text x="760" y="124" text-anchor="start" font-size="12" fill="#7A4A1A" font-weight="700">16 in flight · quota 10</text>
  <text x="760" y="144" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">429s consume the retry budget</text>
  <text x="40" y="214" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">one global limit of 8</text>
  <rect x="40" y="226" width="400" height="40" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="240" y="252" text-anchor="middle" font-size="11.5" fill="currentColor">nightly run · 8 in flight</text>
  <rect x="300" y="274" width="400" height="40" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="500" y="300" text-anchor="middle" font-size="11.5" fill="currentColor">backfill · waits for slots</text>
  <rect x="300" y="226" width="140" height="88" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.6" opacity="0.35"/>
  <text x="370" y="222" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">overlap</text>
  <text x="760" y="274" text-anchor="start" font-size="12" fill="#1F5C3A" font-weight="700">8 in flight · quota 10</text>
  <text x="760" y="294" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">nothing is refused</text>
  <rect x="40" y="352" width="868" height="28" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="372" text-anchor="middle" font-size="11.5" fill="currentColor">A task-runner limit is scoped to one flow run. Only a named global limit survives two runs overlapping.</text>
</svg>

## Frequently asked questions

### Should each partition be its own flow run or a mapped task?

A mapped task inside one flow run, for a partition count in the hundreds. Mapping keeps the whole
window in one observable unit, shares the concurrency limit naturally, and produces one run record
set. Separate flow runs per partition make sense when partitions have genuinely different schedules
or failure domains — a per-region deployment, for instance — and cost proportionally more scheduler
bookkeeping.

### How do I stop a backfill from overwhelming a portal?

The same global concurrency limit the schedule uses, which is why it must be global rather than
per-run. A backfill of 36 months across 51 states is 1,836 fetches; without a shared limit it will
run them as fast as the worker pool allows and exhaust the quota in minutes, taking the nightly run
down with it.

### What belongs in Prefect parameters versus in configuration?

Partition identity and behavioural switches in parameters; everything a reviewer would call a
modelling assumption in versioned configuration. `state` and `month` are parameters. The CRS, the
constraint weights and the quarantine thresholds are configuration, because a change to them should
appear in a diff rather than in a scheduler UI.

### Does the flow need to be idempotent if Prefect deduplicates runs?

Yes. Scheduler-level deduplication prevents a duplicate run; it does nothing about a run that failed
halfway through and left a partial artefact. Idempotency is a property of the write, and the
staging-then-rename pattern provides it regardless of what the scheduler does.


### How should the flow handle a partial failure across mapped partitions?

Let the successful partitions land and report the failures as data. A mapped task where 48 of 51
states succeed has produced 48 usable artefacts, and failing the whole run discards them for no
reason — the next run would rebuild all 51. Prefect returns per-mapped-item states, so the flow can
finish, write the records for what succeeded, and raise at the end with the list of partitions that
did not, which is both the alert and the backfill list.

### Does Prefect's caching replace the fingerprint check?

No, and using it instead is a common trap. Prefect's cache keys are computed from task inputs, which
for a partition task are a state and a month — values that do not change when the upstream data is
revised. The fingerprint check reads the actual input artefact, so it rebuilds when the data changes
and skips when it has not. The two can coexist, but only the fingerprint is correct.

### Where should the flow's parameters be validated?

At the top of the flow, before any task is submitted. A partition parameter that is `None` produces
an artefact path containing the string "None", which writes successfully, reads successfully, and is
discovered weeks later. Validating first turns that into an immediate, legible failure with no
partial state to clean up.


### Can the same flow serve more than one region?

Yes, and it should — the region belongs in the partition key rather than in the deployment. Separate
deployments per region duplicate the schedule, the concurrency configuration and the retry policy,
and they drift the same way two entry points do. One flow with a region parameter and one deployment
per schedule keeps the surface small, and a region that needs a different cadence gets a second
schedule rather than a second flow.

### How should long-running raster tasks be handled?

Split them by partition until each task fits comfortably inside the worker's timeout, and give them
their own concurrency tag so they cannot starve the light vector tasks. A single task that reprojects
a national raster for forty minutes is opaque while it runs, expensive to retry and impossible to
parallelise; the same work split by tile is observable, retryable per tile, and finishes sooner.

## Related

- [Spatial Pipeline Orchestration & Deployment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-pipeline-orchestration-and-deployment/) — the task discipline this flow implements
- [Containerizing a GeoPandas Pipeline with Docker and GDAL](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-pipeline-orchestration-and-deployment/containerizing-a-geopandas-pipeline-with-docker-and-gdal/) — the image the flow should run in
- [Downloading EIA & OpenEI Datasets with Python Requests](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/downloading-eia-and-openei-datasets-with-python-requests/) — the retry and backoff behaviour the fetch task wraps
- [Geospatial Data Ingestion Pipelines](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/) — the atomic write that makes retries safe
