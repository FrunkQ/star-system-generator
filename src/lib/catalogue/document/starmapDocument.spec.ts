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

// G1 arrangement 1 — DOSSIER. A form per system: heading, labelled fields, rule. No new block kinds:
// the starmap document simply had never used `keyValue`.
describe('buildStarmapDocument — dossier arrangement', () => {
  const map: any = {
    name: 'Local', distanceUnit: 'ly', scale: { pixelsPerUnit: 10 }, mapMode: 'scaled',
    systems: [
      { id: 'sol', name: 'Sol', position: { x: 0, y: 0, z: 0 }, system: { nodes: [
        { id: 's', name: 'Sol', kind: 'body', roleHint: 'star', classes: ['star/G', 'star/G2V'], massKg: 2e30 },
        { id: 'e', name: 'Earth', kind: 'body', roleHint: 'planet', parentId: 's' },
        { id: 'l', name: 'Luna', kind: 'body', roleHint: 'moon', parentId: 'e' }
      ] } },
      { id: 'ac', name: 'Alpha Centauri', position: { x: 40, y: 0, z: 30 }, system: { nodes: [
        { id: 'a', name: 'A', kind: 'body', roleHint: 'star', massKg: 2e30 },
        { id: 'b', name: 'B', kind: 'body', roleHint: 'star', massKg: 1e30 }
      ] } }
    ]
  };
  const of = (opts: any) => buildStarmapDocument(map, opts);
  const kv = (bs: any[], label: string) => bs.find((b) => b.kind === 'keyValue' && b.label === label)?.value;

  it('emits a heading + labelled fields + a rule per system, and no navigator list', () => {
    const bs = of({ layout: 'dossier' });
    expect(bs.some((b) => b.kind === 'list')).toBe(false);
    const heads = bs.filter((b: any) => b.kind === 'heading' && b.level === 2).map((b: any) => b.text);
    expect(heads).toEqual(['Sol', 'Alpha Centauri']);
    expect(kv(bs, 'Primary')).toBe('Sol · G2V');   // the class comes from the classifier, not a lookup
    expect(kv(bs, 'Planets')).toBe('1');
    expect(kv(bs, 'Moons')).toBe('1');
    expect(bs.filter((b) => b.kind === 'rule').length).toBe(3); // the header rule + one per system
  });

  it('names the companions of a multi-star system and omits the row for a single', () => {
    const bs = of({ layout: 'dossier' });
    // Companions belongs to Alpha Centauri, the second entry — Sol has none at all.
    expect(bs.filter((b: any) => b.kind === 'keyValue' && b.label === 'Companions').length).toBe(1);
    expect(kv(bs, 'Companions')).toBe('B');
  });

  it('measures distance from the SELECTED system, and nothing when none is selected', () => {
    expect(kv(of({ layout: 'dossier' }), 'Distance from Sol')).toBeUndefined();
    const bs = of({ layout: 'dossier', selectedId: 'sol' });
    expect(kv(bs, 'Distance from Sol')).toBe('5 ly');       // hypot(40,0,30)/10
    // The selected system does not quote a distance from itself.
    expect(bs.filter((b: any) => b.kind === 'keyValue' && b.label.startsWith('Distance')).length).toBe(1);
  });

  it('says nothing about depth or distance on a diagrammatic map, rather than inventing light years', () => {
    const diagram = { ...map, mapMode: 'diagrammatic' };
    const bs = buildStarmapDocument(diagram as any, { layout: 'dossier', selectedId: 'sol' });
    expect(bs.some((b: any) => b.kind === 'keyValue' && b.label === 'Depth')).toBe(false);
    expect(bs.some((b: any) => b.kind === 'keyValue' && b.label.startsWith('Distance'))).toBe(false);
  });

  it('leaves depth out when the campaign has opted out of counting it', () => {
    const flat = { ...map, ignoreZForDistances: true };
    const bs = buildStarmapDocument(flat as any, { layout: 'dossier' });
    expect(bs.some((b: any) => b.kind === 'keyValue' && b.label === 'Depth')).toBe(false);
  });

  // RAINBOW: one hue per system HEADING, set in the builder. A dense form would be confetti if every
  // field label took a hue, so the spectrum walks the one line per system that can carry it.
  it('gives each system heading its own hue in rainbow, and leaves field labels alone', () => {
    const bs = of({ layout: 'dossier', colorful: true });
    const heads = bs.filter((b: any) => b.kind === 'heading' && b.level === 2) as any[];
    expect(heads[0].color).toBeTruthy();
    expect(heads[1].color).toBeTruthy();
    expect(heads[0].color).not.toBe(heads[1].color);
    expect(bs.filter((b: any) => b.kind === 'keyValue' && b.color).length).toBe(0);
    // …and nothing is coloured when the preset is not on rainbow.
    expect((of({ layout: 'dossier' }).find((b: any) => b.kind === 'heading' && b.level === 2) as any).color).toBeUndefined();
  });

  it('still emits the original index when no layout is asked for', () => {
    const bs = of({});
    expect(bs.some((b) => b.kind === 'list')).toBe(true);
    expect(bs.some((b) => b.kind === 'keyValue')).toBe(false);
  });
});
