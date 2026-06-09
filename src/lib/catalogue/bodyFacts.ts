// Player-safe "facts" for a body, shared by the catalogue's diagrammatic browser and the
// interactive console inspector. The snapshot is already redacted, so we just format for reading.
import type { CelestialBody } from '$lib/types';
import { G, AU_KM } from '$lib/constants';

const EARTH_G = 9.80665;
const EARTH_MASS_KG = 5.972e24;

export function fmtNum(n: number | undefined | null, d = 0): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '';
  if (Math.abs(n) > 1e15) return n.toExponential(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
}

export function orbitDist(b: CelestialBody): string {
  const a = b.orbit?.elements?.a_AU;
  if (typeof a !== 'number' || a <= 0) return '';
  return a < 0.05 ? `${fmtNum(a * AU_KM)} km` : `${a.toFixed(3)} AU`;
}
export function gravityG(b: CelestialBody): string {
  if (!b.massKg || !b.radiusKm) return '';
  const rm = b.radiusKm * 1000;
  return `${(G * b.massKg / (rm * rm) / EARTH_G).toFixed(2)} g`;
}
export function massRel(b: CelestialBody): string {
  if (!b.massKg) return '';
  const m = b.massKg / EARTH_MASS_KG;
  return `${m < 1000 ? m.toFixed(2) : m.toExponential(2)} M⊕`;
}
export function tempC(b: CelestialBody): string {
  return b.temperatureK === undefined ? '' : `${Math.round(b.temperatureK - 273.15)} °C`;
}
export function atmosphere(b: CelestialBody): string {
  if (!b.atmosphere) return 'None';
  const p = b.atmosphere.pressure_bar ?? b.atmosphere.pressure_atm ?? 0;
  return `${b.atmosphere.name || 'Unknown'} (${p < 0.001 ? '<0.001' : p.toFixed(2)} bar)`;
}

export interface Fact { label: string; value: string; }

export function bodyFacts(b: CelestialBody): Fact[] {
  const out: Fact[] = [];
  const add = (label: string, value: string) => { if (value) out.push({ label, value }); };
  add('Type', [b.roleHint, b.class].filter(Boolean).join(' · '));
  add('Orbit', orbitDist(b));
  add('Year', b.orbital_period_days ? `${Math.round(b.orbital_period_days)} d` : '');
  add('Day', b.rotation_period_hours ? `${b.rotation_period_hours.toFixed(1)} h` : '');
  add('Mass', massRel(b));
  add('Gravity', gravityG(b));
  add('Radius', b.radiusKm ? `${fmtNum(b.radiusKm)} km` : '');
  add('Temperature', tempC(b));
  add('Atmosphere', atmosphere(b));
  if (b.hydrosphere?.coverage) add('Surface liquid', `${Math.round(b.hydrosphere.coverage * 100)}%${b.hydrosphere.composition ? ` ${b.hydrosphere.composition}` : ''}`);
  if (typeof b.habitabilityScore === 'number') add('Habitability', `${Math.round(b.habitabilityScore)}%`);
  if (b.biosphere) add('Native life', `present (${Math.round((b.biosphere.coverage || 0) * 100)}%)`);
  if ((b as any).magneticField?.strengthGauss) add('Magnetosphere', 'present');
  return out;
}

export function bodyGlyph(b: CelestialBody): string {
  if (b.kind === 'construct') return '◆';
  if (b.roleHint === 'star') return '★';
  if (b.roleHint === 'ring') return '◌';
  if (b.roleHint === 'belt') return '⋯';
  if (b.roleHint === 'moon') return '○';
  return '●';
}
