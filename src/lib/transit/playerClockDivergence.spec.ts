// A PARKED SHIP IS FROZEN ON A PLAYER VIEW, AND A FREE CLOCK MAKES IT WORSE.
//
// [[B96]], reported 2026-08-27 with the owner's own save: a ship flown to Earth orbits correctly on
// the GM's map and sits motionless in space on the players'. Reproduced here from his actual node.
//
// THE MECHANISM. `slimNode` strips `scheduled_journeys` from every player snapshot and publishes two
// compact substitutes - `driveBurns` and `route` - so the plume and the flight stay live against the
// player's own clock. There is no third one. Once the route ENDS the player has only
// `vector_position_au`, a single instant the GM stamped, and the ship stops. The GM meanwhile has
// `samplePostJourneyState`, which gives it a live parking orbit.
//
// AND THE CLOCKS NEED NOT AGREE. A player view that is not following the GM runs its own clock, by
// design - which is harmless for worlds, because Kepler is closed-form in time and any clock draws
// them correctly. It is not harmless for a ship whose position the player cannot recompute: the ship
// stands still while the world it is parked at moves on.
//
// FIXED, 2026-08-27, and NOT by the route this note expected. No compact parked descriptor was
// needed. The ship was frozen because its stored record still described the heliocentric orbit it
// departed from, while a stamped `vector_position_au` - which `computeWorldPositions3D` prefers OVER
// the orbit - pinned it to the instant it stopped. Repairing the record and dropping that vector
// makes a parked ship an ordinary Keplerian orbiter, which any clock draws correctly. See B97 and
// DATA-R27.
//
// So, as the note asked, the assertions are INVERTED rather than deleted, and both halves are kept:
// the first test measures the fault on an UNHEALED node (which is what every save contained until
// today), and the second runs the same node through the repair the app now performs and requires the
// player to move, to match the GM, and to still be right on a clock a year adrift.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { sampleJourneyKinematicsAtTime, reconcileConstructArrival } from './scheduler';
import { computeWorldPositions3D } from '../physics/worldPositions';
import { compactRoute } from '../constructs/shipRoute';

const AU_KM = 1.495978707e8;
const base = JSON.parse(fs.readFileSync(path.resolve('static/examples/Sol_Expanse-System.json'), 'utf-8'));

// The owner's own Rocinante node, verbatim from the save (trimmed to the fields that place it).
const ROCI: any = {
  kind: 'construct', roleHint: 'ship', id: 'sol-rocinante', parentId: 'solar-system-sun',
  name: 'Rocinante', icon_type: 'triangle', icon_color: '#891515', tags: [],
  orbit: {
    hostId: 'solar-system-sun', hostMu: 132751826999999990000, t0: 1762339146908,
    elements: { a_AU: 3.05, e: 0.08, i_deg: 0, omega_deg: 24.9, Omega_deg: 83.2, M0_rad: 0.3157 }
  },
  scheduled_journeys: [{
    id: 'id-1787824014000-37nsvtcip', createdAtSec: '1767250575', status: 'completed', forceExecute: false,
    plans: [{
      id: 'plan-1787823913963', originId: 'sol-rocinante', targetId: 'solar-system-earth',
      startTime: 1767250575000, mode: 'Economy',
      segments: [
        { id: 'seg-accel', type: 'Accel', startTime: 1767250575000, endTime: 1767252127873.6182,
          startState: { r: { x: -2.2236053251411, y: 1.7679365868776522, z: 0 }, v: { x: -7.988596247139469e-8, y: -9.237880546206836e-8, z: 0 } },
          endState: { r: { x: -2.2236046462930648, y: 1.767890333707137, z: 0 }, v: { x: 0, y: 0 } },
          hostId: 'solar-system-sun',
          pathPoints: [ { x: -2.2236053251411, y: 1.7679365868776522, z: 0 }, { x: -2.2236046760010506, y: 1.7678923448678816, z: 0 }, { x: -2.2236046462930648, y: 1.767890333707137, z: 0 } ],
          pathTimes: [1767250575000, 1767252060357.3738, 1767252127873.6182], warnings: [], fuelUsed_kg: 1775.8 },
        { id: 'seg-coast', type: 'Coast', startTime: 1767252127873.6182, endTime: 1788241008413.5222,
          startState: { r: { x: -2.2236046462930648, y: 1.767890333707137, z: 0 }, v: { x: 0, y: 0 } },
          endState: { r: { x: -0.9635718584613234, y: 0.32333951744817535, z: 0 }, v: { x: 0, y: 0 } },
          hostId: 'solar-system-sun',
          pathPoints: [ { x: -2.2236046462930648, y: 1.767890333707137, z: 0 }, { x: -0.9948247098057578, y: 0.3455119783906519, z: 0 }, { x: -0.9635718584613234, y: 0.32333951744817535, z: 0 } ],
          pathTimes: [1767252127873.6182, 1788068968409.0967, 1788241008413.522], warnings: [], fuelUsed_kg: 0 },
        { id: 'seg-brake', type: 'Brake', startTime: 1788241008413.5222, endTime: 1788243433537.4978,
          startState: { r: { x: -0.9635718584613234, y: 0.32333951744817535, z: 0 }, v: { x: 0, y: 0 } },
          endState: { r: { x: -0.9631237992247251, y: 0.3230244189864433, z: 0 }, v: { x: -2.39792580379664e-8, y: -1.511502186574907e-7, z: 0 } },
          hostId: 'solar-system-sun',
          pathPoints: [ { x: -0.9635718584613234, y: 0.32333951744817535, z: 0 }, { x: -0.9631432845145627, y: 0.3230381204134851, z: 0 }, { x: -0.9631237992247251, y: 0.3230244189864433, z: 0 } ],
          pathTimes: [1788241008413.522, 1788243328097.325, 1788243433537.4978], warnings: [], fuelUsed_kg: 2772.2 }
      ],
      burns: [], totalDeltaV_ms: 39057.76, totalTime_days: 242.97, totalFuel_kg: 4548.03,
      distance_au: 1.917, isValid: true, maxG: 1, accelRatio: 0.0000739, brakeRatio: 0.000115,
      interceptSpeed_ms: 0, arrivalVelocity_ms: 7808.94, arrivalPlacement: 'lo', tags: [],
      planType: 'Efficiency', name: 'Efficient Now'
    }]
  }],
  vector_position_au: { x: 0.2623539745752312, y: 0.9600935794339746 },
  vector_velocity_ms: { x: -36409.72370077863, y: 9793.276294553558 },
  vector_epoch_ms: 1843648394000,
  flight_state: 'Orbiting'
};

function systemWithRoci() {
  const sys = JSON.parse(JSON.stringify(base));
  sys.nodes = sys.nodes.filter((n: any) => n.kind !== 'construct');
  sys.nodes.push(JSON.parse(JSON.stringify(ROCI)));
  return sys;
}

/** What slimNode does to a construct on its way to a player. */
function slim(n: any) {
  const out = JSON.parse(JSON.stringify(n));
  const route = compactRoute(out);
  if (route) out.route = route;
  delete out.scheduled_journeys;
  return out;
}

const km = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)) * AU_KM;

describe('B96 - the fault, on a node that was never repaired (the state of every save until today)', () => {
  it('the GM sees it orbiting and the player sees it stopped', () => {
    const T = 1843648394000;            // the vector's own epoch — "now" on the GM's clock
    const HOUR = 3600 * 1000;
    const sys = systemWithRoci();
    const roci = sys.nodes.find((n: any) => n.id === 'sol-rocinante');
    const earth = sys.nodes.find((n: any) => n.id === 'solar-system-earth');
    console.log('earth node present:', !!earth);

    // --- GM: has the journeys, so samplePostJourneyState gives it a live parking orbit.
    const g0 = sampleJourneyKinematicsAtTime(sys, roci, T);
    const g1 = sampleJourneyKinematicsAtTime(sys, roci, T + HOUR);
    console.log('GM   t+0h :', g0 ? `${g0.state} r=${Math.hypot(g0.position_au.x, g0.position_au.y).toFixed(5)} AU` : 'null');
    console.log('GM   t+1h :', g1 ? `${g1.state} r=${Math.hypot(g1.position_au.x, g1.position_au.y).toFixed(5)} AU` : 'null');
    if (g0 && g1) console.log('GM   moved :', km(g0.position_au, g1.position_au).toFixed(1), 'km in an hour');

    // --- PLAYER: journeys stripped. No sampler (a scrubbing player), which is the common case.
    const psys = JSON.parse(JSON.stringify(sys));
    const i = psys.nodes.findIndex((n: any) => n.id === 'sol-rocinante');
    psys.nodes[i] = slim(psys.nodes[i]);
    console.log('player node keeps: route=', !!psys.nodes[i].route, ' vector=', !!psys.nodes[i].vector_position_au,
                ' journeys=', !!psys.nodes[i].scheduled_journeys, ' parentId=', psys.nodes[i].parentId);

    const p0 = computeWorldPositions3D(psys, T)!.get('sol-rocinante')!;
    const p1 = computeWorldPositions3D(psys, T + HOUR)!.get('sol-rocinante')!;
    console.log('PLR  t+0h :', `r=${Math.hypot(p0.x, p0.y).toFixed(5)} AU`);
    console.log('PLR  t+1h :', `r=${Math.hypot(p1.x, p1.y).toFixed(5)} AU`);
    console.log('PLR  moved:', km(p0, p1).toFixed(1), 'km in an hour');

    // How far apart are GM and player right now?
    if (g0) console.log('GM vs PLR at t+0h:', km(g0.position_au, p0).toFixed(1), 'km');
    if (g1) console.log('GM vs PLR at t+1h:', km(g1.position_au, p1).toFixed(1), 'km');

    // THE OWNER'S HYPOTHESIS: the ship is frozen at the point it arrived, and EARTH HAS MOVED ON,
    // because the two views are not on the same clock. Measure the gap as a function of how far the
    // player's clock lags the GM's.
    for (const lagDays of [0, 1, 7, 30, 90, 182]) {
      const tPlayer = T - lagDays * 86400000;
      const ep = computeWorldPositions3D(sys, tPlayer)!.get('solar-system-earth')!;
      console.log(`LAG ${String(lagDays).padStart(3)}d : frozen ship -> Earth = ${(km(p0, ep)/1000).toFixed(0)}k km`);
    }

    // And where is Earth, for scale?
    const ep = computeWorldPositions3D(sys, T)!.get('solar-system-earth');
    if (ep && g0) console.log('GM ship  -> Earth:', km(g0.position_au, ep).toFixed(1), 'km');
    if (ep) console.log('PLR ship -> Earth:', km(p0, ep).toFixed(1), 'km');

    // THE FAULT, pinned. The GM's parking orbit really moves...
    expect(g0, 'the GM lost track of the ship entirely').toBeTruthy();
    expect(g1).toBeTruthy();
    expect(g0!.state).toBe('Orbiting');
    expect(km(g0!.position_au, g1!.position_au)).toBeGreaterThan(10_000);
    // ...and the player's does not move at all. Not 'moves a little' - exactly zero, because it is one
    // stamped point being read twice.
    expect(km(p0, p1)).toBeLessThan(1);
    // Both agree on WHERE, at the same instant - the ship is at Earth on both. The fault is motion,
    // not placement, which is why it reads as 'stuck in space at its destination'.
    expect(km(g0!.position_au, p0)).toBeLessThan(20_000);

    // AND THE COST OF A CLOCK THAT DRIFTS. Worlds are closed-form and stay correct; the frozen ship
    // does not, so the gap to the world it is parked at grows with the divergence. One DAY is already
    // millions of km, which is why the existing one-hour `clockAdrift` threshold is well chosen.
    const earthAt = (t: number) => computeWorldPositions3D(sys, t)!.get('solar-system-earth')!;
    expect(km(p0, earthAt(T))).toBeLessThan(20_000);
    expect(km(p0, earthAt(T - 86400000))).toBeGreaterThan(1_000_000);
  });
});

describe('B96 - inverted: the repaired node moves, matches the GM, and needs no clock lock', () => {
  it('a healed ship orbits for a player holding nothing but the node', () => {
    const T = 1843648394000;
    const HOUR = 3600 * 1000;
    const sys = systemWithRoci();
    const roci = sys.nodes.find((n: any) => n.id === 'sol-rocinante');

    // Exactly what SystemView's display-time tick now does to it.
    const healed: any = reconcileConstructArrival(sys, roci, T);
    expect(healed).not.toBe(roci);
    sys.nodes[sys.nodes.findIndex((n: any) => n.id === 'sol-rocinante')] = healed;

    const psys = JSON.parse(JSON.stringify(sys));
    const i = psys.nodes.findIndex((n: any) => n.id === 'sol-rocinante');
    psys.nodes[i] = slim(psys.nodes[i]);
    console.log('healed player node keeps: vector=', !!psys.nodes[i].vector_position_au,
                ' journeys=', !!psys.nodes[i].scheduled_journeys, ' parentId=', psys.nodes[i].parentId);

    const p0 = computeWorldPositions3D(psys, T)!.get('sol-rocinante')!;
    const p1 = computeWorldPositions3D(psys, T + HOUR)!.get('sol-rocinante')!;
    console.log('PLR moved:', km(p0, p1).toFixed(0), 'km in an hour (was 0.0)');

    // THE INVERSION. Where the fault pinned `< 1 km`, the fix requires real orbital motion.
    expect(km(p0, p1)).toBeGreaterThan(10_000);

    // ...and it agrees with the GM, who is still reading the journeys.
    const g0 = sampleJourneyKinematicsAtTime(sys, healed, T);
    expect(g0).toBeTruthy();
    console.log('GM vs PLR:', km(g0!.position_au, p0).toFixed(0), 'km');
    expect(km(g0!.position_au, p0)).toBeLessThan(20_000);

    // THE ONE THAT RETIRES THE CLOCK LOCK AS A MATTER OF CORRECTNESS. The fault grew to millions of
    // km after a single day of drift; a Keplerian orbiter is right at any time at all.
    const earthAt = (t: number) => computeWorldPositions3D(psys, t)!.get('solar-system-earth')!;
    const shipAt = (t: number) => computeWorldPositions3D(psys, t)!.get('sol-rocinante')!;
    for (const lagDays of [1, 30, 365]) {
      const t = T - lagDays * 86400000;
      console.log(`LAG ${String(lagDays).padStart(3)}d : healed ship -> Earth = ${km(shipAt(t), earthAt(t)).toFixed(0)} km`);
      expect(km(shipAt(t), earthAt(t))).toBeLessThan(20_000);
    }
  });
});
