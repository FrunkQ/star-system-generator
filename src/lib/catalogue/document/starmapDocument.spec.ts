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
  const fieldsOf = (bs: any[]) => bs.filter((b) => b.kind === 'fieldGrid').flatMap((b: any) => b.fields);
  const kv = (bs: any[], label: string) => fieldsOf(bs).find((f: any) => f.label === label)?.value;

  it('emits a heading + labelled fields + a rule per system, and no navigator list', () => {
    const bs = of({ layout: 'dossier' });
    const heads = bs.filter((b: any) => b.kind === 'heading' && b.level === 2).map((b: any) => b.text);
    expect(heads).toEqual(['Sol', 'Alpha Centauri']);
    expect(kv(bs, 'Primary')).toBe('Sol · G2V');   // the class comes from the classifier, not a lookup
    expect(kv(bs, 'Planets')).toBe('1');
    expect(kv(bs, 'Moons')).toBe('1');
    expect(bs.filter((b) => b.kind === 'rule').length).toBe(3); // the header rule + one per system
  });

  it('gives every companion its OWN field, so a long list cannot lose one', () => {
    const bs = of({ layout: 'dossier' });
    // Alpha Centauri has one companion; Sol has none at all.
    expect(fieldsOf(bs).filter((f: any) => f.label.startsWith('Companion')).length).toBe(1);
    expect(kv(bs, 'Companion')).toBe('B');
  });

  it('numbers the companions once there is more than one', () => {
    const tri: any = { ...map, systems: [{ id: 't', name: 'T', position: { x: 0, y: 0 }, system: { nodes: [
      { id: 'p', name: 'P', kind: 'body', roleHint: 'star', massKg: 3e30 },
      { id: 'q', name: 'Q', kind: 'body', roleHint: 'star', massKg: 2e30 },
      { id: 'r', name: 'R', kind: 'body', roleHint: 'star', massKg: 1e30 }
    ] } }] };
    const fs2 = buildStarmapDocument(tri, { layout: 'dossier' })
      .filter((b: any) => b.kind === 'fieldGrid').flatMap((b: any) => b.fields);
    expect(fs2.filter((f: any) => f.label === 'Companion 1')[0].value).toBe('Q');
    expect(fs2.filter((f: any) => f.label === 'Companion 2')[0].value).toBe('R');
  });

  it('measures distance from the SELECTED system, and nothing when none is selected', () => {
    expect(kv(of({ layout: 'dossier' }), 'Distance from Sol')).toBeUndefined();
    const bs = of({ layout: 'dossier', selectedId: 'sol' });
    expect(kv(bs, 'Distance from Sol')).toBe('5 ly');       // hypot(40,0,30)/10
    // The selected system does not quote a distance from itself.
    expect(fieldsOf(bs).filter((f: any) => f.label.startsWith('Distance')).length).toBe(1);
  });

  it('says nothing about depth or distance on a diagrammatic map, rather than inventing light years', () => {
    const diagram = { ...map, mapMode: 'diagrammatic' };
    const bs = buildStarmapDocument(diagram as any, { layout: 'dossier', selectedId: 'sol' });
    expect(fieldsOf(bs).some((f: any) => f.label === 'Depth')).toBe(false);
    expect(fieldsOf(bs).some((f: any) => f.label.startsWith('Distance'))).toBe(false);
  });

  it('leaves depth out when the campaign has opted out of counting it', () => {
    const flat = { ...map, ignoreZForDistances: true };
    const bs = buildStarmapDocument(flat as any, { layout: 'dossier' });
    expect(fieldsOf(bs).some((f: any) => f.label === 'Depth')).toBe(false);
  });

  // RAINBOW: one hue per system HEADING, set in the builder. A dense form would be confetti if every
  // field label took a hue, so the spectrum walks the one line per system that can carry it.
  it('gives each system heading its own hue in rainbow, and leaves field labels alone', () => {
    const bs = of({ layout: 'dossier', colorful: true });
    const heads = bs.filter((b: any) => b.kind === 'heading' && b.level === 2) as any[];
    expect(heads[0].color).toBeTruthy();
    expect(heads[1].color).toBeTruthy();
    expect(heads[0].color).not.toBe(heads[1].color);
    expect(bs.filter((b: any) => b.kind === 'fieldGrid' && b.color).length).toBe(0);
    // …and nothing is coloured when the preset is not on rainbow.
    expect((of({ layout: 'dossier' }).find((b: any) => b.kind === 'heading' && b.level === 2) as any).color).toBeUndefined();
  });

  it('still emits the original index when no layout is asked for', () => {
    const bs = of({});
    expect(bs.some((b) => b.kind === 'list')).toBe(true);
    expect(bs.some((b) => b.kind === 'fieldGrid')).toBe(false);
  });
});

// The columns are DERIVED from the width by the renderer, so the builder's only job is to hand the
// fields over as one block per system rather than as a stack of full-width rows.
describe('buildStarmapDocument — the dossier form is one field grid per system', () => {
  const map: any = {
    name: 'M', distanceUnit: 'ly', scale: { pixelsPerUnit: 10 }, mapMode: 'scaled',
    systems: [
      { id: 'a', name: 'A', position: { x: 0, y: 0 }, system: { nodes: [{ id: 's1', name: 'S1', kind: 'body', roleHint: 'star', massKg: 2e30 }] } },
      { id: 'b', name: 'B', position: { x: 10, y: 0 }, system: { nodes: [{ id: 's2', name: 'S2', kind: 'body', roleHint: 'star', massKg: 2e30 }] } }
    ]
  };
  it('emits one fieldGrid per system and no full-width keyValue rows', () => {
    const bs = buildStarmapDocument(map, { layout: 'dossier' });
    expect(bs.filter((b) => b.kind === 'fieldGrid').length).toBe(2);
    expect(bs.some((b) => b.kind === 'keyValue')).toBe(false);
    expect((bs.find((b) => b.kind === 'fieldGrid') as any).fields.length).toBeGreaterThan(0);
  });
});

// Tapping a system must enter it, and a dossier entry is seven lines tall — so the fields carry the
// system's id as well as the heading, or a tap lands on the entry and does nothing.
describe('buildStarmapDocument — a whole dossier entry is tappable', () => {
  const map: any = {
    name: 'M', distanceUnit: 'ly', scale: { pixelsPerUnit: 10 }, mapMode: 'scaled',
    systems: [{ id: 'sol', name: 'Sol', position: { x: 0, y: 0 }, system: { nodes: [
      { id: 's', name: 'Sol', kind: 'body', roleHint: 'star', massKg: 2e30 },
      { id: 'e', name: 'Earth', kind: 'body', roleHint: 'planet', parentId: 's' }
    ] } }]
  };
  it('puts the system id on the heading AND on its field grid', () => {
    const bs = buildStarmapDocument(map, { layout: 'dossier' });
    expect((bs.find((b) => b.kind === 'heading' && (b as any).level === 2) as any).id).toBe('sol');
    expect((bs.find((b) => b.kind === 'fieldGrid') as any).id).toBe('sol');
  });
});

// A form does not look clickable the way a list of rows does, so each entry says so in words.
describe('buildStarmapDocument — the dossier offers an explicit way in', () => {
  const map: any = {
    name: 'M', distanceUnit: 'ly', scale: { pixelsPerUnit: 10 }, mapMode: 'scaled',
    systems: [{ id: 'sol', name: 'Sol', position: { x: 0, y: 0 }, system: { nodes: [
      { id: 's', name: 'Sol', kind: 'body', roleHint: 'star', massKg: 2e30 }
    ] } }]
  };
  it('adds a one-item navigator button per system, carrying that system id', () => {
    const bs = buildStarmapDocument(map, { layout: 'dossier' });
    const btn = bs.find((b) => b.kind === 'list') as any;
    expect(btn.items.length).toBe(1);
    expect(btn.items[0].id).toBe('sol');
    expect(btn.items[0].text).toContain('System data');
  });
  it('gives the button the same hue as its heading in rainbow, so the entry reads as one thing', () => {
    const bs = buildStarmapDocument(map, { layout: 'dossier', colorful: true });
    const head = bs.find((b) => b.kind === 'heading' && (b as any).level === 2) as any;
    const btn = bs.find((b) => b.kind === 'list') as any;
    expect(btn.items[0].color).toBe(head.color);
  });
});

// G1 arrangement 2 — CARDS is a ListStyle, not a layout, so it is the renderer that boxes the items.
// The builder's only job is to give each system its own hue when the accent is rainbow, which every
// list style then honours (chips, boxed, plain and cards alike).
describe('buildStarmapDocument — the index carries a hue per system for rainbow', () => {
  const map: any = {
    name: 'M', distanceUnit: 'ly', scale: { pixelsPerUnit: 10 }, mapMode: 'scaled',
    systems: [
      { id: 'a', name: 'A', position: { x: 0, y: 0 }, system: { nodes: [{ id: 's1', name: 'S1', kind: 'body', roleHint: 'star', massKg: 2e30 }] } },
      { id: 'b', name: 'B', position: { x: 10, y: 0 }, system: { nodes: [{ id: 's2', name: 'S2', kind: 'body', roleHint: 'star', massKg: 2e30 }] } }
    ]
  };
  it('gives each index item its own part of the spectrum, and none without rainbow', () => {
    const on = (buildStarmapDocument(map, { colorful: true }).find((b) => b.kind === 'list') as any).items;
    expect(on[0].color).toBeTruthy();
    expect(on[1].color).not.toBe(on[0].color);
    const off = (buildStarmapDocument(map, {}).find((b) => b.kind === 'list') as any).items;
    expect(off[0].color).toBeUndefined();
  });
  it('leaves the list block free of a style, so the preset picks it (cards included)', () => {
    const list = buildStarmapDocument(map, {}).find((b) => b.kind === 'list') as any;
    expect(list.style).toBeUndefined();
    expect(list.nav).toBeUndefined();
  });
});

// G1 arrangement 3 — STAR-GLYPH CATALOGUE. The builder chooses WHICH bodies appear and how big; the
// colour of every disc comes from the body itself in the renderer, so there is nothing here that could
// become a class-to-colour table.
describe('buildStarmapDocument — glyph catalogue', () => {
  const map: any = {
    name: 'M', distanceUnit: 'ly', scale: { pixelsPerUnit: 10 }, mapMode: 'scaled',
    systems: [{ id: 'sol', name: 'Sol', position: { x: 0, y: 0 }, system: { nodes: [
      { id: 'a', name: 'A', kind: 'body', roleHint: 'star', massKg: 3e30 },
      { id: 'b', name: 'B', kind: 'body', roleHint: 'star', massKg: 1e30 },
      { id: 'p2', name: 'Outer', kind: 'body', roleHint: 'planet', parentId: 'a', orbit: { elements: { a_AU: 5 } } },
      { id: 'p1', name: 'Inner', kind: 'body', roleHint: 'planet', parentId: 'a', orbit: { elements: { a_AU: 1 } } },
      { id: 'm', name: 'Moon', kind: 'body', roleHint: 'moon', parentId: 'p1' },
      { id: 'belt', name: 'Belt', kind: 'body', roleHint: 'belt', parentId: 'a' }
    ] } }]
  };
  const row = () => buildStarmapDocument(map, { layout: 'glyphs' }).find((b) => b.kind === 'glyphRow') as any;

  it('puts the primary first and largest, companions smaller, planets in orbital order', () => {
    const r = row();
    expect(r.items.map((i: any) => i.body.id)).toEqual(['a', 'b', 'p1', 'p2']);
    expect(r.items[0].scale).toBe(1);
    expect(r.items[1].scale).toBeLessThan(1);
    expect(r.items[2].scale).toBeLessThan(r.items[1].scale);
  });

  it('leaves moons and belts out — at this size they are specks that make the row unreadable', () => {
    expect(row().items.some((i: any) => i.body.id === 'm' || i.body.id === 'belt')).toBe(false);
  });

  it('labels the row with the system and keeps it tappable', () => {
    expect(row().label).toBe('Sol');
    expect(row().id).toBe('sol');
    expect(row().sub).toContain('star');
  });

  // RAINBOW: the LABEL only. The discs are real derived colours and repainting them across a spectrum
  // would swap information for decoration — the one thing this arrangement must not do.
  it('hues the system name and never the discs', () => {
    const r = buildStarmapDocument(map, { layout: 'glyphs', colorful: true })
      .find((b) => b.kind === 'glyphRow') as any;
    expect(r.labelColor).toBeTruthy();
    expect(r.items.every((i: any) => i.color === undefined)).toBe(true);
    expect(row().labelColor).toBeUndefined();
  });
});
