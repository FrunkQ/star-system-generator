import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import BodyAtmosphereTab from './BodyAtmosphereTab.svelte';
import { starmapStore } from '$lib/starmapStore';
import type { CelestialBody, RulePack, Starmap, System } from '$lib/types';

vi.mock('$lib/core/SystemProcessor', () => ({ systemProcessor: { process: (s: unknown) => s } }));

// G7. The recipe MATHS is covered by giantRecipe.spec; this covers the WIRING, which is the half a
// unit test on a pure function cannot reach and which no browser was available to look at.
const pack = () => ({
  distributions: { atmosphere_composition: { entries: [
    { weight: 20, value: { name: 'Earth-like', pressure_range_bar: [0.8, 1.2], composition: { N2: 0.78, O2: 0.21 } } }
  ] } },
  gasPhysics: { H2: { molarMass: 0.002 }, He: { molarMass: 0.004 }, CH4: { molarMass: 0.016 } }
} as unknown as RulePack);

const body = (over: Partial<CelestialBody> = {}) => ({
  id: 'b1', name: 'Test Giant', kind: 'body', roleHint: 'planet',
  temperatureK: 210, atmosphere: undefined, magneticField: { strengthGauss: 0 }, tags: [],
  ...over
} as unknown as CelestialBody);

const RECIPE = JSON.stringify({
  atmosphere: { pressure_bar: 1, composition: { H2: 0.857128, He: 0.139532, CH4: 0.003 } },
  requires: { temperatureK: 165, equilibriumTempK: 110 }
});

const mount = (b: CelestialBody) =>
  render(BodyAtmosphereTab, { props: { body: b, rulePack: pack(), system: { nodes: [] } as unknown as System } });

const openPanel = async (c: HTMLElement) => {
  const toggle = [...c.querySelectorAll('button')].find((x) => /Import recipe/.test(x.textContent ?? ''))!;
  await fireEvent.click(toggle);
  return c.querySelector('textarea') as HTMLTextAreaElement;
};
const importBtn = (c: HTMLElement) =>
  [...c.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Import') as HTMLButtonElement;

describe('G7 — importing a recipe on the atmosphere tab', () => {
  beforeEach(() => starmapStore.set({ id: 'sm', name: 'M', systems: [], routes: [] } as unknown as Starmap));

  it('offers the control and a link to the gallery it comes from', () => {
    const { container } = mount(body());
    expect([...container.querySelectorAll('button')].some((b) => /Import recipe/.test(b.textContent ?? ''))).toBe(true);
    const link = container.querySelector('a.recipe-link') as HTMLAnchorElement;
    expect(link?.getAttribute('href')).toBe('/discgallery#giant-lab');
  });

  it('MINTS A CAMPAIGN PRESET and applies the chemistry to this body', async () => {
    const b = body();
    const { container } = mount(b);
    const ta = await openPanel(container);
    await fireEvent.input(ta, { target: { value: RECIPE } });
    await fireEvent.click(importBtn(container));

    const entries = get(starmapStore)?.rulePackOverrides?.atmosphereCompositions as { value: Record<string, unknown> }[];
    expect(entries).toBeTruthy();
    // Minted from the EFFECTIVE list, so the pack's own preset is still there — dropping it would
    // silently delete every preset the GM had already edited.
    expect(entries.map((e) => e.value.name)).toContain('Earth-like');
    const minted = entries.find((e) => e.value.name !== 'Earth-like')!;
    expect(minted.value.composition).toEqual({ H2: 0.857128, He: 0.139532, CH4: 0.003 });
    expect(minted.value.pressure_range_bar).toEqual([1, 1]);

    expect(b.atmosphere?.composition).toEqual({ H2: 0.857128, He: 0.139532, CH4: 0.003 });
    expect(b.atmosphere?.pressure_bar).toBe(1);
    expect(b.atmosphere?.main).toBe('H2'); // the dominant gas, not the first key
  });

  it('SAYS the temperature it cannot set, and which way to move the world', async () => {
    // The whole point of the split recipe: temperature is derived from star and orbit, so the import
    // reports the condition instead of pretending to apply it. 210 K world, 165 K recipe.
    const { container } = mount(body({ temperatureK: 210 } as Partial<CelestialBody>));
    const ta = await openPanel(container);
    await fireEvent.input(ta, { target: { value: RECIPE } });
    await fireEvent.click(importBtn(container));
    const msg = container.querySelector('.recipe-msg')?.textContent ?? '';
    expect(msg).toMatch(/165 K/);
    expect(msg).toMatch(/210 K/);
    expect(msg).toMatch(/further out/);
  });

  it('says so when the world already matches, rather than warning about nothing', async () => {
    const { container } = mount(body({ temperatureK: 167 } as Partial<CelestialBody>));
    const ta = await openPanel(container);
    await fireEvent.input(ta, { target: { value: RECIPE } });
    await fireEvent.click(importBtn(container));
    expect(container.querySelector('.recipe-msg')?.textContent ?? '').toMatch(/close enough/i);
  });

  it('reports a bad paste instead of failing silently', async () => {
    const { container } = mount(body());
    const ta = await openPanel(container);
    await fireEvent.input(ta, { target: { value: 'not json' } });
    await fireEvent.click(importBtn(container));
    expect(container.querySelector('.recipe-msg.bad')?.textContent ?? '').toMatch(/valid JSON/i);
    expect(get(starmapStore)?.rulePackOverrides?.atmosphereCompositions).toBeUndefined();
  });

  it('does not collide when the same recipe is imported twice', async () => {
    const { container } = mount(body());
    for (let i = 0; i < 2; i++) {
      const ta = await openPanel(container);
      await fireEvent.input(ta, { target: { value: RECIPE } });
      await fireEvent.click(importBtn(container));
    }
    const names = (get(starmapStore)!.rulePackOverrides!.atmosphereCompositions as { value: { name: string } }[])
      .map((e) => e.value.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
