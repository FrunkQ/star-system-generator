import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import AbsorptionBandsEditor from './AbsorptionBandsEditor.svelte';
import type { PigmentBand } from '$lib/types';

/**
 * A56. These pin the two things that are NOT obvious about lifting this control out of the component
 * that owned the data — both of which cost a real fault while building it.
 */
describe('AbsorptionBandsEditor', () => {
  const bands = (): PigmentBand[] => [{ centreNm: 762, widthNm: 6, strength: 0.5 }];

  it('shows a band as three editable numbers', () => {
    const { container } = render(AbsorptionBandsEditor, { props: { bands: bands() } });
    const inputs = [...container.querySelectorAll('.band-row input')] as HTMLInputElement[];
    expect(inputs.map((i) => i.value)).toEqual(['762', '6', '0.5']);
  });

  it('RE-ASSIGNS rather than mutating, and announces every edit', async () => {
    // The trap: mutating `bands[i].centreNm` in place does not propagate out through `bind:bands`, so
    // the parent's derived state (a pigment swatch, a gas preview curve) goes stale while the number
    // in the box changes. Both halves are needed — new objects AND the callback, because a parent
    // whose reactivity keys off a CONTAINER (`pigments`, `gases`) has to nudge that container itself.
    const start = bands();
    let announced = 0;
    const { container } = render(AbsorptionBandsEditor, {
      props: { bands: start, onChange: () => announced++ }
    });
    const centre = container.querySelector('.band-row input') as HTMLInputElement;
    await fireEvent.input(centre, { target: { value: '600' } });
    expect(announced).toBe(1);
    expect((container.querySelector('.band-row input') as HTMLInputElement).value).toBe('600');
    // The caller's own objects are left alone — proof a new array/band was built rather than mutated.
    expect(start[0].centreNm).toBe(762);
  });

  it('adds and removes, announcing each time', async () => {
    let announced = 0;
    const { container } = render(AbsorptionBandsEditor, {
      props: { bands: bands(), onChange: () => announced++ }
    });
    await fireEvent.click(container.querySelector('.bands-head .mini') as HTMLElement);
    expect(container.querySelectorAll('.band-row')).toHaveLength(2);
    await fireEvent.click([...container.querySelectorAll('.mini.danger')].pop() as HTMLElement);
    expect(container.querySelectorAll('.band-row')).toHaveLength(1);
    expect(announced).toBe(2);
  });

  it('says what an EMPTY list means, rather than that it is empty', () => {
    const { container } = render(AbsorptionBandsEditor, {
      props: { bands: [], emptyNote: 'No bands — this gas only scatters.' }
    });
    expect(container.querySelector('.note')?.textContent).toContain('only scatters');
  });

  it('STILL PREVIEWS a gas with no bands, showing the light arriving untouched', () => {
    // 17 of the 33 shipped gases have no bands (N2, argon, the noble gases). Requiring an `absorbed`
    // series made 'Preview against a star' a dead button on every one of them: it relabelled itself
    // and drew nothing, which reads as broken rather than as the answer. A flat chart IS the answer.
    const { container } = render(AbsorptionBandsEditor, {
      props: { bands: [], previewLight: [1, 2, 3], absorbed: null, emptyPreviewNote: 'only scatters' }
    });
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.textContent).toContain('only scatters');
  });

  it('draws nothing at all when there is no light to draw', () => {
    const { container } = render(AbsorptionBandsEditor, { props: { bands: bands() } });
    expect(container.querySelector('svg')).toBeNull();
  });

  it('labels the axis with CHARACTERS, never HTML entities', () => {
    // An SVG <text> node is set as text and never parsed as HTML, so an entity string renders
    // literally — the y-axis read 'W&#183;m&#8315;...' on screen. It worked in the original caller
    // because there it was an attribute in Svelte markup, which IS parsed; lifting it into a JS
    // default is what broke it. Guarding the whole component catches the next one too.
    const { container } = render(AbsorptionBandsEditor, {
      props: { bands: bands(), previewLight: [1, 2, 3], absorbed: [0.5, 1, 1.5] }
    });
    expect(container.textContent).not.toMatch(/&#\d+;/);
    expect(container.textContent).toContain('W·m⁻²·nm⁻¹');
  });
});
