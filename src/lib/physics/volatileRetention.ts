// src/lib/physics/volatileRetention.ts
// Which VOLATILE ICES a body can keep on its surface — the physics foundation behind frost, tholin
// and bright-ice visuals (docs/dev/geo-foundations.md §Foundation 2). A species survives as surface
// ice when BOTH hold:
//   (1) COLD TRAP — the surface is below the ice's melting point, so it can exist as solid at all
//       (reusing the liquids-overhaul phase data: below the triple pressure a substance is solid iff
//       T < meltK). A warm surface keeps the volatile as liquid/vapour, handled by the hydrosphere.
//   (2) GRAVITY TRAP — sublimated vapour is gravitationally bound rather than lost to space: the
//       Jeans escape parameter λ = G·M·μ / (R·R_gas·T_esc) is above a retention floor. This is why
//       tiny warm Luna keeps no ice while distant Pluto keeps N2/CH4 despite subliming them — the
//       cold, heavy N2 vapour simply can't escape Pluto's gravity, so it recondenses (a closed
//       cycle), whereas Luna's water vapour is gone.
// Calibrated on the solar system: Pluto/Triton keep N2+CH4, Callisto keeps only H2O (too warm for
// the lighter ices), Io keeps SO2 frost, Luna/Mercury keep nothing at the resolution we model
// (permanently-shadowed polar cold-trap craters are below it). NOT age-graded in v1 (calibrated at
// present age); an age term is a noted future refinement.
import { G, UNIVERSAL_GAS_CONSTANT } from '../constants';
import { liquidDef } from './liquids';
import type { RulePack } from '$lib/types';

// The volatile ices we test — those with real phase data that read as SURFACE frost/ice. μ in kg/mol.
// `source` gates AVAILABILITY: retention answers "can it KEEP the ice", but a body must first HAVE the
// species. The condensed volatiles (water + the supervolatiles) come from an ice inventory — a rocky,
// ice-free world like Io or Mercury never had them; SO2 is instead sourced from silicate volcanism
// (Io's plumes freezing out), so it needs an active volcanic body, not ice. Without this an ice-model
// would wrongly frost desiccated Io with water and every cold rock with ammonia.
const VOLATILE_ICES: { species: string; molarKg: number; source: 'ice' | 'volcanic' }[] = [
  { species: 'nitrogen', molarKg: 0.028, source: 'ice' },
  { species: 'methane', molarKg: 0.016, source: 'ice' },
  { species: 'carbon-dioxide', molarKg: 0.044, source: 'ice' },
  { species: 'water', molarKg: 0.018, source: 'ice' },
  { species: 'sulfur-dioxide', molarKg: 0.064, source: 'volcanic' }
];

// Jeans λ above this counts as gravitationally retained. Calibrated at present solar-system age so
// Pluto keeps N2 (λ≈31) and CH4 (λ≈18) while Luna loses water (λ≈11). See docs/dev/geo-foundations.md.
export const LAM_RETAIN = 15;

export interface VolatileRetentionInputs {
  massKg: number;
  radiusKm: number;
  surfaceTempK: number;      // mean surface temperature — the cold-trap test (ice stable if below meltK)
  equilibriumTempK: number;  // insolation temperature — drives the escape (exobase) temperature
  iceBearing: boolean;       // has a condensed-ice inventory (bulk ice, icy shell, or a hydrosphere)
  volcanic: boolean;         // active silicate volcanism — the SO2 frost source (Io)
}

export interface VolatileRetention {
  retained: string[];              // species kept as surface ice, most-secure (highest λ) first
  lambda: Record<string, number>;  // Jeans parameter per species (diagnostic / Newton panel)
}

export function deriveVolatileRetention(
  i: VolatileRetentionInputs, pack?: RulePack | null
): VolatileRetention {
  const retained: string[] = [];
  const lambda: Record<string, number> = {};
  const R = i.radiusKm * 1000;
  if (R <= 0 || i.massKg <= 0) return { retained, lambda };
  // Escape (exobase) temperature: modest thermospheric heating over the insolation temperature, with
  // a small floor so a body near absolute zero isn't treated as trapping everything for free. This is
  // NOT the 800 K XUV floor the near-star atmosphere-escape model uses — that floor would wrongly
  // strip cold Kuiper ices; distant bodies have cold exospheres, which is exactly why they keep them.
  const Tesc = Math.max(2 * (i.equilibriumTempK || 0), 50);
  for (const { species, molarKg, source } of VOLATILE_ICES) {
    const def = liquidDef(species, pack);
    if (!def) continue;
    const available = source === 'ice' ? i.iceBearing : i.volcanic; // (0) does the body HAVE this species
    const cold = i.surfaceTempK < def.meltK;                 // (1) can exist as solid ice at all
    const lam = (G * i.massKg * molarKg) / (R * UNIVERSAL_GAS_CONSTANT * Tesc); // (2) Jeans parameter
    lambda[species] = +lam.toFixed(1);
    if (available && cold && lam >= LAM_RETAIN) retained.push(species);
  }
  retained.sort((a, b) => (lambda[b] ?? 0) - (lambda[a] ?? 0));
  return { retained, lambda };
}
