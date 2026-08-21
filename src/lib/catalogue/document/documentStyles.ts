// WS2 documentStyle presets — the "one renderer, many looks" range (feedback 2026-07-21). Each
// documentStyle is a full base theme (font + colour set + list glyph style) so the SAME engine renders
// the Guide document as a warm illustrated field guide, a monocolour company report, a pretty travel
// brochure, or a green-screen terminal — chosen per preset, then filtered. The corporate look is
// modelled on the existing paper Report (`reports/report-styles.css` theme-corporate/retro). A preset's
// explicit themeColors / listStyle override these; `accentColor: 'rainbow'` still drives the schematic's
// colourful mode independently. Backgrounds are solid colours for now; textures come later.
import type { DocumentStyle, ListStyle, DocColors } from './blocks';

export interface DocStyleBase {
  font: string;
  listStyle: ListStyle;
  colors: Required<DocColors>;
}

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace';

export function documentStyleBase(style: DocumentStyle | undefined): DocStyleBase {
  switch (style) {
    // GREYSCALE: no hue anywhere. This is the base a TINTING filter wants — CRT phosphor, night vision,
    // thermal — because the shader colours what it is given, and a page that already has opinions about
    // colour fights it. Called greyscale in every control that offers it, including the 3D views'
    // body-colour picker, so one word means one thing across the app.
    case 'greyscale':
      return {
        font: SANS, listStyle: 'plain',
        colors: {
          bg: '#0a0a0a', heading: '#f2f2f2', body: 'rgba(226,226,226,0.92)', label: 'rgba(190,190,190,0.72)',
          value: '#ffffff', rule: 'rgba(210,210,210,0.30)', accent: '#d8d8d8', dim: 'rgba(200,200,200,0.5)'
        }
      };
    // Amber phosphor on black — the salvaged freighter's terminal, warm and slightly tired.
    case 'amber':
      return {
        font: MONO, listStyle: 'terminal-log',
        colors: {
          bg: '#0a0703', heading: '#ffb000', body: 'rgba(255,183,60,0.88)', label: 'rgba(214,146,40,0.75)',
          value: '#ffd08a', rule: 'rgba(255,176,0,0.32)', accent: '#ff8c00', dim: 'rgba(214,146,40,0.5)'
        }
      };
    // Blueprint: cyan on deep drafting blue. Ruled rows, because it is a plan, not prose.
    case 'blueprint':
      return {
        font: MONO, listStyle: 'ledger',
        colors: {
          bg: '#0b2545', heading: '#9fd8ff', body: 'rgba(198,231,255,0.9)', label: 'rgba(140,190,230,0.8)',
          value: '#e6f4ff', rule: 'rgba(150,210,255,0.38)', accent: '#5bb8ff', dim: 'rgba(150,200,235,0.55)'
        }
      };
    // Holotable: teal glow on near-black, the projected readout beside the orrery.
    case 'holotable':
      return {
        font: SANS, listStyle: 'plain',
        colors: {
          bg: '#03090c', heading: '#6ff2e0', body: 'rgba(178,240,235,0.9)', label: 'rgba(120,200,200,0.78)',
          value: '#d3fffa', rule: 'rgba(110,235,220,0.34)', accent: '#39d8c8', dim: 'rgba(120,200,200,0.5)'
        }
      };
    // Industrial hazard: black and safety yellow. A corporate operations manual nobody enjoys reading.
    case 'hazard':
      return {
        font: SANS, listStyle: 'numbered-dossier',
        colors: {
          bg: '#141210', heading: '#ffd400', body: 'rgba(238,232,214,0.9)', label: 'rgba(198,178,110,0.8)',
          value: '#fff3c4', rule: 'rgba(255,212,0,0.32)', accent: '#ff8a00', dim: 'rgba(198,178,110,0.5)'
        }
      };
    // Condition one. Deliberately hard on the eye over a long read — that is the point of it.
    case 'alert':
      return {
        font: MONO, listStyle: 'terminal-log',
        colors: {
          bg: '#0d0203', heading: '#ff4d4d', body: 'rgba(255,150,150,0.9)', label: 'rgba(210,90,90,0.8)',
          value: '#ffd0d0', rule: 'rgba(255,77,77,0.34)', accent: '#ff2a2a', dim: 'rgba(210,90,90,0.5)'
        }
      };
    // Clean room: white and ice blue. Medical, scientific, expensively sterile — the one LIGHT sci-fi
    // palette here, so the range is not all glowing text in a dark room.
    case 'cleanroom':
      return {
        font: SANS, listStyle: 'plain',
        colors: {
          bg: '#f2f7fb', heading: '#0f5f8f', body: '#1d2b36', label: '#5b7386',
          value: '#0b1620', rule: 'rgba(20,70,110,0.26)', accent: '#00a3c4', dim: 'rgba(29,43,54,0.45)'
        }
      };
    // Neon noir: magenta and cyan on black. Rain, reflections, bad decisions.
    case 'neon':
      return {
        font: SANS, listStyle: 'plain',
        colors: {
          bg: '#07030d', heading: '#ff4fd8', body: 'rgba(226,214,244,0.9)', label: 'rgba(150,220,255,0.8)',
          value: '#5ee7ff', rule: 'rgba(255,79,216,0.32)', accent: '#00e5ff', dim: 'rgba(180,160,210,0.5)'
        }
      };
    // Terminal: a WHITE monocolour readout on near-black, monospace, '>' log lines. Left un-tinted so a
    // CRT/phosphor filter colours it green/amber/whatever — the base is neutral, ready to be tinted.
    case 'terminal':
      return {
        font: MONO, listStyle: 'terminal-log',
        colors: {
          bg: '#05070a', heading: '#f4f6fa', body: '#d7dde6', label: '#9aa3b0',
          value: '#ffffff', rule: 'rgba(220,228,238,0.30)', accent: '#f4f6fa', dim: 'rgba(220,228,238,0.5)'
        }
      };
    // Monocolour company report: white paper, black ink, bold sans headers, numbered rows, a red stamp.
    case 'report':
      return {
        font: SANS, listStyle: 'numbered-dossier',
        colors: {
          bg: '#f6f5f1', heading: '#0a0a0a', body: '#1b1b1b', label: '#565656',
          value: '#0a0a0a', rule: 'rgba(0,0,0,0.38)', accent: '#b3121f', dim: 'rgba(0,0,0,0.45)'
        }
      };
    // Pretty travel brochure: warm cream paper, coral headings, teal accents, illustrated bullets.
    case 'brochure':
      return {
        font: SERIF, listStyle: 'illustrated-bullets',
        colors: {
          bg: '#fbf3e1', heading: '#b5533a', body: '#4a3a2c', label: '#8a6a52',
          value: '#2f2a22', rule: 'rgba(120,90,60,0.35)', accent: '#2f8f8f', dim: 'rgba(74,58,44,0.5)'
        }
      };
    // The Guide (default): dark, illustrated, warm — gold headings, cream body, serif. Rainbow accent
    // (from the preset) lights the schematic; the text stays legible gold-on-dark.
    case 'guide':
    default:
      return {
        font: SERIF, listStyle: 'illustrated-bullets',
        colors: {
          bg: '#0c0a12', heading: '#ffd93d', body: 'rgba(232,224,210,0.9)', label: 'rgba(210,196,170,0.7)',
          value: '#f2ead6', rule: 'rgba(200,170,120,0.32)', accent: '#ffd93d', dim: 'rgba(210,196,170,0.5)'
        }
      };
  }
}

// THE one place a preset's appearance fields become a DocTheme — used by the Document view, the 2D/3D
// info panel and the editor preview alike, so every info block resolves its look identically (change it
// here, they all move together).
export function makeDocTheme(o: {
  font: string; headingFont?: string; fontScale?: number; mono: boolean; accent: string;
  documentStyle?: DocumentStyle; themeColors?: Partial<DocColors> | null; listStyle?: ListStyle | null;
  navStyle?: import('./blocks').NavStyle | null;
}): import('./blocks').DocTheme {
  const base = documentStyleBase(o.documentStyle);
  // The preset's chosen accent OUTRANKS the document style's seed for the two slots it is about — the
  // accent itself and the headings — while an explicitly tweaked slot still outranks both. That is the
  // model the editor describes ("a colouration SEEDS the colours, then tweak each slot"), but the
  // accent was never part of the seeding, so picking a colour changed the chrome and left every info
  // block's headings on the style's default.
  const accentHex = o.accent && o.accent !== 'rainbow' ? o.accent : null;
  return {
    font: o.font,
    headingFont: o.headingFont || o.font,
    fontScale: o.fontScale ?? 1,
    // Picking the GREYSCALE colouration IS asking for monochrome — one lever, not two. The boolean
    // stays because the renderer and the tinting shaders key on it, but a GM only ever sees the palette.
    mono: o.mono || o.documentStyle === 'greyscale',
    // Keep the accent VALUE, sentinel and all: the concrete colours are resolved into `colors` right
    // below, so nothing downstream needs a hex here — while renderDocument has to still SEE 'rainbow'
    // to paint headings across the spectrum. Flattening it here is why the Guide's rainbow headings
    // (v2.1.266) never reached an info block: by the time the renderer looked, the sentinel was gone.
    accent: o.accent,
    colors: { ...base.colors, ...(accentHex ? { accent: accentHex, heading: accentHex } : {}), ...(o.themeColors ?? {}) },
    listStyle: o.listStyle ?? base.listStyle,
    documentStyle: o.documentStyle,
    navStyle: o.navStyle ?? undefined
  };
}

// The picker's order is the order of USE, not the order they were written: greyscale first because it
// is the one a GM reaches for deliberately (it is what a tinting filter needs), then the four originals,
// then the genre palettes. Same word as the 3D views' body-colour picker uses — see below.
export const DOCUMENT_STYLES: { value: DocumentStyle; label: string }[] = [
  { value: 'greyscale', label: 'Greyscale (for tinting filters)' },
  { value: 'guide', label: 'The Guide (illustrated)' },
  { value: 'report', label: 'Company report (mono)' },
  { value: 'brochure', label: 'Travel brochure' },
  { value: 'terminal', label: 'Terminal (white on black)' },
  { value: 'amber', label: 'Amber terminal' },
  { value: 'blueprint', label: 'Blueprint' },
  { value: 'holotable', label: 'Holotable (teal glow)' },
  { value: 'hazard', label: 'Industrial hazard' },
  { value: 'alert', label: 'Red alert' },
  { value: 'cleanroom', label: 'Clean room (light)' },
  { value: 'neon', label: 'Neon noir' }
];
