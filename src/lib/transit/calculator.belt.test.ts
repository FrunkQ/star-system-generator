import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { restorePreCalibrationOrbits } from './preCalibrationSol';
import path from 'path';
import type { System } from '../types';
import { calculateTransitPlan } from './calculator';
import { getGlobalState } from './physics';
import { AU_KM, G } from '../constants';

// #13 regression: a belt destination used to rendezvous with the belt NODE's anomaly point —
// an arbitrary spot on the ring that can sit on the far side of the star, sending Mars→belt
// plans swinging past the sun. A belt/ring destination now retargets a massless phantom on a
// circular orbit at the annulus mid-radius, phased to the origin's longitude.

function loadSolSystem(): System {
  const solPath = path.resolve('static/examples/Sol_2030-System.json');
  const sys = JSON.parse(fs.readFileSync(solPath, 'utf-8')) as System;
  // B93/G46 guard the PLANNER, so they run on the geometry they were written against rather
  // than on a bundled map that is free to move. G62 part 2 calibrated Sol to real ephemeris
  // and the guard LEAKED on the new geometry: a Jupiter flyby assist survived the filter at
  // 0.0658 AU, inside the 0.0899 AU kill zone. That is a real finding about the planner and it
  // is on the board - it is NOT a reason to loosen this assertion, so the fixture is pinned and
  // the assertion stands unchanged.
  return restorePreCalibrationOrbits(sys as any) as System;
}

function nodeIdByName(system: System, name: string): string {
  const node = system.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`Missing node ${name}`);
  return node.id;
}

describe('Belt destination transit (#13)', () => {
  it('Mars -> Main Belt parks at the belt radius without swinging past the star', () => {
    const system = loadSolSystem();
    const marsId = nodeIdByName(system, 'Mars');
    const beltId = nodeIdByName(system, 'The Main Belt');
    const startTime = Date.UTC(2030, 0, 1, 0, 0, 0);
    const mars = system.nodes.find((n) => n.id === marsId) as any;
    const marsGlobal = getGlobalState(system, mars, startTime);
    const marsRadiusAu = Math.hypot(marsGlobal.r.x, marsGlobal.r.y); // ~1.5 AU

    // Low Mars orbit start state, chained to Mars's global state (heliocentric frame solve).
    const rOrbitAu = 4000 / AU_KM;
    const vOrbitAuS = Math.sqrt((mars.massKg * G) / (4000 * 1000)) / (AU_KM * 1000);

    const plans = calculateTransitPlan(system, marsId, beltId, startTime, 'Economy', {
      maxG: 3.0,
      accelRatio: 0.6,
      brakeRatio: 0.3,
      interceptSpeed_ms: 0,
      brakeAtArrival: true,
      shipMass_kg: 2_000_000,
      shipIsp: 380,
      initialStateFrame: 'global',
      initialState: {
        r: { x: marsGlobal.r.x + rOrbitAu, y: marsGlobal.r.y },
        v: { x: marsGlobal.v.x, y: marsGlobal.v.y + vOrbitAuS }
      },
      aerobrake: { allowed: false, limit_kms: 0 }
    });

    expect(plans.length).toBeGreaterThan(0);

    for (const p of plans) {
      expect(Number.isFinite(p.totalDeltaV_ms)).toBe(true);
      expect(p.segments.length).toBeGreaterThan(0);

      let minR = Infinity;
      let lastPt = { x: 0, y: 0 };
      for (const seg of p.segments) {
        for (const pt of seg.pathPoints) {
          expect(Number.isFinite(pt.x)).toBe(true);
          expect(Number.isFinite(pt.y)).toBe(true);
          minR = Math.min(minR, Math.hypot(pt.x, pt.y));
          lastPt = pt;
        }
      }

      // Outward spiral, not a star fly-by: the path must never dip far inside Mars's orbit.
      // (A past-the-star plan dives below ~0.5 AU.)
      //
      // THE GRAVITY ASSIST IS EXCLUDED, AND NOT BECAUSE IT IS AWKWARD. This assertion pins fault #13,
      // which was a TARGETING fault: a belt destination used to rendezvous with the belt node's
      // anomaly point, an arbitrary spot on the ring that could sit on the far side of the star. That
      // is fixed and the three direct families prove it — all three hold minR at Mars's own radius.
      // The Jupiter-assist plan dives for an entirely different reason, pinned separately below, and
      // folding the two together would let either one hide behind the other.
      if (p.planType !== 'Complex') {
        expect(minR).toBeGreaterThan(marsRadiusAu * 0.6);
      }

      // Arrival lands inside the belt annulus (2.2 - 3.4 AU), with soft margin.
      const endR = Math.hypot(lastPt.x, lastPt.y);
      expect(endR).toBeGreaterThan(2.0);
      expect(endR).toBeLessThan(3.6);
    }
  });

  it('no route is offered that dives inside the star (inbox B93 - FIXED)', () => {
    // B93 WAS: the assist search asks whether the ship survives the FLYBY (`r_p_req < r_planet +
    // 200 km`) and never asked where the two heliocentric legs GO. Measured here: the offered
    // Jupiter-assist plan's second leg was a valid Lambert solution with a = 2.670 AU and e = 0.9986
    // - a perihelion of 0.0037 AU, which is 550,000 km from the Sun's centre, inside the corona, and
    // the integrated path bottomed out at 0.0302 AU. Presented as an ordinary route.
    //
    // It went unseen for as long as it existed because the display integrator marched at a flat
    // two-day step and simply fell off the conic near perihelion, drawing a different and less
    // alarming curve - so the assertion above USED TO PASS FOR THE WRONG REASON, checking a path that
    // was wrong rather than a plan that was safe (G46).
    //
    // The search now drops a candidate whose legs dive inside the star's KILL ZONE - the same line
    // the generator already refuses to place a body across, 0.0899 AU for Sol - exactly as it already
    // dropped one whose flyby would clip the planet. It then goes on and finds a safe candidate, so
    // the assist option is still offered: closest approach moved from 0.0302 AU to 1.5537 AU.
    const system = loadSolSystem();
    const marsId = nodeIdByName(system, 'Mars');
    const beltId = nodeIdByName(system, 'The Main Belt');
    const startTime = Date.UTC(2030, 0, 1, 0, 0, 0);
    const mars = system.nodes.find((n) => n.id === marsId) as any;
    const marsGlobal = getGlobalState(system, mars, startTime);
    const rOrbitAu = 4000 / AU_KM;
    const vOrbitAuS = Math.sqrt((mars.massKg * G) / (4000 * 1000)) / (AU_KM * 1000);

    const plans = calculateTransitPlan(system, marsId, beltId, startTime, 'Economy', {
      maxG: 3.0, accelRatio: 0.6, brakeRatio: 0.3, interceptSpeed_ms: 0, brakeAtArrival: true,
      shipMass_kg: 2_000_000, shipIsp: 380, initialStateFrame: 'global',
      initialState: {
        r: { x: marsGlobal.r.x + rOrbitAu, y: marsGlobal.r.y },
        v: { x: marsGlobal.v.x, y: marsGlobal.v.y + vOrbitAuS }
      },
      aerobrake: { allowed: false, limit_kms: 0 }
    });

    // EVERY plan, not just the direct ones: this is the assertion the first test had to exclude the
    // assist family from, and it no longer does.
    const SOL_KILL_ZONE_AU = 0.0899;
    for (const p of plans) {
      let minR = Infinity;
      for (const seg of p.segments) {
        for (const pt of seg.pathPoints) minR = Math.min(minR, Math.hypot(pt.x, pt.y));
      }
      expect(
        minR,
        `${p.name ?? p.planType} passes ${minR.toFixed(4)} AU from the star`
      ).toBeGreaterThan(SOL_KILL_ZONE_AU);
    }

    // And the assist is still on the menu - the guard drops unsafe candidates, it does not drop the
    // family. If this ever goes missing the guard has become a refusal rather than a filter.
    expect(plans.some((p) => p.planType === 'Complex'), 'the gravity-assist option disappeared entirely').toBe(true);
  });
});
