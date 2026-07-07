// Universe Sandbox (.ubox) import — archive + JSON parsing (browser-safe; no node: APIs).
import { readZipMembers, type ZipMembers } from '../shared/zip';
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

type Members = ZipMembers;

function inflate(bytes: Uint8Array): Members {
  try {
    return readZipMembers(bytes, ['.json']);
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
