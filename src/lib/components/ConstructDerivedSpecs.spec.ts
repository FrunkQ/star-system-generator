// THE CONSTRUCT CARD ITSELF, RENDERED — because A80 was a rendering fault and no test mounted this
// panel. The unit ladders are pinned in `units.spec.ts`; what those pins CANNOT say is whether the
// card actually calls them. It did not: `ConstructDerivedSpecs` formatted its own tonnages with
// `Math.round(t).toLocaleString()` and its own dimensions with `dimensionsM.join(' x ')`, so the
// first mega-construct in the wild printed a twenty-one digit dry mass and 2 AU as raw metres while
// every ladder test in the suite stayed green.
//
// These are deliberately shallow, in the shape BodyTechnicalDetails.spec.ts established: they do not
// assert wording or layout, they assert that the numbers on the card went through the unit system.
import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import ConstructDerivedSpecs from './ConstructDerivedSpecs.svelte';
import { unitPrefs } from '$lib/unitPrefsStore';
import type { CelestialBody, RulePack } from '$lib/types';

const rulePack = {
  engineDefinitions: { entries: [] },
  fuelDefinitions: { entries: [] }
} as unknown as RulePack;

function construct(massKg: number, dimensionsM: number[]): CelestialBody {
  return {
    id: 'c', name: 'Test Construct', kind: 'construct', roleHint: 'construct',
    parentId: null, placement: 'Orbit', flight_state: 'Orbiting',
    physical_parameters: { massKg, dimensionsM }, systems: {},
    crew: { current: 0, max: 0 }
  } as unknown as CelestialBody;
}

function normalise(t: string | null): string {
  return (t ?? '').replace(/\u00a0/g, ' ');
}

function cardText(body: CelestialBody): string {
  unitPrefs.set({}); // defaults, exactly as a fresh campaign renders
  const { container } = render(ConstructDerivedSpecs, {
    props: { construct: body, rulePack, hostBody: null, showPortrait: false }
  });
  // <UnitValue> joins its number and unit with a non-breaking space so they never wrap apart;
  // normalise it here so assertions read like the card does.
  return normalise(container.textContent);
}

describe('A80 — the construct card reads its numbers through the unit system', () => {
  // The card from the report: a Dyson sphere of 1e20 t, 3e11 m across. It showed
  // "DRY MASS 100,000,000,000,000,010,0… t" and "DIMENSIONS 300000000000 x … m".
  it('the mega-construct that produced the report no longer overflows its tile', () => {
    const text = cardText(construct(1.0000000000000001e23, [3e11, 3e11, 3e11]));

    // the mass reads as a comparison a GM can hold, not a wall of digits
    expect(text).toContain('M⊕');
    expect(text).not.toContain('300000000000');
    // NOTHING on the card is a long digit run any more — this is the fault, stated directly
    expect(text.replace(/[\s,]/g, '')).not.toMatch(/\d{10}/);

    // and 3e11 m says what it is
    expect(text).toContain('AU');
  });

  it('a corvette still reads in metres and tonnes — the ladder must not inflate small craft', () => {
    const text = cardText(construct(500_000, [46, 12, 9]));
    expect(text).toMatch(/500\s*t/);
    expect(text).toMatch(/46\s*×\s*12\s*×\s*9\s*m/);
    expect(text).not.toContain('AU');
  });

  // A LONG THIN HULL IS THE TEST, and it took a falsification pass to find that out: on a hull whose
  // axes are all the same size, letting each axis pick its own rung looks identical to sharing one.
  // A 3 km tether 20 m thick separates them — per-axis rungs print the number 20 under a "km" label,
  // which is not a rounding difference, it is a hundred-and-fiftyfold lie.
  //
  // It also pins WHICH rung the group takes: the middle of it, not the largest. Under "largest" the
  // same hull reads "3 × 0.02 × 0.02 km" — correct, shared, and two of its three axes unreadable.
  it('the hull is ONE reading: the three axes share a rung, and every axis stays readable', () => {
    const text = cardText(construct(1e9, [3000, 20, 20]));
    expect(text).toContain('3,000 × 20 × 20 m');
  });

  it('a GM who pins a unit gets it everywhere that quantity appears', () => {
    unitPrefs.set({
      'mass:construct': 't', 'dimensions:construct': 'km',
      'volume:construct': 'km3', 'power:construct': 'GW'
    });
    const { container } = render(ConstructDerivedSpecs, {
      props: { construct: construct(500_000, [46, 12, 9]), rulePack, hostBody: null, showPortrait: false }
    });
    const text = normalise(container.textContent);
    // every swept tile followed the pin — the dimensions, volume and power tiles each had their own
    // hardcoded unit before A80, and a pinned pref is the cheapest way to prove they no longer do
    expect(text).toContain('km');
    expect(text).toContain('km³');
    expect(text).toContain('GW');
    expect(text).not.toContain(' m ');
    unitPrefs.set({});
  });
});
