// OPENING THE BIOSPHERE EDITOR AND PRESSING SAVE USED TO DELETE THE CAMPAIGN'S CUSTOMISATIONS.
//
// The modal stores a DELTA: it lays the campaign's override over the pack's list on the way in, and
// diffs against that same list on the way out. Both of those need the SHIPPED pack. It was handed
// `effectiveRulePack ?? selectedRulepack` - the pack with this campaign's overrides ALREADY applied -
// so the base and the edited list were one list, `makeListDelta` correctly found no difference and
// returned `undefined`, and `applyStarmapOverrides` reads `undefined` as "no override at all" and
// removes the key. Three sections went at once: morphologies, pigments and pigmentModel.
//
// Nothing failed, nothing warned, and the GM's worlds simply started drawing with the shipped
// defaults again. It is the same class of fault as R-19 itself - a silent wrong answer - which is
// how it was found.
//
// RED-FIRST: pass the effective pack instead of the shipped one and all three tests fail with the
// section undefined. Checked 2026-09-08.
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import EditBiospheresModal from './EditBiospheresModal.svelte';
import { applyListDelta } from '$lib/rulepackDelta';
import { allMorphologies, } from '$lib/physics/vegetation';
import { allPigments } from '$lib/physics/pigments';
import type { RulePack, Starmap } from '$lib/types';

const shipped = {
  id: 'test', version: '1',
  morphologies: [
    { key: 'microbial', label: 'Microbial', order: 0, defaultCoverage: 0.9, tints: ['#6b7a5a'], pigmentDriven: 0.5, opacity: 0.4, light: { min: 0, max: 0 } },
    { key: 'flora', label: 'Flora', order: 2, defaultCoverage: 0.6, tints: ['#3d6b34'], pigmentDriven: 0.9, opacity: 0.8, light: { min: 0, max: 0 } }
  ],
  pigments: [{ key: 'chlorophyll', label: 'Chlorophyll', bands: [{ centreNm: 430, widthNm: 40, strength: 0.9 }] }],
  pigmentModel: { captureWeight: 1, protectionWeight: 1, steadinessWeight: 1, tissueAbsorptance: 0.2, saturationFlux: 1e21, reactionCentreNm: 700, viabilityFraction: 0.5 }
} as unknown as RulePack;

/** A campaign that customised all three sections. */
const starmap = {
  rulePackOverrides: {
    morphologies: { entries: { flora: { opacity: 0.25 } } },
    pigments: { entries: { rhodopsin: { key: 'rhodopsin', label: 'Rhodopsin', bands: [{ centreNm: 560, widthNm: 60, strength: 0.8 }] } } },
    pigmentModel: { captureWeight: 3 }
  }
} as unknown as Starmap;

/** What the page hands the modal. THE SHIPPED PACK - see the note at the top of the component. */
function openAndSave() {
  const save = vi.fn();
  const r = render(EditBiospheresModal, { props: { showModal: true, rulePack: shipped, starmap }, events: { save } });
  return { ...r, saved: () => save.mock.calls[0]?.[0]?.detail };
}

describe('EditBiospheresModal keeps what the campaign already had', () => {
  it('an unchanged open-and-save keeps the MORPHOLOGY override', async () => {
    const { getByText, saved } = openAndSave();
    await fireEvent.click(getByText(/^Save/));
    const back = applyListDelta(allMorphologies(shipped), saved().morphologies, (m: any) => m.key);
    expect(back.find((m: any) => m.key === 'flora')?.opacity).toBe(0.25);
  });

  it('an unchanged open-and-save keeps the PIGMENT override', async () => {
    const { getByText, saved } = openAndSave();
    await fireEvent.click(getByText(/^Save/));
    const back = applyListDelta(allPigments(shipped), saved().pigments, (p: any) => p.key);
    expect(back.map((p: any) => p.key)).toContain('rhodopsin');
  });

  it('an unchanged open-and-save keeps the PIGMENT MODEL override', async () => {
    const { getByText, saved } = openAndSave();
    await fireEvent.click(getByText(/^Save/));
    expect(saved().pigmentModel).toMatchObject({ captureWeight: 3 });
  });

  it('a campaign that customised nothing still stores nothing', async () => {
    const save = vi.fn();
    const { getByText } = render(EditBiospheresModal, {
      props: { showModal: true, rulePack: shipped, starmap: {} as unknown as Starmap }, events: { save }
    });
    await fireEvent.click(getByText(/^Save/));
    const detail = save.mock.calls[0][0].detail;
    expect(detail.morphologies).toBeUndefined();
    expect(detail.pigments).toBeUndefined();
    expect(detail.pigmentModel).toBeUndefined();
  });
});
