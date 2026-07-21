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
  | 'manifest';            // ticker / cargo-manifest columns

// The overall document skin — one renderer, many looks. Each maps to a full base theme in
// documentStyles.ts (font + colour set + list glyphs); a preset's explicit fields override it.
export type DocumentStyle =
  | 'guide'      // dark, illustrated field guide (serif, gold-on-dark, rainbow schematic)
  | 'report'     // monocolour company report (white paper, black ink, bold sans, numbered)
  | 'brochure'   // pretty travel brochure (warm cream, coral/teal, illustrated)
  | 'terminal';  // green-screen terminal (phosphor mono, '>' log lines) — shines under CRT

// How navigator rows + key elements render: plain hanging text, or boxed "buttons".
export type NavStyle = 'plain' | 'boxed';

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
}

export interface HeadingBlock extends DocBlockBase {
  kind: 'heading';
  text: string;
  level?: 1 | 2 | 3; // 1 = title, 2 = section, 3 = minor; default 1
  sub?: string;      // small uppercase strap under the heading (e.g. the body's role)
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

export interface ListItem { id?: string; text: string; selected?: boolean; sub?: string; }
export interface ListBlock extends DocBlockBase {
  kind: 'list';
  items: ListItem[];
  style?: ListStyle; // overrides the theme's listStyle for this block
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
}

export type DocBlock =
  | HeadingBlock | TextBlock | KeyValueBlock | ListBlock | TagsBlock
  | ImageBlock | BodyDiscBlock | SpacerBlock | RuleBlock | SchematicBlock
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
