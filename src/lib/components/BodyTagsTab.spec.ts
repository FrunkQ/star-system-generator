import { render, fireEvent } from '@testing-library/svelte';
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

/**
 * "how do I REMOVE tags that are seeded from rules no longer in the pack?" - a GM, 2026-10-23, who
 * had to edit the starmap file by hand. A rule-seeded tag whose rule AND category are both gone is
 * cleared by nothing (the rules pass spares it on purpose: on a map from another GM it is their
 * tagging). It used to render as a LOCKED chip - "seeded by a rule no longer in the pack" - with no
 * way to take it off. It is now its own group, and a click removes it.
 *
 * Red-first, seen 2026-11-13: with the stranded group taken out of the tab the chip is back under
 * the rule lock with no cross, and the first two tests fail on exactly that.
 */
describe('a tag left behind by a vanished rule can be removed on the Tags tab', () => {
  const stranded = { key: 'vanishedns/ruin', source: 'rule:r-nobody-has' };
  const removable = (c: HTMLElement) => chips(c).filter((b) => b.classList.contains('active'));

  it('offers it for removal instead of locking it', () => {
    const { container } = render(BodyTagsTab, { props: { body: body([stranded]), rulePack: null } as any });
    expect(removable(container).length).toBe(1);
    expect(container.textContent).toContain('Left behind');
    expect(chips(container).filter((b) => b.classList.contains('locked')).length).toBe(0);
  });

  it('a click removes it, every copy of it, and leaves a hand-added tag of the same key alone', async () => {
    const b = body([stranded, { ...stranded }, { key: 'vanishedns/ruin', manual: true }, { key: 'spin/retrograde' }]);
    const { container } = render(BodyTagsTab, { props: { body: b, rulePack: null } as any });
    const chip = removable(container).find((x) => x.title.includes('no longer here'))!;
    expect(chip, 'the stranded chip is there, once (A104: two copies, one chip)').toBeTruthy();
    await fireEvent.click(chip);
    expect(container.textContent).not.toContain('Left behind');
    // The GM's own tag under the same key is still offered under "Yours".
    expect(removable(container).some((x) => x.title.includes('Your tag'))).toBe(true);
    expect(chips(container).length).toBe(2);   // the manual tag and the physics tag
  });

  it('does not offer a rule tag whose category still exists - the next pass clears that itself', () => {
    // `resource` is a shipped category, so the rules pass owns `resource/*` and will strip this.
    const { container } = render(BodyTagsTab, {
      props: { body: body([{ key: 'resource/unobtainium', source: 'rule:r-nobody-has' }]), rulePack: null } as any
    });
    expect(container.textContent).not.toContain('Left behind');
    expect(chips(container).filter((b) => b.classList.contains('locked')).length).toBe(1);
  });
});
