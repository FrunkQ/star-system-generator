// AN ICE GIANT ON A WARM ORBIT IS STILL AN ICE GIANT - and the generator still only makes them cold.
//
// Reported from play: a Uranus-mass world placed at 1 AU read "gas giant". Measured, it matched
// NOTHING. `planet/ice-giant` required `Teq_K [0, 200]`, `planet/hot-neptune` starts at 700, and
// between the two soft edges (about 230 K to 595 K) a world of roughly 13.8 to 17 Earth masses sat
// outside every fingerprint in the pack, so `fallbackBaseClass` named it by mass alone.
//
// The band was doing two jobs. "Where does an ice giant FORM" is 0-200 K, beyond the snow line.
// "What IS this body" has no such limit: migrate Neptune to 1 AU and it is a warm Neptune, not a
// Jupiter. So the pack now says each once - `match.Teq_K [0, 700]` for the classifier and
// `formation.Teq_K [0, 200]` for the viability model - and the temperature gate reads the formation
// band where a type declares one (engine map CLASS-2).
//
// WHAT THIS FILE PINS, AND WHAT IT DELIBERATELY DOES NOT.
//   1. the classifier: the reported body, by name and absolutely;
//   2. the one-way rule: the widened match band never reaches the generator or the picker;
//   3. generation does not move: the set of types viable at ANY temperature is exactly what the old
//      band gave, and whole generated systems are identical body for body;
//   4. the warm edge is the hot Neptune's cold edge, so retuning either cannot reopen the gap.
// It does NOT pin that no generated body changes its LABEL, because some do and should: the
// classifier cannot tell a generated world from an authored one. Measured over 300 systems and 4,185
// bodies when this landed, 27 (0.65%) took the ice-giant name - four of them were the reported fault
// (generated worlds reading "gas giant" by fallback), the rest were Neptune-class bodies drawn as a
// mini-, sub- or super-Neptune or a protoplanet that the same four bands already claim on a cold
// orbit. Test 3 states exactly how far that reaches: the label and what is derived from it.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { judgeTypesAt, viableTypesAt, ALL_GATES } from './generateBodyOfType';
import { generateSystemFromConfig } from './generateFromConfig';
import { systemProcessor } from '../core/SystemProcessor';
import { loadStarterPack } from '../import/realsky/testPack';
import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../constants';
import type { CelestialBody, Fingerprint, RulePack, System } from '../types';

const EARTH = 5.972e24;
const ICE_GIANT = 'planet/ice-giant';
const shipped = () => loadStarterPack();
const fps = (pack: RulePack = shipped()) => (pack.classifier?.fingerprints ?? []) as Fingerprint[];
const iceGiant = (pack: RulePack = shipped()) => fps(pack).find((f) => f.class === ICE_GIANT)!;

/** The pack as it was BEFORE the band was split: one 0-200 K band answering both questions. */
function packWithTheOldBand(): RulePack {
	const pack = JSON.parse(JSON.stringify(shipped())) as RulePack;
	const fp = iceGiant(pack) as any;
	fp.match.Teq_K = [0, 200];
	fp.range.Teq_K = [0, 200];
	delete fp.formation;
	return pack;
}

const sys = (p: Partial<CelestialBody>, aAU: number): System => ({
	id: 'sys', name: 'S', seed: 's', epochT0: 0, age_Gyr: 4.6, nodes: [
		{ id: 'star', name: 'Star', kind: 'body', parentId: null, roleHint: 'star', massKg: 1.989e30, radiusKm: 696340,
		  temperatureK: 5778, radiationOutput: 1, classes: ['star/G'], axial_tilt_deg: 7, rotation_period_hours: 600 },
		{ id: 'p', name: 'P', kind: 'body', parentId: 'star', roleHint: 'planet', axial_tilt_deg: 20, rotation_period_hours: 16,
		  classes: [], tags: [], autoClassify: true,
		  orbit: { hostId: 'star', elements: { a_AU: aAU, e: 0.02, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }, ...p }
	]
}) as any;
const processed = (p: Partial<CelestialBody>, aAU: number, pack: RulePack = shipped()) =>
	systemProcessor.process(sys(p, aAU), pack).nodes.find((n) => n.id === 'p') as CelestialBody;

const URANUS = { massKg: 14.54 * EARTH, radiusKm: 25362 };
const NEPTUNE = { massKg: 17.15 * EARTH, radiusKm: 24622 };

describe('the classifier: a Neptune-class world is an ice giant wherever it now sits', () => {
	it('THE REPORT - a Uranus-mass body at 1 AU from a Sun is an ice giant, and not by fallback', () => {
		const b = processed(URANUS, 1);
		// The premise, absolutely: this orbit is in the old gap, warmer than the old band's soft edge
		// (230 K) and cooler than the hot Neptune's (595 K).
		expect(b.equilibriumTempK).toBeGreaterThan(230);
		expect(b.equilibriumTempK).toBeLessThan(595);
		expect(b.classes?.[0]).toBe(ICE_GIANT);
		expect(b.classification?.base).toBe(ICE_GIANT);
		expect(b.classification?.fallback).toBe(false);
	});

	it('the same body under the OLD band is the fault as reported: a gas giant, by fallback', () => {
		// Kept as a live assertion so the test above can never pass for a reason other than the band.
		const b = processed(URANUS, 1, packWithTheOldBand());
		expect(b.classes?.[0]).toBe('planet/gas-giant');
		expect(b.classification?.fallback).toBe(true);
	});

	it('holds across the whole warm range, for Uranus and for Neptune', () => {
		for (const body of [URANUS, NEPTUNE]) {
			for (const aAU of [0.3, 0.5, 0.8, 1, 1.5, 2.5, 5, 19.2, 30]) {
				const b = processed(body, aAU);
				expect(b.equilibriumTempK, `premise at ${aAU} AU`).toBeLessThan(700);
				expect(b.classes?.[0], `${body.massKg / EARTH} M_E at ${aAU} AU, ${Math.round(b.equilibriumTempK ?? 0)} K`).toBe(ICE_GIANT);
			}
		}
	});

	it('stops where the hot Neptune begins: a Neptune roasting at 0.1 AU is still a hot Neptune', () => {
		const b = processed(NEPTUNE, 0.1);
		expect(b.equilibriumTempK).toBeGreaterThan(700);
		expect(b.classes?.[0]).toBe('planet/hot-neptune');
	});

	it('the warm edge IS the hot Neptune\'s cold edge - one boundary, so neither can be retuned into a gap', () => {
		const hot = fps().find((f) => f.class === 'planet/hot-neptune')!;
		expect((iceGiant().match['Teq_K'] as number[])[1]).toBe((hot.match['Teq_K'] as number[])[0]);
		expect((iceGiant().match['Teq_K'] as number[])[1]).toBe(700);   // absolute: a ratio alone passes at 200/200
	});
});

describe('the one-way rule: where an ice giant can be BORN did not widen with it', () => {
	it('the pack declares the birth band separately, at the old 0-200 K', () => {
		expect(iceGiant().formation?.['Teq_K']).toEqual([0, 200]);
	});

	it('a warm planet slot is never offered an ice giant, and a cold one is', () => {
		const viable = (t: number) => viableTypesAt(t, 'planet', fps(), 0).map((f) => f.class);
		for (const t of [60, 120, 190]) expect(viable(t), `${t} K`).toContain(ICE_GIANT);
		for (const t of [260, 280, 400, 600, 690]) expect(viable(t), `${t} K`).not.toContain(ICE_GIANT);
	});

	it('it is hidden BY THE TEMPERATURE GATE, which a GM may still switch off', () => {
		const at = (gates = ALL_GATES) =>
			judgeTypesAt({ role: 'planet', teqK: 280 }, fps(), gates).find((v) => v.fp.class === ICE_GIANT)!;
		expect(at().ok).toBe(false);
		expect(at().failed).toEqual(['temperature']);
		expect(at({ ...ALL_GATES, temperature: false }).ok).toBe(true);
	});
});

describe('generation does not move: same seed, same system', () => {
	afterEach(() => vi.useRealTimers());

	it('the types viable at every temperature are exactly the ones the old single band gave', () => {
		// The draw for a slot is a weighted choice over this list, in this order, so an identical list
		// at every temperature is an identical random stream and an identical system. Compared against
		// the old band rather than against a stored list, so it stays true as the pack grows.
		const old = fps(packWithTheOldBand());
		let compared = 0;
		for (const role of ['planet', 'moon'] as const) {
			for (let t = 5; t <= 3000; t += (t < 400 ? 5 : 25)) {
				const now = viableTypesAt(t, role, fps(), 300 * EARTH, { ageGyr: 4.6 }).map((f) => f.class);
				const was = viableTypesAt(t, role, old, 300 * EARTH, { ageGyr: 4.6 }).map((f) => f.class);
				expect(now, `${role} at ${t} K`).toEqual(was);
				compared++;
			}
		}
		expect(compared).toBeGreaterThan(300);
	});

	it('whole systems generated from one seed are the same body for body, down to the last field', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		const star = (t: number, l: number, m: number, r: number, cls: string) => ({
			id: 's', temperatureK: t, luminositySolar: l, massKg: m * SOLAR_MASS_KG, radiusKm: r * SOLAR_RADIUS_KM,
			spectralClass: cls, category: 'Main Sequence', luminosityClass: 'V', isRemnant: false,
			pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }
		}) as any;
		const STARS = [star(5778, 1, 1, 1, 'G'), star(3300, 0.01, 0.25, 0.28, 'M'), star(6700, 3.6, 1.4, 1.5, 'F')];
		const generate = (pack: RulePack, seed: string, i: number) =>
			// Auto-barycentre ids carry a Math.random() suffix; nothing here is a binary, but strip it
			// anyway so the comparison can never fail on an id that was never seeded.
			JSON.parse(JSON.stringify(generateSystemFromConfig(seed, pack, {
				seeds: [STARS[i % STARS.length]], ageGyr: [0.03, 1, 4.6][i % 3], knobs: { rarity: [0.2, 0.5, 1][i % 3], diskMass: 0.8 } as any
			})).replace(/bary-auto-id-\d+-[a-z0-9]+/g, 'bary-auto')) as System;

		// What a class label is allowed to carry with it, and nothing else: the label, the
		// explanation of the label, the tags and picture derived from it, and the proper name
		// (the naming roll reads the final class's rarity, after processing).
		const LABEL_FIELDS = new Set(['classes', 'classification', 'tags', 'image', 'name']);
		const withoutLabel = (n: any) => JSON.stringify(Object.fromEntries(Object.entries(n).filter(([k]) => !LABEL_FIELDS.has(k))));

		const oldPack = packWithTheOldBand();
		let bodies = 0, relabelled = 0;
		for (let i = 0; i < 18; i++) {
			const seed = `warm-ice-giant-${i}`;
			const now = generate(shipped(), seed, i), was = generate(oldPack, seed, i);
			expect(now.nodes.length, seed).toBe(was.nodes.length);
			let systemRelabelled = false;
			for (let k = 0; k < now.nodes.length; k++) {
				const a = was.nodes[k] as any, b = now.nodes[k] as any;
				// EVERY body: mass, radius, orbit, makeup, air, sea, temperature, spin - all of it.
				expect(withoutLabel(b), `${seed} ${a.id}`).toBe(withoutLabel(a));
				bodies++;
				if (a.classes?.[0] !== b.classes?.[0]) {
					// The only relabel there is: something BECOMES an ice giant. Nothing stops being one.
					expect(b.classes?.[0], `${seed} ${a.id} was ${a.classes?.[0]}`).toBe(ICE_GIANT);
					relabelled++; systemRelabelled = true;
				} else {
					expect(b.tags, `${seed} ${a.id} tags`).toEqual(a.tags);
					expect(b.image, `${seed} ${a.id} image`).toEqual(a.image);
				}
			}
			// A system with no relabelled world keeps every name it had.
			if (!systemRelabelled) expect(now.nodes.map((n: any) => n.name), seed).toEqual(was.nodes.map((n: any) => n.name));
		}
		expect(bodies).toBeGreaterThan(150);          // absolute: the loop really did compare systems
		expect(relabelled).toBeLessThan(bodies * 0.03);
	});
});
