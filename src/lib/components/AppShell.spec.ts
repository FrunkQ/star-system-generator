import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import AppShell from './AppShell.svelte';

// Slot content is hard to drive without a wrapper; these cover the structural branch
// (which layout renders) and the forceMode override. NB: empty slots are NOT rendered
// ({#if $$slots.x}), so with no slot content only the always-present chrome shows:
// desktop -> .area.canvas; phone -> .canvas-full + .rail-toggle.

describe('AppShell', () => {
  it('renders the desktop grid when forced to desktop', () => {
    const { container } = render(AppShell, { props: { forceMode: 'desktop' } });
    const shell = container.querySelector('.app-shell')!;
    expect(shell.getAttribute('data-mode')).toBe('desktop');
    expect(container.querySelector('.area.canvas')).toBeTruthy();
    // rail/detail are gated on slot content (none provided here).
    expect(container.querySelector('.area.rail')).toBeNull();
    expect(container.querySelector('.area.detail')).toBeNull();
    // No phone-only chrome.
    expect(container.querySelector('.rail-toggle')).toBeNull();
    expect(container.querySelector('.bottom-sheet')).toBeNull();
  });

  it('renders the phone layout (full-bleed canvas) when forced to phone', () => {
    const { container } = render(AppShell, { props: { forceMode: 'phone' } });
    const shell = container.querySelector('.app-shell')!;
    expect(shell.getAttribute('data-mode')).toBe('phone');
    expect(container.querySelector('.canvas-full')).toBeTruthy();
    // The old rail-toggle hamburger is gone; the + menu-fab opens the rail but is gated
    // on a rail slot (none provided here), so neither is present.
    expect(container.querySelector('.rail-toggle')).toBeNull();
    expect(container.querySelector('.menu-fab')).toBeNull();
    // Sheet is gated on the detail slot (none provided here).
    expect(container.querySelector('.bottom-sheet')).toBeNull();
    // No desktop grid areas.
    expect(container.querySelector('.area.rail')).toBeNull();
  });
});
