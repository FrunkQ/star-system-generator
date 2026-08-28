// G53 phase 1 acceptance, held at the DOM (E7: the modal is a DECLARATIVE surface, so unlike the
// canvas it IS verifiable headlessly — and these are the acceptance criteria as tests):
//   (2) the mega tab appears on a host that can take something and hides on one that cannot;
//   (3) a greyed option states WHY in a sentence a GM understands;
//   (4) a steer clause tags and explains and changes no authored value.
import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';
import AddConstructModal from './AddConstructModal.svelte';
import { systemStore } from '$lib/stores';
import type { CelestialBody, RulePack, System } from '$lib/types';

const megaPack = (): RulePack =>
  ({
    id: 'p', name: 'p',
    constructTemplates: {
      station: [
        { id: 't-station', name: 'Test Station', kind: 'construct', roleHint: 'construct', IsTemplate: true, tags: [], parentId: null } as unknown as CelestialBody
      ],
      mega: [
        {
          id: 't-elevator', name: 'Space Elevator', kind: 'construct', roleHint: 'construct', IsTemplate: true,
          tags: [], parentId: null, megaType: 'space-elevator', artificial: true,
          requires: { hard: { hostKind: ['planet', 'moon'], hasSurface: true, needsGeostationary: true }, steer: { geoBelowHillFraction: 0.5 } },
          explain: 'A space elevator hangs from a geostationary orbit above a surface. {host} has no real geostationary altitude to hang it from.'
        } as unknown as CelestialBody,
        {
          id: 't-ringworld', name: 'Ringworld', kind: 'construct', roleHint: 'construct', IsTemplate: true,
          tags: [], parentId: null, megaType: 'ringworld', artificial: true,
          requires: { hard: { hostIsStar: true }, steer: { inHabitableZone: true } },
          explain: 'A ringworld circles a star. {host} is not a star.'
        } as unknown as CelestialBody
      ]
    }
  }) as unknown as RulePack;

const earth = (): CelestialBody =>
  ({
    id: 'earth', name: 'Earth', parentId: 'sol', tags: [], kind: 'body', roleHint: 'planet',
    massKg: 5.972e24, radiusKm: 6371, rotation_period_hours: 23.934,
    orbitalBoundaries: {
      minLeoKm: 200, leoMoeBoundaryKm: 2000, meoHeoBoundaryKm: 50000,
      heoUpperBoundaryKm: 1.47e6, geoStationaryKm: 35786, isGeoFallback: false
    }
  }) as unknown as CelestialBody;

const sun = (): CelestialBody =>
  ({
    id: 'sol', name: 'Sol', parentId: null, tags: [], kind: 'body', roleHint: 'star',
    massKg: 1.989e30, radiusKm: 696340, temperatureK: 5772
  }) as unknown as CelestialBody;

const belt = (): CelestialBody =>
  ({ id: 'belt', name: 'Main Belt', parentId: 'sol', tags: [], kind: 'body', roleHint: 'belt' }) as unknown as CelestialBody;

const typeOptions = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('select')[0]!.options).map((o) => o.text.trim());

/** Pick an option by its text. Index-based on purpose: these selects bind OBJECT values, and every
 *  object option stringifies alike — selecting by DOM value would always hit the first one. */
const pickOption = async (select: HTMLSelectElement, text: string): Promise<void> => {
  const i = Array.from(select.options).findIndex((o) => o.text.trim() === text);
  if (i < 0) throw new Error(`no option '${text}'`);
  select.selectedIndex = i;
  await fireEvent.change(select);
};

describe('AddConstructModal — the mega tab (G53 phase 1)', () => {
  it('the tab appears on a host that can take something and HIDES on one that cannot', () => {
    systemStore.set({ nodes: [] } as unknown as System);
    const a = render(AddConstructModal, { props: { rulePack: megaPack(), hostBody: earth(), orbitalBoundaries: earth().orbitalBoundaries } });
    expect(typeOptions(a.container)).toContain('Mega');       // elevator passes on Earth
    a.unmount();
    const b = render(AddConstructModal, { props: { rulePack: megaPack(), hostBody: belt(), orbitalBoundaries: undefined } });
    expect(typeOptions(b.container)).not.toContain('Mega');   // nothing passes on a belt — tab gone
    expect(typeOptions(b.container)).toContain('Station');    // ordinary tabs untouched
  });

  it('a greyed option is disabled and its reason names the host in a sentence', async () => {
    systemStore.set({ nodes: [] } as unknown as System);
    const { container, getByText } = render(AddConstructModal, {
      props: { rulePack: megaPack(), hostBody: earth(), orbitalBoundaries: earth().orbitalBoundaries }
    });
    await pickOption(container.querySelectorAll('select')[0]!, 'Mega');
    const templateSelect = container.querySelectorAll('select')[1]!;
    const byText = (t: string) => Array.from(templateSelect.options).find((o) => o.text.trim() === t)!;
    expect(byText('Space Elevator').disabled).toBe(false);
    expect(byText('Ringworld').disabled).toBe(true);
    // Acceptance 3: the WHY, printed, host interpolated.
    expect(getByText('Ringworld — A ringworld circles a star. Earth is not a star.')).toBeTruthy();
  });

  it('a steer clause shows its sentence, stamps its tag on the created node, and changes no authored value', async () => {
    const star = sun();
    systemStore.set({ nodes: [star] } as unknown as System);
    const pack = megaPack();
    const authoredBefore = JSON.stringify(pack.constructTemplates!.mega[1]);
    const created = vi.fn();
    const { container } = render(AddConstructModal, {
      props: { rulePack: pack, hostBody: star, orbitalBoundaries: undefined },
      events: { create: created }
    });

    const selects = () => container.querySelectorAll('select');
    await pickOption(selects()[0]!, 'Mega');
    const templateSelect = selects()[1]!;
    const rw = Array.from(templateSelect.options).find((o) => o.text.trim() === 'Ringworld')!;
    expect(rw.disabled).toBe(false); // a star host takes a ringworld
    await pickOption(templateSelect, 'Ringworld');
    await pickOption(selects()[2]!, 'AU Distance');
    const auInput = container.querySelector('input[type="number"]')!;
    await fireEvent.input(auInput, { target: { value: '3' } });

    // The explanation is on screen while the GM is still looking at the field...
    expect(container.textContent).toMatch(/goldilocks/);
    // ...and the Add button is NOT disabled by it — steer never refuses.
    const addButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Add Construct'))!;
    expect(addButton.disabled).toBe(false);

    await fireEvent.click(addButton);
    expect(created).toHaveBeenCalledTimes(1);
    const node = created.mock.calls[0][0].detail as CelestialBody;
    expect(node.megaType).toBe('ringworld');       // rides the template copy
    expect(node.artificial).toBe(true);
    const megaTags = (node.tags ?? []).filter((t) => t.key.startsWith('mega/'));
    expect(megaTags.map((t) => t.key)).toContain('mega/outside-goldilocks');
    expect(String(megaTags[0].value)).toMatch(/AU/); // the sentence travels in the tag
    // Acceptance 4's last clause: NOTHING authored changed — template untouched, host untouched.
    expect(JSON.stringify(pack.constructTemplates!.mega[1])).toBe(authoredBefore);
    expect(get(systemStore)!.nodes.filter((n) => n.id === 'sol')).toHaveLength(1);
  });

  it('a template locked from the rich picker skips the choosing, seeds the AU field, and still steers', async () => {
    const star = sun();
    systemStore.set({ nodes: [star] } as unknown as System);
    const pack = megaPack();
    const created = vi.fn();
    const { container, getByText, queryByText } = render(AddConstructModal, {
      props: {
        rulePack: pack, hostBody: star, orbitalBoundaries: undefined,
        initialTemplate: pack.constructTemplates!.mega[1],   // the ringworld, chosen in the picker
        initialAuDistance: 3
      },
      events: { create: created }
    });
    // The picker chose WHAT; only WHERE is asked here.
    expect(getByText('Add Ringworld to Sol')).toBeTruthy();
    expect(queryByText('Construct Type:')).toBeNull();
    expect(queryByText('Template:')).toBeNull();
    await pickOption(container.querySelectorAll('select')[0]!, 'AU Distance');
    const auInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    expect(auInput.value).toBe('3');                          // seeded from the click
    expect(container.textContent).toMatch(/goldilocks/);      // and the steer still speaks
    const addButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Add Construct'))!;
    await fireEvent.click(addButton);
    expect(created).toHaveBeenCalledTimes(1);
    const node = created.mock.calls[0][0].detail as CelestialBody;
    expect(node.megaType).toBe('ringworld');
    expect((node.tags ?? []).some((t) => t.key === 'mega/outside-goldilocks')).toBe(true);
  });

  it('the per-template placement axis: a ringworld on a star offers AU Distance and nothing else', async () => {
    const star = sun();
    systemStore.set({ nodes: [star] } as unknown as System);
    const { container } = render(AddConstructModal, { props: { rulePack: megaPack(), hostBody: star, orbitalBoundaries: undefined } });
    await pickOption(container.querySelectorAll('select')[0]!, 'Mega');
    await pickOption(container.querySelectorAll('select')[1]!, 'Ringworld');
    const placementSelect = container.querySelectorAll('select')[2]!;
    const options = Array.from(placementSelect.options).map((o) => o.text.trim()).filter((t) => t !== 'Select placement');
    expect(options).toEqual(['AU Distance']);
  });
});
