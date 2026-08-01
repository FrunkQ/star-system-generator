// WS2 GUIDE-DOCUMENT ENGINE — block model + theme.
//
// The player "info screen" (the Guide document, the per-body info block, and — from Phase 5 — the 3D
// holo HUD chrome) is a DATA MODEL of stacked blocks that ONE engine (`renderDocument`) draws to a
// canvas, specifically so the existing GPU CRT/night-vision/thermal shader can WRECK it. Styles are
// engine PARAMETERS (a theme: font + a full colour set + a list/document style enum), never separate
// code paths — a warm illustrated field-guide book and a formal green-screen terminal report are the
// SAME renderer with different themes. See docs/dev/v2.2-player-view-visual-overhaul.md §WS2/§8 and the
// project_sse_v2_2_ws2_guide_document memory.
//
// Phase 1 defines the model + the engine over it, and proves it by re-expressing the info card as
// blocks. Phases 2-5 add the `schematic` draw, the interactive navigator + hit-map, the listStyle
// range, and point the 3D HUD at this same engine.

// --- Look enums (theme-driven; a preset picks these, the engine branches on them) -------------------

// How a `list` block renders its items. One data shape, many genre looks — chosen per preset. Phase 1
// implements 'plain'; Phase 4 fills the rest. Kept as a widening union so presets serialised now stay
// valid as variants land.
export type ListStyle =
  | 'plain'                // simple hanging bullets
  | 'illustrated-bullets'  // book: glyph bullets, generous leading
  | 'numbered-dossier'     // report: 1. 2. 3. numbered
  | 'terminal-log'         // terminal: '>' prefixed, monospace feel, tight
  | 'ledger'               // ruled table rows
  | 'manifest'             // ticker / cargo-manifest columns
  | 'cards';               // pickable bordered boxes, several across the page — width picks how many

// The overall document skin — one renderer, many looks. Each maps to a full base theme in
// documentStyles.ts (font + colour set + list glyphs); a preset's explicit fields override it.
export type DocumentStyle =
  | 'guide'      // dark, illustrated field guide (serif, gold-on-dark, rainbow schematic)
  | 'report'     // monocolour company report (white paper, black ink, bold sans, numbered)
  | 'brochure'   // pretty travel brochure (warm cream, coral/teal, illustrated)
  | 'terminal';  // green-screen terminal (phosphor mono, '>' log lines) — shines under CRT

// How navigator rows + key elements render: plain hanging text, or boxed "buttons".
// 'plain'  hanging-bullet rows, one per line (the book look)
// 'boxed'  one full-width rounded button per line
// 'chips'  buttons flowing SIDE BY SIDE across the page and wrapping — a thirteen-planet list is two
//          rows instead of thirteen, which is why it is the default
export type NavStyle = 'plain' | 'boxed' | 'chips';

// The full colour set threaded through EVERY text draw (not just an accent). Light-on-dark by default
// so a luminance-tinting filter (CRT/NV) colours it; a `mono` theme collapses everything to grey/white
// and lets the filter do all the colouring. All optional so a caller can specify only what differs
// from the resolved defaults (see resolveDocColors).
export interface DocColors {
  bg?: string;       // page ground (the filter needs something to tint everywhere)
  heading?: string;  // headings / titles (the "accent" colour)
  body?: string;     // body / description text
  label?: string;    // key labels, sub-headings, dim captions
  value?: string;    // key values (the right-hand column of a keyValue row)
  rule?: string;     // dividers / underlines / table rules
  accent?: string;   // stamps, prefixes, bullets, list glyphs
  dim?: string;      // faint furniture (close glyph, footers)
}

export interface DocTheme {
  font: string;              // body font family stack, from the preset
  headingFont?: string;      // heading font (falls back to `font`)
  fontScale?: number;        // multiplier on every text size (~0.7..1.8); default 1
  mono: boolean;             // white/monochrome scheme: BLEACH the whole page to grey so a filter tints it
  accent: string;            // the preset accentColor ('rainbow' or a hex) — resolves the accent slot
  colors?: DocColors;        // the editable colour set (seeded from a documentStyle, tweaked per-slot)
  listStyle?: ListStyle;     // default 'plain'
  documentStyle?: DocumentStyle; // colouration seed (guide/report/brochure/terminal)
  navStyle?: NavStyle;       // how navigator rows / key elements render (plain text vs boxed)
}

// --- Block model ------------------------------------------------------------------------------------

// A caller-supplied hit id makes a block (or a list's items) selectable by a warp-mapped tap — the
// navigator (Phase 3) reads back the drawn regions. Blocks with no id are pure decoration.
export interface DocBlockBase {
  id?: string;       // hit-map id (a body id for the navigator; omit for non-interactive content)
  selected?: boolean; // draw the "current" highlight for this block/row
  // ZEBRA. Set by the BUILDER on a block that is one entry of a long repeating run, as its index: the
  // renderer washes the odd ones very faintly so the eye can hold its line down the column. Only the
  // blocks that ARE a row set it — a list draws its own stripes from its item index instead.
  band?: number;
}

export interface HeadingBlock extends DocBlockBase {
  kind: 'heading';
  text: string;
  level?: 1 | 2 | 3; // 1 = level 1 = title, 2 = section, 3 = minor; default 1
  sub?: string;      // small uppercase strap under the heading (e.g. the body's role)
  // Set by the BUILDER, like ListItem.color: a specific hue for THIS heading, which wins over the
  // theme's heading colour and over the rainbow gradient. It exists so a repeated heading — one per
  // system in the starmap dossier — can walk the spectrum an entry at a time instead of every heading
  // carrying the whole sweep. A mono theme still bleaches it, as it bleaches everything.
  color?: string;
}
export interface TextBlock extends DocBlockBase {
  kind: 'text';
  text: string;
  italic?: boolean;
  align?: 'left' | 'center' | 'right'; // default left
}
export interface KeyValueBlock extends DocBlockBase {
  kind: 'keyValue';
  label: string;
  value: string;
}
// How the body's tags render (feedback: coloured pills / plain text list / grouped by type).
export type TagStyle = 'pills' | 'grouped' | 'grouped-list' | 'list';
export interface TagItem { label: string; color: string; group?: string; }
export interface TagsBlock extends DocBlockBase {
  kind: 'tags';
  tags: TagItem[];
  style?: TagStyle; // overrides the theme/preset default
}

// `color` is set by the BUILDER, not chosen by the renderer: in the Guide's rainbow mode each drill-in
// button takes the same hue as that body's marker on the chart above, so a chip and its dot match.
export interface ListItem { id?: string; text: string; selected?: boolean; sub?: string; color?: string; }
export interface ListBlock extends DocBlockBase {
  kind: 'list';
  items: ListItem[];
  style?: ListStyle; // overrides the theme's listStyle for this block
  // Overrides the theme's navStyle for this block, the same way `style` overrides its listStyle. It
  // exists for a list that is a single ACTION rather than a navigator: the starmap dossier's "System
  // data" button is one item, and a full-width bar is the wrong shape for it however the reader's
  // multi-item lists are set. A navigator list should NOT set this — those compose with the preset.
  nav?: NavStyle;
}
export type PhotoFrame = 'letterbox' | 'full' | 'sliver';
// Auto-centre box of the SUBJECT within a photo (see imageFocus.ts): frame to the body's edge, not the pic's.
export interface ImageFocus { cx: number; cy: number; hx: number; hy: number; }
export interface ImageBlock extends DocBlockBase {
  kind: 'image';
  img: CanvasImageSource;
  aspect: number;    // width / height of the source, for layout
  maxHFrac?: number; // cap height as a fraction of the view height (default 0.32)
  frame?: PhotoFrame; // 'letterbox' = central band (default), 'full' = whole image, 'sliver' = tall slice
  focus?: ImageFocus | null; // subject box to centre + zoom the crop on (null = picture-centred, as before)
}
// A procedural body disc (The Guide's illustrated picture) — drawn from the body's true colour.
// `mode`: 'sphere' = glossy shaded ball, 'disc' = mild-shaded disc, 'flat' = flat fill + outline.
export interface BodyDiscBlock extends DocBlockBase {
  kind: 'bodyDisc';
  body: unknown;       // the CelestialBody to illustrate (typed loosely to avoid a cycle)
  ringed?: boolean;
  mode?: 'sphere' | 'disc' | 'flat';
  heightFrac?: number; // fraction of the view height to reserve (default 0.2)
}
// A CONSTRUCT's picture (inbox A30). Not a body disc: a ship is not a small planet, and illustrating
// one with a world's sphere was the fault A28 removed. This draws the construct's OWN authored
// `icon_type` in its `icon_color` — the same glyph the 2D orrery, the starmap and the holo scene all
// draw it with — so the panel agrees with the marker the reader is looking at, and no new look is
// invented in code. It is the permanent bottom tier of the ladder in docs/dev/ship-appearance-design.md
// (photo > 3D model > glyph > nothing), so it is not thrown away when models arrive.
// Drawn straight into the document canvas, unlike `bodyDisc` — a flat vector shape needs no live
// renderer overlaid, so both consumers get it with no plumbing of their own.
export interface ConstructGlyphBlock extends DocBlockBase {
  kind: 'constructGlyph';
  shape: import('$lib/constructs/constructIcon').ConstructIconShape;
  color: string;       // the construct's authored icon_color (ignored under a mono theme)
  heightFrac?: number; // fraction of the view height to reserve (default 0.24 — the body-disc slot)
}
// A FORM of labelled fields laid out in a dynamic number of COLUMNS (G1). It exists because a stack of
// `keyValue` rows right-aligns each value to the far edge of the content column: on a full-width page
// the label sits at one side and its value at the other, a foot and a half away, and the pair stops
// reading as a pair. Here the renderer divides the width into cells of a readable size and puts each
// label and value inside one, so they stay together whatever the page is doing.
// The COLUMN COUNT is derived from the available width, not authored — the same block is a single
// column in a narrow side panel and three or four across a desktop document.
// Not to be confused with columnStart/columnEnd, which is the image-and-text-beside-it layout and is
// not a general grid.
export interface FieldGridBlock extends DocBlockBase {
  kind: 'fieldGrid';
  // `icon` is an optional single glyph drawn before the label, in the accent colour. Chosen by the
  // BUILDER (it knows what the field means); the renderer only places it. Absent = no icon column.
  fields: { label: string; value: string; icon?: string }[];
  minColPx?: number; // narrowest a column may get before dropping one, at scale 1 (default 300)
  maxCols?: number;  // beyond four a form stops being scannable (default 4)
  rules?: boolean;   // faint fill-in line under each value — the printed-form cue (default true)
}
// A ROW of small body discs drawn inline (G1). Deliberately general — N bodies at a given row height,
// each with its own relative size — so the system document can use it later for a moon run or a
// companion pair, not only the starmap's star-glyph catalogue.
//
// The colours are NOT chosen here and there is no class-to-colour table anywhere near it: each disc is
// the body's own `getPlanetTexture` canvas, the same procedural 2D image the orrery and PlanetDisc
// draw, which is generated from the derived `apparentColor` palette. A body with no palette (or no
// canvas, as in tests) falls back to `deriveAppearance().baseColorHex`, which is derived too — from
// the composition for a world and from the temperature for a star.
export interface GlyphRowBlock extends DocBlockBase {
  kind: 'glyphRow';
  items: { body: unknown; scale: number }[]; // scale 0..1 of the row height
  height?: number;      // row height in px at fontScale 1 (default 26)
  label?: string;       // optional caption in a fixed column to the LEFT of the discs
  labelColor?: string;  // builder-set (the rainbow walks the labels here — see starmapDocument)
  sub?: string;         // small trailing caption after the discs
}
export interface SpacerBlock extends DocBlockBase { kind: 'spacer'; h?: number; } // gap in px (× scale)
export interface RuleBlock extends DocBlockBase { kind: 'rule'; }                  // a full-width divider

// Two-column layout: everything between columnStart and columnEnd flows in a RIGHT column, with the
// image drawn as a tall strip down the LEFT (used by the photo 'sliver' frame — image left, text right).
export interface ColumnStartBlock extends DocBlockBase {
  kind: 'columnStart';
  img: CanvasImageSource;
  aspect: number;
  stripWFrac?: number; // left strip width as a fraction of the column (default 0.34)
  focus?: ImageFocus | null; // subject box to centre the strip crop on (null = picture-centred)
}
export interface ColumnEndBlock extends DocBlockBase { kind: 'columnEnd'; }

// Phase 2 fills the draw; Phase 1 lays it out as a captioned placeholder box so the document flows.
// Carries whatever the schematic drawer needs (kept loose until Phase 2 pins the shape).
export interface SchematicBlock extends DocBlockBase {
  kind: 'schematic';
  system: unknown;   // the System to diagram (typed properly in Phase 2)
  selectedId?: string | null;
  colorful?: boolean;
  heightFrac?: number; // fraction of the view height to reserve (default 0.42)
  // A FIXED height in px (at fontScale 1), which wins over heightFrac. A fraction of the view is right
  // for the one diagram at the top of a system page; it is hopeless when the block repeats — 42 systems
  // at 0.42 of the view is seventeen screens of diagram. The drawer already fits its virtual box into
  // whatever rect it is given, fonts and all, so a compact strip costs nothing extra (G1).
  height?: number;
  // Push ONE region for the whole diagram (using the block's own id) instead of a region per body.
  // At starmap level the per-body hits would dispatch a PLANET id where the caller expects a SYSTEM.
  wholeHit?: boolean;
  labels?: boolean;    // draw the body NAMES (default true) — off gives the shape of the system alone
}

export type DocBlock =
  | HeadingBlock | TextBlock | KeyValueBlock | ListBlock | TagsBlock
  | ImageBlock | BodyDiscBlock | ConstructGlyphBlock | FieldGridBlock | GlyphRowBlock | SpacerBlock | RuleBlock | SchematicBlock
  | ColumnStartBlock | ColumnEndBlock;

// --- Resolved colours -------------------------------------------------------------------------------

// Turn a theme into concrete colour strings. `mono` collapses to a grey/white ramp (the filter tints).
// Otherwise defaults are the dark-friendly ramp lifted from infoCard/listCanvas, with the accent slot
// driven by the preset accent (a readable fallback for 'rainbow'), all overridable via colors{}.
export function resolveDocColors(theme: DocTheme): Required<DocColors> {
  // Monochrome scheme BLEACHES the whole page: a fixed grey ramp that ignores the colour set entirely,
  // so a tinting filter (CRT/NV) does all the colouring. No theme.colors leak through here.
  if (theme.mono) {
    return {
      bg: '#05070c', heading: '#f2f5fa', body: 'rgba(226,234,246,0.92)',
      label: 'rgba(200,214,232,0.7)', value: '#e8edf4', rule: 'rgba(200,214,232,0.28)',
      accent: '#cfd6e4', dim: 'rgba(200,214,232,0.5)'
    };
  }
  const accent = theme.accent && theme.accent !== 'rainbow' ? theme.accent : '#8ed0ff';
  const base: Required<DocColors> = {
    bg: '#05070c', heading: accent, body: 'rgba(200,214,232,0.85)',
    label: 'rgba(190,205,224,0.7)', value: '#e8edf4', rule: 'rgba(140,170,210,0.28)',
    accent, dim: 'rgba(200,214,232,0.5)'
  };
  return { ...base, ...(theme.colors ?? {}) };
}
