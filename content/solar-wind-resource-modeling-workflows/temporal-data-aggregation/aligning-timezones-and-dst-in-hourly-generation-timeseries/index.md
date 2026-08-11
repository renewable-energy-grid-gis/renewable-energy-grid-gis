---
title: Aligning Timezones and DST in Hourly Generation Timeseries
description: Join metered generation to modelled output without losing or duplicating an hour — UTC as the working frame, fixed offsets over DST-aware zones, the two transition days, and the assertions that prove an index is complete.
slug: aligning-timezones-and-dst-in-hourly-generation-timeseries
type: article
breadcrumb: Aligning Timezones and DST
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Aligning Timezones and DST in Hourly Generation Timeseries

The scenario: modelled and metered hourly output are joined for a validation study, the correlation
is 0.98 for most of the year and collapses for two days in March and November, and the annual totals
differ by 0.01 percent. One series is in local time with daylight saving, the other in UTC, and the
join silently dropped one hour in spring and doubled one in autumn. This page makes those two days
behave, and it extends
[temporal data aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/).

## Root-cause analysis

Three properties of local time break an hourly join, and all three are invisible in an annual total.

1. **A spring-forward day has 23 hours.** The local clock jumps from 01:59 to 03:00, so an index
   built by adding one hour at a time in local time either contains a timestamp that does not exist
   or is one hour short. A join on that index drops the corresponding row from the other series.
2. **A fall-back day has 25 hours.** 01:00 to 01:59 occurs twice with different UTC offsets. A naive
   index has two rows with the same label, so a join produces a Cartesian product for that hour and
   an aggregation double-counts it.
3. **A mixed convention within one dataset.** SCADA exports frequently switch between local standard
   time and local clock time between vintages, and the switch is silent because both look like local
   time. The symptom is a one-hour offset that appears partway through a year.

<svg viewBox="0 0 940 404" role="img" aria-label="The two transition days, hour by hour. On spring-forward the local clock runs 00:00, 01:00, then 03:00 — the 02:00 hour does not exist, so a modelled row labelled 02:00 matches nothing and a 23-hour day is produced. On fall-back the label 01:00 occurs twice with different UTC offsets, so a join on the label matches twice and an aggregation counts 25 hours of generation in a 24-hour day." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Spring forward and fall back, hour by hour</title>
  <desc>Two hourly timelines for a single day each. The spring-forward day shows local hours 00:00 and 01:00 followed directly by 03:00, with a gap where 02:00 would be, marked as a nonexistent timestamp and a 23-hour day. The fall-back day shows 00:00, then 01:00 twice — once at the summer offset and once at the standard offset — then 02:00, marked as an ambiguous label and a 25-hour day. Beneath each, the failure it causes in a join: a dropped row and a duplicated match respectively.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="404"/>
  <defs><marker id="tz1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Two days a year, and both break an hourly join</text>
  <text x="40" y="70" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">spring forward · 23 hours</text>
  <rect x="40" y="84" width="128" height="52" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.75"/>
  <text x="104" y="110" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">00:00</text>
  <rect x="180" y="84" width="128" height="52" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.75"/>
  <text x="244" y="110" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">01:00</text>
  <rect x="320" y="84" width="128" height="52" rx="6" fill="none" stroke="#C85B5B" stroke-width="1.6" stroke-dasharray="5 4"/>
  <text x="384" y="116" text-anchor="middle" font-size="10.5" fill="#7A4A1A" font-weight="700">does not exist</text>
  <rect x="460" y="84" width="128" height="52" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.75"/>
  <text x="524" y="110" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">03:00</text>
  <rect x="600" y="84" width="128" height="52" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.75"/>
  <text x="664" y="110" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">04:00</text>
  <rect x="740" y="84" width="128" height="52" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.75"/>
  <text x="804" y="110" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">05:00</text>
  <text x="40" y="166" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.9">a modelled row labelled 02:00 matches nothing — the join drops it</text>
  <text x="40" y="220" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">fall back · 25 hours</text>
  <rect x="40" y="234" width="128" height="52" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2" opacity="0.75"/>
  <text x="104" y="260" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">00:00</text>
  <rect x="180" y="234" width="128" height="52" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2" opacity="0.75"/>
  <text x="244" y="260" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">01:00</text>
  <rect x="320" y="234" width="128" height="52" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.6" opacity="0.75"/>
  <text x="384" y="260" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">01:00</text>
  <text x="384" y="278" text-anchor="middle" font-size="9.5" fill="#7A4A1A">again (EST)</text>
  <rect x="460" y="234" width="128" height="52" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2" opacity="0.75"/>
  <text x="524" y="260" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">02:00</text>
  <rect x="600" y="234" width="128" height="52" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2" opacity="0.75"/>
  <text x="664" y="260" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">03:00</text>
  <rect x="740" y="234" width="128" height="52" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2" opacity="0.75"/>
  <text x="804" y="260" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">04:00</text>
  <text x="40" y="316" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.9">the label 01:00 matches twice — the aggregation counts it twice</text>
  <rect x="40" y="348" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="367" text-anchor="middle" font-size="11" fill="currentColor">Both are single hours in 8 760, so the annual total moves by hundredths of a percent — which is why the</text>
  <text x="474.0" y="382" text-anchor="middle" font-size="11" fill="currentColor">defect is usually found by an hourly correlation rather than by a total.</text>
</svg>

## Pre-flight validation

An hourly index is complete or it is not, and checking is three lines. Do it before any join, on both
sides.

```python
import pandas as pd


def audit_hourly_index(index: pd.DatetimeIndex, *, year: int) -> dict:
    """Completeness, duplication and timezone awareness of an hourly index."""
    expected = 8784 if pd.Timestamp(year=year, month=1, day=1).is_leap_year else 8760
    tz = index.tz
    report = {
        "tz": str(tz) if tz is not None else "naive",
        "rows": len(index),
        "expected_utc_hours": expected,
        "duplicates": int(index.duplicated().sum()),
        "monotonic": bool(index.is_monotonic_increasing),
        "gaps": 0,
    }
    if tz is not None:
        utc = index.tz_convert("UTC")
        full = pd.date_range(utc.min(), utc.max(), freq="h", tz="UTC")
        report["gaps"] = int(len(full) - len(utc.unique()))
    else:
        full = pd.date_range(index.min(), index.max(), freq="h")
        report["gaps"] = int(len(full) - len(index.unique()))

    report["complete"] = (
        report["duplicates"] == 0 and report["gaps"] == 0 and report["rows"] == expected
    )
    return report
```

A naive index reporting 8,760 rows is not evidence of correctness — a local-time year with a dropped
spring hour and a duplicated autumn hour also totals 8,760. The duplicate and gap counts are what
distinguish them.

## Fix implementation

The rule that removes the whole class of problem: UTC everywhere inside the pipeline, a fixed offset
where local time is genuinely required, and DST-aware zones only at presentation.

```python
import pandas as pd


def to_utc_working_index(
    df: pd.DataFrame,
    *,
    source_tz: str | int,
    ambiguous: str = "raise",
    nonexistent: str = "raise",
) -> pd.DataFrame:
    """Normalise any incoming series to a UTC index, failing loudly on the two bad days.

    source_tz may be an IANA name for clock time, or an integer offset in hours for
    local standard time — which is what most SCADA and resource files actually use.
    """
    out = df.copy()
    idx = pd.DatetimeIndex(out.index)

    if isinstance(source_tz, int):
        # Fixed offset: no DST, no ambiguity, no missing hour. The preferred input.
        out.index = idx.tz_localize(f"Etc/GMT{-source_tz:+d}").tz_convert("UTC")
        return out

    if idx.tz is None:
        # Clock time: the two transition days need an explicit policy.
        out.index = idx.tz_localize(source_tz, ambiguous=ambiguous, nonexistent=nonexistent)
    out.index = out.index.tz_convert("UTC")
    return out


def join_modelled_and_metered(
    modelled: pd.DataFrame,
    metered: pd.DataFrame,
    *,
    modelled_tz: str | int,
    metered_tz: str | int,
) -> pd.DataFrame:
    """Join two hourly series that arrived in different conventions."""
    m = to_utc_working_index(modelled, source_tz=modelled_tz)
    g = to_utc_working_index(metered, source_tz=metered_tz)

    joined = m.join(g, how="outer", lsuffix="_model", rsuffix="_meter")
    missing_model = int(joined.filter(like="_model").isna().all(axis=1).sum())
    missing_meter = int(joined.filter(like="_meter").isna().all(axis=1).sum())
    joined.attrs["join_report"] = {
        "rows": len(joined),
        "hours_only_in_modelled": missing_meter,
        "hours_only_in_metered": missing_model,
        "overlap_hours": len(joined) - missing_model - missing_meter,
    }
    return joined
```

Passing `ambiguous="raise"` and `nonexistent="raise"` rather than the convenient `"NaT"` is the
decision that matters. A pipeline that silently drops the nonexistent hour and picks one of the two
ambiguous ones produces a plausible series; one that raises tells you the source convention was not
what you assumed.

<svg viewBox="0 0 940 396" role="img" aria-label="Three time conventions and what each is safe for. UTC has 8,760 or 8,784 hours, no ambiguity and no gaps, and is the only safe working frame. A fixed local-standard offset — what most resource and SCADA files actually use — shares those properties and reads as local time. A daylight-saving-aware zone has 8,759 or 8,761 hours and both a duplicated and a nonexistent label, and belongs only at presentation." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>UTC, fixed offset and DST-aware zones compared</title>
  <desc>A three-row comparison of time conventions. UTC: 8,760 hours in a common year, no duplicated labels, no missing labels, safe for storage, joining and aggregation. Fixed local standard offset such as Etc/GMT plus six: the same hour count and the same guarantees, reads as local time, and is what most resource and SCADA exports actually contain. Daylight-saving-aware zone such as America slash New York: 8,759 hours in spring-forward years and 8,761 in fall-back terms, one duplicated label and one nonexistent label, safe only for presentation.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="tz2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Store in UTC, render in local — the middle row is why</text>
  <text x="70" y="74" text-anchor="start" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">convention</text>
  <text x="430" y="74" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">hours</text>
  <text x="560" y="74" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">duplicated</text>
  <text x="690" y="74" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">missing</text>
  <text x="880" y="74" text-anchor="end" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">safe for</text>
  <rect x="40" y="88" width="868" height="62" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3" opacity="0.5"/>
  <text x="70" y="126" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">UTC</text>
  <text x="430" y="126" text-anchor="middle" font-size="11.5" fill="currentColor">8 760</text>
  <text x="560" y="126" text-anchor="middle" font-size="11" fill="currentColor">none</text>
  <text x="690" y="126" text-anchor="middle" font-size="11" fill="currentColor">none</text>
  <text x="884" y="126" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">storage · joins · aggregation</text>
  <rect x="40" y="160" width="868" height="62" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3" opacity="0.5"/>
  <text x="70" y="198" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">fixed offset (Etc/GMT+6)</text>
  <text x="430" y="198" text-anchor="middle" font-size="11.5" fill="currentColor">8 760</text>
  <text x="560" y="198" text-anchor="middle" font-size="11" fill="currentColor">none</text>
  <text x="690" y="198" text-anchor="middle" font-size="11" fill="currentColor">none</text>
  <text x="884" y="198" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">resource and SCADA files</text>
  <rect x="40" y="232" width="868" height="62" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3" opacity="0.5"/>
  <text x="70" y="270" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">DST-aware (America/New_York)</text>
  <text x="430" y="270" text-anchor="middle" font-size="11.5" fill="currentColor">8 759 / 8 761</text>
  <text x="560" y="270" text-anchor="middle" font-size="11" fill="currentColor">one label twice</text>
  <text x="690" y="270" text-anchor="middle" font-size="11" fill="currentColor">one label missing</text>
  <text x="884" y="270" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">presentation only</text>
  <rect x="40" y="316" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="335" text-anchor="middle" font-size="11" fill="currentColor">Most resource and SCADA files are the middle row and are labelled as though they were the bottom one —</text>
  <text x="474.0" y="350" text-anchor="middle" font-size="11" fill="currentColor">which is why the source convention belongs in the file metadata rather than in an assumption.</text>
</svg>

## Fallback routing and performance tuning

- **Store UTC, render local.** Every artefact in the store carries a UTC index; presentation applies a
  zone at the last moment. This makes every join, aggregation and hour count exact by construction.
- **Prefer a fixed offset for resource data.** NSRDB, ERA5 and most SCADA exports are local standard
  time or UTC, never clock time, so `Etc/GMT+6` is both correct and immune to DST entirely.
- **Never concatenate local-time years.** The repeated autumn hour appears twice across the boundary
  and the missing spring hour once, so a multi-year concatenation in local time is wrong at every
  transition.
- **Resample in UTC.** A daily or monthly reduction over a DST-aware index produces days of 23 and 25
  hours, which is correct for a clock-time question and wrong for an energy one.
- **Record the source convention per file.** It is the field that is most often assumed and least
  often written down, and a mixed-convention dataset is only detectable if the convention is stated.

## Downstream validation

```python
import pandas as pd


def assert_hourly_join_complete(joined: pd.DataFrame, *, year: int, min_overlap: float = 0.99) -> None:
    """The join must cover the year exactly once, with no duplicated or missing hours."""
    report = joined.attrs.get("join_report", {})
    expected = 8784 if pd.Timestamp(year=year, month=1, day=1).is_leap_year else 8760

    assert joined.index.tz is not None, "the joined index is timezone-naive — convention unknown"
    assert str(joined.index.tz) == "UTC", f"joined index is in {joined.index.tz}, not UTC"
    assert not joined.index.duplicated().any(), "duplicate timestamps — a fall-back hour survived"
    assert len(joined) == expected, f"{len(joined)} hours in the join, expected {expected}"

    overlap = report.get("overlap_hours", 0) / max(len(joined), 1)
    assert overlap >= min_overlap, (
        f"only {overlap:.1%} of hours appear in both series — the two conventions disagree"
    )
```

## The two days, concretely

<svg viewBox="0 0 940 396" role="img" aria-label="Four checks that establish an hourly index is complete before any join runs. The row count must equal 8,760 or 8,784 for a leap year. There must be no duplicated timestamps, which a fall-back hour produces. There must be no gaps against a continuous UTC range, which a spring-forward hour produces. And the index must be timezone-aware, because a naive index carries no convention at all." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Four index checks, and the failure each one catches</title>
  <desc>A four-row table pairing an index check with the failure it catches. Row count equal to 8,760 or 8,784 catches a truncated or extended series. No duplicated timestamps catches a surviving fall-back hour that would match twice in a join. No gaps against a continuous UTC range catches a dropped spring-forward hour. A timezone-aware index catches a naive one, which carries no convention and cannot be safely converted. A note records that a naive local-time year can total exactly 8,760 rows while containing both a duplicate and a gap.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="tz3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">A row count of 8 760 is not evidence of correctness</text>
  <rect x="40" y="70" width="420" height="58" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="250" y="105" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">len(index) == 8 760 or 8 784</text>
  <line x1="466" y1="99" x2="498" y2="99" stroke="currentColor" stroke-width="1.4" marker-end="url(#tz3-arr)"/>
  <rect x="506" y="70" width="402" height="58" rx="7" fill="none" stroke="#3D8B5F" stroke-width="1.1" opacity="0.6"/>
  <text x="707" y="105" text-anchor="middle" font-size="11.5" fill="currentColor">a truncated or extended series</text>
  <rect x="40" y="138" width="420" height="58" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="250" y="173" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">no duplicated timestamps</text>
  <line x1="466" y1="167" x2="498" y2="167" stroke="currentColor" stroke-width="1.4" marker-end="url(#tz3-arr)"/>
  <rect x="506" y="138" width="402" height="58" rx="7" fill="none" stroke="#C85B5B" stroke-width="1.1" opacity="0.6"/>
  <text x="707" y="173" text-anchor="middle" font-size="11.5" fill="currentColor">a surviving fall-back hour</text>
  <rect x="40" y="206" width="420" height="58" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="250" y="241" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">no gaps against a UTC range</text>
  <line x1="466" y1="235" x2="498" y2="235" stroke="currentColor" stroke-width="1.4" marker-end="url(#tz3-arr)"/>
  <rect x="506" y="206" width="402" height="58" rx="7" fill="none" stroke="#C85B5B" stroke-width="1.1" opacity="0.6"/>
  <text x="707" y="241" text-anchor="middle" font-size="11.5" fill="currentColor">a dropped spring-forward hour</text>
  <rect x="40" y="274" width="420" height="58" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="250" y="309" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">index.tz is not None</text>
  <line x1="466" y1="303" x2="498" y2="303" stroke="currentColor" stroke-width="1.4" marker-end="url(#tz3-arr)"/>
  <rect x="506" y="274" width="402" height="58" rx="7" fill="none" stroke="#F4A261" stroke-width="1.1" opacity="0.6"/>
  <text x="707" y="309" text-anchor="middle" font-size="11.5" fill="currentColor">a naive index with no convention</text>
  <rect x="40" y="344" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="363" text-anchor="middle" font-size="11" fill="currentColor">A naive local-time year with one hour dropped in spring and one duplicated in autumn totals exactly 8 760</text>
  <text x="474.0" y="378" text-anchor="middle" font-size="11" fill="currentColor">rows — which is why the duplicate and gap checks matter more than the count.</text>
</svg>

It helps to look at exactly what happens on each transition, because the failures are specific rather
than general.

**Spring forward.** In US Eastern time, 2026-03-08 runs 00:00, 01:00, then 03:00 — 02:00 to 02:59 does
not exist. A modelled series generated by adding one hour at a time in local time will contain a
02:00 that no metered record can match, and `tz_localize` with `nonexistent="raise"` will say so. With
`nonexistent="shift_forward"` the row silently becomes 03:00 and collides with the real 03:00, which
is how a duplicate appears in a series that started with none.

**Fall back.** On 2026-11-01 the same zone runs 00:00, 01:00 (EDT), 01:00 (EST), 02:00 — the label
01:00 occurs twice with different UTC offsets. Joining on the label produces two matches for one
modelled hour, and summing produces 25 hours of generation in a 24-hour day. `ambiguous="raise"`
catches it; `ambiguous=True` picks the first occurrence and quietly discards the second hour of real
generation.

Both are single hours in 8,760, which is why the annual total moves by hundredths of a percent and
nobody notices until an hourly comparison is attempted. The correlation collapse in the opening
scenario is the same defect seen from a different angle: two series offset by an hour for part of the
year correlate poorly on exactly those days and well everywhere else.

## Frequently asked questions

### Is `Etc/GMT+6` really six hours behind UTC?

Yes, despite the sign looking backwards. The `Etc/GMT` zones follow the POSIX convention where the
sign is inverted, so `Etc/GMT+6` is UTC−6 — US Central Standard Time. It is worth the confusion
because these zones never observe DST, which is exactly the property a fixed-offset resource file
needs.

### What if the source does not say which convention it uses?

Infer it from the data and then confirm. A solar series in local standard time peaks near 12:00 local
year-round; one in clock time peaks near 13:00 in summer; one in UTC peaks at an offset equal to the
longitude. Plotting the mean diurnal profile by month makes the convention obvious in seconds, and
the inference belongs in the file's metadata once made.

### Should the pipeline ever store local time?

Only as a derived column for presentation, never as the index. A local-time index makes every join
and every hour count conditional on a zone, and the cost of converting at render time is nil.

### How do leap seconds affect this?

They do not, in practice. Pandas and NumPy timestamps ignore leap seconds, meter data is not
timestamped to that precision, and an hourly energy series has no way to represent one. It is the one
timekeeping subtlety that can safely be ignored here.

### What about half-hourly or five-minute data?

The same rules apply and the transitions get proportionally more interesting — a fall-back hour
contains two of every sub-hourly interval. The completeness check generalises by replacing the
expected hour count with the expected interval count, and the fixed-offset advice becomes more
valuable rather than less.

### How do I validate a fix?

Count. After conversion, an index should have exactly 8,760 or 8,784 unique UTC hours, no duplicates
and no gaps, and the mean diurnal profile should place solar noon within a few minutes of the
astronomical value for the site longitude. Those two checks together catch every failure described on
this page.

## Related

- [Temporal Data Aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) — the parent workflow and its resample semantics
- [Computing Capacity Factors from Hourly Generation Timeseries](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/computing-capacity-factors-from-hourly-generation-timeseries/) — where the hour count enters the denominator
- [Resampling Hourly Solar Data to Monthly Averages](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/resampling-hourly-solar-data-to-monthly-averages/) — the reduction this index feeds
- [Validating NREL Solar Datasets with Python](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/validating-nrel-solar-datasets-with-python/) — the UTC convention NSRDB actually publishes
