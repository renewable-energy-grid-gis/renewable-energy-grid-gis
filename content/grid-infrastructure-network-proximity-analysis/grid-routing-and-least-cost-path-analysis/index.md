---
title: Grid Routing & Least-Cost Path Analysis
description: Turn a straight-line interconnection distance into a routable corridor — build a cost surface from terrain, land cover and crossings, run least-cost paths in Python, and price the route your straight-line screen could not see.
slug: grid-routing-and-least-cost-path-analysis
type: guide
breadcrumb: Grid Routing & Least-Cost Path Analysis
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Grid Routing & Least-Cost Path Analysis

Least-cost path analysis is where a straight-line screen becomes a buildable corridor, and it is the
stage that sits between proximity screening and a real interconnection estimate in the
[grid infrastructure and network proximity analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/)
pipeline. The failure mode it addresses is not that straight-line distance is wrong — it is a
perfectly good lower bound — but that it is used as though it were the answer. Across sited
interconnections the ratio of routed to straight-line length has a median near 1.28 and a tail beyond
1.9, and the projects in that tail are exactly the ones whose economics a screen declared healthy.

Routing turns three implicit assumptions into explicit ones. A cost surface says what the terrain
actually costs per metre rather than treating all land as equal. A crossing penalty says what a
river, a rail line or an interstate costs to span rather than pretending they are free. And a hard
exclusion says where a route cannot go at all, which is the difference between an expensive corridor
and a non-existent one.

<svg viewBox="0 0 940 412" role="img" aria-label="How a cost surface is assembled from four inputs. Land cover sets the base multiplier — 1.0 for grassland, 1.3 for cropland, 2.4 for forest, and infinity for water and wetlands. Slope multiplies that quadratically and excludes above the build limit. Vector exclusions are burned in as impassable, buffered by a construction offset. Existing crossings punch cheap cells through linear barriers so the route uses the bridge an engineer would use." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Four inputs, one per-cell cost, and where the infinities go</title>
  <desc>Four stacked input panels feeding one output. The first, land cover, lists relative multipliers: grassland 1.0, pasture 1.1, cropland 1.3, shrub 1.2, forest 2.4 to 2.6, developed 3.2 to 6.5, and water and wetlands as infinite. The second, slope, shows a quadratic multiplier rising from 1.0 at flat ground to 7.25 at 25 degrees, then infinity above the build limit. The third, vector exclusions, shows protected areas buffered by a 40 metre construction offset and burned in as impassable. The fourth, existing crossings, shows bridge and easement cells forced to a low cost of 1.5. All four combine into a single per-cell cost raster.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="412"/>
  <defs><marker id="lcp1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The cost surface is the model — everything after it is mechanical</text>
  <rect x="40" y="66" width="380" height="66" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="60" y="92" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">land cover</text>
  <text x="60" y="112" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">grass 1.0 · crop 1.3 · forest 2.4</text>
  <text x="404" y="102" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">water, wetland → ∞</text>
  <line x1="430" y1="99" x2="470" y2="190" stroke="currentColor" stroke-width="1.1" opacity="0.4" marker-end="url(#lcp1-arr)"/>
  <rect x="40" y="142" width="380" height="66" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="60" y="168" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">slope</text>
  <text x="60" y="188" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">1 + (slope/10)² multiplier</text>
  <text x="404" y="178" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">above 25° → ∞</text>
  <line x1="430" y1="175" x2="470" y2="190" stroke="currentColor" stroke-width="1.1" opacity="0.4" marker-end="url(#lcp1-arr)"/>
  <rect x="40" y="218" width="380" height="66" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="60" y="244" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">vector exclusions</text>
  <text x="60" y="264" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">buffered 40 m for working room</text>
  <text x="404" y="254" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">burned in as ∞</text>
  <line x1="430" y1="251" x2="470" y2="190" stroke="currentColor" stroke-width="1.1" opacity="0.4" marker-end="url(#lcp1-arr)"/>
  <rect x="40" y="294" width="380" height="66" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="60" y="320" text-anchor="start" font-size="12.5" fill="currentColor" font-weight="700">existing crossings</text>
  <text x="60" y="340" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">bridges, easements</text>
  <text x="404" y="330" text-anchor="end" font-size="11" fill="currentColor" font-weight="700">forced to 1.5</text>
  <line x1="430" y1="327" x2="470" y2="190" stroke="currentColor" stroke-width="1.1" opacity="0.4" marker-end="url(#lcp1-arr)"/>
  <rect x="490" y="96" width="200" height="200" rx="6" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
  <rect x="494.0" y="100.0" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="513.2" y="100.0" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="532.4" y="100.0" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="551.6" y="100.0" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="570.8" y="100.0" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="590.0" y="100.0" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="609.2" y="100.0" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="628.4" y="100.0" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="647.6" y="100.0" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="666.8" y="100.0" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="494.0" y="119.2" width="18" height="18" rx="2" fill="#F6DCDC" stroke="#C85B5B" stroke-width="0.5" opacity="0.8"/>
  <rect x="513.2" y="119.2" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="532.4" y="119.2" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="551.6" y="119.2" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="570.8" y="119.2" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="590.0" y="119.2" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="609.2" y="119.2" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="628.4" y="119.2" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="647.6" y="119.2" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="666.8" y="119.2" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="494.0" y="138.4" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="513.2" y="138.4" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="532.4" y="138.4" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="551.6" y="138.4" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="570.8" y="138.4" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="590.0" y="138.4" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="609.2" y="138.4" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="628.4" y="138.4" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="647.6" y="138.4" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="666.8" y="138.4" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="494.0" y="157.6" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="513.2" y="157.6" width="18" height="18" rx="2" fill="#F6DCDC" stroke="#C85B5B" stroke-width="0.5" opacity="0.8"/>
  <rect x="532.4" y="157.6" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="551.6" y="157.6" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="570.8" y="157.6" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="590.0" y="157.6" width="18" height="18" rx="2" fill="#F6DCDC" stroke="#C85B5B" stroke-width="0.5" opacity="0.8"/>
  <rect x="609.2" y="157.6" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="628.4" y="157.6" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="647.6" y="157.6" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="666.8" y="157.6" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="494.0" y="176.8" width="18" height="18" rx="2" fill="#F6DCDC" stroke="#C85B5B" stroke-width="0.5" opacity="0.8"/>
  <rect x="513.2" y="176.8" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="532.4" y="176.8" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="551.6" y="176.8" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="570.8" y="176.8" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="590.0" y="176.8" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="609.2" y="176.8" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="628.4" y="176.8" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="647.6" y="176.8" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="666.8" y="176.8" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="494.0" y="196.0" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="513.2" y="196.0" width="18" height="18" rx="2" fill="#F6DCDC" stroke="#C85B5B" stroke-width="0.5" opacity="0.8"/>
  <rect x="532.4" y="196.0" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="551.6" y="196.0" width="18" height="18" rx="2" fill="#F6DCDC" stroke="#C85B5B" stroke-width="0.5" opacity="0.8"/>
  <rect x="570.8" y="196.0" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="590.0" y="196.0" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="609.2" y="196.0" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="628.4" y="196.0" width="18" height="18" rx="2" fill="#F6DCDC" stroke="#C85B5B" stroke-width="0.5" opacity="0.8"/>
  <rect x="647.6" y="196.0" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="666.8" y="196.0" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="494.0" y="215.2" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="513.2" y="215.2" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="532.4" y="215.2" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="551.6" y="215.2" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="570.8" y="215.2" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="590.0" y="215.2" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="609.2" y="215.2" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="628.4" y="215.2" width="18" height="18" rx="2" fill="#F6DCDC" stroke="#C85B5B" stroke-width="0.5" opacity="0.8"/>
  <rect x="647.6" y="215.2" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="666.8" y="215.2" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="494.0" y="234.4" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="513.2" y="234.4" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="532.4" y="234.4" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="551.6" y="234.4" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="570.8" y="234.4" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="590.0" y="234.4" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="609.2" y="234.4" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="628.4" y="234.4" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="647.6" y="234.4" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="666.8" y="234.4" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="494.0" y="253.6" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="513.2" y="253.6" width="18" height="18" rx="2" fill="#F6DCDC" stroke="#C85B5B" stroke-width="0.5" opacity="0.8"/>
  <rect x="532.4" y="253.6" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="551.6" y="253.6" width="18" height="18" rx="2" fill="#F6DCDC" stroke="#C85B5B" stroke-width="0.5" opacity="0.8"/>
  <rect x="570.8" y="253.6" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="590.0" y="253.6" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="609.2" y="253.6" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="628.4" y="253.6" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="647.6" y="253.6" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="666.8" y="253.6" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="494.0" y="272.79999999999995" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="513.2" y="272.79999999999995" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="532.4" y="272.79999999999995" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="551.6" y="272.79999999999995" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="570.8" y="272.79999999999995" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="590.0" y="272.79999999999995" width="18" height="18" rx="2" fill="#F6DCDC" stroke="#C85B5B" stroke-width="0.5" opacity="0.8"/>
  <rect x="609.2" y="272.79999999999995" width="18" height="18" rx="2" fill="#FFE3BE" stroke="#F4A261" stroke-width="0.5" opacity="0.8"/>
  <rect x="628.4" y="272.79999999999995" width="18" height="18" rx="2" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="0.5" opacity="0.8"/>
  <rect x="647.6" y="272.79999999999995" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <rect x="666.8" y="272.79999999999995" width="18" height="18" rx="2" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="0.5" opacity="0.8"/>
  <text x="590" y="316" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">per-cell relative cost</text>
  <rect x="710" y="96" width="200" height="82" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="810.0" y="117" text-anchor="middle" font-size="11.5" fill="currentColor">costs are multipliers,</text>
  <text x="810.0" y="134" text-anchor="middle" font-size="11.5" fill="currentColor">never currency —</text>
  <text x="810.0" y="151" text-anchor="middle" font-size="11.5" fill="currentColor">the $/km rate is applied</text>
  <text x="810.0" y="168" text-anchor="middle" font-size="11.5" fill="currentColor">to the routed length</text>
  <rect x="710" y="208" width="200" height="65" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="810.0" y="229" text-anchor="middle" font-size="11.5" fill="currentColor">exclusions are ∞, not a</text>
  <text x="810.0" y="246" text-anchor="middle" font-size="11.5" fill="currentColor">large number: a finite cost</text>
  <text x="810.0" y="263" text-anchor="middle" font-size="11.5" fill="currentColor">lets the optimiser cross</text>
  <text x="40" y="388" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">Every argument about a route is an argument about these weights.</text>
</svg>

## Why the straight line and the route diverge

Three mechanisms produce the gap, and they compound rather than average out.

The first is **avoidance**. Protected areas, dense settlement and open water are not merely expensive
— they are excluded, so a route that would cross them must go around, and the detour scales with the
size of the obstacle rather than with its cost. A single designated corridor lying across the direct
line can add several kilometres to a ten-kilometre route.

The second is **crossing infrastructure**. Rivers, railways and controlled-access highways can be
crossed, but only at a cost and often only at specific points where an easement already exists. A
routing model that treats a river as uniformly expensive produces a route that crosses at the
cheapest cell; a model that knows about existing crossings produces the route an engineer would
actually build, which is usually longer and cheaper.

The third is **terrain**. Slope raises construction cost non-linearly — access roads, pad
preparation and structure spotting all get harder — and above the crane specification it stops being
a cost and becomes an exclusion, exactly as it does in
[environmental constraint and exclusion screening](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/environmental-constraint-and-exclusion-screening/).

## Prerequisites and data requirements

The workflow assumes Python 3.11+ with `rasterio>=1.3`, `numpy`, `scikit-image>=0.22` (for
`route_through_array`) and `geopandas>=0.14`. Inputs are a DEM, a land-cover raster, vector layers for
exclusions and crossings, and the origin and destination points — usually a project substation
location and a point of interconnection.

Two requirements are structural. Every raster must share one grid: same CRS, same affine transform,
same shape, because a cost surface built from bands that disagree by half a pixel produces routes
that drift systematically toward the offset. And the working frame must be projected and metric, so
that a cell's cost can be expressed per metre and a route length can be read directly off the path.

Cell size is the parameter that decides everything else. A 30-metre grid over a 40-kilometre corridor
is about 1.8 million cells and routes in under a second; a 5-metre grid over the same corridor is 64
million cells and needs tiling. Route coarse to find the corridor, then refine inside a buffer around
it — the two-pass approach is both faster and more accurate than either resolution alone.

## Core implementation: building the cost surface

The cost surface is the model. Everything downstream is mechanical, and every argument about a route
is really an argument about the weights below.

```python
import numpy as np
import rasterio
from rasterio.features import rasterize

# Cost multipliers are per-metre relative costs, not currencies: the absolute
# figure comes from the $/km estimate applied to the routed length afterwards.
LANDCOVER_COST = {
    11: np.inf,   # open water — excluded
    21: 3.2,      # developed, open space
    22: 6.5,      # developed, low intensity
    23: np.inf,   # developed, medium intensity — excluded in practice
    41: 2.4,      # deciduous forest — clearing cost
    42: 2.6,      # evergreen forest
    52: 1.2,      # shrub
    71: 1.0,      # grassland — the baseline
    81: 1.1,      # pasture
    82: 1.3,      # cultivated crops — easement cost
    90: np.inf,   # woody wetlands — excluded
    95: np.inf,   # emergent wetlands — excluded
}


def build_cost_surface(
    landcover: np.ndarray,
    slope_deg: np.ndarray,
    exclusions: list,
    crossings: list,
    transform,
    shape: tuple[int, int],
    *,
    max_slope_deg: float = 25.0,
) -> np.ndarray:
    """Per-cell relative cost of building a transmission line through that cell."""
    cost = np.ones(shape, dtype="float32")

    # 1. Land cover sets the base cost and the first set of exclusions.
    for code, factor in LANDCOVER_COST.items():
        cost[landcover == code] = factor

    # 2. Slope raises cost quadratically, then excludes above the build limit.
    slope_factor = 1.0 + (slope_deg / 10.0) ** 2
    cost *= slope_factor
    cost[slope_deg > max_slope_deg] = np.inf

    # 3. Vector exclusions are burned in as impassable.
    if exclusions:
        blocked = rasterize(
            [(geom, 1) for geom in exclusions],
            out_shape=shape, transform=transform, fill=0, dtype="uint8",
        )
        cost[blocked == 1] = np.inf

    # 4. Existing crossings punch cheap holes through linear barriers.
    if crossings:
        cheap = rasterize(
            [(geom, 1) for geom in crossings],
            out_shape=shape, transform=transform, fill=0, dtype="uint8",
        )
        cost[cheap == 1] = np.minimum(cost[cheap == 1], 1.5)

    return cost
```

Two design choices in that function are worth defending. Costs are relative multipliers rather than
currency, because the dollar figure belongs at the end — applied to the routed length as a per-kilometre
rate — and keeping it out of the surface stops a change in the cost estimate from requiring a re-route.
And exclusions are `np.inf` rather than a large finite number, because a large finite cost lets the
optimiser cross an exclusion when the detour is long enough, which produces a route that is optimal
and unbuildable.

## Running the route

With a surface in hand, the route itself is a few lines. `skimage.graph.route_through_array` runs
Dijkstra over the array with optional diagonal movement and geometric weighting, which matters:
without it a diagonal step is counted as one cell rather than 1.414, and routes acquire a
characteristic staircase bias.

```python
from skimage.graph import route_through_array
from shapely.geometry import LineString


def least_cost_route(
    cost: np.ndarray,
    transform,
    origin_rc: tuple[int, int],
    dest_rc: tuple[int, int],
) -> tuple[LineString, float, float]:
    """Return the route geometry, its length in metres and its accumulated cost."""
    finite = np.where(np.isinf(cost), np.float32(1e9), cost)
    indices, weight = route_through_array(
        finite, origin_rc, dest_rc, fully_connected=True, geometric=True
    )
    if weight >= 1e9:
        raise ValueError("no traversable route — origin and destination are separated by exclusions")

    xs, ys = zip(*[transform * (c + 0.5, r + 0.5) for r, c in indices])
    line = LineString(zip(xs, ys))
    return line, float(line.length), float(weight)
```

The `1e9` substitution is a deliberate compromise: `route_through_array` cannot handle infinities, so
exclusions become a cost so large that any traversable alternative wins, and the returned weight is
checked afterwards to distinguish "expensive route" from "no route". Silently returning a route that
crosses a wetland because the alternative was longer is the failure this check exists to prevent.

<svg viewBox="0 0 940 420" role="img" aria-label="The same origin and destination routed three ways over the same terrain. The straight line is 8.2 kilometres and crosses a wetland and a protected corridor, so it is not buildable. A route over a cost surface with no crossing data is 15.9 kilometres and fords the river at its cheapest cell. A route that knows about the existing bridge is 14.6 kilometres, uses the crossing, and is the corridor an engineer would actually propose." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Straight line, naive route, and the route that knows where the bridge is</title>
  <desc>A plan view with the project substation at the lower left and the point of interconnection at the upper right. A shaded wetland lies between them and a river runs north to south with a single marked bridge. Three paths are drawn: a dashed straight line of 8.2 kilometres crossing both the wetland and the river at an arbitrary point; a route of 15.9 kilometres that avoids the wetland but crosses the river away from the bridge; and a route of 14.6 kilometres that avoids the wetland and crosses at the bridge. A table beside the plan gives each path its length and circuity factor.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="420"/>
  <defs><marker id="lcp2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">One origin, one destination, three answers</text>
  <rect x="40" y="58" width="560" height="268" rx="6" fill="none" stroke="currentColor" stroke-width="1" opacity="0.25"/>
  <path d="M300,58 C328,124 286,182 322,244 C348,290 332,308 342,326" fill="none" stroke="#5BA8C8" stroke-width="9" opacity="0.4"/>
  <text x="258" y="96" text-anchor="middle" font-size="11" fill="#2C6E8F" font-weight="700">river</text>
  <rect x="150" y="150" width="150" height="96" rx="10" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.4" opacity="0.65"/>
  <text x="225" y="196" text-anchor="middle" font-size="11" fill="#1F5C3A" font-weight="700">protected wetland</text>
  <circle cx="318" cy="214" r="7" fill="none" stroke="#F4A261" stroke-width="2.4"/>
  <text x="360" y="218" text-anchor="middle" font-size="11" fill="#7A4A1A" font-weight="700">existing bridge</text>
  <circle cx="80" cy="292" r="8" fill="#F4A261" stroke="#F4A261" stroke-width="1"/>
  <text x="80" y="314" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">project</text>
  <circle cx="560" cy="92" r="8" fill="#3D8B5F" stroke="#3D8B5F" stroke-width="1"/>
  <text x="560" y="76" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">POI</text>
  <line x1="88" y1="288" x2="552" y2="98" stroke="currentColor" stroke-width="1.6" stroke-dasharray="6 4" opacity="0.65"/>
  <path d="M84,286 L100,214 L150,140 L232,124 L300,110 L392,132 L470,116 L552,96" fill="none" stroke="#C85B5B" stroke-width="2.4"/>
  <path d="M84,288 L112,246 L180,268 L262,254 L318,214 L392,182 L470,140 L552,98" fill="none" stroke="#F4A261" stroke-width="2.8"/>
  <rect x="624" y="70" width="286" height="76" rx="7" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3" opacity="0.55"/>
  <text x="640" y="96" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">straight line</text>
  <text x="894" y="96" text-anchor="end" font-size="12.5" fill="currentColor" font-weight="700">8.2 km</text>
  <text x="640" y="116" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">circuity 1.00</text>
  <text x="640" y="134" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">not buildable — crosses both</text>
  <rect x="624" y="158" width="286" height="76" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3" opacity="0.55"/>
  <text x="640" y="184" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">route, no crossing data</text>
  <text x="894" y="184" text-anchor="end" font-size="12.5" fill="currentColor" font-weight="700">15.9 km</text>
  <text x="640" y="204" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">circuity 1.94</text>
  <text x="640" y="222" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">fords the river at a random cell</text>
  <rect x="624" y="246" width="286" height="76" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3" opacity="0.55"/>
  <text x="640" y="272" text-anchor="start" font-size="12" fill="currentColor" font-weight="700">route with crossings</text>
  <text x="894" y="272" text-anchor="end" font-size="12.5" fill="currentColor" font-weight="700">14.6 km</text>
  <text x="640" y="292" text-anchor="start" font-size="11" fill="currentColor" opacity="0.9">circuity 1.78</text>
  <text x="640" y="310" text-anchor="start" font-size="10.5" fill="currentColor" opacity="0.85">uses the bridge — the real corridor</text>
  <rect x="40" y="344" width="868" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="474.0" y="365" text-anchor="middle" font-size="11.5" fill="currentColor">A finite cost on the wetland would have produced the straight line again, at a price the optimiser</text>
  <text x="474.0" y="382" text-anchor="middle" font-size="11.5" fill="currentColor">was willing to pay — which is why exclusions are infinite and checked afterwards.</text>
</svg>

## Error handling and edge cases

**No traversable route.** This is a real answer, not an error condition — a site behind a continuous
exclusion has no corridor at the given constraints — and it should propagate as a result with the
blocking geometry named, so a developer can see whether relaxing one constraint opens a path.

**Origin or destination inside an exclusion.** Common, and usually a data artefact: a substation
polygon overlapping a developed land-cover class, or a point snapped to the wrong cell. Force the
endpoint cells to a finite cost before routing and record that the override happened, rather than
letting the route fail with an unhelpful message.

**A route that hugs an exclusion boundary.** Optimal and often unbuildable, because construction needs
working room. Buffer exclusions by a construction offset — 30 to 50 metres is typical — before burning
them into the surface, so the optimiser keeps its distance without any special-case logic in the
routing step.

**Diagonal staircase artefacts.** If routes look like a flight of stairs rather than a corridor, the
geometric weighting is off or the surface is too coarse relative to the cost variation. Simplify the
resulting line with a tolerance of roughly one cell before reporting its length, but compute the cost
from the unsimplified path.

## Performance and scalability

Dijkstra over a raster is `O(n log n)` in the cell count, so cell count is the only lever that
matters. Three techniques, in the order they pay off. Clip the surface to a corridor buffer around
the straight line — three to five kilometres either side is generous for most interconnections —
which typically removes 90 percent of the cells before any routing happens. Route coarse then refine,
using a 30-metre pass to find the corridor and a 10-metre pass inside a buffer around it. And route
each candidate independently in a worker pool, since routes share nothing but the read-only surface.

For a portfolio screen, the useful shortcut is not to route at all until the shortlist exists: run
the straight-line screen over everything, take the top candidates by straight-line distance and
capacity, and route those. Routing everything is the most common reason a screening pipeline that
worked on one county does not finish on a portfolio.

<svg viewBox="0 0 940 404" role="img" aria-label="Where routing time goes, and the two techniques that remove it. A 40 kilometre corridor at 30 metre cells over the full study extent is 4.9 million cells and routes in 6.2 seconds; clipped to a 4 kilometre corridor buffer it is 0.6 million cells and 0.7 seconds. A 10 metre pass over the full extent is 44 million cells and 71 seconds, while the same 10 metre pass restricted to a buffer around the coarse route is 2.4 million cells and 3.1 seconds — the two-pass approach is both faster and more accurate than either single resolution." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Cell count is the only lever: clip, then refine</title>
  <desc>A chart of four routing configurations by cell count and wall-clock time. Thirty metre cells over the full extent: 4.9 million cells, 6.2 seconds. Thirty metre cells clipped to a 4 kilometre corridor buffer: 0.6 million cells, 0.7 seconds. Ten metre cells over the full extent: 44 million cells, 71 seconds. Ten metre cells inside a buffer around the coarse route: 2.4 million cells, 3.1 seconds. The last configuration is marked as the working choice, being twenty times faster than the full fine pass at the same effective resolution where it matters.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="404"/>
  <defs><marker id="lcp3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Two passes beat one fine grid, by a factor of twenty</text>
  <text x="240" y="102" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">30 m · full extent</text>
  <rect x="256" y="76" width="46.29333333333334" height="44" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <text x="314.29333333333335" y="104" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">6.2 s · 4.9M cells</text>
  <text x="240" y="162" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">30 m · corridor buffer</text>
  <rect x="256" y="136" width="5.226666666666667" height="44" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="273.2266666666667" y="164" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">0.7 s · 0.6M cells</text>
  <text x="240" y="222" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">10 m · full extent</text>
  <rect x="256" y="196" width="530.1333333333333" height="44" rx="5" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="798.1333333333333" y="224" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">71.0 s · 44.0M cells</text>
  <text x="240" y="282" text-anchor="end" font-size="12" fill="currentColor" font-weight="700">10 m · around coarse route</text>
  <rect x="256" y="256" width="23.14666666666667" height="44" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="291.14666666666665" y="284" text-anchor="start" font-size="11.5" fill="currentColor" font-weight="700">3.1 s · 2.4M cells</text>
  <text x="256" y="322" text-anchor="start" font-size="11" fill="currentColor" opacity="0.85">wall-clock to route one 40 km corridor</text>
  <rect x="40" y="340" width="428" height="48" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="254.0" y="361" text-anchor="middle" font-size="11.5" fill="currentColor">Clip first: a corridor buffer removes about</text>
  <text x="254.0" y="378" text-anchor="middle" font-size="11.5" fill="currentColor">90% of the cells before routing starts</text>
  <rect x="492" y="340" width="416" height="48" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="700.0" y="361" text-anchor="middle" font-size="11.5" fill="currentColor">Then refine: the fine pass only needs to run</text>
  <text x="700.0" y="378" text-anchor="middle" font-size="11.5" fill="currentColor">where the coarse route already goes</text>
</svg>

## Validation and audit trail

A route is a claim about buildability, so the record has to carry enough to defend it: the cost
surface version and the weights that produced it, the exclusion layers and their buffers, the cell
size of each pass, the routed length, the accumulated cost, the crossings used, and the straight-line
length for comparison. The ratio between the last two is the circuity factor, and publishing it makes
the difference between the screen and the route explicit rather than surprising.

Three assertions belong in CI. The routed length must be greater than or equal to the straight-line
length, which catches a coordinate or transform error. The route must not intersect any exclusion
geometry, which catches the finite-cost-substitution bug directly. And the accumulated cost must be
finite, which catches the case where the only path found crosses a barrier.


## Reading the accumulated-cost surface

Dijkstra produces more than a path. The accumulated-cost array it fills in on the way is a complete
answer to "what would it cost to reach every cell from this origin", and reading it directly is often
more useful than the single route extracted from it.

Three questions fall out of that array for free. Comparing several candidate points of
interconnection needs one pass rather than one per destination, because the cost to each is simply
the value of the array at that cell. Drawing iso-cost contours over the array shows the shape of the
accessible region — where the cheap corridors run, and where an obstacle splits the surface into two
basins that only connect a long way round. And subtracting the straight-line distance from the
accumulated cost highlights exactly where the terrain is expensive, which is the map a routing
engineer wants when deciding whether to challenge a constraint.

The array is also the honest place to express uncertainty. Running the same origin over two plausible
weightings and differencing the two accumulated-cost surfaces shows which parts of the study area are
robustly cheap and which are cheap only under one set of assumptions. A route drawn through the
second kind of region is a route that will be re-litigated.

### Should the accumulated-cost surface be published with the route?

For any study that supports a decision, yes. The route is one line through a surface, and a reviewer
who disagrees with it is really disagreeing with the surface. Publishing both — as a raster with its
weights recorded — turns an argument about a line into an argument about assumptions, which is the
one that can actually be resolved.

## Frequently asked questions

### Should the cost surface include existing corridors as cheap cells?

Yes, and it is one of the highest-value additions. Co-locating with an existing transmission or
pipeline corridor avoids new easements, follows land already cleared, and is usually favoured by
permitting authorities. Give existing corridors a cost below the grassland baseline and the optimiser
will follow them wherever the detour is modest — which is what a routing engineer does by hand.

### How sensitive is the route to the weights?

Very, in the corridor it chooses, and much less in the length it reports. Doubling the forest
multiplier can move a route several kilometres sideways while changing the routed length by a few
percent, because the alternatives are similar in length and different in character. This is why the
weights belong in versioned configuration and why a sensitivity run — the same route under two
plausible weightings — is worth more than a single precise-looking answer.

### Can least-cost paths handle multiple destinations?

Yes, and it is cheaper than it looks: a single Dijkstra from one origin yields the accumulated-cost
surface to every cell, so the cost to each of several candidate points of interconnection comes from
one pass. Use that when comparing interconnection options for one project. Routing many origins to
one destination is the same problem reversed, and the same trick applies.

### What resolution should the final route use?

Fine enough to resolve the crossings that decide it, which in practice means 10 metres or better near
rivers, railways and highways, and 30 metres elsewhere. A uniform fine grid over the whole corridor
buys almost nothing: the route's length is insensitive to resolution in open terrain and highly
sensitive to it where a crossing point is being chosen.

### How does routed distance feed the interconnection cost estimate?

As the length term in a per-kilometre rate, with the crossings and terrain classes carried through as
adders rather than folded into the length. A route reported as "14.6 kilometres, two river crossings,
3.1 kilometres above 15 percent slope" supports a cost estimate that a reviewer can challenge line by
line; a route reported as "14.6 kilometres" invites a single blended rate that hides all of it. The
straight-line figure from
[proximity and distance calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/)
remains the screen; the routed figure is what the estimate uses.

### Does the same approach work for collection systems inside a project?

Partly. The cost-surface idea carries over directly, but the problem changes from a single path to a
minimum-cost tree connecting many turbines to one substation, which is a Steiner-tree problem rather
than a shortest-path one. A practical approximation is to route each turbine to the substation over
the same surface and then merge shared segments, which is not optimal but is close enough for
layout screening and uses exactly the machinery above.


### How should the route handle land the developer does not control?

As a cost, not an exclusion, unless the landowner has formally refused. Easement acquisition is
expensive and slow, and a routing model that treats every uncontrolled parcel as impassable will
report that no corridor exists for almost every project. The workable encoding is a parcel-level
multiplier that rises with the number of distinct owners crossed, which favours routes along fewer,
larger holdings — the same preference a land agent expresses.

### Does the cost surface need to be rebuilt for every project?

The physical layers do not; the weights and exclusions usually do. Terrain, land cover and hydrography
are regional and can be prepared once and cached, which is most of the build time. What changes per
project is the slope limit set by the crane, the buffer applied for working room, and which
constraint classes are treated as hard. Separating the two halves — a cached physical surface and a
per-project weighting pass — keeps a re-route to seconds rather than minutes.

### What happens when two candidate routes are within a few percent of each other?

Report both. A cost surface is a model with uncertain weights, and two routes separated by less than
the weight uncertainty are not distinguishable by the model, however precisely the optimiser ranks
them. Presenting the pair with the properties that differ — number of owners, crossings, forest
kilometres — moves the decision to the criteria a routing engineer would use, which is where it
belongs.

### Can the surface encode permitting difficulty rather than construction cost?

Yes, and it often should. Nothing in the method requires the multiplier to represent dollars: a
surface weighted by expected permitting duration produces the route that reaches energisation
soonest, which is not always the cheapest one to build. Running both and comparing the corridors is
one of the more useful outputs this stage can produce, because the two objectives diverge most
exactly where a project is most at risk.

## Related

- [Grid Infrastructure & Network Proximity Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/) — the parent pipeline
- [Proximity & Distance Calculations](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/proximity-distance-calculations/) — the straight-line screen this stage refines
- [Grid Capacity Buffer Analysis](https://www.renewable-energy-grid-gis.org/grid-infrastructure-network-proximity-analysis/grid-capacity-buffer-analysis/) — where the destination substations and their headroom come from
- [Environmental Constraint & Exclusion Screening](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/environmental-constraint-and-exclusion-screening/) — the exclusion layers burned into the cost surface
- [Automating Hillshade & Slope Analysis for Wind Turbine Siting](https://www.renewable-energy-grid-gis.org/solar-wind-resource-modeling-workflows/terrain-shadow-analysis-pipelines/automating-hillshade-and-slope-analysis-for-wind-turbine-siting/) — the slope input to the surface
