<p align="center">
  <a href="https://www.renewable-energy-grid-gis.org">
    <img src="https://www.renewable-energy-grid-gis.org/assets/og-image.png" alt="Python for Renewable Energy & Grid GIS Automation" width="100%">
  </a>
</p>

<h1 align="center">Python for Renewable Energy &amp; Grid GIS Automation</h1>

<p align="center">
  <strong>Production-grade spatial workflows, compliance automation, and scalable geospatial pipelines for the renewable energy sector.</strong>
</p>

<p align="center">
  <a href="https://www.renewable-energy-grid-gis.org"><strong>🌐 Visit the site → renewable-energy-grid-gis.org</strong></a>
</p>

---

## What this is

**[renewable-energy-grid-gis.org](https://www.renewable-energy-grid-gis.org)** is a working library of deep, reproducible Python patterns for engineers who take spatial energy workflows to production rather than leaving them on the desktop. Every article is grounded in real GIS tooling — GeoPandas, Shapely 2, rasterio, rioxarray, pyproj, pvlib, and dask — and written around the failure modes that actually break energy pipelines at scale: silent CRS drift, invalid geometry, memory blow-ups, quadratic proximity scaling, and audit trails that fall apart under a permitting review.

It is written for the people who ship this work:

- **Energy analysts** modeling solar and wind resource, capacity factors, and yield.
- **GIS developers** building deterministic, testable, cloud-scale spatial pipelines.
- **Project developers** screening interconnection feasibility and site suitability.
- **Environmental technology teams** producing audit-ready compliance and permitting outputs.

Every page pairs annotated, runnable Python with hand-drawn diagrams, the exact EPSG codes to use, and the pre-flight and downstream validation gates that keep results defensible.

## What's inside

The library is organized into three deeply cross-linked tracks, each starting from an architectural overview and branching into focused, minimal-reproducible walkthroughs.

### 🌍 [Core Energy-GIS Data &amp; Spatial Fundamentals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/)
The spatial discipline everything else depends on — coordinate reference system alignment, projection strategy, topology enforcement, schema-validated ingestion from cloud object storage, regulatory boundary mapping, and data-quality validation. Includes a [Projection &amp; CRS quick reference](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/projection-and-crs-quick-reference/) of the EPSG codes that matter for energy work.

### ☀️ [Solar &amp; Wind Resource Modeling Workflows](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/)
Irradiance raster processing, temporal aggregation, terrain shadow and horizon-angle analysis, wind shear and wind-rose modeling, kriging of sparse met-mast data, and full PV yield simulation with the pvlib ModelChain — from gridded resource data to modeled AC energy and capacity factors.

### ⚡ [Grid Infrastructure &amp; Network Proximity Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/)
Transmission and substation mapping, spatial-index-accelerated proximity scoring, thermal-headroom modeling, network attribute validation, and end-to-end interconnection queue screening with bounded async routing. Includes a [Spatial index &amp; proximity quick reference](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/spatial-index-and-proximity-quick-reference/).

## Why it's different

- **Production-first.** Idempotent loading, structured logging, CI/CD assertion gates, and containerization patterns — not notebook demos.
- **Reproducible.** Every snippet uses real imports and energy-domain variables (`capacity_mw`, `ghi_array`, `substation_gdf`, `target_epsg`), never toy placeholders.
- **Scale-aware.** Windowed raster I/O, `dask-geopandas` chunking, spatial indexing to escape O(N×M) proximity, and out-of-core patterns for national datasets.
- **Audit-ready.** Provenance tagging, lineage columns, and validation trails built for project finance and permitting scrutiny.
- **Accessible &amp; fast.** Hand-authored inline SVG diagrams, KaTeX math, WCAG-checked contrast, and a static build tuned for mobile performance.

## Built with

- **[Eleventy](https://www.11ty.dev/)** — static site generator (Nunjucks + Markdown)
- **[KaTeX](https://katex.org/)** for mathematical notation and **Prism** for code highlighting
- Hand-authored, theme-aware inline **SVG** diagrams
- Deployed on **[Cloudflare Workers](https://developers.cloudflare.com/workers/)**

## Local development

```bash
npm install
npm run serve     # local dev server with live reload
npm run build     # production build into _site/
```

## Contributing &amp; feedback

Spot an error, a projection that should be an equal-area frame, or a pattern that breaks at scale? Open an issue — corrections and real-world edge cases are welcome.

## Links

- 🌐 **Website:** https://www.renewable-energy-grid-gis.org
- 🗂️ **Organization:** https://github.com/renewable-energy-grid-gis

---

<p align="center"><sub>Reproducible spatial engineering for the energy transition.</sub></p>
