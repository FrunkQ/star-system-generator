// Auroras (Phase G viz driver). Incident ionising particles, funnelled by the magnetosphere down to
// the magnetic poles, slam into the upper atmosphere and make it glow. That needs all THREE at once:
//   - an ATMOSPHERE to light up (gas),
//   - a MAGNETIC FIELD to channel the particles into polar ovals (no field → no discrete aurora), and
//   - an ionising PARTICLE flux to drive them.
// Strength is the product of the three (any one missing → nothing), tiered for the aurora/* tag and
// exposed numerically so the renderer can scale a subtle shimmer up to a huge curtain. Calibrated on
// the solar system: Jupiter brilliant, Earth + Saturn strong, Uranus/Neptune moderate, Venus/Mars
// (no field) and Mercury/Io (no air) none.
import type { CelestialBody } from '$lib/types';

export type AuroraTier = 'faint' | 'moderate' | 'strong' | 'brilliant';
export interface Aurora { strength: number; tier: AuroraTier | null; }

// Dimensionless 0..~1.3. Uses radiationShieldingMag (0..0.99, derived from the field strength) as the
// channelling factor and stellarRadiation (incident flux, Earth ≈ 1) as the ionising driver.
export function auroraStrength(body: CelestialBody): number {
  const P = body.atmosphere?.pressure_bar ?? 0;
  const magChannel = body.radiationShieldingMag ?? 0;         // ∝ field strength; 0 → no polar ovals
  const flux = body.stellarRadiation ?? 0;                    // incident stellar flux (Earth ≈ 1)
  if (P <= 0.02 || magChannel <= 0.02) return 0;              // needs both air AND a field
  const atmoFactor = Math.max(0, Math.min(1, (Math.log10(P) + 2) / 2.5));  // 0.01 bar→0, 1→0.8, ≥3→1
  // Ionising-flux modulation: a gentle boost so a close or active star brightens the display, floored
  // so a strong-field giant in dim light (Jupiter) keeps its glow — real Jovian auroras are the
  // brightest in the solar system, powered by its field and internal plasma, not by sunlight.
  const fluxBoost = Math.max(0.7, Math.min(1.7, 0.8 + 0.35 * Math.log10(Math.max(0.05, flux))));
  return atmoFactor * magChannel * fluxBoost;
}

export function auroraTier(strength: number): AuroraTier | null {
  if (strength >= 0.55) return 'brilliant';
  if (strength >= 0.32) return 'strong';
  if (strength >= 0.15) return 'moderate';
  if (strength >= 0.06) return 'faint';
  return null;
}

export function deriveAurora(body: CelestialBody): Aurora {
  const strength = auroraStrength(body);
  return { strength, tier: auroraTier(strength) };
}

// The auroral EMITTERS present in the atmosphere, weight-sorted (dominant first). Real skies glow in
// more than one colour at once, LAYERED BY ALTITUDE: each gas fluoresces its own colour at its own
// height — Earth runs a purple/magenta nitrogen fringe at the bottom (~80 km), the bright apple-green
// atomic-oxygen band above it (~100 km), and, when the oxygen column is rich enough, a tenuous deep-red
// crimson oxygen band high above (200–400 km). WEIGHT = concentration × emission EFFICIENCY (atomic
// oxygen glows far brighter per molecule, which is why Earth reads green though the air is mostly N₂).
// ALTITUDE (0 = low fringe, 1 = main band, 2 = high tenuous band) stacks the renderer's shells in the
// right order. Shared with the physics trace (via auroraEmitter) so they can't drift.
export interface AuroraEmitter { gas: string; colour: string; hex: string; weight: number; altitude: number; }
export function auroraEmitters(body: CelestialBody): AuroraEmitter[] {
  const c: any = body.atmosphere?.composition ?? {};
  const g = (k: string) => c[k] ?? 0;
  const o = g('O2') + g('O');
  const defs = [
    { gas: 'atomic oxygen',    colour: 'green',    hex: '#57e39a', amt: o,                 eff: 5,   alt: 1 },
    { gas: 'nitrogen',         colour: 'purple',   hex: '#9a6bff', amt: g('N2'),           eff: 1,   alt: 0 },
    { gas: 'carbon dioxide',   colour: 'violet',   hex: '#c86ad0', amt: g('CO2'),          eff: 1.4, alt: 0 },
    { gas: 'hydrogen/helium',  colour: 'red-pink', hex: '#ff7e6a', amt: g('H2') + g('He'), eff: 1.8, alt: 1 },
    { gas: 'methane',          colour: 'blue',     hex: '#6ab6ff', amt: g('CH4'),          eff: 1.2, alt: 0 }
  ];
  let list = defs.filter((d) => d.amt > 0.02).map((d) => ({ gas: d.gas, colour: d.colour, hex: d.hex, w: d.amt * d.eff, alt: d.alt }));
  // A RICH oxygen column (Earth-like) also excites the high-altitude crimson band — the deep-red crown
  // seen above the green curtains in strong storms.
  if (o > 0.12) list.push({ gas: 'atomic oxygen (high)', colour: 'crimson', hex: '#e14b3a', w: o * 5 * 0.3, alt: 2 });
  if (!list.length) list = [{ gas: 'mixed gases', colour: 'green', hex: '#57e39a', w: 1, alt: 1 }];
  const total = list.reduce((s, d) => s + d.w, 0);
  return list.map((d) => ({ gas: d.gas, colour: d.colour, hex: d.hex, weight: d.w / total, altitude: d.alt }))
    .sort((a, b) => b.weight - a.weight);
}

// The DOMINANT emitter (+ the second colour as its gradient "tip"), for the physics trace and the 2D
// gradient. Derived from auroraEmitters so the colours never drift from the layered 3D shells.
export function auroraEmitter(body: CelestialBody): { gas: string; colour: string; hex: string; tip: string } {
  const ems = auroraEmitters(body);
  return { gas: ems[0].gas, colour: ems[0].colour, hex: ems[0].hex, tip: ems[1]?.hex ?? '#e88ad6' };
}
