// The save bundle: a zip with the assets as real files beside a readable JSON. These pin the
// round trip and, more importantly, the COMPATIBILITY promise - a plain .json save must keep
// loading, and the format is decided by the zip magic number rather than the file name.
import { describe, it, expect } from 'vitest';
import { packBundle, unpackBundle, sniffBundle, BUNDLE_EXT } from './bundle';
import { hashModelBytes } from '$lib/constructs/modelStore';
import { strFromU8, strToU8, zipSync } from 'fflate';
import { readZipMembers } from '$lib/import/shared/zip';
import { stripSystemForExport, stripStarmapForExport } from '$lib/system/importFixup';

const b64 = (s: string) => btoa(s);

// REAL content addresses. These specs used to name their model file `abc123`, which R-03 now
// refuses on export: `assets/models/<sha256>.glb` is a content address, and an invented name is
// exactly the crafted-bundle shape the assertion exists to catch. Computed here rather than
// pinned as literals because these are LAYOUT tests - the absolute anchors live in
// formatStamp.spec.ts, which is the gate for the hashing itself.
const hashOf = (text: string) => hashModelBytes(new TextEncoder().encode(text));
const HASH_GLBBYTES = await hashOf('GLBBYTES');
const HASH_G = await hashOf('G');

function starmapWith(imageUrl: string | null, modelHash: string | null) {
  const node: any = { id: 'ship-1', name: 'Rocinante', kind: 'construct' };
  if (imageUrl) node.image = { url: imageUrl, custom: true };
  if (modelHash) node.model = { hash: modelHash, name: 'Hull' };
  return { name: 'Local Neighbourhood', systems: [{ name: 'Sol', system: { id: 'sol', nodes: [node] } }] };
}

describe('packBundle', async () => {
  it('returns null when there is nothing to extract, so a plain save stays plain JSON', async () => {
    expect(await packBundle('starmap', starmapWith(null, null))).toBeNull();
  });

  it('writes models and pictures as real files and leaves the JSON small and readable', async () => {
    const map = starmapWith('data:image/jpeg;base64,' + b64('JPEGBYTES'), HASH_GLBBYTES);
    const zip = (await packBundle('starmap', map, { models: { [HASH_GLBBYTES]: { b64: b64('GLBBYTES'), meta: { credit: 'A Modeller' } } } }))!;
    expect(zip).toBeTruthy();
    expect(sniffBundle(zip)).toBe(true);

    const members = readZipMembers(zip, ['.json', '.glb', '.jpg', '.txt']);
    const names = Object.keys(members);
    expect(names.some((n) => n.endsWith('starmap.json'))).toBe(true);
    expect(names.some((n) => n.endsWith(`assets/models/${HASH_GLBBYTES}.glb`))).toBe(true);
    expect(names.some((n) => n.includes('assets/images/ship-1.jpg'))).toBe(true);

    // The JSON must NOT contain the payloads any more - that is the whole point.
    const json = strFromU8(members[names.find((n) => n.endsWith('starmap.json'))!]);
    expect(json).not.toContain('GLBBYTES');
    expect(json).not.toContain(b64('JPEGBYTES'));
    expect(json).toContain('assets/images/ship-1.jpg'); // a path a human can follow
    expect(json).toContain('A Modeller');               // attribution stays legible
  });

  it('writes ATTRIBUTIONS.md naming the art and what uses it', async () => {
    const map = starmapWith('data:image/jpeg;base64,' + b64('J'), HASH_G);
    const zip = (await packBundle('starmap', map, { models: { [HASH_G]: { b64: b64('G'), meta: { credit: 'A Modeller', license: 'CC-BY' } } } }))!;
    const members = readZipMembers(zip, ['.md', '.txt']);
    const name = Object.keys(members).find((n) => n.endsWith('ATTRIBUTIONS.md'))!;
    expect(name).toBeTruthy();
    const text = strFromU8(members[name]);
    expect(text).toContain('A Modeller');
    expect(text).toContain('Rocinante');            // what uses it
    expect(text).toContain(`assets/models/${HASH_G}.glb`);
    // The picture had nothing recorded, and the file must say so rather than omit it.
    expect(text).toContain('_No provenance recorded._');
  });

  it('leaves a remote image URL exactly as authored', async () => {
    const map = starmapWith('https://example.com/pic.jpg', HASH_G);
    const zip = (await packBundle('starmap', map, { models: { [HASH_G]: { b64: b64('G'), meta: {} } } }))!;
    const members = readZipMembers(zip, ['.json']);
    const json = strFromU8(members[Object.keys(members).find((n) => n.endsWith('starmap.json'))!]);
    expect(json).toContain('https://example.com/pic.jpg');
  });

  it('does not mutate the campaign it was handed', async () => {
    const map = starmapWith('data:image/png;base64,' + b64('PNG'), null);
    await packBundle('starmap', map, {});
    expect(map.systems[0].system.nodes[0].image.url.startsWith('data:')).toBe(true);
  });
});

describe('unpackBundle', async () => {
  it('round-trips a campaign: pictures back to data URLs, models back by hash', async () => {
    const map = starmapWith('data:image/jpeg;base64,' + b64('JPEGBYTES'), HASH_GLBBYTES);
    const zip = (await packBundle('starmap', map, { models: { [HASH_GLBBYTES]: { b64: b64('GLBBYTES'), meta: { credit: 'A Modeller' } } } }))!;

    const out = unpackBundle(zip);
    expect(out.kind).toBe('starmap');
    const node = out.doc.systems[0].system.nodes[0];
    expect(node.image.url).toBe('data:image/jpeg;base64,' + b64('JPEGBYTES'));
    expect(node.image.custom).toBe(true);         // the rest of the ImageRef survives
    expect(node.model.hash).toBe(HASH_GLBBYTES);
    expect(out.models[HASH_GLBBYTES].b64).toBe(b64('GLBBYTES'));
    expect(out.models[HASH_GLBBYTES].meta.credit).toBe('A Modeller');
    expect(out.doc.modelMeta).toBeUndefined();    // an implementation detail, not campaign data
  });

  it('round-trips a single SYSTEM save the same way', async () => {
    const system = { id: 'sol', name: 'Sol', nodes: [{ id: 'earth', name: 'Earth', image: { url: 'data:image/png;base64,' + b64('P') } }] };
    const zip = (await packBundle('system', system, {}))!;
    const out = unpackBundle(zip);
    expect(out.kind).toBe('system');
    expect(out.doc.nodes[0].image.url).toBe('data:image/png;base64,' + b64('P'));
  });

  it('drops a picture whose file is missing rather than leaving a broken reference', async () => {
    const map = starmapWith('data:image/jpeg;base64,' + b64('J'), null);
    const zip = (await packBundle('starmap', map, {}))!;
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

// G28. A save is a shared artefact - a GM sends a campaign to another GM, and this project ships
// bundled example starmaps - so the GM's undo history must not be inside one, in EITHER format.
// The strip lives in `stripSystemForExport` / `stripStarmapForExport`, which both save paths call
// before packing; these assert the promise at the file itself, where a reader can check it.
describe('a save never carries the GM undo history', async () => {
  const SECRET = 'the ambassador is a construct';

  function mapWithHistory() {
    const map: any = starmapWith(null, HASH_G);
    map.undoHistory = [{ at: 1, authored: { gmNotes: SECRET } }];
    map.systems[0].system.undoHistory = [{ at: 2, authored: { name: SECRET } }];
    return map;
  }

  it('as a BUNDLE: the starmap.json inside the zip has none', async () => {
    const lean = stripStarmapForExport(mapWithHistory());
    const zip = (await packBundle('starmap', lean, { models: { [HASH_G]: { b64: b64('G'), meta: {} } } }))!;
    const members = readZipMembers(zip, ['.json']);
    const json = strFromU8(members[Object.keys(members).find((n) => n.endsWith('starmap.json'))!]);
    expect(json).not.toContain(SECRET);
    expect(json).not.toContain('undoHistory');
  });

  it('as PLAIN JSON: the no-assets path drops it too', async () => {
    const lean = stripStarmapForExport(mapWithHistory());
    expect(await packBundle('starmap', lean)).toBeNull();          // nothing to extract -> plain .json
    const json = JSON.stringify(lean, null, 2);              // what the download would write
    expect(json).not.toContain(SECRET);
    expect(json).not.toContain('undoHistory');
  });

  it('and a SINGLE-SYSTEM save, in both formats', async () => {
    const sys: any = { id: 'sol', name: 'Sol', nodes: [{ id: 'earth', kind: 'body', name: 'Earth' }] };
    sys.undoHistory = [{ at: 1, authored: { gmNotes: SECRET } }];
    const lean = stripSystemForExport(sys);
    expect(JSON.stringify(lean)).not.toContain(SECRET);
    expect(await packBundle('system', lean)).toBeNull();
  });
});

describe('sniffBundle', () => {
  it('decides on the magic number, not the extension', async () => {
    expect(sniffBundle(new TextEncoder().encode('{"name":"plain json"}'))).toBe(false);
    expect(BUNDLE_EXT).toBe('.sse.zip');
  });
});

// G16 - THE MAP BACKGROUND MUST SURVIVE A SAVE, and "survive" means three things at once: the
// PICTURE (as a real file, not base64 in the JSON), the ANCHOR (which is what makes it a map rather
// than a decoration), and the CREDIT (which for a CC-BY image is a licence condition). Losing any
// one of them loses GM work or breaks an obligation, so all three are pinned here.
function starmapWithBackground(over: any = {}) {
  return {
    name: 'Border Reach',
    scale: { unit: 'ly', pixelsPerUnit: 10, showScaleBar: true },
    systems: [{ name: 'Sol', system: { id: 'sol', nodes: [{ id: 'sol-a', name: 'Sol', kind: 'body' }] } }],
    playerAssets: [
      { id: 'asset-sector-map', name: 'Sector map', dataUrl: 'data:image/png;base64,' + b64('PNGBYTES'),
        w: 2048, h: 1280, credit: 'A Cartographer', license: 'CC BY 4.0', sourceUrl: 'https://example.test/map' }
    ],
    playerPresets: [
      { id: 'p1', name: 'Table view', starmapOverlay: null, systemOverlay: null, cover: { graphic: null } }
    ],
    mapBackground: {
      source: 'asset', assetId: 'asset-sector-map', attach: 'map',
      opacity: 0.8, sizePct: 100, widthUnits: 40, offsetX: 3, offsetY: -2, rotationDeg: 15,
      ...over
    }
  };
}

describe('G16: the map background rides the save bundle', async () => {
  it('extracts the picture to a real file and takes the base64 out of the JSON', async () => {
    const zip = (await packBundle('starmap', starmapWithBackground()))!;
    expect(zip).toBeTruthy();
    const members = readZipMembers(zip, ['.json', '.png', '.md', '.txt']);
    const names = Object.keys(members);
    expect(names.some((n) => n.includes('assets/images/player/asset-sector-map.png'))).toBe(true);
    const json = strFromU8(members[names.find((n) => n.endsWith('starmap.json'))!]);
    expect(json).not.toContain(b64('PNGBYTES'));
    expect(json).toContain('assets/images/player/asset-sector-map.png');
  });

  it('a campaign whose ONLY asset is the background still becomes a bundle', async () => {
    // The picture is the only thing to carry, so `packBundle` must not decide there is nothing.
    expect(await packBundle('starmap', starmapWithBackground())).not.toBeNull();
  });

  it('round-trips picture, anchor and credit together', async () => {
    const zip = (await packBundle('starmap', starmapWithBackground()))!;
    const { doc } = unpackBundle(zip);
    const asset = doc.playerAssets[0];
    expect(asset.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(strFromU8(new Uint8Array([...atob(asset.dataUrl.split(',')[1])].map((c) => c.charCodeAt(0))))).toBe('PNGBYTES');
    // THE ANCHOR. Without these numbers the picture is decoration, not a map.
    expect(doc.mapBackground).toEqual({
      source: 'asset', assetId: 'asset-sector-map', attach: 'map',
      opacity: 0.8, sizePct: 100, widthUnits: 40, offsetX: 3, offsetY: -2, rotationDeg: 15
    });
    // THE CREDIT, and the recorded bitmap size with it.
    expect(asset.credit).toBe('A Cartographer');
    expect(asset.license).toBe('CC BY 4.0');
    expect(asset.sourceUrl).toBe('https://example.test/map');
    expect(asset.w).toBe(2048);
  });

  it('ATTRIBUTIONS.md names the background, what it is used for, and its licence', async () => {
    const zip = (await packBundle('starmap', starmapWithBackground()))!;
    const members = readZipMembers(zip, ['.json', '.png', '.md']);
    const md = strFromU8(members[Object.keys(members).find((n) => n.endsWith('ATTRIBUTIONS.md'))!]);
    expect(md).toContain('assets/images/player/asset-sector-map.png');
    expect(md).toContain('map background');
    expect(md).toContain('A Cartographer');
    expect(md).toContain('CC BY 4.0');
  });

  it('CC-BY WITH NO CREDIT is reported as a breach, not as a tidy gap', async () => {
    const map: any = starmapWithBackground();
    delete map.playerAssets[0].credit;
    const zip = (await packBundle('starmap', map))!;
    const members = readZipMembers(zip, ['.json', '.png', '.md']);
    const md = strFromU8(members[Object.keys(members).find((n) => n.endsWith('ATTRIBUTIONS.md'))!]);
    expect(md).toContain('CC-BY requires naming the author');
  });

  it('a built-in starter graphic is NOT extracted - it is a static path, not an upload', async () => {
    const map: any = starmapWithBackground();
    map.playerAssets.push({ id: 'builtin-sse-logo', name: 'SSE2', dataUrl: '/images/logo/SSE.png' });
    const zip = (await packBundle('starmap', map))!;
    const members = readZipMembers(zip, ['.json', '.png', '.md']);
    expect(Object.keys(members).some((n) => n.includes('builtin-sse-logo'))).toBe(false);
    const json = strFromU8(members[Object.keys(members).find((n) => n.endsWith('starmap.json'))!]);
    expect(json).toContain('/images/logo/SSE.png'); // survives exactly as authored
  });

  it('a body photo and a player graphic do not claim each other, despite the shared prefix', async () => {
    const map: any = starmapWithBackground();
    map.systems[0].system.nodes[0].image = { url: 'data:image/jpeg;base64,' + b64('BODYJPEG'), credit: 'Someone else' };
    const { doc } = unpackBundle(await packBundle('starmap', map)!);
    expect(doc.systems[0].system.nodes[0].image.url.startsWith('data:image/jpeg')).toBe(true);
    expect(doc.playerAssets[0].dataUrl.startsWith('data:image/png')).toBe(true);
    expect(doc.playerAssets[0].credit).toBe('A Cartographer'); // not "Someone else"
  });

  it('a campaign with a background but no image chosen stays plain JSON', async () => {
    const map: any = starmapWithBackground({ source: 'default', assetId: undefined });
    delete map.playerAssets;
    expect(await packBundle('starmap', map)).toBeNull();
  });
});
