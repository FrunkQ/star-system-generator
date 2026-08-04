// SAVE BUNDLES: a zip container for a campaign or a single system, with the heavy assets stored
// as REAL FILES beside a small, readable JSON — instead of base64 wedged inside it.
//
// WHY (owner decision 2026-08-04). A save is a working file: GMs hand-edit them, diff them, and
// swap art in them. Embedding assets as base64 fought all three — a data-URL photo or a model
// blob is thousands of unreadable characters in the middle of the data, and base64 costs 33% on
// top of bytes that are already the biggest thing in the file. In a zip the JSON stays small and
// legible, the assets are ordinary .glb/.jpg files you can open, replace or drop in, and the whole
// thing is still ONE file to hand to someone.
//
// LAYOUT (both kinds):
//   starmap.json | system.json     the data, with asset references in place of inline bytes
//   assets/models/<sha256>.glb     ship models, content-addressed (shared hulls stored once)
//   assets/images/<nodeId>.<ext>   body/construct pictures, one per node that has one
//
// COMPATIBILITY IS NOT OPTIONAL: plain .json saves still load, and a bundle is only produced when
// there is actually an asset to carry. `sniffBundle` decides by the zip magic number, never by the
// file extension — a renamed file still loads correctly.
import { zipSync, strToU8, strFromU8 } from 'fflate';
import { readZipMembers } from '$lib/import/shared/zip';

export const BUNDLE_EXT = '.sse.zip';
const MODELS_DIR = 'assets/models/';
const IMAGES_DIR = 'assets/images/';

export type BundleKind = 'starmap' | 'system';
const DOC_NAME: Record<BundleKind, string> = { starmap: 'starmap.json', system: 'system.json' };

/** True when these bytes are a zip (PK\x03\x04). The extension is not evidence; this is. */
export function sniffBundle(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

// --- data URLs -------------------------------------------------------------------------------
// Pictures live on nodes as `image.url`, and a GM upload is a data URL. Only those are extracted:
// an http(s) URL is a reference to someone else's server and must stay exactly as authored.
const DATA_URL_RE = /^data:([^;,]+)(;base64)?,(.*)$/s;
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg'
};

function dataUrlToBytes(url: string): { bytes: Uint8Array; ext: string; mime: string } | null {
  const m = DATA_URL_RE.exec(url);
  if (!m) return null;
  const [, mime, isB64, payload] = m;
  try {
    const raw = isB64 ? atob(payload) : decodeURIComponent(payload);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return { bytes, ext: EXT_BY_MIME[mime] ?? 'bin', mime };
  } catch {
    return null; // malformed: leave the node's url alone rather than losing the picture
  }
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = '';
  const CHUNK = 0x8000; // fromCharCode(...whole) overflows the argument limit on a big image
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return `data:${mime};base64,${btoa(bin)}`;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml'
};

/** File-safe node id: ids are GM-authored and may hold anything. Collisions are impossible
 *  because the ORIGINAL id is written into the reference the JSON keeps. */
function safeName(id: string): string {
  return (id || 'node').replace(/[^a-z0-9._-]/gi, '_').slice(0, 80);
}

// --- packing ---------------------------------------------------------------------------------

/** Every node in a starmap or a bare system, whatever the shape. */
function* allNodes(doc: any): Generator<any> {
  if (Array.isArray(doc?.nodes)) { for (const n of doc.nodes) yield n; }
  for (const entry of doc?.systems ?? []) {
    for (const n of entry?.system?.nodes ?? []) yield n;
  }
}

export interface PackOptions {
  /** Model binaries by hash, already collected from the store (see modelTransfer). */
  models?: Record<string, { b64: string; meta: Record<string, unknown> }>;
}

/**
 * Build a bundle. Returns null when there is NOTHING to extract — the caller then writes plain
 * JSON, so an asset-free campaign stays the small text file it has always been.
 */
export function packBundle(kind: BundleKind, doc: any, opts: PackOptions = {}): Uint8Array | null {
  const files: Record<string, Uint8Array> = {};
  // Deep clone so the live campaign is never mutated by an export.
  const out = JSON.parse(JSON.stringify(doc));
  let assets = 0;

  // Models: already base64 by hash from the store; write them out as real .glb files, and keep a
  // metadata-only map in the JSON so attribution stays readable and editable.
  const modelMeta: Record<string, Record<string, unknown>> = {};
  for (const [hash, entry] of Object.entries(opts.models ?? {})) {
    const raw = atob(entry.b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    files[`${MODELS_DIR}${hash}.glb`] = bytes;
    modelMeta[hash] = entry.meta ?? {};
    assets++;
  }
  if (assets) out.modelMeta = modelMeta;
  delete out.models; // the base64 map never travels in a bundle

  // Pictures: extract each uploaded data URL to a file and leave a relative path behind.
  for (const node of allNodes(out)) {
    const url: unknown = node?.image?.url;
    if (typeof url !== 'string' || !url.startsWith('data:')) continue;
    const parsed = dataUrlToBytes(url);
    if (!parsed) continue;
    const name = `${IMAGES_DIR}${safeName(node.id)}.${parsed.ext}`;
    files[name] = parsed.bytes;
    node.image = { ...node.image, url: name }; // a path the JSON reader can follow
    assets++;
  }

  if (!assets) return null; // nothing to carry: plain JSON is the better file

  files[DOC_NAME[kind]] = strToU8(JSON.stringify(out, null, 2));
  files['README.txt'] = strToU8(
    `Star System Explorer save bundle (${kind}).\n\n` +
    `${DOC_NAME[kind]} is the data - edit it in any text editor.\n` +
    `assets/models/*.glb are ship models, named by content hash.\n` +
    `assets/images/*   are uploaded pictures, named by the node they belong to.\n\n` +
    `Replace an asset by overwriting the file, keeping its name. Re-zip with these paths intact.\n` +
    `A plain .json save (no assets) still loads, and always will.\n`
  );
  // Models are already compressed (Draco/meshopt) and images are JPEG/PNG - storing them without
  // a second pass keeps packing fast and the archive honest about its size. The JSON does deflate.
  return zipSync(files, { level: 0 });
}

// --- unpacking -------------------------------------------------------------------------------

export interface UnpackedBundle {
  kind: BundleKind;
  doc: any;
  /** Model binaries by hash, in the shape importEmbeddedModels expects. */
  models: Record<string, { b64: string; meta: Record<string, unknown> }>;
}

/** Read a bundle. Throws (user-showable) when the archive holds no recognisable document. */
export function unpackBundle(bytes: Uint8Array): UnpackedBundle {
  // The shared reader throws its own "no .json/.glb/... members" message when it finds nothing.
  // That is right for an importer debugging a .ubox, and wrong here: a GM who opened the wrong
  // zip needs to be told it is not a save, not what file extensions we looked for.
  let members: Record<string, Uint8Array>;
  try {
    members = readZipMembers(bytes, ['.json', '.glb', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']);
  } catch {
    throw new Error('That zip is not a Star System Explorer save (no starmap.json or system.json inside).');
  }
  const names = Object.keys(members);

  const docName = names.find((n) => n.endsWith(DOC_NAME.starmap)) ?? names.find((n) => n.endsWith(DOC_NAME.system));
  if (!docName) throw new Error('That zip is not a Star System Explorer save (no starmap.json or system.json inside).');
  const kind: BundleKind = docName.endsWith(DOC_NAME.starmap) ? 'starmap' : 'system';
  const doc = JSON.parse(strFromU8(members[docName]));

  // Models back into the { hash: { b64, meta } } shape the existing importer verifies and stores.
  const models: Record<string, { b64: string; meta: Record<string, unknown> }> = {};
  for (const name of names) {
    const i = name.indexOf(MODELS_DIR);
    if (i < 0 || !name.endsWith('.glb')) continue;
    const hash = name.slice(i + MODELS_DIR.length, -4);
    const bytes2 = members[name];
    let bin = '';
    const CHUNK = 0x8000;
    for (let k = 0; k < bytes2.length; k += CHUNK) bin += String.fromCharCode(...bytes2.subarray(k, k + CHUNK));
    models[hash] = { b64: btoa(bin), meta: doc.modelMeta?.[hash] ?? {} };
  }
  delete doc.modelMeta;

  // Pictures back to data URLs, which is what every consumer expects (and what keeps the WebGL
  // surface untainted - see catalogue/document/bodyImage.ts).
  const byPath = new Map<string, Uint8Array>();
  for (const name of names) {
    const i = name.indexOf(IMAGES_DIR);
    if (i >= 0) byPath.set(name.slice(i), members[name]);
  }
  for (const node of allNodes(doc)) {
    const ref: unknown = node?.image?.url;
    if (typeof ref !== 'string' || !ref.startsWith(IMAGES_DIR)) continue;
    const bytes3 = byPath.get(ref);
    if (!bytes3) { delete node.image; continue; } // referenced but absent: honest blank, not a broken img
    const ext = ref.split('.').pop()?.toLowerCase() ?? '';
    node.image = { ...node.image, url: bytesToDataUrl(bytes3, MIME_BY_EXT[ext] ?? 'application/octet-stream') };
  }

  return { kind, doc, models };
}
