# G3 ship models - handoff to a fresh session

Written 2026-08-05 at v2.1.446-beta by the session that built G3. Handing over because that
session's context was full and it had started reasoning from memory instead of from the code.
**Treat every conclusion below as a claim to re-verify, not as fact.** The last thing that
session asserted - "the sizing is correct, the screenshot was from an old build" - was rejected
by the owner with "it does not work". That assertion is the most likely thing to be wrong.

## 1. Establish the symptom before reading anything else

Do not assume you know what is broken. The owner reported "it does not work" against a build
where the previous session believed ship rendering was finished. Ask which surface and what is
seen: GM 2D map, GM 3D holo, player 2D, player 3D, or the info-block portrait; and whether the
ship is absent, an icon instead of a hull, or the wrong size.

**Then read section 8 first.** The owner captured a debug trace after this note was written and
it narrows the sizing fault to one condition in one function. Start there, not from scratch.

**Then measure it. Do not judge from a screenshot.** In any view with the 3D scene running:

    window.__shipDebug = true

That logs, per construct per frame, the true hull length in scene units, distance to camera, the
pixel floor being applied and the size actually drawn (`onScreenPx`). Four separate wrong
diagnoses in the previous session came from inferring size from images; the one time it was
measured, the answer arrived in a single line of output.

## 2. Read, in this order

1. `docs/dev/observations-inbox.md` - the LIVE board. Item **G3** is the feature; its closing
   note lists what shipped and what no human has ever looked at. Everything else on the board is
   other people's territory unless the coordinator says otherwise.
2. `docs/dev/engine-map.md` - subsystem ownership and hard-won rules. The ones that matter here
   are **RENDER-S1..S8** and **DATA-M1..M4**. RENDER-S7 and RENDER-S8 exist because of this
   feature and both were paid for in wasted hours.
3. `docs/dev/ship-appearance-design.md` - the G3 design. Section 11 records the owner's five
   binding decisions (meshoptimizer accepted, 500 KB warn / 2 MB hard caps, NASA-only starter
   set, CC0 and CC-BY both allowed so attribution must be plumbed, scene marker is in scope).
4. `docs/dev/architecture-physics-tags-visuals.md` - the standing rule that physics emits tags
   and renderers read only tags plus look-data. Applies if you touch appearance derivation.

## 3. What is already built - do not rebuild it

- **Import pipeline**: `src/lib/constructs/modelImport.ts` (format sniff by magic bytes; GLB,
  STL, OBJ), `modelConvert.ts` (pass-through keeps a compliant GLB byte-identical; simplifies
  above ~30k triangles; enforces the caps), `modelStore.ts` (hash-addressed IndexedDB store
  `sse_model_store`, requests storage persistence on first write).
- **`ModelRef`** in `src/lib/types.ts`. Two mutually exclusive addressing modes and the
  distinction matters: `url` = a BUNDLED model under `static/models/nasa/`, referenced never
  copied, so it costs nothing in storage, saves or broadcast; `hash` = a GM upload living in
  IndexedDB. `src/lib/constructs/modelSource.ts` resolves either.
- **Rendering**: `src/lib/constructs/modelViewer.ts` is THE builder - `buildDisplayModel()` is
  shared by the import dialog and the info-block portrait so the two cannot drift. Seven
  finishes, three of them seeded procedural liveries with a derived contrast accent.
- **The scene marker**: `src/lib/holo/scene.ts`, `updateConstructs()`. This is where the
  suspicion should fall. See section 4.
- **Save bundles**: `src/lib/io/bundle.ts` and `attributions.ts` - `.sse.zip` for campaign and
  single-system saves, assets as real files, `ATTRIBUTIONS.md` generated from the provenance
  fields.
- Tests live beside their modules; `npx vitest run src/lib/constructs/` is 91 green as handed
  over. `src/lib/constructs/modelLoadRace.spec.ts` and `shipScreenFloor.spec.ts` encode two of
  the regressions - if you change loading or sizing, expect those to be the ones that speak up.

## 4. The scene sizing model, and why it is the prime suspect

A real ship is microscopic next to a planet, so the scene applies a screen-space floor: never let
a hull draw smaller than `SHIP_MODEL_IDLE_PX` (7 px), or `SHIP_MODEL_MIN_PX` (14 px) when
focused. The conversion is

    minWorld = minPx * f * distToCamera,  where f = 2 * tan(fov/2) / viewportHeight
    drawn    = max(trueLength, minWorld)

The floor is deliberately RELEASED when the camera is framing that specific ship
(`framingThis`), because otherwise the hull sat at a fixed pixel size while the camera flew
towards it and zooming felt dead. Body-size dial blending is geometric:
`true^(1-v) * readable^v`.

Known interactions that have bitten before: the scene uses a **floating origin** (see
`project_sse_v2_floating_origin` notes - `(0,0,0)` is the camera focus, not the star); the near
plane has a `1e-11` floor; and models attach through `parsedHullCache` because snapshot-driven
rebuilds used to starve the async load for ships in transit.

## 5. Traps, in the order they cost time

1. **Never swallow an exception on the path that decides whether something renders.** Ships
   appeared as icons everywhere for four diagnosis rounds because `applyExhaustColour` was left
   reading the pre-multi-nozzle shape, threw, and a silent `catch` ate it. Both catches now
   `console.warn`. Open a real player view and read the console before theorising.
2. **`npm run build` is the gate, not `svelte-check`.** The build does not typecheck; svelte-check
   has ~1357 pre-existing errors and is useless as a signal. Runes-mode `$:` and bare `let` pass
   dev and fail the Vite build.
3. **TypeScript will not catch a deleted interface method** if you replace a span of a factory
   function. That produced `setOrient is not a function` at runtime. There is now a structural
   surface test in `modelViewer.spec.ts`; keep it.
4. **The broadcast layer re-stringifies the whole snapshot** on change, so binaries must never
   ride on a node. Models travel by hash or url, never as bytes.
5. **Player redaction**: `slimNode` in `src/lib/system/utils.ts` strips `scheduled_journeys`.
   Drive plumes needed burn data on the player side, so `driveBurns` (compact form, see
   `shipBurn.ts`) is attached before the strip. That edit crossed into redaction-boundary
   territory and deserves a second pair of eyes - confirm nothing GM-only leaks with it.
6. **Framing must use the cached `frameRadius`**, measured once from the hull. Re-measuring the
   live object in `frameCamera` pulls in the plumes and the ship shrinks whenever it burns. A
   test forbids any live `setFromObject` there.

## 6. Never verified by a human

The previous session shipped these on tests alone: a two-nozzle ship's plumes in the info-block
portrait; a ship mid-burn on the player map (length, brightness and the brake flip); a model
inside a CRT-filtered player view (the A38 capture path); a live `.sse.zip` export/import round
trip including `ATTRIBUTIONS.md`; the matcap/blueprint/plated/patina finishes on a real hull;
`-occ` wireframe occlusion. The owner has offered to eyeball things - use that, ask for one
specific check at a time.

## 7. Working rules for this repo

- Beta channel: **push every green build without asking**. Production stays explicit approval.
- `npm run build` green before every push. Bump the patch version and add a terse one-line
  changelog entry per push while a design is in flight. Docs-only changes need no bump.
- Commit as **FrunkQ <frunk@frunk.net>**, never the account email. Stage explicit files - another
  session drops work into this tree, so never `git add -A`. Pull with `--rebase --autostash`.
- UK English in UI, docs and new code. No emoji in docs. Do not write the owner's name into files.
- One worker session at a time plus a coordinator that owns the inbox. Stay inside G3's territory
  (`src/lib/constructs/**`, the construct parts of the scene, the model UI) unless told otherwise.
  G14 (remote players) is VTT territory - leave it alone.

## 8. Measured trace from the owner, 2026-08-05, v2.1.446-beta - THE LEAD

A focused construct in the 3D scene, many consecutive frames, abridged:

    [shipdbg] sol-rocinante {"shipLen":1e-10,"dist":0.7130612925,"viewH":1215.515625,
      "bodySize":0,"minPx":14,"framingThis":false,"inFocus":true,
      "drawn":0.006803754932,"onScreenPx":14}

What is measured, not inferred:

- `onScreenPx` is pinned at exactly **14** on every frame - the ship is drawing at the focused
  pixel floor, i.e. as a speck, and the hull's true size is contributing nothing.
- `inFocus` is **true** but `framingThis` is **false**. The floor's release condition did not
  fire even though this is the focused construct.
- `dist` drifts downward across the trace while `onScreenPx` does not move at all.

The arithmetic, which makes this conclusive rather than suggestive. The trace gives
`viewH = 1215.52`; from an earlier capture `f * viewH = 0.8285`, so the scene runs a 45 degree
vertical fov and `f = 6.816e-4`. While the floor binds,

    drawn = minPx * f * dist        ->  onScreenPx = minPx, identically, at EVERY distance.

Check against the trace: `14 * 6.816e-4 * 0.71306 = 6.8037e-3`, which is `drawn` to five figures.
**So while the floor binds, zooming cannot change the ship's apparent size - not slowly, not at
all.** That is the dead-zoom the owner has been describing.

The true hull only takes over when `trueLen > minPx * f * dist`, i.e. at

    dist* = 1e-10 / (14 * 6.816e-4) = 1.05e-8 scene units,

against a current camera distance of 0.713 - about **seven orders of magnitude** closer than the
camera is. Unless the orbit controls permit a distance of ~1e-8 units, true scale is unreachable
by zooming and the ONLY escape from the floor is the `framingThis` branch.

`framingThis` is `focusedId === b.id && followEngaged && !framingWhole` in `updateConstructs()`
(`src/lib/holo/scene.ts`). The trace shows the first conjunct satisfied and the result false, so
**`followEngaged` is false, or `framingWhole` is true, when a user simply selects a ship and
zooms.** The release was written for follow mode; the owner is not in follow mode. That single
condition is the most likely whole cause of "it does not work".

Two things to settle before changing it, because the fix is a design choice and not a one-liner:

1. **Can the camera actually get to ~1e-8 scene units?** Check the orbit controls' minimum
   distance and the near-plane floor (`1e-11`). If the controls clamp well above that, then
   releasing the floor makes the ship vanish rather than grow, and the answer is a graduated
   floor - ease `minPx` out as the camera closes - not a hard release.
2. **Is `shipLen: 1e-10` measured or clamped?** It is suspiciously round. At this scene's
   normalisation that is roughly 50 m, which is right for a Rocinante, so it is probably real -
   but confirm it against the construct's stated length before trusting it, since a
   `Math.max(1e-10, ...)` guard would produce exactly this value for anything smaller.

Do not "fix" this by raising `minPx`. A bigger speck is still a speck, and the complaint is that
the ship does not respond to the camera.
