import { describe, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import type { System, RulePack, CelestialBody, Fingerprint } from '../types';

// Dev harness (logs, doesn't gate): processes static/examples/Testion-System.json and reports
// which planet TYPE each body classified as vs its __target, plus overall taxonomy coverage.
// Each Testion body carries a `__target` = the planet/* class it is built to become.
// Run: npx vitest run testion.harness
function loadRulePack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let pack = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8')) as RulePack;
  for (const f of ['classification.json', 'atmospheres.json']) {
    const p = path.join(base, f);
    if (fs.existsSync(p)) pack = { ...pack, ...JSON.parse(fs.readFileSync(p, 'utf-8')) };
  }
  return pack;
}

describe('Testion taxonomy coverage', () => {
  it('reports per-body classification + coverage', () => {
    const file = path.resolve('static/examples/Testion-System.json');
    if (!fs.existsSync(file)) { console.log('Testion not built yet'); return; }
    const pack = loadRulePack();
    const fps = (pack.classifier?.fingerprints ?? []) as Fingerprint[];
    const baseTypes = new Set(fps.filter((f) => f.kind === 'base').map((f) => f.class));

    const sys = JSON.parse(fs.readFileSync(file, 'utf-8')) as System;
    const targets = new Map<string, string>();
    for (const n of sys.nodes) if ((n as any).__target) targets.set(n.id, (n as any).__target);
    // The harness must exercise the LIVE classifier — saved classes are authored (locked) by
    // default, so opt every body into auto-classification before processing.
    for (const n of sys.nodes) if (n.kind === 'body') (n as CelestialBody).autoClassify = true;

    const processed = systemProcessor.process(sys, pack);
    const hit = new Set<string>();
    const lines: string[] = [];
    let ok = 0, total = 0;
    for (const n of processed.nodes) {
      if (n.kind !== 'body') continue;
      const b = n as CelestialBody;
      if (b.roleHint !== 'planet' && b.roleHint !== 'moon') continue;
      const target = targets.get(b.id);
      if (!target) continue;
      total++;
      const classes = b.classes ?? [];
      const base = classes.find((c) => baseTypes.has(c)) ?? classes[0];
      const good = base === target;
      if (good) { ok++; hit.add(target); }
      const me = (b.massKg ?? 0) / 5.972e24, re = (b.radiusKm ?? 0) / 6371;
      lines.push(`${good ? 'ok ' : 'XX '}${target.replace('planet/', '').padEnd(26)} got ${(base ?? '-').replace('planet/', '').padEnd(26)} | m${me.toFixed(2)} r${re.toFixed(2)} Teq${(b.equilibriumTempK ?? 0).toFixed(0)} a${(b.orbit?.elements.a_AU ?? 0)}`);
    }
    const missing = [...baseTypes].filter((t) => !hit.has(t)).map((t) => t.replace('planet/', ''));
    console.log(`\n=== TESTION ${ok}/${total} bodies on target | ${hit.size}/${baseTypes.size} base types covered ===`);
    console.log(lines.join('\n'));
    console.log(`\nMISSING (${missing.length}): ${missing.join(', ')}\n`);
  });
});
