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
//   assets/images/player/<assetId>.<ext>  player-view graphics: logos, overlays, and the map
//                                         background (G16) - a GM's sector map is often the single
//                                         biggest asset in a campaign, and base64 inside the JSON is
//                                         exactly what DATA-M3 exists to stop
//
// COMPATIBILITY IS NOT OPTIONAL: plain .json saves still load, and a bundle is only produced when
// there is actually an asset to carry. `sniffBundle` decides by the zip magic number, never by the
// file extension — a renamed file still loads correctly.
import { zipSync, strToU8, strFromU8 } from 'fflate';
import { readZipMembers } from '$lib/import/shared/zip';
import { buildAttributionsFile } from './attributions';
// The content address has ONE implementation in this repo and this is a CONSUMER of it, not a
// second copy: a bundle names a model file after the same sha256 the store keys it by, so if the
// two could ever disagree the archive would be the thing that lied. See DATA-R34.
import { hashModelBytes } from '$lib/constructs/modelStore';

export const BUNDLE_EXT = '.sse.zip';

// THE FORMAT CONTRACT. A second codebase now reads these archives (the Creator Hub, its own repo,
// its own release cadence), and `provenance.appVersion` cannot serve: it is a BUILD STAMP, so
// v3.0.1 and v3.9.0 may have identical or incompatible layouts and nothing says which. This integer
// says which. Bump it ONLY on a breaking layout change - a new optional field is not one - and
// regenerate `tests/fixtures/creator-hub-bundle.sse.zip` in the same commit; `hubFixture.spec.ts`
// goes red if you do one without the other. A reader that meets a HIGHER number should refuse
// politely rather than parse what it does not understand.
export const BUNDLE_FORMAT = 1;

/**
 * Put the format stamp on a document about to be WRITTEN, wherever it is written - the zip's
 * `starmap.json`, and a plain `.json` save just the same.
 *
 * TWO RULES ARE ENCODED HERE AND BOTH MATTER (DATA-R34):
 *  - **This writer decides.** Any inherited `bundleFormat` is dropped before the current one goes
 *    on, so a document that came out of an old archive cannot carry an old claim into a new file.
 *  - **The stamp goes FIRST**, so a reader - or a GM with a text editor - meets it before a
 *    megabyte of nodes rather than hunting for it at the end.
 *
 * WHY PLAIN JSON NEEDS IT TOO, which is the whole of R-01's remaining half: an asset-free campaign
 * saves as plain `.json`, and the hub's JSON-only kill switch makes exactly those files its only
 * accepted uploads. A stamp that lives only inside the zip is absent from every file the hub would
 * still be reading on the day it needs the stamp most.
 */
export function stampBundleFormat<T extends object>(doc: T): T {
  const { bundleFormat: _inherited, ...rest } = doc as Record<string, unknown>;
  return { bundleFormat: BUNDLE_FORMAT, ...rest } as unknown as T;
}

/**
 * THE TEXT OF A PLAIN `.json` SAVE. Every save that is not a zip goes through here, which is the
 * whole point: R-01's gap was not that one export forgot the stamp, it was that the stamp lived
 * inside `packBundle` where only the zip path could reach it. FOUR call sites write a save
 * document as plain JSON - the campaign save with no assets, the single-system save with no
 * assets, the red-zone crash file, and the emergency "download the stored map" recovery export -
 * and spelling the decision out four times is three chances to forget it.
 *
 * `pretty` is off for the crash file alone: that path runs at 3 GB of heap, where the extra
 * allocation of an indented copy is exactly the push over the cliff it exists to survive.
 */
export function plainSaveJson(doc: object, opts: { pretty?: boolean } = {}): string {
  const stamped = stampBundleFormat(doc);
  return opts.pretty === false ? JSON.stringify(stamped) : JSON.stringify(stamped, null, 2);
}

/**
 * Take the stamp OFF a parsed plain-JSON document and hand it back, the way `unpackBundle` does
 * for an archive. The stamp describes the CONTAINER, not the campaign: leaving it on the live
 * campaign would put a format claim into the autosave and out again through every later export.
 * Returns 0 for a file written before the stamp existed - legacy, never an error.
 */
export function takeBundleFormat(doc: any): number {
  if (!doc || typeof doc !== 'object') return 0;
  const format = typeof doc.bundleFormat === 'number' ? doc.bundleFormat : 0;
  delete doc.bundleFormat;
  return format;
}
const MODELS_DIR = 'assets/models/';
const IMAGES_DIR = 'assets/images/';
// Player-view graphics live in their own subfolder of the image directory. A subfolder rather than a
// prefix so that a GM opening the zip can see at a glance which pictures are body photos and which
// are their own artwork - and note that 'player/' starts with the image dir, so anything matching on
// IMAGES_DIR must exclude it explicitly rather than claiming every player asset.
const PLAYER_IMAGES_DIR = 'assets/images/player/';

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
  /** Pin every zip entry's timestamp, so the archive is reproducible byte for byte. Only the
   *  checked-in contract fixture sets this; a real save leaves it unset and carries the true date. */
  mtime?: number | string | Date;
}

/**
 * Build a bundle. Returns null when there is NOTHING to extract — the caller then writes plain
 * JSON, so an asset-free campaign stays the small text file it has always been.
 *
 * ASYNC because of the R-03 assertion below: the content address is a SHA-256 and the platform's
 * digest is async. Every caller was already async, and the alternative — a second, synchronous
 * sha256 in this repo — is the exact fault the standing duplication rule exists to stop.
 */
export async function packBundle(kind: BundleKind, doc: any, opts: PackOptions = {}): Promise<Uint8Array | null> {
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
    // R-03 / DATA-R34: THE NAME MUST BE THE BYTES. A model file is named after a hash, and a
    // consumer that keys anything on the path-supplied hash — an approval, a cache entry, a
    // dedup slot — inherits whatever that name claims. The hub defends itself by hashing the
    // bytes and treating the path as a claim, but an engine that writes a name it did not check
    // turns a corrupt store or a bad caller into SILENT corruption in somebody else's system.
    // One comparison, on a path that has the bytes in hand, makes it a caught bug instead.
    const actual = await hashModelBytes(bytes);
    if (actual !== hash) {
      throw new Error(
        `Export aborted: the model stored as ${hash.slice(0, 12)}… actually hashes to ` +
        `${actual.slice(0, 12)}…, so the file would be named after content it does not hold. ` +
        `Re-upload that model and save again.`
      );
    }
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

  // G16: player-view graphics (cover art, overlays, the map background). Same rule as a node photo -
  // only a data: URL is extracted, because the built-in starters are same-origin static paths that
  // must survive untouched.
  for (const a of out.playerAssets ?? []) {
    const url: unknown = a?.dataUrl;
    if (typeof url !== 'string' || !url.startsWith('data:')) continue;
    const parsed = dataUrlToBytes(url);
    if (!parsed) continue;
    const name = `${PLAYER_IMAGES_DIR}${safeName(a.id)}.${parsed.ext}`;
    files[name] = parsed.bytes;
    a.dataUrl = name;
    assets++;
  }

  if (!assets) return null; // nothing to carry: plain JSON is the better file

  // The stamp, and the discipline behind it, live in stampBundleFormat — the plain-JSON export
  // path calls the same function, so the two containers cannot drift apart on what they claim.
  files[DOC_NAME[kind]] = strToU8(JSON.stringify(stampBundleFormat(out), null, 2));
  // Provenance travels WITH the art: a readable file naming every uploaded asset, what uses it,
  // and its credit/licence/source - including the ones with nothing recorded, so a GM can see
  // what still needs filling in before they share the save.
  const attributions = buildAttributionsFile(out, modelMeta, DOC_NAME[kind]);
  if (attributions) files['ATTRIBUTIONS.md'] = strToU8(attributions);
  files['README.txt'] = strToU8(
    `Star System Explorer save bundle (${kind}).\n\n` +
    `${DOC_NAME[kind]} is the data - edit it in any text editor.\n` +
    `assets/models/*.glb are ship models, named by content hash.\n` +
    `assets/images/*   are uploaded pictures, named by the node they belong to.\n` +
    `assets/images/player/* are player-view graphics: logos, overlays and the map background.\n` +
    `ATTRIBUTIONS.md   who made the art and under what licence - read it before sharing.\n\n` +
    `Replace an asset by overwriting the file, keeping its name. Re-zip with these paths intact.\n` +
    `A plain .json save (no assets) still loads, and always will.\n`
  );
  // Models are already compressed (Draco/meshopt) and images are JPEG/PNG - storing them without
  // a second pass keeps packing fast and the archive honest about its size. The JSON does deflate.
  return zipSync(files, opts.mtime === undefined ? { level: 0 } : { level: 0, mtime: opts.mtime });
}

// --- unpacking -------------------------------------------------------------------------------

export interface UnpackedBundle {
  kind: BundleKind;
  /** The archive's `bundleFormat`, or 0 for a bundle written before the stamp existed. */
  format: number;
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
  // The stamp describes the CONTAINER, not the campaign, so it comes off the doc the way modelMeta
  // does, and is returned instead where a caller can act on it. Same function the plain-JSON door
  // calls, so the two containers cannot answer "what format was that?" differently.
  const format = takeBundleFormat(doc);

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
  // G16: player-view graphics back to data URLs. Their paths sit UNDER the node image directory, so
  // the node loop below excludes them explicitly rather than by luck.
  for (const a of doc.playerAssets ?? []) {
    const ref: unknown = a?.dataUrl;
    if (typeof ref !== 'string' || !ref.startsWith(PLAYER_IMAGES_DIR)) continue;
    const bytes4 = byPath.get(ref);
    if (!bytes4) continue; // referenced but absent: leave the path, so the loss is visible not silent
    const ext = ref.split('.').pop()?.toLowerCase() ?? '';
    a.dataUrl = bytesToDataUrl(bytes4, MIME_BY_EXT[ext] ?? 'application/octet-stream');
  }

  for (const node of allNodes(doc)) {
    const ref: unknown = node?.image?.url;
    if (typeof ref !== 'string' || !ref.startsWith(IMAGES_DIR) || ref.startsWith(PLAYER_IMAGES_DIR)) continue;
    const bytes3 = byPath.get(ref);
    if (!bytes3) { delete node.image; continue; } // referenced but absent: honest blank, not a broken img
    const ext = ref.split('.').pop()?.toLowerCase() ?? '';
    node.image = { ...node.image, url: bytesToDataUrl(bytes3, MIME_BY_EXT[ext] ?? 'application/octet-stream') };
  }

  return { kind, format, doc, models };
}
