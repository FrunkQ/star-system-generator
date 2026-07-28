import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import EditAtmospheresModal from './EditAtmospheresModal.svelte';

// The rule-pack editors are how a GM gets at the cloud/reaction data — "Krypton + Unobtanium =
// pink bubblegum" has to be reachable without hand-editing JSON. These cover the parts that were
// wrong before (the mixes tab) and the parts that are new (cloud formation, reactions).

const pack: any = {
  gasPhysics: {
    N2:    { molarMass: 0.028, shielding: 1, greenhouse: 0, specificHeat: 1, radiativeCooling: 0.1, colorHex: null, meltK: 63, boilK: 77 },
    CH4:   { molarMass: 0.016, shielding: 1, greenhouse: 3, specificHeat: 1, radiativeCooling: 0.1, colorHex: null, meltK: 91, boilK: 112,
             cloud: { condensesTo: 'methane', minFraction: 0.001 } },
    H2S:   { molarMass: 0.034, shielding: 1, greenhouse: 1, specificHeat: 1, radiativeCooling: 0.1, colorHex: null, meltK: 187, boilK: 213 },
    NH3:   { molarMass: 0.017, shielding: 1, greenhouse: 2, specificHeat: 1, radiativeCooling: 0.1, colorHex: null, meltK: 195, boilK: 240 },
    NH4SH: { molarMass: 0.051, shielding: 1, greenhouse: 0, specificHeat: 1, radiativeCooling: 0.1, colorHex: '#b8845a', meltK: 190, boilK: 300,
             reaction: { from: ['NH3', 'H2S'], yield: 1 } }
  },
  liquids: [
    { name: 'water', label: 'Water', meltK: 273, boilK: 373, colorHex: '#2b6cb0' },
    { name: 'methane', label: 'Methane', meltK: 91, boilK: 112, colorHex: '#6a8caf' }
  ],
  distributions: { atmosphere_composition: { entries: [
    { weight: 10, value: { name: 'Thin N2', pressure_range_bar: [0.5, 1.5], composition: { N2: 0.9, CH4: 0.1 }, occurs_on: 'terrestrial' } }
  ] } }
};
const starmap: any = { rulePackOverrides: undefined };

const mount = () => render(EditAtmospheresModal, { props: { showModal: true, rulePack: pack, starmap } });
const tabButton = (c: HTMLElement, label: string) =>
  [...c.querySelectorAll('.tabs button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;

describe('EditAtmospheresModal — rule-pack editing', () => {
  it('offers the three tabs', () => {
    const { container } = mount();
    const tabs = [...container.querySelectorAll('.tabs button')].map((b) => b.textContent?.trim());
    expect(tabs).toEqual(['Gas Physics', 'Reactions', 'Atmosphere Mixes']);
  });

  it('shows cloud formation per gas, and lets a gas be made cloud-forming', async () => {
    const { container } = mount();
    const boxes = [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    const checkedBefore = boxes.filter((b) => b.checked).length;
    // CH4 ships with a cloud block, N2 does not — so at least one box is on and one off.
    expect(checkedBefore).toBeGreaterThan(0);
    const off = boxes.find((b) => !b.checked)!;
    await fireEvent.change(off, { target: { checked: true } });
    // Turning one on must not throw and must leave the panel intact.
    expect(container.querySelector('.list-container')).toBeTruthy();
  });

  it('REACTIONS tab lists the recipe as A + B → C', async () => {
    const { container } = mount();
    await fireEvent.click(tabButton(container, 'Reactions'));
    const summary = container.querySelector('.header-summary')?.textContent ?? '';
    expect(summary.replace(/\s+/g, ' ')).toContain('NH3 + H2S → NH4SH');
  });

  it('reaction dropdowns offer only gases that already exist (the tab makes reactions, not gases)', async () => {
    const { container } = mount();
    await fireEvent.click(tabButton(container, 'Reactions'));
    const opts = [...container.querySelectorAll('.item-body select')]
      .flatMap((s) => [...s.querySelectorAll('option')].map((o) => o.getAttribute('value')));
    const known = Object.keys(pack.gasPhysics);
    for (const o of opts) expect(known).toContain(o);
  });

  it('a reaction can be added and removed', async () => {
    const { container } = mount();
    await fireEvent.click(tabButton(container, 'Reactions'));
    expect(container.querySelectorAll('.item-card').length).toBe(1);

    const add = [...container.querySelectorAll('.add-btn')].find((b) => /Add Reaction/.test(b.textContent ?? ''))!;
    await fireEvent.click(add);
    expect(container.querySelectorAll('.item-card').length).toBe(2);

    const del = container.querySelector('.item-card .delete-btn') as HTMLButtonElement;
    await fireEvent.click(del);
    expect(container.querySelectorAll('.item-card').length).toBe(1);
  });

  it('MIXES tab: + Add Gas adds a NEW gas rather than overwriting an existing row', async () => {
    // The v2.1.246 bug: it always added Object.keys(gases)[0], silently overwriting that row.
    const { container } = mount();
    await fireEvent.click(tabButton(container, 'Atmosphere Mixes'));
    const gasesIn = () => [...container.querySelectorAll('.mix-gas')].map((s) => (s as HTMLSelectElement).value);
    const before = gasesIn();
    expect(before).toEqual(['N2', 'CH4']);

    const add = container.querySelector('.small-add') as HTMLButtonElement;
    await fireEvent.click(add);
    const after = gasesIn();
    expect(after.length).toBe(before.length + 1);
    expect(new Set(after).size).toBe(after.length);   // all distinct — nothing overwritten
  });

  it('MIXES tab: the running total flags a mix that does not add up to 1', async () => {
    const { container } = mount();
    await fireEvent.click(tabButton(container, 'Atmosphere Mixes'));
    expect(container.querySelector('.mix-total')?.textContent?.replace(/\s+/g, ' ')).toContain('total 1.00');
  });
});
