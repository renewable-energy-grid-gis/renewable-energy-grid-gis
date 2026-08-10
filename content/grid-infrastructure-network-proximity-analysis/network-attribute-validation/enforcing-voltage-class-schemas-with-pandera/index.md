---
title: Enforcing Voltage Class Schemas with Pandera
description: Stop string-vs-int voltage_kv, unknown voltage classes, and null keys silently dropping rows in a spatial join — a pandera DataFrameSchema contract with coercion policy, lazy error collection, quarantine-with-reasons, and a CI/CD gate.
slug: enforcing-voltage-class-schemas-with-pandera
type: article
breadcrumb: Enforcing Voltage Class Schemas with Pandera
datePublished: 2026-07-14
dateModified: 2026-07-14
---

# Enforcing Voltage Class Schemas with Pandera

`SchemaError: expected series 'voltage_kv' to have type int64, got object` — or worse, no error at all and a substation layer that quietly loses a third of its rows in the next spatial join — is the scenario this page exists to eliminate. It breaks the schema-enforcement stage of [network attribute validation](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/): the moment a heterogeneous grid layer is asked to honour an attribute contract, a `voltage_kv` field carrying the string `"230kV"`, an off-book value like `287`, or a null on the join key turns a clean `sjoin` into a silently truncated result. Pandera makes that contract executable — a `DataFrameSchema` that codifies `voltage_kv ∈ {69, 115, 138, 230, 345, 500, 765}`, `capacity_mva` as a positive float, `operational` as a real boolean, and the identity keys as non-null — so the drift fails at the gate instead of surfacing as a wrong interconnection number three stages downstream.

The arithmetic of the damage is trivial and that is exactly why it goes unnoticed. An inner spatial join drops every row whose key is null, so the fractional site loss is

$$ f_{\text{lost}} = \frac{N_{\text{in}} - N_{\text{out}}}{N_{\text{in}}} $$

and nothing raises when $f_{\text{lost}}$ climbs — the DataFrame just gets shorter. A schema that refuses nulls on the key turns that invisible shrinkage into a loud, pre-join failure.

## Root-cause analysis

Three compounding causes account for nearly every broken voltage-class contract, and each maps to a distinct pandera mechanism in the fix below:

1. **Type drift — string versus int.** Utility exports and OpenStreetMap tags frequently render voltage as `"230000"` (volts, as text), `"230 kV"`, or `"230kV"`. Pandas infers the column as `object`, so a downstream `voltage_kv == 230` comparison matches nothing and a `groupby("voltage_kv")` produces one bucket per spelling. The type is wrong before any value is even checked.
2. **Unknown voltage classes.** A field that *is* numeric can still carry a value outside the standard transmission classes — `287`, `0`, `-1`, or a distribution-level `12`. These are physically implausible for the transmission network being modelled, but a bare dtype check waves them through, and they later distort thermal-rating lookups and capacity aggregation.
3. **Null keys and coercion surprises.** A null `asset_id` or `voltage_kv` on the join key silently drops the row in an inner `sjoin`, understating available network capacity. And naive coercion is its own trap: `astype(int)` on `"230kV"` raises, while `pd.to_numeric(..., errors="coerce")` turns it into `NaN` — swapping a loud failure for a silent one. Coercion must be *policied*, not reflexive.

<svg viewBox="0 0 1020 372" role="img" aria-label="Mapping each voltage-schema failure mode to its pandera mechanism and outcome. Type drift, meaning string voltage like 230kV versus int, is handled by a Column with dtype int and coerce set true, which parses or fails at the gate. Unknown voltage class, a value outside the standard set, is handled by a Check with isin of the allowed classes, which quarantines the offending rows. Null key and coercion surprise is handled by a Column with nullable false plus schema validation with lazy true, which collects every error before the spatial join runs. All three outcomes converge on a validated GeoDataFrame plus a quarantine table carrying failure reasons." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <rect class="svg-bg" x="0" y="0" width="1020" height="372"/>
  <title>Mapping each voltage-schema failure mode to its pandera mechanism and outcome</title>
  <desc>Three failure modes each route to a pandera mechanism and an outcome branch: type drift (string versus int) to a Column with dtype int and coerce=True, which parses or fails at the gate; unknown voltage class to a Check.isin of the allowed voltage set, which quarantines offending rows; null key and coercion surprise to a Column with nullable=False validated with lazy=True, which collects every failure before the spatial join. All outcomes converge on a validated GeoDataFrame plus a quarantine table with reasons.</desc>
  <defs>
    <marker id="pa-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="currentColor"/>
    </marker>
  </defs>
  <g font-size="11" font-weight="700" letter-spacing="0.8" fill="currentColor" opacity="0.7" text-anchor="middle">
    <text x="120" y="20">FAILURE MODE</text>
    <text x="392" y="20">PANDERA MECHANISM</text>
    <text x="675" y="20">OUTCOME</text>
  </g>
  <line x1="15" y1="30" x2="850" y2="30" stroke="currentColor" stroke-width="1" opacity="0.3"/>
  <!-- failure-mode boxes (warning palette) -->
  <g stroke-width="1.5" stroke="#F4A261" fill="#FFE3BE">
    <rect x="18" y="44"  width="204" height="74" rx="10"/>
    <rect x="18" y="158" width="204" height="74" rx="10"/>
    <rect x="18" y="272" width="204" height="74" rx="10"/>
  </g>
  <!-- mechanism boxes (stage palette) -->
  <g stroke-width="1.5" stroke="#5BA8C8" fill="#DCEEF6">
    <rect x="300" y="51"  width="184" height="60" rx="10"/>
    <rect x="300" y="165" width="184" height="60" rx="10"/>
    <rect x="300" y="279" width="184" height="60" rx="10"/>
  </g>
  <!-- outcome boxes (neutral) -->
  <g stroke-width="1.5" stroke="currentColor" stroke-opacity="0.5" fill="currentColor" fill-opacity="0.06">
    <rect x="560" y="44"  width="230" height="74" rx="10"/>
    <rect x="560" y="158" width="230" height="74" rx="10"/>
    <rect x="560" y="272" width="230" height="74" rx="10"/>
  </g>
  <!-- sink (success palette) -->
  <rect x="858" y="120" width="150" height="130" rx="10" stroke-width="1.5" stroke="#3D8B5F" fill="#DDF0E2"/>
  <g fill="currentColor" text-anchor="middle">
    <!-- failure modes -->
    <g font-size="13" font-weight="600">
      <text x="120" y="75">Type drift</text>
      <text x="120" y="190">Unknown class</text>
      <text x="120" y="300">Null key /</text>
    </g>
    <g font-size="11" opacity="0.78">
      <text x="120" y="94">"230kV" string</text><text x="120" y="109">vs int 230</text>
      <text x="120" y="208">value not in set</text>
      <text x="120" y="318">coercion surprise</text>
    </g>
    <!-- mechanisms -->
    <g font-size="12" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">
      <text x="392" y="77">Column(int,</text><text x="392" y="94">coerce=True)</text>
      <text x="392" y="199">Check.isin(...)</text>
      <text x="392" y="305">nullable=False</text><text x="392" y="321">+ lazy=True</text>
    </g>
    <!-- outcomes -->
    <g font-size="12.5">
      <text x="675" y="76">Parse or fail</text>
      <text x="675" y="190">Quarantine rows</text>
      <text x="675" y="304">Collect all errors</text>
    </g>
    <g font-size="11" opacity="0.78">
      <text x="675" y="95">at the gate, not later</text>
      <text x="675" y="208">off-book voltages held</text>
      <text x="675" y="322">before the sjoin runs</text>
    </g>
    <!-- sink -->
    <g font-size="13" font-weight="600">
      <text x="933" y="168">Validated</text>
      <text x="933" y="186">GeoDataFrame</text>
    </g>
    <text x="933" y="208" font-size="11" opacity="0.8">+ quarantine</text>
    <text x="933" y="223" font-size="11" opacity="0.8">table w/ reasons</text>
  </g>
  <!-- connectors -->
  <g stroke="currentColor" stroke-width="1.6" fill="none" opacity="0.85">
    <line x1="222" y1="81"  x2="296" y2="81"  marker-end="url(#pa-arrow)"/>
    <line x1="222" y1="195" x2="296" y2="195" marker-end="url(#pa-arrow)"/>
    <line x1="222" y1="309" x2="296" y2="309" marker-end="url(#pa-arrow)"/>
    <line x1="484" y1="81"  x2="556" y2="81"  marker-end="url(#pa-arrow)"/>
    <line x1="484" y1="195" x2="556" y2="195" marker-end="url(#pa-arrow)"/>
    <line x1="484" y1="309" x2="556" y2="309" marker-end="url(#pa-arrow)"/>
    <!-- outcomes converge on the sink -->
    <path d="M790 81  C 826 81,  826 160, 854 160" marker-end="url(#pa-arrow)"/>
    <line x1="790" y1="195" x2="854" y2="190" marker-end="url(#pa-arrow)"/>
    <path d="M790 309 C 826 309, 826 222, 854 222" marker-end="url(#pa-arrow)"/>
  </g>
</svg>

## Pre-flight validation

The point of a pre-flight is to surface which of the three causes is present *before* the main schema runs against the whole layer — a fast, read-only probe you can drop into a CI step or a notebook cell. It does not coerce or mutate; it reports.

<svg viewBox="0 0 940 412" role="img" aria-label="What coerce equals True does to each shape a voltage cell arrives in. The string 115 becomes 115.0 and passes. The string 115 kV cannot be parsed and becomes NaN, which then fails the non-null check rather than the unit check, so the error message names the wrong problem. An empty string and None both become NaN. The integer 115000 coerces cleanly and passes every type check while being a thousand times too large. Coercion is a type operation, never a validation." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Coercion changes the value; only a check can judge it</title>
  <desc>A table of five input values with what coercion produces and which check finally catches the problem. The string 115 coerces to 115.0 and passes. The string 115 kV coerces to NaN and is caught by the nullable check, not by a unit check, so the reported error names the wrong cause. An empty string and a None both coerce to NaN and are caught the same way. The integer 115000 coerces to 115000.0 and passes every type check, and is caught only by an explicit allowed-set or range check on nominal voltage classes.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="412"/>
  <defs><marker id="co-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">coerce=True is a cast — it makes values typed, not correct</text>
  <text x="60" y="70" text-anchor="start" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">as delivered</text>
  <text x="280" y="70" text-anchor="start" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">after coercion</text>
  <text x="470" y="70" text-anchor="start" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">what actually catches it</text>
  <rect x="40" y="82" width="868" height="42" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.55"/>
  <text x="60" y="109" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">&quot;115&quot;</text>
  <text x="280" y="109" text-anchor="start" font-size="12" fill="currentColor">115.0</text>
  <text x="470" y="109" text-anchor="start" font-size="11.5" fill="currentColor">passes</text>
  <rect x="40" y="132" width="868" height="42" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.55"/>
  <text x="60" y="159" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">&quot;115 kV&quot;</text>
  <text x="280" y="159" text-anchor="start" font-size="12" fill="currentColor">NaN</text>
  <text x="470" y="159" text-anchor="start" font-size="11.5" fill="currentColor">caught by nullable, not by unit</text>
  <rect x="40" y="182" width="868" height="42" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.55"/>
  <text x="60" y="209" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">&quot;&quot;</text>
  <text x="280" y="209" text-anchor="start" font-size="12" fill="currentColor">NaN</text>
  <text x="470" y="209" text-anchor="start" font-size="11.5" fill="currentColor">caught by nullable</text>
  <rect x="40" y="232" width="868" height="42" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.55"/>
  <text x="60" y="259" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">None</text>
  <text x="280" y="259" text-anchor="start" font-size="12" fill="currentColor">NaN</text>
  <text x="470" y="259" text-anchor="start" font-size="11.5" fill="currentColor">caught by nullable</text>
  <rect x="40" y="282" width="868" height="42" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2" opacity="0.55"/>
  <text x="60" y="309" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">115000</text>
  <text x="280" y="309" text-anchor="start" font-size="12" fill="currentColor">115000.0</text>
  <text x="470" y="309" text-anchor="start" font-size="11.5" fill="currentColor">passes every type check — needs an allowed-set check</text>
  <rect x="40" y="344" width="868" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="365" text-anchor="middle" font-size="11.5" fill="currentColor">The 115 kV case is the dangerous one: the failure_cases frame reports a null, so an engineer fixes the</text>
  <text x="474.0" y="382" text-anchor="middle" font-size="11.5" fill="currentColor">nullability rule instead of the unit parsing that produced it.</text>
</svg>

```python
import geopandas as gpd
import pandas as pd

ALLOWED_KV = {69, 115, 138, 230, 345, 500, 765}


def preflight_voltage_schema(substation_gdf: gpd.GeoDataFrame) -> dict:
    """Surface type, domain, and null risks before pandera validation runs."""
    kv = substation_gdf.get("voltage_kv")
    numeric_kv = pd.to_numeric(kv, errors="coerce")  # probe only — not persisted
    return {
        "voltage_dtype": str(kv.dtype),                    # object => type drift
        "non_numeric_rows": int(numeric_kv.isna().sum() - kv.isna().sum()),
        "unknown_classes": sorted(
            set(numeric_kv.dropna().astype("Int64")) - ALLOWED_KV
        ),
        "null_keys": int(substation_gdf["asset_id"].isna().sum()),
        "null_voltage": int(kv.isna().sum()),
        "operational_dtype": str(substation_gdf["operational"].dtype),  # object => not bool
    }
```

| Probe | Diagnostic | Healthy result |
|-------|-----------|----------------|
| Type drift | `substation_gdf["voltage_kv"].dtype` | `int64` or `Int64`, never `object` |
| Non-numeric text | `pd.to_numeric(kv, errors="coerce").isna()` | count matches genuine nulls only |
| Unknown classes | `set(kv) - {69,115,138,230,345,500,765}` | empty set |
| Null join keys | `substation_gdf["asset_id"].isna().sum()` | `0` before any `sjoin` |
| Boolean truthiness | `substation_gdf["operational"].dtype` | `bool`, not `"Y"`/`"N"` strings |

An empty `unknown_classes` list and a numeric `voltage_dtype` mean the schema will pass on the happy path; a non-empty one tells you exactly which rows to expect in the quarantine table, so the gate failure is never a surprise.

## Fix implementation

The corrected approach declares the contract once as a pandera `DataFrameSchema` and validates with `lazy=True` so every violation is collected in a single pass rather than aborting on the first one. Coercion is deliberate: `coerce=True` on `voltage_kv` parses clean numeric strings to `int`, but a custom check rejects anything that survives coercion yet falls outside the standard classes — coercion normalises format, the check enforces domain. Rows that fail are quarantined *with their reason*, never dropped, mirroring the quarantine-not-delete discipline the parent [network attribute validation](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/) gate applies to status and rating fields.

<svg viewBox="0 0 940 372" role="img" aria-label="What lazy validation changes about a schema run. Eager validation raises on the first bad cell, so a 42,000-row load surfaces one error per run and takes as many runs as there are distinct defects to fix. Lazy validation collects every failing check into one SchemaErrors exception with a failure_cases frame — here 1,284 rows across four checks — so one run produces the entire remediation list and the dead-letter store gets a complete record." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Eager validation reports one defect; lazy validation reports all of them</title>
  <desc>Two panels. The eager panel shows a run stopping at row 318 with a single error message and 41,682 rows never examined, annotated as needing one run per defect. The lazy panel shows the same run completing with a failure_cases frame of 1,284 rows grouped by check: 612 rows failing the nominal voltage set, 421 failing the non-null asset identifier, 208 failing the capacity range and 43 failing the coordinate bounds. An arrow routes the failure frame to a dead-letter store while the passing rows continue downstream.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="372"/>
  <defs><marker id="lz-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">validate(lazy=True) turns a stack trace into a work list</text>
  <rect x="30" y="58" width="400" height="240" rx="9" fill="none" stroke="#C85B5B" stroke-width="1.2" opacity="0.6"/>
  <text x="230" y="84" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">eager — raises on the first bad cell</text>
  <rect x="58" y="100" width="344" height="30" rx="5" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="230" y="120" text-anchor="middle" font-size="11" fill="currentColor">SchemaError at row 318: voltage_kv = 1150</text>
  <text x="230" y="158" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.9">41 682 rows never examined</text>
  <text x="230" y="182" text-anchor="middle" font-size="12" fill="#7A4A1A" font-weight="700">one defect per run</text>
  <text x="230" y="214" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.85">fix · rerun · fix · rerun</text>
  <text x="230" y="248" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.85">four defects = four full passes</text>
  <rect x="470" y="58" width="440" height="240" rx="9" fill="none" stroke="#3D8B5F" stroke-width="1.2" opacity="0.6"/>
  <text x="690" y="84" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">lazy — collects every failing check</text>
  <rect x="498" y="104" width="384" height="34" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="514" y="126" text-anchor="start" font-size="11" fill="currentColor">voltage_kv not in nominal set</text>
  <text x="868" y="126" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">612 rows</text>
  <rect x="498" y="146" width="384" height="34" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="514" y="168" text-anchor="start" font-size="11" fill="currentColor">asset_id null</text>
  <text x="868" y="168" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">421 rows</text>
  <rect x="498" y="188" width="384" height="34" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="514" y="210" text-anchor="start" font-size="11" fill="currentColor">capacity_mw out of range</text>
  <text x="868" y="210" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">208 rows</text>
  <rect x="498" y="230" width="384" height="34" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="514" y="252" text-anchor="start" font-size="11" fill="currentColor">coordinates outside study area</text>
  <text x="868" y="252" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">43 rows</text>
  <text x="690" y="288" text-anchor="middle" font-size="11.5" fill="#1F5C3A" font-weight="700">1 284 failing rows, one exception, one work list</text>
  <rect x="30" y="320" width="880" height="28" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="470.0" y="340" text-anchor="middle" font-size="11.5" fill="currentColor">failure_cases carries column, check, failing value and index — enough to write the dead-letter record without re-reading the source.</text>
</svg>

```python
import geopandas as gpd
import pandas as pd
import pandera.pandas as pa
from pandera import Check, Column, DataFrameSchema

ALLOWED_KV = [69, 115, 138, 230, 345, 500, 765]

grid_schema = DataFrameSchema(
    {
        # Coerce clean numeric strings to int, then enforce the standard classes.
        "voltage_kv": Column(
            int,
            checks=Check.isin(ALLOWED_KV, error="voltage_kv not a standard class"),
            coerce=True,
            nullable=False,
        ),
        # Thermal rating must be a strictly positive float.
        "capacity_mva": Column(
            float,
            checks=Check.greater_than(0, error="capacity_mva must be > 0"),
            coerce=True,
            nullable=False,
        ),
        # A real boolean — "Y"/"N"/1/0 strings are rejected, not silently truthy.
        "operational": Column(bool, coerce=True, nullable=False),
        # Identity key: a null here would vanish in an inner sjoin.
        "asset_id": Column(str, nullable=False, unique=True),
    },
    strict=False,   # extra source columns are allowed to pass through
    coerce=False,   # per-column coercion only; no blanket casts
)


def validate_grid_attributes(
    substation_gdf: gpd.GeoDataFrame,
) -> tuple[gpd.GeoDataFrame, pd.DataFrame]:
    """Return (clean_gdf, quarantine_df). Failures are held with reasons, not dropped."""
    try:
        clean = grid_schema.validate(substation_gdf, lazy=True)
        quarantine = substation_gdf.iloc[0:0].assign(failure_reason=pd.Series(dtype=str))
    except pa.errors.SchemaErrors as exc:
        # failure_cases lists every violation across all columns in one pass.
        bad_index = exc.failure_cases["index"].dropna().astype(int).unique()
        reasons = (
            exc.failure_cases.dropna(subset=["index"])
            .groupby("index")["check"]
            .agg("; ".join)
        )
        quarantine = substation_gdf.loc[bad_index].copy()
        quarantine["failure_reason"] = quarantine.index.map(reasons)
        clean = substation_gdf.drop(index=bad_index)
        # Re-validate the survivors so coercion (e.g. "230" -> 230) is applied.
        clean = grid_schema.validate(clean, lazy=True)
    return gpd.GeoDataFrame(clean, geometry="geometry", crs=substation_gdf.crs), quarantine
```

Two parameter choices carry the design. `lazy=True` means a layer with three distinct problems produces one report naming all three, so an analyst fixes the source once instead of iterating through exceptions. `coerce=True` scoped to individual columns — with the schema-level `coerce=False` — parses `"230"` to `230` without risking a blanket cast that would silently mangle an unrelated column. Keeping the survivors and the quarantine as two returned frames preserves the same CRS the layer arrived with, so the cleaned output drops straight into a downstream `sjoin` against [transmission line and substation mapping](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/) outputs without a reprojection round-trip.

## Fallback routing & performance tuning

For portfolio-scale layers, CI gates, or reconciliation runs, layer these strategies on top of the core validator:

- **Always validate lazily in batch.** `lazy=True` collects every failure in one pass; the default eager mode aborts on the first bad cell and hides the rest, forcing serial fix-and-rerun cycles that dominate wall-clock time on wide layers.
- **Coerce format, check domain — never conflate them.** Use `coerce=True` only to normalise representation (numeric strings to `int`, `"true"`/`1` to `bool`). Enforce membership with an explicit `Check.isin(ALLOWED_KV)` so an off-book `287` fails loudly instead of being coerced into something plausible.
- **Route quarantined rows, don't delete them.** Persist the quarantine frame (with `failure_reason`) to the same anomaly log the validation gate emits, so an off-book voltage or a null key is auditable rather than gone. Many quarantine cases are genuine identity mismatches better resolved by [reconciling mismatched substation IDs across grid datasets](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/reconciling-mismatched-substation-ids-across-grid-datasets/) than discarded.
- **Compile the schema once.** Build the `DataFrameSchema` at module scope and reuse it across chunks; reconstructing it per chunk re-parses every `Check` and is measurable overhead at national scale. It also drops cleanly into a `dask-geopandas` partition map because the checks are all row-local.
- **Consider pydantic for record-at-a-time paths.** Where features arrive one at a time over an API rather than as a frame — a streaming ingest or a webhook — a `pydantic` `BaseModel` with an `enum` for `voltage_kv` gives the same domain guarantee per record. Use pandera for columnar/tabular validation and pydantic for row objects; they are complementary, not competing.

## Downstream validation

Even after quarantine, a regression upstream can reintroduce drift, so gate the *cleaned* output with an assertion suitable for a CI/CD pipeline. This asserts the contract actually held — correct dtype, zero off-book classes, no null keys, and no unexplained row loss — and fails the build before a poisoned layer reaches interconnection modelling.

```python
def assert_schema_clean(
    clean_gdf: gpd.GeoDataFrame, n_input: int, max_quarantine_frac: float = 0.05
) -> None:
    """CI/CD gate: fail the build if the voltage-class contract was not honoured."""
    assert clean_gdf["voltage_kv"].dtype.kind in "iu", "voltage_kv not integer-typed"
    off_book = set(clean_gdf["voltage_kv"]) - set(ALLOWED_KV)
    assert not off_book, f"off-book voltage classes survived: {sorted(off_book)}"
    assert clean_gdf["asset_id"].notna().all(), "null join key would drop rows in sjoin"
    assert clean_gdf["asset_id"].is_unique, "duplicate asset_id breaks join cardinality"
    assert (clean_gdf["capacity_mva"] > 0).all(), "non-positive thermal rating present"

    dropped_frac = (n_input - len(clean_gdf)) / max(n_input, 1)
    assert dropped_frac <= max_quarantine_frac, (
        f"{dropped_frac:.0%} of rows quarantined (> {max_quarantine_frac:.0%}); "
        "the source layer is too dirty to be defensible without review"
    )
```

Reporting `dropped_frac` alongside the quarantine table is what keeps the layer auditable: an independent engineer reviewing the interconnection package can see exactly how many rows were held back and why, the same lineage discipline that geometry-level checks such as [validating geometry topology with Shapely 2 predicates](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/validating-geometry-topology-with-shapely-2-predicates/) provide for the spatial side. Pin `pandera` and `pandas` versions in `pyproject.toml` so a coercion-behaviour change between releases cannot silently shift which rows pass between runs, and wrap the assertion in `pytest` with a small fixture layer so the gate runs on every commit that touches the ingestion path.

## Related

- [Network Attribute Validation](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/) — the parent gate whose schema-enforcement stage this voltage contract implements.
- [Reconciling Mismatched Substation IDs Across Grid Datasets](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/network-attribute-validation/reconciling-mismatched-substation-ids-across-grid-datasets/) — where quarantined identity-key failures are resolved rather than discarded.
- [Transmission Line & Substation Mapping](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/) — the upstream extraction that produces the layers this schema validates.
- [Validating Geometry Topology with Shapely 2 Predicates](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/validating-geometry-topology-with-shapely-2-predicates/) — the geometry-side counterpart to attribute-schema enforcement.
