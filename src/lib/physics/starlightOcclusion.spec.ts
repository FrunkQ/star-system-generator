// G53 PHASE 4 — STARLIGHT OCCLUSION, gated headlessly.
//
// The three rules under test are the owner's own (mega-constructs-design.md §6): an occluder never
// dims itself; a body radially inside it is undimmed; a body outside is dimmed by the fraction —
// every direction for an isotropic occluder, only the aligned ones for a band. The alignment test
// is TIME-FREE (share of the orbit spent in the band's latitude extent), matching the a_AU-based
// distance chain.
//
// PHY-34's lesson is applied deliberately: a RATIO test is blind to a constant divergence, so the
// headline assertion here is an ABSOLUTE temperature — Sol's numbers by hand, dimmed by a known
// swarm, pinned in kelvin. Each of these gates was run against the unwired chain and seen RED
// before the wiring went in (the transmission left at 1 reproduces the undimmed 255 K).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { CelestialBody, System, RulePack } from '../types';
import { AU_KM } from '../constants';
import {
	starOccluders,
	starlightTransmission,
	bandAlignmentShare,
	relativeInclinationRad
} from './starlightOcclusion';
import {
	calculateEquilibriumTemperature,
	calculateEquilibriumTemperatureRange,
	deriveStarlightDimming,
	heliocentricEdgeElements
} from './temperature';
import { calculateGoldilocksZone, calculateKillZone, calculateFrostLine } from './zones';
import { systemProcessor } from '../core/SystemProcessor';

// ── Hand-built nodes, the luminosityUnification.spec pattern ─────────────────────────────────────

const el = (a_AU: number, i_deg = 0, e = 0, Omega_deg = 0) =>
	({ a_AU, e, i_deg, Omega_deg, omega_deg: 0, M0_rad: 0 });

const sol = (): CelestialBody =>
	({
		id: 'sol', name: 'Sol', parentId: null, tags: [],
		kind: 'body', roleHint: 'star', massKg: 1.989e30, radiusKm: 696340, temperatureK: 5778
	}) as CelestialBody;

const planet = (id: string, a_AU: number, i_deg = 0, e = 0): CelestialBody =>
	({
		id, name: id, parentId: 'sol', tags: [], kind: 'body', roleHint: 'planet',
		massKg: 5.972e24, radiusKm: 6371,
		orbit: { hostId: 'sol', hostMu: 1.327e20, t0: 0, elements: el(a_AU, i_deg, e) }
	}) as CelestialBody;

const mega = (id: string, megaType: string, a_AU: number): CelestialBody =>
	({
		id, name: id, parentId: 'sol', tags: [], kind: 'construct', megaType,
		orbit: { hostId: 'sol', hostMu: 1.327e20, t0: 0, elements: el(a_AU) }
	}) as CelestialBody;

// Sol + a default Dyson swarm (density 0.3) at `swarmAU`.
const swarmSystem = (swarmAU: number, bodies: CelestialBody[]) =>
	[sol(), mega('swarm1', 'dyson-swarm', swarmAU), ...bodies];

describe('starOccluders — discovery from authored data alone', () => {
	it('finds a star-parented swarm, takes its radius from the ORBIT and its fraction from derive()', () => {
		const nodes = swarmSystem(0.5, []);
		const occ = starOccluders(sol(), nodes);
		expect(occ).toHaveLength(1);
		expect(occ[0].fraction).toBeCloseTo(0.3, 9); // the registry seed — no per-instance knobs yet
		expect(occ[0].radiusAu).toBeCloseTo(0.5, 9); // the instance's real orbit, NOT the param seed of 1
		expect(occ[0].bandHalfAngleRad).toBeUndefined(); // whole-sky swarm: isotropic
	});

	it('a ringworld is a BAND: fraction 1 within a latitude extent set by its width at its orbit', () => {
		const nodes = [sol(), mega('ring1', 'ringworld', 1)];
		const occ = starOccluders(sol(), nodes);
		expect(occ).toHaveLength(1);
		expect(occ[0].fraction).toBe(1); // a solid band is opaque
		// Default band 1.6e6 km wide at 1 AU: half-extent 8e5/AU_KM ≈ 5.35e-3 rad.
		expect(occ[0].bandHalfAngleRad).toBeCloseTo(8e5 / AU_KM, 9);
	});

	it('a planetary torus shades nothing at system scale, and an unknown megaType degrades silently', () => {
		const torus = { ...mega('t1', 'planetary-torus', 1) };
		const alien = { ...mega('x1', 'unheard-of-type', 2) };
		expect(starOccluders(sol(), [sol(), torus, alien])).toHaveLength(0);
	});
});

describe('starlightTransmission — the three rules of §6', () => {
	const occ = () => starOccluders(sol(), swarmSystem(0.5, []));

	it('rule 1: an occluder never dims itself', () => {
		expect(starlightTransmission('swarm1', 0.5, null, occ()).frac).toBe(1);
	});

	it('rule 2: a body radially inside is undimmed; outside is dimmed by the fraction', () => {
		expect(starlightTransmission('p', 0.3, el(0.3), occ()).frac).toBe(1);
		expect(starlightTransmission('p', 2.0, el(2), occ()).frac).toBeCloseTo(0.7, 12);
	});

	it('rule 3: a band dims only what aligns — coplanar is fully shadowed, inclined barely', () => {
		const ring = starOccluders(sol(), [sol(), mega('ring1', 'ringworld', 1)]);
		// Coplanar, beyond the ring: the star is behind an opaque band all orbit long.
		const flat = starlightTransmission('p', 2, el(2, 0), ring);
		expect(flat.frac).toBe(0);
		expect(flat.worstFrac).toBe(0);
		// Inclined 30°: the orbit crosses the band twice a year and is clear the rest of the time.
		// Share = (2/π)·asin(sin w / sin 30°) with w = 8e5/AU_KM → ≈ 6.81e-3 of the orbit shadowed.
		const w = 8e5 / AU_KM;
		const share = (2 / Math.PI) * Math.asin(Math.sin(w) / Math.sin(Math.PI / 6));
		const tilted = starlightTransmission('p', 2, el(2, 30), ring);
		expect(tilted.frac).toBeCloseTo(1 - share, 9);
		expect(tilted.frac).toBeGreaterThan(0.99);
		expect(tilted.bestFrac).toBe(1);   // most of its year the sky is clear
		expect(tilted.worstFrac).toBe(0);  // twice a year the star goes out
		expect(bandAlignmentShare(w, Math.PI / 6)).toBeCloseTo(share, 12);
	});

	it('mutual inclination honours the node line, not just the tilt', () => {
		// Two 10° planes 180° apart in Ω are 20° apart; the same planes at ΔΩ 0 are coplanar.
		expect(relativeInclinationRad(el(1, 10, 0, 0), el(1, 10, 0, 180))).toBeCloseTo((20 * Math.PI) / 180, 9);
		// acos() loses precision hard against 1, so "the same plane" honestly comes back ~1e-8 rad.
		expect(relativeInclinationRad(el(1, 10, 0, 90), el(1, 10, 0, 90))).toBeLessThan(1e-6);
	});
});

describe('equilibrium temperature receives the dimmed light', () => {
	it('THE ABSOLUTE ANCHOR (PHY-34): a 0.3 swarm takes a 1 AU world from ~255 K to ~233 K at albedo 0.3', () => {
		const p = planet('p1', 1);
		const clear = calculateEquilibriumTemperature(p, [sol(), p], 0.3);
		const dimmed = calculateEquilibriumTemperature(p, swarmSystem(0.5, [p]), 0.3);
		// By hand: T = 5778 · √(R☉/2d) · 0.7^¼ = 254.97 K clear; × 0.7^¼ again = 233.22 K dimmed.
		expect(clear).toBeGreaterThan(254.4); expect(clear).toBeLessThan(255.5);
		expect(dimmed).toBeGreaterThan(232.7); expect(dimmed).toBeLessThan(233.7);
		expect(dimmed / clear).toBeCloseTo(Math.pow(0.7, 0.25), 6);
	});

	it('a world inside the swarm keeps the raw star', () => {
		const p = planet('p1', 0.3);
		const clear = calculateEquilibriumTemperature(p, [sol(), p], 0.3);
		const withSwarm = calculateEquilibriumTemperature(p, swarmSystem(0.5, [p]), 0.3);
		expect(withSwarm).toBe(clear);
	});

	it('a coplanar world beyond a ringworld freezes: equilibrium 0 K, and the range agrees', () => {
		const p = planet('p1', 2);
		const nodes = [sol(), mega('ring1', 'ringworld', 1), p];
		expect(calculateEquilibriumTemperature(p, nodes, 0.3)).toBe(0);
		const r = calculateEquilibriumTemperatureRange(p, nodes, 0.3);
		expect(r.minK).toBe(0);
		expect(r.maxK).toBe(0);
	});

	it('an inclined world beyond the ringworld keeps a warm best case and a dark worst case', () => {
		const p = planet('p1', 2, 30);
		const nodes = [sol(), mega('ring1', 'ringworld', 1), p];
		const clear = calculateEquilibriumTemperatureRange(p, [sol(), p], 0.3);
		const r = calculateEquilibriumTemperatureRange(p, nodes, 0.3);
		expect(r.maxK).toBeCloseTo(clear.maxK, 9); // bestFrac 1: the clear-sky moments are truly clear
		expect(r.minK).toBe(0);                    // worstFrac 0: twice an orbit the star is gone
	});

	it('an eccentric orbit that dips inside the swarm is undimmed at perihelion', () => {
		// a=0.7, e=0.5 → perihelion 0.35 AU (inside 0.5), aphelion 1.05 AU (outside).
		const p = planet('p1', 0.7, 0, 0.5);
		const clear = calculateEquilibriumTemperatureRange(p, [sol(), p], 0.3);
		const r = calculateEquilibriumTemperatureRange(p, swarmSystem(0.5, [p]), 0.3);
		expect(r.maxK).toBeCloseTo(clear.maxK, 9);              // perihelion: inside, raw star
		expect(r.minK).toBeCloseTo(clear.minK * Math.pow(0.7, 0.25), 6); // aphelion: dimmed
	});

	it('a moon rides its planet: same shadow share as the world it circles', () => {
		const p = planet('p1', 2, 30);
		const moon = {
			...planet('m1', 2), parentId: 'p1', roleHint: 'moon',
			orbit: { hostId: 'p1', hostMu: 4e14, t0: 0, elements: el(0.002) }
		} as CelestialBody;
		const nodes = [sol(), mega('ring1', 'ringworld', 1), p, moon];
		// The moon's heliocentric edge is the PLANET's orbit — 30° inclined — not its own 0° one.
		expect(heliocentricEdgeElements(moon, sol(), nodes)?.i_deg).toBe(30);
		// Its star DISTANCE differs by its own orbit (the summed-path convention), so compare the
		// TRANSMISSION — the dimmed/clear ratio — which must be exactly its planet's.
		const clear = [sol(), p, moon];
		const pShare = calculateEquilibriumTemperature(p, nodes, 0.3) / calculateEquilibriumTemperature(p, clear, 0.3);
		const mShare = calculateEquilibriumTemperature(moon, nodes, 0.3) / calculateEquilibriumTemperature(moon, clear, 0.3);
		expect(mShare).toBeCloseTo(pShare, 9);
	});
});

describe('the knob editor reaches physics: instance params drive the occluder (G58)', () => {
	it('a swarm with a stored densityFrac of 0.6 dims by 0.6, not by the seed', () => {
		const swarm = { ...mega('swarm1', 'dyson-swarm', 0.5), megaParams: { densityFrac: 0.6 } } as CelestialBody;
		const occ = starOccluders(sol(), [sol(), swarm]);
		expect(occ).toHaveLength(1);
		expect(occ[0].fraction).toBeCloseTo(0.6, 9);
		// And the world behind it receives 40%: the slider is a physics control, not a label.
		const p = planet('p1', 1);
		const t = starlightTransmission('p1', 1, el(1), starOccluders(sol(), [sol(), swarm, p]));
		expect(t.frac).toBeCloseTo(0.4, 9);
	});

	it('a ringworld with a stored width narrows its own shadow band', () => {
		const ring = { ...mega('ring1', 'ringworld', 1), megaParams: { widthKm: 8e5 } } as CelestialBody;
		const occ = starOccluders(sol(), [sol(), ring]);
		expect(occ[0].bandHalfAngleRad).toBeCloseTo(4e5 / AU_KM, 9); // half the default band
	});

	it('junk in stored params cannot poison the chain: unknown keys and non-finite values are ignored', () => {
		const swarm = { ...mega('swarm1', 'dyson-swarm', 0.5), megaParams: { densityFrac: Number.NaN, nonsense: 9 } } as unknown as CelestialBody;
		const occ = starOccluders(sol(), [sol(), swarm]);
		expect(occ[0].fraction).toBeCloseTo(0.3, 9); // NaN falls back to the seed; nonsense is dropped
	});
});

describe('the zones follow the dimming (the B110 coherence half)', () => {
	// The zone circles LIVE in the system plane, which is the aligned direction for every band -
	// so for zones every occluder applies its full fraction beyond its radius, bands included.
	it('a 0.3 swarm at 0.5 AU pulls the habitable zone inward by exactly sqrt(0.7)', () => {
		const clear = calculateGoldilocksZone(sol(), [sol()]);
		// ABSOLUTE anchors first (PHY-34): Sol's conservative HZ is about 0.95-1.68 AU.
		expect(clear.inner).toBeGreaterThan(0.94); expect(clear.inner).toBeLessThan(0.96);
		expect(clear.outer).toBeGreaterThan(1.66); expect(clear.outer).toBeLessThan(1.69);
		const dimmed = calculateGoldilocksZone(sol(), swarmSystem(0.5, []));
		expect(dimmed.inner).toBeCloseTo(clear.inner * Math.sqrt(0.7), 9);
		expect(dimmed.outer).toBeCloseTo(clear.outer * Math.sqrt(0.7), 9);
	});

	it('a zone edge that lands INSIDE the occluder stands undimmed - the kill zone ignores a 0.5 AU swarm', () => {
		const clear = calculateKillZone(sol(), null);
		const dimmed = calculateKillZone(sol(), null, swarmSystem(0.5, []));
		expect(clear).toBeGreaterThan(0);
		expect(dimmed).toBe(clear);
	});

	it('a swarm INSIDE the kill zone shields it: radius falls by sqrt(0.7)', () => {
		const clear = calculateKillZone(sol(), null);
		const dimmed = calculateKillZone(sol(), null, swarmSystem(0.05, []));
		expect(dimmed).toBeCloseTo(clear * Math.sqrt(0.7), 9);
	});

	it('a solid ringworld PINS every outer zone at its own radius: beyond it, in-plane, is dark', () => {
		const nodes = [sol(), mega('ring1', 'ringworld', 1)];
		const clear = calculateGoldilocksZone(sol(), [sol()]);
		const gz = calculateGoldilocksZone(sol(), nodes);
		expect(gz.inner).toBeCloseTo(clear.inner, 9); // 0.95 < 1: lands inside the ring, undimmed
		expect(gz.outer).toBeCloseTo(1, 9);           // the flux jump at the ring IS the zone edge
		const frost = calculateFrostLine(sol(), nodes);
		expect(frost).toBeCloseTo(1, 9);              // ~4.9 AU in clear sky; the ring ends it
		const clearFrost = calculateFrostLine(sol(), [sol()]);
		expect(clearFrost).toBeGreaterThan(3);
	});

	it('a TILTED ring barely moves the zones, exactly as it barely moves the temperatures', () => {
		// The zone circles live in the reference plane. An untilted band IS that plane and pins the
		// zones at its radius; a band tilted 30 degrees crosses it at two longitudes only, so the
		// zones must shrink by its small aligned share, not collapse. Coherence with the body side:
		// the same tilt costs a coplanar world under 1% of its light.
		const tilted = { ...mega('ring1', 'ringworld', 1) } as CelestialBody;
		tilted.orbit!.elements.i_deg = 30;
		const clear = calculateGoldilocksZone(sol(), [sol()]);
		const gz = calculateGoldilocksZone(sol(), [sol(), tilted]);
		expect(gz.outer).toBeGreaterThan(clear.outer * 0.99); // NOT pinned at 1 AU
		expect(gz.outer).toBeLessThanOrEqual(clear.outer);    // but honestly a whisker dimmer
		const frost = calculateFrostLine(sol(), [sol(), tilted]);
		const clearFrost = calculateFrostLine(sol(), [sol()]);
		expect(frost).toBeGreaterThan(clearFrost * 0.99);
	});

	it('two swarms compose multiplicatively on a line beyond both', () => {
		const nodes = [sol(), mega('s1', 'dyson-swarm', 0.3), mega('s2', 'dyson-swarm', 0.6)];
		const clear = calculateFrostLine(sol(), [sol()]);
		expect(calculateFrostLine(sol(), nodes)).toBeCloseTo(clear * Math.sqrt(0.7 * 0.7), 6);
	});
});

describe('the dimming summary the trace reads', () => {
	it('names the occluder and the received share; null when nothing shades', () => {
		const p = planet('p1', 1);
		const dim = deriveStarlightDimming(p, swarmSystem(0.5, [p]));
		expect(dim).toHaveLength(1);
		expect(dim![0].starName).toBe('Sol');
		expect(dim![0].receivedFrac).toBeCloseTo(0.7, 9);
		expect(dim![0].occluders[0]).toMatchObject({ name: 'swarm1', fraction: 0.3, band: false });
		expect(deriveStarlightDimming(planet('p2', 0.3), swarmSystem(0.5, [planet('p2', 0.3)]))).toBeNull();
	});
});

// ── The processor path: real Sol, a real swarm, three passes — the idempotence discipline with a
//    megastructure actually present, which the bundled fixtures never have. ─────────────────────

function loadPack(): RulePack {
	const base = path.resolve('static/rulepacks/starter-sf');
	const deepMerge = (t: any, s: any): any => {
		const o = { ...t };
		for (const k of Object.keys(s)) {
			o[k] = s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && k in t ? deepMerge(t[k], s[k]) : s[k];
		}
		return o;
	};
	let pack = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8')) as RulePack;
	for (const f of ['construct_templates.json', 'engine-definitions.json', 'fuel-definitions.json', 'liquids.json', 'classification.json', 'atmospheres.json']) {
		const p = path.join(base, f);
		if (fs.existsSync(p)) pack = deepMerge(pack, JSON.parse(fs.readFileSync(p, 'utf-8')));
	}
	return pack;
}

const bundledSol = (): System => {
	const map = JSON.parse(fs.readFileSync(path.resolve('static/example-starmaps/Local_Neighbourhood-Starmap.json'), 'utf-8'));
	return JSON.parse(JSON.stringify(map.systems.find((s: any) => s.name === 'Sol').system)) as System;
};

describe('the processor commits the shadow and deletes it with the structure', () => {
	it('a swarm over bundled Sol cools Earth, stamps the summary, holds over three passes, and leaves cleanly', () => {
		const pack = loadPack();

		const clearSys = systemProcessor.process(bundledSol(), pack);
		const clearEarth = clearSys.nodes.find((n) => n.name === 'Earth') as CelestialBody;
		expect(clearEarth.starlightDimming).toBeUndefined();

		const withSwarm = bundledSol();
		const star = withSwarm.nodes.find((n) => (n as CelestialBody).roleHint === 'star')!;
		withSwarm.nodes.push({
			...mega('swarm1', 'dyson-swarm', 0.25),
			parentId: star.id,
			orbit: { hostId: star.id, hostMu: 1.327e20, t0: 0, elements: el(0.25) }
		});

		// Three passes, the idempotence discipline, on the temperature fields the shadow feeds.
		let cur = withSwarm;
		const snaps: string[] = [];
		for (let p = 0; p < 3; p++) {
			cur = systemProcessor.process(JSON.parse(JSON.stringify(cur)), pack);
			snaps.push(JSON.stringify(cur.nodes.map((n) => {
				const b = n as CelestialBody;
				const shadowTag = (b.tags ?? []).find((t) => t.key === 'mega/shadowed-by')?.value ?? null;
				return [b.name, b.equilibriumTempK, b.temperatureK, b.starlightDimming ?? null, shadowTag];
			})));
		}
		expect(snaps[1]).toBe(snaps[0]);
		expect(snaps[2]).toBe(snaps[1]);

		const earth = cur.nodes.find((n) => n.name === 'Earth') as CelestialBody;
		expect(earth.starlightDimming).toHaveLength(1);
		expect(earth.starlightDimming![0].receivedFrac).toBeCloseTo(0.7, 9);
		expect(earth.equilibriumTempK!).toBeLessThan(clearEarth.equilibriumTempK!);
		// G58 flux outputs (the owner's "occluded by ring" ask): the shadow speaks TAG, physics
		// origin so re-derive owns it despite the mega/ namespace's authored default.
		const shadowTag = (earth.tags ?? []).find((t) => t.key === 'mega/shadowed-by');
		expect(shadowTag?.value).toContain('swarm1');

		// Remove the swarm: the shadow must leave with it, not linger as a stale stamp.
		cur.nodes = cur.nodes.filter((n) => n.id !== 'swarm1');
		const after = systemProcessor.process(JSON.parse(JSON.stringify(cur)), pack);
		const earthAfter = after.nodes.find((n) => n.name === 'Earth') as CelestialBody;
		expect(earthAfter.starlightDimming).toBeUndefined();
		expect((earthAfter.tags ?? []).some((t) => t.key === 'mega/shadowed-by')).toBe(false); // no ghost tag
		expect(earthAfter.equilibriumTempK!).toBeGreaterThan(earth.equilibriumTempK!);
	}, 60000);
});
