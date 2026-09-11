import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import BodyTagsTab from './BodyTagsTab.svelte';
import type { CelestialBody } from '$lib/types';

/**
 * A104. Clicking "Tags" on a body carrying the same tag key twice crashed the whole app - the owner,
 * 2026-09-11, from a starmap opened off the hub: `Uncaught TypeError: Cannot read properties of
 * undefined (reading 'prev')` inside Svelte's keyed each-block reconciler. Every list on the tab is
 * keyed by `t.key`, and a duplicate key is fatal there.
 *
 * The tab is a reader: it shows the first of a duplicated key and stays up. The same key in two
 * DIFFERENT groups (a manual override beside the physics tag it overrides) is legitimate and kept.
 *
 * Red-first, seen 2026-09-11: with the dedupe removed BOTH tests throw `each_key_duplicate` (the dev
 * spelling of the production `.prev` read above). The second test is the scope check: after the fix
 * the override and its physics copy are both still there, so the dedupe touched the crash and nothing
 * else.
 */
const body = (tags: any[]): CelestialBody => ({
  id: 'b1', name: 'Test', kind: 'body', roleHint: 'planet', temperatureK: 288, radiusKm: 6371,
  massKg: 5.97e24, tags
} as CelestialBody);

const chips = (c: HTMLElement) => Array.from(c.querySelectorAll('button.tag-chip')) as HTMLButtonElement[];

describe('the Tags tab survives a duplicated tag key (A104)', () => {
  it('renders a body with the same manual key twice, once, without throwing', () => {
    const { container } = render(BodyTagsTab, {
      props: { body: body([{ key: 'faction/red', manual: true }, { key: 'faction/red', manual: true }]), rulePack: null } as any
    });
    expect(chips(container).length).toBe(1);
  });

  it('renders a duplicated physics key once, and keeps a manual override beside its physics copy', () => {
    const { container } = render(BodyTagsTab, {
      props: {
        body: body([
          { key: 'spin/retrograde' }, { key: 'spin/retrograde' },          // same group, twice -> one chip
          { key: 'orbit/captured', manual: true, override: true },        // GM override in a physics namespace
          { key: 'orbit/captured' }                                       // the physics copy it overrides
        ]),
        rulePack: null
      } as any
    });
    const keys = chips(container).map((b) => b.textContent?.trim());
    expect(chips(container).length, 'one retrograde chip, and BOTH captured chips').toBe(3);
    expect(keys.filter((k) => k?.toLowerCase().includes('captured')).length).toBe(2);
  });
});
