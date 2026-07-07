// Universe Sandbox (.ubox) import — the audit (spec §9). Compares SSG's DERIVED results against the
// reference snapshot of US values we deliberately did not import.
import type { System, CelestialBody } from '$lib/types';
import type { UboxImportResult, ImportReview, ReviewRow, SkipReason } from './types';

const TEMP_EXPLAIN = 'SSG derives surface temperature from first principles (albedo from makeup + cloud decks, its own greenhouse model, and the assumed system age); a gap from the US figure is expected, not data loss.';
const MAG_EXPLAIN = 'SSG derives the magnetosphere from rotation + interior dynamo rather than storing it.';

function densityKgM3(node: CelestialBody): number | null {
  if (!node.massKg || !node.radiusKm) return null;
  const rM = node.radiusKm * 1000;
  return node.massKg / ((4 / 3) * Math.PI * rM * rM * rM);
}

export function buildImportReview(processed: System, result: UboxImportResult): ImportReview {
  const byId = new Map(processed.nodes.map((n) => [n.id, n as CelestialBody]));
  const comparisons: ReviewRow[] = [];

  for (const [id, snap] of Object.entries(result.snapshot)) {
    const node = byId.get(id);
    if (!node) continue;

    // Surface temperature (planets/moons — stars keep their authored temperature)
    if (snap.roleHint !== 'star' && typeof snap.surfaceTemperatureK === 'number' && typeof node.temperatureK === 'number') {
      const us = snap.surfaceTemperatureK, ssg = node.temperatureK;
      const tol = Math.max(30, 0.1 * us);
      const aligned = Math.abs(us - ssg) <= tol;
      comparisons.push({
        body: snap.name, metric: 'surface temperature',
        us: `${us.toFixed(0)} K`, ssg: `${ssg.toFixed(0)} K`,
        bucket: aligned ? 'aligned' : 'explained',
        ...(aligned ? {} : { note: TEMP_EXPLAIN })
      });
    }

    // Magnetic field (US stores gauss; SSG derives)
    if (typeof snap.magneticFieldGauss === 'number' && snap.magneticFieldGauss > 0) {
      const ssgField = node.magneticField?.strengthGauss ?? 0;
      const ratio = ssgField > 0 ? snap.magneticFieldGauss / ssgField : Infinity;
      const aligned = ssgField > 0 && ratio >= 0.1 && ratio <= 10;
      comparisons.push({
        body: snap.name, metric: 'magnetic field',
        us: `${snap.magneticFieldGauss.toFixed(3)} G`, ssg: `${ssgField.toFixed(3)} G`,
        bucket: aligned ? 'aligned' : 'explained', ...(aligned ? {} : { note: MAG_EXPLAIN })
      });
    }

    // Density — pure mass/radius; a mismatch means the import lost mass or radius (a bug).
    if (typeof snap.densityKgM3 === 'number' && snap.densityKgM3 > 0) {
      const ssgD = densityKgM3(node);
      if (ssgD !== null) {
        const aligned = Math.abs(ssgD - snap.densityKgM3) / snap.densityKgM3 <= 0.01;
        comparisons.push({
          body: snap.name, metric: 'density',
          us: `${snap.densityKgM3.toFixed(0)} kg/m³`, ssg: `${ssgD.toFixed(0)} kg/m³`,
          bucket: aligned ? 'aligned' : 'unexplained',
          ...(aligned ? {} : { note: 'Density is mass/radius only — a mismatch indicates the import dropped mass or radius.' })
        });
      }
    }
  }

  // Skipped, grouped by reason
  const grouped = new Map<SkipReason, { count: number; examples: string[] }>();
  for (const s of result.skipped) {
    const g = grouped.get(s.reason) ?? { count: 0, examples: [] };
    g.count++;
    if (g.examples.length < 3) g.examples.push(s.name);
    grouped.set(s.reason, g);
  }
  const skipped = [...grouped.entries()].map(([reason, g]) => ({ reason, count: g.count, examples: g.examples }));

  return { counts: result.counts, assumptions: result.assumptions, skipped, comparisons };
}
