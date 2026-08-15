// B55/B56 — A MAGNETAR IS NOT A SPAWN TYPE. Owner, 2026-08-15: "they are spawned as neutron stars
// with a physical property that the classification engine defines them as magnetars — ie it is a
// sub-category of neutron star, as they are in reality."
//
// So there is one spawn type, the field is DRAWN, and the label is read back off it. The thing worth
// testing is therefore not "does the label work" but "does the RATE fall out of the physics" — the
// magnetar frequency is now emergent rather than a spawn weight, so there is no rarity knob to get
// wrong and nothing to keep in sync.
import { describe, it, expect } from 'vitest';
import { magnetarLabelFor, starFieldFromPack } from './star';
import { loadStarterPack } from '$lib/import/realsky/testPack';
import { SeededRNG } from '$lib/rng';

const pack = loadStarterPack() as any;
const THRESHOLD = pack.stellarClassification?.magnetar_field_gauss;

describe('the magnetar threshold is pack DATA, not a constant in code', () => {
	it('is stated by the pack, at the observed magnetar floor', () => {
		expect(THRESHOLD).toBe(1e14);
	});

	it('makes no magnetars at all for a pack that states no threshold', () => {
		// A pack is allowed to not have the concept. Failing open would invent one.
		expect(magnetarLabelFor({} as any, 'star/NS', 1e15)).toBe('star/NS');
	});

	it('labels only neutron stars, and only by their field', () => {
		expect(magnetarLabelFor(pack, 'star/NS', 1e15)).toBe('star/magnetar');
		expect(magnetarLabelFor(pack, 'star/NS', 1e12)).toBe('star/NS');
		expect(magnetarLabelFor(pack, 'star/NS', THRESHOLD)).toBe('star/magnetar'); // inclusive
		// Nothing else is eligible, however strong its field.
		expect(magnetarLabelFor(pack, 'star/WD', 1e15)).toBe('star/WD');
		expect(magnetarLabelFor(pack, 'star/BH', 1e15)).toBe('star/BH');
		// And a star with no field drawn keeps its class rather than defaulting either way.
		expect(magnetarLabelFor(pack, 'star/NS', undefined)).toBe('star/NS');
	});
});

describe('the magnetar RATE is emergent, and lands where the old spawn weights put it', () => {
	const drawnRate = (n = 3000) => {
		let magnetars = 0;
		for (let i = 0; i < n; i++) {
			const f = starFieldFromPack(pack, 'star/NS', new SeededRNG(`ns-${i}`))!.strengthGauss;
			if (magnetarLabelFor(pack, 'star/NS', f) === 'star/magnetar') magnetars++;
		}
		return magnetars / n;
	};

	it('is a clear minority of neutron stars', () => {
		// The band is 1e8..1e15 drawn log-uniform (B56), so one of seven decades sits above 1e14:
		// about 14%. The retired spawn weights were NS 4 / magnetar 1, which is 20% — so removing the
		// magnetar entry and widening NS preserves the population rather than reshaping it, which is
		// what "preserve the combined frequency" asked for.
		const rate = drawnRate();
		expect(rate).toBeGreaterThan(0.08);
		expect(rate).toBeLessThan(0.22);
	});

	// THE TRAP THIS WHOLE DESIGN WALKED PAST, worth pinning because both halves look reasonable.
	it('would invert the population under a LINEAR draw or a 1e11 threshold', () => {
		const lo = 1e8, hi = 1e15;
		// (a) Linear draw over the merged band: ~90% of neutron stars become magnetars.
		const rng = new SeededRNG('linear');
		let above = 0;
		for (let i = 0; i < 3000; i++) if (rng.nextFloat() * (hi - lo) + lo >= 1e14) above++;
		expect(above / 3000).toBeGreaterThan(0.85);
		// (b) The threshold where the two OLD bands happened to meet was 1e11. Log-uniform, that is
		// four of seven decades — 57%, a majority. The old NS band's 1e11 ceiling was itself wrong:
		// it excluded ordinary pulsars, which sit at about 1e12.
		expect((Math.log10(hi) - 11) / (Math.log10(hi) - Math.log10(lo))).toBeGreaterThan(0.5);
	});

	it('still produces the faint end the old band advertised and never delivered', () => {
		// A recycled millisecond pulsar sits at 1e8-1e9. Under the old linear draw that was under 1%
		// of neutron stars; the band promised a range it did not produce.
		let faint = 0;
		for (let i = 0; i < 3000; i++) {
			if (starFieldFromPack(pack, 'star/NS', new SeededRNG(`ns-${i}`))!.strengthGauss < 1e9) faint++;
		}
		expect(faint / 3000).toBeGreaterThan(0.08);
	});
});

describe('the picker still resolves "magnetar" — it is a designation, not a spawn type', () => {
	it('gives a magnetar neutron-star parameters with a field in the high tail', () => {
		// B55: "It can still be 'selected' but it is just a NS." The band survives so the DROPDOWN
		// resolves, even though the distribution never draws it.
		const band = pack.statTemplates['star/magnetar'];
		expect(band).toBeDefined();
		expect(band.mass_solar).toEqual(pack.statTemplates['star/NS'].mass_solar);
		expect(band.mag_gauss[0]).toBeGreaterThanOrEqual(THRESHOLD);
		// ...and a field drawn from it classifies back as a magnetar, so the round trip closes.
		const f = starFieldFromPack(pack, 'star/magnetar', new SeededRNG('pick'))!.strengthGauss;
		expect(magnetarLabelFor(pack, 'star/NS', f)).toBe('star/magnetar');
	});

	it('is gone from the generation distribution, with the combined frequency preserved', () => {
		const entries = pack.distributions.star_types.entries as { weight: number; value: string }[];
		expect(entries.map((e) => e.value)).not.toContain('star/magnetar');
		expect(entries.find((e) => e.value === 'star/NS')!.weight).toBe(5); // was NS 4 + magnetar 1
	});
});
