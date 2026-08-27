// HEALING AN ARRIVED SHIP IS THE ONE FIX FOR FOUR SYMPTOMS.
//
// `reconcileConstructArrival` rewrites a construct's `parentId` and `orbit` to the host its journey
// actually reached. What this spec pins is the CONSEQUENCE, which is bigger than it looks: once healed,
// a parked ship is an ordinary Keplerian orbiter, and a player holding nothing but the node can place
// it correctly AT ANY CLOCK - a year adrift included. No journeys, no stamped vector, no compact
// parked descriptor needed.
//
// Owner, 2026-08-27, arriving at this himself: *"That fix may also fix the ship appearing to orbit
// Earth once done... letting the players have their clock back."* It does, and this measures it.
//
// THE FOUR SYMPTOMS, all from one stale node:
//   1. the ship is frozen on a player view ([[B96]])
//   2. the panel says host Earth beside an orbital period of 5.33 YEARS - the old Sol orbit
//   3. the body picker says 'orbits Sol' while the panel says 'Earth: Far Orbit'
//   4. players must be locked to the GM's clock for a ship to look right
//
// AND WHY IT IS THE NORMAL STATE RATHER THAN AN EDGE CASE: reconcile keys off ACTUAL time
// (`masterTimeSec`), which is written ONLY by the Settings time-shift control. Playing or scrubbing
// the clock moves `displayTimeSec` and never touches it - so in ordinary play the heal never fires.
// That is the open question on [[G49]], not something this spec asserts either way.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { reconcileConstructArrival, resolveConstructCurrentHostId } from './scheduler';
import { computeWorldPositions3D } from '../physics/worldPositions';
import { compactRoute } from '../constructs/shipRoute';

const AU_KM = 1.495978707e8;
const base = JSON.parse(fs.readFileSync(path.resolve('static/examples/Sol_Expanse-System.json'), 'utf-8'));

const ROCI: any = {
  kind: 'construct', roleHint: 'ship', id: 'sol-rocinante', parentId: 'solar-system-sun',
  name: 'Rocinante', tags: [],
  orbit: {
    hostId: 'solar-system-sun', hostMu: 132751826999999990000, t0: 1762339146908,
    elements: { a_AU: 3.05, e: 0.08, i_deg: 0, omega_deg: 24.9, Omega_deg: 83.2, M0_rad: 0.3157 }
  },
  scheduled_journeys: [{
    id: 'j', createdAtSec: '1767250575', status: 'completed',
    plans: [{
      id: 'p', originId: 'sol-rocinante', targetId: 'solar-system-earth',
      startTime: 1767250575000, mode: 'Economy', arrivalPlacement: 'lo',
      interceptSpeed_ms: 0, totalTime_days: 242.97, isValid: true,
      segments: [
        { id: 'a', type: 'Accel', startTime: 1767250575000, endTime: 1767252127873,
          startState: { r: { x: -2.2236, y: 1.7679, z: 0 }, v: { x: 0, y: 0 } },
          endState: { r: { x: -2.2236, y: 1.7678, z: 0 }, v: { x: 0, y: 0 } },
          hostId: 'solar-system-sun',
          pathPoints: [{ x: -2.2236, y: 1.7679, z: 0 }, { x: -2.2236, y: 1.7678, z: 0 }],
          pathTimes: [1767250575000, 1767252127873], warnings: [], fuelUsed_kg: 0 },
        { id: 'b', type: 'Brake', startTime: 1788241008413, endTime: 1788243433537,
          startState: { r: { x: -0.96357, y: 0.32333, z: 0 }, v: { x: 0, y: 0 } },
          endState: { r: { x: -0.96312, y: 0.32302, z: 0 }, v: { x: 0, y: 0 } },
          hostId: 'solar-system-sun',
          pathPoints: [{ x: -0.96357, y: 0.32333, z: 0 }, { x: -0.96312, y: 0.32302, z: 0 }],
          pathTimes: [1788241008413, 1788243433537], warnings: [], fuelUsed_kg: 0 }
      ]
    }]
  }],
  vector_position_au: { x: 0.2623539745752312, y: 0.9600935794339746 },
  vector_velocity_ms: { x: -36409.7, y: 9793.3 },
  vector_epoch_ms: 1843648394000,
  flight_state: 'Orbiting'
};

const ARRIVAL = 1788243433537;
const AFTER = 1843648394000;   // the owner's display time, well past the arrival
const km = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)) * AU_KM;

function sys() {
  const s = JSON.parse(JSON.stringify(base));
  s.nodes = s.nodes.filter((n: any) => n.kind !== 'construct');
  s.nodes.push(JSON.parse(JSON.stringify(ROCI)));
  return s;
}
/** slimNode, for a player. */
function slim(n: any) {
  const o = JSON.parse(JSON.stringify(n));
  const r = compactRoute(o);
  if (r) o.route = r;
  delete o.scheduled_journeys;
  return o;
}

describe('a healed arrival is an ordinary orbiter, and the player can follow it on any clock', () => {
  it('reconcile re-parents, re-orbits, and frees the clock', () => {
    const s = sys();
    const roci = s.nodes.find((n: any) => n.id === 'sol-rocinante');

    console.log('--- BEFORE (as saved) ---');
    console.log('parentId        :', roci.parentId);
    console.log('orbit.hostId    :', roci.orbit.hostId, ' a_AU:', roci.orbit.elements.a_AU);
    console.log('panel resolver  :', resolveConstructCurrentHostId(roci, AFTER));

    // Does reconcile fire once ACTUAL time is past the arrival?
    const healed = reconcileConstructArrival(s, roci, AFTER);
    console.log('--- AFTER reconcile at actual time past arrival ---');
    console.log('changed?        :', healed !== roci);
    console.log('parentId        :', healed.parentId);
    console.log('orbit.hostId    :', healed.orbit?.hostId, ' a_AU:', healed.orbit?.elements?.a_AU);
    const aKm = (healed.orbit?.elements?.a_AU ?? 0) * AU_KM;
    console.log('orbit radius    :', aKm.toFixed(0), 'km');
    const n = healed.orbit?.n_rad_per_s;
    if (n) console.log('period          :', (2 * Math.PI / n / 3600).toFixed(2), 'hours');
    console.log('placement       :', (healed as any).placement);

    // Now: does a PLAYER — node only, no journeys — see it orbiting Earth, and MOVING?
    const ps = sys();
    const i = ps.nodes.findIndex((n2: any) => n2.id === 'sol-rocinante');
    ps.nodes[i] = slim(healed);
    delete ps.nodes[i].vector_position_au;   // reconcile's companion clears this when a ship parks
    delete ps.nodes[i].vector_epoch_ms;

    const p0 = computeWorldPositions3D(ps, AFTER)!.get('sol-rocinante')!;
    const p1 = computeWorldPositions3D(ps, AFTER + 3600_000)!.get('sol-rocinante')!;
    const e0 = computeWorldPositions3D(ps, AFTER)!.get('solar-system-earth')!;
    const e1 = computeWorldPositions3D(ps, AFTER + 3600_000)!.get('solar-system-earth')!;
    console.log('--- PLAYER, reading the healed node only ---');
    console.log('moved in an hour:', km(p0, p1).toFixed(0), 'km');
    console.log('dist to Earth t0:', km(p0, e0).toFixed(0), 'km');
    console.log('dist to Earth t1:', km(p1, e1).toFixed(0), 'km');

    // ...and on a FREE clock, a year adrift — the mess-about mode.
    const F = AFTER + 365 * 86400000;
    const pf = computeWorldPositions3D(ps, F)!.get('sol-rocinante')!;
    const ef = computeWorldPositions3D(ps, F)!.get('solar-system-earth')!;
    console.log('free clock +1yr, dist to Earth:', km(pf, ef).toFixed(0), 'km');

    // --- THE HEAL ITSELF
    expect(healed).not.toBe(roci);
    expect(healed.parentId).toBe('solar-system-earth');
    expect(healed.orbit?.hostId).toBe('solar-system-earth');
    // A real low Earth orbit, not the 3.05 AU heliocentric one it was saved with. The panel's
    // '5.33 y' beside 'Earth: Far Orbit' was that stale figure showing through.
    expect(aKm).toBeGreaterThan(6000);
    expect(aKm).toBeLessThan(20000);
    const hours = n ? (2 * Math.PI) / n / 3600 : 0;
    expect(hours).toBeGreaterThan(1);
    expect(hours).toBeLessThan(6);

    // --- WHAT IT BUYS THE PLAYER, which is the point
    // It MOVES, from the node alone - no journeys, no stamped vector.
    expect(km(p0, p1)).toBeGreaterThan(10_000);
    // ...and it stays in its orbit rather than drifting away from the world.
    expect(km(p0, e0)).toBeLessThan(20_000);
    expect(km(p1, e1)).toBeLessThan(20_000);
    // THE ONE THAT MATTERS: a free clock a YEAR adrift still finds it in orbit. A Keplerian orbiter
    // is correct at any time, so the clock lock stops being a matter of correctness at all.
    expect(km(pf, ef)).toBeLessThan(20_000);
  });
});
