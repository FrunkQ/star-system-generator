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
  label: 'sodium overcast · potassium veil',
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
    // NAMED AFTER THE MIX, not the planet: the dropdown lists gas mixtures, and 'Sol XVII recipe'
    // says only where it went.
    expect(minted.value.name).toBe('sodium overcast · potassium veil');
    expect(minted.value.composition).toEqual({ H2: 0.857128, He: 0.139532, CH4: 0.003 });
    expect(minted.value.pressure_range_bar).toEqual([1, 1]);

    expect(b.atmosphere?.composition).toEqual({ H2: 0.857128, He: 0.139532, CH4: 0.003 });
    expect(b.atmosphere?.pressure_bar).toBe(1);
    expect(b.atmosphere?.main).toBe('H2'); // the dominant gas, not the first key
  });

  // ADVICE, NOT A GUARD. The owner's correction, and it is the design: importing a 700 K recipe onto a
  // 112 K world is not a mistake — the giant simply shows the decks its temperature allows. He moved
  // one in and it 'became super intense', so the useful thing to say is WHERE the colours are brightest.
  const sol = { id: 'sol', name: 'Sol', kind: 'star', roleHint: 'star',
    temperatureK: 5778, radiusKm: 695700 } as unknown as CelestialBody;
  // RENDER-S17: producer shape. An orbit is {hostId, elements:Kepler} and a node carries parentId —
  // with anything else the distance walk finds nothing, reads 0, and the advice loses its best half.
  const giant = (au: number, eqK: number) => ({
    id: 'g1', name: 'Sol XVII', kind: 'body', roleHint: 'planet', parentId: 'sol',
    temperatureK: eqK, equilibriumTempK: eqK, magneticField: { strengthGauss: 0 }, tags: [],
    orbit: { hostId: 'sol', t0: 0, hostMu: 1.327e20,
      elements: { a_AU: au, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0 } }
  } as unknown as CelestialBody);

  const importInto = async (b: CelestialBody) => {
    const system = { id: 's', name: 'Sol', nodes: [sol, b] } as unknown as System;
    const { container } = render(BodyAtmosphereTab, { props: { body: b, rulePack: pack(), system } });
    const ta = await openPanel(container);
    await fireEvent.input(ta, { target: { value: RECIPE } });
    await fireEvent.click(importBtn(container));
    return container.querySelector('.recipe-msg') as HTMLElement;
  };

  it('RECOMMENDS A DISTANCE where the colours would be brightest', async () => {
    const el = await importInto(giant(22.656, 40));
    expect(el.textContent).toMatch(/brightest/i);
    expect(el.textContent).toContain('165 K');   // the label the gallery card showed
    expect(el.textContent).toContain('40 K');     // the world's own equilibrium, quoted back
    // The actionable half: a distance, from a RATIO on the engine's own equilibrium temperature
    // (T_eq follows the inverse square), never a second copy of the formula.
    expect(el.textContent).toMatch(/roughly [0-9.]+ AU/);
    // It must NOT read as a failure. The import worked; the world is simply somewhere else.
    expect(el.classList.contains('warn')).toBe(false);
    expect(el.textContent).toMatch(/still work where it is/i);
  });

  it('says nothing to move when the world is already about right', async () => {
    const el = await importInto(giant(1.2, 110));
    expect(el.textContent).toMatch(/already about where/i);
    expect(el.textContent).not.toMatch(/bring it to/i);
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
