// APPARENT GRAVITY FROM THE RECORD (G58 N2 - the crew tab's last seam).
//
// The owner's decision is his own design-spine sentence (2026-08-31): "apparent g has THREE honest
// wirings - station spin section / ring's own rotation / orbit-net-of-host, zero at orbital rate -
// and the record must DECLARE which." The record declares `capabilities.apparentG`; this module
// turns it into the figure a panel shows, and the panel shows nothing else. 'own-rotation' is
// NET OF THE HOST: omega^2 r - GM/r^2. Round a star the host term is a rounding error (a
// ringworld at 1 AU loses six thousandths of a gravity to Sol); round a world it is the whole story
// (a torus at orbital rate reads exactly zero - free fall - which is the number the engine owes
// rather than either term alone). Pure: no DOM, no THREE, gated in apparentG.spec.ts.
import type { CelestialBody } from '../types';
import { AU_KM, G } from '../constants';
import { megaTypeDef, instanceMegaParams } from './megaTypes';
import type { ExoticApparentG } from './exotics';

const AU_M = AU_KM * 1000;

export interface ApparentGravity {
  /** The figure, m/s^2 (0 for 'none'). */
  ms2: number;
  /** Which wiring produced it - the record's declaration. */
  wiring: ExoticApparentG;
  /** The host's pull at the structure's radius, m/s^2, already netted off `ms2` for 'own-rotation'. */
  hostPullMs2: number;
  /** One sentence for the panel, saying where the number came from. */
  note: string;
}

/** The structure's own radius in metres, from the record's radius param. Two keys exist in the
 *  registry's vocabulary (`radiusAU` for star-centred rings and shells, `ringRadiusKm` for a torus
 *  round a world); the node's own orbit is the fallback, because a host-centred structure's orbit
 *  IS its reach (RENDER-S44). */
function structureRadiusM(params: Record<string, number>, node: any): number {
  if (params.radiusAU > 0) return params.radiusAU * AU_M;
  if (params.ringRadiusKm > 0) return params.ringRadiusKm * 1000;
  const aAU = node?.orbit?.elements?.a_AU;
  return aAU > 0 ? aAU * AU_M : 0;
}

/**
 * The apparent gravity a construct's record declares, or null for a construct that is not an
 * exotic - an ordinary station keeps the crew tab's own spin section (`spin-section` wiring).
 */
export function apparentGravity(node: any, host: CelestialBody | null | undefined): ApparentGravity | null {
  const def = megaTypeDef(node?.megaType);
  if (!def) return null;
  const wiring = def.capabilities.apparentG;
  if (wiring === 'spin-section') return null;
  const params = instanceMegaParams(node, def, host ?? ({} as any)) as Record<string, number>;
  const derived = def.derive(params, host ?? ({} as any));
  if (wiring === 'own-rotation') {
    const spin = derived.spinGravityMs2 ?? 0;
    const rM = structureRadiusM(params, node);
    const M = (host as any)?.massKg || 0;
    const hostPullMs2 = rM > 0 && M > 0 ? (G * M) / (rM * rM) : 0;
    const hostName = (host as any)?.name ?? 'its host';
    return {
      ms2: spin - hostPullMs2,
      wiring,
      hostPullMs2,
      note: hostPullMs2 > 0.01
        ? `From the structure's own rotation, net of ${hostName}'s pull at this radius - zero at orbital rate, free fall.`
        : `From the structure's own rotation at its own radius; ${hostName}'s pull here is a rounding error and is netted off.`
    };
  }
  if (wiring === 'surface') {
    return { ms2: derived.surfaceGravityMs2 ?? 0, wiring, hostPullMs2: 0, note: "The hull's own mass, at its own surface." };
  }
  return { ms2: 0, wiring: 'none', hostPullMs2: 0, note: 'No meaningful figure for this structure; nothing is shown rather than a number without meaning.' };
}
