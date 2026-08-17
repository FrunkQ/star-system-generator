import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { foreground, foregroundOpen, foregroundDepth, __resetForeground } from './foreground';

/**
 * A52. Each of these is a regression test for a way the chrome could get stuck hidden — which is worse
 * than the bug being fixed, because a phone GM would lose the only route to the starmap description and
 * the GM notes with no way to get it back.
 */
describe('foreground registry', () => {
  const el = () => document.createElement('div');
  beforeEach(() => __resetForeground());

  it('is closed until something registers', () => {
    expect(get(foregroundOpen)).toBe(false);
  });

  it('opens on mount and closes on destroy', () => {
    const h = foreground(el());
    expect(get(foregroundOpen)).toBe(true);
    h.destroy();
    expect(get(foregroundOpen)).toBe(false);
  });

  it('COUNTS rather than flags, so a stacked modal does not release the chrome early', () => {
    // Settings opens the A43 unit confirmation; the preset editor opens a picker. With a boolean, the
    // inner one closing would restore the chrome underneath the outer one still on screen.
    const outer = foreground(el());
    const inner = foreground(el());
    expect(get(foregroundDepth)).toBe(2);
    inner.destroy();
    expect(get(foregroundOpen)).toBe(true);
    outer.destroy();
    expect(get(foregroundOpen)).toBe(false);
  });

  it('CLAMPS AT ZERO, so a double destroy cannot hide the chrome for ever', () => {
    // HMR and route changes can tear a component down twice. Without the clamp the count goes negative,
    // the next modal brings it back to 0 rather than 1, and the chrome never reappears.
    const h = foreground(el());
    h.destroy();
    h.destroy();
    expect(get(foregroundDepth)).toBe(0);
    const next = foreground(el());
    expect(get(foregroundOpen)).toBe(true);
    next.destroy();
  });
});
