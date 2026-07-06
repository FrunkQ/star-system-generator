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
