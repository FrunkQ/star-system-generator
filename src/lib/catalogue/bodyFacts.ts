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

const EARTH_DENSITY = 5514;
const titleCase = (s: string) => s.replace(/[-_/]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();

// Full report-parity facts for a body, enriched with the Phase-04 derived data (temperature range,
// radiation, geology, magnetism, fluids, ascent Δv). Both guide tiers (diagrammatic browser +
// hi-tech console inspector) render this, so they match the printed report's depth.
export function bodyFacts(b: CelestialBody): Fact[] {
  const out: Fact[] = [];
  const any = b as any;
  const add = (label: string, value: string) => { if (value) out.push({ label, value }); };
  const K2C = (k?: number) => (typeof k === 'number' ? Math.round(k - 273.15) : null);

  add('Type', [b.roleHint, b.class].filter(Boolean).join(' · '));

  // --- Orbit & rotation ---
  add('Orbit distance', orbitDist(b));
  const e = b.orbit?.elements?.e;
  if (typeof e === 'number' && e >= 0.05) add('Eccentricity', e.toFixed(3));
  add('Orbital period', b.orbital_period_days ? `${b.orbital_period_days < 2 ? b.orbital_period_days.toFixed(2) : Math.round(b.orbital_period_days).toLocaleString()} days` : '');
  add('Day length', b.rotation_period_hours ? `${b.rotation_period_hours.toFixed(1)} h` : '');
  if (typeof any.axial_tilt_deg === 'number') add('Axial tilt', `${any.axial_tilt_deg.toFixed(1)}°`);
  if (b.tidallyLocked) add('Rotation', 'tidally locked');

  // --- Bulk ---
  add('Mass', massRel(b));
  add('Radius', b.radiusKm ? `${fmtNum(b.radiusKm)} km` : '');
  add('Gravity', gravityG(b));
  if (b.massKg && b.radiusKm) {
    const vol = (4 / 3) * Math.PI * Math.pow(b.radiusKm * 1000, 3);
    add('Density', `${((b.massKg / vol) / EARTH_DENSITY).toFixed(2)} ×Earth`);
  }

  // --- Climate ---
  add('Surface temp', tempC(b));
  const tmin = K2C(any.equilibriumTempMinK), tmax = K2C(any.equilibriumTempMaxK);
  if (tmin !== null && tmax !== null) add('Temp range', `${tmin} to ${tmax} °C`);
  add('Atmosphere', atmosphere(b));
  if (b.atmosphere?.composition) {
    const gases = Object.entries(b.atmosphere.composition).sort((a, c) => c[1] - a[1]).slice(0, 3)
      .map(([g, p]) => `${g} ${Math.round((p as number) * 100)}%`).join(', ');
    if (gases) add('Air mix', gases);
  }
  if (b.hydrosphere?.coverage) add('Surface liquid', `${Math.round(b.hydrosphere.coverage * 100)}%${b.hydrosphere.composition ? ` ${b.hydrosphere.composition}` : ''}`);

  // --- Hazards / interior ---
  if (typeof any.surfaceRadiation === 'number') {
    const band = any.surfaceRadiation < 5 ? 'low' : any.surfaceRadiation < 100 ? 'moderate' : 'high';
    const range = (typeof any.surfaceRadiationMin === 'number' && typeof any.surfaceRadiationMax === 'number')
      ? ` (${any.surfaceRadiationMin.toFixed(1)}–${any.surfaceRadiationMax.toFixed(1)} mSv/y)` : ` (${any.surfaceRadiation.toFixed(1)} mSv/y)`;
    add('Radiation', `${band}${range}`);
  }
  if (any.magneticField?.strengthGauss) add('Magnetosphere', `${any.magneticField.strengthGauss.toFixed(2)} G`);
  if (any.geoActivity?.regime) add('Geology', titleCase(String(any.geoActivity.regime)));
  if (any.loDeltaVBudget_ms) add('Ascent Δv', `${(any.loDeltaVBudget_ms / 1000).toFixed(1)} km/s`);

  // --- Life ---
  if (typeof b.habitabilityScore === 'number') add('Habitability', `${Math.round(b.habitabilityScore)}%`);
  if (b.biosphere) add('Native life', `present (cover ${Math.round((b.biosphere.coverage || 0) * 100)}%)`);

  // --- GM-surfaced narrative/feature tags ---
  if (Array.isArray(b.tags) && b.tags.length) {
    const tagLabels = b.tags.map((t: any) => titleCase(String(t.key).split('/').pop() || '')).filter(Boolean);
    if (tagLabels.length) add('Tags', Array.from(new Set(tagLabels)).join(', '));
  }
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
