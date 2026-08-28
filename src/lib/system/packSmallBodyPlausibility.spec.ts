// THE BUNDLED SMALL-BODY TEMPLATES MUST BE PHYSICALLY POSSIBLE, and until this file nothing checked.
//
// WHY IT DID NOT MATTER AND WHY IT SUDDENLY DOES. A construct's `massKg` is authored, saved and
// shown, and read by NOTHING that computes gravity — every mass gate in the engine tests
// `kind === 'body'`. `importFixup` likewise refuses a construct a spin axis. So the small-body
// templates' mass and rotation have never been consulted by any physics, and three of the four had
// drifted into values that cannot exist: an M-type at 127 g/cc and a captured rock at 32 g/cc (osmium,
// the densest element there is, is 22.6), and a comet authored PAST its own mass-shedding limit.
// G53 turns these into `kind: 'body'` hybrids, at which point every one of those numbers is read.
//
// Found 2026-08-28 by computing bulk density from the authored mass over the authored dimensions —
// which is all this test does. It is deliberately a check on the PACK rather than on code: this is
// data in the wrong shape, and the standing rule that a physics constant belongs in data cuts both
// ways, because data nothing validates is data that rots.
//
// THE STEER-DO-NOT-STOP LINE, and it matters here: this asserts over OUR OWN SHIPPED TEMPLATES only.
// A GM's authored asteroid may be any density they like — alien tech, unobtanium, plot device — and
// the engine tags it rather than refusing it. Shipping a rock denser than osmium in our own starter
// pack is a defect, not a creative choice.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { rotationalDeform, OBLATE_AT } from '$lib/physics/rotation';

const pack = JSON.parse(readFileSync('static/rulepacks/starter-sf/construct_templates.json', 'utf8'));

/** Densest element (osmium, 22.6 g/cc). Nothing made of ordinary matter is bulk-denser than this. */
const MAX_PLAUSIBLE_GCC = 22.6;
/** A fluffy comet nucleus is about 0.5; below this it is not a body, it is a cloud. */
const MIN_PLAUSIBLE_GCC = 0.05;

/** Bulk density from the authored triaxial dimensions, treated as an ellipsoid — g/cc. */
function densityGcc(massKg: number, dimensionsM: number[]): number {
  const [a, b, c] = dimensionsM.map((d) => d / 2);
  const volumeM3 = (4 / 3) * Math.PI * a * b * c;
  return massKg / volumeM3 / 1000;
}

const smallBodies: any[] = pack.small_body ?? [];

describe('bundled small-body templates are physically possible', () => {
  it('there are some to check — a silent empty list would pass every assertion below', () => {
    expect(smallBodies.length).toBeGreaterThan(0);
  });

  for (const t of smallBodies) {
    describe(t.name, () => {
      const pp = t.physical_parameters ?? {};

      it('states a mass and its dimensions, or nothing below can be computed', () => {
        expect(pp.massKg).toBeGreaterThan(0);
        expect(pp.dimensionsM).toHaveLength(3);
      });

      it('has a bulk density ordinary matter could actually have', () => {
        const rho = densityGcc(pp.massKg, pp.dimensionsM);
        expect(rho).toBeGreaterThan(MIN_PLAUSIBLE_GCC);
        expect(rho).toBeLessThan(MAX_PLAUSIBLE_GCC);
      });

      // The engine already knows when a body flies apart (`physics/rotation.ts`: the breakup period
      // depends only on bulk density). A template must not ship already past that limit — and must
      // not ship so close to it that becoming a body visibly changes its shape, which is what
      // "do not wreck the author's intent" means expressed in the engine's OWN calibrated constant
      // rather than a hand-picked number of hours.
      it('spins slowly enough to read as a solid body, not a deforming or shedding one', () => {
        const rho = densityGcc(pp.massKg, pp.dimensionsM);
        const rot = pp.rotation_period_hours;
        expect(rot, 'a small body with no spin at all cannot be checked; author one').toBeGreaterThan(0);
        const deform = rotationalDeform(rot, rho);
        expect(deform.fraction).toBeLessThan(OBLATE_AT);
        expect(deform.shape).toBe('spherical');
      });
    });
  }
});
