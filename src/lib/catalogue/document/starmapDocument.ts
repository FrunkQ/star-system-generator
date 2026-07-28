// D9: the STARMAP level as a document — the "Text List" starmap view rebuilt on the SAME block-model
// engine as the system Guide document, so it takes the preset's full appearance (colouration, fonts,
// nav style, headers/footers, filter) and stays aligned with every other info surface by construction.
// Content mirrors the old StarmapListView: the map's name, its description, and one navigator row per
// system (tap → enter) with a stars/planets/moons contents summary.
import type { Starmap } from '$lib/types';
import type { DocBlock, ListItem } from './blocks';
import { systemVisualStars } from '$lib/starmap/systemStars';

export interface StarmapDocOpts {
  selectedId?: string | null;
}

function summary(node: any): string {
  const ns = node.system?.nodes ?? [];
  const stars = systemVisualStars(node.system).length;
  let planets = 0, moons = 0;
  for (const n of ns) {
    if (n.kind !== 'body') continue;
    if (n.roleHint === 'planet' || n.roleHint === 'dwarf-planet') planets++;
    else if (n.roleHint === 'moon') moons++;
  }
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
  const items: ListItem[] = systems.map((node) => ({
    id: node.id,
    text: node.name,
    sub: summary(node),
    selected: node.id === opts.selectedId
  }));
  blocks.push({ kind: 'list', items });
  blocks.push({ kind: 'spacer', h: 12 });
  return blocks;
}
