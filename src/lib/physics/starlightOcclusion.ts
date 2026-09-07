// STARLIGHT OCCLUSION — what a megastructure takes out of the light before it arrives (G53 phase 4).
//
// `luminosity.ts` answers "how bright is the star" and its header names the second quantity this
// module exists for: what a particular body RECEIVES. A Dyson swarm, a shell or a ringworld sits
// between the photosphere and everything further out, and the honest engine response is a
// TRANSMISSION FACTOR derived from the structures actually in the system — never a second R²T⁴
// with a factor bolted on. This module computes that factor; `receivedLuminosityWatts` (beside the
// intrinsic form, deliberately) applies it.
//
// THE GEOMETRY OF WHO IS SHADOWED IS THE OWNER'S OWN REFINEMENT (mega-constructs-design.md §6) and
// is three rules, restated here because every one of them is load-bearing:
//   1. An occluder NEVER dims itself — its sunward face takes the raw star, and that interception
//      IS the harvest.
//   2. A body radially INSIDE the occluder is undimmed — the light reaches it before the structure.
//   3. A body outside it is dimmed by the occluder's fraction — for EVERY direction if the occluder
//      is isotropic (a shell, a whole-sky swarm), but a BAND (ringworld) dims only what aligns with
//      its plane.
//
// THE ALIGNMENT TEST IS TIME-FREE ON PURPOSE. The whole equilibrium-temperature chain works from
// semi-major axes, never from instantaneous positions (`calculateDistanceToStar` sums a_AU down the
// hierarchy), so a band's shadow must be expressed the same way or a body's temperature would
// change with the clock while its orbit did not. The time-free quantity is the SHARE OF ITS ORBIT a
// body spends inside the band's latitude extent: with sin(lat) = sin(i)·sin(u) along an orbit
// inclined i to the band's plane, and a band reaching latitude ±w, the shadowed share of the orbit
// is (2/π)·asin(sin w / sin i) — exactly 1 when i ≤ w (the orbit never leaves the band's sky), and
// falling toward zero as the orbit tilts out of the plane. Equilibrium temperature is a POWER
// balance (PHY-19), so a time-averaged flux is the correct input, and the min/max transmissions
// feed the range the same way perihelion and aphelion already do.
//
// WHAT AN OCCLUDER IS, HERE: a node carrying a `megaType` the registry knows, orbiting the star
// directly (`parentId === star.id`), whose `derive()` publishes `starOcclusion > 0`. Keyed on
// `megaType` and not on `kind`, so the phase-5 hybrid flip (construct → body) changes nothing in
// this module. Params are the registry DEFAULTS — phase 3 stores no per-instance knobs on a node
// yet (scene.ts's attach states the same scope) — but the RADIUS comes from the instance's real
// orbit, because that is the one per-instance fact a GM has actually chosen. That is RENDER-S44's
// argument carried into physics: a structure that surrounds its star is placed by its orbit, and
// its orbit IS its reach.
//
// STATED APPROXIMATIONS, so nobody mistakes silence for oversight: the star is treated as a point
// source (no penumbra — a default ringworld band is wider than the Sun's disc, so limb leakage is
// second-order); a band's plane is its own orbital plane (i_deg/Omega_deg of the instance); light
// from a COMPANION star is not intercepted by this star's occluders (a real geometry the engine
// does not yet trace); and a partial Dyson SPHERE counts as isotropic because its strip orbits —
// longitude coverage time-averages, latitude coverage never does.
import type { CelestialBody, Barycenter, Kepler } from '../types';
import { AU_KM } from '../constants';
import { megaTypeDef, instanceMegaParams } from '../constructs/megaTypes';

/** One structure between a star and the system, reduced to what the flux chain needs. */
export interface StarOccluder {
	id: string;
	name: string;
	/** Share of the light it intercepts within its own geometry, 0..1 (registry `starOcclusion`). */
	fraction: number;
	/** Its orbital radius in AU — the inside/outside test (rule 2) is against THIS. */
	radiusAu: number;
	/** Present = a BAND: `fraction` applies only within ±this latitude, radians, about its plane. */
	bandHalfAngleRad?: number;
	/** The band's own orbital elements — the plane the alignment test is taken against. */
	elements?: Kepler;
}

/** Every occluder of `star` in the system, from authored data alone — derived fresh on every ask,
 *  never accumulated, so the result cannot depend on pass order (idempotence.test.ts's rule). */
export function starOccluders(
	star: CelestialBody,
	allNodes: (CelestialBody | Barycenter)[]
): StarOccluder[] {
	const out: StarOccluder[] = [];
	for (const n of allNodes) {
		const mt = (n as CelestialBody).megaType;
		if (!mt || n.id === star.id || n.parentId !== star.id) continue;
		const def = megaTypeDef(mt);
		if (!def) continue; // an unknown key degrades to an ordinary construct — and shades nothing
		const node = n as CelestialBody;
		const params = instanceMegaParams(node, def, star);
		const derived = def.derive(params, star);
		const fraction = Math.min(1, Math.max(0, derived.starOcclusion ?? 0));
		if (!(fraction > 0)) continue;
		const aAU = node.orbit?.elements?.a_AU;
		const radiusAu = typeof aAU === 'number' && aAU > 0 ? aAU : params.radiusAU;
		if (!(radiusAu > 0)) continue;
		const occ: StarOccluder = { id: node.id, name: node.name ?? mt, fraction, radiusAu };
		const widthKm = derived.occlusionBandWidthKm;
		if (typeof widthKm === 'number' && widthKm > 0) {
			occ.bandHalfAngleRad = Math.min(Math.PI / 2, widthKm / 2 / (radiusAu * AU_KM));
			occ.elements = node.orbit?.elements;
		}
		out.push(occ);
	}
	return out;
}

const DEG = Math.PI / 180;

/** Mutual inclination of two orbital planes, radians — the standard spherical result
 *  cos i_rel = cos i₁ cos i₂ + sin i₁ sin i₂ cos ΔΩ. Missing elements read as the reference plane. */
export function relativeInclinationRad(a: Kepler | null | undefined, b: Kepler | null | undefined): number {
	const i1 = (a?.i_deg ?? 0) * DEG;
	const i2 = (b?.i_deg ?? 0) * DEG;
	const dO = ((a?.Omega_deg ?? 0) - (b?.Omega_deg ?? 0)) * DEG;
	const c = Math.cos(i1) * Math.cos(i2) + Math.sin(i1) * Math.sin(i2) * Math.cos(dO);
	return Math.acos(Math.max(-1, Math.min(1, c)));
}

/** The share of its orbit a body inclined `relInclinationRad` to a band's plane spends inside the
 *  band's ±`bandHalfAngleRad` latitude extent — the header's (2/π)·asin(sin w / sin i), which is 1
 *  for an orbit that never leaves the band and 0 for a band with no extent at all. sin() handles a
 *  retrograde plane for free (sin 170° = sin 10°: the same two crossings per orbit). */
export function bandAlignmentShare(bandHalfAngleRad: number, relInclinationRad: number): number {
	if (!(bandHalfAngleRad > 0)) return 0;
	const sw = Math.sin(Math.min(Math.PI / 2, bandHalfAngleRad));
	const si = Math.abs(Math.sin(relInclinationRad));
	if (si <= sw) return 1;
	return (2 / Math.PI) * Math.asin(sw / si);
}

export interface StarlightTransmission {
	/** Time-averaged share of the star's light that arrives, 0..1 — the equilibrium input. */
	frac: number;
	/** The least-shadowed moment (a band the orbit only crosses is clear most of the time). */
	bestFrac: number;
	/** The deepest shadow (inside the band, behind the swarm) — the range's cold end. */
	worstFrac: number;
	/** Who took what, for the trace — only occluders that actually shade this body. */
	dimmedBy: { id: string; name: string; fraction: number; band: boolean; alignedShare: number }[];
}

const CLEAR: StarlightTransmission = { frac: 1, bestFrac: 1, worstFrac: 1, dimmedBy: [] };

/**
 * The transmission between one star and one body, from that star's occluder list. Pure in all its
 * inputs — the caller supplies the body's flux distance and its heliocentric orbital elements (the
 * edge of the hierarchy that actually circles the star: a moon shadows as its planet does), both of
 * which the temperature chain already has in hand.
 */
export function starlightTransmission(
	bodyId: string,
	bodyDistanceAu: number,
	bodyEdgeElements: Kepler | null,
	occluders: readonly StarOccluder[]
): StarlightTransmission {
	if (occluders.length === 0 || !(bodyDistanceAu > 0)) return CLEAR;
	let frac = 1;
	let bestFrac = 1;
	let worstFrac = 1;
	const dimmedBy: StarlightTransmission['dimmedBy'] = [];
	for (const occ of occluders) {
		if (occ.id === bodyId) continue; // rule 1: never itself
		if (!(bodyDistanceAu > occ.radiusAu)) continue; // rule 2: inside is undimmed
		const band = occ.bandHalfAngleRad !== undefined;
		const alignedShare = band
			? bandAlignmentShare(occ.bandHalfAngleRad!, relativeInclinationRad(bodyEdgeElements, occ.elements))
			: 1;
		if (!(alignedShare > 0)) continue;
		frac *= 1 - occ.fraction * alignedShare;
		// Envelope for the range: the best moment only loses light to occluders it can never leave;
		// the worst moment loses the full fraction to anything it ever crosses.
		if (alignedShare >= 1) bestFrac *= 1 - occ.fraction;
		worstFrac *= 1 - occ.fraction;
		dimmedBy.push({ id: occ.id, name: occ.name, fraction: occ.fraction, band, alignedShare });
	}
	if (dimmedBy.length === 0) return CLEAR;
	return { frac, bestFrac, worstFrac, dimmedBy };
}
