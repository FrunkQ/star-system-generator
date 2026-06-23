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
  it('drops autopilot legs ended beyond the retention window, keeps active/future/recent + the flight log', () => {
    const ship0 = ship(
      [
        journey('ap-old1', 0, 10, { autopilot: true }),    // end 10d  → drop
        journey('ap-old2', 100, 10, { autopilot: true }),  // end 110d → drop
        journey('ap-recent', 200, 10, { autopilot: true }), // end 210d → keep (within 30d of actual)
        journey('ap-active', 215, 10, { autopilot: true })  // end 225d → keep (ends ahead of actual)
      ],
      [
        { id: 'e1', atSec: String(5 * 86400), kind: 'mine', text: '' },    // 5d  → drop
        { id: 'e2', atSec: String(205 * 86400), kind: 'mine', text: '' }   // 205d → keep
      ]
    );
    const out = trimFlownAutopilotPast(ship0, 220 * DAY, 30 * DAY); // cutoff = 190d
    expect((out.scheduled_journeys || []).map((l: any) => l.id)).toEqual(['ap-recent', 'ap-active']);
    expect((out.flight_log || []).map((e: any) => e.id)).toEqual(['e2']);
  });

  it('never trims manual journeys or anything cancelled/adrift', () => {
    const ship0 = ship([
      journey('manual-old', 0, 10),                                  // manual (no autopilot flag) → keep
      journey('ap-cancelled', 1, 10, { autopilot: true, status: 'cancelled' }), // adrift → keep
      journey('ap-old', 50, 10, { autopilot: true })                 // end 60d → drop
    ]);
    const out = trimFlownAutopilotPast(ship0, 500 * DAY, 30 * DAY);
    expect((out.scheduled_journeys || []).map((l: any) => l.id)).toEqual(['manual-old', 'ap-cancelled']);
  });

  it('returns the SAME object when nothing is old enough to trim (no churn)', () => {
    const ship0 = ship([journey('ap', 100, 10, { autopilot: true })]); // end 110d, actual 115d, retain 30d
    const out = trimFlownAutopilotPast(ship0, 115 * DAY, 30 * DAY);
    expect(out).toBe(ship0);
  });
});
