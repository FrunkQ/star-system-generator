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
