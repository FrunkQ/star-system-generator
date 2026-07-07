// Universe Sandbox (.ubox) import — archive + JSON parsing (browser-safe; no node: APIs).
import { inflateSync } from 'fflate';
import { UboxError } from './types';
import type { ParsedUbox, UsManifest, UsSimulation, UsManifestEntry } from './types';

const decoder = new TextDecoder('utf-8');

/** Tolerant JSON parse: US saves contain bare NaN / Infinity tokens (spec §4a), which JSON.parse
 *  rejects. Sanitise those token positions to null first. */
export function tolerantParse<T = unknown>(text: string): T {
  const sanitised = text.replace(/(?<=[:,\[\s])(NaN|-?Infinity)(?=\s*[,}\]])/g, 'null');
  return JSON.parse(sanitised) as T;
}

export function parseVec3(s: string | undefined | null): [number, number, number] {
  if (typeof s !== 'string') throw new Error('vec3: not a string');
  const parts = s.split(';').map((x) => Number(x));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`vec3: expected "x;y;z", got "${s}"`);
  }
  return [parts[0], parts[1], parts[2]];
}

export function parseQuat(s: string | undefined | null): [number, number, number, number] {
  if (typeof s !== 'string') throw new Error('quat: not a string');
  const parts = s.split(';').map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`quat: expected "x;y;z;w", got "${s}"`);
  }
  return [parts[0], parts[1], parts[2], parts[3]];
}

export function cleanHorizonId(id: string | null | undefined): string | null {
  if (typeof id !== 'string') return null;
  const cleaned = id.replace(/;+\s*$/, '').trim();
  return cleaned.length ? cleaned : null;
}

interface Members { [name: string]: Uint8Array; }

// Extract ONLY the JSON members (manifest + simulation) from a .ubox archive. We deliberately do NOT
// use fflate's unzipSync: (1) it eagerly decompresses every member, including the huge `-surface.zip`
// terrain blob and preview images we never read; and, decisively, (2) Universe Sandbox writes ZIP64
// archives, and fflate's BROWSER build reads the ZIP64 size sentinel (0xFFFFFFFF) as a literal 4 GB and
// throws "Array buffer allocation failed". This minimal reader walks the central directory itself,
// resolves ZIP64 sizes/offsets from the extra field, and inflates just the JSON members with
// inflateSync (which grows its output buffer dynamically) — so it works in every environment.
const SIG_EOCD = 0x06054b50, SIG_ZIP64_LOC = 0x07064b50, SIG_ZIP64_EOCD = 0x06064b50;
const SIG_CENTRAL = 0x02014b50, SIG_LOCAL = 0x04034b50, ZIP64_EXTRA_ID = 0x0001;

function inflate(bytes: Uint8Array): Members {
  try {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const n = bytes.length;
    const u16 = (o: number) => dv.getUint16(o, true);
    const u32 = (o: number) => dv.getUint32(o, true);
    const u64 = (o: number) => dv.getUint32(o, true) + dv.getUint32(o + 4, true) * 2 ** 32;

    // Locate the End Of Central Directory record (scan back over the optional comment).
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

    const members: Members = {};
    let p = cdOffset;
    for (let e = 0; e < cdCount && p + 46 <= n; e++) {
      if (u32(p) !== SIG_CENTRAL) break;
      const method = u16(p + 10);
      let compSize = u32(p + 20);
      let uncompSize = u32(p + 24);
      const fnLen = u16(p + 28), exLen = u16(p + 30), cmLen = u16(p + 32);
      let localOff = u32(p + 42);
      const name = decoder.decode(bytes.subarray(p + 46, p + 46 + fnLen));

      // Resolve any sentineled fields from the ZIP64 extra block (present in the SAME order they appear
      // in the central header: uncompressed size, compressed size, local-header offset).
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

      if (!name.toLowerCase().endsWith('.json')) continue;
      if (u32(localOff) !== SIG_LOCAL) continue;
      const dataStart = localOff + 30 + u16(localOff + 26) + u16(localOff + 28);
      const comp = bytes.subarray(dataStart, dataStart + compSize);
      members[name] = method === 0 ? comp : inflateSync(comp);
    }
    if (!Object.keys(members).length) throw new Error('no JSON members found in the archive');
    return members;
  } catch (err) {
    throw new UboxError('not-a-zip', `Could not read that Universe Sandbox file: it is not a valid archive (${(err as Error).message}).`);
  }
}

function memberText(members: Members, path: string): string | null {
  const bytes = members[path];
  return bytes ? decoder.decode(bytes) : null;
}

/** Enumerate the simulations an archive contains, without fully converting. */
export function listSimulations(bytes: Uint8Array): {
  manifest: UsManifest | null;
  members: Members;
  simulations: { name: string; path: string; entityCount?: number }[];
  buildRevision: number;
  buildName: string;
} {
  const members = inflate(bytes);

  const manifestText = memberText(members, 'manifest.json');
  let manifest: UsManifest | null = null;
  if (manifestText) {
    try { manifest = tolerantParse<UsManifest>(manifestText); } catch { manifest = null; }
  }

  const buildRevision = manifest?.Header?.BuildRevision ?? 0;
  const buildName = manifest?.Header?.BuildName ?? '';

  let simulations: { name: string; path: string; entityCount?: number }[] = [];

  if (manifest?.Entries?.length) {
    // Manifest-driven resolution (the new format). Simulations carry BaseType 'Simulation'.
    const simEntries = manifest.Entries.filter((e) => e.BaseType === 'Simulation' && e.Path);
    simulations = simEntries.map((e: UsManifestEntry) => ({
      name: e.Name ?? e.Path!.replace(/^simulation-/, '').replace(/\.json$/, ''),
      path: e.Path!
    }));
  }

  if (!simulations.length) {
    // Legacy / no-manifest fallback: any JSON member with an Entities array is a candidate.
    for (const name of Object.keys(members)) {
      if (!name.toLowerCase().endsWith('.json')) continue;
      const text = memberText(members, name);
      if (!text || !/"Entities"\s*:/.test(text)) continue;
      simulations.push({ name: name.replace(/\.json$/, ''), path: name });
    }
  }

  if (!simulations.length) {
    throw new UboxError('no-simulation', 'Could not read that Universe Sandbox file: no simulation data found inside the archive.');
  }

  return { manifest, members, simulations, buildRevision, buildName };
}

/** Resolve and parse ONE simulation from an archive. */
export function parseUbox(bytes: Uint8Array, selection?: number | string): ParsedUbox {
  const { manifest, members, simulations, buildRevision, buildName } = listSimulations(bytes);

  // Choose the simulation: explicit selection (index or name), else the manifest EntryPoint, else the first.
  let chosen = simulations[0];
  if (typeof selection === 'number') {
    if (selection < 0 || selection >= simulations.length) {
      throw new UboxError('no-simulation', `Simulation index ${selection} is out of range (archive has ${simulations.length}).`);
    }
    chosen = simulations[selection];
  } else if (typeof selection === 'string') {
    const match = simulations.find((s) => s.name === selection);
    if (!match) throw new UboxError('no-simulation', `No simulation named "${selection}" in the archive.`);
    chosen = match;
  } else if (manifest?.Header?.EntryPoint && manifest.Entries) {
    const entry = manifest.Entries.find((e) => e.ID === manifest.Header!.EntryPoint && e.BaseType === 'Simulation');
    if (entry?.Path) {
      const byPath = simulations.find((s) => s.path === entry.Path);
      if (byPath) chosen = byPath;
    }
  }

  const simText = memberText(members, chosen.path);
  if (!simText) throw new UboxError('no-simulation', `Simulation member "${chosen.path}" is missing from the archive.`);

  let sim: UsSimulation;
  try {
    sim = tolerantParse<UsSimulation>(simText);
  } catch (err) {
    throw new UboxError('unrecognised-format', `The simulation data could not be parsed (${(err as Error).message}).`);
  }

  if (!Array.isArray(sim.Entities)) {
    throw new UboxError('unrecognised-format', 'The simulation data has no Entities array — unrecognised format.');
  }

  return { manifest, sim, simText, buildRevision, buildName };
}
