// Curated, human-readable summaries fed to the LLM instead of the raw body JSON. The old prompt
// dumped 40+ physics fields (albedo breakdowns, conductive layers, exact Kelvin, makeup ratios),
// which buried the interesting hooks and steered the model toward dry data recitals. Here we keep
// only constraint-grade physics (what limits a story) plus the genuinely evocative attributes and
// the body's narrative-ish tags — so the seed text + selected tags can drive imaginative writing.
import type { CelestialBody } from '../types';
import { G, AU_KM } from '../constants';

const EARTH_G = 9.80665;
const EARTH_MASS_KG = 5.972e24;

// Tag categories that are pure bookkeeping / derived physics — uninteresting as story hooks.
const BORING_TAG_PREFIXES = new Set(['stability', 'makeup', 'class', 'size', 'mass', 'radius']);

function tagHints(tags?: { key: string }[]): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  for (const t of tags) {
    if (!t?.key) continue;
    const [cat, ...rest] = t.key.split('/');
    if (BORING_TAG_PREFIXES.has(cat)) continue;
    const label = (rest.join(' ') || cat).replace(/[-_]/g, ' ').trim();
    if (label) out.push(label);
  }
  return Array.from(new Set(out));
}

export function summarizeBodyForLLM(body: CelestialBody): Record<string, any> {
  const out: Record<string, any> = { name: body.name };
  if (body.roleHint) out.type = body.roleHint;
  if (body.class) out.class = body.class;

  const a = body.orbit?.elements?.a_AU;
  if (typeof a === 'number' && a > 0) out.orbitDistance = a < 0.05 ? `${Math.round(a * AU_KM)} km` : `${a.toFixed(2)} AU`;
  const e = body.orbit?.elements?.e;
  if (typeof e === 'number' && e >= 0.2) out.eccentricOrbit = `high (e=${e.toFixed(2)}) — strong seasonal extremes`;
  if (body.orbital_period_days) out.yearLength = `${Math.round(body.orbital_period_days)} days`;
  if (body.rotation_period_hours) out.dayLength = `${body.rotation_period_hours.toFixed(1)} h`;
  if (body.tidallyLocked) out.tidallyLocked = true;

  if (body.massKg) out.mass = `${(body.massKg / EARTH_MASS_KG).toFixed(2)} Earth masses`;
  if (body.massKg && body.radiusKm) {
    const g = G * body.massKg / Math.pow(body.radiusKm * 1000, 2) / EARTH_G;
    out.gravity = `${g.toFixed(2)} g`;
  }
  if (body.temperatureK !== undefined) out.surfaceTemp = `${Math.round(body.temperatureK - 273.15)} °C`;

  if (body.atmosphere) {
    const p = body.atmosphere.pressure_bar ?? body.atmosphere.pressure_atm ?? 0;
    out.atmosphere = `${body.atmosphere.name || 'present'} (${p < 0.001 ? '<0.001' : p.toFixed(2)} bar)`;
    const o2 = body.atmosphere.composition?.O2 ?? 0;
    out.breathable = p >= 0.5 && p <= 4 && o2 >= 0.15 ? 'yes' : 'no';
  } else {
    out.atmosphere = 'none';
  }
  if (body.hydrosphere?.coverage) {
    out.surfaceLiquid = `${Math.round(body.hydrosphere.coverage * 100)}%${body.hydrosphere.composition ? ` ${body.hydrosphere.composition}` : ''}`;
  }
  if (body.biosphere) out.nativeLife = `present (coverage ${Math.round((body.biosphere.coverage || 0) * 100)}%)`;
  if (typeof body.habitabilityScore === 'number') out.habitability = `${Math.round(body.habitabilityScore)}%`;
  if (body.magneticField?.strengthGauss) out.magnetosphere = 'shielded from stellar radiation';

  const rad = (body as any).surfaceRadiation;
  if (typeof rad === 'number') out.radiation = rad < 5 ? 'low' : rad < 100 ? 'moderate' : 'high — hazardous';

  const hints = tagHints(body.tags);
  if (hints.length) out.featureHints = hints;
  return out;
}

export function summarizeStarForLLM(star?: CelestialBody | null): Record<string, any> | null {
  if (!star) return null;
  const out: Record<string, any> = { name: star.name, type: 'star' };
  if (star.class) out.class = star.class;
  if (star.temperatureK) {
    out.colour = star.temperatureK > 10000 ? 'blue' : star.temperatureK > 7500 ? 'blue-white'
      : star.temperatureK > 6000 ? 'white' : star.temperatureK > 5000 ? 'yellow'
      : star.temperatureK > 3700 ? 'orange' : 'red';
  }
  const hints = tagHints(star.tags);
  if (hints.length) out.featureHints = hints;
  return out;
}
