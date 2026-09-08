// A CAMPAIGN'S CUSTOM LIQUID SURVIVES ITS OWN EDITOR.
//
// `rulePackOverrides.liquids` became DELTA-CAPABLE at D25, so a starmap could ship a definition
// without either dropping every liquid it did not name or freezing all of them against later
// improvements. The READER followed (`effectiveRulePack` applies it through `applyListDelta`); this
// EDITOR did not, and the two then disagreed about what the section even was:
//
//   const source = starmap.rulePackOverrides?.liquids && starmap.rulePackOverrides.liquids.length
//
// A delta is an OBJECT. It has no `.length`, so that read `undefined`, the editor silently opened on
// the SHIPPED list, and Save wrote that list back over the GM's delta. Open the dialog on a campaign
// carrying a custom liquid, press Save, and the liquid was gone - and every body that named it fell
// back to a default with no warning, which is R-19's bug arriving by a second road.
//
// RED-FIRST: run against the previous editor and the first test fails with `unobtainium` absent from
// the rendered rows, and the second with the delta replaced by a whole list. Checked 2026-09-08.
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import EditLiquidsModal from './EditLiquidsModal.svelte';
import { applyListDelta } from '$lib/rulepackDelta';
import type { RulePack, Starmap, LiquidDef } from '$lib/types';

const pack = {
  id: 'test', version: '1',
  liquids: [
    { name: 'water', label: 'Water', meltK: 273.15, boilK: 373.15, colorHex: '#3b6ea5' },
    { name: 'ammonia', label: 'Ammonia', meltK: 195.4, boilK: 239.8, colorHex: '#9fc0a8' }
  ]
} as unknown as RulePack;

/** What a starmap that SHIPPED a custom liquid carries: a delta, not a list. */
const withDelta = {
  rulePackOverrides: {
    liquids: { entries: { unobtainium: { name: 'unobtainium', label: 'Unobtainium', meltK: 90, boilK: 260 } } }
  }
} as unknown as Starmap;

function open(starmap: Starmap) {
  const save = vi.fn();
  const r = render(EditLiquidsModal, { props: { showModal: true, rulePack: pack, starmap }, events: { save } });
  return { ...r, saved: () => save.mock.calls[0]?.[0]?.detail, saveCalls: save };
}

describe('EditLiquidsModal and a delta override', () => {
  it('OPENS on the custom liquid rather than on the shipped list', async () => {
    const { container } = open(withDelta);
    const values = [...container.querySelectorAll('input')].map((i) => (i as HTMLInputElement).value);
    expect(values).toContain('Unobtainium');
    expect(values).toContain('Water');           // and the pack's own are still all there
  });

  it('SAVES a delta, so the campaign keeps tracking later improvements to the pack', async () => {
    const { getByText, saved, saveCalls } = open(withDelta);
    await fireEvent.click(getByText('Save Changes'));
    expect(saveCalls).toHaveBeenCalledTimes(1);
    const savedLiquids = saved().liquids;
    expect(Array.isArray(savedLiquids)).toBe(false);     // NOT a whole-list replace
    expect(savedLiquids.entries?.unobtainium?.label).toBe('Unobtainium');
    // And it still means the same thing: base + delta is the list the GM was looking at.
    const effective = applyListDelta(pack.liquids as LiquidDef[], savedLiquids, (l: any) => l.name);
    expect(effective.map((l: any) => l.name).sort()).toEqual(['ammonia', 'unobtainium', 'water']);
  });

  it('opening and saving unchanged does not invent an override', async () => {
    const { getByText, saved } = open({} as unknown as Starmap);
    await fireEvent.click(getByText('Save Changes'));
    expect(saved().liquids).toBeUndefined();
  });

  it('still opens on a WHOLE LIST, which is what campaigns saved before D25 carry', async () => {
    const legacy = {
      rulePackOverrides: { liquids: [{ name: 'quicksilver', label: 'Quicksilver', meltK: 234, boilK: 630 }] }
    } as unknown as Starmap;
    const { container } = open(legacy);
    const values = [...container.querySelectorAll('input')].map((i) => (i as HTMLInputElement).value);
    expect(values).toContain('Quicksilver');
  });
});
