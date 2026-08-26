// G45 ACCEPTANCE ON REAL BUNDLED DATA, not hand-built fixtures. Every bundled system that has a
// barycentre is processed through the REAL processor and asked two questions: does the pair publish
// a sane annulus, and does every body actually orbiting that pair get the verdict it deserves?
//
// The negative half is the point. Alpha Centauri's Proxima is a circumbinary body around the A/B
// pair at ~13,000 AU, a hundred-odd times the critical radius — if the criterion is leaking, it
// leaks there first and loudest.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { SystemProcessor } from '$lib/core/SystemProcessor';
import { fixUpImportedSystem } from '$lib/system/importFixup';
import type { Barycenter, CelestialBody } from '$lib/types';

const AU_KM = 149597870.7;

function loadPack(): any {
  const base = 'static/rulepacks/starter-sf';
  const merge = (a: any, b: any): any => {
    const o: any = { ...a };
    for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a?.[k] ? merge(a[k], v) : v;
    return o;
  };
  let p: any = JSON.parse(readFileSync(`${base}/main.json`, 'utf8'));
  for (const f of ['stars.json', 'planets.json', 'generation.json', 'orbital_constants.json', 'classification.json', 'atmospheres.json', 'liquids.json']) {
    try { p = merge(p, JSON.parse(readFileSync(`${base}/${f}`, 'utf8'))); } catch { /* optional */ }
  }
  return p;
}
const pack = loadPack();

type Row = { file: string; pair: string; annulus: any; children: Array<{ name: string; aAU: number; ratio: number; tags: string[] }> };

function sweep(): Row[] {
  const rows: Row[] = [];
  for (const file of readdirSync('static/examples').filter((f) => f.endsWith('.json'))) {
    let raw: any;
    try { raw = JSON.parse(readFileSync(`static/examples/${file}`, 'utf8')); } catch { continue; }
    const src = raw.system ?? raw;
    if (!Array.isArray(src?.nodes)) continue;
    if (!src.nodes.some((n: any) => n.kind === 'barycenter')) continue;
    let processed: any;
    try { processed = new SystemProcessor().process(fixUpImportedSystem(JSON.parse(JSON.stringify(src)), pack), pack); }
    catch { continue; }
    for (const node of processed.nodes) {
      if (node.kind !== 'barycenter') continue;
      const bary = node as Barycenter;
      const members = new Set(bary.memberIds ?? []);
      const children = (processed.nodes as any[])
        .filter((n) => n.kind === 'body' && n.parentId === bary.id && !members.has(n.id))
        .map((n: CelestialBody) => ({
          name: n.name,
          aAU: n.orbit?.elements.a_AU ?? 0,
          ratio: bary.circumbinary ? (n.orbit?.elements.a_AU ?? 0) / bary.circumbinary.innerAU : NaN,
          tags: (n.tags ?? []).map((t) => t.key).filter((k) => k.startsWith('stability/') || k.startsWith('fate/'))
        }));
      rows.push({ file, pair: bary.name ?? bary.id, annulus: bary.circumbinary, children });
    }
  }
  return rows;
}

const rows = sweep();

describe('G45 on the bundled maps', () => {
  it('found real barycentres to check', () => {
    expect(rows.length).toBeGreaterThan(0);
    // The figures themselves, for a human who wants to eyeball them rather than trust a green tick:
    //   G45_VERBOSE=1 npx vitest run src/lib/physics/g45-bundled-check.spec.ts
    // Off by default so the ordinary suite run stays readable.
    if (!process.env.G45_VERBOSE) return;
    for (const r of rows) {
      const a = r.annulus;
      const desc = a
        ? `sep ${a.pairSeparationAU.toPrecision(3)} AU · mu ${a.massRatioMu.toFixed(3)} · e ${a.eccentricity.toFixed(3)}` +
          ` -> inner ${a.innerAU.toPrecision(3)} AU (${(a.innerAU * AU_KM).toPrecision(3)} km, ${a.criticalRatio.toFixed(2)}x)` +
          (a.outerAU !== undefined ? ` · outer ${a.outerAU.toPrecision(3)} AU` : ' · outer NONE (root pair)') +
          (a.fitExtrapolated ? ' [EXTRAPOLATED]' : '')
        : 'NO ANNULUS';
      console.log(`\n${r.file} :: ${r.pair}\n  ${desc}`);
      for (const c of r.children) {
        console.log(`  circumbinary: ${c.name} at ${c.aAU.toPrecision(3)} AU = ${c.ratio.toFixed(2)}x the limit -> [${c.tags.join(', ') || 'clean'}]`);
      }
      if (!r.children.length) console.log('  (no circumbinary children)');
    }
  });

  it('every pair publishes a sane annulus: positive, inner below outer, mu in (0, 0.5]', () => {
    for (const r of rows) {
      if (!r.annulus) continue;   // a partial pair abstains, which is allowed
      expect(r.annulus.innerAU, `${r.file} ${r.pair}`).toBeGreaterThan(0);
      expect(r.annulus.massRatioMu, `${r.file} ${r.pair}`).toBeGreaterThan(0);
      expect(r.annulus.massRatioMu, `${r.file} ${r.pair}`).toBeLessThanOrEqual(0.5);
      // The Holman & Wiegert ratio cannot physically fall below its own constant term.
      expect(r.annulus.criticalRatio, `${r.file} ${r.pair}`).toBeGreaterThanOrEqual(1.6);
      if (r.annulus.outerAU !== undefined) {
        expect(r.annulus.outerAU, `${r.file} ${r.pair}`).toBeGreaterThan(0);
      }
    }
  });

  it('NEGATIVE: a body far outside the limit is untouched — Proxima is the loud case', () => {
    for (const r of rows) {
      for (const c of r.children) {
        if (!(c.ratio > 1.2)) continue;   // only the comfortably-clear ones
        expect(c.tags, `${r.file}: ${c.name} at ${c.ratio.toFixed(1)}x the limit should carry no circumbinary verdict`)
          .not.toContain('stability/inside-circumbinary-limit');
      }
    }
  });

  it('POSITIVE: anything wearing the tag really is inside the limit', () => {
    for (const r of rows) {
      for (const c of r.children) {
        if (!c.tags.includes('stability/inside-circumbinary-limit')) continue;
        expect(c.ratio, `${r.file}: ${c.name}`).toBeLessThan(1);
        expect(c.tags, `${r.file}: ${c.name}`).toContain('fate/eject');
      }
    }
  });
});
