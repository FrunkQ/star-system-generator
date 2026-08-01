// D9: the STARMAP level as a document — the "Text List" starmap view rebuilt on the SAME block-model
// engine as the system Guide document, so it takes the preset's full appearance (colouration, fonts,
// nav style, headers/footers, filter) and stays aligned with every other info surface by construction.
// Content mirrors the old StarmapListView: the map's name, its description, and one navigator row per
// system (tap → enter) with a stars/planets/moons contents summary.
//
// G1 — ARRANGEMENTS. `layout` chooses the SHAPE the same content takes; it composes WITH the preset's
// documentStyle, listStyle and colouration rather than replacing them, so the looks multiply
// (layout × style) instead of forking into bespoke views. That is what keeps the one-builder /
// one-renderer property F8 verified, and it is that property that caught F7 and F9.
import type { Starmap } from '$lib/types';
import type { DocBlock, ListItem } from './blocks';
import { systemVisualStars } from '$lib/starmap/systemStars';
import { posZ, zCounts, systemSeparation } from '$lib/map/systemDistance';
import { classLabel } from '../bodyFacts';
import { rainbowHue } from './systemSchematic';

// 'list'    — one navigator row per system with a contents sub-line (the original, still the default)
// 'dossier' — a form: a heading per system over a stack of labelled fields, then a rule
export type StarmapLayout = 'list' | 'dossier';

export interface StarmapDocOpts {
  selectedId?: string | null;
  layout?: StarmapLayout;
  // The preset's accent is 'rainbow'. Resolved to concrete hues HERE, in the builder, never in the
  // renderer (blocks.ts:105) — and note this is a separate flag from the theme's `accent`, which must
  // keep carrying the 'rainbow' sentinel all the way into renderDocument (documentStyles.ts:85-86).
  colorful?: boolean;
}

interface Counts { stars: number; planets: number; moons: number }
function counts(node: any): Counts {
  const ns = node.system?.nodes ?? [];
  let planets = 0, moons = 0;
  for (const n of ns) {
    if (n.kind !== 'body') continue;
    if (n.roleHint === 'planet' || n.roleHint === 'dwarf-planet') planets++;
    else if (n.roleHint === 'moon') moons++;
  }
  return { stars: systemVisualStars(node.system).length, planets, moons };
}

function summary(node: any): string {
  const { stars, planets, moons } = counts(node);
  const parts: string[] = [];
  if (stars) parts.push(stars > 1 ? `${stars} stars` : '1 star');
  if (planets) parts.push(`${planets} planet${planets > 1 ? 's' : ''}`);
  if (moons) parts.push(`${moons} moon${moons > 1 ? 's' : ''}`);
  return parts.join(' · ') || 'uncharted';
}

export function buildStarmapDocument(starmap: Starmap | null, opts: StarmapDocOpts = {}): DocBlock[] {
  const blocks: DocBlock[] = [];
  const systems: any[] = (starmap as any)?.systems ?? [];
  blocks.push({
    kind: 'heading', level: 1, text: (starmap as any)?.name || 'Known Space',
    sub: systems.length ? `${systems.length} system${systems.length > 1 ? 's' : ''} charted` : 'uncharted space'
  });
  const desc = (starmap as any)?.description;
  if (desc) {
    blocks.push({ kind: 'spacer', h: 4 });
    blocks.push({ kind: 'text', text: String(desc), italic: true });
  }
  blocks.push({ kind: 'rule' });
  if (!systems.length) {
    blocks.push({ kind: 'text', text: 'No systems charted.', italic: true, align: 'center' });
    return blocks;
  }

  if (opts.layout === 'dossier') {
    blocks.push(...dossier(starmap, systems, opts));
  } else {
    const items: ListItem[] = systems.map((node) => ({
      id: node.id,
      text: node.name,
      sub: summary(node),
      selected: node.id === opts.selectedId
    }));
    blocks.push({ kind: 'list', items });
  }
  blocks.push({ kind: 'spacer', h: 12 });
  return blocks;
}

// The DOSSIER: a level-2 heading per system over a stack of labelled fields, closed by a rule. Zero new
// block kinds — the starmap document simply had never used `keyValue`, which is why this reads so
// differently from the navigator list for so little code.
//
// RAINBOW, decided here: in a dossier the spectrum walks the SYSTEM HEADINGS, one hue per entry, and
// the field labels stay in the document's own colours. A form is dense — six labelled rows per system —
// and hueing every label turns it into confetti that is harder to read than the plain style, which is
// the opposite of what an arrangement is for. Colouring the headings gives the same "each entry is its
// own thing" cue the system document gives its drill-in chips, on the one line per system that can
// carry it. The stacked-card arrangement is a different case and takes its own answer.
function dossier(starmap: Starmap | null, systems: any[], opts: StarmapDocOpts): DocBlock[] {
  const out: DocBlock[] = [];
  const sm: any = starmap;
  const unit: string = sm?.distanceUnit || '';
  const ppu: number = sm?.scale?.pixelsPerUnit ?? 0;
  // Depth and distance are only meaningful on a SCALED map with a usable scale. On a diagrammatic map
  // the positions are a picture, not a measurement, and quoting light years off them would be inventing
  // a number — an honest short list beats a confident wrong one.
  const measurable = ppu > 0 && sm?.mapMode !== 'diagrammatic' && (sm?.distanceUnit || '') !== 'diagrammatic';
  const depthCounts = zCounts(sm);
  const selected = opts.selectedId ? systems.find((s) => s.id === opts.selectedId) : null;
  const fmt = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: n < 10 ? 1 : 0 })} ${unit}`.trim();

  systems.forEach((node, i) => {
    const stars = systemVisualStars(node.system);
    const primaryNode = (node.system?.nodes ?? []).find((n: any) => n.id === stars[0]?.id);
    const { planets, moons } = counts(node);
    const add = (label: string, value: string) => { if (value) out.push({ kind: 'keyValue', label, value }); };

    out.push({
      kind: 'heading', level: 2, text: node.name, id: node.id,
      selected: node.id === opts.selectedId,
      ...(opts.colorful ? { color: rainbowHue(i) } : {})
    });
    if (stars[0]) {
      const cls = primaryNode ? classLabel(primaryNode) : '';
      add('Primary', cls ? `${stars[0].name} · ${cls}` : stars[0].name);
    }
    if (stars.length > 1) add('Companions', stars.slice(1).map((s) => s.name).join(', '));
    add('Planets', planets ? String(planets) : '—');
    add('Moons', moons ? String(moons) : '—');
    // Depth is presentational when the campaign has opted out of counting it, so it is left out rather
    // than shown as a figure that reaches none of the distances the same map quotes elsewhere (A12).
    if (measurable && depthCounts) {
      const z = posZ(node.position) / ppu;
      if (Math.abs(z) >= 0.05) add('Depth', `${z > 0 ? '+' : '−'}${fmt(Math.abs(z))}`);
    }
    // Measured from where the reader IS, which is the only reference point the document actually has.
    // With nothing selected there is no origin to measure from, so the row is simply absent.
    if (measurable && selected && selected.id !== node.id) {
      add(`Distance from ${selected.name}`,
        fmt(systemSeparation(selected.position, node.position, ppu, !depthCounts)));
    }
    out.push({ kind: 'rule' });
  });
  return out;
}
