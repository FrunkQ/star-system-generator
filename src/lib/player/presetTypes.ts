// Unified player-view presets. A PlayerPreset is the complete parametrisation of ONE player-facing
// presentation — cover page, starmap view, system view, theme and look — so every current artifact
// (the guide themes, the projector, greenscreen) becomes a named preset of one engine. See
// docs/dev/unified-player-view-design.md. Presets + their uploaded assets are saved WITH the starmap
// (campaign data), not in localStorage.

// The three view modules a layer can use. `holo3d` for the starmap (galaxy view) is not built yet —
// the editor offers it disabled until it exists. `document` (WS2) renders the system as the interactive
// Guide document through the block-model engine — additive, does NOT replace the diagram2d→holo path.
export type ViewModule = 'list' | 'diagram2d' | 'holo3d' | 'document';

// WS2 document look (see catalogue/document/blocks.ts — the engine owns these). Re-exported here so a
// preset can carry them; type-only, so no runtime coupling between presets and the renderer.
export type { ListStyle, DocumentStyle, DocColors, TagStyle, NavStyle } from '$lib/catalogue/document/blocks';
export type { StarmapLayout } from '$lib/catalogue/document/starmapDocument';
import type { ListStyle, DocumentStyle, DocColors, TagStyle, NavStyle } from '$lib/catalogue/document/blocks';
import type { StarmapLayout } from '$lib/catalogue/document/starmapDocument';

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
  // WS5 lock-down: with the starmap stage disabled the player is dropped straight into ONE system and
  // can never reach the map. This pins WHICH one (chosen by the GM when authoring, so a shared link is
  // deterministic); unset falls back to the first charted system.
  pinnedSystemId?: string;

  // Preset-wide theme.
  font: string;            // body font across the player view
  headingFont?: string;    // document: heading font (defaults to `font`)
  accentColor: string;     // broad colour scheme (spectrum pick) — drives chrome/labels/tints
  // WS2 Guide-document theme (all optional). `documentStyle` is a COLOURATION seed that populates
  // `themeColors` (the editable per-slot colour set the renderer uses); `listStyle` the list glyphs;
  // `tagStyle` how tags render; `navStyle` plain vs boxed navigator elements.
  documentStyle?: DocumentStyle;
  listStyle?: ListStyle;
  tagStyle?: TagStyle;
  navStyle?: NavStyle;
  // G1: the ARRANGEMENT the starmap document takes — the shape, as against documentStyle's colouration
  // and listStyle's glyphs. It composes with both rather than replacing them, so the looks multiply.
  // Applies to the STARMAP document only for now; the system document is a deliberate follow-on.
  starmapLayout?: StarmapLayout;
  starmapFieldIcons?: boolean; // dossier arrangement: a glyph before each field label
  // Text size for the STARMAP document, separate from the system document's. Every width in the
  // arrangements derives from the text scale — the card grid's column count, the dossier's field
  // columns, the glyph row's disc size — so this is the control that makes them all behave.
  starmapFontScale?: number;
  // The starmap document gets its OWN colouration and per-slot colours. They used to be inherited from
  // the System step's Info Block Appearance, which is the wrong place twice over: the two stages are
  // different documents that a GM will want to look different, and the greyscale a green-screen or CRT
  // filter needs is a property of the STAGE being filtered, not of the body info block on another page.
  // Unset = fall back to the system document's, so an existing preset is unchanged.
  starmapDocumentStyle?: DocumentStyle;
  starmapThemeColors?: DocColors;
  // The starmap document's NAVIGATION LIST style, separate from the system document's.
  //
  // `listStyle` governs the drill-in lists the document engine draws — a star's planets, a planet's
  // moons and rings, the ships at a body, the row back to the parent, and the starmap's own index of
  // systems. One field drove both stages, and its only control sat under the SYSTEM step's Info Block
  // Appearance, so changing "the list style of the info block" silently restyled the starmap index
  // too (owner, 2026-08-17). Split the same way documentStyle and themeColors already are: unset
  // falls back to the system's, so no existing preset changes.
  starmapListStyle?: ListStyle;
  photoFrame?: 'letterbox' | 'full' | 'sliver'; // document: how a body photo is framed
  themeColors?: DocColors;
  // Per-screen overlays: each screen can place ANY uploaded image, independently (different image,
  // different position). The cover's own image lives in cover.graphic.
  starmapOverlay: GraphicPlacement | null;
  systemOverlay: GraphicPlacement | null;
  companyName: string;
  footerText: string;
  defaultRateIndex: number; // starting time rate (index into RATE_STEPS; default 2 = 1 s ≈ 1 h)
  defaultPlaying: boolean;  // start playing vs paused
  // "The Guide" margin notes (funny in-universe advisories) drawn INSIDE the filtered layer, on any
  // page, refreshing as the view changes. off / top edge / bottom edge / both.
  guideTips: 'off' | 'top' | 'bottom' | 'both';

  // Look (generalised HoloStyle). Controls the editor shows are gated by the chosen view module.
  filter: string;                 // filter id — 'none' | 'crt' | 'night_vision' | 'thermal'
  filterParams: FilterParamValues; // e.g. CRT phosphor colour lives here
  // Page/entry transition when the view changes (reused from Mappadux). 'none' = instant cut. The
  // engine snapshots the frame, rebuilds underneath, then animates the snapshot away to reveal it.
  transition: string;             // transition id — 'none' | 'fade' | 'crt_collapse' | 'wipe' | …
  transitionParams: FilterParamValues; // per-transition control values (duration, direction, …)
  bodyStyle: 'textured' | 'flat' | 'white'; // colour selection: true colour / class swatch / white
  render: 'filled' | 'lopoly-filled' | 'lopoly-lines' | 'wire-glow' | 'wire-flat' | 'wire-glow-occ' | 'wire-flat-occ'; // solid vs 80s wireframe
  unlit: boolean; // flat lighting (no day/night terminator) — the efficient "2D map" look for overhead
  lensing?: boolean; // stylised black-hole gravitational lensing (§A13); default on (no-op without a BH)
  auroras: boolean; // show the emissive polar aurora shells on bodies that have them
  // A construct's CURRENT levels — fuel, cargo, crew aboard — as against its permanent capacity. A star
  // catalogue would hold what a ship CAN carry; only a live instrument knows what is in the tanks right
  // now. Off = capacity alone, on = current-of-capacity. Presentation only, and deliberately so: the
  // figures still cross the wire either way (see A29 — do not turn this into a snapshot strip).
  liveReadings: boolean;
  bodyGfx: 'sphere' | 'photo' | 'disc' | 'flat' | 'none'; // body picture: 3D sphere / photo / procedural disc / flat shape / none (a new option honoured across every info surface — 2D document, 3D holo, …)
  // Belts AND rings: tumbling textured rubble, plain vector dots, or the GM orrery's flat grey band.
  // `points` was previously a side effect of picking a wireframe RENDER; it is its own choice now.
  beltStyle: 'rocks' | 'points' | 'band';
  background: 'space' | 'green' | 'blue' | 'black';
  grid: import('$lib/map/mapOverlay').MapOverlay; // WS3: shared overlay vocabulary across every view
  // G9: the campaign's OWN charted systems drawn as real stars in the 3D system view's sky. An enum,
  // not a boolean — 'true' is an honest sky, 'marked' annotates the same stars with diffraction
  // spikes and names. Optional and defaulting to 'off', so nothing already saved changes.
  constellations?: import('$lib/map/skyStars').SkyMode;
  // How hard the charted stars are pushed against the generic starfield: 0 = true brightness on a
  // full-strength backdrop, 1 = backdrop faded right down and the charted stars oversaturated. One
  // dial rather than two, because what is being set is the CONTRAST between the two populations.
  constellationBoost?: number;
  // Constellation NAME size in screen px. 0 = no names, leaving the diffraction spikes on their own.
  constellationLabelSize?: number;
  // WS7: 3D starmap DEPTH stretch, display-only (1 = true depth). True interstellar depth is tiny next
  // to the map's spread, so this exaggerates it for clarity. Never affects distances.
  zExaggeration?: number;
  starmapRouteGlow: boolean; // 2D/3D starmap: glowing transit lines (vs plain lines)
  // 3D starmap: the vertical stems from each system down to the reference plane, and the rings that
  // mark where they land. Optional and defaulting to TRUE, so nothing already saved changes — they
  // are what makes exaggerated depth readable, and turning them off is a deliberate trade for a
  // cleaner field.
  starmapDropLines?: boolean;
  starmapGridDepth?: number; // 3D starmap: how far each grid line drops a curtain, 0 (flat) .. 1
  starmapGridFalloff?: number; // starmap grid: distance fade, 0 (even) .. 1 (bright near, gone by the edge)
  gridFalloff?: number; // SYSTEM-stage ground grid: same dial, defaulted 0 so that view is unchanged unless asked
  orbitOpacity?: number; // G5: orbit-line strength 0..1, multiplying each line's designed opacity. 1 = unchanged
  starmapMono: boolean; // 2D/3D starmap: monochrome palette (white/grey) for tinting filters
  compression: number; // toytown spread 0..1
  bodySize: number;    // 1 readable .. 0 true scale
  beltDetail: number;  // 0..1
  orbitSpeed: number;  // auto view-orbit 0..1 (3D only — a 2D map never turntables)
  lockRotation: boolean; // 2D views: pin the flat top-down view (no tilt, no rotate, no turntable)
  skybox: boolean;
  angleDeg: number;      // camera tilt from overhead
  lockOverhead: boolean; // force top-down (recreates the flat 2D projector from the 3D engine)
  whole: boolean;        // frame the whole system vs the focused body
  labelSize: number;     // in-scene body-label font size (px); the font is the theme `font`
  // How a highlighted tag reads on THIS view. The colour always comes from the tag or its category —
  // this only chooses the shape, and every shape carries its text so it survives a CRT or colour-blind
  // filter. An individual highlight may still override it (HighlightRef.style).
  //   'label' — the tag chip itself, under the body name. The panel and the map agree exactly.
  //   'pin'   — a map pin with the tag's initials. Fewest pixels, best when a lot is highlighted.
  //   'flag'  — the chip flown from a short staff. Most readable at a glance; tallest.
  markerStyle: 'label' | 'pin' | 'flag';
  // Marker size, as a MULTIPLE of the badge's natural size (0.6 x the body-name size). Its own dial
  // rather than a share of `labelSize`, because a GM sizes names for reading and markers for
  // spotting, and those two wants pull in opposite directions on a busy map. 1 = as drawn before.
  markerSize: number;
  // A flag's staff. It was the tag's colour, which doubled the coloured area and read as a fat tail;
  // it was then black, which is invisible on the space backdrop most player views use. So it is a
  // choice, because no fixed colour wins on every background. 'tag' restores the original look.
  flagStaff: 'silver' | 'gold' | 'white' | 'black' | 'tag';
  // What a PIN carries. 'initial' is the 1-2 letters on the head (the original); 'name' puts the full
  // tag label to the RIGHT of the pin in the document's own text colour, leaving the head clean;
  // 'none' is the shape alone, for a map where the colour key lives somewhere else.
  pinText: 'none' | 'initial' | 'name';
  hideInfoPanel: boolean; // system page: never show the body info panel (a clean display; tap still frames)
  inspectorWidthPct: number; // desktop body info-panel width as a FRACTION of the viewport width (0..1).
                             // A proportion, not a pixel count: the GM authors on one screen and players
                             // read on another, so 28% of the display is a promise that travels and
                             // "340px" is not. Mobile ignores it and does its own layout.
  infoFontScale: number;  // body info-panel font-size multiplier (0.8..2.5; renderDocument clamps to the same range)
}
