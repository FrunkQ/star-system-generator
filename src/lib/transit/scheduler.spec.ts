import { describe, it, expect } from 'vitest';
import { trimFlownAutopilotPast } from './scheduler';
import type { CelestialBody } from '$lib/types';

const DAY = 86_400_000;
const plan = (startMs: number, days: number) => ({ startTime: startMs, totalTime_days: days, segments: [] } as any);
const journey = (id: string, startDay: number, days: number, opts: { autopilot?: boolean; status?: string } = {}) => ({
  id, createdAtSec: '0', plans: [plan(startDay * DAY, days)], status: opts.status ?? 'scheduled', ...(opts.autopilot ? { autopilot: true } : {})
} as any);

function ship(journeys: any[], flightLog: any[] = []): CelestialBody {
  return { id: 's', name: 'Ship', kind: 'construct', scheduled_journeys: journeys, flight_log: flightLog } as any;
}

describe('trimFlownAutopilotPast', () => {
  it('keeps the last 2 flown autopilot legs + active/future, and NEVER trims the flight log', () => {
    const ship0 = ship(
      [
        journey('ap-old1', 0, 10, { autopilot: true }),     // end 10d  → flown, dropped (older than last 2)
        journey('ap-old2', 100, 10, { autopilot: true }),   // end 110d → flown, dropped
        journey('ap-keep1', 200, 10, { autopilot: true }),  // end 210d → flown, kept (2nd newest)
        journey('ap-keep2', 215, 10, { autopilot: true }),  // end 225d → flown, kept (newest)
        journey('ap-future', 400, 10, { autopilot: true })  // end 410d → not yet flown → kept
      ],
      [
        { id: 'e1', atSec: String(5 * 86400), kind: 'mine', text: '' },
        { id: 'e2', atSec: String(205 * 86400), kind: 'mine', text: '' }
      ]
    );
    const out = trimFlownAutopilotPast(ship0, 300 * DAY, 2); // actual = 300d; flown = legs ending < 300d
    expect((out.scheduled_journeys || []).map((l: any) => l.id)).toEqual(['ap-keep1', 'ap-keep2', 'ap-future']);
    expect((out.flight_log || []).map((e: any) => e.id)).toEqual(['e1', 'e2']); // history kept in full
  });

  it('never trims manual journeys or anything cancelled/adrift', () => {
    const ship0 = ship([
      journey('manual-old', 0, 10),                                            // manual → keep
      journey('ap-cancelled', 1, 10, { autopilot: true, status: 'cancelled' }), // adrift → keep
      journey('ap-old1', 40, 10, { autopilot: true }),                          // flown → dropped
      journey('ap-old2', 50, 10, { autopilot: true }),                          // flown → kept (last 2)
      journey('ap-old3', 60, 10, { autopilot: true })                           // flown → kept (last 2)
    ]);
    const out = trimFlownAutopilotPast(ship0, 500 * DAY, 2);
    expect((out.scheduled_journeys || []).map((l: any) => l.id)).toEqual(['manual-old', 'ap-cancelled', 'ap-old2', 'ap-old3']);
  });

  it('returns the SAME object when there are not more than keepFlown flown legs (no churn)', () => {
    const ship0 = ship([
      journey('ap1', 100, 10, { autopilot: true }),   // flown
      journey('ap2', 120, 10, { autopilot: true })    // flown — exactly 2, nothing to drop
    ]);
    const out = trimFlownAutopilotPast(ship0, 500 * DAY, 2);
    expect(out).toBe(ship0);
  });
});
