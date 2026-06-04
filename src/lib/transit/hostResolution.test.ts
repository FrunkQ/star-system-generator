import { describe, it, expect } from 'vitest';
import { resolveConstructCurrentHostId } from './scheduler';
import type { CelestialBody } from '../types';

// A construct's *current* host is derived from its journeys, not its authored parentId.
// Regression for: ship transits to Earth (LEO) but the detail panel kept reading the
// authored heliocentric parentId (the Sun), so it showed "Sol: 2.50 AU" and blocked
// landing even though it was parked at Earth.

const DAY_MS = 86400 * 1000;

function journey(opts: {
  status?: string;
  startMs: number;
  durationDays: number;
  targetId: string;
  flyby?: boolean;
}) {
  const seg = {
    id: 'seg',
    type: 'Brake',
    startTime: opts.startMs,
    endTime: opts.startMs + opts.durationDays * DAY_MS,
    startState: { r: { x: 0, y: 0 }, v: { x: 0, y: 0 } },
    endState: { r: { x: 0, y: 0 }, v: { x: 0, y: 0 } },
    hostId: 'solar-system-sun',
    pathPoints: [{ x: 0, y: 0 }],
    warnings: opts.flyby ? ['Flyby'] : [],
    fuelUsed_kg: 0
  };
  return {
    id: `log-${opts.startMs}`,
    createdAtSec: '0',
    status: opts.status ?? 'completed',
    forceExecute: false,
    plans: [
      {
        id: `plan-${opts.startMs}`,
        originId: 'ship',
        targetId: opts.targetId,
        startTime: opts.startMs,
        mode: 'Fast',
        segments: [seg],
        burns: [],
        totalTime_days: opts.durationDays,
        interceptSpeed_ms: 0,
        arrivalPlacement: 'lo'
      }
    ]
  };
}

function ship(journeys: any[]): CelestialBody {
  return {
    id: 'ship',
    parentId: 'solar-system-sun',
    name: 'The Pella',
    kind: 'construct',
    scheduled_journeys: journeys
  } as unknown as CelestialBody;
}

describe('resolveConstructCurrentHostId', () => {
  it('returns the journey target once a captured arrival has completed', () => {
    const s = ship([journey({ startMs: 1000, durationDays: 7, targetId: 'solar-system-earth' })]);
    const afterArrival = 1000 + 8 * DAY_MS;
    expect(resolveConstructCurrentHostId(s, afterArrival)).toBe('solar-system-earth');
  });

  it('falls back to the authored parentId before any journey has started', () => {
    const s = ship([journey({ startMs: 10_000 * DAY_MS, durationDays: 7, targetId: 'solar-system-earth' })]);
    expect(resolveConstructCurrentHostId(s, 0)).toBe('solar-system-sun');
  });

  it('returns null while mid-transit (not captured by any host)', () => {
    const start = 1000;
    const s = ship([journey({ startMs: start, durationDays: 7, targetId: 'solar-system-earth' })]);
    const midFlight = start + 3 * DAY_MS;
    expect(resolveConstructCurrentHostId(s, midFlight)).toBeNull();
  });

  it('uses the latest completed arrival when journeys are chained', () => {
    const s = ship([
      journey({ startMs: 1000, durationDays: 7, targetId: 'solar-system-earth' }),
      journey({ startMs: 1000 + 8 * DAY_MS, durationDays: 2, targetId: 'solar-system-mars' })
    ]);
    const afterBoth = 1000 + 11 * DAY_MS;
    expect(resolveConstructCurrentHostId(s, afterBoth)).toBe('solar-system-mars');
  });

  it('ignores cancelled journeys', () => {
    const s = ship([
      journey({ status: 'cancelled', startMs: 1000, durationDays: 7, targetId: 'solar-system-earth' })
    ]);
    const afterArrival = 1000 + 8 * DAY_MS;
    expect(resolveConstructCurrentHostId(s, afterArrival)).toBe('solar-system-sun');
  });

  it('does not treat a flyby pass as a captured host', () => {
    const s = ship([
      journey({ startMs: 1000, durationDays: 7, targetId: 'solar-system-earth', flyby: true })
    ]);
    const afterPass = 1000 + 8 * DAY_MS;
    expect(resolveConstructCurrentHostId(s, afterPass)).toBe('solar-system-sun');
  });
});
