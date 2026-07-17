# Unified Player View — design guide (FINAL, build-ready)

Status: DESIGN LOCKED (2026-07-09). All open questions resolved. This document is the build spec.
Supersedes the standalone "projector" build (§A8) in `v2.2-3d-design.md`.

## 1. The core idea

Today we ship several separate player-facing things: the five Field Guide themes, the 2D `/projector`,
the printed Report, and the GM's own preview. They are all the same act — **take a (redacted) snapshot
and present it** — differing only in what is drawn, how it looks, the chrome around it, and who drives
it. So there is ONE engine and many **presets**. A preset is the complete parametrisation of a player
presentation; every current artifact becomes a named preset of the one tool. New presentation ideas
become new presets, not new code.

> One tool, parametrised: GM preview, player view, guide, projector — all the same system, saved and
> recalled as presets.

The exception is the printed **Report**: paper is a genuinely different medium and stays its own export
path, outside this system.

## 2. The three GM-designable layers

A preset styles three layers. Each layer picks a view module and inherits the preset-wide theme (§3).

1. **Cover page** — the start/hold screen. Title text, subtitle, body text, logo/graphic, label
   (e.g. CONFIDENTIAL). Must be able to recreate "DON'T PANIC" exactly — and equally
   "ACME Corp + logo + CONFIDENTIAL".
2. **Starmap view** — how the campaign map presents: `list` (text), `diagram2d` (the current clickable
   starmap), or `holo3d` (galaxy 3D — to be written; the option ships disabled until it exists).
3. **System view** — how a system presents: `list` (text/image file entries), `diagram2d` (the current
   console orrery / old projector look), or `holo3d` (the holo table).

## 3. Preset-wide theme

Applied across all three layers so a preset reads as one designed object:

- **Font**: a single UI font choice for the whole player view (from a small curated set + system default).
- **Colour scheme**: one broad accent colour picked from a spectrum — works exactly like the current
  guide terminal colour (monoColor); drives chrome, labels, tints.
- **Uploaded graphics**: a couple of image slots (logo + one auxiliary). Usable on the cover page AND as
  an overlay on a 2D or 3D map (watermark/frame corner). Stored with the preset (see §6); keep them
  small — they ride the starmap file and the broadcast channel's chunked path.
- **Chrome text**: company/campaign name, footer/credits, confidentiality label.

## 4. Anatomy of a `PlayerPreset`

```
PlayerPreset {
  id, name, description        // name+description define purpose — shown on the picker card
  builtIn?                     // shipped; not deletable, duplicable
  // driver
  followGM: boolean            // GM-driven (projection-style): honours SYNC_FOCUS/SYNC_TIME
  interactive: boolean         // players may click/focus/scrub (false = pure display surface / kiosk)
  // layers
  cover:   { enabled, title, subtitle, body, label, graphic: assetRef | null }
  starmap: { view: 'list' | 'diagram2d' | 'holo3d' }
  system:  { view: 'list' | 'diagram2d' | 'holo3d' }
  // theme (preset-wide)
  font: string
  accentColor: string          // the guide-style spectrum pick
  assets: { logo?: dataUrl, aux?: dataUrl }
  overlay: { asset: 'logo'|'aux'|null, corner, opacity }   // graphic over a 2D/3D map
  companyName, footerText
  // look (today's HoloStyle, generalised; module-dependent controls — §7)
  filter: string               // shader id — see §5 (single parameterised CRT)
  filterParams: Record<string, number | boolean | string>  // per-shader controls incl. CRT colour
  bodyStyle: 'textured' | 'flat' | 'tint'
  background: 'space' | 'green' | 'blue' | 'black'
  grid: 'off' | 'plain' | 'scaled'
  compression, bodySize, beltDetail, orbitSpeed, skybox
  framing: { angleDeg, lockOverhead, whole }   // lockOverhead = lock icon by the angle slider
}
```

Notes:
- `followGM` + `interactive` are independent flags. A projection is typically
  `{followGM: true, interactive: false}`; a GM can also follow-drive an interactive guide, or make a
  locked kiosk guide.
- **Projection is NOT a category.** All presets live on one list; the name/description say what it's
  for. GM-driven presets (`followGM`) are visually outlined in a different colour on the picker —
  they are effectively read-only surfaces (RO) where player-driven ones are read/write (R/W).
- Redaction is orthogonal: every preset renders the already-redacted `computePlayerSnapshot` /
  `computePlayerStarmapSnapshot` output.

## 5. Filters: ONE parameterised CRT

Consolidation (locked): **drop the separate amber filter.** There is one `crt` filter with a **colour
parameter** — green, amber, red, blue, whatever the spectrum pick gives. This is more flexible and
smaller than filter-per-colour, and it forces the per-filter parameter plumbing (`filterParams`) that
night-vision/thermal etc. will also use. Filter ids after consolidation: `none`, `crt` (colour param),
`night_vision`, `thermal`. Migration: presets referencing `retro_sci_fi_amber` become
`{filter:'crt', filterParams:{color:'#ffb000'}}`; `retro_sci_fi_green` likewise with green.

Filters are a screen-space post-process and apply **uniformly across view modules** — a CRT preset
looks CRT whether the layer is a list, the 2D map, or the holo table.

## 6. Storage, delivery, migration

- **Presets are saved WITH the starmap.** They are campaign data (the GM designed them for this
  campaign), not browser data. `starmap.playerPresets: PlayerPreset[]`. Built-ins ship in code and are
  not persisted; duplicating one writes a copy into the starmap.
- **Migration**: existing localStorage holo presets (`holo-presets` key) are GM-created player presets —
  on first open of the new picker, import them into the starmap (then clear the key). The five guide
  themes + old projector become the six shipped built-ins (see §8).
- **Delivery to players — both channels**:
  - *Cold-open*: the share link embeds the preset (compressed JSON in the URL fragment) so a player's
    browser can render before any sync arrives.
  - *Live*: a `SYNC_PRESET` broadcast message (like today's `SYNC_GUIDECONFIG`, superseding it) pushes
    the active preset + subsequent edits over the channel. Large assets ride the existing chunked path.

## 7. UI: picker and editor

- **New "Player View" rail icon** replaces the Field Guide + Projector rail entries (unifying them).
- **The picker** looks like the current Field Guide modal: a clean grid of preset cards
  (name + description + tint swatch). No editing clutter. GM-driven presets get the coloured outline
  (§4). Actions per card: activate/share, project, duplicate, edit, delete (non-built-in).
- **The editor is a separate popup modal** (opened from a card's edit action or "New preset"), keeping
  the picker clutter-free. Layout: controls left, **live preview** right (embedded player view), plus
  an "open preview in a window" pop-out for checking on a real second screen. Save writes to the
  starmap's preset list.
- **Progressive disclosure**: the editor shows only the controls the chosen view module supports —
  `bodyStyle`/`grid`/`orbitSpeed`/`compression` etc. hide for `list`; `lockOverhead` and 3D-only
  controls show for `holo3d`; filter + theme + cover controls always show.

## 8. Shipped built-in presets (the current five + projection)

| Built-in | Sketch |
|---|---|
| The Guide | system: diagram2d, friendly cover ("DON'T PANIC"), interactive, followGM off |
| Datapad | system: diagram2d, terminal chrome, interactive |
| Console | system: diagram2d, console tint, interactive |
| CRT | filter: crt (green), mono colour, interactive |
| Holo Table | system: holo3d, interactive |
| **Projection** | system: holo3d (or diagram2d), followGM on, interactive off, lockOverhead, clean framing |

Greenscreen/OBS is any preset with `background: 'green'` — the projection card's description points
this out rather than shipping a seventh card.

## 9. Build order (for the implementing session)

1. **Schema + storage**: `PlayerPreset` type; `starmap.playerPresets`; built-ins in code; localStorage
   holo-preset migration; picker reads the one list.
2. **CRT consolidation**: single `crt` filter with colour param + `filterParams` plumbing through
   HoloStyle/scene/composer; migrate old ids.
3. **Picker rework**: Player View rail icon; current Field Guide modal becomes the preset card grid
   (cards = presets); GM-driven outline colour.
4. **Editor modal**: separate popup, controls + embedded live preview + preview pop-out; progressive
   disclosure per module; save to starmap.
5. **lockOverhead** + the Projection built-in; follow-GM in the unified viewer (`SYNC_FOCUS`/`SYNC_TIME`
   honoured when `followGM`, ignoring when not); `interactive:false` disables input.
6. **Cover page + theme**: cover layer renderer, font + accent application, uploaded graphics
   (cover + map overlay); `SYNC_PRESET` + link-embed delivery.
7. **Starmap layer views** (list/2D through the preset; holo3d galaxy view later — option disabled).
8. **Kill-list**: after parity is confirmed per case, retire the bespoke guide theme components and
   `/projector`, one at a time. Report/print stays (separate medium).

Each step ships to beta independently; the current guides keep working throughout (they become presets
in step 3 but render through the same components until steps 4–6 swap the internals).

## 10. Decisions log (all locked 2026-07-09)

- Editor is a separate modal from the picker; picker keeps the current clean look.
- Three designable layers: cover page / starmap view / system view.
- Preset-wide single font, spectrum accent colour, two uploaded graphic slots (cover + map overlay).
- `interactive` is its own flag, independent of `followGM`.
- **Presets are saved with the starmap** (campaign data), not localStorage; migrate existing
  localStorage holo presets in.
- Projection is not a category — one flat preset list; name/description carry purpose; GM-driven (RO)
  presets outlined in a different colour.
- Delivery: link-embed for cold-open + `SYNC_PRESET` channel for live changes.
- Editor shows only the controls the chosen module supports.
- Filters apply uniformly across view modules.
- Report/print stays a separate export path.
- Migrate saved holo presets; built-ins duplicable.
- Retire bespoke code (guide themes, `/projector`) one at a time after parity.
- ONE CRT filter with a colour parameter replaces the green/amber pair.

## 11. Refinements & backlog (2026-07-09 round 2 — fold into the build)

### 11.1 Everything is a reusable, parameterised ELEMENT
As each current preset is broken down, capture its distinctive parts as reusable ELEMENTS that can be
added to ANY preset at ANY layer (cover / starmap / system), each self-contained and parameterised.
Worked example — **The Guide's "guide messages"** (the friendly banner text top & bottom of screen):
that becomes a `guideMessages` element with a placement dropdown **None / Top / Bottom / Top & Bottom**
and the message text(s), addable at cover/starmap/system level. Recreate each built-in by composing
elements, not by bespoke components. General rule: when you split something out, contain + parameterise
it so it can be reused widely. (Candidate elements to extract: guide-messages banner, cover title/label,
graphic placement, footer/credits, confidentiality stamp, logo/overlay.)

### 11.2 Full filter controls in the editor
The preset editor exposes the FULL param set of the chosen filter (brightness, invert, all CRT sliders,
etc.) — generated from the filter definition's `params` (the FilterPanel pattern), grouped as the
definition declares. Not a hand-picked subset. ("Desperately want to turn up brightness / invert.")

### 11.3 Render style + colour selection (wireframe / low-poly "80s" mode)
Split a body's appearance into TWO orthogonal choices:
- **Colour selection** (shared dropdown, 3 options, used by BOTH filled and wireframe):
  `True colour` / `Flat class colour (red/orange/…)` / `White`. **Holo-tint becomes White** — instead of a
  fixed blue tint, render white and let a screen filter colour it (more flexible). Belts/rings/labels use
  the same 3-way colour selection.
- **Render style**: `Filled` (current solid spheres) / `Wireframe — glowing points` (vector look, points
  brighter than lines) / `Wireframe — flat points` (non-glowing). Surface features still drawn, but as
  coloured OUTLINES not fills. Belts & rings render as simpler points in wireframe. INVESTIGATION —
  prototype the glowing/non-glowing vector look; adopt if it lands.

### 11.4 Moon orbits follow the name rule
In the Holo Table, draw a body's ORBIT under exactly the same rule as its NAME (`getVisibleNodeIds`):
"if you show a name, show an orbit." So selecting a planet reveals its moons' orbits (their names already
show). One rule, clean and aligned — replaces any separate orbit-visibility logic.

### 11.5 Reactive player view — UPDATE GATE
Player views are reactive to live GM editing (good). Add a throttle so live pushes fire **at most ~2×/sec**
— don't hammer the render / the SYNC_PRESET channel on every keystroke/slider tick. (Leading + trailing
edge; coalesce.)

### 11.6 More momentary (non-saved) GM toggles
Alongside hide-labels / filter-bypass, add **disable auto view-orbit** — kill the turntable on the fly if
it's annoying, without touching the saved preset.

### 11.7 Data panel (desktop) — width + filter
The player-view body data panel is drag-resizable + remembered (done, v2.1.31). Refinements: default width
to ~**2/3** of the current default; and the panel should receive the **same visual filter** as the main
view (so a CRT/night-vision preset colours the data panel too, not just the map). DOM panel → approximate
via CSS filter, or render it inside the filtered surface.

### 11.8 Status (what's built vs pending, 2026-07-09)
BUILT: steps 1-2 (schema+storage, CRT-colour). v2.1.34: CRT-coloured labels + label size/font + momentary
labels/filter toggles. PENDING here + steps 3-8: everything in §11 above, plus picker/editor/follow-GM/
cover-theme/starmap-layers/kill-list.
