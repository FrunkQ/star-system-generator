import { describe, it, expect } from 'vitest';
import { buildGuideDocument } from './guideDocument';

// A small system: one star, two planets, Earth has a moon and a surface construct.
const system: any = {
  id: 's', name: 'Sol', nodes: [
    { id: 'star', name: 'Sol', kind: 'body', roleHint: 'star', parentId: null, massKg: 2e30 },
    { id: 'earth', name: 'Earth', kind: 'body', roleHint: 'planet', parentId: 'star', massKg: 6e24, radiusKm: 6371, description: 'Home.', orbit: { hostId: 'star', elements: { a_AU: 1 } } },
    { id: 'mars', name: 'Mars', kind: 'body', roleHint: 'planet', parentId: 'star', massKg: 6e23, orbit: { hostId: 'star', elements: { a_AU: 1.5 } } },
    { id: 'luna', name: 'Luna', kind: 'body', roleHint: 'moon', parentId: 'earth', massKg: 7e22, orbit: { hostId: 'earth', elements: { a_AU: 0.0026 } } },
    { id: 'iss', name: 'Station', kind: 'construct', parentId: 'earth', placement: 'surface', orbit: { hostId: 'earth', elements: { a_AU: 0.0001 } } }
  ]
};

const kinds = (blocks: any[]) => blocks.map((b) => b.kind);

describe('buildGuideDocument', () => {
  it('leads with the schematic and prompts when nothing is selected', () => {
    const blocks = buildGuideDocument(system, null);
    expect(blocks[0].kind).toBe('schematic');
    expect((blocks[0] as any).system).toBe(system);
    expect(kinds(blocks)).toContain('text'); // the "tap a world" prompt
    expect(kinds(blocks)).not.toContain('keyValue');
  });

  it('builds the selected body file: heading, facts, description', () => {
    const blocks = buildGuideDocument(system, 'earth', { units: 'metric', tempUnit: 'C' });
    const heading = blocks.find((b) => b.kind === 'heading' && (b as any).level === 1) as any;
    expect(heading.text).toBe('Earth');
    expect(heading.id).toBe('earth');
    expect(kinds(blocks)).toContain('keyValue');           // facts
    const desc = blocks.find((b) => b.kind === 'text') as any;
    expect(desc.text).toBe('Home.');
  });

  it('surfaces moons and surface constructs as navigator lists', () => {
    const blocks = buildGuideDocument(system, 'earth');
    const lists = blocks.filter((b) => b.kind === 'list') as any[];
    const allItemIds = lists.flatMap((l) => l.items.map((it: any) => it.id));
    expect(allItemIds).toContain('luna');  // moon drill-in
    expect(allItemIds).toContain('iss');   // surface construct drill-in
  });

  it('honours the imagery choice: disc draws a bodyDisc, none draws nothing, photo needs an image', () => {
    const disc = buildGuideDocument(system, 'earth', { imagery: 'disc' });
    expect(disc.some((b) => b.kind === 'bodyDisc')).toBe(true);

    const none = buildGuideDocument(system, 'earth', { imagery: 'none' });
    expect(none.some((b) => b.kind === 'bodyDisc' || b.kind === 'image')).toBe(false);

    const photoNoImg = buildGuideDocument(system, 'earth', { imagery: 'photo' });
    expect(photoNoImg.some((b) => b.kind === 'image')).toBe(false); // no image loaded → nothing
    const photoWithImg = buildGuideDocument(system, 'earth', { imagery: 'photo', image: {} as any, imageAspect: 1.5 });
    expect(photoWithImg.some((b) => b.kind === 'image')).toBe(true);
  });

  it('offers a back-to-parent row for a child body', () => {
    const blocks = buildGuideDocument(system, 'earth');
    const lists = blocks.filter((b) => b.kind === 'list') as any[];
    const back = lists.flatMap((l) => l.items).find((it: any) => it.id === 'star');
    expect(back).toBeTruthy();
    expect(back.text).toContain('↑');
  });
});
