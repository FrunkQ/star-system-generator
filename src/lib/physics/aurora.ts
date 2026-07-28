// Auroras (Phase G viz driver). Incident ionising particles, funnelled by the magnetosphere down to
// the magnetic poles, slam into the upper atmosphere and make it glow. That needs all THREE at once:
//   - an ATMOSPHERE to light up (gas),
//   - a MAGNETIC FIELD to channel the particles into polar ovals (no field → no discrete aurora), and
//   - an ionising PARTICLE flux to drive them.
// Strength is the product of the three (any one missing → nothing), tiered for the aurora/* tag and
// exposed numerically so the renderer can scale a subtle shimmer up to a huge curtain. Calibrated on
// the solar system: Jupiter brilliant, Earth + Saturn strong, Uranus/Neptune moderate, Venus/Mars
// (no field) and Mercury/Io (no air) none.
import type { CelestialBody, RulePack, AuroraBand, AuroraEmitter } from '$lib/types';

// Built-in default emission bands per gas — the engine fallback when a rule pack's gasPhysics doesn't
// carry `aurora` data. Kept byte-for-byte equal to the old hardcoded table so behaviour is unchanged
// until someone edits the data. Oxygen has TWO bands (green main + crimson high). Grouped species
// (O2+O = atomic oxygen, H2+He) are handled in the resolver.
const DEFAULT_AURORA: Record<string, AuroraBand[]> = {
  O2:  [{ colour: 'green',    hex: '#57e39a', efficiency: 5,   altitude: 1 },
        { colour: 'crimson',  hex: '#e14b3a', efficiency: 1.5, altitude: 2, minFraction: 0.12 }],
  N2:  [{ colour: 'purple',   hex: '#9a6bff', efficiency: 1,   altitude: 0 }],
  CO2: [{ colour: 'violet',   hex: '#c86ad0', efficiency: 1.4, altitude: 0 }],
  H2:  [{ colour: 'red-pink', hex: '#ff7e6a', efficiency: 1.8, altitude: 1 }],
  CH4: [{ colour: 'blue',     hex: '#6ab6ff', efficiency: 1.2, altitude: 0 }]
};

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
export type { AuroraEmitter };

// DATA-DRIVEN resolve: reads each gas's emission bands from the rule pack (pack.gasPhysics[gas].aurora),
// falling back to DEFAULT_AURORA when a pack doesn't carry the data. Grouped species preserve the old
// physics: atomic oxygen = O2+O (bands from O2), hydrogen/helium share H2's band. Weight = fraction ×
// band efficiency; a band with minFraction only emits in a gas-rich atmosphere; altitude 2 gets a
// "(high)" label. Called by SystemProcessor with the pack; the result is stored on body.auroraEmitters.
export function resolveAuroraEmitters(body: CelestialBody, pack?: RulePack | null): AuroraEmitter[] {
  const c: Record<string, number> = (body.atmosphere?.composition as Record<string, number>) ?? {};
  const g = (k: string) => c[k] ?? 0;
  const bandsFor = (gas: string): AuroraBand[] => pack?.gasPhysics?.[gas]?.aurora ?? DEFAULT_AURORA[gas] ?? [];
  const groups: { label: string; amount: number; bands: AuroraBand[] }[] = [
    { label: 'atomic oxygen',   amount: g('O2') + g('O'),   bands: bandsFor('O2') },
    { label: 'nitrogen',        amount: g('N2'),            bands: bandsFor('N2') },
    { label: 'carbon dioxide',  amount: g('CO2'),           bands: bandsFor('CO2') },
    { label: 'hydrogen/helium', amount: g('H2') + g('He'),  bands: bandsFor('H2') },
    { label: 'methane',         amount: g('CH4'),           bands: bandsFor('CH4') }
  ];
  let list: { gas: string; colour: string; hex: string; w: number; alt: number }[] = [];
  for (const grp of groups) {
    if (grp.amount <= 0.02) continue;
    for (const b of grp.bands) {
      if (grp.amount < (b.minFraction ?? 0)) continue;
      const gas = b.altitude >= 2 ? `${grp.label} (high)` : grp.label;
      list.push({ gas, colour: b.colour, hex: b.hex, w: grp.amount * b.efficiency, alt: b.altitude });
    }
  }
  if (!list.length) list = [{ gas: 'mixed gases', colour: 'green', hex: '#57e39a', w: 1, alt: 1 }];
  const total = list.reduce((s, d) => s + d.w, 0);
  return list.map((d) => ({ gas: d.gas, colour: d.colour, hex: d.hex, weight: d.w / total, altitude: d.alt }))
    .sort((a, b) => b.weight - a.weight);
}

// The emitter list for renderers: prefers the bands resolved onto the body at process time (so edited
// gas data shows), else resolves from the built-in default (unprocessed bodies / tests).
export function auroraEmitters(body: CelestialBody): AuroraEmitter[] {
  return body.auroraEmitters ?? resolveAuroraEmitters(body, null);
}

// The DOMINANT emitter (+ the second colour as its gradient "tip"), for the physics trace and the 2D
// gradient. Derived from auroraEmitters so the colours never drift from the layered 3D shells.
export function auroraEmitter(body: CelestialBody): { gas: string; colour: string; hex: string; tip: string } {
  const ems = auroraEmitters(body);
  return { gas: ems[0].gas, colour: ems[0].colour, hex: ems[0].hex, tip: ems[1]?.hex ?? '#e88ad6' };
}
