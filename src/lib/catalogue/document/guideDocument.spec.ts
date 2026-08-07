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

  // A30: a construct is illustrated with its OWN authored glyph, never a world's disc (A28), and never
  // a blank where a picture belongs. A GM photo still outranks it.
  it('draws a construct as its icon glyph, not a body disc', () => {
    const blocks = buildGuideDocument(system, 'iss', { imagery: 'disc' });
    expect(blocks.some((b) => b.kind === 'bodyDisc')).toBe(false);
    const glyph = blocks.find((b) => b.kind === 'constructGlyph') as any;
    expect(glyph).toBeTruthy();
    expect(glyph.shape).toBe('triangle');   // unset icon_type falls back to the construct default

    const authored: any = { ...system, nodes: system.nodes.map((n: any) =>
      n.id === 'iss' ? { ...n, icon_type: 'diamond', icon_color: '#ff0000' } : n) };
    const g2 = buildGuideDocument(authored, 'iss', { imagery: 'flat' }).find((b) => b.kind === 'constructGlyph') as any;
    expect(g2.shape).toBe('diamond');
    expect(g2.color).toBe('#ff0000');

    // 'none' means none, for a construct as for a world; a loaded photo wins over the glyph.
    expect(buildGuideDocument(system, 'iss', { imagery: 'none' }).some((b) => b.kind === 'constructGlyph')).toBe(false);
    const photo = buildGuideDocument(system, 'iss', { imagery: 'photo', image: {} as any, imageAspect: 1.5 });
    expect(photo.some((b) => b.kind === 'image')).toBe(true);
    expect(photo.some((b) => b.kind === 'constructGlyph')).toBe(false);
  });

  // G3 (owner steer 2026-08-03): the priority chain is MODEL > photo > glyph > nothing, and a
  // model's attribution rides directly beneath its reserved gap (decision 5 - CC-BY must credit).
  it('gives a construct with a model the reserved gap, its attribution line, and no glyph', () => {
    const withModel: any = { ...system, nodes: system.nodes.map((n: any) =>
      n.id === 'iss' ? { ...n, model: { hash: 'abc123', name: 'Hull', credit: 'A Modeller', license: 'CC-BY' } } : n) };

    const blocks = buildGuideDocument(withModel, 'iss', { imagery: 'disc' });
    const gap = blocks.find((b) => b.kind === 'bodyDisc') as any;
    expect(gap).toBeTruthy();
    expect(gap.id).toBe('__bodygfx');                     // the consumers' overlay anchor
    expect(blocks.some((b) => b.kind === 'constructGlyph')).toBe(false);
    const credit = blocks.find((b) => b.kind === 'text' && (b as any).text.startsWith('Model:')) as any;
    expect(credit.text).toContain('A Modeller');
    expect(credit.text).toContain('CC-BY');

    // The model outranks a loaded photo ("if a construct is told to be 3D, display it first");
    // the photo shows only when there is no model. 'none' still means none; no credit -> no line.
    const photo = buildGuideDocument(withModel, 'iss', { imagery: 'photo', image: {} as any, imageAspect: 1.5 });
    expect(photo.some((b) => b.kind === 'bodyDisc')).toBe(true);
    expect(photo.some((b) => b.kind === 'image')).toBe(false);
    const noModelPhoto = buildGuideDocument(system, 'iss', { imagery: 'photo', image: {} as any, imageAspect: 1.5 });
    expect(noModelPhoto.some((b) => b.kind === 'image')).toBe(true);
    expect(buildGuideDocument(withModel, 'iss', { imagery: 'none' }).some((b) => b.kind === 'bodyDisc')).toBe(false);
    const bare: any = { ...system, nodes: system.nodes.map((n: any) =>
      n.id === 'iss' ? { ...n, model: { hash: 'abc123' } } : n) };
    expect(buildGuideDocument(bare, 'iss', { imagery: 'disc' })
      .some((b) => b.kind === 'text' && (b as any).text?.startsWith?.('Model:'))).toBe(false);
  });

  it('renders tags as a styled tags block, not a plain fact row', () => {
    const tagged: any = { ...system, nodes: system.nodes.map((n: any) => n.id === 'earth' ? { ...n, tags: [{ key: 'structure/cloud-deck' }] } : n) };
    const blocks = buildGuideDocument(tagged, 'earth', { tagStyle: 'pills' });
    const tagsBlock = blocks.find((b) => b.kind === 'tags') as any;
    expect(tagsBlock).toBeTruthy();
    expect(tagsBlock.tags.length).toBeGreaterThan(0);
    expect(tagsBlock.style).toBe('pills');
    // The 'Tags' fact is pulled out, not duplicated as a key/value row.
    expect(blocks.some((b) => b.kind === 'keyValue' && (b as any).label === 'Tags')).toBe(false);
  });

  it('offers a back-to-parent row for a child body', () => {
    const blocks = buildGuideDocument(system, 'earth');
    const lists = blocks.filter((b) => b.kind === 'list') as any[];
    const back = lists.flatMap((l) => l.items).find((it: any) => it.id === 'star');
    expect(back).toBeTruthy();
    expect(back.text).toContain('↑');
  });
});

// The chip row under a body's name (design 9.3). The point of it is AGREEMENT: whatever the GM has
// chosen to badge on the maps is named in the panel too, in the same colours, on every surface.
describe('map-highlight chips under the name', () => {
  const cats: any[] = [
    { id: 'frontier', label: 'Frontier', color: '#6fae8f', textColor: '#06160f',
      tags: [{ key: 'frontier/fuel-depot', label: 'Fuel depot' }, { key: 'frontier/ice-mining', label: 'Ice mining' }] }
  ];
  const tagged: any = {
    ...system,
    nodes: system.nodes.map((n: any) =>
      n.id === 'earth' ? { ...n, tags: [{ key: 'frontier/fuel-depot' }, { key: 'atmosphere/breathable' }] } : n)
  };
  const chipRow = (blocks: any[]) => {
    const h = blocks.findIndex((b) => b.kind === 'heading' && b.level === 1);
    return h >= 0 && blocks[h + 1]?.kind === 'tags' ? blocks[h + 1] : null;
  };

  it('names a highlighted tag directly under the heading, in the tag colour', () => {
    const blocks = buildGuideDocument(tagged, 'earth', {
      highlights: [{ ref: 'frontier/fuel-depot' }], tagCategories: cats
    });
    const row = chipRow(blocks);
    expect(row).toBeTruthy();
    expect(row.tags.map((t: any) => t.label)).toEqual(['Fuel depot']);
    expect(row.tags[0].color).toBe('#6fae8f'); // the category's colour, exactly as the map uses
  });

  it('shows ONLY what is highlighted, not the body\'s whole tag list', () => {
    const row = chipRow(buildGuideDocument(tagged, 'earth', {
      highlights: [{ ref: 'frontier/fuel-depot' }], tagCategories: cats
    }));
    expect(row.tags.map((t: any) => t.label)).not.toContain('Breathable');
  });

  it('a whole category highlighted still only names what the body carries', () => {
    const row = chipRow(buildGuideDocument(tagged, 'earth', {
      highlights: [{ ref: 'frontier' }], tagCategories: cats
    }));
    expect(row.tags.map((t: any) => t.label)).toEqual(['Fuel depot']); // not Ice mining — Earth has none
  });

  it('adds nothing when there is no selection, or when the body carries none of it', () => {
    expect(chipRow(buildGuideDocument(tagged, 'earth', { tagCategories: cats }))).toBeNull();
    expect(chipRow(buildGuideDocument(tagged, 'mars', {
      highlights: [{ ref: 'frontier/fuel-depot' }], tagCategories: cats
    }))).toBeNull();
  });

  // TAG-13: the builder is audience-blind. A player's document is built from the redacted snapshot, so
  // a secret tag is already gone by the time it gets here — proven by the tag simply not being present.
  it('cannot badge a tag that was redacted before it arrived', () => {
    const redacted: any = { ...tagged, nodes: tagged.nodes.map((n: any) =>
      n.id === 'earth' ? { ...n, tags: [{ key: 'atmosphere/breathable' }] } : n) };
    expect(chipRow(buildGuideDocument(redacted, 'earth', {
      highlights: [{ ref: 'frontier/fuel-depot' }], tagCategories: cats
    }))).toBeNull();
  });
});
