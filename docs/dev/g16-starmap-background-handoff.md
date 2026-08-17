# G16 — Your own map behind the stars: handoff

Written 2026-08-17 by the coordinator from inbox [[G16]] (which carries the owner's words and every
decision already taken), with the code claims below re-verified in the tree at v2.1.748-beta. The row
is the history; this is the brief. It is in the welcome list as `coming` ("Your own map behind the
stars", `WelcomeModal.svelte:69`) — the flag comes off only when the owner has seen it work.

**One sentence:** let a GM put their own image behind the 2D starmap — a sector map, empire borders —
either SCREEN-FIXED (decoration, like today's Milky Way) or MAP-FIXED (georeferenced: it holds
registration with the systems as you pan and zoom), with scale, offset, fade and probably rotation; on
the GM map AND the player 2D map; the anchor values travel with the preset and the broadcast; the
image travels in the save bundle with its credit; the About credit follows what is actually shown.

## Owner decisions already taken — do not re-open

- 2D GM map and 2D player map: YES. **3D: NO** — a flat image warps on a sphere; the 3D map keeps its
  procedural starfield and the two views diverge deliberately.
- **MAP-FIXED mode is the main job, not the sliders.** "The stars stay in a constant position to the
  background — for sector maps and empire borders." Both modes wanted; a toggle; default screen-fixed
  (the Milky Way should not slide about as you pan).
- **No hex registration.** "Don't worry about the hexes — why would they put them on if they already
  have them." No origin/pitch offset against the generated grid; the picture simply sits behind.
- Sequenced after A48 (done, v2.1.7xx) — the player preset editor is now grouped by job, so the new
  controls land in a section, not on the flat wall.
- Rotation: open — recommend offering it (a scanned sector map is rarely square to the axes); say so.

## What is true in the tree today (verified 2026-08-17)

**GM 2D map.** `src/lib/components/Starmap.svelte:2079` `background-image: url('/images/ui/MilkyWay.jpg')`
— a CSS background on the CONTAINER, i.e. attached to the viewport, outside the world transform. That is
why it stays still while stars move. The world transform is `:1224`
`<g transform={translate(${panX}, ${panY}) scale(${zoom})}>`; pan at `:547`. A GM-local toggle
`starmapUiStore.showBackgroundImage` (`src/lib/starmapUiStore.ts:12`, picker `SettingsModal.svelte:350`)
switches the CSS class at `:1216`, and `:220-221` forces it off when the display is inverted. **Nothing
about the background is stored on the campaign today** — it is chrome, and G16 makes it CONTENT.

**Player 2D map.** `src/lib/starmap/Starmap2DView.svelte:50` is an SVG with a FITTED viewBox
(`viewBox="0 0 {view.W} {view.H}"`, `xMidYMid meet`), no pan/zoom group. So on that surface an
`<image>` in viewBox units IS map-fixed for free, and screen-fixed means a CSS layer behind it. Same
feature, different mechanics per surface — say which is which in the code.

**The player preset ALREADY has an overlay-graphic mechanism, and G16 extends it rather than adding a
second.** `src/lib/player/presetTypes.ts`: `PlayerAsset { id, name, dataUrl }` (uploaded images stored on
the starmap as data URLs, referenced by id from any number of presets); `GraphicPlacement { assetId, pin,
sizePct, opacity, stretch }` (`:~40`); `starmapOverlay: GraphicPlacement | null` (`:116`), edited by
`GraphicPlacementControls` in `PlayerPresetEditor.svelte:684-685`, rendered by
`routes/catalogue/+page.svelte:643-644`. `opacity` IS "fade". **So the screen-fixed player half largely
exists.** What is missing: an ATTACHMENT mode (`screen | map`), and for `map` a width in MAP UNITS
(light years / parsecs — georeferencing, not a percentage), an offset in map units, and rotation.
Extend `GraphicPlacement` (or a `MapAnchor` alongside it) — do not invent a parallel type. Check where
the overlay draws in the stack: for a background it must draw BEHIND systems and routes, inside the
same transform, which is what makes registration automatic.

**The GM map has none of this**, and the right move is to give it the SAME placement type stored on
the campaign (the starmap document), so one type serves both surfaces and one editor shape edits both.
The GM's current `showBackgroundImage` toggle becomes "no image / default Milky Way / this asset".

**Two asset systems already exist and G16 must not add a third — flag this as a finding.**
`PlayerAsset` (data URL on the starmap, preset side) versus `ImageRef` (`src/lib/types.ts:65`:
`url, title, credit, license, sourceUrl`, with the `.sse.zip` bundle writing `assets/images/<nodeId>.<ext>`
and `ATTRIBUTIONS.md` — `src/lib/io/bundle.ts:14, :25, :134-140`; DATA-M1: a binary never rides the
node). The G16 row's original instruction was to reuse `ImageRef` + bundle; the preset work went data-URL
in the meantime. **Pick one deliberately, and carry credit/licence/source either way** — a user-uploaded
sector map is precisely the case `ATTRIBUTIONS.md` exists for. Recommendation: keep the preset's asset
store as the ONE store for uploaded images (it already round-trips with the campaign and reaches
players), add the three provenance fields to `PlayerAsset`, and write the duplication with `ImageRef`
onto the board as its own item rather than resolving it here.

**Attribution is a licence CONDITION.** `AboutModal.svelte:52` hardcodes "Starmap Background: Courtesy
of ESO/L. Calçada & S. Brunier, CC BY 4.0". The moment a GM's own image is shown, that sentence is
false; the moment the default is shown, it must be true. Make the About line follow what is displayed,
and give an uploaded image its own credit line.

**Player parity is a CORRECTNESS requirement in map-fixed mode.** A player whose copy is out of
registration is looking at a WRONG map — borders in the wrong place. The anchor (scale, offset,
rotation, mode) rides the preset (`SYNC_PRESET`, `broadcast.ts:61`) exactly as `starmapOverlay` does
today. Check how `PlayerAsset`s currently reach the player and reuse that path; a sector map is a large
image, so measure the payload with the `bc.*` meters (RENDER-S22) and say what you saw.

**Watch for a second spelling of "fade":** `holo/holoStyle.ts` carries `constellationBoost` ("0 true
brightness .. 1 backdrop faded") on the 3D side, and [[G9]] shipped Star-boost / Name-size dials.
Reuse the word or say out loud that it is a different quantity.

**A4's lesson runs in reverse here and is worth reading:** A4 had to DIVIDE zoom out of label fonts
because they sat inside the world transform; G16 deliberately wants the image INSIDE it. Same trap
family, opposite sign — labels stay screen-sized, the image scales.

## Scope

IN: GM 2D map + player 2D map; upload (reuse the existing asset upload); mode toggle; screen-fixed
controls = size %, fade (today's `sizePct`/`opacity`); map-fixed controls = width in map units, offset
X/Y in map units, rotation, fade; default Milky Way as the shipped example (its credit intact);
round-trip through save/bundle/load; preset + broadcast carry the anchor; the About line follows the
displayed image; the player-2D `user-select` check from [[A49]] while you are in that component (one
CSS line if the drag selects labels).

OUT: 3D (decided), hex registration (decided), image editing/cropping, multiple layers.

## Acceptance

- GM map: pick a sector-map PNG, choose map-fixed, set width 40 ly, offset (x, y): pan and zoom — a
  named system stays on the same pixel of the image at every zoom. Choose screen-fixed: the image
  holds still while systems move (today's behaviour). Toggle back and forth without losing the anchor.
- Player 2D map on a preset carrying the same asset and anchor: the same system sits on the same
  image feature as on the GM map (registration parity). Change the anchor on the GM side; the player
  follows on the next preset sync.
- Save as bundle, reload on a clean profile: image, mode, anchor and credit all survive. Save as plain
  JSON when no image: nothing new appears.
- Default state (no upload): the Milky Way shows exactly as today, About credits ESO exactly as today.
  Upload state: About credits the upload (or says "uploaded by the GM, no credit given") and no longer
  claims ESO for the background.
- Rotation (if built): 15° on a rectangular image; corners land where the maths says.
- Inverted display still forces the background off (`Starmap.svelte:220`), or you have decided
  otherwise and said why.
- Meter the preset broadcast with a 2 MB image; report `bc.SYNC_PRESET.bytes`.
- Player 2D: drag across labels does not text-select them (A49's open half).

## Deliverables

1. Type extension + one editor control group used by both surfaces; GM storage on the campaign.
2. Rendering: GM `Starmap.svelte` (`<image>` inside the `:1224` group for map-fixed; CSS layer for
   screen-fixed), player `Starmap2DView.svelte` likewise; behind systems and routes.
3. Save/bundle round-trip test extended (`src/lib/io/bundle.spec.ts`); a preset broadcast test.
4. About line made dynamic; ATTRIBUTIONS covers the upload.
5. ONE engine-map entry (`UI-<next>` or `DATA-M<next>`): map-fixed images live INSIDE the world
   transform and their anchor is campaign content that must ride preset, broadcast and bundle.
6. New inbox item for the PlayerAsset-vs-ImageRef duplication, located by file and line.
7. Changelog line after "All notable changes are listed here:", version bump, build green, push beta;
   G16 row updated; `WelcomeModal.svelte:69` flag removed ONLY after the owner has seen it.
8. Documentation-debt line: the GM guide needs "your own map behind the stars" explained.

## Rules that will bite

- `Starmap.svelte` was just edited by the A45 session; `git pull --rebase origin beta` before you start
  and again before you push.
- Never assume a Sol/Earth baseline — irrelevant here except in one place: map units are the
  campaign's own unit (`Starmap.scale.unit`, see [[A43]] which is in flight in the same session), not
  light years by assumption.
- Verify in the browser at desktop AND at the mobile preset; if the pane will not composite, say
  exactly what a human must look at (a system on a sector-map feature at two zooms is a ten-second
  check for the owner).
- What the product IS — whether the GM's background is per-campaign or per-preset, whether rotation
  ships — recommend, then ask.
