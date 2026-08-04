# Starmap build kit

Builds the two bundled example starmaps from real astronomy data:

- `static/example-starmaps/Local_Neighbourhood-Starmap.json` — the REAL map:
  every known star system within ~13 light years, every confirmed planet host
  out to ~16.5 light years, and a few famous landmarks beyond (Altair, Vega,
  Zeta Reticuli, TRAPPIST-1). Planets are exactly the NASA Exoplanet Archive's
  confirmed set at build time — nothing invented.
- `static/example-starmaps/Local_Neighbourhood_SciFi-Starmap.json` — the same
  real stars at the same true positions, populated with the famous science
  fiction set among them (The Expanse, Avatar, Halo, Alien, Star Trek, Contact,
  Project Hail Mary, Rocheworld, Forbidden Planet, Mission of Gravity...).
- `static/example-starmaps/manifest.json` — map list + stable base system ids
  per base-map version, for the example picker and the WS8 campaign-rebase
  feature.

## Usage

```
node scripts/starmap-build/fetch-sources.mjs    # refresh the data caches (network)
node scripts/starmap-build/build-starmaps.mjs   # regenerate the three output files
```

`build-starmaps.mjs --out <dir>` builds somewhere else instead; only the test
below uses it.

## The kit and the shipped maps are pinned to each other

`buildKit.spec.mjs` rebuilds into a temp directory and compares byte for byte
with the three files in `static/example-starmaps/`. If they differ it names the
values that moved. Line endings and the `appVersion` stamp are normalised;
everything else, including the indentation, is compared exactly.

This exists because the two drifted for a month without anyone noticing (D4).
Twelve fixes were applied straight to the JSON and never brought back here, so
running the build would have succeeded, printed its usual two lines, and silently
reverted C3's ecliptic frame flags, Adrian's radius, both Project Hail Mary
ships' Astrophage drives and a re-parenting.

**So: a correction to a bundled map belongs HERE, in the roster or the overlay or
the generator, and reaches the JSON by rebuilding.** Editing the JSON directly is
not a shortcut; it is the thing that broke. The one legitimate exception is a
stable-id rename, which cannot be regenerated without moving every id that
depends on it — and even then, note that ids feed the phase-angle hash, so the
elements move with them.

`fetch-sources.mjs` queries the NASA Exoplanet Archive TAP service (pscomppars,
all confirmed planets within 12.7 pc) and the SIMBAD TAP service (ICRS RA/Dec,
parallax, spectral types for the whole roster) and caches the raw responses
under `data/cache/`. It only fetches SIMBAD rows it does not already have, so
adding a star to the roster is cheap. `build-starmaps.mjs` is fully offline and
deterministic (orbital phase angles are hashed from node ids, never random).

## Shared core: `src/lib/import/realsky/`

The kit's position mathematics (RA/Dec/parallax to equatorial Cartesian to map
pixels), spectral-type classification, mass-radius estimation, makeup defaults
and the catalogue description composer live in `src/lib/import/realsky/` as
plain dependency-free ESM, imported by BOTH this kit and the in-app real-sky
importer (see `docs/dev/starmap-data-import-design.md`). A change to any of
them changes generator output, so the pin test will demand the shipped maps be
regenerated in the same commit.

**Adding a planet host to the roster also changes generated source.** The
importer needs to know which archive hosts are already curated here, so the
build EMITS `src/lib/generated/bundledArchiveHosts.mjs` from the roster's
`planetsFrom` entries (the same pattern as `generate-examples-list.cjs`). It
used to be a hand-kept copy inside `convert.mjs`; it is not any more. Re-run
the build after touching the roster — `convert.spec.js` goes red, naming the
host, until you do. The emission is skipped under `--out` so the pin test
never rewrites repository source.

## Data files

- `data/systems-real.mjs` — the curated roster: system list and hierarchy
  (binaries/triples via barycentres), literature parameters for planetless
  stars, binary orbital elements, debris belts, ages, descriptions, and the
  stable ids. Planet hosts pull stellar parameters straight from the archive
  cache. Sources are cited in the file header.
- `data/systems-fiction.mjs` — the science-fiction overlay applied on top of
  the real map to produce map B (add/remove/describe nodes per system).
- `data/starmap-shell.json` — shared top-level starmap fields (temporal block,
  scale, map mode) carried over from the original hand-built map.
- `data/cache/` — raw TAP responses (committed so builds are reproducible
  without network access).

## Conventions baked into the generator

- Positions are TRUE 3D positions: right-handed equatorial Cartesian frame,
  +z toward the north celestial pole, +x toward RA 0h Dec 0, +y toward RA 6h
  Dec 0, from ICRS RA/Dec/parallax, at `scale.pixelsPerUnit` = 43.30127 px/ly.
  Sol stays at pixel (400, 300), z = 0.
- Planet inclinations are MUTUAL inclinations in the system's own plane (near
  zero — planetary systems are close to coplanar). Sky-plane inclinations from
  discovery papers are deliberately not used: SSE's reference plane is the
  system plane, and using i ~ 90 stacks transiting systems vertically.
- Radial-velocity planets have no measured radius; the generator estimates one
  with a Chen & Kipping style mass-radius relation and hands SystemProcessor a
  bulk makeup, letting the physics derive everything else. Bodies carry
  `autoClassify: true` unless a class is deliberately pinned
  (`autoClassify: false`), so engine improvements keep propagating.
- Binary pairs orbit a shared barycentre with semi-major axes split by mass
  ratio and mirrored ellipses (omega + 180, shared phase) so members stay in
  anti-phase at any eccentricity.
- System ids (`sys-sol`, `sys-alphacen`, ...) and surviving node ids are STABLE
  across base-map versions — WS8 campaign rebase keys off them. Never renumber.
- Both maps carry `appVersion` + `baseMapVersion` stamps (see the WS8 notes in
  `docs/dev/v2.2-player-view-visual-overhaul.md`).

## Adding a system

1. Add its SIMBAD identifier to `fetch-sources.mjs` and re-run the fetch.
2. Add a roster entry to `data/systems-real.mjs` (see the file header for the
   component spec shapes). If it hosts confirmed planets, set `planetsFrom` to
   the archive hostname and the planets come along automatically — the build
   warns about any nearby archive host the roster does not use.
3. Rebuild, then run the app and load the example to eyeball it.
