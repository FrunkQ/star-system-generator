import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { classifyByFingerprint } from './classification';
import type { Fingerprint } from '$lib/types';

// One-off AUDIT (not an assertion gate): build a prototypical body at the centre of each
// type's bands and classify it. A type whose own prototype classifies as something else is
// "shadowed" — a catch-all is stealing it. Run: npx vitest run classification.audit
function loadFingerprints(): Fingerprint[] {
  const p = path.resolve('static/rulepacks/starter-sf/classification.json');
  return JSON.parse(fs.readFileSync(p, 'utf-8')).classifier.fingerprints as Fingerprint[];
}

function prototype(fp: Fingerprint): Record<string, number | string> {
  const f: Record<string, number | string> = { orbitsStar: 1, parentId: 'star-x' };
  for (const [feat, band] of Object.entries(fp.match)) {
    if (typeof band === 'string') f[feat] = band;
    else if (Array.isArray(band) && typeof band[0] === 'string') f[feat] = band[0] as string;
    else { const [lo, hi] = band as [number, number]; f[feat] = (lo + hi) / 2; }
  }
  return f;
}

describe('fingerprint overlap audit', () => {
  it('reports shadowed base types', () => {
    const fps = loadFingerprints();
    const bases = fps.filter((f) => f.kind === 'base');
    const shadowed: string[] = [];
    for (const fp of bases) {
      const proto = prototype(fp);
      const got = classifyByFingerprint(proto, fps, 4);
      const gotBase = got.find((c) => bases.some((b) => b.class === c)) ?? got[0];
      if (gotBase !== fp.class) shadowed.push(`${fp.class.replace('planet/', '').padEnd(28)} -> ${gotBase?.replace('planet/', '')}`);
    }
    if (shadowed.length) console.log(`\n=== SHADOWED (${shadowed.length}/${bases.length}) ===\n` + shadowed.join('\n') + '\n');
    // Every SPECIFIC type must be reachable by its own prototype. The only acceptable
    // "shadow" is the generic gas-giant fallback (its band centre is legitimately a
    // super-jupiter; real Jupiter/Saturn sit below that range and stay gas-giant).
    const unexpected = shadowed.filter((s) => !s.startsWith('gas-giant'));
    expect(unexpected).toEqual([]);
  });
});
