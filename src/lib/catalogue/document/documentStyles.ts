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
  return {
    font: o.font,
    headingFont: o.headingFont || o.font,
    fontScale: o.fontScale ?? 1,
    mono: o.mono,
    accent: o.accent && o.accent !== 'rainbow' ? o.accent : base.colors.accent,
    colors: { ...base.colors, ...(o.themeColors ?? {}) },
    listStyle: o.listStyle ?? base.listStyle,
    documentStyle: o.documentStyle,
    navStyle: o.navStyle ?? undefined
  };
}

export const DOCUMENT_STYLES: { value: DocumentStyle; label: string }[] = [
  { value: 'guide', label: 'The Guide (illustrated)' },
  { value: 'report', label: 'Company report (mono)' },
  { value: 'brochure', label: 'Travel brochure' },
  { value: 'terminal', label: 'Terminal (green screen)' }
];
