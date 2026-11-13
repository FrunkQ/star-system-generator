// THE EDITOR RESOLVES 'auto' PER FIELD; THE READOUT SHARES ONE RUNG. Two jobs, two answers, and
// this file exists because they look like the same job and a tidy-up would unify them.
//
// The shared-rung version was built FIRST and shipped into a live app before it was tried by hand.
// It is right for the card — a hull reads "3 × 0.02 × 0.02 km", one unit, one click target — and
// actively wrong for the editor, because a 3e11 m spine 73 m thick then puts its short axes at
// "4.879e-10 AU". That is not a number anyone can type into a box. Nothing in the unit tests said
// so; using it did.
import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import ConstructBasicsTab from './ConstructBasicsTab.svelte';
import { unitPrefs } from '$lib/unitPrefsStore';
import type { CelestialBody, RulePack } from '$lib/types';

const rulePack = { engineDefinitions: { entries: [] }, fuelDefinitions: { entries: [] } } as unknown as RulePack;

function hull(dimensionsM: number[], massKg = 5e5): CelestialBody {
  return {
    id: 'c', name: 'Test Construct', kind: 'construct', roleHint: 'construct',
    parentId: null, placement: 'Orbit', physical_parameters: { massKg, dimensionsM }, systems: {}
  } as unknown as CelestialBody;
}

/** The value + unit of each number box, in document order. */
function fields(body: CelestialBody): Array<{ value: string; unit: string }> {
  unitPrefs.set({});
  const { container } = render(ConstructBasicsTab, { props: { construct: body, rulePack } });
  return [...container.querySelectorAll('.unit-input')].map((el) => ({
    value: (el.querySelector('input') as HTMLInputElement | null)?.value ?? '',
    unit: (el.querySelector('.unit')?.textContent ?? '').trim()
  }));
}

describe('A80 — the construct editor stays typeable at every scale', () => {
  it('a long thin hull is edited at each axis\'s own scale, not the longest axis\'s', () => {
    // 3e11 m long, 73 m thick: the exact shape that a shared rung makes untypeable.
    const boxes = fields(hull([3e11, 73, 20])).filter((f) => f.unit === 'AU' || f.unit === 'm' || f.unit === 'km');
    const units = boxes.map((f) => f.unit);
    expect(units, 'the long axis reads in AU and the short ones stay in metres').toContain('AU');
    expect(units).toContain('m');
    // and no box holds a number a human could not type
    for (const f of boxes) expect(f.value, f.unit).not.toMatch(/e-/);
  });

  it('an ordinary hull still reads in one unit, because every axis is the same size', () => {
    const units = fields(hull([109, 73, 20]))
      .filter((f) => f.unit === 'AU' || f.unit === 'm' || f.unit === 'km')
      .map((f) => f.unit);
    expect(new Set(units).size).toBe(1);
    expect(units[0]).toBe('m');
  });

  it('the dry mass box speaks the mass ladder, so a megastructure is typeable too', () => {
    const boxes = fields(hull([3e11, 3e11, 3e11], 1e23));
    expect(boxes.some((f) => f.unit === 'M⊕'), 'a 1e23 kg hull is typed in Earth masses').toBe(true);
  });
});

// A HAND-WRITTEN CONSTRUCT FILE NEED NOT CARRY `physical_parameters` AT ALL (found in the bug run:
// the tab crashed on import). The guard used to run ONCE, when the tab was created, for whichever
// construct it was created with - but the side panel keeps the tab mounted and swaps the construct
// under it, so the next one selected arrived unguarded and the dimensions line threw. Seen RED
// first: "Cannot read properties of undefined (reading 'dimensionsM')" on the swap.
describe('a construct with no physical parameters is editable, not a crash', () => {
  const bare = (id: string): CelestialBody =>
    ({ id, name: 'Hand-written', kind: 'construct', roleHint: 'construct', parentId: null, placement: 'Orbit' }) as unknown as CelestialBody;

  it('opens on one: three zero dimensions and a zero mass, ready to type into', () => {
    unitPrefs.set({});
    const node = bare('a');
    const { container } = render(ConstructBasicsTab, { props: { construct: node, rulePack } });
    expect(container.querySelectorAll('.unit-input').length).toBeGreaterThanOrEqual(4);
    expect(node.physical_parameters?.dimensionsM).toEqual([0, 0, 0]);
  });

  it('survives one being SELECTED while the tab is already open, and a half-written one too', async () => {
    unitPrefs.set({});
    const { container, rerender } = render(ConstructBasicsTab, { props: { construct: hull([30, 10, 10]), rulePack } });
    const node = bare('b');
    await rerender({ construct: node, rulePack });
    expect(container.querySelectorAll('.unit-input').length).toBeGreaterThanOrEqual(4);
    expect(node.physical_parameters?.dimensionsM).toEqual([0, 0, 0]);
    const half = { ...bare('c'), physical_parameters: { massKg: 5 } } as unknown as CelestialBody;
    await rerender({ construct: half, rulePack });
    expect(half.physical_parameters?.dimensionsM).toEqual([0, 0, 0]);
    expect(half.physical_parameters?.massKg).toBe(5);
  });
});
