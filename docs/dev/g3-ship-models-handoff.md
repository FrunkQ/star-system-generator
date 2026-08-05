# G3 ship models - handoff to a fresh session

Written 2026-08-05 at v2.1.446-beta by the session that built G3, and **RESOLVED at
v2.1.447-beta** by the session it was handed to. The sizing fault is found, fixed and measured.

The permanent record is [[RENDER-S9]] and the amended [[RENDER-S8]] in `docs/dev/engine-map.md`,
plus the reopening note on **G3** in `docs/dev/observations-inbox.md`. This file is kept only for
the parts that are still live: what exists (section 3), the traps (section 5), what no human has
looked at (section 6) and the working rules (section 7).

## 1. RESOLVED - what was actually wrong

`buildDisplayModel` normalises a hull to a unit long axis, but returned that normalised group
DIRECTLY whenever the ModelRef carried no `orient`. `scene.ts:attachShipModel` then called
`g.scale.setScalar(sceneLen)`, which overwrote the normalisation instead of composing with it, so
the hull drew at `native x sceneLen`. The bundled ISS normalises by 0.039 and therefore drew
**25.6x oversize** - a 109 m station spanning a fifth of an AU - with nothing selected and no zoom
involved. A ModelRef WITH an orient took a wrapper path and was correct, and the error factor is
each model FILE's native size, so different models were wrong by different amounts in either
direction. That is why it presented as "sometimes too close, sometimes too far, inconsistent".

Fix: `buildDisplayModel` always returns an outer group whose transform belongs to the caller.
Pinned by `modelViewer.spec.ts` ("leaves its own transform free for the caller"), mutation-checked.

**The instrument was lying, which is why the previous session concluded the opposite.**
`window.__shipDebug` printed the size the code INTENDED (`drawn`/`onScreenPx`), not the size of the
object: it reported a serene `onScreenPx: 7` while the hull was really 204 px across. The section-8
arithmetic below was sound to five figures - about a quantity that was not what the screen was
showing. The hook now also prints `measured`, `measuredPx` and `ratio` taken from the hull's real
world extent; **read `ratio` first, and if it is far from 1 the fault is upstream of the floor.**

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

## 4. The scene sizing model (it was NOT the fault - see section 1 - but this is still how it works)

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

Added at v2.1.447-beta: the size fix was measured on the BUNDLED ISS only, so a GM-UPLOADED model
(the `hash` path) has not been checked; and the drive plume now sits at the stern rather than the
hull's centre, which no one has seen yet.

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

## 8. SUPERSEDED - the trace below was a red herring, kept as a worked example

**Everything in this section is arithmetically correct and led nowhere**, because it reasons about
`drawn` - the size the code intends - while the hull on screen was 25.6x bigger than that. The
floor-release condition it fingers as "the most likely whole cause" was innocent. With the hull
correctly sized, selecting a ship engages follow, `framingThis` becomes true, the floor releases
and the camera reaches 1.1e-9 scene units, so the controls DO permit true scale (the section's own
open question 1). Open question 2 also resolves: `shipLen` is real, not clamped - a 46 m hull at
true scale genuinely lands near 1e-10, though note that anything smaller does hit the
`Math.max(1e-10, ...)` guard, so relative ship sizes stop being honest at the very bottom of the
dial. That is a separate, unreported issue.

Kept verbatim because it is the clearest example in this repo of a measurement that is impeccable
and still wrong: it never asked whether the number being measured was the number on the screen.

## 8a. Original trace from the owner, 2026-08-05, v2.1.446-beta

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
