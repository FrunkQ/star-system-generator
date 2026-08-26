import { describe, it, expect } from 'vitest';
import fs from 'fs';
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
  return JSON.parse(fs.readFileSync(solPath, 'utf-8')) as System;
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

  it('the Jupiter-assist option is a SUN-GRAZER, and that is a solver fault, not a drawing one', () => {
    // Found by G46, once the display integration stopped hiding it. The assist search rejects a flyby
    // whose periapsis would clip the FLYBY BODY (`r_p_req < r_planet + 200 km`) but never asks where
    // the resulting heliocentric legs go — and leg 2 here is a valid Lambert solution with a = 2.670
    // AU and e = 0.9986, i.e. a perihelion of 0.0037 AU. That is 550,000 km from the Sun's centre,
    // inside the corona, on a plan the planner offers as ordinary.
    //
    // It did not look like that before, because the display integration marched at a flat two-day step
    // and simply fell off the conic near perihelion, drawing a different and less alarming curve. So
    // this test USED TO PASS FOR THE WRONG REASON: the plan was always a sun-grazer, and the picture
    // was wrong in a way that concealed it.
    //
    // Not fixed here. Rejecting a candidate changes which plans a user is offered, which is a solver
    // decision and belongs to the transit review, not to a pass over how a journey is drawn. This is
    // the tripwire in the meantime: it fails if the dive changes size, and it fails if someone fixes
    // it without coming back here.
    const system = loadSolSystem();
    const marsId = nodeIdByName(system, 'Mars');
    const beltId = nodeIdByName(system, 'The Main Belt');
    const startTime = Date.UTC(2030, 0, 1, 0, 0, 0);
    const mars = system.nodes.find((n) => n.id === marsId) as any;
    const marsGlobal = getGlobalState(system, mars, startTime);
    const rOrbitAu = 4000 / AU_KM;
    const vOrbitAuS = Math.sqrt((mars.massKg * G) / (4000 * 1000)) / (AU_KM * 1000);

    const assist = calculateTransitPlan(system, marsId, beltId, startTime, 'Economy', {
      maxG: 3.0, accelRatio: 0.6, brakeRatio: 0.3, interceptSpeed_ms: 0, brakeAtArrival: true,
      shipMass_kg: 2_000_000, shipIsp: 380, initialStateFrame: 'global',
      initialState: {
        r: { x: marsGlobal.r.x + rOrbitAu, y: marsGlobal.r.y },
        v: { x: marsGlobal.v.x, y: marsGlobal.v.y + vOrbitAuS }
      },
      aerobrake: { allowed: false, limit_kms: 0 }
    }).find((p) => p.planType === 'Complex');

    expect(assist, 'the fixture no longer produces a gravity-assist option').toBeTruthy();
    let minR = Infinity;
    for (const seg of assist!.segments) {
      for (const pt of seg.pathPoints) minR = Math.min(minR, Math.hypot(pt.x, pt.y));
    }
    // Measured 0.0302 AU. Pinned as a band so it cannot drift unnoticed in either direction.
    expect(minR).toBeGreaterThan(0.02);
    expect(minR).toBeLessThan(0.05);
  });
});
