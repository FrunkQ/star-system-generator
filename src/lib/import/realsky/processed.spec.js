// Real-sky import — end-to-end physics check: converter output must survive
// the app's real load path (fixUpImportedSystem + SystemProcessor.process)
// and produce sane derived values. Exists because structure-only tests missed
// exactly this class of fault elsewhere (G11: bodies that parse fine but
// deform absurdly once the physics reads a field nobody set). In particular:
// a fresh import must never produce a toroidal body — the G11 fault, where a
// field nobody set was read as an unknown rather than as zero.
//
// THE PREMISE CHANGED AT B43 AND THE PIN WAS REWRITTEN RATHER THAN DELETED.
// It used to read "imported bodies carry NO rotation_period_hours", and the
// no-toroid property followed from that absence. Imported STARS now carry a
// DERIVED period (gyrochronology below the Kraft break, a seeded draw above
// it), so the premise is gone but the property it protected is not — and it is
// asserted directly now, on stars as well as planets, which is stronger than
// asserting the absence it used to rest on.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { fixUpImportedSystem } from '$lib/system/importFixup';
import { SOL_CENTRE } from './query.mjs';
import { convertArchiveRows } from './convert.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..', '..');
const cache = JSON.parse(readFileSync(join(repo, 'scripts', 'starmap-build', 'data', 'cache', 'archive-pscomppars.json'), 'utf-8'));

function deepMerge(target, source) {
  const output = { ...target };
  for (const key of Object.keys(source ?? {})) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && key in target) {
      output[key] = deepMerge(target[key], source[key]);
    } else output[key] = source[key];
  }
  return output;
}
function loadRulePack() {
  const base = join(repo, 'static', 'rulepacks', 'starter-sf');
  let pack = JSON.parse(readFileSync(join(base, 'main.json'), 'utf-8'));
  for (const f of ['construct_templates.json', 'engine-definitions.json', 'fuel-definitions.json', 'liquids.json', 'classification.json', 'atmospheres.json']) {
    const p = join(base, f);
    if (existsSync(p)) pack = deepMerge(pack, JSON.parse(readFileSync(p, 'utf-8')));
  }
  return pack;
}

describe('imported systems survive the real load path', () => {
  const rulePack = loadRulePack();
  const { systems } = convertArchiveRows(cache, { region: { centre: SOL_CENTRE, radiusLy: 30 }, generated: 'test' });

  it('converted a meaningful sample', () => {
    expect(systems.length).toBeGreaterThan(10);
  });

  it('every system processes without crashing and derives sane physics', () => {
    for (const entry of systems) {
      const processed = systemProcessor.process(fixUpImportedSystem(structuredClone(entry.system), rulePack), rulePack);
      for (const node of processed.nodes) {
        if (node.kind !== 'body') continue;
        expect(Number.isFinite(node.massKg), `${entry.id}/${node.id} massKg`).toBe(true);
        if (node.roleHint === 'star') {
          expect(node.temperatureK, `${entry.id}/${node.id} star temp`).toBeGreaterThan(0);
          expect((node.classes ?? []).length, `${entry.id}/${node.id} star classes`).toBeGreaterThan(0);
          // B43: a star reaches the shape code now, so it gets the same no-toroid guarantee the
          // planets have always had. (That stars ACQUIRE a spin is asserted in stardefaults.spec.ts,
          // which is the spec that runs `completeImportedStars`; this one exercises the LOAD path.)
          expect(node.oblateness ?? 0, `${entry.id}/${node.id} star oblateness=${node.oblateness}`).toBeLessThan(0.8);
          const starShape = (node.tags ?? []).find((t) => t.key?.startsWith('shape/'));
          if (starShape) {
            expect(['shape/spherical', 'shape/oblate', 'shape/ellipsoid'],
              `${entry.id}/${node.id} shape=${starShape.key}`).toContain(starShape.key);
          }
        }
        if (node.roleHint === 'planet') {
          expect((node.classes ?? []).length, `${entry.id}/${node.id} classes`).toBeGreaterThan(0);
          expect(Number.isFinite(node.temperatureK), `${entry.id}/${node.id} temperatureK`).toBe(true);
          expect(Number.isFinite(node.orbital_period_days), `${entry.id}/${node.id} period`).toBe(true);
          // The G11 shape check: an imported body with no authored rotation
          // must never read as near-breakup spin (absence is zero, not
          // infinity). Locked close-in planets get a real period from B7's
          // spin-lock reconciliation; everything else stays spherical.
          expect(node.oblateness ?? 0, `${entry.id}/${node.id} oblateness=${node.oblateness}`).toBeLessThan(0.3);
          const shapeTag = (node.tags ?? []).find((t) => t.key === 'shape/rotational');
          if (shapeTag) expect(['spherical', 'oblate'], `${entry.id}/${node.id} shape=${shapeTag.value}`).toContain(shapeTag.value);
        }
      }
    }
  });
});
