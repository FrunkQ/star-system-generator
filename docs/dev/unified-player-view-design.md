# Unified Player View — design guide

Status: DESIGN / analysis (no code yet). Supersedes the standalone "§A8 projector" build in
`v2.2-3d-design.md`. Draws every existing player-facing artifact into one engine.

## 1. The core idea

Today we ship several separate player-facing things:

- **Field Guide** — five hand-built themes (The Guide, Datapad, Console, CRT, Holo Table), player-driven.
- **Projection** (`/projector`) — a GM-driven 2D orrery for a table screen, follows the GM's map.
- **Report** — a static printed document.
- **GM preview** — what the GM sees while building.

They overlap heavily. Each is really the *same act*: **take a (redacted) system or starmap snapshot and
present it**. They differ only in four dimensions:

1. **What** is drawn — a text list, a 2D orrery, a 3D holo table.
2. **How it looks** — filters/shaders, colours, grid, framing, body style, motion.
3. **The chrome** — cover page, logo, company name, confidentiality label, overlays.
4. **Who drives it** — the player interacts freely, or the GM drives it (follow-GM).

So there is one engine and many **presets**. A preset is the complete parametrisation — the DNA of a
presentation. "Field Guide", "Projection", "Greenscreen for OBS", "CRT terminal" all stop being separate
features and become **named presets** of one configurable tool. The GM builds/edits presets in the main app
with a live preview, saves them, and hands them out (as a player link) or projects them (follow-GM).

> One tool, parametrised: GM preview, player view, guide, projector — all the same system, saved and recalled
> as presets. New presentation ideas become new presets, not new code.

## 2. Anatomy of a preset (the "cocktail")

A `PlayerPreset` is a bundle of independent modules. Grouped by concern:

### 2.1 Identity
- `id`, `name`
- `driver`: `'player'` | `'gm'` — see §3. Purely a label + default for `followGM`; the GM can name a preset
  "Bridge Projection" or "Passenger Guide" and it reads correctly.
- `builtIn`: shipped preset (can't be deleted; can be duplicated + edited).

### 2.2 Driver / sync (the one real behavioural fork — §3)
- `followGM`: boolean. When true the view honours the GM's broadcast focus, time and (optionally) framing.
  When false the player drives their own focus and an arbitrary time rate.
- (Later, granular: `followFocus`, `followTime`, `followCamera` — but ship the single flag first.)

### 2.3 View module — what represents the system / starmap
- `systemView`: `'list'` | `'diagram2d'` | `'holo3d'`
- `starmapView`: `'list'` | `'diagram2d'` | `'holo3d'` (galaxy 3D is in scope later)
- These are the current tiers, promoted to a free choice:
  - `list` = the report/textual catalogue.
  - `diagram2d` = `SystemVisualizer` (the console/guide 2D orrery).
  - `holo3d` = `HoloView`.

### 2.4 Look (today's `HoloStyle`, generalised to all view modules where it applies)
- `filter` (shader id) + `filterParams` (per-shader controls — currently missing; add for CRT/thermal/etc.)
- `bodyStyle`: `textured` (true colour) | `flat` (class colour) | `tint` (mono holo)
- `background`: `space` | `green` | `blue` | `black` (chroma keys for OBS)
- `grid`: `off` | `plain` | `scaled`
- `compression` (spread), `bodySize`, `beltDetail`, `orbitSpeed`, `skybox`
- `framing`: `angleDeg` + **`lockOverhead`** (a lock toggle next to the angle — forces top-down) + `whole`
- `monoColor` / tint colour (terminal colour for CRT-style skins)

### 2.5 Chrome / branding — the "presentation wrapper"
- `cover`: the start/hold screen — `{ title, subtitle, logoUrl, label }`. "DON'T PANIC" is one cover;
  "ACME Corp — CONFIDENTIAL" over a logo is another.
- `logoUrl`, `companyName`
- `overlays`: watermark / confidentiality banner / frame (optional list)
- `creditsFooter`, etc.

### 2.6 Behaviour
- `interactive`: can the player click/focus/scrub, or is it locked (a pure display surface)?
- Redaction is orthogonal and already handled by `computePlayerSnapshot` — every preset renders
  already-redacted data.

## 3. Follow-GM: the pivot that separates "guide" from "projection"

The **only** essential behavioural difference between a Field Guide and a Projection is who drives it:

- **Player-driven** (guide): the player picks the focus and an arbitrary time rate. Time is cosmetic.
- **GM-driven** (projection): the view follows the GM's real focus + real display clock over the channel.

Everything else (2D vs 3D, greenscreen, overhead, filters) is just *look*. So `followGM` is a **checkbox on
the preset**, not a separate product. Consequences:

- A "Projection" preset = `followGM: true`, usually `lockOverhead` or a clean framing, often a chroma-key
  background. The old 2D `/projector` is reproduced by `{ systemView: 'diagram2d' | 'holo3d', followGM: true,
  lockOverhead: true }`. Greenscreen/OBS mode = `{ ..., background: 'green' }`.
- A GM can also tick `followGM` on a *guide* preset to **drive the players' guide** — pushing their focus as
  the session moves. Same machinery, new capability, zero extra code.

The broadcast already carries `SYNC_SYSTEM` / `SYNC_FOCUS` / `SYNC_TIME`; `followGM` just decides whether a
given view honours them. The existing `/projector` receiver is the reference implementation.

## 4. Mapping the current artifacts onto presets

| Today | Becomes preset (sketch) |
|---|---|
| The Guide (illustrated) | `systemView: diagram2d`, friendly cover, `followGM:false`, `filter:none` |
| Datapad / Console | `systemView: diagram2d`, interactive, terminal chrome |
| CRT | `filter: retro_sci_fi_green`, mono colour, scanline cover |
| Holo Table | `systemView: holo3d` |
| 2D Projector | `systemView: diagram2d` (or `holo3d` + `lockOverhead`), `followGM:true` |
| Greenscreen / OBS | any projection preset + `background: green` |
| Report (printed) | `systemView: list`, print chrome (kept as an export path) |

Each shipped theme becomes a **built-in preset** in the picker; the current Field Guide popup becomes the
**preset picker + editor**.

## 5. Where it lives — the preset-design screen (main app)

Decision (Alex): the look controls live in the **main app**, not a second pop-out. Rationale: designing a
preset against a live preview is far easier than juggling two windows.

- New **"Player View"** rail icon (unifies today's Field Guide + Projector rail entries). For now, reuse the
  existing Field Guide popup as the shell.
- The modal is a **preset picker** (built-ins + saved) plus an **editor**:
  - Left: the control panel (today's `holo-panel`, generalised — view module, filters + params, colour,
    grid, framing incl. lock-overhead, orbit, branding/cover, follow-GM).
  - Right / centre: a **live preview** of the player view (embedded), with an **"Open preview"** pop-out to
    see it full-screen on a second monitor while editing.
  - Save → a named preset, tagged player-driven ("Field Guide …") or GM-driven ("Projection …").
- Launch actions from a saved preset:
  - **Share as player view** — a link/QR the players open (their browser renders the preset).
  - **Project** — open the follow-GM view on the table screen.

## 6. Module inventory (what we already have vs. what's new)

We already have almost every ingredient — this is mostly wiring, not new engines.

Have:
- View modules: `SystemVisualizer` (2D), `HoloView` (3D), report/list rendering, `Starmap` (2D map).
- Filters/shaders: the ported Mappadux package (none, CRT green/amber, night-vision, thermal).
- Look controls: the whole `HoloStyle` set (filter, bodyStyle, background, grid, compression, bodySize,
  beltDetail, orbitSpeed, framing angle, skybox) + `BodyPicker`.
- Redaction: `computePlayerSnapshot` / `computePlayerStarmapSnapshot`.
- Sync: `broadcast.ts` (`SYNC_SYSTEM/FOCUS/TIME/…`), the `/projector` follow-GM receiver.
- Preset store: `holoPresets` (localStorage) — generalise to `playerPresets`.

New / to build:
- `lockOverhead` framing toggle (a lock icon by the angle slider) — trivial, high value (recreates 2D
  projector from the 3D engine).
- Shader **parameter** controls (per-filter sliders) — currently filters are on/off only.
- `systemView` / `starmapView` selectors (list / 2D / 3D) inside the preset.
- Chrome/branding modules: cover page, logo, company name, overlays.
- The unified preset schema + editor screen + live preview.
- Preset delivery to players (see §8 open questions).

## 7. Phasing (build order, once the design is agreed)

1. **Schema**: define `PlayerPreset` (superset of `HoloStyle` + view module + driver + chrome). Migrate the
   seven holo presets and the five guide themes into built-in `PlayerPreset`s. Back-compat: map old
   `?theme=` links to the matching preset.
2. **lock-overhead** + surface a "Projection (2D-style)" built-in preset from the holo engine. Point
   `/projector` at a preset (or fold it into the unified viewer) — begin retiring the bespoke 2D projector.
3. **Preset editor screen** in the main app (rail icon → modal: control panel + live preview + save).
   Reuse `holo-panel`, generalised.
4. **Shader params** + `systemView` selector wired into the editor.
5. **follow-GM for the holo/unified viewer** — the projection view honours `SYNC_FOCUS`/`SYNC_TIME`. Unify
   the `/projector` and `/catalogue` receivers onto one path.
6. **Chrome/branding** modules (cover page, logo, company, overlays).
7. **Deprecate** the bespoke guide themes + 2D projector in favour of presets; keep the report export.

Ship each phase to beta; the current guides keep working (they're just presets) throughout.

## 8. Open questions / edge cases to resolve before building

- **Preset delivery to players.** Player presets are the GM's local `localStorage`. For a *player-driven*
  guide, the player's browser needs the preset. Options: embed the preset in the share link (fine — presets
  are small), or push it over the channel (a `SYNC_PRESET` message, like today's `SYNC_GUIDECONFIG`). Likely
  both: link for cold-open, channel for live changes.
- **Which look controls apply to which view module.** `bodyStyle`/`grid`/`orbitSpeed` are meaningless for a
  `list` view; the editor should show only the controls the chosen module supports (progressive disclosure).
- **Filters across view modules.** The shader pass is a screen-space post-process; it should apply uniformly
  to 2D and 3D (and maybe the list) so a "CRT" preset looks consistent regardless of view module.
- **Interactivity vs projection.** A projection is usually non-interactive (a display surface); a guide is
  interactive. Is that a separate flag or implied by `followGM`? Propose a distinct `interactive` flag so a
  GM can make a *locked* guide (kiosk) too.
- **Report/print.** Keep as an export path off the `list` module rather than forcing the printed document
  into the live viewer.
- **Naming & migration.** Users have saved holo presets already; migrate them, don't drop them. Built-in
  presets should be duplicable so a GM starts from "CRT Green" and tweaks.
- **Duplication kill-list.** Once the unified viewer covers a case, retire the older bespoke code (guide
  theme components, `/projector`) deliberately, one at a time, after parity is confirmed.

## 9. One-paragraph summary

We already have all the elements — view modules (list / 2D / 3D), a shader filter stack, the full holo look
controls, redaction, and GM-follow sync. This design pours them into one **preset-driven player-presentation
engine**. A preset chooses a view module, a look (filters + colours + grid + framing, including an
overhead-lock that recreates the 2D projector), chrome (cover, logo, labels), and a single `followGM` flag
that turns any preset into a GM-driven projection. The GM designs presets in the main app against a live
preview and either shares them as player guides or projects them. Every current artifact — Guide, Projection,
Greenscreen, CRT, Holo — becomes a named preset of the one tool.
