// ATTRIBUTIONS.md: the provenance of the art in a save, in a form a person reads without the app.
// The load-bearing cases are the UNHAPPY ones - an asset with nothing recorded must be named as
// such, and CC-BY without a credit must be called out, because that is an obligation the GM is
// about to breach by sharing.
import { describe, it, expect } from 'vitest';
import { collectAttributions, renderAttributions, buildAttributionsFile } from './attributions';

const campaign = {
  systems: [
    { name: 'Sol', system: { nodes: [
      { id: 'roci', name: 'Rocinante', model: { hash: 'aaa' }, image: { url: 'assets/images/roci.jpg', credit: 'A Painter', license: 'CC-BY', sourceUrl: 'https://art.example/roci' } },
      { id: 'tycho', name: 'Tycho Station', model: { hash: 'aaa' } },            // shares the hull
      { id: 'earth', name: 'Earth', image: { url: 'assets/images/earth.png' } }  // nothing recorded
    ] } },
    { name: 'Tau Ceti', system: { nodes: [
      { id: 'blip', name: 'Blip-A', model: { hash: 'bbb' } }
    ] } }
  ]
};
const meta = {
  aaa: { title: 'Light freighter hull', credit: 'A Modeller', license: 'CC-BY', sourceUrl: 'https://models.example/hull' },
  bbb: { name: 'Mystery hull', license: 'CC-BY' } // licensed CC-BY, nobody credited: a breach
};

describe('collectAttributions', () => {
  it('lists a shared hull ONCE, naming every ship that uses it', () => {
    const entries = collectAttributions(campaign, meta as any);
    const hull = entries.find((e) => e.path.endsWith('aaa.glb'))!;
    expect(hull.usedBy).toEqual(['Rocinante (Sol)', 'Tycho Station (Sol)']);
    expect(hull.credit).toBe('A Modeller');
    expect(entries.filter((e) => e.path.endsWith('aaa.glb'))).toHaveLength(1);
  });

  it('covers images as well as models, and names the system each is in', () => {
    const entries = collectAttributions(campaign, meta as any);
    const img = entries.find((e) => e.path.endsWith('roci.jpg'))!;
    expect(img.kind).toBe('image');
    expect(img.usedBy).toEqual(['Rocinante (Sol)']);
    expect(img.license).toBe('CC-BY');
    const blip = entries.find((e) => e.path.endsWith('bbb.glb'))!;
    expect(blip.usedBy).toEqual(['Blip-A (Tau Ceti)']);
  });

  it('ignores remote and not-yet-packed images - only what the bundle carries', () => {
    const doc = { nodes: [
      { id: 'a', name: 'A', image: { url: 'https://example.com/x.jpg' } },
      { id: 'b', name: 'B', image: { url: 'data:image/png;base64,AAA' } }
    ] };
    expect(collectAttributions(doc)).toHaveLength(0);
  });
});

describe('renderAttributions', () => {
  const text = renderAttributions(collectAttributions(campaign, meta as any), 'starmap.json');

  it('names the counts, the credits and the sources', () => {
    expect(text).toContain('**2 models, 2 images.**');
    expect(text).toContain('A Modeller');
    expect(text).toContain('https://models.example/hull');
    expect(text).toContain('Rocinante (Sol), Tycho Station (Sol)');
  });

  it('calls out CC-BY with no credit as a breach, not a gap', () => {
    expect(text).toMatch(/1 asset is licensed CC-BY with no credit recorded/);
    expect(text).toContain('**CC-BY with no credit recorded — the author must be named.**');
  });

  it('flags the asset with nothing recorded, without scolding about own art', () => {
    expect(text).toMatch(/1 asset has no provenance recorded at all/);
    expect(text).toContain('_No provenance recorded._');
    expect(text).toContain('fine for art you made yourself');
  });
});

describe('buildAttributionsFile', () => {
  it('is null when the save carries no uploaded assets', () => {
    expect(buildAttributionsFile({ nodes: [{ id: 'a', name: 'A' }] })).toBeNull();
  });
});
