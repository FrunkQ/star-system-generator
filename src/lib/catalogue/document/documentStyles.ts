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
    // Green-screen terminal: phosphor on near-black, monospace, '>' log lines — comes alive under CRT.
    case 'terminal':
      return {
        font: MONO, listStyle: 'terminal-log',
        colors: {
          bg: '#04120a', heading: '#8dffb0', body: '#59e089', label: '#3f9e63',
          value: '#c6ffd9', rule: 'rgba(125,255,158,0.30)', accent: '#8dffb0', dim: 'rgba(125,255,158,0.5)'
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

export const DOCUMENT_STYLES: { value: DocumentStyle; label: string }[] = [
  { value: 'guide', label: 'The Guide (illustrated)' },
  { value: 'report', label: 'Company report (mono)' },
  { value: 'brochure', label: 'Travel brochure' },
  { value: 'terminal', label: 'Terminal (green screen)' }
];
