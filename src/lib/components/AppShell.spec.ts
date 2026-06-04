import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import AppShell from './AppShell.svelte';

// Slot content is hard to drive without a wrapper; these cover the structural branch
// (which layout renders) and the forceMode override, which is the testable contract.

describe('AppShell', () => {
  it('renders the desktop grid when forced to desktop', () => {
    const { container } = render(AppShell, { props: { forceMode: 'desktop' } });
    const shell = container.querySelector('.app-shell')!;
    expect(shell.getAttribute('data-mode')).toBe('desktop');
    expect(container.querySelector('.area.rail')).toBeTruthy();
    expect(container.querySelector('.area.canvas')).toBeTruthy();
    expect(container.querySelector('.area.detail')).toBeTruthy();
    // No phone-only chrome.
    expect(container.querySelector('.rail-toggle')).toBeNull();
    expect(container.querySelector('.bottom-sheet')).toBeNull();
  });

  it('renders the phone layout (sheet + hamburger) when forced to phone', () => {
    const { container } = render(AppShell, { props: { forceMode: 'phone' } });
    const shell = container.querySelector('.app-shell')!;
    expect(shell.getAttribute('data-mode')).toBe('phone');
    expect(container.querySelector('.canvas-full')).toBeTruthy();
    expect(container.querySelector('.rail-toggle')).toBeTruthy();
    expect(container.querySelector('.bottom-sheet')).toBeTruthy(); // detail hosted in a sheet
    // No desktop grid areas.
    expect(container.querySelector('.area.rail')).toBeNull();
  });
});
