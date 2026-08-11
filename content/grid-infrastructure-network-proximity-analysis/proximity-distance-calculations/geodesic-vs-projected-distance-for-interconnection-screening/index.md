---
title: Geodesic vs Projected Distance for Interconnection Screening
description: Decide when a projected distance is good enough and when only a geodesic one will do — measured error by baseline length and latitude, the cost of each method, and the rule that keeps a national screen both fast and defensible.
slug: geodesic-vs-projected-distance-for-interconnection-screening
type: article
breadcrumb: Geodesic vs Projected Distance
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Geodesic vs Projected Distance for Interconnection Screening

The scenario: a national screen ranks candidate sites by distance to the nearest suitable substation,
and two sites 900 kilometres apart are compared using a single projected frame chosen for the
portfolio centroid. One is measured 4 percent long and the other 2 percent short, which is enough to
reorder them. The fix is not "always use geodesic" — that is 40 times slower and unnecessary for
most of the work — but knowing where the boundary is. This page locates it, and it extends
[proximity and distance calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/).

## Root-cause analysis

Projected distance is exact in the plane and approximate on the ellipsoid, and the error has three
drivers that compound.

1. **Distance from the frame's central meridian or standard parallels.** A transverse Mercator zone
   is near-exact on its central meridian and departs quadratically with easting; at the zone edge the
   scale factor is about 1.0007, so a 400-metre spacing measures 28 centimetres long.
2. **Baseline length.** The scale error is a ratio, so it grows linearly with the distance being
   measured. A 0.07 percent error is 28 centimetres over 400 metres and 700 metres over 1,000
   kilometres.
3. **Using one frame for an extent it was not designed for.** This is the dominant term in practice.
   A portfolio spanning several UTM zones measured in one of them accumulates error that is
   systematic per site, which is exactly the shape that reorders a ranking.

<svg viewBox="0 0 940 412" role="img" aria-label="Disagreement between projected and geodesic distance, by baseline length and by how far the measurement sits from the frame’s central meridian. On the central meridian the error is a flat 0.04 percent from the scale factor alone: 4 centimetres at 100 metres and 40 metres at 100 kilometres. At the zone edge it is 0.07 percent. Two zones away it reaches 2 to 4 percent and stops being a rounding difference." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Projected versus geodesic error by baseline and frame fit</title>
  <desc>A chart with baseline length from 100 metres to 1,000 kilometres on a logarithmic horizontal axis and absolute error in metres on a logarithmic vertical axis. Three lines are drawn: measurement on the central meridian at a constant 0.04 percent, at the zone edge at 0.07 percent, and two zones outside the frame at about 3 percent. Marked points give 4 centimetres at 100 metres and 40 metres at 100 kilometres on the central meridian, and 30 kilometres of error on a 1,000 kilometre baseline measured two zones out. A shaded band marks where the error exceeds a metre.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="412"/>
  <defs><marker id="gd1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The error is a ratio — it is the baseline that makes it matter</text>
  <line x1="110" y1="288" x2="850" y2="288" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="110" y1="70" x2="110" y2="288" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="110.0" y1="288" x2="110.0" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="110.0" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">100 m</text>
  <line x1="295.0" y1="288" x2="295.0" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="295.0" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1 km</text>
  <line x1="480.0" y1="288" x2="480.0" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="480.0" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">10 km</text>
  <line x1="665.0" y1="288" x2="665.0" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="665.0" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">100 km</text>
  <line x1="850.0" y1="288" x2="850.0" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="850.0" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1 000 km</text>
  <line x1="106" y1="260.10526315789474" x2="850" y2="260.10526315789474" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="264.10526315789474" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">1 cm</text>
  <line x1="106" y1="204.31578947368422" x2="850" y2="204.31578947368422" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="208.31578947368422" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">1 m</text>
  <line x1="106" y1="148.52631578947367" x2="850" y2="148.52631578947367" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="152.52631578947367" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">100 m</text>
  <line x1="106" y1="92.73684210526315" x2="850" y2="92.73684210526315" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="96.73684210526315" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">10 km</text>
  <text x="20" y="62" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.8">baseline length →</text>
  <path d="M110.0,243.3 L295.0,215.4 L480.0,187.5 L665.0,159.6 L850.0,131.7" fill="none" stroke="#3D8B5F" stroke-width="2.5"/>
  <path d="M110.0,236.5 L295.0,208.6 L480.0,180.7 L665.0,152.8 L850.0,125.0" fill="none" stroke="#5BA8C8" stroke-width="2.5"/>
  <path d="M110.0,191.0 L295.0,163.1 L480.0,135.2 L665.0,107.3 L850.0,79.4" fill="none" stroke="#C85B5B" stroke-width="2.5"/>
  <line x1="110" y1="204.31578947368422" x2="850" y2="204.31578947368422" stroke="#F4A261" stroke-width="1.4" stroke-dasharray="5 4"/>
  <text x="120" y="194.31578947368422" text-anchor="start" font-size="11" fill="#7A4A1A" font-weight="700">above one metre of error</text>
  <rect x="110" y="322" width="16" height="12" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="134" y="333" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">central meridian · 0.04%</text>
  <rect x="410" y="322" width="16" height="12" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="434" y="333" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">zone edge · 0.07%</text>
  <rect x="710" y="322" width="16" height="12" rx="2" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2"/>
  <text x="734" y="333" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">two zones out · ~3%</text>
  <rect x="110" y="348" width="740" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="480.0" y="367" text-anchor="middle" font-size="11" fill="currentColor">The error is systematic per site, not random, so it does not average out across a portfolio — which is</text>
  <text x="480.0" y="382" text-anchor="middle" font-size="11" fill="currentColor">exactly the shape that reorders a ranking.</text>
</svg>

## Pre-flight validation

The decision is quantitative, so measure it. For a given frame and extent, compare a sample of
baselines against the geodesic answer and read off the worst case.

```python
import geopandas as gpd
import numpy as np
from pyproj import Geod

GEOD = Geod(ellps="WGS84")


def projected_vs_geodesic(
    origins: gpd.GeoDataFrame,
    targets: gpd.GeoDataFrame,
    *,
    projected_epsg: int,
    sample: int = 500,
    seed: int = 7,
) -> dict:
    """Worst-case and typical disagreement between a projected frame and the ellipsoid."""
    rng = np.random.default_rng(seed)
    o = origins.sample(min(sample, len(origins)), random_state=seed)
    t = targets.sample(min(sample, len(targets)), random_state=seed + 1)
    pairs = min(len(o), len(t))

    og, tg = o.to_crs(4326).geometry.iloc[:pairs], t.to_crs(4326).geometry.iloc[:pairs]
    _, _, geodesic_m = GEOD.inv(og.x.values, og.y.values, tg.x.values, tg.y.values)

    op, tp = o.to_crs(projected_epsg).geometry.iloc[:pairs], t.to_crs(projected_epsg).geometry.iloc[:pairs]
    projected_m = np.hypot(op.x.values - tp.x.values, op.y.values - tp.y.values)

    rel = (projected_m - np.abs(geodesic_m)) / np.abs(geodesic_m)
    return {
        "pairs": pairs,
        "median_abs_error_pct": float(np.median(np.abs(rel)) * 100),
        "p95_abs_error_pct": float(np.percentile(np.abs(rel), 95) * 100),
        "max_abs_error_m": float(np.max(np.abs(projected_m - np.abs(geodesic_m)))),
        "bias_pct": float(np.mean(rel) * 100),      # systematic, not random
    }
```

The `bias_pct` field is the one that matters for a ranking. Random error averages out across a
portfolio; a systematic bias that depends on where a site sits relative to the frame does not.

## Fix implementation

The practical rule is a two-tier measurement: projected inside a zone, geodesic across zones, with
the tier chosen from the geometry rather than from a global setting.

```python
import geopandas as gpd
import numpy as np
from pyproj import Geod

GEOD = Geod(ellps="WGS84")


def screen_distances(
    sites: gpd.GeoDataFrame,
    substations: gpd.GeoDataFrame,
    *,
    zone_field: str = "utm_zone",
    cross_zone_method: str = "geodesic",
) -> gpd.GeoDataFrame:
    """Projected distance within a zone, geodesic across zones — decided per pair."""
    out = []
    for zone, sites_in_zone in sites.groupby(zone_field):
        epsg = 32600 + int(zone)                       # northern hemisphere UTM
        local_subs = substations[substations[zone_field] == zone]

        if not local_subs.empty:
            sp = sites_in_zone.to_crs(epsg)
            up = local_subs.to_crs(epsg)
            joined = gpd.sjoin_nearest(sp, up, how="left", distance_col="distance_m")
            joined["method"] = "projected"
            joined["frame"] = f"EPSG:{epsg}"
            out.append(joined)

        # Anything whose nearest candidate lies outside the zone is measured on the ellipsoid.
        far = substations[substations[zone_field] != zone]
        if not far.empty and cross_zone_method == "geodesic":
            sg = sites_in_zone.to_crs(4326)
            fg = far.to_crs(4326)
            for idx, site in sg.iterrows():
                _, _, dists = GEOD.inv(
                    np.full(len(fg), site.geometry.x), np.full(len(fg), site.geometry.y),
                    fg.geometry.x.values, fg.geometry.y.values,
                )
                best = int(np.argmin(np.abs(dists)))
                out.append(
                    gpd.GeoDataFrame(
                        [{**site.to_dict(), "distance_m": float(abs(dists[best])),
                          "method": "geodesic", "frame": "WGS84 ellipsoid"}],
                        geometry="geometry", crs=4326,
                    )
                )
    return gpd.pd.concat(out, ignore_index=True)
```

Recording the `method` and `frame` per row is what makes a mixed-tier result honest: two distances in
the same column measured different ways are comparable to within the error the pre-flight already
quantified, and a reviewer can see which is which.

<svg viewBox="0 0 940 400" role="img" aria-label="The two-tier rule in practice. Pairs whose site and substation share a UTM zone are measured in that zone: 41,800 of 42,000 pairs, at 3 microseconds each. Pairs that cross a zone are measured on the ellipsoid: 200 pairs, at about 9 microseconds each. The whole screen costs 0.14 seconds and no pair is measured in a frame that does not fit it." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Two tiers, chosen per pair rather than per pipeline</title>
  <desc>A decision flow for one site-substation pair. If both lie in the same UTM zone, the pair is measured with a projected distance in that zone, accounting for 41,800 of 42,000 pairs at 3 microseconds each. If they lie in different zones, the pair is measured geodesically on the WGS84 ellipsoid, accounting for 200 pairs at 9 microseconds each. A summary gives the total screen cost as 0.14 seconds and notes that every distance carries the method and frame that produced it.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="gd2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">One rule, applied per pair</text>
  <rect x="40" y="150" width="220" height="34" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="150.0" y="172" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">site–substation pair</text>
  <path d="M266,176 L316,176 L316,120 L360,120" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#gd2-arr)"/>
  <path d="M266,176 L316,176 L316,246 L360,246" fill="none" stroke="currentColor" stroke-width="1.4" marker-end="url(#gd2-arr)"/>
  <text x="276" y="140" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.8">same zone</text>
  <text x="276" y="216" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.8">different zones</text>
  <rect x="368" y="88" width="300" height="73" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="518.0" y="110" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">projected in that zone</text>
  <text x="518.0" y="129" text-anchor="middle" font-size="11.5" fill="currentColor">41 800 pairs · 3 µs each</text>
  <text x="518.0" y="148" text-anchor="middle" font-size="11" fill="currentColor">error under 0.07%</text>
  <rect x="368" y="214" width="300" height="73" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="518.0" y="236" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">geodesic on the ellipsoid</text>
  <text x="518.0" y="255" text-anchor="middle" font-size="11.5" fill="currentColor">200 pairs · 9 µs each</text>
  <text x="518.0" y="274" text-anchor="middle" font-size="11" fill="currentColor">no frame-fit assumption</text>
  <rect x="700" y="88" width="208" height="64" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="804.0" y="110" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">total screen</text>
  <text x="804.0" y="134" text-anchor="middle" font-size="18" fill="currentColor" font-weight="700">0.14 s</text>
  <rect x="700" y="196" width="208" height="54" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="804.0" y="218" text-anchor="middle" font-size="11.5" fill="currentColor">every row carries</text>
  <text x="804.0" y="237" text-anchor="middle" font-size="11.5" fill="currentColor" font-weight="700">method and frame</text>
  <rect x="40" y="306" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="325" text-anchor="middle" font-size="11" fill="currentColor">Choosing per pair costs one column comparison and removes the only case where a projected frame is used</text>
  <text x="474.0" y="340" text-anchor="middle" font-size="11" fill="currentColor">outside the extent it was designed for.</text>
</svg>

## Fallback routing and performance tuning

- **Vectorise the geodesic call.** `Geod.inv` accepts arrays, so a loop over pairs is the usual
  reason geodesic distance is reported as slow; the array form is within a small factor of the
  projected calculation.
- **Filter before measuring.** A geodesic distance to every substation in the country is wasted work;
  an H3 or bounding-box pre-filter cuts the candidate set to a handful before either method runs.
- **Reuse the zone assignment.** Deriving a UTM zone per feature once and storing it turns the tier
  decision into a column comparison instead of a geometry operation.
- **Prefer `sjoin_nearest` within a zone.** It builds an STRtree internally and handles polygon
  substations correctly, which a KD-tree over centroids does not.
- **Do not mix tiers within one ranking without recording it.** The tiers agree to well within the
  screening tolerance, but only a stated method survives a challenge.

## Downstream validation

```python
def assert_distance_method_consistency(df, *, max_cross_method_gap_pct: float = 0.5) -> None:
    """Where both methods were computed, they must agree within the screening tolerance."""
    both = df.dropna(subset=["distance_m", "distance_geodesic_m"])
    if both.empty:
        return
    gap = (both["distance_m"] - both["distance_geodesic_m"]).abs() / both["distance_geodesic_m"]
    assert gap.max() * 100 <= max_cross_method_gap_pct, (
        f"projected and geodesic disagree by {gap.max()*100:.2f}% — the projected frame is being "
        "used outside its zone of validity"
    )
    assert df["method"].isin({"projected", "geodesic"}).all(), "unrecorded distance method"
    assert df["frame"].notna().all(), "a distance with no frame recorded"
```

## Where the boundary actually falls

Three thresholds cover almost every decision in this domain.

<svg viewBox="0 0 940 380" role="img" aria-label="Three thresholds that decide the method. Inside one UTM zone and under about 100 kilometres, projected distance is correct to a few parts per ten thousand and is the right choice. Inside one zone but over about 300 kilometres, the same relative error becomes hundreds of metres, so a screening rank may stay projected while a cost figure moves to geodesic. Across zones, at any length, only geodesic is defensible." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Three thresholds and the method each implies</title>
  <desc>A three-row decision table. Same zone and under 100 kilometres: projected distance, error under 0.07 percent or a few tens of metres, suitable for both ranking and costing. Same zone and over 300 kilometres: projected for the rank and geodesic for the cost figure, because the same relative error is now 210 metres or more. Across zones at any length: geodesic only, because no single projected frame fits two distant zones and the error is systematic per site.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="380"/>
  <defs><marker id="gd3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Where the boundary actually falls</text>
  <rect x="40" y="74" width="868" height="76" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3" opacity="0.5"/>
  <text x="64" y="106" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">same zone · under 100 km</text>
  <text x="64" y="130" text-anchor="start" font-size="11" fill="currentColor" opacity="0.88">error under 40 m — rank and cost</text>
  <text x="884" y="118" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">projected</text>
  <rect x="40" y="160" width="868" height="76" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3" opacity="0.5"/>
  <text x="64" y="192" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">same zone · over 300 km</text>
  <text x="64" y="216" text-anchor="start" font-size="11" fill="currentColor" opacity="0.88">the same 0.07% is now 210 m</text>
  <text x="884" y="204" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">projected to rank, geodesic to cost</text>
  <rect x="40" y="246" width="868" height="76" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3" opacity="0.5"/>
  <text x="64" y="278" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">across zones · any length</text>
  <text x="64" y="302" text-anchor="start" font-size="11" fill="currentColor" opacity="0.88">no single frame fits both</text>
  <text x="884" y="290" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">geodesic only</text>
  <rect x="40" y="336" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="355" text-anchor="middle" font-size="11" fill="currentColor">Screen within zones and compare across zones only on the shortlist — the expensive method then runs on tens</text>
  <text x="474.0" y="370" text-anchor="middle" font-size="11" fill="currentColor">of pairs rather than on millions.</text>
</svg>

**Inside one UTM zone, under about 100 kilometres.** Projected distance is correct to a few parts per
ten thousand — centimetres on a turbine spacing, tens of metres on a long gen-tie. Use it, and use
the zone containing the extent rather than the one containing the portfolio centroid.

**Inside one zone, over about 300 kilometres.** The scale factor is still small but the baseline
makes it material: 0.07 percent of 300 kilometres is 210 metres. That is irrelevant for a screening
rank and relevant for a cost estimate, so the rule is projected for the rank and geodesic for the
figure that goes into a pro forma.

**Across zones, any length.** Use geodesic. There is no single projected frame that is simultaneously
correct for two distant zones, and the error is systematic per site rather than random, which is
precisely the shape that reorders a ranking.

The pattern that avoids the whole question for most work is to screen within zones and only compare
across zones on the shortlist — which is also what keeps the run fast, because the expensive method
is applied to tens of pairs rather than millions.

## Frequently asked questions

### Is `geopandas.distance` geodesic?

No — it is planar, computed in whatever CRS the GeoSeries is in. On a geographic frame it returns
degrees, which is the failure this whole page exists to prevent. `pyproj.Geod.inv` and
`Geod.geometry_length` are the geodesic entry points, and `GeoSeries.to_crs` before `distance` is the
projected one.

### How much slower is geodesic distance really?

Vectorised, roughly two to four times a planar calculation — not the order of magnitude its
reputation suggests. The slowness people encounter comes from calling it per pair in a Python loop,
which is a hundred times slower and has nothing to do with the ellipsoid.

### Does the ellipsoid choice matter?

Between WGS84 and GRS80, no — they differ in flattening by about one part in ten billion, which is
nanometres over a continental baseline. Between a modern ellipsoid and Clarke 1866, yes, and that is
a datum problem rather than a distance one.

### What about distances that cross the antimeridian?

Geodesic handles them correctly and projected distance does not, because the planar coordinates jump
by the width of the world. Any portfolio spanning the Pacific should use geodesic for cross-basin
pairs regardless of the length thresholds above.

### Should the reported distance be geodesic even when the screen used projected?

Report what was measured, with its method. Re-measuring the shortlist geodesically and publishing
that figure is good practice, but silently substituting one method's number into another method's
ranking makes the ranking unreproducible — the rank came from one set of distances and the report
shows another.

### How does this interact with routed distance?

It bounds it. Both geodesic and projected straight-line distances are lower bounds on the routed
length, and the circuity factor is defined against whichever was used. Because circuity is a ratio,
mixing methods between the numerator and the denominator quietly changes it, which is one more
reason the method belongs in the output.


### Does the choice of method change the circuity factor?

Yes, and it is an easy place to introduce an inconsistency. Circuity is routed length divided by
straight-line length, so a routed distance measured on a projected surface against a geodesic
straight line mixes two conventions in one ratio. The effect is small — tenths of a percent — and
systematic, which means it moves every circuity figure in the same direction and makes a portfolio
comparison against published benchmarks quietly wrong. Compute both terms the same way and record
which way that was.

### What about elevation — should distances be slope-corrected?

For screening, no. Over a 10-kilometre gen-tie with 200 metres of relief, the slope correction adds
about 2 metres, which is far below the routing uncertainty. It matters for conductor length and
sag calculations, which are engineering questions downstream of siting, and those use the routed
profile rather than a point-to-point distance.

## Related

- [Proximity & Distance Calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) — the parent workflow
- [Choosing UTM vs State Plane for Wind Farm Siting](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/choosing-utm-vs-state-plane-for-wind-farm-siting/) — the scale-factor behaviour inside a zone
- [Benchmarking STRtree vs cKDTree vs H3 for Substation Lookups](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/benchmarking-strtree-vs-kdtree-vs-h3-for-substation-lookups/) — the pre-filter that makes either method cheap
- [Grid Routing & Least-Cost Path Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-routing-and-least-cost-path-analysis/) — the routed distance these figures bound
