// THE UNIT LABEL IS THE ONLY WAY TO CHANGE THE UNIT, SO IT MUST NEVER BE PUSHED OFF THE TILE.
//
// Reported by the owner, 2026-08-30, from a mega-construct card: a DIMENSIONS tile reading
// "160,000 × 160,000 × 160,000 km" ran past the edge of its 150px grid cell and took the unit
// button with it — clipped, unreachable, and unclickable exactly when a reader most wanted to
// change the unit. The cause was one line: `.unit-value { white-space: nowrap }`, which is right
// for a single reading and wrong for a group.
//
// The rule has two halves and BOTH are pinned here, because each is useless alone:
//   - the reading may WRAP, so a group can fall onto a second line inside its tile;
//   - a number may never be parted from its unit, or "160,000" would sit on one line and "km" on
//     the next, which is the same fault wearing a different hat.
// The break opportunities are the ordinary spaces inside the separator; the weld is the
// non-breaking space before the label. jsdom does not resolve Svelte's scoped CSS, so the
// white-space rule itself is checked against the source.
import { readFileSync } from 'fs';
import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import UnitValue from './UnitValue.svelte';
import { unitPrefs } from '$lib/unitPrefsStore';

const NBSP = '\u00a0';

function text(props: Record<string, unknown>): string {
  unitPrefs.set({});
  const { container } = render(UnitValue, { props: { bodyType: 'construct', ...props } as never });
  return container.querySelector('.unit-value')?.textContent ?? '';
}

describe('A80 — a reading may wrap; a number and its unit may not be parted', () => {
  it('the reported tile has somewhere to break, and it is never between the number and the unit', () => {
    // the exact reading from the report: a 160,000 km shell
    const s = text({ quantity: 'dimensions', values: [160000, 160000, 160000] });
    expect(s).toBe(`160,000 × 160,000 × 160,000${NBSP}km`);
    // two separators, an ordinary space either side of each: four places a browser may break
    expect(s.split(' ').length - 1, 'break opportunities between the axes').toBe(4);
    // …and exactly one weld, holding the last number to the label
    expect(s.split(NBSP).length - 1, 'the number/unit weld').toBe(1);
    expect(s.endsWith(`160,000${NBSP}km`)).toBe(true);
  });

  it('a single reading is still one unbreakable token, exactly as before', () => {
    const s = text({ quantity: 'mass', value: 450_000 });
    expect(s).toBe(`450${NBSP}t`);
    expect(s.includes(' '), 'nothing to break on').toBe(false);
  });

  it('a current/max pair breaks at its separator too', () => {
    const s = text({ quantity: 'mass', values: [5e3, 5e6], separator: ' / ' });
    expect(s).toBe(`5 / 5,000${NBSP}t`);
  });

  it('the wrap is actually permitted — the source must not pin the reading to one line', () => {
    // cwd is the project root under vitest, as giantRecipe.spec.ts already assumes
    const css = readFileSync('src/lib/components/UnitValue.svelte', 'utf8').split('<style>')[1] ?? '';
    const rule = /\.unit-value\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(rule, '.unit-value must declare a white-space').toMatch(/white-space/);
    expect(rule, 'nowrap is what clipped the unit button off the tile').not.toMatch(/nowrap|\bpre\b/);
  });
});
