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

## 1b. Choosing the centre and the range

**Centre.** Three entry modes, one resolution path — everything becomes a 3D point in the
shared equatorial frame before any query runs:

- **Sol (default).** The dialog opens Sol-centred with the radius at 16 ly and the Planet
  hosts preset — i.e. its opening state reproduces roughly the bundled Local Neighbourhood,
  so the first thing a GM sees is familiar, correct, and green-band cheap.
- **Named star.** A text box resolved live through SIMBAD's ident table ("Trappist-1",
  "Betelgeuse", "HD 219134" — any alias works). Resolution returns RA/Dec/parallax, which
  fixes the centre's 3D position; failures are shown inline ("SIMBAD does not know this
  name"), never silently ignored. Component names need the alias care noted in §2.
- **RA/Dec + distance.** For deep-field or fictional-frontier campaigns where the interesting
  point is not a star at all ("centre on the Orion direction, 400 ly out").

There is also a fourth, contextual entry: **"Add real systems near here…"** on an existing
map's right-click menu pre-fills the centre from the clicked system's stored true position
(or its SIMBAD identity when it has one) — so a GM can grow an existing campaign map outward
without re-deriving anything.

**Range.** One number: a radius in light years around the centre — a true 3D sphere, not a
sky-cone (a sky-cone of nearby directions plus a distance shell is how it is IMPLEMENTED, see
below, but what the GM reasons about is "everything within N light years of X"). The slider
is log-scaled (2 ly → 100 ly for star-centred maps, wider for deep-field), because the star
count grows with the cube of the radius and a linear slider makes the top half of its travel
useless. The live count readout (§5b) is what actually guides the choice: the GM drags until
the number and the cost line look right, or taps a preset chip ("Bundled-map size", "Subsector
~50 systems", "Sector ~200").

**How the sphere becomes a query.** TAP services think in sky coordinates + parallax, not in
Cartesian spheres, so the library translates:

- Centre at Sol: trivial — `1000/parallax_mas < R_pc` (a distance shell IS a Sol-centred
  sphere).
- Centre at another star P: fetch a bounding shell `dist(Sol) ∈ [d_P − R, d_P + R]`
  intersected with a sky-cone around P's direction of half-angle `asin(R / max(d_P − R, ε))`
  — a slight over-fetch that is then cut exactly client-side by computing each candidate's
  Cartesian position and keeping `|x − x_P| < R`. (COUNT queries run on the over-fetch
  bounds, so the live readout is a small over-estimate, labelled "~".) A centre farther than
  the radius is required for the cone formula; when the sphere contains Sol (d_P < R) it
  degrades to the plain distance-shell query.
- The exact-cut step is the same code that computes map positions, so the filter and the
  final placement can never disagree.

**Placement on the map.** The CENTRE lands at the map origin (pixel 400,300, z = 0) and every
other system is placed at its true Cartesian offset FROM THAT CENTRE, in the same equatorial
axes and at the standard 43.30127 px/ly. A Sol-centred import therefore matches the bundled
maps exactly; a TRAPPIST-1-centred map puts TRAPPIST-1 at the origin with Sol out at its true
offset (if Sol is inside the radius at all). The map description records the centre and radius
("Real-sky import: 14 ly around TRAPPIST-1, Gaia DR3 + NASA Exoplanet Archive, 2026-07-30")
so the map is self-documenting and refreshable later.

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

Multiplicity: pairs within Gaia are separate rows; stars the map cannot visually resolve merge
into one SSE system. Phase 1 ships with a separation heuristic (same parallax ±5%, separation
< 1000 AU → one system) plus the WDS catalogue later for real orbits. Whether the merged pair
gets a BARYCENTRE ORBIT or just static co-placement follows the period tiers in §5c: orbits
are authored up to roughly million-year periods (they cost nothing and draw the true
architecture); only glacial or dynamically meaningless memberships import static with a note.
Unknown-element orbits get flagged assumptions (circular, mass-ratio split), same as the
SpaceEngine importer's assumptions list.

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

## 5c. Dense regions — import as ONE SYSTEM, not a starmap (the cluster gate)

A starmap is the right container when stars are effectively fixed relative to each other on
campaign timescales. In VERY dense environments that assumption breaks — and breaks in the
most gameable way possible: the stars ORBIT each other fast enough to watch.

- **The galactic centre** is the extreme case: the S-star cluster swarms Sgr A* (4.3 million
  solar masses) at system-like scales — S2 orbits at a ~970 AU semi-major axis with a
  **16-year period**, and its neighbours range from years to centuries. That is not a starmap;
  that is an SSE SYSTEM with a supermassive black hole as its primary and stars as its
  "planets", and the published orbital elements for the brightest S-stars are REAL data we can
  import directly. SSE already renders black holes and multi-star barycentre hierarchies; the
  time controls already make a 16-year period watchable.
- The same is true, less spectacularly, of globular-cluster cores, young dense clusters
  (the Trapezium in Orion is a genuinely bound mini-cluster), and high-order multiples
  (Castor's six stars) — anywhere the mean separation approaches system scale.

**The gate — mass-aware, not just density.** Density is a tempting criterion but it is not
mass-related, and mass is what actually sets the behaviour. Two red dwarfs 0.25 ly apart are
gravitationally bound with a ~million-year period — dense by any separation threshold, yet a
starmap represents them perfectly well. S2 sits a mere ~970 AU from Sgr A* and completes an
orbit in 16 years, because the enclosed mass is 4.3 million Suns. Same "crowding", opposite
answer. So the deciding quantity is the **dynamical time** of the region,

    t_dyn ≈ 2π sqrt(R³ / G · M_enclosed)

— the characteristic orbital period at the region's scale — and the gate runs in two stages
matching what data is available when:

1. **Cheap tripwire (pre-fetch).** Runs on the COUNT query alone, where masses are unknown:
   (a) identity — the resolved centre's SIMBAD object type is a cluster or black hole
   (`GlC`, `OpC`, `Cl*`, `BH?`/`BH*`, Sgr A* itself): flag immediately; (b) density — mean
   separation below a generous threshold: flag as "worth checking". The tripwire only decides
   whether to EVALUATE, never what to offer — density is the stand-in, and it is allowed to
   over-trigger because stage 2 is cheap once data is in hand.
2. **Real decision (post-fetch, pre-import).** With the preview data fetched, masses are known
   (catalogue masses, mass-from-luminosity estimates, SMBH masses from a small curated list).
   Compute M_enclosed and t_dyn:
   - **t_dyn below the watchable band** (first guess: under ~10,000 years — motion a campaign
     can actually run forward into with the time controls): offer cluster-as-system.
   - **Dense but slow** (small separations, stellar-only masses, t_dyn in the millions of
     years): do NOT offer a system — offer the starmap with a crowding note instead ("these
     stars are a bound group; on any playable timescale they are scenery"). This is the case
     pure density gets wrong.
   - Borderline: say the number ("typical orbital period here is ~80,000 years") and let the
     GM choose.

When the gate fires, the dialog offers a third import shape alongside the usual one:

    ⚠ These stars orbit each other on playable timescales (typical period ~16 y).
    (•) Import as a single system — stars (and the central black hole) as
        orbiting bodies; watch them move on the system view's timescale.
    ( ) Import as a starmap anyway (nodes will crowd; positions still true).

**Conversion rules (cluster-as-system):**

- Primary = the dominant central mass (the SMBH when present; else a cluster barycentre with
  `effectiveMassKg` from the summed membership). Which regime applies is itself a mass
  question: if one body holds the majority of M_enclosed, it is a central-potential system and
  per-node Keplerian orbits are genuinely accurate (the Sgr A* case); if mass is spread across
  the membership, it is a swarm — orbits go around the barycentre and get the honesty footnote
  below.
- **Structure is created by PERIOD, not by binding.** Gravitational binding (full Hill-sphere
  logic) is deliberately NOT the criterion for building orbital structure: half the sky is
  technically bound to something, and a pair that takes tens of thousands of years to orbit
  is, for every purpose a campaign has, static — it wants a static starmap, not a barycentre.
  Three tiers, from fast to glacial:
  - **Watchable (offer tier, t_dyn ≲ ~10,000 yr):** this is the band that triggers the
    cluster-as-system OFFER — "import this so you can watch it move". The threshold governs
    the pitch, not the data.
  - **Author-the-orbit tier (period ≲ ~1 million yr):** inside a merged system node, a real
    (or estimated) orbit is authored even when it is far too slow to watch — a barycentre
    ellipse costs nothing, draws the pair's true architecture, and keeps the data honest.
    Proxima's 547,000-year orbit around Alpha Centauri AB in the bundled map is exactly this
    tier and stays as shipped. A pleasing Kepler coincidence makes the cut-off almost
    self-enforcing: for stellar masses a ~1 Myr period means ~10,000 AU ≈ 0.16 ly separation,
    which is already at the map-resolution floor — so nearly every pair that merges into one
    node also earns an authored orbit.
  - **Static (period ≳ ~1 million yr, or membership too loose to call an orbit):** no orbital
    elements — co-placement with a descriptive note. At these scales "orbit" stops being
    meaningful data (perturbations dominate over any Keplerian ellipse) and a static starmap
    is the honest representation. This is where bound-but-glacial cluster outskirts and wide
    common-proper-motion pairs land.
  The **resolution floor (must-merge)** still decides node membership: stars closer than the
  starmap can visually resolve (≲ ~0.1 ly at 43.3 px/ly) cannot be separate map nodes
  regardless of dynamics. Hill logic (`findContainingHost` / `reconcileBarycenters`) is used
  only AFTER these tiers have decided that structure should exist — to assign each orbiting
  member to the correct parent so a fast pair deep in a cluster nests properly instead of
  shearing apart on fast-forward.
- Members become star nodes with orbits. Where published elements exist (the S-stars), import
  them verbatim — real periods, real eccentricities (S2's e = 0.88 is a gift to any GM).
  Where they don't, generate plausible bound orbits deterministically from each star's true
  position (a from the projected radius, a virial-ish e distribution, hashed phases) and tag
  them `origin/generated`, same honesty rule as fill-out mode (§5).
- Membership cap: a whole globular cluster is millions of stars — the count gate (§5b) applies
  unchanged, defaulting to "brightest N inside the core radius". The remainder can arrive as a
  belt-like backdrop node ("unresolved cluster glow") rather than pretending completeness.
- Physics honesty note in the map/system description: SSE integrates two-body Keplerian orbits
  per node; a real cluster is an N-body swarm. For play this is exactly right; for pedantry
  there is a footnote.
- Scale sanity: the S-cluster spans ~10^4 AU — comfortably inside SSE's system scale. The gate
  should refuse (with explanation) regions whose bound structure exceeds `systemEdgeAu`-ish
  scales by orders of magnitude, and suggest tightening the radius to the core.

This also composes with the starmap path: a starmap import whose region CONTAINS a known dense
knot (e.g. a 50 ly map around the Orion Nebula) can place that knot as ONE starmap node whose
nested system is the cluster-as-system conversion — a star system you can fly a campaign into,
sitting on a map you can navigate between.

## 6. UI sketch

New Starmap modal gains a third card: **"Real sky…"** →

    ┌─ Import from the real sky ─────────────────────────────┐
    │ Centre   [ Sol ▾ | star name… | RA/Dec ]               │
    │ Radius   [====○——————] 16 ly                           │
    │ Include  (•) Planet hosts (38)  ( ) Bright stars (~220)│
    │          ( ) Everything (~1,850)                       │
    │ Planets  (•) Confirmed only ( ) Fill out (generated    │
    │              worlds are tagged and reproducible)       │
    │ ├─ 38 systems · 61 confirmed planets · ~450 KB ·       │
    │ │  loads in ~2s — comfortable ──────────────────────── │
    │ │  preview list w/ per-system tick boxes …             │
    │ Sources: NASA Exoplanet Archive · SIMBAD · Gaia DR3    │
    │              [ Cancel ]  [ Import 38 systems ]         │
    └────────────────────────────────────────────────────────┘

    (amber state: the count line becomes "~340 systems · ~3 MB · ~15s recalc on load —
    large" with one-click chips: [ Radius 13 ly → ~120 ] [ Planet hosts → 41 ]
    [ Brighter cut → ~90 ]. Red state: button reads "Import anyway (not recommended)"
    behind a confirm restating the cost; above the ceiling it is disabled outright.)

- The preview list is fetched live (counts first, details lazily) and supports deselecting
  individual systems.
- Import runs through the same physics-progress bar as example loading, batched.
- Attribution matters (talk-up-attribution convention): the sources line lands in the map
  description and the ACKNOWLEDGEMENTS file lists the services' required citation lines.
- Also reachable later from an existing map ("Add real systems near here…" on the map
  right-click, sharing WS7b's placement affordances).

## 7. Phases

1. **Extract the library** from `scripts/starmap-build/` (no behaviour change; kit rewired).
   **DONE 2026-08-03** — `src/lib/import/realsky/{constants,positions,stars,planets}.mjs`,
   plain dependency-free ESM consumed by the kit; pin test byte-green.
2. **Confirmed-only import**: planet-hosts preset + SIMBAD name-resolve centre, browser-side
   TAP fetch with the download-fallback, preview + import. This alone is shippable and useful.
   **LIBRARY DONE 2026-08-03** — `query.mjs` (ADQL builders, count-first region queries,
   cone+shell bounds with the exact sphere cut, injectable transport) and `convert.mjs`
   (archive rows → systems, bundled-host collisions, named skips), 21 tests. **UI NOT wired**:
   the New Starmap modal and `routes/+page.svelte` are outside the importer territory — see
   the inbox entry of 2026-08-03 for the scoping ask and the integration surface.
3. **Population presets**: Gaia cone queries (builder exists in query.mjs), magnitude cuts,
   binary merging heuristic, caps.
4. **Fill-out mode**: generator integration with anchors/constraints/priors + origin tags.
5. **Cluster gate**: dense-region detection + cluster-as-system conversion (S-star elements
   hand-curated first, generated virial orbits after) — see 5c. **GATE MATHS DONE 2026-08-03**
   (`clusterGate.mjs`: tripwire + t_dyn decision + period tiers, S2/red-dwarf calibration
   pinned by test); the conversion itself remains. Sgr A* makes a spectacular flagship example
   map for this phase.
6. **Later**: CNS5/WDS via VizieR (census + real binary orbits), "add real systems near here",
   region re-import/refresh against a newer catalogue (WS8-style report before applying).

## 8. Open questions

- Gaia TAP CORS behaviour from the browser — verify early; it decides whether Phase 3 needs a
  proxy.
- Where the occurrence-rate priors live in the rule pack and how a GM tunes them.
- File-size ceiling for a comfortable starmap (physics recalc + IDB persistence) — measure with
  a 500-system Gaia import before choosing the warning threshold.
- Whether imported maps should embed the raw TAP rows (audit/refresh) or just the converted
  systems (smaller; current choice).
