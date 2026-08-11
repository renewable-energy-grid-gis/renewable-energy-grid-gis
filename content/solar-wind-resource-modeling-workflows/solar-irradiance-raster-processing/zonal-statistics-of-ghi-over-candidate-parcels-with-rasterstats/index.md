---
title: Zonal Statistics of GHI over Candidate Parcels with rasterstats
description: Summarise an irradiance raster per parcel without quantising the answer — all-touched versus centroid, area weighting, nodata handling, and the coverage fraction that says whether a statistic is trustworthy.
slug: zonal-statistics-of-ghi-over-candidate-parcels-with-rasterstats
type: article
breadcrumb: Zonal Statistics of GHI
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Zonal Statistics of GHI over Candidate Parcels with rasterstats

The scenario: a portfolio of 3,200 parcels is ranked by mean plane-of-array irradiance, and 400 of
them come back with identical values to four decimal places. They are all smaller than one raster
cell, so each took the value of the single cell its centroid fell in, and the ranking among them is
an artefact of the grid rather than of the resource. This page computes zonal statistics that say so,
and it extends
[solar irradiance raster processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/).

## Root-cause analysis

Three defaults produce a zonal statistic that looks precise and is not.

1. **Centroid-based sampling on parcels smaller than a cell.** With `all_touched=False` and a parcel
   below the cell size, the statistic is one cell's value. That is not wrong so much as
   unquantified — the parcel's true mean could differ by whatever the local gradient is.
2. **Unweighted means over partially covered cells.** A cell half inside the parcel contributes as
   much as one wholly inside it. On a compact parcel spanning many cells the bias is negligible; on a
   long, thin parcel it is not, and long thin parcels are common along transmission corridors.
3. **Nodata treated as zero.** An undeclared fill value of −9999 dragged into a mean produces a
   number that is obviously wrong; a fill of 0 produces one that is plausibly wrong, which is worse.

<svg viewBox="0 0 940 400" role="img" aria-label="Three sampling rules over the same parcel and grid. Centroid sampling takes the single cell the centroid falls in and returns one value with no sense of variation. All-touched takes every cell the parcel intersects, including ones barely clipped, and pulls the mean toward the surroundings. Coverage weighting takes every intersecting cell in proportion to how much of it the parcel actually covers, which is the answer the question wants." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Centroid, all-touched and coverage-weighted sampling</title>
  <desc>Three copies of the same irregular parcel drawn over a raster grid. In the first, centroid sampling, only the single cell containing the parcel centroid is highlighted. In the second, all-touched, every cell the parcel intersects is fully highlighted including cells only clipped at a corner. In the third, coverage weighting, each intersecting cell is shaded in proportion to the fraction of it the parcel covers, from nearly white at the edges to solid in the interior. Each panel reports the resulting mean: 1,842, 1,829 and 1,836 kilowatt-hours per square metre per year.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="zs1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Same parcel, same grid, three sampling rules</text>
  <rect x="60" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="86" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="112" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="138" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="164" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="190" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="216" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="60" y="106" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="86" y="106" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="112" y="106" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="138" y="106" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="164" y="106" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="190" y="106" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="216" y="106" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="60" y="132" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="86" y="132" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="112" y="132" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="138" y="132" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="164" y="132" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="190" y="132" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="216" y="132" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="60" y="158" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="86" y="158" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="112" y="158" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="138" y="158" width="24.5" height="24.5" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.7" opacity="1.0"/>
  <rect x="164" y="158" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="190" y="158" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="216" y="158" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="60" y="184" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="86" y="184" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="112" y="184" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="138" y="184" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="164" y="184" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="190" y="184" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="216" y="184" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="60" y="210" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="86" y="210" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="112" y="210" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="138" y="210" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="164" y="210" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="190" y="210" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="216" y="210" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="60" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="86" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="112" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="138" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="164" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="190" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="216" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <path d="M90,120 L180,106 L216,176 L170,230 L96,210 Z" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="150" y="288" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">centroid</text>
  <text x="150" y="310" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.9">1 842 kWh/m²·yr</text>
  <text x="150" y="330" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">one cell — no variation</text>
  <rect x="356" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="382" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="408" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="434" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="460" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="486" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="512" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="356" y="106" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="382" y="106" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="408" y="106" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="434" y="106" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="460" y="106" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="486" y="106" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="512" y="106" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="356" y="132" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="382" y="132" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="408" y="132" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="434" y="132" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="460" y="132" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="486" y="132" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="512" y="132" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="356" y="158" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="382" y="158" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="408" y="158" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="434" y="158" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="460" y="158" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="486" y="158" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="512" y="158" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="356" y="184" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="382" y="184" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="408" y="184" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="434" y="184" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="460" y="184" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="486" y="184" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="512" y="184" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="356" y="210" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="382" y="210" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="408" y="210" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="434" y="210" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="460" y="210" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="486" y="210" width="24.5" height="24.5" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.7" opacity="1.0"/>
  <rect x="512" y="210" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="356" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="382" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="408" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="434" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="460" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="486" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="512" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <path d="M386,120 L476,106 L512,176 L466,230 L392,210 Z" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="446" y="288" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">all-touched</text>
  <text x="446" y="310" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.9">1 829 kWh/m²·yr</text>
  <text x="446" y="330" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">edge cells count fully</text>
  <rect x="652" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="678" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="704" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="730" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="756" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="782" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="808" y="80" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="652" y="106" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="678" y="106" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="704" y="106" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="730" y="106" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="756" y="106" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="782" y="106" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="808" y="106" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="652" y="132" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="678" y="132" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="704" y="132" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="730" y="132" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="756" y="132" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="782" y="132" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="808" y="132" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="652" y="158" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="678" y="158" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="704" y="158" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="730" y="158" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="756" y="158" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="782" y="158" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="808" y="158" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="652" y="184" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="678" y="184" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="704" y="184" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="730" y="184" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="756" y="184" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="782" y="184" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="808" y="184" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="652" y="210" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="678" y="210" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="704" y="210" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="730" y="210" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="756" y="210" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="782" y="210" width="24.5" height="24.5" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.7" opacity="1.0"/>
  <rect x="808" y="210" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="652" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="678" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="704" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="730" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="756" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="782" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <rect x="808" y="236" width="24.5" height="24.5" rx="2" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.16"/>
  <path d="M682,120 L772,106 L808,176 L762,230 L688,210 Z" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="742" y="288" text-anchor="middle" font-size="12.5" fill="currentColor" font-weight="700">coverage-weighted</text>
  <text x="742" y="310" text-anchor="middle" font-size="11.5" fill="currentColor" opacity="0.9">1 836 kWh/m²·yr</text>
  <text x="742" y="330" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">each cell in proportion</text>
  <rect x="40" y="348" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="367" text-anchor="middle" font-size="11" fill="currentColor">The three differ by less than a percent here and by several percent on a long, thin parcel — which is exactly</text>
  <text x="474.0" y="382" text-anchor="middle" font-size="11" fill="currentColor">the shape a transmission-corridor site takes.</text>
</svg>

## Pre-flight validation

The decisive number is how many cells each parcel actually covers. Below about ten, the statistic is
dominated by the grid and should be labelled as such.

```python
import geopandas as gpd
import rasterio


def parcel_cell_coverage(parcels: gpd.GeoDataFrame, raster_path: str) -> gpd.GeoDataFrame:
    """How many raster cells each parcel spans — the honesty check for a zonal mean."""
    with rasterio.open(raster_path) as src:
        cell_area = abs(src.transform.a * src.transform.e)
        crs = src.crs
    p = parcels.to_crs(crs)
    out = p.copy()
    out["cells_covered"] = p.geometry.area / cell_area
    out["statistic_quality"] = out["cells_covered"].map(
        lambda n: "grid-dominated" if n < 10 else ("usable" if n < 100 else "well-resolved")
    )
    return out[["cells_covered", "statistic_quality", "geometry"]]
```

Running this before the statistics turns "3,200 parcels ranked by irradiance" into "2,800 ranked
meaningfully and 400 whose ranking is grid noise", which is a different report.

## Fix implementation

```python
import geopandas as gpd
import numpy as np
import rasterio
from rasterio.features import geometry_mask, rasterize


def zonal_ghi(
    parcels: gpd.GeoDataFrame,
    raster_path: str,
    *,
    id_field: str = "parcel_id",
    supersample: int = 4,
) -> gpd.pd.DataFrame:
    """Area-weighted zonal mean with a coverage fraction, computed per parcel window."""
    rows = []
    with rasterio.open(raster_path) as src:
        p = parcels.to_crs(src.crs)
        for _, parcel in p.iterrows():
            window = rasterio.windows.from_bounds(*parcel.geometry.bounds, transform=src.transform)
            window = window.round_offsets().round_lengths()
            if window.width < 1 or window.height < 1:
                window = rasterio.windows.Window(
                    int(window.col_off), int(window.row_off), max(1, int(window.width)),
                    max(1, int(window.height)),
                )
            data = src.read(1, window=window, masked=True).astype("float32")
            transform = src.window_transform(window)

            # Supersampled coverage: what fraction of each cell the parcel actually covers.
            fine = rasterize(
                [(parcel.geometry, 1)],
                out_shape=(data.shape[0] * supersample, data.shape[1] * supersample),
                transform=transform * rasterio.Affine.scale(1 / supersample, 1 / supersample),
                fill=0, dtype="uint8", all_touched=True,
            )
            weights = fine.reshape(
                data.shape[0], supersample, data.shape[1], supersample
            ).mean(axis=(1, 3)).astype("float32")

            valid = weights * (~data.mask).astype("float32")
            total_weight = float(valid.sum())
            if total_weight <= 0:
                rows.append({id_field: parcel[id_field], "mean_ghi": np.nan,
                             "coverage_fraction": 0.0, "cells": 0})
                continue

            mean = float((data.filled(0) * valid).sum() / total_weight)
            rows.append({
                id_field: parcel[id_field],
                "mean_ghi": mean,
                "min_ghi": float(data.min()) if data.count() else np.nan,
                "max_ghi": float(data.max()) if data.count() else np.nan,
                "coverage_fraction": total_weight / float(weights.sum()) if weights.sum() else 0.0,
                "cells": int((weights > 0).sum()),
            })
    return gpd.pd.DataFrame(rows)
```

The supersampled weight array is what turns "all-touched or not" — a binary choice that is wrong in
one direction or the other — into a continuous coverage fraction. At a supersample of four, a cell
half inside the parcel contributes about half, which is the answer the question actually wants.

<svg viewBox="0 0 940 392" role="img" aria-label="How the sampling rule’s error scales with parcel size. A parcel spanning 400 cells sees under 0.1 percent difference between centroid and coverage weighting. At 40 cells it is 0.6 percent, at 10 cells 2.4 percent, and at one cell the centroid statistic carries no information about the parcel at all. The threshold worth labelling is around ten cells, below which a ranking is grid-dominated." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Sampling error against the number of cells a parcel spans</title>
  <desc>A chart with the number of raster cells a parcel spans on a logarithmic horizontal axis from one to one thousand, and the difference between centroid and coverage-weighted means on the vertical. The curve falls steeply: 12 percent at one cell, 2.4 percent at ten, 0.6 percent at forty and under 0.1 percent at four hundred. A shaded region below ten cells is labelled grid-dominated, and a note records that 400 of 3,200 parcels in the worked portfolio fall in it.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="392"/>
  <defs><marker id="zs2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Below about ten cells, the grid decides the ranking</text>
  <line x1="110" y1="280" x2="860" y2="280" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="110" y1="70" x2="110" y2="280" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <rect x="110" y="70" width="250.0" height="210" rx="0" fill="#FFE3BE" opacity="0.45"/>
  <text x="236.2874945799765" y="88" text-anchor="middle" font-size="11" fill="#7A4A1A" font-weight="700">grid-dominated</text>
  <line x1="106" y1="280.0" x2="860" y2="280.0" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="284.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0%</text>
  <line x1="106" y1="207.14285714285714" x2="860" y2="207.14285714285714" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="211.14285714285714" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">5%</text>
  <line x1="106" y1="134.28571428571428" x2="860" y2="134.28571428571428" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="138.28571428571428" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">10%</text>
  <line x1="110.0" y1="280" x2="110.0" y2="285" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="110.0" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1</text>
  <line x1="360.0" y1="280" x2="360.0" y2="285" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="360.0" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">10</text>
  <line x1="610.0" y1="280" x2="610.0" y2="285" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="610.0" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">100</text>
  <line x1="860.0" y1="280" x2="860.0" y2="285" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="860.0" y="300" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">1000</text>
  <text x="20" y="62" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.8">cells spanned →</text>
  <path d="M110.0,105.1 L185.3,172.2 L284.7,223.2 L360.0,245.0 L510.5,271.3 L610.0,276.4 L760.5,278.8 L860.0,279.4" fill="none" stroke="#5BA8C8" stroke-width="2.6"/>
  <circle cx="110.0" cy="105.14285714285714" r="4.5" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <text x="122.0" y="95.14285714285714" text-anchor="start" font-size="11" fill="#2C6E8F" font-weight="700">12.0%</text>
  <circle cx="360.0" cy="245.0285714285714" r="4.5" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <text x="372.0" y="235.0285714285714" text-anchor="start" font-size="11" fill="#2C6E8F" font-weight="700">2.4%</text>
  <circle cx="610.0" cy="276.35714285714283" r="4.5" fill="#5BA8C8" stroke="#5BA8C8" stroke-width="1"/>
  <text x="622.0" y="266.35714285714283" text-anchor="start" font-size="11" fill="#2C6E8F" font-weight="700">0.25%</text>
  <rect x="110" y="312" width="750" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="485.0" y="331" text-anchor="middle" font-size="11" fill="currentColor">400 of 3 200 parcels in the worked portfolio span under ten cells. Their mutual ranking is an artefact</text>
  <text x="485.0" y="346" text-anchor="middle" font-size="11" fill="currentColor">of the grid, and the cell count is what says so.</text>
</svg>

## Fallback routing and performance tuning

- **Window per parcel, never read the whole raster.** A national GHI grid read in full for each of
  3,200 parcels is the usual reason a zonal run takes hours; windowed reads make it seconds.
- **Sort parcels by tile before iterating.** Reading windows in spatial order keeps the GDAL block
  cache warm and can halve wall-clock on a tiled source.
- **Use `rasterstats` for the simple case.** Its `zonal_stats` with `all_touched=True` is fine when
  parcels span many cells; the supersampled weighting above earns its complexity on small or thin
  parcels.
- **Keep the supersample modest.** Four is enough for a coverage fraction; sixteen costs sixteen times
  the rasterisation for a difference below the raster's own uncertainty.
- **Batch by raster, not by parcel.** For a multi-band stack, read the window once and reduce every
  band from it rather than reopening per band.

## Downstream validation

```python
import numpy as np


def assert_zonal_sane(stats, *, min_coverage: float = 0.9) -> None:
    """A zonal statistic must be inside the source range and adequately covered."""
    finite = stats.dropna(subset=["mean_ghi"])
    assert not finite.empty, "every parcel returned NaN — check the CRS and the extents overlap"
    assert (finite["mean_ghi"] >= finite["min_ghi"] - 1e-6).all(), "mean below the observed minimum"
    assert (finite["mean_ghi"] <= finite["max_ghi"] + 1e-6).all(), "mean above the observed maximum"
    poor = finite[finite["coverage_fraction"] < min_coverage]
    assert poor.empty or len(poor) / len(finite) < 0.05, (
        f"{len(poor)} parcels below {min_coverage:.0%} coverage — nodata or an extent mismatch"
    )
    tiny = finite[finite["cells"] < 10]
    if len(tiny):
        print(f"note: {len(tiny)} parcels span under 10 cells — their ranking is grid-dominated")
```

## Reading a zonal result honestly

Three columns turn a zonal table from a number into a claim that can be checked.

<svg viewBox="0 0 940 388" role="img" aria-label="The four columns that turn a zonal mean into a checkable claim. The mean is the headline; the coverage fraction says how much of the parcel had valid data behind it; the cell count says whether the statistic resolves anything; and the minimum and maximum say whether the parcel is uniform. All four come from the same window read, so publishing them costs nothing." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Four columns every zonal table should carry</title>
  <desc>A worked zonal table for four parcels. Parcel A: mean 1,836 kilowatt-hours per square metre per year, coverage 1.00, 412 cells, range 1,801 to 1,874 — well resolved. Parcel B: mean 1,842, coverage 0.62, 88 cells, range 1,812 to 1,871 — usable but partly nodata. Parcel C: mean 1,829, coverage 1.00, 6 cells, range 1,826 to 1,833 — grid-dominated. Parcel D: mean not available, coverage 0.00, zero cells — outside the raster extent. Each row carries a quality label derived from the coverage and cell count rather than from the mean.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="388"/>
  <defs><marker id="zs3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The mean alone does not say how much to trust it</text>
  <text x="70" y="72" text-anchor="start" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">parcel</text>
  <text x="300" y="72" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">mean</text>
  <text x="440" y="72" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">coverage</text>
  <text x="560" y="72" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">cells</text>
  <text x="700" y="72" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">range</text>
  <text x="870" y="72" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700" opacity="0.8">quality</text>
  <rect x="40" y="86" width="868" height="52" rx="6" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2" opacity="0.5"/>
  <text x="70" y="118" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">A</text>
  <text x="300" y="118" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">1 836</text>
  <text x="440" y="118" text-anchor="middle" font-size="12" fill="currentColor">1.00</text>
  <text x="560" y="118" text-anchor="middle" font-size="12" fill="currentColor">412</text>
  <text x="700" y="118" text-anchor="middle" font-size="11" fill="currentColor">1 801–1 874</text>
  <text x="884" y="118" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">well resolved</text>
  <rect x="40" y="146" width="868" height="52" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.5"/>
  <text x="70" y="178" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">B</text>
  <text x="300" y="178" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">1 842</text>
  <text x="440" y="178" text-anchor="middle" font-size="12" fill="currentColor">0.62</text>
  <text x="560" y="178" text-anchor="middle" font-size="12" fill="currentColor">88</text>
  <text x="700" y="178" text-anchor="middle" font-size="11" fill="currentColor">1 812–1 871</text>
  <text x="884" y="178" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">partly nodata</text>
  <rect x="40" y="206" width="868" height="52" rx="6" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2" opacity="0.5"/>
  <text x="70" y="238" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">C</text>
  <text x="300" y="238" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">1 829</text>
  <text x="440" y="238" text-anchor="middle" font-size="12" fill="currentColor">1.00</text>
  <text x="560" y="238" text-anchor="middle" font-size="12" fill="currentColor">6</text>
  <text x="700" y="238" text-anchor="middle" font-size="11" fill="currentColor">1 826–1 833</text>
  <text x="884" y="238" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">grid-dominated</text>
  <rect x="40" y="266" width="868" height="52" rx="6" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2" opacity="0.5"/>
  <text x="70" y="298" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">D</text>
  <text x="300" y="298" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">—</text>
  <text x="440" y="298" text-anchor="middle" font-size="12" fill="currentColor">0.00</text>
  <text x="560" y="298" text-anchor="middle" font-size="12" fill="currentColor">0</text>
  <text x="700" y="298" text-anchor="middle" font-size="11" fill="currentColor">—</text>
  <text x="884" y="298" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">outside the extent</text>
  <rect x="40" y="332" width="868" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="351" text-anchor="middle" font-size="11" fill="currentColor">Parcel C has the tightest range and the least information: six cells cannot resolve within-parcel variation,</text>
  <text x="474.0" y="366" text-anchor="middle" font-size="11" fill="currentColor">so its narrow range is the grid speaking rather than the resource.</text>
</svg>

**Coverage fraction** says how much of the parcel had valid data behind it. A parcel at 0.62 coverage
has a mean over the 62 percent that was not nodata, which may be perfectly representative or may be
systematically biased if the missing part is a lake or a cloud-masked region.

**Cell count** says whether the statistic is resolving anything. Ten cells is a coarse average;
several hundred is a meaningful distribution, and only then do the minimum and maximum carry
information about within-parcel variation.

**Range** — the minimum and maximum alongside the mean — is what shows whether the parcel is uniform.
A 40-hectare parcel whose GHI ranges by 3 percent is a different siting proposition from one that
ranges by 0.2 percent, and the mean alone hides that entirely.

Publishing the three alongside the mean costs nothing, because the same read produced them, and it
answers the question a reviewer asks first: how much should I trust the fourth decimal place.

## Frequently asked questions

### Should `all_touched` be True or False?

Neither, for parcels near the cell size — that is the point of the coverage weighting. Where the
simpler API is being used, `all_touched=True` is the safer default because it never returns an empty
result for a small parcel, at the cost of including cells that barely overlap. `all_touched=False`
silently returns nothing for a parcel that contains no cell centre.

### Does the raster need to be in the same CRS as the parcels?

They need to be reconciled, and reprojecting the parcels is almost always the cheaper direction —
thousands of geometries against billions of pixels. The exception is when several rasters are being
combined, where a common grid matters more and the vectors follow it.

### How should cloud-masked or seasonal nodata be handled?

As a coverage question rather than a value question. Compute the statistic over valid cells and
report the fraction; substituting a fill value or an interpolated estimate hides the gap and biases
the mean toward whatever the substitute was. A parcel with 40 percent coverage in one month deserves
a flag, not an invented value.

### Is a mean the right statistic for siting?

For a first-pass ranking, yes. For anything downstream, the percentiles matter more: a parcel whose
tenth percentile is high is a better site than one with the same mean and a long low tail, because
the layout will not use the whole parcel. Computing a small set of percentiles from the same window
read costs nothing extra.

### How do I make the run reproducible?

Record the raster path and its checksum, the supersample factor, the parcel layer vintage and the
CRS the statistic was computed in. Two zonal tables computed with different supersampling or
different all-touched settings are not comparable, and nothing in the numbers themselves says which
was used.

### Can the same code summarise a whole hourly stack?

Yes, and it is the efficient shape: read the parcel window once across every band, compute the
weights once, and reduce each band against them. That turns 8,760 separate zonal runs into one
window read per parcel, which is the difference between a minute and most of a day.


### Can zonal statistics be computed on a cloud-hosted raster without downloading it?

Yes, and it is the normal case for national products. A Cloud-Optimised GeoTIFF served over HTTP
supports windowed reads, so each parcel fetches only the tiles it overlaps — typically kilobytes.
What breaks it is a striped, uncompressed GeoTIFF, where every window read pulls whole rows and the
transfer dwarfs the computation. Checking that the source is tiled before running a portfolio is a
one-line check that saves hours.

### What happens when a parcel spans two raster tiles?

Nothing special, provided the read is done through the dataset rather than per file: `rasterio`
resolves the window across internal tiles transparently. It matters when the source is a set of
separate files rather than one mosaic, in which case the parcel needs a VRT or a merged source, or
the statistic is silently computed over whichever tile the code happened to open.

## Related

- [Solar Irradiance Raster Processing](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/) — the parent workflow and its stack contract
- [Building a Site Suitability Scoring Pipeline with GeoPandas and pvlib](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/solar-irradiance-raster-processing/building-a-site-suitability-scoring-pipeline-with-geopandas-and-pvlib/) — the consumer of these per-parcel statistics
- [Resampling & Raster Kernel Quick Reference](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/resampling-and-raster-kernel-quick-reference/) — why the raster should not be resampled to fit the parcels
- [Comparing Equal-Area Projections for National Solar Statistics](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/coordinate-reference-systems-for-energy-projects/comparing-equal-area-projections-for-national-solar-statistics/) — the frame these area weights depend on
