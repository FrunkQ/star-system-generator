// ATTRIBUTIONS.md: the provenance of the art in a save, in a form a person reads without the app.
// The load-bearing cases are the UNHAPPY ones - an asset with nothing recorded must be named as
// such, and CC-BY without a credit must be called out, because that is an obligation the GM is
// about to breach by sharing.
import { describe, it, expect } from 'vitest';
import { collectAttributions, renderAttributions, buildAttributionsFile } from './attributions';
import { SHIPPED_ART_CREDITS, SHIPPED_DATA_CREDITS, licenceRequiresNaming } from './shippedCredits';

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

  it('credits a BODY photo, not only construct art', () => {
    // Body pictures went uncredited for a while because the planet editor recorded no
    // provenance - the collector always read them, so this pins the whole path.
    const doc = { nodes: [
      { id: 'mars', name: 'Mars', image: { url: 'assets/images/mars.jpg', credit: 'A Photographer', license: 'CC-BY', sourceUrl: 'https://pics.example/mars' } }
    ] };
    const [entry] = collectAttributions(doc);
    expect(entry.kind).toBe('image');
    expect(entry.usedBy).toEqual(['Mars']);     // no system name on a bare system save
    expect(entry.credit).toBe('A Photographer');
    const text = renderAttributions([entry], 'system.json');
    expect(text).toContain('A Photographer');
    expect(text).not.toContain('No provenance recorded');
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

// WHAT THE APP ITSELF BROUGHT (stream I, 2026-09-06). This file is the one that TRAVELS, and the
// app's own shipped imagery includes CC BY-SA and CC BY works whose licences require the author be
// named wherever the work goes. It carried ONE sentence about the NASA models, while telling a GM
// in the same breath that "CC-BY requires naming the author" about their uploads. These assert the
// obligation rather than the wording.
describe('the credits the app itself owes', () => {
  const rendered = () => renderAttributions(collectAttributions(campaign, meta), 'starmap.json');

  it('names every shipped work, its author and its licence, in the file that leaves the machine', () => {
    const out = rendered();
    for (const c of [...SHIPPED_ART_CREDITS, ...SHIPPED_DATA_CREDITS]) {
      expect(out, `${c.what} is not credited`).toContain(c.what);
      expect(out, `${c.what} does not name ${c.who}`).toContain(c.who);
      expect(out, `${c.what} does not state its licence`).toContain(c.licence);
    }
  });

  // ABSOLUTE, NOT A RATIO: a CC-BY entry with no author is the one combination that is actively
  // wrong, and it is the exact fault this file already flags on a GM's own uploads.
  it('leaves no attribution-licensed work of ours without a name', () => {
    const unnamed = [...SHIPPED_ART_CREDITS, ...SHIPPED_DATA_CREDITS]
      .filter((c) => licenceRequiresNaming(c.licence) && !c.who.trim())
      .map((c) => c.what);
    expect(unnamed, 'attribution-licensed with nobody named: ' + unnamed.join(', ')).toEqual([]);
  });

  // The section rides on a file that is only written when there is something to attribute, so a
  // campaign with pasted content but no uploads must still carry it.
  it('rides along on a save whose only credit is pasted content', () => {
    const out = buildAttributionsFile({
      nodes: [{ id: 'a', name: 'A' }],
      contentCredits: [{ title: 'Alpha', creator: 'alice', url: 'https://example/map', nodeIds: ['a'] }]
    });
    expect(out).not.toBeNull();
    expect(out!).toContain('What the app itself brought');
    expect(out!).toContain('Content from other cartographers');
  });
});

describe('buildAttributionsFile', () => {
  it('is null when the save carries no uploaded assets', () => {
    expect(buildAttributionsFile({ nodes: [{ id: 'a', name: 'A' }] })).toBeNull();
  });
});
