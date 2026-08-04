// The save bundle: a zip with the assets as real files beside a readable JSON. These pin the
// round trip and, more importantly, the COMPATIBILITY promise - a plain .json save must keep
// loading, and the format is decided by the zip magic number rather than the file name.
import { describe, it, expect } from 'vitest';
import { packBundle, unpackBundle, sniffBundle, BUNDLE_EXT } from './bundle';
import { strFromU8, strToU8, zipSync } from 'fflate';
import { readZipMembers } from '$lib/import/shared/zip';

const b64 = (s: string) => btoa(s);

function starmapWith(imageUrl: string | null, modelHash: string | null) {
  const node: any = { id: 'ship-1', name: 'Rocinante', kind: 'construct' };
  if (imageUrl) node.image = { url: imageUrl, custom: true };
  if (modelHash) node.model = { hash: modelHash, name: 'Hull' };
  return { name: 'Local Neighbourhood', systems: [{ name: 'Sol', system: { id: 'sol', nodes: [node] } }] };
}

describe('packBundle', () => {
  it('returns null when there is nothing to extract, so a plain save stays plain JSON', () => {
    expect(packBundle('starmap', starmapWith(null, null))).toBeNull();
  });

  it('writes models and pictures as real files and leaves the JSON small and readable', () => {
    const map = starmapWith('data:image/jpeg;base64,' + b64('JPEGBYTES'), 'abc123');
    const zip = packBundle('starmap', map, { models: { abc123: { b64: b64('GLBBYTES'), meta: { credit: 'A Modeller' } } } })!;
    expect(zip).toBeTruthy();
    expect(sniffBundle(zip)).toBe(true);

    const members = readZipMembers(zip, ['.json', '.glb', '.jpg', '.txt']);
    const names = Object.keys(members);
    expect(names.some((n) => n.endsWith('starmap.json'))).toBe(true);
    expect(names.some((n) => n.endsWith('assets/models/abc123.glb'))).toBe(true);
    expect(names.some((n) => n.includes('assets/images/ship-1.jpg'))).toBe(true);

    // The JSON must NOT contain the payloads any more - that is the whole point.
    const json = strFromU8(members[names.find((n) => n.endsWith('starmap.json'))!]);
    expect(json).not.toContain('GLBBYTES');
    expect(json).not.toContain(b64('JPEGBYTES'));
    expect(json).toContain('assets/images/ship-1.jpg'); // a path a human can follow
    expect(json).toContain('A Modeller');               // attribution stays legible
  });

  it('leaves a remote image URL exactly as authored', () => {
    const map = starmapWith('https://example.com/pic.jpg', 'abc123');
    const zip = packBundle('starmap', map, { models: { abc123: { b64: b64('G'), meta: {} } } })!;
    const members = readZipMembers(zip, ['.json']);
    const json = strFromU8(members[Object.keys(members).find((n) => n.endsWith('starmap.json'))!]);
    expect(json).toContain('https://example.com/pic.jpg');
  });

  it('does not mutate the campaign it was handed', () => {
    const map = starmapWith('data:image/png;base64,' + b64('PNG'), null);
    packBundle('starmap', map, {});
    expect(map.systems[0].system.nodes[0].image.url.startsWith('data:')).toBe(true);
  });
});

describe('unpackBundle', () => {
  it('round-trips a campaign: pictures back to data URLs, models back by hash', () => {
    const map = starmapWith('data:image/jpeg;base64,' + b64('JPEGBYTES'), 'abc123');
    const zip = packBundle('starmap', map, { models: { abc123: { b64: b64('GLBBYTES'), meta: { credit: 'A Modeller' } } } })!;

    const out = unpackBundle(zip);
    expect(out.kind).toBe('starmap');
    const node = out.doc.systems[0].system.nodes[0];
    expect(node.image.url).toBe('data:image/jpeg;base64,' + b64('JPEGBYTES'));
    expect(node.image.custom).toBe(true);         // the rest of the ImageRef survives
    expect(node.model.hash).toBe('abc123');
    expect(out.models.abc123.b64).toBe(b64('GLBBYTES'));
    expect(out.models.abc123.meta.credit).toBe('A Modeller');
    expect(out.doc.modelMeta).toBeUndefined();    // an implementation detail, not campaign data
  });

  it('round-trips a single SYSTEM save the same way', () => {
    const system = { id: 'sol', name: 'Sol', nodes: [{ id: 'earth', name: 'Earth', image: { url: 'data:image/png;base64,' + b64('P') } }] };
    const zip = packBundle('system', system, {})!;
    const out = unpackBundle(zip);
    expect(out.kind).toBe('system');
    expect(out.doc.nodes[0].image.url).toBe('data:image/png;base64,' + b64('P'));
  });

  it('drops a picture whose file is missing rather than leaving a broken reference', () => {
    const map = starmapWith('data:image/jpeg;base64,' + b64('J'), null);
    const zip = packBundle('starmap', map, {})!;
    // Rebuild the archive without the image member.
    const members = readZipMembers(zip, ['.json', '.jpg']);
    const docName = Object.keys(members).find((n) => n.endsWith('starmap.json'))!;
    const stripped = zipSync({ 'starmap.json': strToU8(strFromU8(members[docName])) }, { level: 0 });
    const out = unpackBundle(stripped);
    expect(out.doc.systems[0].system.nodes[0].image).toBeUndefined();
  });

  it('refuses a zip that is not one of ours, with a message a GM can act on', () => {
    const notOurs = zipSync({ 'notes.txt': strToU8('hello') }, { level: 0 });
    expect(() => unpackBundle(notOurs)).toThrow(/Star System Explorer save/);
  });
});

describe('sniffBundle', () => {
  it('decides on the magic number, not the extension', () => {
    expect(sniffBundle(new TextEncoder().encode('{"name":"plain json"}'))).toBe(false);
    expect(BUNDLE_EXT).toBe('.sse.zip');
  });
});
