import { describe, it, expect } from 'vitest';
import type { System, CelestialBody, ConstructLogEvent } from '$lib/types';
import { deriveIncomingVisits } from './constructInteractions';

function ev(partial: Partial<ConstructLogEvent> & { id: string; kind: any; atSec: string }): ConstructLogEvent {
  return { text: '', ...partial } as ConstructLogEvent;
}

function ship(id: string, name: string, flight_log: ConstructLogEvent[]): CelestialBody {
  return { id, name, kind: 'construct', parentId: null, tags: [], flight_log } as any as CelestialBody;
}

function sys(nodes: CelestialBody[]): System {
  return { nodes } as any as System;
}

describe('deriveIncomingVisits', () => {
  it('mirrors a ship unload/refuel at a station onto the station log, oldest-first', () => {
    const station = ship('station', 'Ceres Depot', []);
    const hauler = ship('hauler', 'Chariot', [
      ev({ id: 'a', kind: 'refuel', atSec: '200', placeId: 'station' }),
      ev({ id: 'b', kind: 'unload', atSec: '100', placeId: 'station', resourceKey: 'resource/water-ice', tonnes: 120, durationSec: 3600 }),
      ev({ id: 'c', kind: 'mine', atSec: '50', placeId: 'enceladus', tonnes: 120 }), // body, not the station
    ]);
    const visits = deriveIncomingVisits(sys([station, hauler]), 'station');
    expect(visits.map((v) => v.id)).toEqual(['in-hauler-b', 'in-hauler-a']); // sorted by atSec
    expect(visits.every((v) => v.incoming && v.fromConstructId === 'hauler' && v.fromName === 'Chariot')).toBe(true);
    const unload = visits.find((v) => v.kind === 'unload')!;
    expect(unload.tonnes).toBe(120);
    expect(unload.placeId).toBe('station'); // still points at the target so the pane can time-filter it
  });

  it('excludes the target\'s own events and non-interaction kinds, and returns [] for a plain body', () => {
    const station = ship('station', 'Depot', [ev({ id: 'own', kind: 'unload', atSec: '10', placeId: 'station' })]);
    const hauler = ship('hauler', 'Chariot', [
      ev({ id: 'd', kind: 'depart', atSec: '90', placeId: 'station' }),  // self-doing, never mirrored
      ev({ id: 'e', kind: 'load', atSec: '110', placeId: 'station', tonnes: 40 }),
    ]);
    const body: CelestialBody = { id: 'enceladus', name: 'Enceladus', kind: 'body', parentId: null, tags: [] } as any;
    const system = sys([station, hauler, body]);
    const visits = deriveIncomingVisits(system, 'station');
    expect(visits.map((v) => v.id)).toEqual(['in-hauler-e']); // own 'own' excluded; 'depart' excluded
    expect(deriveIncomingVisits(system, 'enceladus')).toEqual([]); // a natural body is visited via mine, not mirrored
  });
});
