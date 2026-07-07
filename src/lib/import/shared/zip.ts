// Shared, dependency-quirk-free ZIP reader for the importers (browser-safe). Used by the Universe
// Sandbox (.ubox) and SpaceEngine (.pak) importers.
//
// We deliberately do NOT use fflate's unzipSync: (1) it eagerly decompresses EVERY member (a .ubox
// bundles a huge -surface.zip terrain blob + preview images; a .pak bundles textures) we never read;
// and, decisively, (2) some writers (Universe Sandbox) produce ZIP64 archives, and fflate's BROWSER
// build reads the ZIP64 size sentinel (0xFFFFFFFF) as a literal 4 GB and throws "Array buffer allocation
// failed". This minimal reader walks the central directory itself, resolves ZIP64 sizes/offsets from the
// extra field, and inflates only the members we want with inflateSync (dynamic-growth buffer) — so it
// works in every environment.
import { inflateSync } from 'fflate';

export interface ZipMembers { [name: string]: Uint8Array; }

const decoder = new TextDecoder('utf-8');
const SIG_EOCD = 0x06054b50, SIG_ZIP64_LOC = 0x07064b50, SIG_ZIP64_EOCD = 0x06064b50;
const SIG_CENTRAL = 0x02014b50, SIG_LOCAL = 0x04034b50, ZIP64_EXTRA_ID = 0x0001;

/**
 * Extract the members whose (lower-cased) name ends with one of `wantExts` (e.g. ['.json'] or ['.sc']).
 * Throws on a non-zip or when no matching member is found.
 */
export function readZipMembers(bytes: Uint8Array, wantExts: string[]): ZipMembers {
  const exts = wantExts.map((e) => e.toLowerCase());
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = bytes.length;
  const u16 = (o: number) => dv.getUint16(o, true);
  const u32 = (o: number) => dv.getUint32(o, true);
  const u64 = (o: number) => dv.getUint32(o, true) + dv.getUint32(o + 4, true) * 2 ** 32;

  // End Of Central Directory record (scan back over the optional comment).
  let eocd = -1;
  for (let i = n - 22; i >= Math.max(0, n - 22 - 65535); i--) { if (u32(i) === SIG_EOCD) { eocd = i; break; } }
  if (eocd < 0) throw new Error('no end-of-central-directory record (not a zip)');

  let cdCount = u16(eocd + 10);
  let cdOffset = u32(eocd + 16);
  // ZIP64: the EOCD fields are maxed out; the real values live in the ZIP64 EOCD.
  if (cdOffset === 0xffffffff || cdCount === 0xffff) {
    const loc = eocd - 20;
    if (loc >= 0 && u32(loc) === SIG_ZIP64_LOC) {
      const z64 = u64(loc + 8);
      if (z64 >= 0 && z64 + 56 <= n && u32(z64) === SIG_ZIP64_EOCD) { cdCount = u64(z64 + 32); cdOffset = u64(z64 + 48); }
    }
  }

  const members: ZipMembers = {};
  let p = cdOffset;
  for (let e = 0; e < cdCount && p + 46 <= n; e++) {
    if (u32(p) !== SIG_CENTRAL) break;
    const method = u16(p + 10);
    let compSize = u32(p + 20);
    let uncompSize = u32(p + 24);
    const fnLen = u16(p + 28), exLen = u16(p + 30), cmLen = u16(p + 32);
    let localOff = u32(p + 42);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + fnLen));

    // Resolve any sentineled fields from the ZIP64 extra block (same order as the central header:
    // uncompressed size, compressed size, local-header offset).
    let ex = p + 46 + fnLen; const exEnd = ex + exLen;
    while (ex + 4 <= exEnd) {
      const id = u16(ex), dsz = u16(ex + 2); let q = ex + 4;
      if (id === ZIP64_EXTRA_ID) {
        if (uncompSize === 0xffffffff) { uncompSize = u64(q); q += 8; }
        if (compSize === 0xffffffff) { compSize = u64(q); q += 8; }
        if (localOff === 0xffffffff) { localOff = u64(q); q += 8; }
      }
      ex += 4 + dsz;
    }
    p += 46 + fnLen + exLen + cmLen;

    const lower = name.toLowerCase();
    if (!exts.some((x) => lower.endsWith(x))) continue;
    if (u32(localOff) !== SIG_LOCAL) continue;
    const dataStart = localOff + 30 + u16(localOff + 26) + u16(localOff + 28);
    const comp = bytes.subarray(dataStart, dataStart + compSize);
    members[name] = method === 0 ? comp : inflateSync(comp);
  }
  if (!Object.keys(members).length) throw new Error(`no ${exts.join('/')} members found in the archive`);
  return members;
}

export function decodeMember(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}
