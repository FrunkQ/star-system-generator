# Real-sky import — build starmaps from official astronomy sources (DESIGN, 2026-07-30)

Status: PROPOSED. Companion to the starmap build kit (`scripts/starmap-build/`), which is the
offline proof of the whole pipeline: it already turns NASA Exoplanet Archive + SIMBAD data into
the two bundled Local Neighbourhood maps. This document designs the same capability as an
in-app, GM-facing feature, so a GM can carve any region of the real sky into a playable starmap.

## 1. What the GM gets

A "New Starmap from the Real Sky" path in the New Starmap modal:

1. Pick a REGION — a centre and a radius. Default centre Sol; alternates: any named star
   (resolved via SIMBAD), or RA/Dec + distance for deep-field campaigns.
2. Pick a POPULATION — which stars inside the region come along.
3. Pick a FIDELITY — confirmed-only, or procedurally filled out.
4. Preview the roster (count, names, planet totals, est. file size) before committing.
5. Import: every selected system arrives as a full SSE system, positioned at its TRUE 3D
   position, processed by SystemProcessor like any other data.

## 2. Data sources (all free, no key, CORS-friendly or proxyable)

| Source | Gives us | Endpoint |
|---|---|---|
| NASA Exoplanet Archive TAP (`pscomppars`) | every confirmed planet + host-star parameters (mass, radius, Teff, log L, spectral type, distance, RA/Dec) | `exoplanetarchive.ipac.caltech.edu/TAP/sync` (ADQL, JSON) |
| SIMBAD TAP | astrometry + spectral type for ANY catalogued star; name resolution ("Sirius" → position) | `simbad.cds.unistra.fr/simbad/sim-tap/sync` |
| Gaia archive TAP (`gaiadr3.gaia_source`) | the bulk population: everything with a parallax, magnitudes, colours — the source for "give me all ~2,000 stars within 15 pc" | `gea.esac.esa.int/tap-server/tap` |
| VizieR TAP (optional later) | curated catalogues (CNS5 nearby-star census, WDS binaries, brown dwarf lists) | `tapvizier.cds.unistra.fr` |

Practical notes, learned from the build kit:

- `pscomppars.st_lum` is log10(L/Lsun). RV planets carry `pl_bmassprov = Msini` — surface it
  as "minimum mass" in descriptions.
- SIMBAD's `ident` table resolves any alias, but component stars need care ("40 Eri A" fails,
  "GJ 166 A" works). Resolve failures must be user-visible, not silent drops.
- All three TAP services answer JSON over plain HTTPS GET — fetchable from the browser if the
  service sends CORS headers (Exoplanet Archive and SIMBAD do; Gaia needs checking — if any
  source is CORS-hostile we need a tiny serverless proxy or "download the JSON and drop it
  here" fallback, same UX as the .ubox/.sc importers).
- Rate limits are generous but real: batch by region query, never per-star loops (the build
  kit's per-star SIMBAD loop is fine for 54 stars, wrong for 2,000 — use one ADQL cone query).

## 3. Population presets (the census problem)

"All stars within X light years" is deceptively hard: Gaia alone misses the brightest stars
(saturation) and the dimmest brown dwarfs; no single query gives a complete census. Rather than
pretending completeness, the UI offers honest presets:

- **Planet hosts** — everything in `pscomppars` inside the region. Complete by construction,
  small, and every system is interesting. (This is the map the build kit's roster rule
  approximates by hand.)
- **Bright stars** — Gaia + SIMBAD above an apparent- or absolute-magnitude cut. Good for
  "navigation beacon" maps of big regions.
- **Everything catalogued** — Gaia cone query, capped with a warning above ~500 systems
  (file size, physics-recalc time on load; recalc is ~2ms/system but the UI loop yields 30ms
  per system for the progress bar — batch it for imports).
- **Curated census** (later) — CNS5 via VizieR for a genuinely complete nearby-star list,
  including the brown dwarfs Gaia misses.

Multiplicity: pairs within Gaia are separate rows; known binaries should merge into one SSE
system with a barycentre. Phase 1 ships with a separation heuristic (same parallax ±5%,
separation < 1000 AU → one system) plus the WDS catalogue later for real orbits. Unknown orbital
elements get flagged assumptions (circular, mass-ratio split), same as the SpaceEngine importer's
assumptions list.

## 4. Pipeline (shared library, three consumers)

Extract the build kit's core into `src/lib/import/realsky/`:

    query.ts      — ADQL builders + fetch/cache for the three TAP services
    convert.ts    — rows → SSE System nodes (stars, barycentres, planets)
    positions.ts  — RA/Dec/parallax → equatorial Cartesian → map px (shared constant
                    43.30127 px/ly; +z = north celestial pole; Sol at the map centre)
    fillout.ts    — procedural completion (see §5)

Consumers: (a) the in-app import UI, (b) `scripts/starmap-build/` (rewired to call the same
library so the bundled maps and the feature can never drift), (c) WS8 rebase tooling (base-map
manifests).

Conversion rules are exactly the build kit's, already validated end-to-end:

- Stars: mass/radius/Teff/luminosity as authored inputs, `star/<letter>` classes, image by
  class. Planet hosts take stellar parameters from the archive row; others from SIMBAD +
  spectral-type lookup tables (a small bundled table of typical M/R/L per spectral class covers
  stars with no measured parameters — flag as "typical for class").
- Planets: confirmed rows only. Mass from `pl_bmasse`; radius measured or Chen-Kipping
  estimated; bulk makeup by mass/density band; `autoClassify: true`; MUTUAL inclinations near 0
  (never sky-plane i — SSE's frame is the system plane); deterministic hashed phase angles.
- Binaries: shared barycentre, a split by mass ratio, omega+180 mirroring, shared phase.
- Every system carries `credits` + the map carries `appVersion`/`baseMapVersion`-style stamps
  and a manifest of its system ids, so imported maps are rebasable later (WS8 pattern).
- Ids: `sys-<slug>` with a collision-proof suffix from the catalogue id (e.g.
  `sys-gaia-4472832130942575872`) EXCEPT where a bundled-map id already exists for that star —
  reuse it, so a GM's imported region interoperates with campaign-upgrade tooling.

## 5. Procedural fill-out ("likely worlds" mode)

The confirmed-planet catalogue is a floor, not a census: RV/transit surveys are blind to most
small, long-period worlds. Fill-out mode asks the EXISTING generator to complete each system,
seeded and constrained by what is actually known:

- **Anchors are law.** Confirmed planets import exactly as in confirmed-only mode and are never
  moved or deleted. The generator receives them as fixed bodies.
- **Constraints from data.** Star mass/age/metallicity drive the generator's existing knobs.
  Known planets carve dynamical exclusion zones (no new body within ~3.5 mutual Hill radii of
  an anchor); a known cold Jupiter suppresses inner super-Earth generation the way real
  statistics suggest; known debris discs seed belt nodes at their measured radii.
- **Occurrence priors, not uniform rolls.** M dwarfs prefer compact multi-super-Earth systems;
  FGK stars roll against Kepler-era occurrence rates. This is a tuning table in the rule pack
  (data, not code — per the physics→tags→visuals rule).
- **Determinism + honesty.** Seed = catalogue id, so re-import reproduces the same worlds.
  Generated bodies are tagged (e.g. `origin/generated` vs `origin/catalogue`) so the GM — and
  the report/player views if desired — can always tell measured worlds from plausible fiction.
  The tag also lets a future re-import refresh the catalogue anchors while keeping or rerolling
  the generated filler.
- The bundled maps put this to work too: official map = confirmed-only; the science-fiction
  map (and any GM map) can go nuts.

## 6. UI sketch

New Starmap modal gains a third card: **"Real sky…"** →

    ┌─ Import from the real sky ─────────────────────────────┐
    │ Centre   [ Sol ▾ | star name… | RA/Dec ]               │
    │ Radius   [====○——————] 16 ly                           │
    │ Include  (•) Planet hosts  ( ) Bright stars  ( ) All   │
    │ Planets  (•) Confirmed only ( ) Fill out (generated    │
    │              worlds are tagged and reproducible)       │
    │ ├─ 38 systems · 61 confirmed planets · ~450 KB ────────┤
    │ │  preview list w/ per-system tick boxes …             │
    │ Sources: NASA Exoplanet Archive · SIMBAD · Gaia DR3    │
    │              [ Cancel ]  [ Import 38 systems ]         │
    └────────────────────────────────────────────────────────┘

- The preview list is fetched live (counts first, details lazily) and supports deselecting
  individual systems.
- Import runs through the same physics-progress bar as example loading, batched.
- Attribution matters (talk-up-attribution convention): the sources line lands in the map
  description and the ACKNOWLEDGEMENTS file lists the services' required citation lines.
- Also reachable later from an existing map ("Add real systems near here…" on the map
  right-click, sharing WS7b's placement affordances).

## 7. Phases

1. **Extract the library** from `scripts/starmap-build/` (no behaviour change; kit rewired).
2. **Confirmed-only import UI**: planet-hosts preset + SIMBAD name-resolve centre, browser-side
   TAP fetch with the download-fallback, preview + import. This alone is shippable and useful.
3. **Population presets**: Gaia cone queries, magnitude cuts, binary merging heuristic, caps.
4. **Fill-out mode**: generator integration with anchors/constraints/priors + origin tags.
5. **Later**: CNS5/WDS via VizieR (census + real binary orbits), "add real systems near here",
   region re-import/refresh against a newer catalogue (WS8-style report before applying).

## 8. Open questions

- Gaia TAP CORS behaviour from the browser — verify early; it decides whether Phase 3 needs a
  proxy.
- Where the occurrence-rate priors live in the rule pack and how a GM tunes them.
- File-size ceiling for a comfortable starmap (physics recalc + IDB persistence) — measure with
  a 500-system Gaia import before choosing the warning threshold.
- Whether imported maps should embed the raw TAP rows (audit/refresh) or just the converted
  systems (smaller; current choice).
