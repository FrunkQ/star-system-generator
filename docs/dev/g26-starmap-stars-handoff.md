# G26(a) + C17 — Starmap stars as stars: handoff for a fresh session

Written 2026-08-19 by the coordinator at v2.1.843-beta, from inbox [[G26]], [[C17]], [[A55]] and the
owner's words; code claims verified the same day. The rows are the history; this is the brief.

**One sentence:** on the starmap — 3D and 2D — draw stars as STARS: sharper and denser glyphs that
inherit the system view's star look (intensity, colour, flaring) but not its size; a GM SIZE slider
on both views that spreads four luminosity-class bands from "all equal" (today) to "fully separated";
jets, flares and plumes driven by data the engine already holds; and grouped systems that stay the same
compact cluster at EVERY zoom. The bow-shock tail is V3.1 (needs stellar velocities) — not yours.

## Owner's words, all decisions taken

- *"on the starmap 3D view the stars become diffuse dots up close and lack substance/texture — inherit
  the star renderer from the system view and normalise their sizes — have them reflect the intensity and
  flaring characteristics, i.e. inherit the full look (just not size)… 4 size categories sub-dwarf
  (remnants), dwarf V, II, I, to make them look different sizes slightly — black holes will still need
  to be obviously black holes."* (2026-08-16)
- *"do we have enough info to know whether a star gets a plume, tail or jets from the data we have and
  actually add that to the 3D renderer for all levels. Neutron star jets would look cool on the starmap.
  And obviously 2D representations too."* (2026-08-16) — the data answer is YES for jets, flares and
  plumes (below); NO for a bow shock (V3.1).
- The size bands are a **GM SCALER**, defaulting to today's equal sizes (2026-08-16 decision; never
  built — the commit that recorded it touched the inbox only).
- 2026-08-19, confirming scope: *"the starmap making the stars less fuzzy and more dense, and the size
  slider on 2D/3D views"* — and [[C17]]: *"the stars in grouped systems drift apart and make selection
  awkward; they need to stay the same compact group at all zoom levels, so at least relatively they
  look the same — here the 3 Alpha Centauri stars appear as far apart as them from Earth."*

## Read first, in this order

1. `docs/dev/starmap-3d-surfaces-notes.md` — the retired Scene/grids/sky session's 12 sections of traps
   for `starmapScene.ts`: axis convention, floating origin, radial compression, the three grid
   generators, the 43x scale bug, the far-field sky, transparent-pass depth, in-scene labels, the
   one-overlay-vocabulary rule, verifying when the pane will not composite, the shared-tree hazard.
2. The standing rules at the foot of `docs/dev/observations-inbox.md`; then the `| G26 |`, `| C17 |`,
   `| A55 |` rows; [[G9]] (Star-boost / Name-size dials already on the 3D starmap) and [[G4]].
3. `docs/dev/engine-map.md`: RENDER-S12, S22, S24, S25; `feedback_sse_physics_tags_visuals` — physics and
   data drive tags, tags drive the image; no rendering code to make something look a particular way
   without a data lever.
4. `docs/dev/camera-framing-redesign.md` and `src/lib/rendering/scaleLaw.ts` (+ `scaleLaw.spec.ts`) —
   the holo's size law: how sprites shrink with a dial and why sizes are never world constants.

## What is true in the tree today (verified 2026-08-19)

**The 3D starmap star is a glow sprite at a WORLD-unit size, and that is the whole of C17.**
`src/lib/starmap/starmapScene.ts:908-926`: `const R = 0.22` scene units; `starClusterOffsets(n)`
(`systemStars.ts:44`, shared with the 2D map) applied as `dx * R` in WORLD units; sprite scale
`R * 3.2` world units; texture from `starGlow()` (`:128`), additive, colour from the star's derived
colour, black holes as a schematic glyph (`bhGlyph`). Zoom in and each star becomes light-years wide
and the group's spread grows with it — which is the fuzz, the lack of density, AND the triple drifting
apart. There is no size-band logic and no size dial. `GRID_RADIUS = 12` scene units = the map's extent.

**The 2D map glyphs are SVG circles at constant `r` inside the world transform** —
`src/lib/components/Starmap.svelte:1501-1517` (`r={3}`, `r={5}`) under `:1224`'s
`translate(pan) scale(zoom)` — so they scale with zoom exactly as the labels did before [[A4]] divided
the zoom out of the fonts. Same offsets from `starClusterOffsets`. Same fix family, same file as A4's.

**The system view's star look lives in `holo/scene.ts` around `:3685-3760`:** photosphere sphere +
additive corona sprite (`:3748-3752`, "bigger/brighter for an active star") + `buildStellarFlares(starR,
hex, activity, seed, glowTexture)` (`:3737`) — the flares are already DATA-driven by `flareActivity`.
That is the look to inherit. Do not copy it — factor the corona/flare construction so both scenes call
one builder with a size argument (the duplication rule; the grid vocabulary went through exactly this).

**The data for jets / flares / plumes already exists on every star in the derived output** (G26 row,
inspected 2026-08-16): `magneticField`, `flareActivity`, `oblateness`, `radiationOutput`,
`particleRadiation`, `photonRadiation`, `classes`, `radiusKm`, `massKg`, and `accretionEddington` on a
fed hole. Jets: accretion + strong field + spin — a FED black hole and a neutron star / magnetar
qualify, a quiescent hole does not; it falls out, no branch. Flares: `flareActivity`, already driving
tags. Plume / shed shell: Reimers mass-loss ∝ L·R/M from quantities held — an evolved giant sheds, a
dwarf does not. **Publish each as a TAG off the physics (`star/jets`, `star/shedding`, a flare band)
and let BOTH renderers read the tag** — that is the architecture rule, and it gives the 2D map its
"representation" for free (a glyph decoration per tag).

**Size bands:** the luminosity class is already first-class on every star ([[B60]]: full MK
designation computed, `star/<letter>-III` etc.). Four bands — remnant/sub-dwarf, V, III/II, I — and a
GM scaler from 0 (all equal, today) to 1 (fully separated) interpolating between them. Black holes keep
their schematic glyph whatever the band.

**Dials already on the 3D starmap:** [[G9]] shipped Star-boost and Name-size; `holoStyle.ts`'s
`constellationBoost`. Add the size scaler beside them, same store, same preset field pattern — and the
2D map reads the same value (one setting, two renderers), persisted per the existing grid-settings
pattern (`starmapUiStore` / the preset's starmap section). Say which is GM-local and which rides the
preset, the way [[G5]] did.

## Scope

IN: (1) screen-space glyph sizing on the 3D starmap — `sizeAttenuation: false` / px-sized sprites or a
scaleLaw binding — and member offsets in screen pixels so a triple is the same compact cluster at every
zoom ([[C17]]); the same for the 2D map's circles and offsets. (2) The inherited look: corona +
flare builder shared with the holo scene, sized for the map. (3) Four size bands × GM scaler, on 2D and
3D. (4) Jets / flare / shed-shell as tags from physics, rendered on 3D and as 2D glyph decorations.
(5) [[A55]] while you are there: the grid crossfade in motion and a boosted sky — two things the
retiring session could not see; look, fix if broken, close the row.

OUT: bow-shock / ram-pressure tail (V3.1, needs velocities); changing the holo scene's own star look;
the 3D sky / starfield.

## Acceptance

- Zoom from whole-map to tight on Alpha Centauri: the three stars stay one compact, selectable cluster
  whose spread on screen does not change; picking each works at every zoom. Same on the 2D map.
- Stars read as points of light with substance at every zoom — no light-year-wide fuzz; the map is
  visibly denser at the whole-map view.
- Size scaler at 0: pixel-identical to today's equal sizes (bar the sharper glyph). At 1: Betelgeuse,
  a G dwarf, Sirius B and a black hole are four visibly different sizes, the hole still obviously a
  hole.
- A fed black hole and a neutron star show jets; Sol does not. A flare star shows activity Sol does
  not. A red giant shows a shed shell. Each is a TAG the Tags panel lists, and removing the tag removes
  the decoration — no renderer-only state.
- The 2D map shows the same decorations as glyph marks.
- `systemStars.test.ts` and the starmap specs green; FRAME-LOOP-style check for the 3D (unit tests miss
  integration faults here — the camera stream's rule).

## Deliverables

1. `starmapScene.ts` + `Starmap.svelte` glyph sizing and offsets in screen terms; a shared star-look
   builder used by both scenes; size bands + scaler dial on both views; tag-driven jets/flares/shells;
   tests.
2. Engine-map entries: one for "starmap glyph size and cluster offsets are SCREEN quantities" (cite
   C15/C17 as the two times world constants bit), one for "star decorations are tags, not renderer
   state" if it is not already implied by an existing TAG-* entry.
3. Rows G26 (mark (a) shipped, (b) stays V3.1), C17, A55 updated with versions; a Documentation-debt
   line (the starmap doc needs the size slider and the decorations explained).
4. Changelog line after "All notable changes are listed here:", version bump, `npm run build` green,
   push beta; commit as FrunkQ <frunk@frunk.net>.

## Rules that will bite

- Work in your OWN worktree off `origin/beta`; the main checkout is shared. Stage explicit files.
  `changelog.md` is CRLF; on rejection pull --rebase, take their version, bump from it, keep both
  entries, check every conflicted file for markers before `git add`.
- Physics → tags → visuals. If a look needs a lever, the lever is data.
- Never a world-unit size or offset for a screen thing; never a second copy of the star look.
- If the browser pane will not composite (it often will not for canvas — notes §11), compare the
  NUMBERS (sprite sizes, offsets in px at three zooms) and hand back a thirty-second list for a human
  eye: "Alpha Centauri tight: three dots, same spread as at whole-map; Betelgeuse bigger than Sol at
  scaler 1; the neutron star in the SciFi map has jets."
- Anything that changes what the product IS — recommend, then ask.
