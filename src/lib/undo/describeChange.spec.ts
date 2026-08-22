// Naming the step. The words a GM reads on the undo button come from a diff of two authored
// slices, so these are the sentences the feature actually produces.
import { describe, it, expect } from 'vitest';
import { describeSystemChange } from './describeChange';
import type { System } from '$lib/types';

function sys(nodes: any[], extra: Record<string, unknown> = {}): System {
  return { id: 'sol', name: 'Sol', nodes, ...extra } as unknown as System;
}
const earth = (over: Record<string, unknown> = {}) =>
  ({ id: 'earth', kind: 'body', name: 'Earth', massKg: 5.972e24, radiusKm: 6371, ...over });
const luna = (over: Record<string, unknown> = {}) =>
  ({ id: 'luna', kind: 'body', name: 'Luna', massKg: 7.3e22, radiusKm: 1737, ...over });

describe('describeSystemChange', () => {
  it('names ONE field on ONE body, which is the common case', () => {
    expect(describeSystemChange(sys([earth()]), sys([earth({ massKg: 9e24 })]))).toBe('Mass of Earth');
  });

  it('humanises a field name rather than keeping a second list of them', () => {
    expect(describeSystemChange(sys([earth()]), sys([earth({ axial_tilt_deg: 30 })]))).toBe('Axial tilt of Earth');
    expect(describeSystemChange(sys([earth()]), sys([earth({ rotation_period_hours: 12 })]))).toBe('Rotation period of Earth');
  });

  it('uses the honest word where the field name is not one', () => {
    expect(describeSystemChange(sys([earth()]), sys([earth({ makeup: { rock: 1 } })]))).toBe('Composition of Earth');
    expect(describeSystemChange(sys([earth()]), sys([earth({ gmNotes: 'secret' })]))).toBe('GM notes of Earth');
    expect(describeSystemChange(sys([earth()]), sys([earth({ image: { url: 'x' } })]))).toBe('Picture of Earth');
  });

  it('lists two or three fields, and counts beyond that', () => {
    expect(describeSystemChange(sys([earth()]), sys([earth({ massKg: 9e24, radiusKm: 8000 })])))
      .toBe('Mass and radius of Earth');
    // Beyond three it says what it KNOWS - an edit to that body - rather than counting fields the
    // GM did not touch one by one (see the note in describeChange.ts about DERIVED_FIELDS drift).
    const four = earth({ massKg: 9e24, radiusKm: 8000, makeup: { rock: 1 }, tags: [{ key: 'plot/x' }] });
    expect(describeSystemChange(sys([earth()]), sys([four]))).toBe('Edit to Earth');
  });

  it('names an add and a delete, which are what a GM most wants named', () => {
    expect(describeSystemChange(sys([earth()]), sys([earth(), luna()]))).toBe('Added Luna');
    expect(describeSystemChange(sys([earth(), luna()]), sys([earth()]))).toBe('Deleted Luna');
    expect(describeSystemChange(sys([earth(), luna()]), sys([]))).toBe('Deleted 2 bodies');
  });

  it('counts bodies when several changed and nothing says which was the cause', () => {
    expect(describeSystemChange(sys([earth(), luna()]), sys([earth({ massKg: 9e24 }), luna({ radiusKm: 2000 })])))
      .toBe('Edits to 2 bodies');
  });

  it("NAMES THE CAUSE when the GM's selection says which body they were editing", () => {
    // One edit moves several bodies all the time: give Earth mass and tidally-locked Luna's
    // rotation period is re-derived with it. The selection is what tells cause from consequence.
    const before = sys([earth(), luna()]);
    const after = sys([earth({ massKg: 9e24 }), luna({ rotation_period_hours: 538 })]);
    expect(describeSystemChange(before, after)).toBe('Edits to 2 bodies');
    expect(describeSystemChange(before, after, 'earth')).toBe('Mass of Earth');
    expect(describeSystemChange(before, after, 'luna')).toBe('Rotation period of Luna');
  });

  it('falls back to the SYSTEM\'s own fields when no body changed', () => {
    expect(describeSystemChange(sys([earth()]), sys([earth()], { gmNotes: 'the vault' }))).toBe('GM notes of the system');
    expect(describeSystemChange(sys([earth()]), sys([earth()], { name: 'Sol II' }))).toBe('Name of the system');
  });

  it('returns nothing rather than guessing', () => {
    expect(describeSystemChange(sys([earth()]), sys([earth()]))).toBe('');
    expect(describeSystemChange(null, sys([earth()]))).toBe('');
  });
});
