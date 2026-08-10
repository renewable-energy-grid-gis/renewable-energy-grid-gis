---
title: Adding Spatial Regression Tests to a CI Pipeline
description: Catch centimetre-scale reprojection drift, silent geometry repairs and area regressions before they ship — a small committed fixture, exact tolerances, and the four assertions worth failing a build over.
slug: adding-spatial-regression-tests-to-a-ci-pipeline
type: article
breadcrumb: Spatial Regression Tests in CI
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Adding Spatial Regression Tests to a CI Pipeline

The scenario: a dependency bump passes every unit test, deploys cleanly, and changes a reported
setback area by 0.4 percent. Nobody notices for two months, and then a reviewer compares two versions
of the same submission. Spatial regressions are hard to catch with ordinary tests because the outputs
are geometries rather than values, and because "close enough" is a real requirement rather than a
smell. This page builds the fixture suite that catches them, and it is the CI half of
[spatial pipeline orchestration and deployment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-pipeline-orchestration-and-deployment/).

## Root-cause analysis

Spatial regressions escape ordinary testing for three structural reasons.

1. **Geometry equality is the wrong assertion.** Two polygons that differ by a floating-point ulp in
   one vertex are not equal, and a test that demands equality fails on every platform change. Tests
   have to assert on measurable properties — area, length, centroid, validity, CRS — with explicit
   tolerances.
2. **The defect is in a dependency, not in the diff.** A PROJ upgrade, a GEOS overlay change or a
   GDAL resampling fix produces different output from unchanged code. Tests that only exercise the
   repository's own logic never see it.
3. **The magnitude is below the noise floor of a visual check.** An 8-centimetre coordinate shift and
   a 0.4 percent area change are invisible on a map and material in a submission, so the review that
   would catch a big error catches nothing.

<svg viewBox="0 0 940 404" role="img" aria-label="Three tiers of spatial test and what each one is for. Property tests over a committed fixture run in under a second on every commit and catch dependency-level regressions. Contract tests over a recorded portal response run in seconds and catch schema drift without touching the network. Scale tests over one real partition run in minutes nightly and catch memory and performance regressions that a fixture cannot express." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Three test tiers: fixture, contract and scale</title>
  <desc>Three tiers described side by side. Property tests over a committed fixture: under one second, run on every commit, catching reprojection drift, geometry repair changes and overlay arithmetic regressions. Contract tests over a recorded portal response: a few seconds, run on every commit, catching schema drift and parsing regressions with no network access. Scale tests over one real partition: several minutes, run nightly, catching memory growth and performance regressions. Each tier lists what it cannot catch, so the three are read as complements rather than alternatives.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="404"/>
  <defs><marker id="ci1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Three tiers, three failure classes, three cadences</text>
  <rect x="40" y="62" width="272" height="224" rx="9" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4" opacity="0.5"/>
  <text x="176" y="92" text-anchor="middle" font-size="13.5" fill="currentColor" font-weight="700">property tests</text>
  <text x="176" y="114" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">&lt; 1 s · every commit</text>
  <text x="176" y="148" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">reprojection drift</text>
  <text x="176" y="172" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">geometry repair changes</text>
  <text x="176" y="196" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">overlay arithmetic</text>
  <text x="176" y="262" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">cannot catch memory growth</text>
  <rect x="336" y="62" width="272" height="224" rx="9" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.4" opacity="0.5"/>
  <text x="472" y="92" text-anchor="middle" font-size="13.5" fill="currentColor" font-weight="700">contract tests</text>
  <text x="472" y="114" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">seconds · every commit</text>
  <text x="472" y="148" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">portal schema drift</text>
  <text x="472" y="172" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">parsing regressions</text>
  <text x="472" y="196" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">unit changes</text>
  <text x="472" y="262" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">cannot catch a live outage</text>
  <rect x="632" y="62" width="272" height="224" rx="9" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.4" opacity="0.5"/>
  <text x="768" y="92" text-anchor="middle" font-size="13.5" fill="currentColor" font-weight="700">scale tests</text>
  <text x="768" y="114" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">minutes · nightly</text>
  <text x="768" y="148" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">peak memory growth</text>
  <text x="768" y="172" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">wall-clock regressions</text>
  <text x="768" y="196" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.9">partition skew</text>
  <text x="768" y="262" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.8">too slow to gate a commit</text>
  <rect x="40" y="306" width="868" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="327" text-anchor="middle" font-size="11.5" fill="currentColor">The three are complements. A team with only property tests ships a memory regression; a team with only</text>
  <text x="474.0" y="344" text-anchor="middle" font-size="11.5" fill="currentColor">scale tests waits until midnight to learn that a reprojection moved.</text>
  <text x="40" y="386" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">None of the three should call a live portal — a recorded response is the contract.</text>
</svg>

## Pre-flight validation: what belongs in the fixture

The fixture should be small enough to commit and pathological enough to be interesting. Six items
cover most of the surface: a control point with a known reprojection, a polygon with a known area in
an equal-area frame, a self-intersecting bowtie, a polygon with a hole, a pair of layers that overlap
along a shared edge, and a small raster with a known windowed-read result. Together they are a few
kilobytes and exercise every library in the stack.

```python
from pathlib import Path

import geopandas as gpd
import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def parcels() -> gpd.GeoDataFrame:
    """Twelve parcels: two invalid, one with a hole, one straddling a UTM zone edge."""
    return gpd.read_file(FIXTURES / "parcels.gpkg")


@pytest.fixture(scope="session")
def constraints() -> gpd.GeoDataFrame:
    """Three constraint layers that overlap along shared edges, as real ones do."""
    return gpd.read_file(FIXTURES / "constraints.gpkg")
```

## Fix implementation: the four assertions

The tests below are deliberately property-based rather than snapshot-based. Each one asserts
something that must remain true, with a tolerance chosen from what the domain actually needs — a
centimetre for coordinates, a hundredth of a percent for areas.

```python
import math

import geopandas as gpd
import pyproj
import pytest

CONTROL_LONLAT = (-101.8313, 35.2220)
CONTROL_UTM14N = (334_936.15, 3_899_889.52)
KNOWN_PARCEL_HA = 42.187          # measured once in EPSG:5070, checked forever after


def test_control_point_reprojects_to_the_same_metre():
    """Catches a PROJ pipeline or datum-grid change — the invisible regression."""
    t = pyproj.Transformer.from_crs(4326, 32614, always_xy=True)
    x, y = t.transform(*CONTROL_LONLAT)
    assert math.isclose(x, CONTROL_UTM14N[0], abs_tol=0.01)
    assert math.isclose(y, CONTROL_UTM14N[1], abs_tol=0.01)


def test_parcel_area_is_stable(parcels):
    """Catches an equal-area frame change or a geometry repair that moved a boundary."""
    p = parcels.loc[parcels["parcel_id"] == "P-0007"].to_crs(5070)
    ha = float(p.area.iloc[0]) / 10_000.0
    assert ha == pytest.approx(KNOWN_PARCEL_HA, rel=1e-4)


def test_repair_preserves_area(parcels):
    """Catches a make_valid change that turns a bowtie into a different shape."""
    bad = parcels.loc[~parcels.is_valid].to_crs(5070)
    assert len(bad) == 2, "fixture should carry exactly two invalid geometries"
    repaired = bad.geometry.make_valid()
    assert repaired.is_valid.all()
    # A bowtie repair legitimately changes area; a hole repair must not.
    hole = parcels.loc[parcels["parcel_id"] == "P-0011"].to_crs(5070)
    assert float(hole.geometry.make_valid().area.iloc[0]) == pytest.approx(
        float(hole.area.iloc[0]), rel=1e-9
    )


def test_overlay_area_reconciles(parcels, constraints):
    """Catches a GEOS overlay change and any union/difference arithmetic regression."""
    study = parcels.to_crs(5070).union_all()
    excl = constraints.to_crs(5070).clip(study).union_all()
    buildable = study.difference(excl)
    gross_ha = study.area / 10_000.0
    excl_ha = excl.area / 10_000.0
    build_ha = buildable.area / 10_000.0
    assert build_ha + excl_ha == pytest.approx(gross_ha, rel=1e-9)
    assert build_ha <= gross_ha
```

<svg viewBox="0 0 940 470" role="img" aria-label="Choosing a tolerance for a spatial assertion. Floating-point noise sits below a micrometre; a legitimate PROJ realisation change is around a centimetre; survey staking tolerance is a few centimetres; a boundary vertex crossing a setback line is a metre; and a wrong equal-area frame is percent-scale. A tolerance of one centimetre for coordinates and one hundredth of a percent for areas sits in the gap between noise and anything that matters." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Where to put a tolerance on a logarithmic scale of things that move geometry</title>
  <desc>A logarithmic scale of displacement magnitudes from a micrometre to a hundred metres, with five regions marked. Below a micrometre: floating-point noise, which a test must ignore. Around a centimetre: a PROJ datum realisation change, which a test must catch. A few centimetres: survey staking tolerance. Around a metre: a boundary vertex crossing a setback line. Above ten metres: a wrong CRS entirely. A band between one millimetre and one centimetre is marked as where a coordinate tolerance belongs, and a separate note gives one hundredth of a percent as the equivalent for areas.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="470"/>
  <defs><marker id="ci2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">A tolerance has to sit between noise and consequence</text>
  <rect x="0" y="0" width="0" height="0" rx="7" fill="none"/>
  <line x1="100" y1="132" x2="880" y2="132" stroke="currentColor" stroke-width="1.6" opacity="0.6"/>
  <path d="M392.5,112 L392.5,98 L490.0,98 L490.0,112" fill="none" stroke="#3D8B5F" stroke-width="2"/>
  <text x="441.25" y="90" text-anchor="middle" font-size="11.5" fill="#1F5C3A" font-weight="700">put the tolerance here</text>
  <line x1="100.0" y1="125" x2="100.0" y2="139" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <text x="100.0" y="160" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1 µm</text>
  <line x1="392.5" y1="125" x2="392.5" y2="139" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <text x="392.5" y="160" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1 mm</text>
  <line x1="490.0" y1="125" x2="490.0" y2="139" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <text x="490.0" y="160" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1 cm</text>
  <line x1="587.5" y1="125" x2="587.5" y2="139" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <text x="587.5" y="160" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">10 cm</text>
  <line x1="685.0" y1="125" x2="685.0" y2="139" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <text x="685.0" y="160" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1 m</text>
  <line x1="782.5" y1="125" x2="782.5" y2="139" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <text x="782.5" y="160" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">10 m</text>
  <line x1="880.0" y1="125" x2="880.0" y2="139" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <text x="880.0" y="160" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">100 m</text>
  <rect x="40" y="178" width="868" height="38" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.45"/>
  <text x="60" y="203" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">below 1 µm</text>
  <text x="220" y="203" text-anchor="start" font-size="11.5" fill="currentColor">floating-point noise</text>
  <text x="890" y="203" text-anchor="end" font-size="11" fill="currentColor" opacity="0.9">a test must ignore it</text>
  <rect x="40" y="222" width="868" height="38" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.1" opacity="0.45"/>
  <text x="60" y="247" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">≈ 1 cm</text>
  <text x="220" y="247" text-anchor="start" font-size="11.5" fill="currentColor">PROJ datum realisation change</text>
  <text x="890" y="247" text-anchor="end" font-size="11" fill="currentColor" opacity="0.9">a test must catch it</text>
  <rect x="40" y="266" width="868" height="38" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.1" opacity="0.45"/>
  <text x="60" y="291" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">2–5 cm</text>
  <text x="220" y="291" text-anchor="start" font-size="11.5" fill="currentColor">survey staking tolerance</text>
  <text x="890" y="291" text-anchor="end" font-size="11" fill="currentColor" opacity="0.9">the domain limit</text>
  <rect x="40" y="310" width="868" height="38" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.1" opacity="0.45"/>
  <text x="60" y="335" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">≈ 1 m</text>
  <text x="220" y="335" text-anchor="start" font-size="11.5" fill="currentColor">a boundary vertex crosses a setback</text>
  <text x="890" y="335" text-anchor="end" font-size="11" fill="currentColor" opacity="0.9">a test must catch it</text>
  <rect x="40" y="354" width="868" height="38" rx="5" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.1" opacity="0.45"/>
  <text x="60" y="379" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">&gt; 10 m</text>
  <text x="220" y="379" text-anchor="start" font-size="11.5" fill="currentColor">the wrong CRS entirely</text>
  <text x="890" y="379" text-anchor="end" font-size="11" fill="currentColor" opacity="0.9">any test catches it</text>
  <rect x="40" y="404" width="428" height="48" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="254.0" y="425" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">coordinates: abs_tol = 0.01 m</text>
  <text x="254.0" y="442" text-anchor="middle" font-size="11.5" fill="currentColor">tight enough to catch a datum change</text>
  <rect x="492" y="404" width="416" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="700.0" y="425" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">areas: rel = 1e-4</text>
  <text x="700.0" y="442" text-anchor="middle" font-size="11.5" fill="currentColor">loose enough to survive a GEOS update</text>
</svg>

## Fallback routing and performance tuning

- **Keep the fixture in the repository, not in object storage.** A test that needs network access is
  a test that fails for reasons unrelated to the change under review.
- **Never let CI call a public portal.** Portal outages and rate limits become build failures, and
  the failure mode teaches the team to ignore red builds. Record a response once and replay it.
- **Separate fast from slow.** The property tests above run in under a second and belong on every
  commit; a scale test over a real partition belongs in a nightly job where a failure is informative
  rather than blocking.
- **Assert on properties, never on WKT strings.** A snapshot of well-known text is a test that fails
  on every platform, coordinate-precision or library change, which trains everyone to regenerate it
  without reading the diff.
- **Pin the container in CI too.** Running the tests in the same image the pipeline deploys is what
  makes them meaningful; running them against whatever the runner has installed tests the runner.

## Downstream validation

When a spatial test fails, the useful output is the magnitude and the direction of the change, not
merely that it changed. A failure that reports "area 42.187 → 42.203 ha (+0.038 percent, +0.016 ha)"
is triageable in seconds; one that reports "assertion failed" starts an investigation.

```python
def report_delta(name: str, expected: float, actual: float, unit: str) -> str:
    """Format a spatial regression so the reviewer can judge it without rerunning anything."""
    delta = actual - expected
    pct = (delta / expected * 100.0) if expected else float("inf")
    return f"{name}: {expected:.4f} → {actual:.4f} {unit} ({delta:+.4f}, {pct:+.3f}%)"
```

<svg viewBox="0 0 940 372" role="img" aria-label="Where each test tier sits in the delivery flow. A commit triggers the property and contract tests inside the same pinned container the pipeline deploys; a green run publishes the image; the nightly scale test runs against one real partition and reports a delta rather than a pass or fail; and a dependency upgrade takes the same path with the expected values updated in the same commit." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>The delivery flow, and where each kind of spatial test runs</title>
  <desc>A left-to-right flow. A commit enters a CI job that runs inside the pinned container image, where property tests and contract tests run in under ten seconds. A pass publishes the image to the registry and the pipeline deploys. A separate nightly job pulls the published image and runs a scale test over one real partition, emitting a delta report rather than a binary result. A dependency upgrade branch is shown taking the same path, with the expected fixture values updated in the same commit as the upgrade so the change is recorded rather than hidden.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="372"/>
  <defs><marker id="ci3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Same container in CI as in production — or the tests test the runner</text>
  <rect x="40" y="84" width="196" height="52" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="138.0" y="106" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">commit</text>
  <text x="138.0" y="124" text-anchor="middle" font-size="10.5" fill="currentColor">code or lockfile change</text>
  <line x1="240" y1="116" x2="264" y2="116" stroke="currentColor" stroke-width="1.4" marker-end="url(#ci3-arr)"/>
  <rect x="268" y="84" width="196" height="52" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="366.0" y="106" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">CI in the pinned image</text>
  <text x="366.0" y="124" text-anchor="middle" font-size="10.5" fill="currentColor">property + contract · &lt; 10 s</text>
  <line x1="468" y1="116" x2="492" y2="116" stroke="currentColor" stroke-width="1.4" marker-end="url(#ci3-arr)"/>
  <rect x="496" y="84" width="196" height="52" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="594.0" y="106" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">publish image</text>
  <text x="594.0" y="124" text-anchor="middle" font-size="10.5" fill="currentColor">digest recorded</text>
  <line x1="696" y1="116" x2="720" y2="116" stroke="currentColor" stroke-width="1.4" marker-end="url(#ci3-arr)"/>
  <rect x="724" y="84" width="196" height="52" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="822.0" y="106" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">nightly scale test</text>
  <text x="822.0" y="124" text-anchor="middle" font-size="10.5" fill="currentColor">one partition · delta</text>
  <rect x="268" y="196" width="424" height="73" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="480.0" y="218" text-anchor="middle" font-size="11.5" fill="currentColor">a dependency upgrade takes the same path —</text>
  <text x="480.0" y="237" text-anchor="middle" font-size="11.5" fill="currentColor">with the expected fixture values updated</text>
  <text x="480.0" y="256" text-anchor="middle" font-size="11.5" fill="currentColor">in the same commit as the upgrade</text>
  <line x1="480" y1="190" x2="480" y2="152" stroke="currentColor" stroke-width="1.4" opacity="0.6" marker-end="url(#ci3-arr)"/>
  <rect x="40" y="300" width="868" height="28" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="320" text-anchor="middle" font-size="11.5" fill="currentColor">The nightly job reports a delta rather than a pass: a 3% wall-clock change is information, not a failure.</text>
</svg>

## Frequently asked questions

### What tolerance should a coordinate assertion use?

One centimetre for projected coordinates is a good default: it is far tighter than any datum
realisation change that matters and far looser than floating-point noise. For geographic coordinates,
express the tolerance in metres by converting rather than in degrees, because a degree of longitude
is not a fixed distance and a degree-based tolerance is latitude-dependent.

### Should the fixture include real project data?

No. Use synthetic geometries with the same pathologies — an invalid ring, a hole, a shared edge, a
zone-straddling extent — because real parcels carry ownership information, cannot always be
redistributed, and are far larger than a test needs. Synthetic fixtures also let you construct the
awkward cases deliberately rather than hoping a real extract contains them.

### How do I test a raster pipeline without committing a large raster?

Commit a small one: a 64 by 64 float32 GeoTIFF with a known mean, a known nodata pattern and a known
windowed-read result is under 20 kilobytes and exercises the same code path as a national product.
What it will not exercise is memory behaviour, which belongs in the nightly scale test.

### What should happen when a dependency upgrade legitimately changes a result?

Update the expected value in the same commit as the upgrade, with the delta in the commit message.
That is the whole workflow the fixture exists to support: the test does not prevent change, it
forces the change to be seen and recorded. A silent 8-centimetre shift becomes a line in the history
explaining why the number moved.


### How many fixture geometries are enough?

A dozen, chosen for pathology rather than for coverage. Two invalid rings, one polygon with a hole,
one pair sharing an edge, one geometry straddling a UTM zone boundary and a handful of ordinary
parcels will exercise every branch a spatial pipeline has. Adding a hundred well-behaved parcels adds
runtime and finds nothing, because well-behaved geometry is not where the defects live.

### Should the tests assert on the number of features?

Yes, and it is one of the cheapest assertions available. A repair that silently splits a bowtie into
two polygons, an overlay that explodes one parcel into fragments, or a filter that drops rows all
show up as a changed feature count long before they show up as a changed area. Assert the count
alongside the area and the two together pin the behaviour.

### What about testing the CRS handling itself?

Test that the output CRS is the declared one, and test one reprojected coordinate — not the
transformation machinery, which is PROJ's job. The failure mode worth catching is a pipeline that
loses or overwrites a CRS somewhere in the middle, which shows up as an output whose declared frame
is right and whose coordinates are in a different one. The control point catches exactly that.


### Should a spatial test run against the real object store?

No — mock the boundary and test the parsing. What the pipeline reads from object storage is bytes in
a known format, and a fixture file exercises every code path that matters without a network call, a
credential or a bucket that someone can empty. The one thing worth testing against a real store is
the credential and permission wiring, and that belongs in a smoke test at deploy time rather than in
the commit path.

### How do these tests interact with the run-record assertions?

They are the same assertions at two moments. The CI tests run them against a fixture on every commit;
the pipeline runs a subset of them against real partitions on every run. Writing them once as
functions that take data and raise, rather than as test bodies, is what makes that reuse possible —
and it means a production failure and a CI failure produce the same message.

## Related

- [Spatial Pipeline Orchestration & Deployment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-pipeline-orchestration-and-deployment/) — the pipeline these tests guard
- [Containerizing a GeoPandas Pipeline with Docker and GDAL](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-pipeline-orchestration-and-deployment/containerizing-a-geopandas-pipeline-with-docker-and-gdal/) — the image these tests should run inside
- [Validating Geometry Topology with Shapely 2 Predicates](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/validating-geometry-topology-with-shapely-2-predicates/) — the repair behaviour the fixture pins
- [Spatial Data Quality & Validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) — the quality gate these tests keep honest
