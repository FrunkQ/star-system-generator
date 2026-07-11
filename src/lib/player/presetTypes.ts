// Unified player-view presets. A PlayerPreset is the complete parametrisation of ONE player-facing
// presentation — cover page, starmap view, system view, theme and look — so every current artifact
// (the guide themes, the projector, greenscreen) becomes a named preset of one engine. See
// docs/dev/unified-player-view-design.md. Presets + their uploaded assets are saved WITH the starmap
// (campaign data), not in localStorage.

// The three view modules a layer can use. `holo3d` for the starmap (galaxy view) is not built yet —
// the editor offers it disabled until it exists.
export type ViewModule = 'list' | 'diagram2d' | 'holo3d';

// A 9-point anchor for placing a graphic on the cover or as a map overlay.
export type PinPosition =
  | 'top-left'    | 'top-center'    | 'top-right'
  | 'center-left' | 'center'        | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export const PIN_POSITIONS: PinPosition[] = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right'
];

// An uploaded image, stored on the starmap (data URL — PNG transparency preserved). A campaign can
// hold any number; presets reference them by id, so one upload can appear on several presets.
export interface PlayerAsset {
  id: string;
  name: string;
  dataUrl: string; // "data:image/png;base64,…" — mime carried in the URL
}

// A placement of one asset. Rendered INSIDE the filtered layer, so the same visual filter (CRT etc.)
// applies to it; PNG alpha is respected. `sizePct` is the graphic's width as a percentage of the
// viewport width (1–100); height follows the image's aspect ratio.
export interface GraphicPlacement {
  assetId: string;
  pin: PinPosition;
  sizePct: number; // 1..100 — width as % of the surface (height follows aspect) unless `stretch`
  opacity: number; // 0..1
  stretch: boolean; // fill the whole surface, ignoring aspect ratio (pin/size ignored)
}

// The cover / hold screen. Must be able to recreate "DON'T PANIC" or "ACME — CONFIDENTIAL + logo".
export interface CoverConfig {
  enabled: boolean;
  title: string;
  subtitle: string;
  body: string;
  label: string; // small stamp, e.g. "CONFIDENTIAL"
  graphic: GraphicPlacement | null;
}

// Free-form per-filter control values (slider/toggle/colour/select), keyed by the filter's param id.
export type FilterParamValues = Record<string, number | boolean | string>;

export interface PlayerPreset {
  id: string;
  name: string;        // shown on the picker card
  description: string; // shown on the picker card — carries the preset's PURPOSE
  builtIn?: boolean;   // shipped in code; not deletable; duplicable

  // Driver — the two independent behavioural flags.
  followGM: boolean;    // honour the GM's SYNC_FOCUS/SYNC_TIME (projection-style, effectively read-only)
  interactive: boolean; // players may click/focus/scrub (false = a locked display surface / kiosk)

  // The three designable layers. Each can be disabled — a preset need not have every layer; players
  // simply never see navigation to a disabled layer (skip + hide).
  cover: CoverConfig;
  starmapEnabled: boolean;
  starmapView: ViewModule;
  systemEnabled: boolean;
  systemView: ViewModule;

  // Preset-wide theme.
  font: string;            // one UI font across the player view
  accentColor: string;     // broad colour scheme (spectrum pick) — drives chrome/labels/tints
  // Per-screen overlays: each screen can place ANY uploaded image, independently (different image,
  // different position). The cover's own image lives in cover.graphic.
  starmapOverlay: GraphicPlacement | null;
  systemOverlay: GraphicPlacement | null;
  companyName: string;
  footerText: string;

  // Look (generalised HoloStyle). Controls the editor shows are gated by the chosen view module.
  filter: string;                 // filter id — 'none' | 'crt' | 'night_vision' | 'thermal'
  filterParams: FilterParamValues; // e.g. CRT phosphor colour lives here
  bodyStyle: 'textured' | 'flat' | 'white'; // colour selection: true colour / class swatch / white
  render: 'filled' | 'lopoly-filled' | 'lopoly-lines' | 'wire-glow' | 'wire-flat' | 'wire-glow-occ' | 'wire-flat-occ'; // solid vs 80s wireframe
  unlit: boolean; // flat lighting (no day/night terminator) — the efficient "2D map" look for overhead
  background: 'space' | 'green' | 'blue' | 'black';
  grid: 'off' | 'plain' | 'scaled';
  compression: number; // toytown spread 0..1
  bodySize: number;    // 1 readable .. 0 true scale
  beltDetail: number;  // 0..1
  orbitSpeed: number;  // auto view-orbit 0..1
  skybox: boolean;
  angleDeg: number;      // camera tilt from overhead
  lockOverhead: boolean; // force top-down (recreates the flat 2D projector from the 3D engine)
  whole: boolean;        // frame the whole system vs the focused body
  labelSize: number;     // in-scene body-label font size (px); the font is the theme `font`
  inspectorWidth: number; // desktop body info-panel width in px (mobile ignores it and does its own layout)
  infoFontScale: number;  // body info-panel font-size multiplier (~0.8..1.6)
}
