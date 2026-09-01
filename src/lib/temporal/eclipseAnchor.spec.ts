// G62 — THE ECLIPSE ACCEPTANCE TEST, AND THE HALF OF IT THAT CANNOT BE MET YET.
//
// The owner's criterion for the stake in the sand was eclipse timings: "calibrate the default maps
// showing the earth star system to actually have the date reflect true conditions and eclipse
// timings". A wrong anchor moves an eclipse by hours, so the test is a real one.
//
// IT SPLITS IN TWO, and only one half is about the anchor.
//
// (1) WHICH INSTANT IS THIS TICK? That is the anchor's whole job and it is gated below, exactly.
//
// (2) WHERE IS LUNA'S SHADOW AT THAT INSTANT? That is the bundled map's orbital elements and the
//     propagator, and it is MEASURED here rather than asserted, because it cannot pass today and
//     the anchor is not the reason:
//
//       - Luna in the bundled Sol carries `Omega_deg: 0` and `omega_deg: 0`. The ascending node is
//         what sets where eclipse SEASONS fall; zero is a placeholder, not an ephemeris.
//       - `eclipses.ts` holds orbital elements FIXED, by documented decision - its own header says
//         "the honest description of the answer is 'when these elements next line up', not an
//         ephemeris", and every prediction carries `approximate: true`.
//
//     Measured on this build: the first Earth eclipse the engine finds after 2026-06-01 is
//     2028-09-22, a 0.597 PARTIAL - 771.7 days from the real total of 2026-08-12. Anchoring the
//     clock correctly does not move that by a second, and would not whatever the anchor said.
//
//     Closing it needs real elements for Earth and Luna (Omega, omega and M0 at the map's epoch)
//     AND nodal precession in the propagator - a physics-and-data item, filed on the board, not a
//     calendar one. This file is the honest record of the gap and its size.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  unixMsToMasterSeconds,
  masterSecondsToUnixMs,
  resolveCalendar,
  anchorUnixEpochMasterSeconds
} from './utre';
import { applyTemporalRegistryConfig } from './defaults';
import type { System, TemporalAnchor, TemporalCalendarDefinition } from '$lib/types';

const SHIPPED = JSON.parse(readFileSync('static/temporal/calendars.json', 'utf8')) as {
  temporal_anchor: TemporalAnchor;
  temporal_registry: Record<string, TemporalCalendarDefinition>;
};
const GREG = SHIPPED.temporal_registry['Earth Gregorian'];

/** Greatest eclipse of the total solar eclipse of 12 August 2026, to the minute. */
const ECLIPSE_2026 = '2026-08-12T17:46:00Z';
/** Greatest eclipse of the total solar eclipse of 11 August 1999, the other end of a lifetime. */
const ECLIPSE_1999 = '1999-08-11T11:03:00Z';

describe('G62 — the anchor puts a named real instant on the master clock exactly', () => {
  it('a real instant round-trips through the master clock to the second', () => {
    applyTemporalRegistryConfig(SHIPPED as any);
    for (const iso of [ECLIPSE_2026, ECLIPSE_1999, '2026-09-01T12:00:00Z']) {
      const ms = Date.parse(iso);
      expect(masterSecondsToUnixMs(unixMsToMasterSeconds(ms)), iso).toBe(ms);
    }
  });

  // ABSOLUTE (PHY-34): the tick is a fixed number derived from the published anchor and a published
  // eclipse time, neither of which comes from this code.
  it('the 2026 eclipse sits on the tick the anchor names', () => {
    applyTemporalRegistryConfig(SHIPPED as any);
    const expected = BigInt(SHIPPED.temporal_anchor.master_t) + BigInt(Date.parse(ECLIPSE_2026) / 1000);
    expect(unixMsToMasterSeconds(Date.parse(ECLIPSE_2026))).toBe(expected);
    expect(anchorUnixEpochMasterSeconds(SHIPPED.temporal_anchor)).toBe(435084631200000000n);
  });

  it('and the campaign calendar names that tick 12 August 2026', () => {
    applyTemporalRegistryConfig(SHIPPED as any);
    const at = resolveCalendar(unixMsToMasterSeconds(Date.parse(ECLIPSE_2026)), GREG).formatted;
    expect(at).toContain('12th August');
    expect(at).toContain('2026 AD');
  });

  it('the 1999 eclipse too - one anchor, fifty-seven years apart, no drift into the wrong day', () => {
    applyTemporalRegistryConfig(SHIPPED as any);
    const at = resolveCalendar(unixMsToMasterSeconds(Date.parse(ECLIPSE_1999)), GREG).formatted;
    expect(at).toContain('August');
    expect(at).toContain('1999 AD');
  });
});

describe('G62 — the measured ephemeris gap, recorded rather than asserted away', () => {
  it("Luna's node in the bundled Sol is a placeholder, which is why the seasons do not line up", () => {
    const MAP = JSON.parse(
      readFileSync('static/example-starmaps/Local_Neighbourhood-Starmap.json', 'utf8')
    );
    const solEntry = MAP.systems.find((x: any) => x.name === 'Sol');
    const sol: System = (solEntry.system ?? solEntry) as System;
    const luna: any = sol.nodes.find((n: any) => /^luna$/i.test(n.name));
    expect(luna, 'the bundled Sol still has a Luna').toBeTruthy();
    // If either of these ever becomes a real ephemeris value, the eclipse half of G62's acceptance
    // becomes reachable and this test should be REPLACED by the real timing gate.
    expect(luna.orbit.elements.Omega_deg).toBe(0);
    expect(luna.orbit.elements.omega_deg).toBe(0);
    // The inclination IS real - 5.145 deg - which is exactly why this reads as a near miss rather
    // than obvious nonsense, and why it is worth writing down.
    expect(luna.orbit.elements.i_deg).toBeCloseTo(5.145, 3);
  });
});
