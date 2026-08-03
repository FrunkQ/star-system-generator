# Ship appearance: lightweight 3D models for constructs

Design investigation for inbox item G3 (raised 2026-08-01). Investigation only — nothing here is
built. Companion questions: A30 (what a construct shows in the info block today: nothing) and F1
(body graphics must never appear on the system map).

## Summary and recommendation

**Format: GLB (binary glTF), compressed with meshopt or Draco. STL and OBJ are accepted as
import formats and converted to GLB at upload; neither is ever stored or bundled.** Measured on
identical ~30k-triangle geometry (NASA Voyager model): Draco GLB 111 KB, meshopt GLB 435 KB,
binary STL 1,461 KB — and the STL carries no materials, no UVs, no normals, no units and no
hierarchy. Every loader and decoder needed (GLTFLoader, DRACOLoader + its WASM, the meshopt
decoder, STLLoader, OBJLoader) already ships inside the existing `three@0.169` dependency:
zero new packages.

**The primary use case is user-uploaded science-fiction ships, and the design is weighted
accordingly (owner steer, 2026-08-01).** The abundant supply of fan SF hulls is printing STLs
(Thingiverse, Printables, Cults3D) and mixed-quality Sketchfab GLBs — which is precisely why
the import pipeline (accept STL/OBJ/GLB, convert, simplify, normalise) is the front door of
this feature, not a Phase 4 nicety. A bundled CC0 starter set (NASA real craft, Kenney,
Quaternius — all licence-verified below) remains worthwhile so a fresh campaign is not empty,
but it is the garnish. User-supplied models have no licence constraint on our side — a GM may
load anything they are entitled to use; their campaign, their files.

**Where it renders: both surfaces, differently — and this is not an F1 violation.** The info
block gets a model viewer (a lit turntable, exactly the slot the 3D body globe already
occupies). The 3D system scene may draw the model **as the construct's marker** — replacing the
sprite glyph, at the same screen-space size, under the same focus rule — because unlike a
photo pasted onto the map, the model *is* the honest render of the thing's shape, which is what
the map draws for every body. The 2D plan view and the starmap keep the icon glyph. A
GM-uploaded photo stays info-block-only, exactly as F1 demands.

**The cheap interim (A30) should proceed now, independent of all of this:** draw the
construct's authored `icon_type`/`icon_color` glyph at info-block size. It is the honest
picture the map already shows, it needs no new data, and it removes the blank today.

---

## 1. Grounding: what exists

How a **body** gets its picture: `image?: ImageRef` (`types.ts:308`) — `url`, plus `title` /
`credit` / `license` / `sourceUrl` provenance fields and `custom` marking a GM upload the
processor will not overwrite. Uploads go through `fileToDownscaledDataUrl`
(`src/lib/util/imageUpload.ts`): downscaled to 512 px, stored as a JPEG **data URL inline in
the node**, deliberately compact ("custom artwork is a nicety, not a full-res asset store").
The info block shows it via the `image` / `bodyDisc` blocks in `guideDocument.ts:114-130`;
`bodyDisc` mode `sphere` is a real lit three.js globe, so the document layer already hosts
live 3D.

What a **construct** has: the same `image?: ImageRef` upload path (`ConstructBasicsTab.svelte:20`),
an authored `icon_type` (square / triangle / circle / cross / diamond) and `icon_color`, a
free-form `class` string, and `physical_parameters.dimensionsM: [x, y, z]` — real dimensions,
which matters for scale later. On the 3D map it is a fixed-screen-size sprite of its icon glyph
(`holo/scene.ts:1825-1832`, cached per shape+colour at `:239`); it contributes no radius to
clearance or framing (`:1722-1724`). In the info block it shows nothing (A28 removed the wrong
picture; A30 left the right one undecided).

Infrastructure facts that shape the design:

- The campaign lives in **IndexedDB** (`starmapStorage.ts`) — quota is generous; storage is not
  the binding constraint.
- The player broadcast (`broadcast.ts`) chunks large payloads at 14,000 bytes for WebRTC — big
  data *can* cross. But `sendIfChanged` (`:250`) re-`JSON.stringify`s the **whole snapshot on
  every reactive tick** to dedupe, and any real change re-sends the **whole payload** (min
  interval 500 ms). Payloads already run to hundreds of KB; inline model data multiplies both
  the stringify cost and the resend cost. This is the binding constraint on how models are
  stored.
- `three@0.169` vendors everything needed: `examples/jsm/loaders/{GLTFLoader,DRACOLoader,
  STLLoader,OBJLoader}.js`, `examples/jsm/libs/draco/gltf/` (decoder JS + WASM) and
  `examples/jsm/libs/meshopt_decoder.module.js`. Verified in `node_modules`. No new dependency
  for any of Phase 1-3 below.

## 2. Format (Question 1)

Measured, not asserted. Spike method in the appendix; the subject is NASA's Voyager Probe (A)
model — 29,911 triangles, 89,733 vertices (flat-shaded, so welding does not reduce it), no
textures — with Juno (29,856 tris) agreeing within noise.

| Encoding (identical geometry) | Raw | gzip (what Vercel serves) |
|---|---|---|
| Plain GLB (indexed, normals, hierarchy, materials) | 2,290 KB | 463 KB |
| **GLB + Draco** | **111 KB** | **90 KB** |
| GLB + meshopt | 435 KB | 162 KB |
| Binary STL (same triangles, nothing else) | 1,461 KB | 231 KB |

Decoder cost, one-time and lazy-loadable: Draco WASM 188 KB; meshopt decoder ~15-30 KB JS.

- **glTF/GLB**: one file, PBR materials, UVs, named nodes/materials (the hook procedural
  tinting needs), scene hierarchy, units (metres by spec), two first-class compression
  extensions, and the industry default every source site exports. **Recommended.**
- **STL**: triangles only — the binary format is exactly 84 bytes + 50 bytes/triangle, with
  a 2-byte attribute slot no renderer uses. No materials, no UVs, no normals worth keeping
  (per-facet, recomputed anyway), no units, no parts. It is also systematically high-poly:
  across the 342 STLs in NASA's own repository the average file is 6.2 MB ≈ 126,000 triangles,
  because printing wants watertight density, not rendering efficiency. **The abundance
  argument is real but the format is the wrong tool for storage** — the right way to honour
  the abundance is to *accept* STL at upload and convert (see below).
- **OBJ**: text (~2-6× binary for the same mesh), MTL materials are pre-PBR and routinely
  broken in the wild, multi-file (obj + mtl + textures) so a single-file upload usually loses
  its materials. Accept at upload for completeness; never store.

**Conversion at upload, not storage of foreign formats — and this pipeline is the core of the
feature, since the primary use case is fan SF ships and those are mostly printing STLs.**
STL/OBJ parse to `BufferGeometry` via the vendored loaders; re-export as GLB (GLTFExporter is
also in three's examples). The typical fan STL is 1-10 MB and 100k+ triangles, so
simplification at import is effectively required, not optional — `meshopt_simplifier` lives in
the `meshoptimizer` npm package (MIT, ~50 KB), a new dependency this document recommends
accepting. Target ~20k triangles at import (visually fine at both info-block and marker
scale), with the original count reported so the GM knows what happened. Without the
dependency the fallback is a hard triangle cap with a "simplify it yourself in Blender"
message, which for the primary audience is a poor front door.

Two more import realities of wild files, handled at upload rather than discovered later:
- **Orientation and units.** STLs carry no units and no agreed axis convention (printing
  models are usually Z-up, mm; three is Y-up, m). The import preview needs nose-direction and
  up-axis controls (a six-way toggle, not free rotation) and takes size from the construct's
  authored `dimensionsM`, so unit chaos is irrelevant by construction.
- **No materials.** An STL arrives colourless. The default dressing for uploads is therefore
  the neutral-material path tinted by `icon_color` (section 5) — which for fan ships is
  exactly right: the GM picked that colour for this ship already, and a Rocinante-shaped hull
  in the ship's own marker colour reads as intended on every render style.

Compression choice for bundled models: either works; the build step (a script, per the starmap
build kit precedent) can emit meshopt for cheap decode or Draco for minimum bytes. Draco wins
on size (90 KB vs 162 KB gz here); meshopt wins on decoder weight and decode speed. Default to
**meshopt** for the starter set (simpler, faster, decoder is a rounding error) and let the
loader accept both — wiring `GLTFLoader.setDRACOLoader` + `setMeshoptDecoder` once covers
every user-supplied file either way.

If the recommendation turns out wrong (e.g. a must-have model only exists as FBX/USDZ): the
answer is still "convert to GLB offline", never "add a runtime loader" — gltf-transform and
Blender both do this for free.

## 3. Sources and licences (Question 2)

Bundled and user-supplied are different worlds and the design must serve both.

**Bundled — must be CC0 or public domain. Verified options:**

- **NASA 3D Resources** (github.com/nasa/NASA-3D-Resources, also science.nasa.gov/3d-resources):
  NASA media policy — models, textures and polygon data "generally are not subject to copyright
  in the United States"; the NASA insignia/logotype is separately protected and must not be
  traded on. 257 GLB files (581 MB total); real craft at usable sizes as shipped, already
  Draco-compressed: ISS (A) 39 KB, MRO 16 KB, Voyager 279 KB, Juno 256 KB, Cassini-Huygens
  404 KB. There is even a "Satellite Kit" of 3-9 KB mix-and-match parts. Real spacecraft fit
  SSE's Local Neighbourhood campaign naturally.
  **Texture reality, measured across seven GLBs rather than assumed: the collection spans a
  spectrum, and none of it is bare geometry.** Fully textured PBR: Hubble (A) (5 materials, 10
  embedded textures, 1.5 MB of webp/png), InSight (11 materials, 22 textures, 2.6 MB). Mixed:
  Cassini-Huygens (A) (4 textured / 4 flat), Apollo Lunar Module (3 / 9, only 90 KB of
  textures). Flat-colour: ISS (B), Voyager, Juno — zero textures but 16-24 **per-part coloured
  materials** each (gold foil, white body, dark panels), so they light and shade properly
  rather than rendering as a grey STL-style blob. The textured craft as shipped run 1.6-3.9 MB
  — over the per-model ceiling — but the build kit closes that: **textures downscaled to
  512 px (webp) + Draco re-encode measured Hubble 1,655 KB → 128 KB and Cassini 1,622 KB →
  231 KB**, comfortably inside budget with textures intact. InSight stays at 1.8 MB even at
  512 px (22 textures) — outliers like it are skipped or taken to 256 px. This is the same
  knob `fileToDownscaledDataUrl` already applies to photos: bounded fidelity as a matter of
  policy. Note the webp textures arrive via `EXT_texture_webp`, which three's GLTFLoader
  supports natively.
- **Kenney Space Kit** (kenney.nl/assets/space-kit): CC0, 150 models, stylised low-poly.
- **Quaternius Ultimate Space Kit** (quaternius.com): CC0, 92 models, glTF provided,
  spaceships and stations.
- **Poly Pizza** (poly.pizza): an aggregator — CC0 *and* CC-BY mixed. CC-BY is bundleable
  only with attribution plumbing; `ImageRef` already carries `credit`/`license`/`sourceUrl`,
  so a `ModelRef` with the same fields makes attribution honest if CC-BY is ever wanted.
  Recommend CC0-only for the starter set to keep the acknowledgements page simple.
- **Ruled out for bundling**: Sketchfab/CGTrader/Thingiverse/Printables at large — mixed
  licences, heavy NC/ND presence, and the abundant fan models of franchise ships are
  copyright problems regardless of the stated licence. "Free to download" is not a licence.

**User-supplied — no licence gate on our side.** A GM loading a fan-made Star Destroyer for
their table is their own personal use; the app stores it in their campaign like a custom photo.
The uploads path must therefore never feed the bundled set, and exported campaigns carry
whatever the GM put in them — same position the photo upload already occupies.

**One art-direction tension to decide, not to discover later:** NASA craft are realistic;
Kenney/Quaternius are stylised low-poly. Next to SSE's physically-derived planets, low-poly
hulls read game-y in the filled render style — but the holo scene's wireframe/hologram styles
flatten the difference (a wireframe of a low-poly hull looks deliberate). The starter set
should pick a lane (recommend: NASA real craft + a small stylised set clearly labelled) —
owner's call, flagged below.

**Matching the planet render regimes.** Planets render under the scene's style dial (filled /
wireframe / wire-glow, true colour, and so on) and constructs must follow the same dial — the
F6 lesson, restated in section 6. The texture findings above say the realistic end is
genuinely available, not aspirational: in the **filled** styles a textured NASA craft sits
next to a textured planet as an equal (real PBR materials, downscaled the same way photos
are), a flat-colour-material craft reads as a clean CAD render (lit, shaded, per-part
colours — respectable, not a blob), and in the **wireframe** styles materials are discarded
anyway so every model — textured, flat or low-poly — lands on exactly the planets' look. So
the regime match costs nothing beyond applying the existing style switch to the model's
materials, and the starter-set build should simply prefer textured or multi-material source
models so the filled end has something to show.

## 4. Budget (Question 3)

- **Per-model ceiling: 500 KB raw for bundled models** (all the NASA craft above fit; most are
  far under), **soft-warn at 500 KB / hard cap 2 MB for user uploads** (a GM who insists on a
  2 MB hull pays the cost in their own campaign, and the cap stops the broadcast pathology).
- **Bundled starter set: ~10-15 hulls, ≤ 3 MB total, in `static/`, lazy-loaded per model on
  first assignment.** Static assets are not JS bundle weight; they cost repo/deploy size and
  first-fetch only. Nothing loads for a campaign that uses no models.
- **A 26-construct campaign downloads:** starter-set path — only *distinct* hulls fetch, so
  ~8 hulls × ~200 KB ≈ **1.6 MB once, HTTP-cached**, plus bytes of per-construct tint data.
  All-custom path at the warn threshold — 26 × 500 KB = **13 MB riding inside every full
  snapshot resend**, which is why custom models need the storage note below.

**Storage of custom models — the one place the photo precedent does not scale.** A photo is
30-80 KB and rides as an inline data URL; fine. A model is 5-10× that, and `sendIfChanged`
re-stringifies and re-sends the whole snapshot on any change. Recommendation: store custom
model binaries as a **content-hash-addressed side table** (own IDB store; nodes carry
`{ hash, name, license... }`), ship them to players **once per session over their own message
type** (request/response like `onRequestSync`, cached by hash on the player side), and keep
them **out of the snapshot payload**. Bundled models are referenced by id and never cross the
wire at all — players fetch them from `static/` themselves. This is more work than a data URL;
it is also the difference between the feature scaling to 26 constructs and it freezing the GM's
tab. If Phase 1 wants to defer it, the honest interim is data-URL storage with the hard cap at
500 KB and a visible warning that models inflate the player broadcast.

Campaign export (`.json`): embed the binaries base64 (+33%) so a file is self-contained, same
as photos today.

## 5. Procedural dressing (Question 4)

The point of dressing is that ~10 hulls cover ~100 ships. What can honestly be derived, from
data that exists today:

- **Primary tint — `icon_color`.** Authored, universal, and already the construct's colour
  everywhere (2D map, 3D sprite). Applying it to the model keeps marker and model in
  agreement — the same argument A30 makes for the glyph. Mechanism: models in the starter set
  follow a naming convention (materials named `hull-primary`, `hull-accent`, `hull-glow` tint;
  everything else is left alone). For arbitrary user GLBs the convention cannot be assumed:
  offer a per-construct "tint whole model" toggle (HSL shift on base colour), default off.
- **Badge/decal — `icon_type`.** The glyph the map draws, applied as a small decal texture on
  `hull-primary` surfaces. Derivable, cheap, optional.
- **Status — tags, when constructs have them.** Today no bundled construct carries a single
  tag (verified during A2), so there is nothing to read; the unified tagging redesign
  (`docs/dev/unified-tagging-design.md`) gives constructs a real tag surface. When it lands,
  dressing reads tags exactly as body renderers do: a `status/derelict` tag kills emissive
  materials and darkens the hull; nothing scans `flight_state` or the class string inside a
  renderer. This is the physics-and-data-drive-tags rule applied verbatim: the *judgement*
  ("this ship is a derelict") arrives as a tag; the *lookup* ("derelicts render unlit") is
  data.
- **Genuinely not derivable, and must be authored: which hull a ship uses.** The class string
  is free-form — the bundled campaign alone has "Hard SciFi/Station/Trade Hub", "Sensor
  Platform", "Warship w/Fighter Wing", "Destroyer Escort" (surveyed across `static/`) — so any
  class→model mapping is a keyword heuristic that will misfire. Model assignment is an explicit
  per-construct choice (a picker over the starter set + upload), exactly as `icon_type` is.
  Likewise faction, age and battle damage: no data exists to drive them; do not invent it.
  If faction dressing is ever wanted, the lever is a tag or an authored field first.

### Hull finishes: filling in a textureless model (owner ask, 2026-08-01)

Most uploads arrive as bare geometry (every STL does). "Filled" must therefore not mean
"textured or nothing" — it means a small menu of **procedural finishes**, every one generated
from geometry + `icon_color` at load time, no textures, no new dependencies. All the
primitives are already in the vendored three:

1. **Flat-shaded** (the default): de-index + `computeVertexNormals` gives faceted per-face
   normals — the "low poly but coloured" look — in the construct's tint, lit by the scene's
   star light. Zero extra cost; works on any mesh however smooth it was authored.
2. **Panel lines / crease edges — the "edge detection" ask, and it is a built-in.**
   `THREE.EdgesGeometry(geometry, thresholdAngle)` extracts exactly the edges where adjacent
   faces meet at more than the threshold (~25° reads as panel lines), computed once at load,
   drawn as a `LineSegments` overlay on the fill. No post-processing, no shader. If 1 px
   hairlines are too faint, `LineSegments2`/`LineMaterial` (vendored, `examples/jsm/lines/`)
   draw screen-space-width lines.
3. **Cel + creases:** `MeshToonMaterial` with a generated 3-4 step gradient ramp (a few-pixel
   `DataTexture`, made in code) under the edge overlay — the clean technical-drawing/comic
   look.
4. **Smooth metal (matcap):** `MeshMatcapMaterial` with a matcap generated on a small canvas
   (radial highlight sphere tinted toward `icon_color`) — the sculpting-tool look, needs no
   lights, single draw call, reads as brushed metal at marker sizes.
5. **Blueprint / hologram:** near-transparent dark fill (depth-writing) + crease edges in
   `icon_color` + a fresnel rim glow (a few-line shader, or cheaper still an additive
   slightly-scaled back-face hull). This is the finish most at home on the holo table.
6. **Wireframe and occluded wireframe:** already the scene's own style vocabulary
   (`wire-flat` / `wire-glow` / `-occ`); the occluded variant is an invisible
   (`colorWrite: false`) depth-writing fill under depth-tested lines, which the body path
   already does — constructs inherit the mechanism, nothing new.

**Prior art — this is all stolen, deliberately.** Finishes 1-4 are straight from three.js's
own example set (EdgesGeometry, toon and matcap examples); the inverted-hull rim is the
classic outline trick every cel-shaded game uses; and the art references for 5 are Homeworld's
tactical view and Elite: Dangerous's ship holograms — both are precisely "flat fill + edges +
glow" and both stay legible at very small screen sizes, which is the marker's whole job. The
heavyweight route — screen-space edge detection over depth/normal buffers (the Obra Dinn
look), or three's `OutlinePass` — is **rejected**: full-screen passes that add nothing at
marker scale.

Finish is look-data like everything else: a per-construct field (default flat-shaded, or
follow-the-preset), with the constants (crease threshold, ramp steps, rim power) in data.
The scene's style dial outranks it — a wireframe scene renders every hull wireframe — and
built meshes cache per (model hash, finish, tint).

Where the constants live: the starter-set **manifest is rule-pack-style data** — model id,
display name, licence/credit, which materials are tintable, default scale — not code. A GM
editing the pack can add their own hosted models by URL the same way.

The architecture rule fits without strain because a construct's appearance was *always*
authored data (`icon_type`/`icon_color`); the model is one more authored appearance field plus
derived dressing read from tags. No parallel appearance system is created: `deriveAppearance`
remains the body pipeline, and the construct pipeline stays "authored look-data + tags", which
is what it already is.

## 6. Where it renders — the F1 question, answered explicitly (Question 5)

**A 3D model on the 3D map is not a violation of the body-graphics rule; it is the rule's
mirror image. But a photo on the map still is one, and the model earns its place only as the
marker.**

The reasoning, so the builder does not re-litigate it: F1 bans body *graphics* — photo, flat
disc, decorative sphere — from the map because the map's job is the honest render of the
system's state, and a pasted illustration **replaces** the honest render with a picture. For a
body the honest render already exists (the physics-derived globe), so any graphic on the map
is strictly worse. For a construct the situation is inverted: the honest render of its shape
does not exist — the sprite glyph is an admitted stand-in — and a 3D model of the hull *is*
the shape of the thing, exactly as the globe is the shape of the planet. Drawing it is the map
becoming *more* honest, not less.

The conditions that keep the spirit of F1, all three load-bearing:

1. **The model is the marker, nothing more.** It replaces the sprite in the scene graph slot,
   at the same screen-space size, under the same focus rule (full in the focus set, tiny and
   dim otherwise), reverting to the glyph below a legibility threshold (Q6). It is never a
   floating illustration, never screen-anchored chrome.
2. **The 2D surfaces keep the glyph.** The 2D orrery/plan view is "the plan view" (WS7 rule)
   and the starmap draws systems, not hulls; a 3D model has no business on either. This also
   keeps the F6 lesson: the 3D scene's render styles (filled / wireframe / wire-glow) must
   apply to construct models exactly as they do to bodies — a wireframe scene renders a
   wireframe hull.
3. **A GM-uploaded photo stays info-block-only.** A photo is a picture, not a shape; it is
   precisely what F1 exists to keep off the map. The model field and the image field are
   siblings with different reach, and the UI should say so.

**The info block is the primary home either way**: a model viewer block (lit turntable —
`bodyDisc` mode `sphere` is the exact precedent, a live three.js render inside the document),
with the priority chain **photo (custom) > model > glyph interim > nothing**, mirroring how a
body's custom image outranks its derived imagery. This closes A30 fully when it ships; the
glyph interim closes it cheaply now.

Scene rendering (condition 1) is worth doing but severable: if the owner wants this
info-block-only, everything else in this document stands unchanged.

## 7. Scale and performance (Question 6)

**Scale.** Models normalise at import: recentre, compute bounding box, scale so the longest
axis equals the construct's `physical_parameters.dimensionsM` longest axis (fallback: 100 m).
The *stored* model is unit-normalised; the authored dimensions drive the drawn size, so
editing the dimensions rescales the model — data drives the image.

At **marker scale** (the default and the current behaviour) the model occupies the sprite's
screen-space slot: constant apparent size, `sizeAttenuation`-equivalent handled by per-frame
scaling in `updateConstructs`, same per-role pixel logic as the A9 floors (a construct ranks
below a moon). At **true scale** a 110 m ship at whole-system framing is ~10⁻⁶ px — nothing
new to invent: the A9 answer (per-role screen-space pixel floor, never a scene-unit floor)
applies verbatim, and below the threshold where the model would draw under ~12 px it reverts
to the glyph sprite, which is also the LOD answer.

**What real geometry must NOT change:** the construct keeps contributing **zero radius** to
ring clearance (`scene.ts:1722`) and to F5's whole-system bounding sphere. A marker-scale
model's world-space extent is a per-frame screen-space artefact; letting it into the framing
maths would make camera framing depend on zoom, which is F4's bug class. This is the single
most likely regression in the build; it deserves a test.

**Performance.** Budget arithmetic: 26 constructs × 5k-triangle starter hulls = 130k
triangles — noise next to the planet meshes and postprocessing already in the scene. Worst
case, 26 × 30k-triangle NASA models = ~780k triangles and 26 draw calls (one per hull, tinted
via per-instance material clone) — still fine on anything that runs the holo scene, but the
starter set should stay low-poly (≤ 10k tris/hull) by build-time simplification.
`InstancedMesh` only matters when many constructs share one hull; at 26 total it is
premature — noted as the known answer if fleets ever arrive. Glyph-below-threshold LOD keeps
distant/unfocused ships as sprites, which is where most of them are most of the time. Loading
is async (GLTFLoader), sprite drawn until the mesh arrives, models cached per (hash, tint).

## 8. Fallback and interim (Question 7 / A30)

Most constructs will never carry a model. The ladder, best-available wins:

1. GM-uploaded photo (exists today) — info block only.
2. 3D model (this design) — info block viewer + scene marker.
3. **Icon glyph at info-block size — build this NOW.** A30's option (b): render `icon_type`
   in `icon_color` (the exact `getConstructIconTexture` vocabulary) as a modest document
   block, so the panel agrees with the marker the player can see on the map. Costs one block
   type that draws a cached canvas; no new data; no dependency on any of the above. Optionally
   dressed with the class string beneath, which the panel subtitle already suppresses.
4. Nothing (today's honest blank).

**A30 verdict: do not wait for 3D.** Step 3 is a small, self-contained info-block change that
removes the blank immediately, and it remains the permanent fallback tier afterwards — the
work is not thrown away when models arrive.

## 9. Phasing

Reordered 2026-08-01 for the primary use case (user-uploaded SF ships): the import pipeline
is Phase 1, the bundled set is last.

**STATUS 2026-08-03: Phase 1 BUILT at v2.1.387-394-beta** (modules: `constructs/modelStore.ts`,
`modelImport.ts`, `modelConvert.ts`, `modelViewer.ts`, `modelTransfer.ts`;
`components/ConstructModelModal.svelte`, `ConstructModelGraphic.svelte`; builder + both document
consumers). Two deliberate deviations from the letter of Phase 1, both recorded as inbox
findings: export/.json embedding is helper-ready but unwired (its call sites sat in another
session's live file), and the broadcast fetch-by-hash for remote players is deferred to the VTT
stream's territory — same-machine players work today via the shared origin store, and a missing
binary degrades to the icon glyph. Phases 2-4 not started.

- **Phase 0 — A30 interim (independent, do now):** glyph-at-size info-block for constructs.
- **Phase 1 — upload + viewer, all three formats:** `model?: ModelRef` (`{ hash|url, name,
  credit, license, sourceUrl, custom }` — the ImageRef shape plus hash), upload accepting
  **GLB, STL and OBJ** with convert-at-import (simplify via `meshopt_simplifier` — the one new
  dependency, MIT — texture downscale for wild GLBs, orientation/up-axis preview,
  normalisation, caps), hash-addressed IDB store, info-block turntable viewer, export/import
  embedding, `icon_color` tint for material-less meshes with the flat-shaded + crease-edges
  finishes (section 5; the rest of the finish menu follows in Phase 3). Info block only; no
  scene change; broadcast ships models once by hash.
- **Phase 2 — the scene marker:** model replaces sprite at marker scale under the focus rule;
  glyph LOD threshold; render styles applied; zero-radius invariants pinned by a test.
- **Phase 3 — dressing:** the full hull-finish menu (cel, matcap, blueprint/holo — section 5),
  `hull-*` tint convention for prepared models, `icon_type` decal, tag-driven status dressing
  when construct tags exist.
- **Phase 4 — bundled starter set (optional):** CC0/PD set built by a `scripts/` kit (fetch,
  simplify, downscale textures to 512 px webp, meshopt- or Draco-compress, manifest with
  licence per model — preferring textured/multi-material sources so the filled render styles
  have real detail) + picker UI. Also here: true-scale rendering, per-model dressing
  overrides.

Each phase ships value alone; the design survives stopping after any of them.

## 10. Not worth doing

- **STL as a storage or bundling format.** 13× the bytes of Draco GLB for strictly less
  information; measured above. Accept-and-convert honours the abundance without the cost.
- **Silhouettes by hull class (A30 option c).** Class strings are free-form (surveyed); the
  mapping would be a fragile keyword heuristic feeding bespoke artwork. Explicit assignment +
  glyph fallback covers it.
- **Auto-assigning models from class strings.** Same reason; a wrong hull is worse than a
  glyph.
- **A runtime FBX/USDZ/DAE loader.** Convert offline; every added loader is bundle weight and
  attack surface for malformed files.
- **Procedural weathering/age/damage textures.** No data drives them; inventing the data to
  justify the shader is the tail wagging the dog. Revisit if tags ever carry the facts.
- **InstancedMesh now.** 26 constructs; premature. Noted for fleets.
- **A parallel appearance system.** Constructs stay "authored look-data + tags"; the model is
  one more authored field. `deriveAppearance` is not touched.

## 11. Owner decisions — ALL FIVE TAKEN, 2026-08-02

1. **Scene marker: YES, as Phase 2 — not now.** Severable as designed. Before Phase 2 starts,
   re-read the standing rule that body graphics belong to the info block and never the map
   (F1) — the marker is the half most likely to surprise, and `holo/scene.ts` is another
   session's territory until then.
2. **`meshoptimizer` (MIT, ~50 KB): ACCEPTED**, Phase 1.
3. **Upload caps: ACCEPTED as proposed** — warn 500 KB, hard 2 MB post-conversion.
4. **Starter set: a SMALL NASA-ONLY set** of real public-domain craft (Phase 4, not now).
   Stylised low-poly libraries are NOT wanted — real craft match the engine's
   physically-derived tone and sidestep the low-poly-reads-game-y tension entirely.
5. **Licensing: CC0 AND CC-BY, not CC0-only.** The doc's recommendation was overruled, so
   **attribution plumbing is in scope** and did not previously exist. Interaction to note:
   the starter set is NASA public-domain and needs no attribution, so the plumbing serves
   USER-SUPPLIED and SHARED models. Where attribution lives: `ModelRef` carries
   `title`/`credit`/`license`/`sourceUrl` (the ImageRef precedent); it is DISPLAYED as a
   small credit line under the info-block viewer wherever the model is shown (GM panel and
   player document alike) and in the construct editor beside the model controls; it SURVIVES
   export because the ref rides on the node and the binary's store entry carries the same
   metadata, and it survives a share/broadcast because the ref crosses inside the snapshot
   while the binary crosses keyed by hash with metadata attached. A model whose `license`
   says CC-BY with no `credit` is flagged in the editor at import time, not silently
   accepted.

## Appendix: spike method (throwaway, scratchpad only, nothing in src/)

NASA models `Voyager Probe (A).glb` and `Juno (B).glb` (public domain) fetched from
github.com/nasa/NASA-3D-Resources; sizes measured with `@gltf-transform/core@4` +
`draco3dgltf` + `meshoptimizer` in the session scratchpad. Texture census: Hubble (A),
InSight (arm deployed), Cassini-Huygens (A), Apollo Lunar Module and ISS (B) additionally
fetched and their materials/textures listed via gltf-transform; all 219 model directories in
the repo tree carry image files alongside their GLB (previews and/or texture sources).
Texture downscale figures from `textureCompress({ targetFormat: 'webp', resize: [512, 512] })`
(sharp encoder) followed by a Draco re-encode. Both shipped GLBs arrive
Draco-compressed (`KHR_draco_mesh_compression`) — the extension was stripped and the geometry
re-exported plain, Draco and meshopt; the binary STL figure is the same triangle soup written
by the format's fixed 84 + 50n layout and confirmed by writing the actual file; gzip figures
are `zlib` level 9. NASA repo format census from the GitHub tree API: 342 STL (avg 6.2 MB),
257 GLB (avg 2.3 MB). Licence statements read from nasa.gov media guidelines,
kenney.nl/assets/space-kit and quaternius.com. Decoder/loader availability verified by listing
`node_modules/three/examples/jsm/{loaders,libs}` in this repo. Spike files deleted with the
scratchpad; no repository change.
