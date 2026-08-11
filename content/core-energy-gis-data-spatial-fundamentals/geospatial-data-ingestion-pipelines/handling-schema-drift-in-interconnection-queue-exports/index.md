---
title: Handling Schema Drift in Interconnection Queue Exports
description: Survive a monthly queue export that renamed a column, changed a unit or added a nesting level — a versioned contract, a drift report, quarantine over coercion, and the alert that fires before the numbers move.
slug: handling-schema-drift-in-interconnection-queue-exports
type: article
breadcrumb: Handling Schema Drift
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Handling Schema Drift in Interconnection Queue Exports

The scenario: a monthly interconnection-queue load runs clean, the row count is normal, and the total
queued capacity has fallen by 94 percent. The ISO renamed `capacity_mw` to `mw_capacity` in the July
export; the loader's `get("capacity_mw", 0)` did exactly what it was told, and every project in the
file now has zero megawatts. This page builds the ingestion that fails instead, and it is the schema
half of
[geospatial data ingestion pipelines](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/).

## Root-cause analysis

Schema drift in public energy data is routine, and four shapes cover almost all of it.

1. **A renamed column.** The most common and the most damaging, because a defaulted lookup turns a
   missing column into a plausible value rather than an error. `df.get(col, 0)` and
   `dict.get(key, "")` are the two lines that convert a loud failure into a silent one.
2. **A changed unit.** Capacity published in kilowatts where it was megawatts, or voltage in volts
   where it was kilovolts. The column name is unchanged, the type is unchanged, and every value is a
   thousand times off — which passes a range check that was written generously.
3. **A new nesting level.** A flat CSV becomes a JSON payload with the records under a `data` key, or
   a single-value field becomes a list. The parser either raises immediately or, worse, reads the
   first element and drops the rest.
4. **A widened domain.** A status field gains a new value — "withdrawn-pending" alongside "withdrawn"
   — and any filter written as an exact match silently reclassifies those projects.

<svg viewBox="0 0 940 460" role="img" aria-label="Four shapes of schema drift and what each does to an unguarded loader. A renamed column becomes a default value, so capacity reads as zero and no error is raised. A changed unit passes every type check and moves every value by three orders of magnitude. A new nesting level either raises immediately or reads only the first record. A widened domain silently reclassifies rows that an exact-match filter no longer recognises." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Four drift shapes, four failure modes</title>
  <desc>A table of four schema-drift shapes. A renamed column, such as capacity_mw becoming mw_capacity, produces a defaulted zero and raises nothing. A changed unit, such as capacity published in kilowatts, passes every type check while moving all values by a factor of a thousand. A new nesting level, such as records moving under a data key, either raises immediately or silently reads only the first element. A widened domain, such as a new status value, reclassifies rows that an exact-match filter no longer recognises. Each row is marked with whether it fails loudly or silently.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="460"/>
  <defs><marker id="sd1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The dangerous drift is the kind that does not raise</text>
  <rect x="40" y="70" width="868" height="74" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3" opacity="0.48"/>
  <text x="64" y="100" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">renamed column</text>
  <text x="64" y="124" text-anchor="start" font-size="11" fill="currentColor" opacity="0.88">capacity_mw → mw_capacity</text>
  <text x="620" y="114" text-anchor="end" font-size="11.5" fill="currentColor">defaulted to 0 — totals collapse</text>
  <text x="884" y="114" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">silent</text>
  <rect x="40" y="154" width="868" height="74" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3" opacity="0.48"/>
  <text x="64" y="184" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">changed unit</text>
  <text x="64" y="208" text-anchor="start" font-size="11" fill="currentColor" opacity="0.88">MW published as kW</text>
  <text x="620" y="198" text-anchor="end" font-size="11.5" fill="currentColor">every value ×1000 — types unchanged</text>
  <text x="884" y="198" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">silent</text>
  <rect x="40" y="238" width="868" height="74" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3" opacity="0.48"/>
  <text x="64" y="268" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">new nesting level</text>
  <text x="64" y="292" text-anchor="start" font-size="11" fill="currentColor" opacity="0.88">records moved under &quot;data&quot;</text>
  <text x="620" y="282" text-anchor="end" font-size="11.5" fill="currentColor">raises, or reads only the first</text>
  <text x="884" y="282" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">mixed</text>
  <rect x="40" y="322" width="868" height="74" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3" opacity="0.48"/>
  <text x="64" y="352" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">widened domain</text>
  <text x="64" y="376" text-anchor="start" font-size="11" fill="currentColor" opacity="0.88">new status &quot;withdrawn-pending&quot;</text>
  <text x="620" y="366" text-anchor="end" font-size="11.5" fill="currentColor">exact-match filters reclassify rows</text>
  <text x="884" y="366" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">silent</text>
  <rect x="40" y="404" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="423" text-anchor="middle" font-size="11" fill="currentColor">df.get(col, 0) and dict.get(key, &quot;&quot;) are the two lines that convert a loud failure into a plausible number.</text>
  <text x="474.0" y="438" text-anchor="middle" font-size="11" fill="currentColor">A contract that names its required columns turns all four rows above into a build failure.</text>
</svg>

## Pre-flight validation: a drift report, not a boolean

The useful pre-flight compares the incoming file against the contract and reports every difference,
rather than answering yes or no. A load that fails needs to say what changed.

```python
from dataclasses import dataclass, field

import pandas as pd


@dataclass
class SchemaContract:
    version: str
    required: dict[str, str]                       # column -> pandas dtype string
    optional: dict[str, str] = field(default_factory=dict)
    units: dict[str, str] = field(default_factory=dict)
    domains: dict[str, set] = field(default_factory=dict)


def drift_report(df: pd.DataFrame, contract: SchemaContract) -> dict:
    """Every difference between the incoming frame and the contract, named."""
    incoming = set(df.columns)
    expected = set(contract.required) | set(contract.optional)

    missing = sorted(set(contract.required) - incoming)
    added = sorted(incoming - expected)
    retyped = {
        c: (str(df[c].dtype), contract.required[c])
        for c in contract.required
        if c in incoming and str(df[c].dtype) != contract.required[c]
    }
    domain_breaks = {}
    for col, allowed in contract.domains.items():
        if col in incoming:
            unseen = sorted(set(df[col].dropna().unique()) - allowed)
            if unseen:
                domain_breaks[col] = unseen[:10]

    # A renamed column usually appears as one missing and one added with a similar name.
    likely_renames = [
        (m, a) for m in missing for a in added
        if _similar(m, a)
    ]

    return {
        "contract_version": contract.version,
        "missing_required": missing,
        "unexpected_columns": added,
        "type_changes": retyped,
        "domain_breaks": domain_breaks,
        "likely_renames": likely_renames,
        "clean": not (missing or retyped or domain_breaks),
    }


def _similar(a: str, b: str) -> bool:
    """Cheap rename heuristic: same tokens, different order or separator."""
    norm = lambda s: sorted(s.lower().replace("-", "_").split("_"))
    return norm(a) == norm(b)
```

The `likely_renames` heuristic is worth the twelve lines: it turns "`capacity_mw` is missing and
`mw_capacity` appeared" into a one-line suggestion, which is the difference between a five-minute fix
and an afternoon of comparing files.

## Fix implementation

The loader below validates against a versioned contract, quarantines rather than coerces, and treats
a unit check as a first-class assertion rather than a range check.

```python
import pandas as pd

QUEUE_V3 = SchemaContract(
    version="queue.v3",
    required={
        "queue_id": "object",
        "poi_name": "object",
        "capacity_mw": "float64",
        "voltage_kv": "float64",
        "status": "object",
        "state": "object",
    },
    optional={"withdrawn_date": "datetime64[ns]", "operator": "object"},
    units={"capacity_mw": "MW", "voltage_kv": "kV"},
    domains={"status": {"active", "withdrawn", "in-service", "suspended"}},
)


def load_queue_export(path: str, *, contract: SchemaContract = QUEUE_V3) -> tuple[pd.DataFrame, dict]:
    """Load an export, or fail with a report that names what changed."""
    raw = pd.read_csv(path)
    report = drift_report(raw, contract)

    if report["missing_required"]:
        raise ValueError(
            f"{contract.version}: missing {report['missing_required']}; "
            f"likely renames {report['likely_renames'] or 'none detected'}"
        )
    if report["type_changes"]:
        raise ValueError(f"{contract.version}: type changes {report['type_changes']}")

    # Unit sanity: a magnitude check, not a range check. Queue capacities live in
    # the tens to hundreds of MW; a kW export lands three orders of magnitude out.
    median_mw = float(raw["capacity_mw"].median())
    if median_mw > 5_000:
        raise ValueError(
            f"median capacity {median_mw:,.0f} suggests kW, not MW — unit drift in {path}"
        )
    median_kv = float(raw["voltage_kv"].median())
    if median_kv > 2_000:
        raise ValueError(f"median voltage {median_kv:,.0f} suggests volts, not kV — unit drift")

    unknown = report["domain_breaks"].get("status", [])
    quarantine = raw[raw["status"].isin(unknown)] if unknown else raw.iloc[0:0]
    clean = raw.drop(index=quarantine.index)

    return clean, {**report, "quarantined_rows": len(quarantine), "loaded_rows": len(clean)}
```

<svg viewBox="0 0 940 400" role="img" aria-label="A magnitude check catches a unit change that a range check misses. Interconnection-queue capacities have a median near 120 megawatts and a long tail to about 1,200; a range check written generously as nought to one hundred thousand accepts a kilowatt export whose median is 120,000. Comparing the median against the expected order of magnitude rejects it immediately, and the same test applied to voltage separates kilovolts from volts." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Median magnitude against a generous range check</title>
  <desc>Two number lines on a logarithmic scale. The first, capacity, marks the expected median near 120 megawatts and the observed median of a kilowatt export at 120,000, with a generous range check spanning nought to one hundred thousand shown as accepting both. The second, voltage, marks the expected median near 138 kilovolts and a volt-scale export at 138,000, again inside a generous range. Annotations give the magnitude assertions that reject each: a median above five thousand for capacity and above two thousand for voltage.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="sd2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The range check passed; the magnitude check did not</text>
  <text x="40" y="70" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">capacity_mw</text>
  <line x1="120" y1="92" x2="880" y2="92" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <line x1="120.0" y1="86" x2="120.0" y2="98" stroke="currentColor" stroke-width="1.1" opacity="0.55"/>
  <text x="120.0" y="116" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">1</text>
  <line x1="373.3333333333333" y1="86" x2="373.3333333333333" y2="98" stroke="currentColor" stroke-width="1.1" opacity="0.55"/>
  <text x="373.3333333333333" y="116" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">100</text>
  <line x1="626.6666666666666" y1="86" x2="626.6666666666666" y2="98" stroke="currentColor" stroke-width="1.1" opacity="0.55"/>
  <text x="626.6666666666666" y="116" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">10k</text>
  <line x1="880.0" y1="86" x2="880.0" y2="98" stroke="currentColor" stroke-width="1.1" opacity="0.55"/>
  <text x="880.0" y="116" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">1M</text>
  <rect x="120.0" y="50" width="633.3333333333334" height="28" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.65"/>
  <text x="433.7686922644906" y="68" text-anchor="middle" font-size="11" fill="#7A4A1A" font-weight="700">range check accepts everything in here</text>
  <circle cx="383.3629578326991" cy="92" r="7" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="383.3629578326991" y="140" text-anchor="middle" font-size="11" fill="#1F5C3A" font-weight="700">expected median 120 MW</text>
  <circle cx="763.3629578326992" cy="92" r="7" fill="#C85B5B" stroke="#C85B5B" stroke-width="1"/>
  <text x="763.3629578326992" y="140" text-anchor="middle" font-size="11" fill="#7A4A1A" font-weight="700">observed 120 000 — wrong unit</text>
  <line x1="588.5362005492291" y1="40" x2="588.5362005492291" y2="104" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 4" opacity="0.7"/>
  <text x="588.5362005492291" y="32" text-anchor="middle" font-size="10.5" fill="currentColor" font-weight="700">assert median &lt; 5 000</text>
  <text x="40" y="220" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">voltage_kv</text>
  <line x1="120" y1="242" x2="880" y2="242" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  <line x1="120.0" y1="236" x2="120.0" y2="248" stroke="currentColor" stroke-width="1.1" opacity="0.55"/>
  <text x="120.0" y="266" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">1</text>
  <line x1="373.3333333333333" y1="236" x2="373.3333333333333" y2="248" stroke="currentColor" stroke-width="1.1" opacity="0.55"/>
  <text x="373.3333333333333" y="266" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">100</text>
  <line x1="626.6666666666666" y1="236" x2="626.6666666666666" y2="248" stroke="currentColor" stroke-width="1.1" opacity="0.55"/>
  <text x="626.6666666666666" y="266" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">10k</text>
  <line x1="880.0" y1="236" x2="880.0" y2="248" stroke="currentColor" stroke-width="1.1" opacity="0.55"/>
  <text x="880.0" y="266" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">1M</text>
  <rect x="120.0" y="200" width="633.3333333333334" height="28" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.65"/>
  <text x="433.7686922644906" y="218" text-anchor="middle" font-size="11" fill="#7A4A1A" font-weight="700">range check accepts everything in here</text>
  <circle cx="391.0513509441566" cy="242" r="7" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="391.0513509441566" y="290" text-anchor="middle" font-size="11" fill="#1F5C3A" font-weight="700">expected median 138 kV</text>
  <circle cx="771.0513509441566" cy="242" r="7" fill="#C85B5B" stroke="#C85B5B" stroke-width="1"/>
  <text x="771.0513509441566" y="290" text-anchor="middle" font-size="11" fill="#7A4A1A" font-weight="700">observed 138 000 — wrong unit</text>
  <line x1="538.1304661174377" y1="190" x2="538.1304661174377" y2="254" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 4" opacity="0.7"/>
  <text x="538.1304661174377" y="182" text-anchor="middle" font-size="10.5" fill="currentColor" font-weight="700">assert median &lt; 2 000</text>
  <rect x="40" y="344" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="363" text-anchor="middle" font-size="11" fill="currentColor">A range check is written once and made generous so it never fires. A magnitude check encodes what the</text>
  <text x="474.0" y="378" text-anchor="middle" font-size="11" fill="currentColor">column actually means, which is the only thing that separates megawatts from kilowatts.</text>
</svg>

## Fallback routing and performance tuning

- **Version the contract, do not edit it.** When a source genuinely changes, add `queue.v4` and keep
  `v3`; the loader then reports which version an old file matches, and historical reloads still work.
- **Quarantine unknown domain values, do not drop them.** A new status value is information about the
  source, and dropping the rows makes it invisible while changing every total.
- **Alert on the delta, not the level.** A quarantine rate that jumps from 0.2 to 6 percent overnight
  is the signal; the absolute level says more about the source's habits than about this run.
- **Keep the raw payload.** Reprocessing a month after fixing a contract is a minute if the bytes were
  kept and a re-download if they were not — and public portals do not always serve history.
- **Never coerce silently.** `errors="coerce"` turns unparseable values into NaN, which then fails a
  nullability check and reports the wrong cause. Parse strictly and route failures to quarantine.

## Downstream validation

```python
def assert_load_is_comparable(current: dict, previous: dict, *, max_shift: float = 0.25) -> None:
    """Compare this load against the last one — drift usually shows up as a step change."""
    for field_ in ("loaded_rows", "total_capacity_mw"):
        prev, now = previous.get(field_), current.get(field_)
        if not prev:
            continue
        shift = abs(now - prev) / prev
        assert shift <= max_shift, (
            f"{field_} moved {shift:.0%} against the previous load "
            f"({prev:,.0f} → {now:,.0f}) — inspect before publishing"
        )
    prev_rate = previous.get("quarantined_rows", 0) / max(previous.get("loaded_rows", 1), 1)
    now_rate = current.get("quarantined_rows", 0) / max(current.get("loaded_rows", 1), 1)
    assert now_rate - prev_rate < 0.05, (
        f"quarantine rate rose from {prev_rate:.1%} to {now_rate:.1%} — schema drift is likely"
    )
```

<svg viewBox="0 0 940 384" role="img" aria-label="What a useful drift alert contains. A generic failure message starts an investigation; a report naming the contract version, the missing column, the likely rename, the row counts and the previous load ends it. The four fields cost nothing to emit because the drift report already computed them." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>A generic alert against a drift report</title>
  <desc>Two alert cards side by side. The generic one reads &quot;schema validation failed&quot; with a stack trace reference, and is annotated as starting an investigation. The drift report names the contract version queue.v3, the missing required column capacity_mw, the likely rename to mw_capacity, the 1,284 rows that were not loaded, and the previous load figures of 1,247 rows and 42,180 megawatts for comparison, and is annotated as ending the investigation. A note observes that every field in the second card was already computed by the drift report.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="384"/>
  <defs><marker id="sd3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Same failure, two alerts</text>
  <rect x="40" y="66" width="420" height="240" rx="9" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.4" opacity="0.5"/>
  <text x="250" y="96" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">generic</text>
  <text x="250" y="140" text-anchor="middle" font-size="11.5" fill="currentColor">SchemaError: validation failed</text>
  <text x="250" y="164" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">see traceback</text>
  <text x="250" y="250" text-anchor="middle" font-size="11.5" fill="#7A4A1A" font-weight="700">starts an investigation</text>
  <rect x="490" y="66" width="418" height="240" rx="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4" opacity="0.5"/>
  <text x="699" y="96" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">drift report</text>
  <text x="699" y="132" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.92">contract: queue.v3</text>
  <text x="699" y="156" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.92">missing required: capacity_mw</text>
  <text x="699" y="180" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.92">likely rename: mw_capacity</text>
  <text x="699" y="204" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.92">rows not loaded: 1 284</text>
  <text x="699" y="228" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.92">previous load: 1 247 rows / 42 180 MW</text>
  <text x="699" y="274" text-anchor="middle" font-size="11.5" fill="#1F5C3A" font-weight="700">ends it</text>
  <rect x="40" y="322" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="341" text-anchor="middle" font-size="11" fill="currentColor">Every field on the right was already computed by the drift report — emitting it costs a format string,</text>
  <text x="474.0" y="356" text-anchor="middle" font-size="11" fill="currentColor">and it is the difference between a five-minute fix and an afternoon of diffing CSVs.</text>
</svg>


## Detecting drift before the load, from the header alone

Most drift is visible in the first kilobyte of a file, which means it can be caught before a
multi-gigabyte download completes or a partition is replaced.

For a CSV, reading the header row and the first hundred data rows is enough to run the entire drift
report: column names, inferred types, the domain of any low-cardinality field, and the median
magnitude of the numeric columns. Ninety-nine percent of the file adds nothing to that judgement. For
a JSON payload, the equivalent is the top-level keys and the first record.

That matters operationally because it changes where the failure lands. A drift check that runs after
the download and before the write turns "the nightly job failed at 04:20 having written half a
partition" into "the nightly job refused the July export at 03:02 and left last month's data live".
The second is a triage task the next morning; the first is an incident.

The same sampling makes a dry-run cheap. Fetching only the headers of every partition due tonight —
51 states, a kilobyte each — takes seconds and reports exactly which sources drifted, which is enough
to decide whether the run should proceed at all. Where the source supports a range request or a
schema endpoint, the check costs no bytes worth counting.

One caveat worth stating: a sampled domain check is not exhaustive. A new status value that appears
in row 90,000 will not be in the first hundred rows, so the sampled check catches the shapes that
appear in the header and the full check still runs after the load. Sampling is an early warning, not
a replacement.

## Frequently asked questions

### Should the loader try to auto-correct a detected rename?

No — report it and stop. An automatic rename is a guess about semantics made by a heuristic that only
compared strings, and the failure mode is a column mapped to the wrong meaning with no record that a
decision was made. Reporting `capacity_mw` missing and `mw_capacity` present takes seconds to
confirm, and the fix belongs in a versioned contract where it is visible in a diff.

### How do I catch a unit change that stays within a plausible range?

By comparing against the previous load rather than against an absolute range. A capacity column that
moves from a median of 120 to a median of 0.12 is obviously wrong; one that moves from 120 to 132 is
probably real growth. The step-change assertion above catches the first class, and no automated check
reliably catches the second — which is why the previous-load comparison is worth more than a wider
range check.

### What belongs in the contract versus in the validation schema?

The contract describes the file as delivered: column names, types, units and domains. The validation
schema — pandera or equivalent — describes the record as the pipeline needs it: ranges, nullability,
cross-field consistency. Keeping them separate means a source change updates the contract and a
business-rule change updates the schema, and neither edit touches the other.

### How many contract versions should be kept?

All of them, because they are a few dozen lines each and they are what makes historical reprocessing
possible. Tag each stored raw payload with the contract version it matched at load time, and a
reprocess two years later resolves the right parser without anyone remembering which month the format
changed.

### Does this apply to spatial columns too?

Yes, and the geometry equivalents are worth naming: a CRS that changes between exports, a geometry
column that arrives as WKT where it was WKB, and coordinates that swap axis order. All three are
detectable with the same magnitude reasoning — a longitude column whose median is 35 rather than
−101 has been transposed, and that check costs one line.

### What should the alert actually say?

The contract version, the file, the specific differences, and the previous load's figures for
comparison. An alert that says "schema validation failed" starts an investigation; one that says
"queue.v3: missing capacity_mw, likely renamed to mw_capacity; 1,284 rows unloaded; previous load
1,247 rows / 42,180 MW" ends it.

## Related

- [Geospatial Data Ingestion Pipelines](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/) — the parent ingestion contract
- [Incremental, Idempotent Loading of Grid Datasets with Hive Partitions](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/geospatial-data-ingestion-pipelines/incremental-idempotent-loading-of-grid-datasets-with-hive-partitions/) — writing what survives this validation
- [Enforcing Voltage Class Schemas with pandera](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/enforcing-voltage-class-schemas-with-pandera/) — the record-level schema this contract feeds
- [Open Energy Data Portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/) — where these exports come from and how often they change
