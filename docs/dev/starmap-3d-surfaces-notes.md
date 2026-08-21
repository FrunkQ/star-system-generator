# The 3D surfaces: system scene, starmap scene, grids and sky — the traps

**AUDIENCE: an agent about to change `src/lib/holo/**`, `src/lib/starmap/**` or `src/lib/map/**`.**
Not a tutorial. Every heading is something that cost real time to work out or that has already been
got wrong. Grep it before you touch these files; the engine map (`engine-map.md`, RENDER-*) holds the
same class of rule and this is its long-form companion for these three directories.

Written on retirement by the scene/grids session, v2.1.749-beta.

---

## 1. There are TWO scenes and they are deliberately not one

`holo/scene.ts` draws ONE system (bodies, orbits, rings, belts, constructs). `starmap/starmapScene.ts`
draws the GALAXY (systems as billboards, routes, markers). They share the filter package, `lib/map/*`
and — since G26 — the star LOOK builder `holo/bodyFeatures.buildStarLook` (corona, flares, the tag
decorations; sized by an argument), and nothing else — `starmapScene`'s own header says
"Deliberately independent of scene.ts".

**Do not "unify" them.** They differ in what a coordinate MEANS (§2, §3). What they should share is
vocabulary and geometry helpers, and those already live in `lib/map/`.

**Ownership of the third renderer:** the GM's 2D orrery is `components/SystemVisualizer.svelte`
(canvas) and the GM's 2D starmap is `components/Starmap.svelte` + `components/Grid.svelte` (SVG).
Four spatial views total. A change to overlays usually touches all four.

## 2. Axis convention, memorised once

Physics/map frame is `(x, y)` in the reference plane with `z` out of it. Scene frame is three's, with
**y as up**. The mapping everywhere is:

```
physics (x, y, z)  ->  scene (x, z, y)
map     (x, y, z)  ->  scene (x, z, y)      // the starmap's z is depth, drawn as height
```

`toSceneAbsolute` in `holo/floatingOrigin.ts` is the canonical implementation. The starmap's `toScene`
in `setData` does the same by hand. **The starmap's plane IS the system's reference plane** — that is
a convention, not a derivation; there is no other frame relating them, and G9's sky relies on it.

## 3. FLOATING ORIGIN: `(0,0,0)` is not the star

`holo/scene.ts` rebases the origin under the camera (`maybeRebase`, `rebaseOriginBy`). Consequences:

- **Never store a drawn scene coordinate and expect it to stay valid.** Anything static keeps a
  float64 ABSOLUTE master and is re-emitted on rebase — see `gridAbs`, `gridLabels`, `orbitRings`.
  `addGridLines` exists to do exactly this bookkeeping; use it rather than adding a raw `Line`.
- The far-field sky (§7) sidesteps all of it by being a DIRECTION on a fixed-radius sphere added to
  `scene`, not to `contentGroup`. That is why it was cheap. Prefer that trick for anything at infinity.
- `controls.target.length()` IS the drift, because the target is expressed in rebased units.

## 4. RADIAL COMPRESSION: the system view is nonlinear by default

`compressRadius(r, map)` blends linear and log by `compression`, **default 0.65** (`DEFAULT_COMPRESSION`).
`compressScalar` is the scene's bound form; `expandRadius` (added for G10) is the numeric inverse,
which **bisects the forward map** rather than inverting the algebra so the two cannot drift.

What this means in practice, and it is the trap:

- **Equal steps in AU are NOT equal steps on screen** unless compression is 0.
- A **square grid** is therefore exactly right only at true scale. The metric ground grid draws lines
  at whole-AU coordinates mapped through `compressScalar`: exact along each axis, cells narrowing
  outward, which matches the orrery beneath. The mathematically exact image of a square grid under a
  radial map would be CURVED; straight lines at compressed positions are the readable approximation.
- **Polar rings are the overlay that stays exactly right under compression.** Reach for `scaled` when
  precision matters. Say so if anyone asks why the grid "looks uneven".
- `rMax` is the outermost orbit and normalises the map. It is NOT the semi-major axis of the outermost
  planet — in bundled Sol it is the Kuiper belt's outer edge, ~41.2 AU. Do not assume it.

## 5. GRID GEOMETRY: three generators, and they are not duplicates

| Thing | Where | Space | Cell |
|---|---|---|---|
| Lattice (square/hex/subsector/Traveller) | `map/latticeGeometry.ts:latticeFor` | MAP units | CONSTANT |
| System ground grid (AU metric) | `holo/scene.ts:buildMetricGrid` | compressed radial | a real distance |
| Nice steps / rings / labels | `map/niceInterval.ts` | unitless | — |

**`latticeFor` cannot express the system's AU grid** (constant cell vs nonlinear space). That is not a
missed chance to share; it is two different objects. Said here so it is not "fixed" into one.

**`niceInterval` has TWO sequences on purpose:**
- `gridLevels()` returns **DECADES** because a crossfading grid needs NESTED levels — every coarse
  line must also be a fine line. Consecutive 1/2/5 rungs are not integer multiples (5→2 is 2.5×), so
  the ladder cannot do it and powers of ten can, exactly.
- `niceStep`/`niceSeries` return the **1/2/5 ladder** for rings and labels, where nothing nests and the
  finer ladder gives a better choice of round number.

Getting that backwards is the first mistake anyone will make here; a test asserts the nesting.

**Per-vertex falloff needs SEGMENTED lines** (inbox A37): a fade evaluated at a full-width line's ends
judges the whole line by its far ends and culls it. But segment ONLY when the falloff dial is on —
with it at 0, `addGridLines` writes no colour attribute and the pieces buy nothing (65,440 → 1,604
vertices on the fine level).

## 6. THE STARMAP SCENE DOES NOT KNOW ITS OWN SCALE unless you tell it

`extent` inside `starmapScene` is in **MAP units**. `distanceUnit` is only a label SUFFIX. Before G10
the scaled polar rings printed map coordinates with " ly" after them — 1091 ly across a 25 ly
neighbourhood, a factor of 43. `setDistanceScale(pixelsPerUnit)` now feeds the conversion, wired from
`Starmap3DView`.

**Anything new that prints a distance in this file must go through `pixelsPerUnit`.** The one
authority on inter-system distance is `map/systemDistance.ts` — use it; it also owns the campaign's
`ignoreZForDistances` choice. (The SKY ignores that flag deliberately: a direction is inherently 3D.)

## 7. THE SKY (G9) — far-field, and what makes it honest

`map/skyStars.ts` turns charted systems into stars: direction is a vector difference, brightness is
`radiationOutput` (**which IS luminosity in solar units** — do not recompute it from radius and
temperature) through the distance modulus, colour is `starColorFromTempK`.

- **Colour must NOT come from `getPlanetColor`.** That is a per-class signal swatch chosen to be
  legible on a map, and it reads a Svelte store. A star in a sky is showing you its photosphere.
- One point per SYSTEM, not per star: a pair a few arcseconds apart is one point to the eye. Light
  adds, colour is the dominant star's, black holes are skipped.
- **Modes are a claim, not a decoration.** `true` stops at the naked-eye limit because it claims to be
  a sky. `marked` shows everything because a diffraction spike is an INSTRUMENT artifact and announces
  itself as annotation. `magnitudeLimitFor(mode)` is where that decision lives, once.
- **The sparsity number, so nobody re-derives it:** a 45° field is **3.8% of the celestial sphere**. 13
  naked-eye systems put an expected HALF A STAR on screen; measured in the default framing, zero. All
  41 give ~1.6. On a 42-system map this reads as "there is Sol" and not as constellations. It comes
  alive on a campaign map with hundreds of systems.
- Self-checking: Sol from Alpha Centauri ≈ 0.5, from Tau Ceti ≈ 2.6, and from Sol the five brightest
  real stars land within 0.35 mag. Asserted in `skyStars.spec.ts`. If you touch the chain, they tell you.

## 8. DEPTH, TRANSPARENCY AND THE FILTER — the occlusion trap

Fully in engine-map **RENDER-S20**; the short form:

- three draws the whole TRANSPARENT pass AFTER the opaque one. **`renderOrder` only sorts WITHIN a
  pass.** A transparent backdrop sprite with `depthTest: false` paints over every body, whatever its
  order. Far-field sprites use `depthTest: true, depthWrite: false` — what the generic starfield has
  always used.
- **Camera `near` is `min(0.01, dist*0.02)` with a 1e-11 floor** (RENDER-S4). Below about 1e-4 the
  depth range collapses and everything past a few units quantises onto the far plane, so far-field
  sprites stop drawing. The generic starfield shares the limit, so they fail together.
- **Two render paths:** `composer.render()` when a filter or lensing is on, `renderer.render()` when
  not. Same scene, same camera, and `EffectComposer`'s target carries a depth buffer, so occlusion is
  filter-independent. Verified; do not assume it for a NEW pass that renders to its own target.

## 9. LABELS are in-scene sprites, and why

Body/grid/route/sky labels are canvas-textured sprites in the scene, NOT DOM. That is deliberate: the
GPU filter warps and tints them in lockstep with the 3D. A CSS label would sit outside the filter and
look wrong under CRT/night-vision.

- `makeGridLabel(text, worldHeight, depthTest)` **measures the text**. It used to be a fixed 128×40
  canvas sized for "5 AU" and silently truncated anything longer — constellation names need up to
  224px. Never assume a label fits.
- `depthTest` defaults FALSE (a ground-plane scale readout should stay legible through a body) and the
  sky passes TRUE (a name floating over a planet whose star is hidden labels empty sky). Both are
  right; the flag exists because they differ.
- Screen-px sizing converts against the live camera and viewport, so a window resize must REBUILD.

## 10. ONE OVERLAY VOCABULARY, filtered — never a second union

`map/mapOverlay.ts` is the vocabulary for all four views. The legacy 3D spellings
(`off/plain/scaled/hex`) are kept VERBATIM because every saved preset carries them.

- Subsets are **filters, never copies**: `SYSTEM_OVERLAY_OPTIONS` (no hexes — hexes address
  interstellar space), `SNAP_GRID_OPTIONS` + `SnapGridType` (lattices only; the SVG grid has no
  distance rings). Add a value to the master list and every picker gets it.
- `normaliseOverlay` is the ONE translator for anything ever persisted, including the 2D snap grid's
  old `'grid'`/`'none'`. Storage migrations belong in `starmapUiStore.migrate` beside the Traveller
  split, using it — not a second mapping.
- **`mapGrid.type` on the player broadcast still speaks the LEGACY spellings on purpose.** It crosses
  to player windows and VTT shims on older builds and the receiver only tests "is there a grid".
  `toLegacyMapGridType` is the single named adapter at the two send sites. Do not rename the wire.
- This drifted for 300 versions: `subsector-hex` shipped to every player view at v2.1.378 and never
  reached the GM's own map, because its list was hand-written (A45). That is the failure mode.

## 11. When the Browser pane will not composite — and it often will not

Screenshots time out for worker sessions constantly, but the page still runs JS. This is how the
route/grid/sky work was proved without ever seeing it:

1. `fetch('/src/lib/holo/scene.ts')` returns **Vite's transformed source**; its rewritten import gives
   the exact `/node_modules/.vite/deps/three.js?v=…` URL. Import THAT and you hold the same THREE
   instance the module uses.
2. Patch `THREE.Object3D.prototype.add` to record everything a builder emits, then call the real
   controller. You can read positions, materials, opacities and geometry straight off the objects.
3. For PIXELS when `requestAnimationFrame` is dead (`document.hidden`), walk to the live scene + camera
   from any captured object, make **your own `WebGLRenderer` on your own canvas**, and
   `render(scene, camera)` yourself. Occlusion happens in the render pass, so this tests the real thing.
   Wrap it in an `EffectComposer` to test the filtered path.

**Never `await requestAnimationFrame` when the pane is hidden — it never fires and the call hangs.**

What this cannot tell you is whether the result LOOKS right. Say so, and hand back a short list of
what needs eyes.

## 12. Shared working tree — the process trap that cost the most

Several sessions share one checkout AND one git index. `git add` then `git commit` as two separate
tool calls is not atomic: one session's staged files land in another's commit. It happened four times
in one day. Mitigations, in order: stage and commit in ONE invocation; check `git log -1 --stat`
after committing rather than trusting the push; and **never `git checkout <ref> -- <file>` on a shared
file without backing up the worktree copy first** — it silently destroys another session's
uncommitted work (done once here, and restored from a backup taken seconds earlier).

---

## Known open, in these files

- **The decade crossfade was BROKEN, found by arithmetic (A55, v2.1.852-beta): two peaks popped
  the surviving lines 0.30 -> 0.42 at every handover, and the build skipped a level under 2% — which a
  fresh decade's fine level always is — so nothing faded in and the next decade arrived in one frame.
  One law now (`niceInterval.gridLevelOpacity`), both levels always built, a frame-loop test pins it.**
  Still never SEEN: zoom the 3D system view through a decade and say whether it reads as one grid
  fading, and push Star boost to 100% and say whether it is usable (numerically continuous; it
  saturates at the top by design).
- **The starmap's star glyphs are SCREEN quantities now (G26/C17, RENDER-S27)**: sized per frame at the
  star's camera-space depth, members offset along the camera's right/up. Never a world constant again.
- `Grid.svelte` draws subsector borders from its own zig-zag path maths, while the 3D starmap draws
  them as ribbons from `subsectorLattice`. Two geometries for one boundary — not yet compared.
- The system view's `plain` polar is still six even decorative rings (unlabelled, so it claims
  nothing). If it is ever labelled it must move to `niceSeries` like `scaled` did.
