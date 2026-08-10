# Solar & Wind Resource Modeling Workflows

Production-grade renewable resource modeling lives or dies on spatial determinism. A bankable yield estimate is not a single number from a spreadsheet — it is the audit-ready output of a pipeline that ingests heterogeneous meteorological and terrain data, harmonizes every layer onto a shared grid, repairs broken geometry, runs the solar and wind physics, and ships versioned artifacts with full lineage. Ad-hoc notebook scripting collapses at this scale: implicit reprojections silently shift irradiance pixels off the terrain mask, an unindexed spatial join blows past available RAM during a multi-year run, and a missing timezone offset corrupts the capacity factor that a project finance model treats as ground truth. This guide maps the end-to-end architecture for solar and wind resource assessment as a reproducible Python pipeline, building on the [core energy-GIS data and spatial fundamentals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/) that govern every stage, and aimed at energy analysts, GIS developers, and environmental technology teams who need defensible, grid-ready forecasts rather than throwaway plots.

The stack is deliberately conventional and well-supported: `xarray` and `dask` for labeled, lazy multidimensional arrays; `rioxarray` and `rasterio` for raster I/O and windowed reads; `geopandas` and `shapely` for vector boundaries and geometry repair; `pyproj` for explicit coordinate transforms; and `pvlib` plus custom `numpy` kernels for the physics. The six stages below move from raw ingest to monitored deployment, and each maps to a dedicated workflow elsewhere on this site — [solar irradiance raster processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/), [wind speed and direction modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/), [terrain and shadow analysis pipelines](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/), and [temporal data aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) — that you can drill into for the implementation detail this overview deliberately compresses.

<svg viewBox="0 0 880 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Six-stage renewable resource modeling pipeline: ingest and schema validation, CRS alignment, topology and geometry repair, resource modeling, memory and out-of-core processing, and deployment with ISO 19115 metadata" style="width:100%;max-width:880px;height:auto;font-family:inherit;">
  <rect class="svg-bg" x="0" y="0" width="880" height="340"/>
  <title>Solar &amp; Wind Resource Modeling Pipeline Overview</title>
  <desc>A snake-layout data flow diagram. The top row runs left to right through Stage 1 ingest and schema validation, Stage 2 CRS alignment and projection, and Stage 3 topology and geometry repair. The flow then drops down on the right into Stage 4 resource modeling for solar and wind, and the bottom row runs back right to left through Stage 5 memory and out-of-core processing and Stage 6 deployment and ISO 19115 metadata, which is the highlighted terminal artifact.</desc>
  <defs>
    <marker id="rm-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="880" height="340" fill="none"/>
  <!-- Top row: S1 -> S2 -> S3 -->
  <rect x="20" y="36" width="240" height="88" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="140" y="68" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">1 · Ingest &amp; Schema Validation</text>
  <text x="140" y="89" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">pandera / pydantic gate</text>
  <text x="140" y="106" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">lazy Dask chunking</text>
  <rect x="320" y="36" width="240" height="88" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="440" y="68" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">2 · CRS Alignment</text>
  <text x="440" y="89" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">reproject_match · always_xy</text>
  <text x="440" y="106" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">EPSG:6933 / EPSG:32615</text>
  <rect x="620" y="36" width="240" height="88" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="740" y="68" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">3 · Topology Repair</text>
  <text x="740" y="89" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">make_valid · set_precision</text>
  <text x="740" y="106" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">quarantine, never drop</text>
  <!-- Bottom row: S4 (under S3) <- S5 <- S6 -->
  <rect x="620" y="216" width="240" height="88" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="740" y="248" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">4 · Resource Modeling</text>
  <text x="740" y="269" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">solar POA · wind shear</text>
  <text x="740" y="286" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">capacity factor · WPD</text>
  <rect x="320" y="216" width="240" height="88" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="440" y="248" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">5 · Memory &amp; Out-of-Core</text>
  <text x="440" y="269" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">Dask graph · windowed reads</text>
  <text x="440" y="286" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">float32 · P50 / P90</text>
  <rect x="20" y="216" width="240" height="88" rx="7" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2"/>
  <text x="140" y="248" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">6 · Deployment &amp; Metadata</text>
  <text x="140" y="269" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">ISO 19115 lineage</text>
  <text x="140" y="286" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">CI/CD integrity gate</text>
  <!-- Connectors -->
  <line x1="260" y1="80" x2="313" y2="80" stroke="currentColor" stroke-width="1.5" marker-end="url(#rm-arr)"/>
  <line x1="560" y1="80" x2="613" y2="80" stroke="currentColor" stroke-width="1.5" marker-end="url(#rm-arr)"/>
  <line x1="740" y1="124" x2="740" y2="209" stroke="currentColor" stroke-width="1.5" marker-end="url(#rm-arr)"/>
  <line x1="620" y1="260" x2="567" y2="260" stroke="currentColor" stroke-width="1.5" marker-end="url(#rm-arr)"/>
  <line x1="320" y1="260" x2="267" y2="260" stroke="currentColor" stroke-width="1.5" marker-end="url(#rm-arr)"/>
  <text x="755" y="172" text-anchor="start" font-size="10" fill="currentColor" opacity="0.65">co-registered grid</text>
</svg>

## Stage 1 — Data Ingestion & Schema Validation

Resource modeling consumes a notoriously heterogeneous mix of inputs: gridded meteorological reanalysis (ERA5, MERRA-2), satellite-derived irradiance (NSRDB, CAMS), mesoscale model output (WRF), high-resolution digital elevation models, and vector project boundaries delivered as GeoPackage, Parquet, or cloud object storage. The ingestion boundary is the cheapest place to catch errors, so it must enforce a schema before a single physical calculation runs. Sourcing those inputs from versioned, machine-readable [open energy data portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/) keeps provenance intact and licensing explicit, which matters when the same artifacts later feed a permitting submission.

Use `pandera` or `pydantic` to assert column types, units, value ranges, and CRS presence, and make loading idempotent — re-running the pipeline on the same inputs must produce byte-identical intermediate stores. Meteorological NetCDF should be opened lazily with explicit Dask chunking so that a 30-year hourly run never materializes in memory all at once. Reject records with out-of-physical-range irradiance (negative GHI, DNI exceeding the extraterrestrial limit) at this gate rather than letting them poison downstream aggregation.

```python
import xarray as xr
import geopandas as gpd
import pandera as pa
from pandera import Column, Check

# 1. Declarative schema for the vector site inventory
site_schema = pa.DataFrameSchema({
    "site_id": Column(str, nullable=False, unique=True),
    "capacity_mw": Column(float, Check.in_range(0.1, 2000.0)),
    "hub_height_m": Column(float, Check.in_range(10.0, 200.0), nullable=True),
    "tech": Column(str, Check.isin(["solar_pv", "wind_onshore", "wind_offshore"])),
})

def ingest_sites(parquet_path: str, target_epsg: int = 32615) -> gpd.GeoDataFrame:
    """Idempotent load + schema enforcement for the project inventory."""
    sites_gdf = gpd.read_parquet(parquet_path)
    site_schema.validate(sites_gdf.drop(columns="geometry"), lazy=True)
    if sites_gdf.crs is None:
        raise ValueError("Site inventory has no CRS; refuse to guess EPSG.")
    return sites_gdf.to_crs(epsg=target_epsg)

def ingest_met(glob_pattern: str) -> xr.Dataset:
    """Lazy, chunked load so multi-decade runs keep a flat memory profile."""
    met_ds = xr.open_mfdataset(
        glob_pattern,                       # e.g. "nsrdb_era5_*.nc"
        chunks={"time": 8760, "y": 256, "x": 256},
        engine="netcdf4",
        combine="by_coords",
    )
    for var in ("ghi", "dni", "dhi"):
        if var in met_ds and float(met_ds[var].min()) < 0:
            raise ValueError(f"Negative {var.upper()} detected at ingest gate")
    return met_ds
```

The schema is the contract. Once a dataset passes this gate it carries a guarantee — typed columns, a declared CRS, physically plausible values — that every later stage can rely on without re-checking, which is what lets the rest of the pipeline stay terse and deterministic.

## Stage 2 — CRS Alignment & Projection Strategy

Coordinate mismatch is the single most common cause of silently wrong yield numbers. Meteorological grids usually arrive in geographic coordinates (EPSG:4326), DEMs in a national or UTM projection, and project boundaries in whatever the surveyor used. Distance, area, slope, and shading calculations are only valid in a projected, metric coordinate system, so [coordinate reference system alignment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) must be explicit and logged — never an implicit, on-the-fly reprojection buried inside an analysis call.

Projection choice is task-specific. For solar siting and land-take calculations, an equal-area projection (EPSG:6933 globally, or a regional Albers) preserves the acreage that drives land lease and environmental assessment. For wind-farm layout and terrain shading, a conformal UTM zone (for example EPSG:32615 for UTM Zone 15N) preserves the local angles that slope and aspect depend on. Configure every `pyproj.Transformer` with `always_xy=True` to guarantee longitude/latitude ordering across libraries, and snap the meteorological grid onto the DEM topology with `reproject_match` so irradiance and terrain share an identical affine transform before any pixel-wise math.

```python
import rioxarray  # noqa: F401  (registers the .rio accessor)
import xarray as xr
import pyproj

# Project-level registry: one source of truth for every EPSG decision
CRS_REGISTRY = {
    "siting_area":    6933,   # equal-area  -> land-take, acreage
    "terrain_wind":   32615,  # UTM 15N conformal -> slope, aspect, shading
    "jurisdiction":   4326,   # WGS84 -> regulatory overlays
}

def harmonize_to_terrain(met_ds: xr.Dataset, dem: xr.DataArray) -> xr.Dataset:
    """Snap meteorological grid onto the DEM's affine so pixels co-register."""
    target_epsg = CRS_REGISTRY["terrain_wind"]
    dem = dem.rio.reproject(f"EPSG:{target_epsg}", resampling="bilinear")
    dem = dem.rio.write_crs(target_epsg)

    # reproject_match guarantees identical transform, shape, and resolution
    met_aligned = met_ds.rio.reproject_match(dem, resampling="bilinear")

    assert met_aligned.rio.crs.to_epsg() == target_epsg
    assert met_aligned.rio.transform() == dem.rio.transform(), "Affine drift"
    return met_aligned

# Explicit point transform for a single met-station tie-in, always_xy ordering
to_utm = pyproj.Transformer.from_crs(4326, 32615, always_xy=True)
station_x, station_y = to_utm.transform(-93.62, 41.59)  # lon, lat -> easting, northing
```

Recording the transform parameters — source EPSG, target EPSG, resampling kernel, and the accuracy tolerance — into the run log is what makes a yield estimate reproducible months later when a financier asks how a number was derived.

## Stage 3 — Topology Enforcement & Geometry Repair

Vector inputs that define where the resource model applies — turbine pads, array boundaries, exclusion zones, setback polygons — routinely arrive with self-intersections, slivers, and unclosed rings. An invalid geometry quietly corrupts every clip and overlay it touches: a self-intersecting array boundary can zero out half a site's irradiance pixels, and a sliver in an exclusion layer can mask turbines that are actually buildable. Enforcing [spatial data quality and validation](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-data-quality-validation/) immediately after CRS alignment, and before any clip, keeps these defects from propagating into the physics.

Run `make_valid` to resolve invalid rings, apply `set_precision` to snap coordinates onto a fixed grid and dissolve slivers, and process national-scale layers in chunks so geometry repair never exhausts memory. Repair must be deterministic — the same input always yields the same cleaned output — and any geometry that cannot be repaired should be quarantined and logged rather than silently dropped, because a missing exclusion polygon is a compliance risk, not a rounding error.

```python
import geopandas as gpd
import shapely
from shapely.validation import make_valid

def repair_boundaries(gdf: gpd.GeoDataFrame, grid_size: float = 0.01) -> gpd.GeoDataFrame:
    """Deterministic geometry repair for array, setback, and exclusion layers."""
    repaired = gdf.copy()
    repaired["geometry"] = repaired.geometry.apply(make_valid)
    # Snap to a 1 cm grid (UTM metres) to dissolve slivers from digitizing noise
    repaired["geometry"] = repaired.geometry.apply(
        lambda g: shapely.set_precision(g, grid_size=grid_size)
    )
    still_invalid = repaired[~repaired.geometry.is_valid]
    if not still_invalid.empty:
        # Quarantine, never silently drop -> a lost exclusion is a permitting risk
        still_invalid.to_parquet("quarantine_invalid_geometry.parquet")
        repaired = repaired[repaired.geometry.is_valid].copy()
    return repaired

def clip_resource_grid(met_aligned, boundary_gdf):
    """Clip the harmonized met grid to a repaired, validated boundary."""
    boundary_gdf = repair_boundaries(boundary_gdf)
    return met_aligned.rio.clip(boundary_gdf.geometry, boundary_gdf.crs, drop=True)
```

With clean geometry guaranteed, the clip that bounds the resource model is exact, and every downstream pixel count — the denominator in capacity factor and land-use intensity — is trustworthy.

## Stage 4 — Resource Modeling: Solar Irradiance & Wind

This is the analytical core unique to renewable assessment, where harmonized rasters become energy. The two technologies share infrastructure but diverge in physics, and each has a dedicated workflow that this stage orchestrates.

<svg viewBox="0 0 940 400" role="img" aria-label="The loss chain that separates a resource figure from metered energy for a 100 megawatt fixed-tilt array. Plane-of-array transposition adds 8 percent to horizontal irradiance; soiling removes 2 percent, cell temperature 6.5, DC wiring and mismatch 2, inverter conversion 2.5, clipping at a 1.25 DC to AC ratio 1.4, and availability 2. The resource is the first number in the chain, not the answer — quoting it as yield overstates delivered energy by about 8 percent even after the transposition gain." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>From horizontal irradiance to metered AC energy</title>
  <desc>A waterfall chart starting at 100 percent of global horizontal irradiance. Plane-of-array transposition adds 8 percent. Then successive losses are deducted: soiling 2 percent, cell temperature 6.5 percent, DC wiring and mismatch 2 percent, inverter conversion 2.5 percent, inverter clipping 1.4 percent and availability 2 percent. The final bar, metered AC energy, stands at 92.1 percent of the horizontal resource. A note observes that the transposition gain and the temperature loss nearly cancel, which is why a resource figure quoted as yield looks plausible.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="ls-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">A 100 MW fixed-tilt array: what reaches the meter</text>
  <rect x="44" y="102.6086956521739" width="88" height="177.3913043478261" rx="4" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="88" y="93.6086956521739" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">100.0</text>
  <text x="88" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">GHI</text>
  <text x="88" y="316" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">resource</text>
  <rect x="144" y="88.41739130434783" width="88" height="14.191304347826087" rx="4" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="188" y="79.41739130434783" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">8.0</text>
  <text x="188" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">+</text>
  <text x="188" y="316" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">POA transposition</text>
  <rect x="244" y="88.41739130434783" width="88" height="3.5478260869565217" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="288" y="79.41739130434783" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">2.0</text>
  <text x="288" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">−</text>
  <text x="288" y="316" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">soiling</text>
  <rect x="344" y="91.96521739130435" width="88" height="11.530434782608696" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="388" y="82.96521739130435" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">6.5</text>
  <text x="388" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">−</text>
  <text x="388" y="316" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">cell temperature</text>
  <rect x="444" y="103.49565217391304" width="88" height="3.5478260869565217" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="488" y="94.49565217391304" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">2.0</text>
  <text x="488" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">−</text>
  <text x="488" y="316" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">DC wiring/mismatch</text>
  <rect x="544" y="107.04347826086956" width="88" height="4.434782608695652" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="588" y="98.04347826086956" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">2.5</text>
  <text x="588" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">−</text>
  <text x="588" y="316" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">inverter conversion</text>
  <rect x="644" y="111.47826086956522" width="88" height="3" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="688" y="102.47826086956522" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">1.4</text>
  <text x="688" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">−</text>
  <text x="688" y="316" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">clipping (1.25 DC:AC)</text>
  <rect x="744" y="113.96173913043481" width="88" height="3.5478260869565217" rx="4" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="788" y="104.96173913043481" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">2.0</text>
  <text x="788" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">−</text>
  <text x="788" y="316" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">availability</text>
  <rect x="844" y="117.50956521739133" width="88" height="162.49043478260867" rx="4" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.8"/>
  <text x="888" y="108.50956521739133" text-anchor="middle" font-size="12" fill="#1F5C3A" font-weight="700">91.6</text>
  <text x="888" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">metered</text>
  <text x="888" y="316" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">AC energy</text>
  <line x1="34" y1="280" x2="920" y2="280" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <rect x="44" y="330" width="876" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="482.0" y="351" text-anchor="middle" font-size="11.5" fill="currentColor">The transposition gain and the temperature loss nearly cancel, which is exactly why a resource figure</text>
  <text x="482.0" y="368" text-anchor="middle" font-size="11.5" fill="currentColor">quoted as yield looks plausible — and lands about 8% high once the rest of the chain is applied.</text>
</svg>

On the solar side, the satellite or reanalysis irradiance components — global horizontal (GHI), direct normal (DNI), and diffuse horizontal (DHI) — are corrected for atmospheric turbidity and aerosol optical depth, then transposed onto the plane of array for the chosen fixed-tilt or tracker geometry. The full spectral decomposition, cloud interpolation, and plane-of-array conversion are covered in [solar irradiance raster processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/). Critically, the transposition must be debited by the self-shading and inter-row shading masks produced upstream by [terrain and shadow analysis pipelines](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/), so that occluded pixels never contribute phantom generation. From plane-of-array irradiance, the annual capacity factor follows directly:

$$ \mathrm{CF} = \frac{\sum_{t=1}^{8760} P_t}{P_{\text{rated}} \times 8760} $$

On the wind side, hub-height wind speed is extrapolated from the reference measurement height using the power-law profile, then summarized as a Weibull distribution per directional bin to build the wind rose. The vertical extrapolation and shear-coefficient fitting are detailed in [wind speed and direction modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/). The two governing relationships are the power-law shear profile and the wind power density:

$$ v(z) = v_{\text{ref}} \left(\frac{z}{z_{\text{ref}}}\right)^{\alpha} \qquad \mathrm{WPD} = \tfrac{1}{2}\,\rho\,v^{3} $$

```python
import numpy as np
import xarray as xr

def solar_capacity_factor(poa_irradiance: xr.DataArray, rated_w_per_m2: float = 1000.0,
                          shade_mask: xr.DataArray | None = None,
                          system_losses: float = 0.14) -> xr.DataArray:
    """Annual solar capacity factor per pixel from plane-of-array irradiance."""
    poa = poa_irradiance
    if shade_mask is not None:
        poa = poa.where(~shade_mask, 0.0)            # debit occluded timesteps
    dc_ratio = (poa / rated_w_per_m2).clip(0, 1.0)   # simple performance proxy
    ac_ratio = dc_ratio * (1.0 - system_losses)      # soiling, wiring, inverter
    return ac_ratio.mean(dim="time")                 # 0..1 capacity factor field

def wind_hub_speed(v_ref: xr.DataArray, z: float, z_ref: float = 10.0,
                   alpha: float = 0.143) -> xr.DataArray:
    """Power-law extrapolation of wind speed to hub height z (metres)."""
    return v_ref * (z / z_ref) ** alpha

def wind_power_density(v_hub: xr.DataArray, air_density: float = 1.225) -> xr.DataArray:
    """Mean wind power density (W/m^2) from the cube of hub-height speed."""
    return 0.5 * air_density * (v_hub ** 3).mean(dim="time")
```

The output of this stage is a stack of per-pixel resource fields — capacity factor, wind power density, directional energy distribution — each still carrying its CRS and time coordinates, ready for aggregation into the metrics that financiers and grid planners actually consume.

## Stage 5 — Memory Optimization & Out-of-Core Processing

Multi-decade hourly simulations over a regional grid generate arrays that dwarf available RAM, and the naive approach — load everything, then compute — triggers out-of-memory failures precisely on the long runs that matter most. The pipeline must process resource fields out-of-core: lazy Dask-backed `xarray` operations that build a task graph and stream data in tiles, windowed `rasterio` reads that touch one block at a time, and spatial indexing so that vector clips against the resource grid scale as O(n log n) rather than O(n²).

Temporal reduction is where the memory budget is won or lost. Resampling 5-minute or hourly data into annual energy production and probabilistic P50/P90 bands must happen inside the lazy graph, normalizing to UTC and accounting for leap years before any reduction. The full strategy — rolling statistics, seasonal decomposition, and exceedance-probability bands — is laid out in [temporal data aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/). Keep the working dtype at `float32` to halve memory versus `float64` with negligible loss for irradiance and wind fields.

```python
import xarray as xr
import rasterio
from rasterio.windows import Window
import numpy as np

def annual_energy_p50_p90(cf_hourly: xr.DataArray, capacity_mw: float) -> dict:
    """Lazy resample to annual energy, then exceedance bands across years (MWh)."""
    cf32 = cf_hourly.astype("float32")
    annual_mwh = (cf32 * capacity_mw).resample(time="1YE").sum()  # lazy reduction
    annual_mwh = annual_mwh.compute()                              # materialize small result
    p50 = float(annual_mwh.quantile(0.50))
    p90 = float(annual_mwh.quantile(0.10))   # P90 = 10th percentile (conservative)
    return {"p50_mwh": p50, "p90_mwh": p90, "n_years": int(annual_mwh.sizes["time"])}

def reduce_raster_windowed(raster_path: str, block: int = 2048) -> float:
    """Windowed mean of a large resource raster without loading it whole."""
    total, count = 0.0, 0
    with rasterio.open(raster_path) as src:
        for row in range(0, src.height, block):
            for col in range(0, src.width, block):
                win = Window(col, row, block, block)
                arr = src.read(1, window=win, masked=True).astype("float32")
                total += float(arr.sum())
                count += int(arr.count())
    return total / count if count else float("nan")
```

Profiling beats guessing: most spatial bottlenecks come from an unindexed join or a redundant reprojection inside a loop, not raw data volume, so measure before reaching for a bigger cluster.

## Stage 6 — Production Deployment & Monitoring

A resource model is only useful when it runs unattended, repeatably, and leaves a trail an auditor can follow. Package the pipeline in a container with pinned library versions so the GDAL, PROJ, and `xarray` stack is identical from a developer laptop to a CI runner to a cloud batch job. Drive heavy raster work through a thread-safe executor — combining `asyncio` for I/O-bound reads with a `ThreadPoolExecutor` for compute-bound transforms keeps multi-core instances saturated without GIL contention.

Every artifact must be stamped with ISO 19115 metadata: source lineage, processing timestamps, CRS definitions, resampling kernels, and the exact algorithmic parameters. Emit structured (JSON) logs on every spatial validation failure so monitoring can alert on affine drift, CRS mismatch, or a spike in quarantined geometry, and wire the validation assertions into CI/CD gates that block a release when output integrity regresses. The same yield artifacts frequently flow into grid interconnection screening, where they are cross-referenced against [grid capacity buffer analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) thresholds and the asset inventory from [transmission line and substation mapping](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/transmission-line-substation-mapping/) — so the metadata contract is what lets two pipelines trust each other's outputs.

```python
import json, logging, hashlib, datetime as dt

log = logging.getLogger("resource_pipeline")

def stamp_iso19115(output_path: str, target_epsg: int, params: dict) -> dict:
    """Attach lineage metadata to a yield artifact for audit and CI gating."""
    with open(output_path, "rb") as fh:
        checksum = hashlib.sha256(fh.read()).hexdigest()
    meta = {
        "title": "Renewable resource yield surface",
        "crs": f"EPSG:{target_epsg}",
        "processed_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "lineage": params,                  # resampling kernel, losses, source EPSGs
        "checksum_sha256": checksum,
        "standard": "ISO 19115",
    }
    sidecar = output_path + ".meta.json"
    with open(sidecar, "w") as fh:
        json.dump(meta, fh, indent=2)
    return meta

def assert_output_integrity(yield_da, expected_epsg: int) -> None:
    """CI/CD gate: fail the build on CRS, dtype, or value-range regressions."""
    crs = yield_da.rio.crs
    if crs is None or crs.to_epsg() != expected_epsg:
        log.error(json.dumps({"event": "crs_mismatch", "got": str(crs)}))
        raise AssertionError(f"Expected EPSG:{expected_epsg}, got {crs}")
    if str(yield_da.dtype) != "float32":
        raise AssertionError(f"Unexpected dtype {yield_da.dtype}; want float32")
    if float(yield_da.max()) > 1.0 or float(yield_da.min()) < 0.0:
        raise AssertionError("Capacity factor field outside [0, 1]")
```

<svg viewBox="0 0 860 380" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Production deployment view: a version-pinned container image feeds an asyncio and ThreadPoolExecutor worker pool, which branches to ISO 19115 sidecar metadata, structured JSON logs flowing to a monitoring sink, and a CI/CD integrity gate that blocks release on assertion failure" style="width:100%;max-width:860px;height:auto;font-family:inherit;">
  <rect class="svg-bg" x="0" y="0" width="860" height="380"/>
  <title>Production Deployment &amp; Monitoring Architecture</title>
  <desc>A left-to-right deployment diagram. A version-pinned container image holding GDAL, PROJ, and xarray feeds a worker pool that combines asyncio for input-output-bound raster reads with a ThreadPoolExecutor for compute-bound transforms. The worker pool fans out to three outputs: an ISO 19115 sidecar metadata file carrying lineage and a checksum, a monitoring sink receiving structured JSON logs that alert on affine drift and CRS mismatch, and a highlighted CI/CD integrity gate that blocks the release when an output-integrity assertion fails.</desc>
  <defs>
    <marker id="dep-arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker>
  </defs>
  <rect width="860" height="380" fill="none"/>
  <!-- Container image -->
  <rect x="20" y="146" width="220" height="92" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="130" y="178" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">Container Image</text>
  <text x="130" y="200" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">pinned GDAL · PROJ</text>
  <text x="130" y="217" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">xarray · identical everywhere</text>
  <!-- Worker pool -->
  <rect x="310" y="146" width="220" height="92" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="420" y="178" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">Worker Pool</text>
  <text x="420" y="200" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">asyncio I/O reads</text>
  <text x="420" y="217" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">ThreadPoolExecutor compute</text>
  <line x1="240" y1="192" x2="303" y2="192" stroke="currentColor" stroke-width="1.5" marker-end="url(#dep-arr)"/>
  <!-- Fan-out branch lines from worker pool right edge -->
  <line x1="530" y1="192" x2="560" y2="192" stroke="currentColor" stroke-width="1.5"/>
  <line x1="560" y1="56"  x2="560" y2="324" stroke="currentColor" stroke-width="1.5"/>
  <line x1="560" y1="56"  x2="603" y2="56"  stroke="currentColor" stroke-width="1.5" marker-end="url(#dep-arr)"/>
  <line x1="560" y1="192" x2="603" y2="192" stroke="currentColor" stroke-width="1.5" marker-end="url(#dep-arr)"/>
  <line x1="560" y1="324" x2="603" y2="324" stroke="currentColor" stroke-width="1.5" marker-end="url(#dep-arr)"/>
  <!-- Output 1: ISO 19115 sidecar -->
  <rect x="610" y="22" width="230" height="68" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="725" y="50" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">ISO 19115 Sidecar</text>
  <text x="725" y="71" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">.meta.json · lineage · checksum</text>
  <!-- Output 2: Monitoring sink -->
  <rect x="610" y="158" width="230" height="68" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="725" y="186" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">Monitoring Sink</text>
  <text x="725" y="207" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">JSON logs · alert on drift</text>
  <!-- Output 3: CI/CD gate (highlighted) -->
  <rect x="610" y="290" width="230" height="68" rx="7" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2" stroke-dasharray="6,3"/>
  <text x="725" y="318" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">CI/CD Integrity Gate</text>
  <text x="725" y="339" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.85">block release on assert fail</text>
  <!-- Branch labels -->
  <text x="582" y="120" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">stamp</text>
  <text x="582" y="258" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">emit</text>
</svg>

## Conclusion

Modern renewable resource assessment demands more than statistical curve-fitting; it requires a spatially deterministic pipeline that respects coordinate integrity, memory constraints, and regulatory compliance at every step. Structuring solar and wind workflows around schema-validated ingestion, explicit CRS harmonization, deterministic geometry repair, physics-faithful modeling, out-of-core aggregation, and metadata-stamped deployment is what turns raw meteorological inputs into bankable, grid-ready forecasts where every pixel and timestamp is defensible. Each stage above has a deeper companion workflow on this site: start with [solar irradiance raster processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) and [wind speed and direction modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/) for the physics, layer in [terrain and shadow analysis pipelines](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/) for occlusion, and close the loop with [temporal data aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) for the P50/P90 metrics that financiers and grid planners consume.


## Frequently asked questions

### Is a resource figure the same as an energy estimate?

No, and the gap is larger than it looks. Plane-of-array transposition adds roughly 8 percent to
horizontal irradiance, then soiling, cell temperature, DC losses, inverter conversion, clipping and
availability remove more than that again. The two roughly cancel, which is exactly why quoting a
resource figure as yield produces a number that survives casual review and lands several percent
high. Report the resource and the modelled energy separately, with the loss stack that connects
them.

### How many years of resource data are enough?

For solar, a single well-validated year is usually within a few percent of the long-term mean, and
the useful practice is to compare that year against a longer reanalysis record to detect an unusual
one. For wind, one year is not enough: interannual variability in wind speed is large, and because
energy scales with the cube of speed, a 5 percent speed anomaly is a 16 percent energy anomaly. The
standard answer is a measure-correlate-predict exercise against a long-term reference, not a longer
on-site campaign.

### Why does the pipeline resample the coarse grid up rather than the fine grid down?

Because averaging the fine grid down throws away the resolution that justified using it, while
upsampling the coarse grid is an honest interpolation as long as the output metadata says so. A NASA
POWER half-degree cell covers roughly 144 PVGIS cells; downsampling PVGIS to POWER makes the two
comparable by making both coarse. The rule that matters more than either choice: a stack has exactly
one geotransform, and every band in it must share that transform exactly.

### Which resampling kernel should terrain and land-cover use?

Nearest neighbour for anything categorical — land cover, exclusion masks, zoning classes — because
every other kernel invents values that are not in the source. Bilinear for continuous surfaces being
upsampled, average when downsampling continuous surfaces, and cubic only where a genuinely smooth
surface is wanted and the overshoot at edges is acceptable. The kernel follows from what the pixel
values mean, never from how the output looks.

### What is the most common temporal-aggregation mistake?

Applying the wrong aggregator for the unit. Irradiance in watts per square metre is a rate and is
averaged; energy in kilowatt-hours is a quantity and is summed. Neither mistake raises, and both
produce columns of plausible magnitude. The second most common is an unweighted mean of monthly
means, which quietly treats February and July as equally long. Both are cheap to prevent by
asserting the unit in the schema and dispatching the aggregator from it.

### Do I need hourly data, or will monthly averages do?

Monthly averages are adequate for a first-pass resource comparison between sites and inadequate for
anything downstream of it. Capacity factors, clipping losses, curtailment exposure and storage
sizing all depend on the shape of the hourly profile, not on its mean. Once a site is shortlisted
the hourly series is the deliverable, and the monthly figures become a sanity check on it rather
than an input.

### How is shading loss from terrain different from shading loss from rows?

Row-to-row shading is a function of the layout and can be traded against ground coverage ratio;
terrain shading is a property of the site and cannot be designed away. A horizon profile is
therefore computed once per site and applied to every layout variant, while row shading is
recomputed for each variant. The two also fall at different times: terrain shading concentrates in
winter mornings and evenings, which is when a capacity commitment is most likely to bind.


### How should curtailment be represented in a yield model?

As a separate, named loss applied after the physical chain, never folded into availability.
Curtailment is a market and grid outcome rather than a plant property, it varies year to year far
more than any physical loss, and financing parties want to see it isolated. A model that buries it
inside an availability factor cannot answer the question every reviewer asks: how much of the gap
between simulated and metered energy was the plant, and how much was the grid.

### What resolution of resource data does a layout study need?

Fine enough to resolve the variation across the site, which for solar is usually a single value and
for wind is emphatically not. Irradiance varies slowly in space, so one point per site is often
defensible; hub-height wind varies with terrain over hundreds of metres, so a layout study needs a
field rather than a point, and the uncertainty of that field is what the variance surface reports.


### Should resource and yield modelling live in the same pipeline?

They should be separate stages with a recorded handoff. The resource stage is expensive, slow to
change and shared across every project in a region; the yield stage is cheap, changes with every
design revision, and is specific to one layout. Keeping them separate means a design iteration does
not re-run a national raster job, and a resource refresh does not silently restate every published
yield figure.

## Related

- [Solar Irradiance Raster Processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) — GHI/DNI/DHI decomposition, atmospheric correction, and plane-of-array transposition.
- [Wind Speed & Direction Modeling](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/wind-speed-direction-modeling/) — hub-height extrapolation, Weibull fitting, and directional wind roses.
- [Terrain & Shadow Analysis Pipelines](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/) — slope, aspect, horizon masks, and inter-row shading.
- [Temporal Data Aggregation](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/temporal-data-aggregation/) — UTC-normalized resampling, AEP, and P50/P90 exceedance bands.
- [Coordinate Reference Systems for Energy Projects](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/) — projection selection and transformation chains.
- [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) — translating yield surfaces into interconnection screening.
