// The spin-axis model, and the two properties that make it usable as DATA rather than as decoration:
// it is deterministic, and its shape means something.
//
// D8 asked for a tilt on the worlds that have none — 45 real-sky exoplanets (obliquity is
// essentially unmeasurable for an exoplanet) and ~50 hand-authored fiction worlds. The owner's
// instinct was "pseudorandom within typical bounds, say ±30°"; the model already in the generator
// produces exactly that as its BULK (median 19°, 78% under 30°) while still yielding Uranus- and
// Venus-like worlds at a believable rate, because it is built from the two mechanisms rather than
// from a range.
import { describe, expect, it } from 'vitest';
import { inferAxialTilt, bodyCanHaveTilt, DEFAULT_TILT_CATASTROPHE_CHANCE } from './axialTilt';

describe('inferAxialTilt', () => {
	// Without this a reload, a re-import or a re-save silently re-rolls every world — the B9a
	// precedent, and the reason the draw has its own RNG stream keyed on the body id.
	it('is stable for a given body and different between bodies', () => {
		for (const id of ['gj-674-b', 'sys-sol-pluto', 'zetaret-lv426']) {
			expect(inferAxialTilt(id)).toEqual(inferAxialTilt(id));
		}
		const drawn = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => inferAxialTilt(id).tiltDeg);
		expect(new Set(drawn).size).toBeGreaterThan(1);
	});

	it('always returns a physically meaningful obliquity', () => {
		for (let i = 0; i < 2000; i++) {
			const { tiltDeg } = inferAxialTilt(`body-${i}`);
			expect(Number.isFinite(tiltDeg)).toBe(true);
			expect(tiltDeg).toBeGreaterThanOrEqual(0);
			expect(tiltDeg).toBeLessThanOrEqual(180);
		}
	});

	// The SHAPE is the point. A flat ±30 would make Uranus impossible and make 29° as likely as 3°.
	it('is mostly modest, with a real tail rather than a smear', () => {
		const draws = Array.from({ length: 5000 }, (_, i) => inferAxialTilt(`s-${i}`));
		const deg = draws.map((d) => d.tiltDeg).sort((a, b) => a - b);
		const median = deg[Math.floor(deg.length / 2)];
		const under30 = deg.filter((d) => d < 30).length / deg.length;
		expect(median).toBeGreaterThan(10);
		expect(median).toBeLessThan(25);          // the disc population dominates
		expect(under30).toBeGreaterThan(0.7);     // "typical bounds" — the owner's ±30
		// …but the impact population is real: some worlds end up on their side or retrograde.
		expect(deg.some((d) => d > 90)).toBe(true);
		const tippedRate = draws.filter((d) => d.tipped).length / draws.length;
		expect(tippedRate).toBeGreaterThan(DEFAULT_TILT_CATASTROPHE_CHANCE * 0.6);
		expect(tippedRate).toBeLessThan(DEFAULT_TILT_CATASTROPHE_CHANCE * 1.6);
	});

	it('honours the rule-pack knobs, so a GM can make a placid or a violent neighbourhood', () => {
		const placid = { generation_parameters: { axial_tilt_disc_sigma_deg: 2, axial_tilt_catastrophe_chance: 0 } } as any;
		const violent = { generation_parameters: { axial_tilt_disc_sigma_deg: 40, axial_tilt_catastrophe_chance: 0 } } as any;
		const med = (pack: any) => {
			const d = Array.from({ length: 2000 }, (_, i) => inferAxialTilt(`k-${i}`, pack).tiltDeg).sort((a, b) => a - b);
			return d[Math.floor(d.length / 2)];
		};
		expect(med(placid)).toBeLessThan(6);
		expect(med(violent)).toBeGreaterThan(30);
		// chance 0 means nothing is ever tipped
		expect(Array.from({ length: 500 }, (_, i) => inferAxialTilt(`k-${i}`, placid).tipped).some(Boolean)).toBe(false);
	});

	it('knows which bodies have a spin axis at all', () => {
		expect(bodyCanHaveTilt('planet')).toBe(true);
		expect(bodyCanHaveTilt('moon')).toBe(true);
		for (const r of ['belt', 'ring', 'star', 'construct', 'station', undefined]) {
			expect(bodyCanHaveTilt(r as any), `${r}`).toBe(false);
		}
	});
});
