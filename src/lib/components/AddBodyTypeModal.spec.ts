// REGRESSION GUARD for a bug that shipped in v3.0.77 and broke an EXISTING feature: adding an L4
// trojan threw `ReferenceError: coPlacement is not defined` and the picker never opened.
//
// The cause was mine and it is worth naming, because the class of mistake is invisible to both the
// build and svelte-check: a batch edit asserted-and-aborted BEFORE writing, so the `export let
// circumbinary` declaration never landed - while a second script went on to add every line that
// USES it. The component compiled (Svelte does not resolve free identifiers at build time) and threw
// only when the gate closures actually ran, i.e. the moment a GM opened the picker.
//
// Nothing in the suite rendered this component, so nothing caught it. This does. It is deliberately
// thin: mount it in each of its three modes and assert it did not throw and put something on screen.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import AddBodyTypeModal from './AddBodyTypeModal.svelte';
import type { RulePack } from '$lib/types';
import fs from 'fs';
import path from 'path';

const pack = {
  id: 'test', version: '1',
  classifier: {
    fingerprints: [
      { class: 'planet/terrestrial', kind: 'base', match: { massMe: [0.1, 5], teqK: [180, 400] } },
      { class: 'planet/gas-giant', kind: 'base', match: { massMe: [50, 4000], teqK: [30, 400] } }
    ],
    planetImages: {}
  }
} as unknown as RulePack;

const base = { rulePack: pack, teqK: 280, role: 'moon' as const, hostMassKg: 5.97e24, ageGyr: 4.6 };

describe('AddBodyTypeModal mounts in every placement mode', () => {
  it('opens for an ordinary body', () => {
    const { getByRole } = render(AddBodyTypeModal, { props: base });
    expect(getByRole('dialog')).toBeTruthy();
  });

  it('opens for a TROJAN placement — the v3.0.77 regression', () => {
    const { getByRole } = render(AddBodyTypeModal, {
      props: { ...base, trojan: { secondaryName: 'Njord', point: 'l4', maxTrojanMassKg: 1e23 } }
    });
    const dialog = getByRole('dialog');
    expect(dialog.textContent).toContain('Njord');
    expect(dialog.textContent).toContain('L4');
    // The gate must be offered under its trojan name, which is what the crashing closure decided.
    expect(dialog.textContent).toContain('Trojan mass');
  });

  it('opens for a CIRCUMBINARY placement', () => {
    const { getByRole } = render(AddBodyTypeModal, {
      props: { ...base, circumbinary: { pairName: 'Alpha Centauri AB', maxMassKg: 4e27 } }
    });
    const dialog = getByRole('dialog');
    expect(dialog.textContent).toContain('Alpha Centauri AB');
    expect(dialog.textContent).toContain('Test-particle mass');
  });

  // Each render is scoped to its OWN container: two mounts share one document, so a document-wide
  // getByRole('dialog') finds both and throws.
  const gateChips = (props: Record<string, unknown>): string[] => {
    const { container } = render(AddBodyTypeModal, { props: { ...base, ...props } });
    return [...container.querySelectorAll('.gate')].map((e) => (e.textContent ?? '').trim());
  };

  it('a co-placement drops the host-fit gate; an ordinary body keeps it', () => {
    // A moon sits in ONE host's gravity well, so "Host" is a real question for it.
    expect(gateChips({})).toContain('Host');
    // A trojan and a circumbinary body do not, so the question goes and the placement cap replaces it.
    const trojan = gateChips({ trojan: { secondaryName: 'Njord', point: 'l4', maxTrojanMassKg: 1e23 } });
    expect(trojan).not.toContain('Host');
    expect(trojan).toContain('Trojan mass');

    const cb = gateChips({ circumbinary: { pairName: 'Alpha Centauri AB', maxMassKg: 4e27 } });
    expect(cb).not.toContain('Host');
    expect(cb).toContain('Test-particle mass');
  });
});

// THE MENU ITSELF, against the SHIPPED pack (owner, 2026-09-08: *"We really SHOULD have rubble piles
// and binaries in the pick list alongside other asteroids - why not?"*). The thin pack above cannot
// answer this - it has two planet types and no small bodies - so this block loads the real one.
describe('rubble piles and contact binaries are in the list', () => {
  const shipped = (): RulePack => {
    const dir = path.resolve('static/rulepacks/starter-sf');
    const merge = (t: any, s: any): any => {
      const o = { ...t };
      const obj = (x: any) => x && typeof x === 'object' && !Array.isArray(x);
      if (obj(t) && obj(s)) Object.keys(s).forEach((k) => { o[k] = obj(s[k]) && k in t ? merge(t[k], s[k]) : s[k]; });
      return o;
    };
    let p: any = JSON.parse(fs.readFileSync(path.join(dir, 'main.json'), 'utf-8'));
    for (const f of ['planets.json', 'generation.json', 'classification.json']) {
      p = merge(p, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')));
    }
    return p as RulePack;
  };
  // A small icy moon slot around a giant — where a rubble pile actually belongs.
  const props = { rulePack: shipped(), teqK: 120, role: 'moon' as const, hostMassKg: 1.9e27, ageGyr: 4.6 };
  const cards = () => {
    const { container } = render(AddBodyTypeModal, { props });
    return [...container.querySelectorAll('button.card')];
  };

  // The card's title starts with the type's PRETTY name (hyphens become spaces), which is what a GM
  // reads, so that is what is asserted.
  const labels = () => cards().map((c) => (c.getAttribute('title') ?? '').split(' — ')[0]);

  it('offers them alongside the asteroid types', () => {
    expect(labels()).toContain('asteroid/rubble pile');
    expect(labels()).toContain('asteroid/contact binary');
    // ...and they are IN the list with the bases rather than instead of them.
    expect(labels()).toContain('asteroid/c type');
  });

  // A MODIFIER THE BUILDER CANNOT PRODUCE IS NOT OFFERED. `planet/ringed` needs a ring child,
  // `planet/toroidal` and `planet/ellipsoid` an oblateness the spin derives, and
  // `planet/ultra-short-period` an orbit the GM has already chosen by clicking - a card for any of
  // them would hand back an ordinary planet.
  it('does not offer a modifier it cannot build', () => {
    for (const cls of ['planet/ringed', 'planet/toroidal', 'planet/ellipsoid', 'planet/disrupted', 'planet/ultra short period']) {
      expect(labels(), cls).not.toContain(cls);
    }
  });

  it('marks a modifier as a property rather than a type, so the card does not lie', () => {
    const marked = cards().filter((c) => c.classList.contains('modifier'));
    expect(marked.length).toBe(2);
    for (const c of marked) {
      expect(c.getAttribute('title')).toMatch(/a property, not a type/);
    }
    // A base is not marked.
    const cType = cards().find((c) => (c.getAttribute('title') ?? '').startsWith('asteroid/c type'));
    expect(cType, 'no c-type card at all').toBeTruthy();
    expect(cType!.classList.contains('modifier')).toBe(false);
  });
});
