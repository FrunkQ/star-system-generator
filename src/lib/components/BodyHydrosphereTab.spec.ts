import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import BodyHydrosphereTab from './BodyHydrosphereTab.svelte';
import { allLiquids, liquidsLiquidInRange } from '$lib/physics/liquids';
import type { CelestialBody } from '$lib/types';

/**
 * A102. The solvent menu used to list only the liquids that are liquid somewhere on the world, so a GM
 * could not see what had been ruled out or why. Owner, 2026-09-08: *"the list of liquids on each body is
 * truncated - can you include ALL liquids on the list - the relevant ones at the top - below the
 * non-selectable ones each with a bracketed REASON why each is rejected on this planet."*
 *
 * The counts here are absolute: EVERY liquid the pack carries appears exactly once, which is the whole
 * claim. A ratio would pass with half the list missing.
 *
 * The rejects are DISABLED (owner, same day): the hydrosphere and the atmosphere are coupled, so an
 * impossible solvent chosen here corrupts a neighbour rather than merely being wrong. The escape hatch
 * belongs in Overrides, where it can fire the anomaly engine - see [[A103]].
 */
const body = (over: Partial<CelestialBody> = {}): CelestialBody => ({
  id: 'b1',
  name: 'Test',
  kind: 'body',
  roleHint: 'planet',
  temperatureK: 288,
  radiusKm: 6371,
  massKg: 5.97e24,
  atmosphere: { name: 'Test', pressure_bar: 1, composition: { N2: 0.78, O2: 0.22 } },
  ...over
} as CelestialBody);

const options = (c: HTMLElement) => Array.from(c.querySelectorAll('option')) as HTMLOptionElement[];

describe('the solvent menu lists every liquid (A102)', () => {
  it('offers EVERY liquid in the pack, each exactly once, plus None', () => {
    const { container } = render(BodyHydrosphereTab, { props: { body: body(), rulePack: null } as any });
    const values = options(container).map((o) => o.value).filter((v) => v !== 'none');
    const names = allLiquids(null).map((l) => l.name);
    expect(new Set(values)).toEqual(new Set(names));
    expect(values.length, 'no liquid appears twice').toBe(names.length);
  });

  it('puts the viable ones in their own group and the rest under a group that says why', () => {
    const { container } = render(BodyHydrosphereTab, { props: { body: body(), rulePack: null } as any });
    const groups = Array.from(container.querySelectorAll('optgroup')) as HTMLOptGroupElement[];
    const labels = groups.map((g) => g.label);
    expect(labels).toContain('Liquid somewhere on this world');
    expect(labels.some((l) => /Not liquid here/i.test(l)), 'a group for the rejects').toBe(true);
    // and the viable group really is the viable set, not everything
    const viable = groups.find((g) => g.label === 'Liquid somewhere on this world')!;
    const viableNames = Array.from(viable.querySelectorAll('option')).map((o) => (o as HTMLOptionElement).value);
    expect(viableNames.length).toBeLessThan(allLiquids(null).length);
    expect(viableNames.length).toBeGreaterThan(0);
  });

  it('gives each rejected liquid a bracketed reason, not a bare name', () => {
    const { container } = render(BodyHydrosphereTab, { props: { body: body(), rulePack: null } as any });
    const group = Array.from(container.querySelectorAll('optgroup')).find(
      (g) => /Not liquid here/i.test((g as HTMLOptGroupElement).label)
    ) as HTMLOptGroupElement;
    const texts = Array.from(group.querySelectorAll('option')).map((o) => o.textContent ?? '');
    expect(texts.length).toBeGreaterThan(0);
    for (const s of texts) expect(s, `"${s}" should carry a reason`).toMatch(/\(.+\)/);
  });

  it('a rejected liquid is shown but NOT selectable - it would corrupt the coupled atmosphere', () => {
    const { container } = render(BodyHydrosphereTab, { props: { body: body(), rulePack: null } as any });
    const group = Array.from(container.querySelectorAll('optgroup')).find(
      (g) => /Not liquid here/i.test((g as HTMLOptGroupElement).label)
    ) as HTMLOptGroupElement;
    for (const o of Array.from(group.querySelectorAll('option'))) {
      expect((o as HTMLOptionElement).disabled, 'a reject must be disabled').toBe(true);
    }
  });

  it('THE DUPLICATE THAT NEARLY SHIPPED: a rejected CURRENT selection appears once, in its own group', () => {
    // Pick a solvent that is not liquid on an Earth-like world, and make it the body's own.
    const rejected = allLiquids(null).find(
      (l) => !liquidsLiquidInRange(288, 288, null).some((v) => v.name === l.name)
    )!;
    const { container } = render(BodyHydrosphereTab, {
      props: { body: body({ hydrosphere: { composition: rejected.name, coverage: 0.5 } as any }), rulePack: null } as any
    });
    const values = options(container).map((o) => o.value);
    expect(values.filter((v) => v === rejected.name).length, 'exactly once').toBe(1);
  });
});
