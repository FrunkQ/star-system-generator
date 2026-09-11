import { describe, it, expect } from 'vitest';
import { uniqueSystemId, dedupeSystemIds } from './systemIds';
import { validateStarmap } from '$lib/utils';

/**
 * A107. The owner's map of 2026-09-11 carried the two bundled Sol examples, both with the stable id
 * `solar-system`; the save went out and the next load refused the whole campaign with
 * "Duplicate System ID". The shape below is that file's, reduced to what matters.
 *
 * Red-first, seen: without the helper the loader's own validator rejects the map (the last test), and
 * the first two fail on the unchanged ids.
 */
const sol = (name: string, nodes = 2) => ({
  id: 'solar-system', name, position: { x: 0, y: 0 },
  system: { id: 'solar-system', name, nodes: Array.from({ length: nodes }, (_, i) => ({ id: `solar-system-body-${i}`, kind: 'body' })) },
  time: { displayTimeSec: '0' }
}) as any;

describe('a new system takes the first free spelling of its id (A107)', () => {
  it('keeps an id nobody has', () => {
    expect(uniqueSystemId('solar-system', ['trappist-1-system'])).toBe('solar-system');
  });
  it('suffixes -2, then -3, skipping suffixes already taken', () => {
    expect(uniqueSystemId('solar-system', ['solar-system'])).toBe('solar-system-2');
    expect(uniqueSystemId('solar-system', ['solar-system', 'solar-system-2'])).toBe('solar-system-3');
  });
});

describe('a map carrying duplicate system ids is repaired, not refused (A107)', () => {
  it('re-ids the SECOND Sol, outer and inner, and keeps both systems with all their bodies', () => {
    const { systems, renamed } = dedupeSystemIds([sol('Sol', 4), sol('Sol', 15)]);
    expect(systems.map((s) => s.id)).toEqual(['solar-system', 'solar-system-2']);
    expect(systems[1].system.id).toBe('solar-system-2');
    expect(systems[0].system.id).toBe('solar-system');
    expect(systems[0].system.nodes.length + systems[1].system.nodes.length, 'no body lost').toBe(19);
    expect(renamed).toEqual([{ from: 'solar-system', to: 'solar-system-2', name: 'Sol' }]);
  });
  it('returns the same array, untouched, when nothing is duplicated', () => {
    const input = [sol('Sol'), { ...sol('Kepler-22'), id: 'kepler-22-system' }];
    const { systems, renamed } = dedupeSystemIds(input);
    expect(systems).toBe(input);
    expect(renamed).toEqual([]);
  });
  it('is what makes the owner\'s map pass the loader\'s validator', () => {
    const map = { id: 'starmap-1', name: 'My Starmap', distanceUnit: 'ly', routes: [], systems: [sol('Sol', 4), sol('Sol', 15)] };
    expect(validateStarmap(map).some((e) => e.includes('Duplicate System ID')), 'the refusal this fixes').toBe(true);
    const repaired = { ...map, systems: dedupeSystemIds(map.systems).systems };
    expect(validateStarmap(repaired)).toEqual([]);
  });
});
