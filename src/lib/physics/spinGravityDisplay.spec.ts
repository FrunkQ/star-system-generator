// THE 12,967,908 g BUG (owner's screen, 2026-08-30) — hours-vs-seconds in the crew tab's RPM pair.
//
// The crew tab converted a rotation period to RPM inline as `1/(hours/60)` = 60/hours — right for
// a period in MINUTES, 3600x too fast for one in hours — and converted back with the mirrored
// mistake, so the stored `rotation_period_hours` survived every round trip while the displayed RPM
// and the artificial-gravity figure fed from it were both wrong. The bundled ringworld authors
// 215.46 h at 1 AU = 1.00 g (held by megaDerive.spec); through the bad pair it read 12,967,908 g.
//
// PHY-34: the headline assertion is ABSOLUTE — 1.00 g for the Niven seed — because a ratio test
// on a conversion pair that inverts cleanly would pass with both halves wrong, which is exactly
// what let this ship.
import { describe, it, expect } from 'vitest';
import { AU_KM, EARTH_GRAVITY } from '../constants';
import { calculateArtificialGravity, rpmFromPeriodHours, periodHoursFromRpm } from './gravity';
import { megaTypeDef, defaultMegaParams } from '$lib/constructs/megaTypes';
import type { CelestialBody } from '$lib/types';

describe('rotation period <-> rpm, and the g figure they feed', () => {
	it('THE ABSOLUTE ANCHOR: the ringworld seed (215.46 h at 1 AU) is 1.00 g through the display path', () => {
		const rpm = rpmFromPeriodHours(215.46);
		const g = calculateArtificialGravity(AU_KM * 1000, rpm);
		expect(g).toBeGreaterThan(0.99);
		expect(g).toBeLessThan(1.01);
	});

	it('the display path agrees with the registry derivation — one law, two consumers', () => {
		const d = megaTypeDef('ringworld')!;
		const host = { id: 'sol', kind: 'body', roleHint: 'star', radiusKm: 696340, tags: [] } as unknown as CelestialBody;
		const params = defaultMegaParams(d, host);
		const derived = d.derive(params, host);
		const g = calculateArtificialGravity(params.radiusAU * AU_KM * 1000, rpmFromPeriodHours(params.rotationPeriodHours));
		expect(g * EARTH_GRAVITY).toBeCloseTo(derived.spinGravityMs2!, 6);
	});

	it('round-trips, and honest zeros for no spin', () => {
		expect(periodHoursFromRpm(rpmFromPeriodHours(215.46))).toBeCloseTo(215.46, 9);
		expect(rpmFromPeriodHours(1)).toBeCloseTo(1 / 60, 12); // a 1 h period is 1 rev per 60 min
		expect(rpmFromPeriodHours(0)).toBe(0);
		expect(periodHoursFromRpm(0)).toBe(0);
	});
});
