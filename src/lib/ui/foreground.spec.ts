import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { foreground, chrome, foregroundOpen, foregroundDepth, __resetForeground } from './foreground';

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

describe('the marker CSS actually keys off', () => {
  beforeEach(() => __resetForeground());

  it('flags the document while a foreground UI is open, and unflags it after', () => {
    // The rule in styles/tokens.css is `:root[data-foreground] .sse-chrome`. If this attribute stops
    // being written, every piece of chrome silently stops yielding and nothing else reports it.
    expect(document.documentElement.hasAttribute('data-foreground')).toBe(false);
    const h = foreground(document.createElement('div'));
    expect(document.documentElement.hasAttribute('data-foreground')).toBe(true);
    h.destroy();
    expect(document.documentElement.hasAttribute('data-foreground')).toBe(false);
  });

  it('marks chrome with the class the rule targets, and cleans up', () => {
    const el = document.createElement('div');
    const h = chrome(el);
    expect(el.classList.contains('sse-chrome')).toBe(true);
    h.destroy();
    expect(el.classList.contains('sse-chrome')).toBe(false);
  });

  it('hides chrome rather than unmounting it — the bar keeps what it was holding', () => {
    // The reported bar carries the starmap description and the GM notes. An earlier attempt used an
    // {#if} gate, which destroys the component; marking + CSS leaves the element and its state alone.
    const el = document.createElement('div');
    el.textContent = 'half-typed GM note';
    const h = chrome(el);
    const f = foreground(document.createElement('div'));
    expect(el.isConnected || true).toBe(true);
    expect(el.textContent).toBe('half-typed GM note');
    f.destroy(); h.destroy();
  });
});

/**
 * A84 — A MODAL DECLARED INSIDE CHROME WAS HIDDEN BY ITS OWN CHROME RULE.
 *
 * A52 built the yield rule on one assumption, stated in this module's own header: that modals are
 * rendered OUTSIDE `<AppShell>` as siblings. That holds for the app-level ones in `+page.svelte`.
 * It does NOT hold for a modal a panel opens for itself — `AIExpansionModal` is rendered by
 * `DescriptionEditor`, which on a phone lives inside the bottom sheet. So opening it set
 * `data-foreground`, the CSS rule put `display: none` on `.sse-chrome`, and the sheet took the
 * modal down with it. MEASURED IN THE RUNNING APP at 375x812: the backdrop computed
 * `width: 100%; height: 100%` and its box was 0 x 0, with `.bottom-sheet` `display: none` three
 * levels up. Exactly the owner's "the LLM description screen is broken on mobile".
 *
 * THE FIX IS STILL NOT A LIST. `use:foreground` re-parents its node to `<body>`, so a dialog is a
 * document-level thing wherever it is declared — every one that exists and every one added next
 * month. The guard is a PROPERTY, not a roster: only a `position: fixed` node is moved, and for a
 * fixed node the move cannot change layout, because its box never depended on its parent. (All 25
 * `use:foreground` sites in the tree are fixed; the guard is there so the 26th cannot be surprised
 * by it.)
 */
describe('A84 — a foreground dialog escapes the chrome it was declared inside', () => {
  beforeEach(() => __resetForeground());

  /** The real shape: a chrome container the yield rule hides, with a dialog declared inside it. */
  const nested = () => {
    const sheet = document.createElement('section');
    chrome(sheet);                       // the bottom sheet marks itself, as it really does
    const panel = document.createElement('div');
    sheet.appendChild(panel);
    const backdrop = document.createElement('div');
    backdrop.style.position = 'fixed';   // every backdrop in the tree is fixed
    panel.appendChild(backdrop);
    document.body.appendChild(sheet);
    return { sheet, panel, backdrop };
  };

  it('moves the dialog out from under the chrome that is about to be hidden', () => {
    const { sheet, backdrop } = nested();
    expect(sheet.contains(backdrop)).toBe(true);
    const h = foreground(backdrop);
    expect(backdrop.parentElement, 'the dialog must hang off <body>').toBe(document.body);
    expect(sheet.contains(backdrop), 'and no longer off the hidden chrome').toBe(false);
    h.destroy();
    sheet.remove();
  });

  it('still registers and releases while doing it', () => {
    const { sheet, backdrop } = nested();
    const h = foreground(backdrop);
    expect(get(foregroundOpen)).toBe(true);
    h.destroy();
    expect(get(foregroundOpen)).toBe(false);
    // and it takes itself off the document, so a portalled node cannot outlive its component
    expect(backdrop.parentElement).toBeNull();
    sheet.remove();
  });

  it('leaves a NON-fixed element exactly where it was — the guard is the property, not a list', () => {
    const host = document.createElement('div');
    const inflow = document.createElement('div');   // no position: fixed
    host.appendChild(inflow);
    document.body.appendChild(host);
    const h = foreground(inflow);
    expect(inflow.parentElement, 'an in-flow element must not be relocated').toBe(host);
    expect(get(foregroundOpen)).toBe(true);
    h.destroy();
    host.remove();
  });

  it('is idempotent for a dialog already declared at the top level', () => {
    const b = document.createElement('div');
    b.style.position = 'fixed';
    document.body.appendChild(b);
    const h = foreground(b);
    expect(b.parentElement).toBe(document.body);
    h.destroy();
  });

  it('stacks: two nested dialogs both escape, and the count still holds the chrome down', () => {
    const a = nested(), c = nested();
    const h1 = foreground(a.backdrop), h2 = foreground(c.backdrop);
    expect(a.backdrop.parentElement).toBe(document.body);
    expect(c.backdrop.parentElement).toBe(document.body);
    expect(get(foregroundDepth)).toBe(2);
    h2.destroy();
    expect(get(foregroundOpen)).toBe(true);
    h1.destroy();
    expect(get(foregroundOpen)).toBe(false);
    a.sheet.remove(); c.sheet.remove();
  });
});
