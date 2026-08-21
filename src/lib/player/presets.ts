// Built-in player presets, defaults, and migration. See presetTypes.ts + the design doc.
import type { HoloStyle } from '$lib/holo/holoStyle';
import type { PlayerPreset, ViewModule, FilterParamValues } from './presetTypes';

// CRT phosphor colours for the consolidated single `crt` filter (replaces the green/amber pair).
export const CRT_GREEN = '#4dff88';
export const CRT_AMBER = '#ffb000';

// Accent can be a hex colour OR the sentinel 'rainbow' (recreates The Guide's original colourful
// look — chrome/labels use the gradient where they can, else a representative mid colour).
export const RAINBOW = 'rainbow';
export const RAINBOW_GRADIENT = 'linear-gradient(90deg,#ff4d4d,#ff9f43,#ffd93d,#4dff88,#4db8ff,#9d6bff,#ff5ecd)';
export const RAINBOW_MID = '#ffd93d'; // fallback where a single colour is needed (a solid swatch)
export const isRainbow = (accent: string | undefined): boolean => accent === RAINBOW;
export const accentSolid = (accent: string | undefined): string => (isRainbow(accent) ? RAINBOW_MID : (accent || '#6aa0ff'));

// Starter assets shipped with the app, so placement can be designed before any upload. `dataUrl`
// here is a same-origin STATIC URL rather than a data: URL — <img src> treats both identically and
// built-ins never need to ride the starmap file.
export const BUILTIN_ASSETS: import('./presetTypes').PlayerAsset[] = [
  { id: 'builtin-sse-logo', name: 'SSE2 (starter logo)', dataUrl: '/images/logo/SSE.png' },
  { id: 'builtin-wy-logo', name: 'Weyland-Yutani (starter logo)', dataUrl: '/images/logo/Weyland-Yutani.png' },
  // World Zero's Corporate Portfolio, CC BY 4.0 — credited in the About box, which is where the
  // attribution obligation is discharged for every bundled image.
  { id: 'builtin-interspan-logo', name: 'Interspan (starter logo)', dataUrl: '/images/logo/interspan_stack@2x.png' },
  { id: 'builtin-kelido-logo', name: 'Kelido (starter logo)', dataUrl: '/images/logo/kelido_stack@2x.png' },
  { id: 'builtin-nexum-logo', name: 'Nexum (starter logo)', dataUrl: '/images/logo/nexum_stack@2x.png' },
  { id: 'builtin-terra-logo', name: 'Terra (starter logo)', dataUrl: '/images/logo/terra_stack@2x.png' },
  { id: 'builtin-tsec-logo', name: 'TSEC (starter logo)', dataUrl: '/images/logo/tsec_stack@2x.png' }
];

// Curated zero-byte font stacks (no webfont files; native everywhere). `css` is a font-family list.
export const FONT_STACKS: { id: string; label: string; css: string }[] = [
  { id: 'sans', label: 'Clean sans', css: 'system-ui, sans-serif' },
  { id: 'mono', label: 'Terminal mono', css: 'ui-monospace, "Cascadia Mono", Consolas, monospace' },
  { id: 'serif', label: 'Book serif', css: 'Georgia, "Times New Roman", serif' },
  { id: 'narrow', label: 'Narrow', css: '"Arial Narrow", "Helvetica Condensed", system-ui, sans-serif' },
  { id: 'rounded', label: 'Rounded', css: '"Comic Sans MS", "Segoe UI", system-ui, sans-serif' },
  { id: 'typewriter', label: 'Typewriter', css: '"Courier New", Courier, monospace' }
];

// A neutral base every preset (and the migration) builds on, so new fields always have a sane value.
export const DEFAULT_PRESET: PlayerPreset = {
  id: 'default',
  name: 'Untitled',
  description: '',
  followGM: false,
  interactive: true,
  cover: { enabled: false, title: '', subtitle: '', body: '', label: '', graphic: null },
  starmapEnabled: true,
  starmapView: 'diagram2d',
  systemEnabled: true,
  systemView: 'holo3d',
  documentStyle: 'guide',
  tagStyle: 'pills',
  navStyle: 'chips', // side-by-side buttons that wrap — a 13-planet list is 2 rows, not 13
  starmapLayout: 'list', // G1: the shipped arrangement stays the default; 'dossier' is opt-in
  starmapFieldIcons: true,
  starmapFontScale: 1,
  photoFrame: 'letterbox',
  transition: 'none',
  transitionParams: {},
  font: 'system-ui',
  accentColor: '#6aa0ff',
  starmapOverlay: null,
  systemOverlay: null,
  // G16: the campaign's map background shows on a player view unless the GM turns it off here. The
  // ANCHOR is never copied onto a preset - a georeferenced picture with two anchors is a picture
  // that can fall out of register with the GM's own map.
  showMapBackground: true,
  companyName: '',
  footerText: '',
  defaultRateIndex: 2,
  defaultPlaying: true,
  guideTips: 'off',
  filter: 'none',
  filterParams: {},
  bodyStyle: 'textured',
  render: 'filled',
  unlit: false,
  lensing: true,
  auroras: true,
  atmospheres: true,
  // OFF by default: the reference-work reading. A preset that is an INSTRUMENT turns it on
  // (Datapad, Console below). See A29.
  liveReadings: false,
  bodyGfx: 'sphere',
  beltStyle: 'rocks',
  starmapRouteGlow: true,
  starmapGridDepth: 0,
  starmapGridFalloff: 0.5,
  starmapStarScale: 0,
  starmapStarSize: 1,
  gridFalloff: 0,
  gridDepth: 0,
  gridScaleAu: 0,      // automatic — the decade ladder, as it has always been
  orbitOpacity: 1,
  starmapMono: false,
  background: 'space',
  grid: 'plain',
  // Owner's calibration, 2026-08-17: 80% is the readable default for BOTH dials. They are the same
  // trade — 0% is physical truth (true distances, true radii) and 1 is the fully readable
  // exaggeration — so they are set together and to the same number rather than drifting apart.
  compression: 0.8,
  bodySize: 0.8,
  beltDetail: 0.6,
  orbitSpeed: 0,
  lockRotation: true, // 2D views are fixed maps by default
  skybox: true,
  angleDeg: 64,
  lockOverhead: false,
  whole: false,
  labelSize: 11,
  markerStyle: 'label', // the chip itself — the map and the panel agree by default
  markerSize: 1,
  flagStaff: 'silver',  // reads on the dark backdrop most player views use, and on a light document
  pinText: 'initial',   // the shipped look
  hideInfoPanel: false,
  inspectorWidthPct: 0.26,
  infoFontScale: 1
};

function preset(p: Partial<PlayerPreset> & { id: string; name: string; description: string }): PlayerPreset {
  return { ...DEFAULT_PRESET, builtIn: true, ...p, cover: { ...DEFAULT_PRESET.cover, ...(p.cover ?? {}) } };
}

// THE SHIPPED SIX. Tuned by the owner against the live editor and adopted wholesale on 2026-08-17 —
// these are not guesses, they are the exported values of six presets he built and looked at. Written
// as DELTAS from DEFAULT_PRESET rather than as full objects, so a shared default stays shared and a
// line here always means "this preset deliberately differs".
//
// Between them they now exercise most of the engine, which is the other reason they exist: four
// document arrangements, three starmap views, a cover with an uploaded graphic, per-screen overlays,
// four transitions, a fully-tuned CRT filter, wireframe and lo-poly renders, charted stars, and pin
// markers. A GM opening the picker should be able to SEE what the tool can do.
//
// Font stacks referenced below (kept in sync with FONT_STACKS).
const F_MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';
const F_TYPEWRITER = '"Courier New", Courier, monospace';
const F_NARROW = '"Arial Narrow", "Helvetica Condensed", system-ui, sans-serif';
const F_ROUNDED = '"Comic Sans MS", "Segoe UI", system-ui, sans-serif';

export const BUILTIN_PRESETS: PlayerPreset[] = [
  // The Guide: friendly + ILLUSTRATED. The starmap is the DIAGRAM arrangement of the document (system
  // shapes drawn per row), the system is the canvas guide document, and the whole thing is oversized
  // — 1.55x on both scales — because it is meant to be read across a table rather than held.
  preset({
    id: 'guide', name: 'The Guide', description: "A traveller's field guide — friendly, illustrated, mostly accurate.",
    starmapView: 'list', systemView: 'document',
    starmapLayout: 'diagram', starmapFontScale: 1.55, infoFontScale: 1.55,
    documentStyle: 'guide', bodyGfx: 'flat', accentColor: RAINBOW,
    font: 'system-ui, sans-serif', headingFont: F_ROUNDED,
    guideTips: 'both',
    transition: 'wipe', transitionParams: { direction: 'up', duration: 800 },
    cover: { enabled: true, title: "DON'T PANIC!", subtitle: '', body: '', label: 'Megadodo Publications', graphic: null }
  }),
  // Datapad: a hand-held instrument feed. Company-issue — a branded cover and a watermark on both
  // stages — on black with no grid, so the photos carry the screen.
  preset({
    id: 'datapad', name: 'Datapad', description: 'A hand-held data terminal readout.',
    starmapView: 'list', systemView: 'diagram2d',
    starmapLayout: 'glyphs', starmapFontScale: 1.15, starmapDocumentStyle: 'holotable',
    bodyGfx: 'photo', photoFrame: 'sliver', tagStyle: 'grouped-list',
    accentColor: '#5bd7ff', font: F_MONO,
    background: 'black', grid: 'off', beltStyle: 'band',
    compression: 0.75, bodySize: 0.95,
    inspectorWidthPct: 0.3, infoFontScale: 1.35,
    liveReadings: true, // a hand-held instrument reads what is in the tanks now, not what fits in them
    constellations: 'off',
    transition: 'fade', transitionParams: { duration: 800 },
    cover: { enabled: true, title: 'Star System DataPad', subtitle: '', body: '', label: 'Company Confidential',
             graphic: { assetId: 'builtin-wy-logo', pin: 'bottom-center', sizePct: 26, opacity: 0.85, stretch: false } },
    starmapOverlay: { assetId: 'builtin-wy-logo', pin: 'bottom-right', sizePct: 14, opacity: 0.1, stretch: false },
    systemOverlay: { assetId: 'builtin-wy-logo', pin: 'bottom-right', sizePct: 7, opacity: 0.15, stretch: false }
  }),
  // Console: a ship's own plot. Tight spread (0.4) and a scaled grid, so distances read as distances;
  // lo-poly bodies and big labels for a screen glanced at rather than studied. The only preset that
  // marks the CHARTED STARS with names — a bridge crew would have them.
  preset({
    id: 'console', name: 'Console', description: 'A ship-console orbital plot.',
    systemView: 'diagram2d', bodyGfx: 'flat', tagStyle: 'grouped',
    accentColor: '#55f77d', font: F_MONO,
    render: 'lopoly-filled', grid: 'scaled', compression: 0.4, bodySize: 0.75,
    // Explicit now that belts are decoupled from the render: lo-poly USED to imply dotted belts, and
    // this is the look the preset was tuned against.
    beltStyle: 'points',
    labelSize: 21, infoFontScale: 1.2, defaultRateIndex: 1,
    liveReadings: true, // a ship's own console is the one surface that certainly knows its own state
    starmapDropLines: true,
    constellations: 'marked', constellationBoost: 0.4, constellationLabelSize: 16,
    transition: 'crt_collapse', transitionParams: { duration: 1200, glow_color: 0 },
    starmapOverlay: { assetId: 'builtin-sse-logo', pin: 'bottom-left', sizePct: 15, opacity: 0.1, stretch: false },
    systemOverlay: { assetId: 'builtin-sse-logo', pin: 'bottom-left', sizePct: 15, opacity: 0.1, stretch: false }
  }),
  // CRT Terminal: a salvaged green-phosphor set. The filter is fully tuned rather than left at its
  // defaults — that is the point of shipping it, since the CRT's controls are the deepest in the tool
  // and a GM should have a worked example to start from. Wireframe bodies, greyscale starmap, and the
  // CARDS list style, which is what gives the document its blocky terminal feel.
  preset({
    id: 'crt', name: 'CRT Terminal', description: 'A green-phosphor CRT terminal with scanlines.',
    starmapView: 'list', systemView: 'document',
    documentStyle: 'terminal', starmapDocumentStyle: 'greyscale', listStyle: 'cards', tagStyle: 'list',
    starmapFontScale: 1.65, infoFontScale: 2.5, starmapGridFalloff: 0.3,
    accentColor: '#ffffff', font: F_TYPEWRITER,
    bodyStyle: 'white', render: 'wire-flat-occ', starmapMono: true, beltStyle: 'points',
    filter: 'crt',
    filterParams: {
      phosphor: CRT_GREEN, tint: 0.65, contrast: 0.85, brightness: 1.85, vignetteAmount: 0.85,
      distortion: 0, tearFrequency: 4.2, noiseBarWidth: 2.5,
      scanlineIntensity: 0.89, scanlineThickness: 4, skew: -0.02
    },
    transition: 'scanline', transitionParams: { duration: 2000, cols: 70, rows: 30 },
    cover: { enabled: true, title: 'Star Catalogue ', subtitle: 'V0.56-beta', body: '', label: '', graphic: null }
  }),
  // Holo Table: 3D at BOTH levels — the only preset whose starmap is the tilted 3D map, with the grid
  // curtain switched on to make its depth readable. Pin markers at 1.8x, because a holo table is
  // looked at from across the room.
  preset({
    id: 'holo', name: 'Holo Table', description: 'A 3D holographic orrery table.',
    starmapView: 'holo3d', systemView: 'holo3d',
    bodyGfx: 'photo', tagStyle: 'grouped', font: F_NARROW,
    grid: 'scaled', starmapGridDepth: 0.25, starmapGridFalloff: 0.7,
    markerStyle: 'pin', markerSize: 1.8,
    inspectorWidthPct: 0.21, infoFontScale: 1.4, liveReadings: true,
    // Spikes and no names: the pattern is the point, and a labelled sky competes with the map.
    constellations: 'marked', constellationBoost: 0, constellationLabelSize: 0,
    transition: 'static_dissolve', transitionParams: { duration: 700, block_size: 8 }
  }),
  // Projection: the Holo Table handed to the GM. followGM + non-interactive makes it a display rather
  // than a thing to poke, and a slow view-orbit keeps it alive on a table nobody is touching.
  // NOTE it is no longer the overhead greenscreen plate it used to be — the owner rebuilt it on the 3D
  // table (tilted, starfield on, true-ish spread). Background → Greenscreen still makes it OBS-ready.
  preset({
    id: 'projection', name: 'Projection (GM-driven)',
    description: 'A 3D holographic orrery table that follows the GM. Set Background to Greenscreen for OBS.',
    followGM: true, interactive: false,
    starmapView: 'holo3d', systemView: 'holo3d',
    bodyGfx: 'photo', grid: 'scaled', starmapGridDepth: 0.25, starmapGridFalloff: 0.7,
    orbitSpeed: 0.05,
    markerStyle: 'pin', markerSize: 1.8,
    inspectorWidthPct: 0.32, infoFontScale: 1.45, liveReadings: true,
    constellations: 'marked', constellationBoost: 0, constellationLabelSize: 0,
    transition: 'static_dissolve', transitionParams: { duration: 700, block_size: 8 }
  })
];

// Fill any missing fields on a stored preset with current defaults — presets saved by an older beta
// (schema grows every increment) stay loadable without per-field guards everywhere.
function fixGraphic(g: any): any {
  if (!g) return null;
  return { assetId: g.assetId, pin: g.pin ?? 'center', sizePct: g.sizePct ?? 40, opacity: g.opacity ?? 1, stretch: !!g.stretch };
}
export function normalizePreset(p: Partial<PlayerPreset> & { id: string; name: string }): PlayerPreset {
  const base = structuredClone(DEFAULT_PRESET);
  const cover = { ...base.cover, ...(p.cover ?? {}) };
  cover.graphic = fixGraphic(cover.graphic);
  return {
    ...base,
    ...p,
    bodyStyle: (p.bodyStyle as string) === 'tint' ? 'white' : (p.bodyStyle ?? base.bodyStyle),
    cover,
    // The stage's own grid TYPE, falling back to the field both stages used to share. Same shape as
    // the `starmapOverlay ?? overlay` line above, and for the same reason: a stage-specific choice that
    // has to keep reading a preset authored before it existed.
    starmapGrid: p.starmapGrid ?? p.grid ?? base.grid,
    starmapOverlay: fixGraphic((p as any).starmapOverlay ?? (p as any).overlay),
    systemOverlay: fixGraphic((p as any).systemOverlay ?? (p as any).overlay),
    filterParams: { ...(p.filterParams ?? {}) },
    description: p.description ?? ''
  };
}

// Map the old localStorage HoloStyle filter ids onto the consolidated CRT + phosphor param.
function migrateFilter(filter: string): { filter: string; filterParams: FilterParamValues } {
  if (filter === 'retro_sci_fi_green') return { filter: 'crt', filterParams: { phosphor: CRT_GREEN } };
  if (filter === 'retro_sci_fi_amber') return { filter: 'crt', filterParams: { phosphor: CRT_AMBER } };
  return { filter: filter || 'none', filterParams: {} };
}

// Convert a saved HoloStyle preset (localStorage) into a PlayerPreset. These are GM-created player
// presets — a holo 3D system view — so they migrate straight in rather than being dropped.
export function holoPresetToPlayer(hp: HoloStyle & { id?: string; name?: string }): PlayerPreset {
  const { filter, filterParams } = migrateFilter(hp.filter);
  return {
    ...DEFAULT_PRESET,
    id: hp.id ?? 'migrated',
    name: hp.name ?? 'Imported preset',
    description: 'Imported from a saved holo look.',
    systemView: 'holo3d',
    filter, filterParams,
    bodyStyle: (hp.bodyStyle === 'tint' ? 'white' : hp.bodyStyle) ?? 'textured',
    render: hp.render ?? 'filled',
    background: hp.background ?? 'space',
    grid: hp.grid ?? 'plain',
    compression: hp.compression ?? 0.65,
    bodySize: hp.bodySize ?? 1,
    beltDetail: hp.beltDetail ?? 0.6,
    orbitSpeed: hp.orbitSpeed ?? 0,
    skybox: hp.skybox ?? true,
    angleDeg: hp.angleDeg ?? 64,
    whole: hp.whole ?? false
  };
}

// Extract the HoloStyle subset a PlayerPreset carries, for feeding HoloView. lockOverhead pins the
// tilt to top-down (the flat-projector look) regardless of the stored angle.
export function holoStyleOf(p: PlayerPreset): HoloStyle {
  return {
    filter: p.filter,
    // Resolved EXACTLY as Starmap3DView resolves its own (`mono ? '#dfe6f0' : accentColor`), because
    // the complaint was that the two disagreed — so the rule has to be one rule, not two that happen
    // to agree today. `accentSolid` flattens 'rainbow' to a usable single colour, as everywhere else
    // a sentinel meets a canvas.
    labelColor: p.bodyStyle === 'white' ? '#dfe6f0' : accentSolid(p.accentColor),
    filterParams: p.filterParams ? { ...p.filterParams } : undefined,
    compression: p.compression,
    angleDeg: p.lockOverhead ? 0 : p.angleDeg,
    lockOverhead: p.lockOverhead,
    lockRotation: p.lockOverhead ? p.lockRotation !== false : false, // 3D spins freely unless pinned flat
    whole: p.whole,
    skybox: p.skybox,
    beltDetail: p.beltDetail,
    bodyStyle: p.bodyStyle,
    render: p.render,
    unlit: p.unlit,
    lensing: p.lensing !== false, // default on
    auroras: p.auroras,
    atmospheres: p.atmospheres !== false,
    beltStyle: p.beltStyle,
    background: p.background,
    bodySize: p.bodySize,
    grid: p.grid,
    gridFalloff: p.gridFalloff ?? 0,
    gridDepth: p.gridDepth ?? 0,
    // Sanitised HERE, not only in the scene: a cell is a DISTANCE, so NaN or Infinity is not a
    // value the rest of the app should ever see. `?? 0` would pass both through, and every later
    // reader would have to re-check. 0 means automatic, which is the safe reading of nonsense.
    gridScaleAu: Number.isFinite(p.gridScaleAu) && (p.gridScaleAu as number) > 0 ? (p.gridScaleAu as number) : 0,
    // G5: travels with the preset, so a player window gets the GM's chosen strength for THIS view.
    orbitOpacity: p.orbitOpacity ?? 1,
    constellations: p.constellations ?? 'off', // G9
    constellationBoost: p.constellationBoost ?? 0.35,
    constellationLabelSize: p.constellationLabelSize ?? 11,

    orbitSpeed: p.orbitSpeed,
    labelSize: p.labelSize,
    font: p.font
  };
}

/**
 * The HoloStyle a preset's SYSTEM stage actually renders with. The "2D map" is the same holo engine
 * locked flat: overhead, unlit, no turntable (that's a 3D idea), and pinned unless the GM unticked Lock
 * rotation. ONE definition so the editor preview and the live player view can never drift apart — they
 * did exactly that once, and the preview quietly lied about colour and body graphics for weeks.
 */
export function systemStageStyle(p: PlayerPreset, base?: HoloStyle): HoloStyle {
  // NO SYSTEM MAP EVER DRAWS BODY GRAPHICS — see holo/scene.ts, which no longer has a way to. "Body
  // graphics" (photo / disc / flat / none) is an INFO-BLOCK choice, the per-body picture; the map, 2D or
  // 3D, always uses the real render. `bodyGfx` therefore never reaches a HoloStyle at all; it used to,
  // and this function suppressed it for `holo3d` only, which left the 2D map flattening every world into
  // a sprite (and, as a side effect, skipping the wireframe/low-poly render styles, which only exist on
  // the sphere path).
  const s = base ?? holoStyleOf(p);
  if (p.systemView !== 'diagram2d') return s;
  // A 2D map is ALWAYS flat — lockOverhead is not the GM's to unset here, or unticking Lock rotation
  // would tilt it into a 3D view. Lock rotation only fixes the HEADING (spin + follow-by-pan).
  return { ...s, angleDeg: 0, unlit: true, lockOverhead: true, lockRotation: p.lockRotation !== false, orbitSpeed: 0 };
}

// Slug-based id, made unique against a set of existing ids (deterministic — no RNG).
export function makePresetId(name: string, existing: Iterable<string>): string {
  const base = 'pp-' + (name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'preset');
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// Duplicate a preset (built-in or custom) into an editable copy.
export function duplicatePreset(src: PlayerPreset, existing: Iterable<string>): PlayerPreset {
  const name = `${src.name} copy`;
  return { ...structuredClone(src), builtIn: false, id: makePresetId(name, existing), name };
}

const HOLO_PRESETS_KEY = 'holo-presets';

// One-time import of any previously-saved localStorage holo presets into a starmap's preset list.
// Returns the presets to merge (custom only — built-ins ship in code) and clears the key so it only
// happens once. Safe to call with no localStorage (SSR) — returns [].
export function migrateLocalHoloPresets(existingIds: Iterable<string>): PlayerPreset[] {
  if (typeof localStorage === 'undefined') return [];
  let saved: any[] = [];
  try {
    saved = JSON.parse(localStorage.getItem(HOLO_PRESETS_KEY) || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(saved) || saved.length === 0) return [];
  const taken = new Set(existingIds);
  const out: PlayerPreset[] = [];
  for (const hp of saved) {
    if (!hp || hp.builtIn || !hp.name) continue;
    const pp = holoPresetToPlayer(hp);
    pp.id = makePresetId(pp.name, taken);
    taken.add(pp.id);
    out.push(pp);
  }
  try { localStorage.removeItem(HOLO_PRESETS_KEY); } catch { /* ignore */ }
  return out;
}
