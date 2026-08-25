// G42: the one shared sniffer. These pin the contract every loader now leans on — kind comes
// from shape (JSON) or the zip member name (bundle), NEVER from the file name or extension, and
// classifying a document must not change it (isLoadableSystem stamps rulePackId; this must not).
import { describe, it, expect } from 'vitest';
import { classifySaveFile, classifyJsonDoc } from './classify';
import { packBundle } from './bundle';
import { strToU8, zipSync } from 'fflate';

const enc = (o: any) => new TextEncoder().encode(JSON.stringify(o));
const b64 = (s: string) => btoa(s);

const systemDoc = { id: 'sol', name: 'Sol', nodes: [{ id: 'star', kind: 'star' }] };
const starmapDoc = {
  id: 'map', name: 'Local', distanceUnit: 'ly',
  systems: [{ id: 's1', name: 'Sol', position: { x: 0, y: 0 }, system: systemDoc }],
  routes: []
};

describe('classifyJsonDoc', () => {
  it('names a system by its nodes array', () => {
    expect(classifyJsonDoc(systemDoc)).toBe('system');
  });

  it('names a campaign by its systems + routes arrays', () => {
    expect(classifyJsonDoc(starmapDoc)).toBe('starmap');
  });

  it('answers unknown for anything else', () => {
    expect(classifyJsonDoc(null)).toBe('unknown');
    expect(classifyJsonDoc([1, 2])).toBe('unknown');
    expect(classifyJsonDoc({ some: 'other json' })).toBe('unknown');
    // systems without routes is not enough to claim campaign
    expect(classifyJsonDoc({ systems: [] })).toBe('unknown');
  });

  it('does not mutate the document it inspects', () => {
    const doc: any = { id: 'x', name: 'X', nodes: [] };
    const before = JSON.stringify(doc);
    classifyJsonDoc(doc);
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe('classifySaveFile', () => {
  it('classifies plain JSON saves by shape, and hands the parsed doc back', () => {
    const sys = classifySaveFile(enc(systemDoc));
    expect(sys).toMatchObject({ kind: 'system', container: 'json' });
    expect(sys.doc.id).toBe('sol');

    const map = classifySaveFile(enc(starmapDoc));
    expect(map).toMatchObject({ kind: 'starmap', container: 'json' });
    expect(map.doc.systems.length).toBe(1);
  });

  it('classifies a bundle by the zip, whatever the bytes were named (shape, not extension)', () => {
    // packBundle only produces a zip when there is an asset to carry - give it a picture.
    const withArt = {
      ...starmapDoc,
      systems: [{ ...starmapDoc.systems[0], system: { id: 'sol', name: 'Sol', nodes: [{ id: 'star', image: { url: 'data:image/png;base64,' + b64('PNG') } }] } }]
    };
    const zip = packBundle('starmap', withArt)!;
    expect(zip).toBeTruthy();
    const c = classifySaveFile(zip);
    expect(c.kind).toBe('starmap');
    expect(c.container).toBe('bundle');
    expect(c.doc.systems.length).toBe(1);
  });

  it('carries a system bundle\'s models through, ready for importEmbeddedModels', () => {
    const sys = { ...systemDoc, nodes: [{ id: 'ship', kind: 'construct', model: { hash: 'abc' } }] };
    const zip = packBundle('system', sys, { models: { abc: { b64: b64('GLB'), meta: {} } } })!;
    const c = classifySaveFile(zip);
    expect(c.kind).toBe('system');
    expect(c.models?.abc?.b64).toBe(b64('GLB'));
  });

  it('answers unknown, with a plain sentence, for a zip that is not a save', () => {
    const zip = zipSync({ 'readme.txt': strToU8('not a save') });
    const c = classifySaveFile(zip);
    expect(c.kind).toBe('unknown');
    expect(c.container).toBe('bundle');
    expect(c.problem).toMatch(/not a Star System Explorer save/i);
  });

  it('answers unknown for bytes that are not JSON at all', () => {
    const c = classifySaveFile(new TextEncoder().encode('this is a text file'));
    expect(c.kind).toBe('unknown');
    expect(c.container).toBe('json');
    expect(c.problem).toMatch(/not valid JSON/i);
  });

  it('answers unknown for JSON that is neither kind, and says what was looked for', () => {
    const c = classifySaveFile(enc({ hello: 'world' }));
    expect(c.kind).toBe('unknown');
    expect(c.problem).toMatch(/systems|nodes/);
  });
});
