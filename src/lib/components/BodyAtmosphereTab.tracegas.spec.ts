import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import BodyAtmosphereTab from './BodyAtmosphereTab.svelte';
import { starmapStore } from '$lib/starmapStore';
import type { CelestialBody, RulePack, Starmap, System } from '$lib/types';

vi.mock('$lib/core/SystemProcessor', () => ({ systemProcessor: { process: (s: unknown) => s } }));

// B100 — A TRACE GAS MUST SURVIVE BEING LOOKED AT.
//
// The number box beside each gas rendered `(fraction * 100).toFixed(3)` and its `on:blur` wrote that
// DISPLAYED string straight back. Anything under 0.0005 % displays as '0.000' at three fixed
// decimals, so focusing the field and leaving it again wrote zero — deleting the gas with no edit
// made and no warning. On the reporter's own Jupiter, SIX of eight gases sat below that floor.
//
// The composition here is his, to the figure: the fault was found against it and the gate should
// fail if anyone reintroduces fixed-decimal rendering or an unconditional write-back.
const pack = () => ({
  gasPhysics: {
    H2: { molarMass: 0.002 }, He: { molarMass: 0.004 }, CH4: { molarMass: 0.016 },
    N2: { molarMass: 0.028 }, O2: { molarMass: 0.032 }, CO2: { molarMass: 0.044 },
    Ne: { molarMass: 0.020 }, Ar: { molarMass: 0.040 }, Xe: { molarMass: 0.131 }
  }
} as unknown as RulePack);

// A real trace set. The reporter's own Jupiter bottoms out at 0.002 %, which three fixed decimals
// happen to render exactly — so it does NOT trigger the deletion, and a gate built on his numbers
// alone passes with the bug still in. What bites is anything below 0.0005 %, which is ordinary
// atmospheric chemistry: Earth's methane is 1.8 ppm and its xenon 0.087 ppm.
const AIR = {
  N2: 0.78084, O2: 0.209476, Ar: 0.00934, CO2: 0.000412,
  Ne: 0.00001818, CH4: 0.0000018, Xe: 0.00000087
};

const body = () => ({
  id: 'b1', name: 'Earthlike', kind: 'body', roleHint: 'planet',
  temperatureK: 165, magneticField: { strengthGauss: 0 }, tags: [],
  atmosphere: { name: 'Air', pressure_bar: 1, composition: { ...AIR } }
} as unknown as CelestialBody);

const mount = (b: CelestialBody) =>
  render(BodyAtmosphereTab, { props: { body: b, rulePack: pack(), system: { nodes: [] } as unknown as System } });

// The per-gas controls live behind the Advanced Composition Editor disclosure.
const openAdvanced = async (c: HTMLElement) => {
  const toggle = [...c.querySelectorAll('.advanced-toggle')].find(
    (x) => /Advanced Composition Editor/.test(x.textContent ?? '')
  )!;
  await fireEvent.click(toggle);
};

const numberBoxes = (c: HTMLElement) =>
  [...c.querySelectorAll('input.gas-val-input')] as HTMLInputElement[];

describe('B100 — the gas number box must not delete what it displays', () => {
  beforeEach(() => starmapStore.set({ id: 'sm', name: 'M', systems: [], routes: [] } as unknown as Starmap));

  it('shows every trace gas with enough significant figures to read it', async () => {
    const { container } = mount(body());
    await openAdvanced(container);
    const shown = numberBoxes(container).map((i) => i.value);
    // Not one of them may render as a bare zero: each of these gases is really there.
    expect(shown.length).toBeGreaterThanOrEqual(Object.keys(AIR).length);
    expect(shown.filter((v) => parseFloat(v) === 0)).toEqual([]);
    // Xenon at 0.087 ppm is 0.000087 % — three fixed decimals render that as '0.000'.
    expect(shown).toContain('0.000087');
  });

  it('LEAVES THE VALUE ALONE when the box is blurred without an edit — the actual data loss', async () => {
    const b = body();
    const { container } = mount(b);
    await openAdvanced(container);
    for (const box of numberBoxes(container)) {
      // Exactly what a click-in/click-out does: hand back the string already on screen.
      await fireEvent.blur(box, { target: { value: box.value } });
    }
    for (const [gas, frac] of Object.entries(AIR)) {
      expect(b.atmosphere!.composition[gas], `${gas} was destroyed by a blur`).toBeCloseTo(frac, 12);
    }
  });

  it('still accepts a real edit', async () => {
    const b = body();
    const { container } = mount(b);
    await openAdvanced(container);
    const box = numberBoxes(container)[0];
    const before = b.atmosphere!.composition.N2;
    await fireEvent.change(box, { target: { value: '80' } });
    expect(b.atmosphere!.composition.N2).not.toBeCloseTo(before, 6);
  });
});
