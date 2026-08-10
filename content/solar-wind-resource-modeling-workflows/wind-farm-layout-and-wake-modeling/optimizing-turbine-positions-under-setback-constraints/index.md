---
title: Optimizing Turbine Positions Under Setback Constraints
description: Improve on a greedy layout without breaking a constraint — a selection formulation over a fixed candidate grid, a wake-aware objective, local swaps that respect setbacks, and the audit that proves the result is feasible.
slug: optimizing-turbine-positions-under-setback-constraints
type: article
breadcrumb: Optimizing Turbine Positions
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Optimizing Turbine Positions Under Setback Constraints

The scenario: an optimiser improves modelled energy by 3.4 percent and the result is discarded,
because four turbines ended up 380 metres from a dwelling where the ordinance requires 400. The
objective was right and the feasible set was not enforced. This page formulates layout optimisation
so that infeasible positions cannot be chosen at all, and it is the refinement stage of
[wind farm layout and wake modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-farm-layout-and-wake-modeling/).

## Root-cause analysis

Three formulation choices decide whether an optimiser produces a usable layout.

1. **Continuous positions instead of a candidate set.** Optimising over continuous coordinates means
   every proposal has to be re-tested against every constraint, and a solver that treats constraints
   as penalties will trade a setback violation against an energy gain. Restricting to a pre-filtered
   candidate grid makes infeasible positions unreachable rather than merely expensive.
2. **Constraints as penalties.** A penalty term is a price, and any finite price can be paid. Setbacks
   are not preferences: a position 380 metres from a dwelling under a 400-metre ordinance is not
   slightly worse, it is unbuildable.
3. **Recomputing the constraint mask inside the loop.** The mask does not change during optimisation,
   so recomputing it per evaluation is the most common reason a layout optimiser is slow enough that
   nobody runs it twice.

<svg viewBox="0 0 940 440" role="img" aria-label="Why the feasible set is built once, before the search starts. Of 4,120 grid candidates, the pad erosion removes 610, the dwelling setback removes 1,284, the road setback 302, the property-line setback 418 and the habitat buffer 356, leaving 1,150 feasible positions. Every layout the optimiser ever holds is drawn from those 1,150, so a setback violation is not merely penalised — it is unreachable." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>From candidate grid to feasible set, once</title>
  <desc>A funnel from 4,120 grid candidates to 1,150 feasible positions. Successive filters remove 610 candidates for pad clearance, 1,284 for the dwelling setback, 302 for the road setback, 418 for the property-line setback and 356 for the habitat buffer. The surviving 1,150 are marked as the only positions the optimiser may ever select. A note contrasts this with a penalty formulation, where an infeasible position remains selectable at a price.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="440"/>
  <defs><marker id="opt1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">4 120 candidates in, 1 150 out — and only those are ever offered</text>
  <rect x="260" y="70" width="608.1904761904761" height="34" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="248" y="93" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">grid candidates</text>
  <text x="878.1904761904761" y="93" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">4 120</text>
  <rect x="260" y="112" width="90.04761904761905" height="34" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="248" y="135" text-anchor="end" font-size="11.5" fill="currentColor">− pad clearance</text>
  <text x="360.04761904761904" y="135" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">610</text>
  <rect x="260" y="154" width="189.54285714285714" height="34" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="248" y="177" text-anchor="end" font-size="11.5" fill="currentColor">− dwelling setback</text>
  <text x="459.54285714285714" y="177" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">1 284</text>
  <rect x="260" y="196" width="44.58095238095238" height="34" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="248" y="219" text-anchor="end" font-size="11.5" fill="currentColor">− road setback</text>
  <text x="314.5809523809524" y="219" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">302</text>
  <rect x="260" y="238" width="61.7047619047619" height="34" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="248" y="261" text-anchor="end" font-size="11.5" fill="currentColor">− property line</text>
  <text x="331.7047619047619" y="261" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">418</text>
  <rect x="260" y="280" width="52.55238095238095" height="34" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="248" y="303" text-anchor="end" font-size="11.5" fill="currentColor">− habitat buffer</text>
  <text x="322.55238095238093" y="303" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">356</text>
  <rect x="260" y="322" width="169.76190476190476" height="34" rx="4" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="248" y="345" text-anchor="end" font-size="11.5" fill="currentColor" font-weight="700">feasible set</text>
  <text x="439.76190476190476" y="345" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">1 150</text>
  <rect x="40" y="380" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="399" text-anchor="middle" font-size="11" fill="currentColor">A penalty term is a price, and any finite price can be paid. A candidate that is never offered cannot be</text>
  <text x="474.0" y="414" text-anchor="middle" font-size="11" fill="currentColor">chosen — which is the whole reason to formulate layout optimisation as selection.</text>
</svg>

## Pre-flight validation

Build the feasible candidate set once, and confirm it is large enough to make optimisation
meaningful. A candidate set only slightly larger than the turbine count leaves nothing to optimise
over.

```python
import geopandas as gpd


def build_feasible_candidates(
    buildable: gpd.GeoSeries,
    grid: gpd.GeoDataFrame,
    setbacks: dict[str, tuple[gpd.GeoSeries, float]],
    *,
    pad_radius_m: float,
) -> gpd.GeoDataFrame:
    """Every candidate that satisfies every hard constraint. Nothing else is ever offered."""
    area = buildable.buffer(-pad_radius_m).union_all()
    feasible = grid[grid.geometry.within(area)].copy()

    for name, (features, distance_m) in setbacks.items():
        zone = features.buffer(distance_m).union_all()
        before = len(feasible)
        feasible = feasible[~feasible.geometry.intersects(zone)]
        feasible[f"cleared_{name}"] = True
        print(f"{name}: {before - len(feasible)} candidates removed at {distance_m} m")

    if feasible.empty:
        raise ValueError("no feasible candidates — the constraint set is unsatisfiable here")
    return feasible.reset_index(drop=True)
```

## Fix implementation

With a feasible set in hand, optimisation becomes selection: choose `n` candidates that maximise
energy subject to the spacing rule. A local-swap search is enough to recover most of the available
gain and is easy to explain, which matters when the result has to be defended.

```python
import numpy as np


def optimise_by_swap(
    candidates: np.ndarray,          # (m, 2) feasible positions, metres
    resource: np.ndarray,            # (m,) hub-height wind speed at each candidate
    initial: list[int],              # indices of a greedy starting layout
    objective,                       # callable: positions -> net energy index
    *,
    min_spacing_m: float,
    max_iterations: int = 2000,
    rng: np.random.Generator | None = None,
) -> dict:
    """Local swap search over a feasible candidate set. Constraints cannot be violated."""
    rng = rng or np.random.default_rng(7)
    chosen = list(initial)
    best = objective(candidates[chosen])
    history = [best]

    for _ in range(max_iterations):
        out_pos = int(rng.integers(len(chosen)))
        trial = chosen.copy()
        removed = trial.pop(out_pos)
        pool = [i for i in range(len(candidates)) if i not in trial]
        cand = int(rng.choice(pool))

        # Spacing is enforced structurally: an infeasible swap is simply not taken.
        d = np.hypot(*(candidates[trial] - candidates[cand]).T)
        if d.size and d.min() < min_spacing_m:
            continue

        trial.append(cand)
        score = objective(candidates[trial])
        if score > best:
            chosen, best = trial, score
        history.append(best)

    return {"indices": chosen, "objective": best, "history": history,
            "improvement": best / history[0] - 1.0}
```

Two properties make this defensible. Every layout the search ever holds is feasible, because
infeasible swaps are skipped rather than penalised. And the objective is the wake-aware net energy
from
[estimating wake losses with a Jensen model](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-farm-layout-and-wake-modeling/estimating-wake-losses-with-a-jensen-model-in-python/),
not the resource sum — optimising resource alone reliably produces tightly clustered layouts that
wake each other.

<svg viewBox="0 0 940 388" role="img" aria-label="How a local swap search converges. The greedy baseline scores 21.6 on the net-energy index; the first 200 swaps recover most of the available gain to 22.1, the next 800 add 0.2, and the remaining 1,000 add nothing. Three restarts from different seeds bracket the achievable result between 22.2 and 22.4 — a 3.2 percent improvement over greedy, and the honest way to report a stochastic search." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Swap-search convergence over three seeds</title>
  <desc>A convergence chart with iterations from 0 to 2,000 on the horizontal axis and the net-energy index on the vertical. Three curves, one per random seed, all start at the greedy baseline of 21.6. Each rises steeply over the first 200 iterations to about 22.1, flattens by 1,000 iterations, and ends between 22.2 and 22.4. A shaded band marks the spread between seeds, annotated as the honest reporting range, and a note records the overall improvement over the greedy baseline as 3.2 percent.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="388"/>
  <defs><marker id="opt2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Most of the gain arrives in the first 200 swaps</text>
  <line x1="110" y1="288" x2="860" y2="288" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="110" y1="70" x2="110" y2="288" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="106" y1="270.3333333333331" x2="860" y2="270.3333333333331" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="274.3333333333331" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">21.5</text>
  <line x1="106" y1="181.99999999999974" x2="860" y2="181.99999999999974" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="185.99999999999974" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">22.0</text>
  <line x1="106" y1="93.6666666666664" x2="860" y2="93.6666666666664" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="97.6666666666664" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">22.5</text>
  <line x1="110.0" y1="288" x2="110.0" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="110.0" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">0</text>
  <line x1="297.5" y1="288" x2="297.5" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="297.5" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">500</text>
  <line x1="485.0" y1="288" x2="485.0" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="485.0" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1000</text>
  <line x1="672.5" y1="288" x2="672.5" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="672.5" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1500</text>
  <line x1="860.0" y1="288" x2="860.0" y2="293" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="860.0" y="308" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">2000</text>
  <text x="860" y="62" text-anchor="end" font-size="11.5" fill="currentColor" opacity="0.8">swap iterations</text>
  <path d="M110.0,252.7 L119.4,239.4 L128.8,227.3 L138.1,216.4 L147.5,206.4 L156.9,197.4 L166.2,189.2 L175.6,181.7 L185.0,174.9 L194.4,168.8 L203.8,163.2 L213.1,158.1 L222.5,153.5 L231.9,149.3 L241.2,145.5 L250.6,142.0 L260.0,138.9 L269.4,136.1 L278.8,133.5 L288.1,131.1 L297.5,129.0 L306.9,127.0 L316.2,125.3 L325.6,123.7 L335.0,122.2 L344.4,120.9 L353.8,119.7 L363.1,118.6 L372.5,117.6 L381.9,116.7 L391.2,115.9 L400.6,115.2 L410.0,114.5 L419.4,113.9 L428.8,113.3 L438.1,112.8 L447.5,112.3 L456.9,111.9 L466.2,111.6 L475.6,111.2 L485.0,110.9 L494.4,110.6 L503.8,110.4 L513.1,110.1 L522.5,109.9 L531.9,109.7 L541.2,109.5 L550.6,109.4 L560.0,109.2 L569.4,109.1 L578.8,109.0 L588.1,108.9 L597.5,108.8 L606.9,108.7 L616.2,108.6 L625.6,108.5 L635.0,108.5 L644.4,108.4 L653.8,108.3 L663.1,108.3 L672.5,108.3 L681.9,108.2 L691.2,108.2 L700.6,108.1 L710.0,108.1 L719.4,108.1 L728.8,108.1 L738.1,108.0 L747.5,108.0 L756.9,108.0 L766.2,108.0 L775.6,108.0 L785.0,107.9 L794.4,107.9 L803.8,107.9 L813.1,107.9 L822.5,107.9 L831.9,107.9 L841.2,107.9 L850.6,107.9 L860.0,107.9" fill="none" stroke="#3D8B5F" stroke-width="2.4"/>
  <path d="M110.0,250.9 L119.4,239.9 L128.8,229.9 L138.1,220.8 L147.5,212.5 L156.9,205.0 L166.2,198.2 L175.6,192.1 L185.0,186.4 L194.4,181.3 L203.8,176.7 L213.1,172.5 L222.5,168.7 L231.9,165.2 L241.2,162.0 L250.6,159.2 L260.0,156.6 L269.4,154.2 L278.8,152.0 L288.1,150.1 L297.5,148.3 L306.9,146.7 L316.2,145.3 L325.6,143.9 L335.0,142.7 L344.4,141.6 L353.8,140.6 L363.1,139.7 L372.5,138.9 L381.9,138.2 L391.2,137.5 L400.6,136.9 L410.0,136.3 L419.4,135.8 L428.8,135.3 L438.1,134.9 L447.5,134.5 L456.9,134.2 L466.2,133.9 L475.6,133.6 L485.0,133.3 L494.4,133.1 L503.8,132.9 L513.1,132.7 L522.5,132.5 L531.9,132.4 L541.2,132.2 L550.6,132.1 L560.0,132.0 L569.4,131.8 L578.8,131.7 L588.1,131.7 L597.5,131.6 L606.9,131.5 L616.2,131.4 L625.6,131.4 L635.0,131.3 L644.4,131.3 L653.8,131.2 L663.1,131.2 L672.5,131.1 L681.9,131.1 L691.2,131.1 L700.6,131.0 L710.0,131.0 L719.4,131.0 L728.8,131.0 L738.1,131.0 L747.5,130.9 L756.9,130.9 L766.2,130.9 L775.6,130.9 L785.0,130.9 L794.4,130.9 L803.8,130.9 L813.1,130.9 L822.5,130.8 L831.9,130.8 L841.2,130.8 L850.6,130.8 L860.0,130.8" fill="none" stroke="#5BA8C8" stroke-width="2.4"/>
  <path d="M110.0,252.7 L119.4,243.1 L128.8,234.4 L138.1,226.5 L147.5,219.4 L156.9,212.9 L166.2,207.0 L175.6,201.6 L185.0,196.7 L194.4,192.3 L203.8,188.3 L213.1,184.6 L222.5,181.3 L231.9,178.3 L241.2,175.6 L250.6,173.1 L260.0,170.8 L269.4,168.8 L278.8,166.9 L288.1,165.2 L297.5,163.7 L306.9,162.3 L316.2,161.0 L325.6,159.9 L335.0,158.8 L344.4,157.9 L353.8,157.0 L363.1,156.2 L372.5,155.5 L381.9,154.8 L391.2,154.3 L400.6,153.7 L410.0,153.2 L419.4,152.8 L428.8,152.4 L438.1,152.0 L447.5,151.7 L456.9,151.4 L466.2,151.1 L475.6,150.9 L485.0,150.7 L494.4,150.5 L503.8,150.3 L513.1,150.1 L522.5,149.9 L531.9,149.8 L541.2,149.7 L550.6,149.6 L560.0,149.5 L569.4,149.4 L578.8,149.3 L588.1,149.2 L597.5,149.1 L606.9,149.1 L616.2,149.0 L625.6,149.0 L635.0,148.9 L644.4,148.9 L653.8,148.8 L663.1,148.8 L672.5,148.8 L681.9,148.7 L691.2,148.7 L700.6,148.7 L710.0,148.7 L719.4,148.6 L728.8,148.6 L738.1,148.6 L747.5,148.6 L756.9,148.6 L766.2,148.6 L775.6,148.5 L785.0,148.5 L794.4,148.5 L803.8,148.5 L813.1,148.5 L822.5,148.5 L831.9,148.5 L841.2,148.5 L850.6,148.5 L860.0,148.5" fill="none" stroke="#F4A261" stroke-width="2.4"/>
  <line x1="110" y1="252.66666666666617" x2="860" y2="252.66666666666617" stroke="currentColor" stroke-width="1.3" stroke-dasharray="5 4" opacity="0.6"/>
  <text x="120" y="242.66666666666617" text-anchor="start" font-size="11" fill="currentColor" font-weight="700">greedy baseline 21.6</text>
  <rect x="110" y="318" width="750" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="485.0" y="337" text-anchor="middle" font-size="11" fill="currentColor">Three seeds bracket the result between 22.19 and 22.42 — a 3.2% gain over greedy. Reporting the range</text>
  <text x="485.0" y="352" text-anchor="middle" font-size="11" fill="currentColor">rather than the best seed is what makes a stochastic search reproducible.</text>
</svg>

## Fallback routing and performance tuning

- **Precompute the pairwise geometry once.** Distances and bearings between candidates do not change,
  so a swap updates one row of the wake matrix rather than rebuilding it.
- **Cache objective evaluations by layout signature.** A swap search revisits configurations; a hash
  of the sorted index tuple turns a repeat evaluation into a lookup.
- **Use a smooth wake profile inside the loop.** The Jensen top hat makes the objective discontinuous,
  so a search chases cliff edges; a Gaussian deficit gives a surface it can actually descend.
- **Stop on plateau, not on iteration count.** Most of the gain arrives in the first few hundred
  swaps; a plateau detector saves the rest of the budget for a second restart from a different seed.
- **Run several seeds.** Local search is seed-dependent, and three restarts usually bracket the
  achievable gain better than one long run.

## Downstream validation

```python
import numpy as np
from scipy.spatial import cKDTree


def assert_optimised_layout(
    positions: np.ndarray,
    feasible: np.ndarray,
    *,
    min_spacing_m: float,
    tol_m: float = 0.5,
) -> None:
    """Prove feasibility independently of the search that produced it."""
    tree = cKDTree(feasible)
    d, _ = tree.query(positions, k=1)
    assert np.all(d <= tol_m), (
        f"{int((d > tol_m).sum())} optimised positions are not in the feasible candidate set"
    )
    pairs = cKDTree(positions).query_pairs(min_spacing_m - tol_m)
    assert not pairs, f"{len(pairs)} pairs violate the minimum spacing after optimisation"
    assert len(np.unique(positions, axis=0)) == len(positions), "duplicate turbine positions"
```

<svg viewBox="0 0 940 384" role="img" aria-label="Where the optimisation gain comes from, and where it does not. On a fragmented mask the swap search recovers 3.2 percent over a resource-sorted greedy layout; on an open mask it recovers 0.8 percent; and over a greedy layout that already uses wind-aligned elliptical spacing it recovers 0.4 percent. The optimiser is worth running exactly where the greedy placer performs worst." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Optimisation gain by starting layout and mask type</title>
  <desc>A bar chart of the improvement a swap search recovers over four starting points: 3.2 percent over a resource-sorted greedy layout on a fragmented mask, 1.9 percent over the same layout on a moderately constrained mask, 0.8 percent on an open mask, and 0.4 percent over a greedy layout that already applies wind-aligned elliptical spacing. A note draws the conclusion that most of the achievable gain is available from a better spacing rule rather than from search.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="384"/>
  <defs><marker id="opt3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The optimiser earns its cost where greedy struggles</text>
  <rect x="400" y="70" width="373.3" height="41.8" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="390" y="94.9" text-anchor="end" font-size="11" fill="currentColor">fragmented mask, greedy start</text>
  <text x="781.3333333333334" y="94.9" text-anchor="start" font-size="11.5" fill="currentColor">3.2%</text>
  <rect x="400" y="119.4" width="221.7" height="41.8" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="390" y="144.3" text-anchor="end" font-size="11" fill="currentColor">moderate mask, greedy start</text>
  <text x="629.6666666666667" y="144.3" text-anchor="start" font-size="11.5" fill="currentColor">1.9%</text>
  <rect x="400" y="168.8" width="93.3" height="41.8" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="390" y="193.70000000000002" text-anchor="end" font-size="11" fill="currentColor">open mask, greedy start</text>
  <text x="501.33333333333337" y="193.70000000000002" text-anchor="start" font-size="11.5" fill="currentColor">0.8%</text>
  <rect x="400" y="218.20000000000002" width="46.7" height="41.8" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="390" y="243.10000000000002" text-anchor="end" font-size="11" fill="currentColor">elliptical greedy start</text>
  <text x="454.6666666666667" y="243.10000000000002" text-anchor="start" font-size="11.5" fill="currentColor">0.4%</text>
  <text x="400" y="288" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">net energy recovered over the starting layout</text>
  <rect x="40" y="310" width="868" height="40" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="474.0" y="329" text-anchor="middle" font-size="11" fill="currentColor">Most of the available gain comes from the spacing rule, not from the search: an elliptical greedy layout</text>
  <text x="474.0" y="344" text-anchor="middle" font-size="11" fill="currentColor">leaves only 0.4% on the table, and it takes seconds rather than minutes to produce.</text>
</svg>


## Reporting an optimised layout so it survives review

A stochastic search produces a number that nobody else can reproduce unless the run is described, and
four items make it reproducible.

The **feasible set** — its size and the filters that produced it — is what proves the result respects
every constraint, and it is checkable independently of the search. The **baseline** is what the gain
is measured against; an optimised layout without its greedy baseline is an unfalsifiable claim. The
**seed and iteration budget** make the run repeatable, and reporting three seeds rather than the best
one is what distinguishes a range from a cherry-pick. And the **objective definition** — which wake
model, which decay constant, which rose weighting — is the part reviewers most often disagree with,
which is exactly why it belongs in the record rather than in a docstring.

The layout itself should ship as coordinates with turbine identifiers, in the projected frame it was
optimised in, with the equal-area figures alongside. A layout delivered in geographic coordinates
invites the next person to measure spacing in degrees, which is the failure the whole pipeline was
built to prevent.

## Frequently asked questions

### How much energy does optimisation actually recover?

On a constrained mask, typically one to three percent of net energy over a resource-sorted greedy
layout, and close to nothing over a greedy layout that already uses wind-aligned elliptical spacing.
The gain is largest where the mask is fragmented and the spacing rule is barely binding, which is
also where a greedy placer performs worst.

### Should the turbine count be fixed or optimised too?

Fix it per run and sweep it across runs. Net energy against turbine count is a smooth curve with a
broad maximum, and sweeping it produces the curve rather than a single point — which is far more
useful to a development team weighing capital cost against energy.

### Is a genetic algorithm better than local search here?

Rarely enough to justify the complexity. The candidate set is discrete and the objective is
expensive, so the deciding factor is how many evaluations the budget allows, and local search with
restarts converges faster on a few thousand evaluations. Population methods start to win when the
objective is cheap or the feasible set is very large.

### What if the ordinance changes mid-project?

Rebuild the feasible set and re-run; nothing else changes. That is the practical argument for the
selection formulation — a setback change is a filter change, not a re-derivation, and the previous
layout can be tested against the new set to see exactly which turbines become infeasible.

### How should the result be presented?

With the feasible set, the objective, the seed and the improvement over the greedy baseline. An
optimised layout without its baseline is an unfalsifiable claim, and the seed is what makes the run
reproducible — a search that cannot be reproduced cannot be defended when a reviewer asks why a
particular turbine sits where it does.

### Can participation constraints be included?

Yes, and they belong in the feasible set rather than in the objective. A non-participating parcel is
a setback whose distance comes from a landowner agreement instead of an ordinance, and encoding it
the same way keeps the whole constraint set in one place — where a change to any of it is a filter
rebuild rather than a model change.


### How long should an optimisation run take?

Minutes, not hours, or it will be run once and never revisited. A swap search over a few thousand
candidates with a cached wake matrix evaluates in milliseconds per step, so two thousand iterations
across three seeds is a coffee break. When a run takes hours the cause is almost always the objective
recomputing geometry that has not changed — the constraint mask, the pairwise distances, or the
candidate filter — rather than the search itself being expensive.

### Does the optimiser need the full wind rose?

It needs enough sectors to distinguish layouts, which in practice is the same sixteen the rose is
usually binned into. Collapsing to four sectors makes the objective cheap and blind: layouts that
differ only in how they align with the prevailing axis score identically, which removes exactly the
distinction the optimiser exists to find.

## Related

- [Wind Farm Layout & Wake Modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-farm-layout-and-wake-modeling/) — the parent workflow
- [Generating Turbine Layouts with Spacing Constraints in Shapely](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-farm-layout-and-wake-modeling/generating-turbine-layouts-with-spacing-constraints-in-shapely/) — the greedy baseline this search improves on
- [Estimating Wake Losses with a Jensen Model in Python](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-farm-layout-and-wake-modeling/estimating-wake-losses-with-a-jensen-model-in-python/) — the objective function
- [Calculating Buildable Area After Setback and Habitat Exclusions](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/environmental-constraint-and-exclusion-screening/calculating-buildable-area-after-setback-and-habitat-exclusions/) — where the feasible mask comes from
