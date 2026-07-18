// src/lib/rendering/planetAppearance.ts
//
// THE shared planet-appearance model (WS1). One pure function resolves every tag/property-driven
// surface feature a body should show, so the 2D SVG disc (PlanetDisc.svelte), the 2D orrery canvas
// (SystemVisualizer) and the 3D holo (holo/scene.ts) can all draw the SAME features from ONE source
// instead of each re-deriving them (or, in the 3D/orrery case, silently missing them).
//
// This is deliberately RENDERER-AGNOSTIC: it returns feature FLAGS + SCALAR PARAMETERS (strengths,
// counts, colours), never SVG paths or canvas geometry. Each renderer turns these into its own
// primitives (an SVG crater circle, a 3D crater decal, an equirect texture splat) — and, crucially,
// generates any seeded positions itself, so extracting this changes NO existing pixels.
//
// The logic here is lifted verbatim from PlanetDisc.svelte's reactive block; see that file's history
// for the per-feature rationale. Extend HERE (add cratered-asymmetric, cryovolcanism, etc.) and every
// renderer gains it at once.

import type { CelestialBody, ApparentColorStop } from '$lib/types';
import { starColorFromTempK } from './apparentColor';
import { oblatePolarFactor } from './bodyShape';
import { auroraEmitter } from '$lib/physics/aurora';
import { rendersAsGiant } from '$lib/physics/makeup';
import { isSmallBodyShape } from '$lib/catalogue/smallBodyShape';

// ── colour helpers (shared; were inline in PlanetDisc) ──────────────────────────────────────────
export function rgbHex(rgb: [number, number, number]): string {
	const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
	return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}
export function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
	return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
/** Lighten (f>0) or darken (f<0) a hex colour by fraction f. */
export function shade(hex: string, f: number): string {
	const [r, g, b] = hexToRgb(hex);
	return f >= 0
		? rgbHex([r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f])
		: rgbHex([r * (1 + f), g * (1 + f), b * (1 + f)]);
}
/** Emission colour for a self-luminous brown dwarf by effective temperature (K): cool→deep red,
 *  hot young L-dwarf→amber. Never blue (brown dwarfs are cool). */
export function bdGlowColour(teff: number): string {
	const stops: [number, string][] = [
		[250, '#3a0f06'], [600, '#6e1808'], [1000, '#a3320c'], [1400, '#c85614'],
		[1800, '#e07d22'], [2300, '#f2a03e'], [2800, '#ffbf6e']
	];
	if (teff <= stops[0][0]) return stops[0][1];
	for (let i = 1; i < stops.length; i++) {
		if (teff <= stops[i][0]) {
			const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
			const f = (teff - t0) / (t1 - t0);
			const a = hexToRgb(c0), b = hexToRgb(c1);
			return rgbHex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
		}
	}
	return stops[stops.length - 1][1];
}

// ── feature parameter shapes ────────────────────────────────────────────────────────────────────
export interface MagmaSpec {
	vents: number; // how many glowing vents to scatter (renderer seeds their positions)
	lava: boolean; // a full lava world (tidal/lava-flows) vs. discrete volcanism/hotspots
}
export interface AuroraSpec {
	strength: number; // 0..1.3
	coreHex: string;
	tipHex: string;
	brilliant: boolean; // strength >= 0.55 → add a bright tip stroke
}
export interface AtmGlowSpec {
	strength: number; // 0..1 (log-scaled from pressure)
	colorHex: string;
}
export interface SelfLumSpec {
	teff: number;
	colorHex: string;
}

/** Everything about a body's appearance that follows from its data + tags, renderer-agnostic. */
export interface AppearanceModel {
	// classification
	isStar: boolean;
	isBelt: boolean; // belt or ring role
	isToroid: boolean; // spun past break-up
	isSmallBody: boolean; // too small to pull round → irregular
	// base look
	baseColorHex: string;
	oblatePolarFactor: number; // <1 = squashed by fast rotation
	axialTiltDeg: number;
	palette: ApparentColorStop[];
	bandingRaw: number; // fallback banding count (renderer suppresses it when it has a real texture)
	isEarth: boolean;
	// atmosphere / surface state
	atmPressureBar: number;
	tidallyLocked: boolean;
	// surface features (flags + params; renderers seed any positions themselves)
	polarIce: boolean;
	craters: boolean;
	magma: MagmaSpec | null;
	aurora: AuroraSpec | null;
	atmGlow: AtmGlowSpec | null;
	selfLumGlow: SelfLumSpec | null;
}

const isStarRole = (b: CelestialBody) => b.roleHint === 'star';
const isBeltRole = (b: CelestialBody) => b.roleHint === 'belt' || b.roleHint === 'ring';

/**
 * Resolve a body's full appearance model from its data + tags. Pure; no DOM, no canvas — safe in
 * tests and on the server. See planetAppearance for the per-feature reasoning.
 */
export function deriveAppearance(body: CelestialBody): AppearanceModel {
	const isStar = isStarRole(body);
	const isBelt = isBeltRole(body);
	const tagKeys = (body.tags ?? []).map((t) => t.key);
	const has = (k: string) => tagKeys.includes(k);

	const isToroid = !isStar && !isBelt && (body.oblateness ?? 0) >= 0.8;
	const isSmallBody = !isStar && !isBelt && !isToroid && isSmallBodyShape(body);

	const baseColorHex = isStar
		? (body.apparentColorHex ?? rgbHex(starColorFromTempK(body.temperatureK)))
		: (body.apparentColorHex ?? body.apparentColor?.hex ?? '#8a8f99');

	const palette = (body.apparentColor?.palette ?? []) as ApparentColorStop[];
	const bandingRaw = (isStar || isBelt) ? 0 : (body.apparentColor?.banding ?? 0);

	const atmPressureBar =
		(body.atmosphere?.pressure_bar ?? (body.atmosphere as any)?.pressure_atm ?? 0) as number;

	// Polar ice caps (tag-driven).
	const polarIce = !isStar && !isBelt && has('climate/polar-ice');

	// Cratered: old, airless, geologically dead world (or a small body); giants never crater.
	const craters = !isStar && !isBelt && !rendersAsGiant(body) && atmPressureBar < 0.02
		&& (has('geology/inactive') || has('science/impact-record') || isSmallBody);

	// Magma / lava: a full lava world, or discrete tidal volcanism / hotspots.
	const isLava = has('tidal/lava-flows');
	const volc = isLava || has('tidal/volcanism') || has('tidal/hotspots');
	const magma: MagmaSpec | null = (isStar || isBelt || !volc)
		? null
		: { vents: isLava ? 7 : has('tidal/volcanism') ? 5 : 3, lava: isLava };

	// Auroras (aurora/* tag; strength = its value; colour from the atmosphere's auroral emitter).
	const auroraTag = (body.tags ?? []).find((t) => t.key.startsWith('aurora/'));
	const auroraStr = auroraTag ? Math.max(0, Math.min(1.3, parseFloat(auroraTag.value ?? '0') || 0)) : 0;
	const aurora: AuroraSpec | null = (!isStar && !isBelt && auroraStr > 0)
		? (() => { const e = auroraEmitter(body); return { strength: auroraStr, coreHex: e.hex, tipHex: e.tip, brilliant: auroraStr >= 0.55 }; })()
		: null;

	// Atmosphere limb-glow (strength log-scaled from pressure; colour from atmosphere/cloud palette).
	const atmGlow: AtmGlowSpec | null = (!isStar && !isBelt && atmPressureBar > 0.02)
		? {
				strength: Math.max(0, Math.min(1, (Math.log10(Math.max(1e-3, atmPressureBar)) + 2) / 3)),
				colorHex: palette.find((p) => p.role === 'atmosphere')?.hex
					?? palette.find((p) => p.role === 'cloud')?.hex ?? '#9fc6e8'
			}
		: null;

	// Self-luminous brown dwarf (thermal/self-luminous, value = effective temperature).
	const selfLumTag = (body.tags ?? []).find((t) => t.key === 'thermal/self-luminous');
	const selfLumGlow: SelfLumSpec | null = (selfLumTag && !isStar && !isBelt)
		? (() => { const teff = Number(selfLumTag.value) || 0; return { teff, colorHex: bdGlowColour(teff) }; })()
		: null;

	return {
		isStar,
		isBelt,
		isToroid,
		isSmallBody,
		baseColorHex,
		oblatePolarFactor: oblatePolarFactor(body.oblateness),
		axialTiltDeg: body.axial_tilt_deg ?? 0,
		palette,
		bandingRaw,
		isEarth: (body.name || '').trim().toLowerCase() === 'earth' && body.roleHint !== 'star',
		atmPressureBar,
		tidallyLocked: !!(body as any).tidallyLocked,
		polarIce,
		craters,
		magma,
		aurora,
		atmGlow,
		selfLumGlow
	};
}
