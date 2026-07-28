import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describeTag } from './tagPresentation';

// A user reported the Newton panel explaining the "Episodic" tag with the generic line for the whole
// geology namespace — "the body's tectonic and volcanic regime" — which tells you nothing you could
// not read off the chip. The cause was structural rather than a typo: describeTag falls back to a
// per-NAMESPACE description whenever a key has no write-up of its own, so a missing entry degrades
// quietly into something that looks written rather than something obviously absent.
//
// This walks the source for every tag key the code actually emits and insists each one says
// something about ITSELF. It is the honest version of the fallback: the fallback stays, for tags
// that arrive from rule packs at runtime, but nothing we ship should be relying on it.

const NAMESPACES = [
  'geology', 'tidal', 'structure', 'climate', 'weather', 'surface', 'hazard', 'magnetic',
  'shape', 'stability', 'fate', 'origin', 'aurora', 'biodiversity', 'thermal', 'stellar'
];

function emittedTagKeys(): string[] {
  const found = new Set<string>();
  const re = new RegExp(`'((?:${NAMESPACES.join('|')})\\/[a-z0-9-]+)'`, 'g');
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(ts|svelte)$/.test(entry) || /\.spec\.ts$|\.test\.ts$/.test(entry)) continue;
      if (p.includes('tagPresentation')) continue;          // the dictionary itself
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(re)) found.add(m[1]);
    }
  };
  walk('src/lib');
  return [...found].sort();
}

describe('tag presentation', () => {
  it('every tag the code emits explains ITSELF, not just its namespace', () => {
    const generic = new Map<string, string>();
    for (const ns of NAMESPACES) generic.set(ns, describeTag(`${ns}/__nonexistent__`).description);

    const unexplained = emittedTagKeys().filter((key) => {
      const { description } = describeTag(key);
      return !description || description === generic.get(key.split('/')[0]);
    });
    expect(unexplained, `these tags fall back to their namespace blurb: ${unexplained.join(', ')}`)
      .toEqual([]);
  });

  it('the geological regimes are distinct from one another', () => {
    // The specific report: "Episodic" and "Plutonic" had no write-up at all, and "Stagnant lid" was
    // carrying the description of what the model now calls episodic — Venus and its catastrophic
    // overturn — which made two different regimes read as the same thing.
    const regimes = ['plate-tectonics', 'stagnant-lid', 'episodic', 'plutonic', 'volcanic-tidal',
      'cryovolcanic', 'inactive'].map((r) => describeTag(`geology/${r}`));
    for (const r of regimes) expect(r.description.length).toBeGreaterThan(40);
    expect(new Set(regimes.map((r) => r.description)).size).toBe(regimes.length);
    // Venus belongs to episodic, and stagnant-lid must no longer claim it.
    expect(describeTag('geology/episodic').description).toContain('Venus');
    expect(describeTag('geology/stagnant-lid').description).not.toContain('Venus');
  });

  it('groups a tag by its namespace rather than dropping it into "Other"', () => {
    // weather/* and surface/* were unregistered, so every one of them rendered grey and ungrouped.
    for (const key of ['weather/lightning', 'surface/oxidised', 'geology/episodic']) {
      expect(describeTag(key).group).not.toBe('Other');
    }
  });
});
