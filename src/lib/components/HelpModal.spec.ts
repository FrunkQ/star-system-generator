// "THE TAGGING GUIDE OPENS BEHIND EVERYTHING, AND I CANNOT SEE IT UNLESS I ACCESS IT FROM THE TUTORIAL
// AREA" (Discord, 11-02).
//
// The guide is `HelpModal`, and it is a dialog that OTHER DIALOGS open. It used the shared
// `.modal-overlay` layer, which is the lowest dialog number in the tree. That was invisible while a
// dialog rendered inside its opener - the opener's backdrop is a stacking context and the guide was
// the last thing in it - and became a fault the day `use:foreground` started moving every dialog to
// <body> (engine map UI-C14): there the guide's number is compared directly with its opener's, and
// every opener but the Help menu has a bigger one.
//
// jsdom lays nothing out and has no stacking contexts, so the ORDER is read from the source: the
// number the guide's layer resolves to, against the number on each layer it is opened from. The
// table of openers is the one hand-kept thing here and it is the cheap side - a new place that
// mounts <HelpModal> is RED until someone says what it opens over.
import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import HelpModal from './HelpModal.svelte';

/** Every file that mounts the guide -> the fixed layers it can be showing over when it does. */
const OPENED_OVER: Record<string, Array<{ file: string; cls: string; global?: boolean }>> = {
  'src/lib/components/HelpMenuModal.svelte': [{ file: 'src/routes/+layout.svelte', cls: 'modal-overlay', global: true }],
  // Find by tag: the finder is a card inside the page's own overlay.
  'src/lib/components/TagFinder.svelte': [{ file: 'src/routes/+page.svelte', cls: 'allbodies-overlay' }],
  'src/lib/components/TagCategoryEditor.svelte': [
    { file: 'src/lib/components/TagCategoryEditor.svelte', cls: 'modal-bg' },
    { file: 'src/lib/components/TagCategoryEditor.svelte', cls: 'rule-edit-bg' }
  ],
  // The autopilot tab lives in the construct panel, which the ship panel shows as a dialog.
  'src/lib/components/AutopilotTab.svelte': [{ file: 'src/lib/components/ShipPanel.svelte', cls: 'ship-bg' }]
};

function svelteFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name).replace(/\\/g, '/');
    if (e.isDirectory()) svelteFiles(p, out);
    else if (e.name.endsWith('.svelte')) out.push(p);
  }
  return out;
}

/** The declaration block of one class rule in a file's styles. */
function ruleOf(file: string, cls: string, global = false): string {
  const src = readFileSync(file, 'utf8');
  const sel = global ? `:global\\(\\.${cls}\\)` : `(?<![\\w-])\\.${cls}`;
  const m = new RegExp(sel + '\\s*\\{([^{}]*)\\}').exec(src.slice(src.indexOf('<style')));
  expect(m, `${file} styles .${cls}`).not.toBeNull();
  return m![1];
}

/** The modal tier, from the one place it is named. */
const tier = (name: string): number =>
  Number(new RegExp(`--z-${name}:\\s*(\\d+)`).exec(readFileSync('src/lib/styles/tokens.css', 'utf8'))![1]);

/** A z-index declaration as a number: a plain integer, or `calc(var(--z-modal, N) + K)`. */
function zOf(decl: string): number {
  const z = /z-index:\s*([^;]+);/.exec(decl);
  expect(z, `a z-index in "${decl.trim().slice(0, 60)}"`).not.toBeNull();
  const v = z![1].trim();
  if (/^\d+$/.test(v)) return Number(v);
  const c = /^calc\(var\(--z-(\w+),\s*(\d+)\)\s*\+\s*(\d+)\)$/.exec(v);
  expect(c, `a z-index this gate can read: "${v}"`).not.toBeNull();
  // The fallback must BE the tier, or the number here is not the number in the browser.
  expect(Number(c![2])).toBe(tier(c![1]));
  return tier(c![1]) + Number(c![3]);
}

describe('the guide viewer opens in front of whatever opened it', () => {
  const helpZ = zOf(ruleOf('src/lib/components/HelpModal.svelte', 'help-layer'));

  it('puts its layer class on the backdrop it portals to <body>', () => {
    const { baseElement } = render(HelpModal, { props: { markdown: '# Tags\n\nBody.' } });
    const layer = baseElement.querySelector('.modal-overlay') as HTMLElement;
    expect(layer).not.toBeNull();
    expect(layer.classList.contains('help-layer')).toBe(true);
    expect(layer.querySelector('[role="dialog"]')!.getAttribute('aria-label')).toBe('Tags');
  });

  it('sits in the modal tier and under the toasts', () => {
    expect(helpZ).toBeGreaterThanOrEqual(tier('modal'));
    expect(helpZ).toBeLessThan(tier('toast'));
  });

  it('knows every place the guide is mounted from', () => {
    const mounts = svelteFiles('src').filter((f) => /<HelpModal\b/.test(readFileSync(f, 'utf8')));
    expect(mounts.length).toBeGreaterThanOrEqual(4);
    expect(mounts.sort()).toEqual(Object.keys(OPENED_OVER).sort());
  });

  for (const [opener, layers] of Object.entries(OPENED_OVER)) for (const l of layers) {
    it(`is above .${l.cls}, which ${opener.split('/').pop()} opens it over`, () => {
      const under = zOf(ruleOf(l.file, l.cls, l.global));
      // ABSOLUTE, not relative to anything else: strictly in front.
      expect(helpZ).toBeGreaterThan(under);
    });
  }
});
