import { describe, it, expect } from 'vitest';
import { buildStarmapDocument } from './starmapDocument';

// Two charted systems: a single-star with planets+moon, and a binary with nothing charted.
const starmap: any = {
  name: 'Local Bubble',
  description: 'The definitive map.',
  systems: [
    {
      id: 'sol', name: 'Sol', system: {
        nodes: [
          { id: 's1', name: 'Sol', kind: 'body', roleHint: 'star', parentId: null, massKg: 2e30 },
          { id: 'p1', name: 'Earth', kind: 'body', roleHint: 'planet', parentId: 's1' },
          { id: 'p2', name: 'Mars', kind: 'body', roleHint: 'planet', parentId: 's1' },
          { id: 'm1', name: 'Luna', kind: 'body', roleHint: 'moon', parentId: 'p1' }
        ]
      }
    },
    {
      id: 'ac', name: 'Alpha Centauri', system: {
        nodes: [
          { id: 'a', name: 'A', kind: 'body', roleHint: 'star', parentId: null, massKg: 2e30 },
          { id: 'b', name: 'B', kind: 'body', roleHint: 'star', parentId: 'a', massKg: 1.8e30 }
        ]
      }
    }
  ]
};

describe('buildStarmapDocument', () => {
  it('leads with the map name + charted count, then the description', () => {
    const blocks = buildStarmapDocument(starmap);
    const heading = blocks[0] as any;
    expect(heading.kind).toBe('heading');
    expect(heading.text).toBe('Local Bubble');
    expect(heading.sub).toBe('2 systems charted');
    const desc = blocks.find((b) => b.kind === 'text') as any;
    expect(desc.text).toBe('The definitive map.');
  });

  it('lists every system as a tappable row with a contents summary', () => {
    const blocks = buildStarmapDocument(starmap, { selectedId: 'sol' });
    const list = blocks.find((b) => b.kind === 'list') as any;
    expect(list.items.map((it: any) => it.id)).toEqual(['sol', 'ac']);
    expect(list.items[0].sub).toBe('1 star · 2 planets · 1 moon');
    expect(list.items[0].selected).toBe(true);
    expect(list.items[1].selected).toBe(false);
  });

  it('degrades to a fallback title and an empty note', () => {
    const blocks = buildStarmapDocument({ name: '', systems: [] } as any);
    expect((blocks[0] as any).text).toBe('Known Space');
    const note = blocks.find((b) => b.kind === 'text') as any;
    expect(note.text).toBe('No systems charted.');
    expect(blocks.some((b) => b.kind === 'list')).toBe(false);
  });
});
