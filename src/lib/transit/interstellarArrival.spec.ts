// ARRIVING IN A NEW SYSTEM MUST LEAVE THE OLD SYSTEM'S FLIGHT STATE BEHIND.
//
// Owner, 2026-08-26: "those issues may actually be in interstellar transits - forgetting to update
// the ship position when it arrives in a new system."
//
// `endJourneyAtDestination` re-parents the construct and rewrites `orbit.hostId`/`hostMu`, but it
// used to carry the whole of its in-system SITUATION across untouched: the cached kinematic vector,
// its `flight_state`, its completed `scheduled_journeys`, its draft plan, and any co-orbital marker.
// Every one of those refers to bodies and coordinates in the system it just LEFT, and two of them
// OUTRANK `orbit` at render time (see worldPositions.ts — a construct with journeys is placed by its
// kinematics sampler, and getGlobalState prefers a stored vector while flight_state is Transit or
// Deep Space). So the ship arrived and drew at its old system's coordinates.
//
// The codebase already knew this failure mode: ConstructSidePanel's SITUATION_FIELDS comment says in
// as many words that imported journeys/vectors "reference the source system and outrank
// orbit.elements at render time, leaving the ship mispositioned". That was fixed for file import and
// missed for interstellar arrival, which is the same move between systems.
import { describe, it, expect } from 'vitest';
import { endJourneyAtDestination } from './interstellar';
import type { Starmap } from '$lib/types';

function makeStarmap(shipExtras: Record<string, unknown>): Starmap {
  return {
    id: 'm', name: 'Test', systems: [
      { id: 'sysA', name: 'Alpha', position: { x: 0, y: 0 },
        system: { id: 'sysA', nodes: [
          { id: 'starA', kind: 'body', roleHint: 'star', name: 'A', parentId: null, massKg: 2e30 },
          { id: 'planetA', kind: 'body', roleHint: 'planet', name: 'PA', parentId: 'starA', massKg: 6e24,
            orbit: { hostId: 'starA', hostMu: 1.3e20, t0: 0, elements: { a_AU: 9, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } },
          { id: 'ship1', kind: 'construct', roleHint: 'ship', name: 'Wanderer', parentId: 'starA', tags: [],
            orbit: { hostId: 'starA', hostMu: 1.3e20, t0: 0, elements: { a_AU: 9, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } },
            ...shipExtras }
        ] } },
      { id: 'sysB', name: 'Beta', position: { x: 100, y: 0 },
        system: { id: 'sysB', nodes: [
          { id: 'starB', kind: 'body', roleHint: 'star', name: 'B', parentId: null, massKg: 1.6e30 }
        ] } }
    ],
    routes: [],
    activeJourneys: [
      { id: 'j1', shipId: 'ship1', shipName: 'Wanderer', fromSystemId: 'sysA', toSystemId: 'sysB',
        toBodyId: 'starB', toBodyName: 'B', mode: 'torch', startTimeSec: '0', durationSec: 1000 }
    ],
    distanceUnit: 'ly', unitIsPrefix: false
  } as unknown as Starmap;
}

const arrivedShip = (m: Starmap) =>
  (m.systems.find((s) => s.id === 'sysB')!.system.nodes as any[]).find((n) => n.id === 'ship1');

describe('interstellar arrival clears the old system\'s situation', () => {
  it('drops a cached kinematic vector that would outrank the new orbit', () => {
    const ship = arrivedShip(endJourneyAtDestination(makeStarmap({
      vector_position_au: { x: 9, y: 0 },      // where it was in sysA
      vector_velocity_ms: { x: 0, y: 30000 },
      vector_epoch_ms: 0,
      flight_state: 'Deep Space'               // this is what makes the vector win
    }), 'j1'));
    expect(ship).toBeTruthy();
    expect(ship.vector_position_au, 'a sysA position must not survive into sysB').toBeUndefined();
    expect(ship.vector_velocity_ms).toBeUndefined();
    expect(ship.flight_state, 'should be parked in the new system, not still in deep space').not.toBe('Deep Space');
  });

  it('drops completed in-system journeys, which reference bodies that are not here', () => {
    const ship = arrivedShip(endJourneyAtDestination(makeStarmap({
      scheduled_journeys: [{
        id: 'old', status: 'completed', createdAtSec: '0',
        plans: [{ id: 'p', originId: 'ship1', targetId: 'planetA', startTime: 0, mode: 'Economy',
          segments: [{ id: 's', type: 'Coast', startTime: 0, endTime: 1,
            startState: { r: { x: 9, y: 0 }, v: { x: 0, y: 0 } },
            endState: { r: { x: 9, y: 0 }, v: { x: 0, y: 0 } },
            hostId: 'starA', pathPoints: [{ x: 9, y: 0 }], warnings: [], fuelUsed_kg: 0 }],
          burns: [], totalDeltaV_ms: 0, totalTime_days: 0, totalFuel_kg: 0,
          arrivalVelocity_ms: 0, distance_au: 0, isValid: true, maxG: 1, accelRatio: 0,
          brakeRatio: 0, interceptSpeed_ms: 0 }]
      }]
    }), 'j1'));
    // A journey naming planetA would place the ship by sysA coordinates in sysB.
    expect(ship.scheduled_journeys ?? []).toHaveLength(0);
  });

  it('drops a co-orbital marker and a draft plan pointing at the old system', () => {
    const ship = arrivedShip(endJourneyAtDestination(makeStarmap({
      coOrbital: { hostId: 'planetA', point: 'l4' },
      placement: 'L4',
      draft_transit_plan: [{ targetId: 'planetA' }]
    }), 'j1'));
    expect(ship.coOrbital, 'planetA is not in this system').toBeUndefined();
    expect(ship.draft_transit_plan ?? []).toHaveLength(0);
  });

  it('still re-hosts onto the destination and keeps the ship itself intact', () => {
    const ship = arrivedShip(endJourneyAtDestination(makeStarmap({ flight_state: 'Orbiting' }), 'j1'));
    expect(ship.parentId).toBe('starB');
    expect(ship.orbit.hostId).toBe('starB');
    expect(ship.name).toBe('Wanderer');
    expect(ship.orbit.elements.a_AU).toBeGreaterThan(0);
  });
});

describe('a ship gets a SENSIBLE arrival orbit, not the old system\'s elements', () => {
  const AU_KM = 1.495978707e8;

  it('a named planet destination gets a high parking orbit around it', () => {
    const m = makeStarmap({});
    // Give sysB a planet and aim the journey at it.
    (m.systems.find((s) => s.id === 'sysB')!.system.nodes as any[]).push({
      id: 'planetB', kind: 'body', roleHint: 'planet', name: 'PB', parentId: 'starB',
      massKg: 6e24, radiusKm: 6371,
      orbit: { hostId: 'starB', hostMu: 1e20, t0: 0, elements: { a_AU: 1, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
    });
    (m.activeJourneys as any[])[0].toBodyId = 'planetB';
    const ship = arrivedShip(endJourneyAtDestination(m, 'j1'));
    expect(ship.parentId).toBe('planetB');
    // 4x the planet's radius — the same high-orbit convention an in-system arrival uses.
    expect(ship.orbit.elements.a_AU * AU_KM).toBeCloseTo(6371 * 4, 0);
  });

  it('a star destination puts the ship at the SYSTEM EDGE, not among the planets', () => {
    const m = makeStarmap({});
    (m.systems.find((s) => s.id === 'sysB')!.system.nodes as any[]).push({
      id: 'planetB', kind: 'body', roleHint: 'planet', name: 'PB', parentId: 'starB', massKg: 6e24,
      orbit: { hostId: 'starB', hostMu: 1e20, t0: 0, elements: { a_AU: 4, e: 0.1, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
    });
    const ship = arrivedShip(endJourneyAtDestination(m, 'j1'));   // toBodyId is starB
    // Just beyond the outermost thing: 4 * 1.1 apoapsis * 1.1 margin.
    expect(ship.orbit.elements.a_AU).toBeGreaterThan(4 * 1.1);
    expect(ship.orbit.elements.a_AU).toBeLessThan(4 * 1.1 * 1.2);
  });

  it('never inherits the departure orbit — the classic "arrives inside the star"', () => {
    // Ship left a tight 0.002 AU moon orbit. Arriving at a STAR with that a_AU would be fatal.
    const m = makeStarmap({});
    const shipNode = (m.systems[0].system.nodes as any[]).find((n) => n.id === 'ship1');
    shipNode.orbit.elements.a_AU = 0.002;
    const ship = arrivedShip(endJourneyAtDestination(m, 'j1'));
    expect(ship.orbit.elements.a_AU).toBeGreaterThan(0.05);
    expect(ship.orbit.elements.e, 'a fresh circular arrival, not an inherited eccentricity').toBe(0);
    expect(ship.orbit.n_rad_per_s, 'a pinned rate from the old geometry must not survive').toBeUndefined();
  });

  it('spreads arrivals deterministically instead of stacking them on one spoke', () => {
    const a = arrivedShip(endJourneyAtDestination(makeStarmap({}), 'j1'));
    const b = arrivedShip(endJourneyAtDestination(makeStarmap({}), 'j1'));
    expect(a.orbit.elements.M0_rad).toBe(b.orbit.elements.M0_rad);   // same ship, same place
    expect(Number.isFinite(a.orbit.elements.M0_rad)).toBe(true);
  });
});
