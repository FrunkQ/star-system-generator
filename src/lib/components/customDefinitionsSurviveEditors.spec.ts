// "WHEN I CREATE A NEW ONE, THE OLDER ONE DELETES ITSELF" - the 3.1.1 emergency fix, editor half.
//
// Three users reported it in three wordings (a second custom gas deleting the first; adding a custom
// gas to another planet deleting the first; "your custom gases just disappear even if you saved") and
// the owner's own reading was "the save does not save more than one". It was not the save. It was
// ONE Settings editor diffing against the wrong pack:
//
//   Edit Atmospheres writes back only the gases that DIFFER from the pack it is handed, and the page
//   replaces the stored section with whatever it writes. From B132 (v3.0.321) the page handed it the
//   EFFECTIVE pack - the shipped one with this campaign's overrides already applied - so a custom gas
//   saved on the last visit compared equal to "the default", was left out of the next save, and the
//   section was replaced without it. Every tweak to a shipped gas went the same way.
//
// THIS GATE DRIVES THE REAL THING END TO END for every Settings editor that stores definitions: the
// real component, mounted with the packs THE PAGE'S OWN SOURCE says it mounts them with (read out of
// `+page.svelte`, not restated here), saved through the page's own fold (`applyEditorOverrides`), and
// reopened on the result - once per visit, because the loss only ever happened on the SECOND visit.
// Counts are absolute: two visits that each add one definition must leave exactly two.
//
// RED-FIRST, 2026-11-13: with the page's mount put back to `rulePack={effectiveRulePack ?? selectedRulepack}`
// the gas rows of "one per visit" and "a tweak to a shipped one" fail with 1 where 2 is expected, and
// the mount row fails naming the expression.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import EditAtmospheresModal from './EditAtmospheresModal.svelte';
import EditLiquidsModal from './EditLiquidsModal.svelte';
import EditFuelAndDrivesModal from './EditFuelAndDrivesModal.svelte';
import EditSensorsModal from './EditSensorsModal.svelte';
import EditBiospheresModal from './EditBiospheresModal.svelte';
import { applyEditorOverrides, buildEffectiveRulePack } from '$lib/rulepack/effectivePack';
import { authoredCounts, shippedPack } from '$lib/io/customDefinitions.testkit';
import { allLiquids } from '$lib/physics/liquids';
import type { RulePackOverrides } from '$lib/types';

const SHIPPED = shippedPack();
const PAGE = readFileSync(resolve(process.cwd(), 'src/routes/+page.svelte'), 'utf-8');

/** The opening tag of a component as the page writes it, up to its closing `/>`. */
function pageTag(component: string): string {
  const from = PAGE.indexOf(`<${component} `);
  if (from < 0) throw new Error(`+page.svelte does not mount <${component}>`);
  return PAGE.slice(from, PAGE.indexOf('/>', from) + 2);
}

/**
 * THE PACKS THE PAGE HANDS AN EDITOR, worked out from the page's own markup. Two expressions are
 * known; anything else fails loudly so a new way of mounting an editor has to be looked at.
 */
function packsAsThePageMounts(component: string, overrides: RulePackOverrides | undefined): Record<string, unknown> {
  const tag = pageTag(component);
  const props: Record<string, unknown> = {};
  for (const prop of ['rulePack', 'effectivePack']) {
    const expr = new RegExp(`\\b${prop}=\\{([^}]*)\\}`).exec(tag)?.[1]?.trim();
    if (expr === undefined) continue;
    if (expr === 'selectedRulepack') props[prop] = SHIPPED;
    else if (/^effectiveRulePack (\?\?|\|\|) selectedRulepack$/.test(expr)) props[prop] = buildEffectiveRulePack(SHIPPED, overrides);
    else throw new Error(`<${component} ${prop}={${expr}}> is a mount this gate does not know`);
  }
  return props;
}

type Step = (container: HTMLElement) => Promise<void>;
const click = (label: RegExp): Step => async (container) => {
  const b = [...container.querySelectorAll('button')].find((x) => label.test((x.textContent ?? '').trim()));
  if (!b) throw new Error(`no button matching ${label}`);
  await fireEvent.click(b);
};
/** Press the LAST button of a kind - a definition a GM adds is appended, so it is the last card. */
const clickLast = (selector: string): Step => async (container) => {
  const all = container.querySelectorAll(selector);
  if (!all.length) throw new Error(`nothing matches ${selector}`);
  await fireEvent.click(all[all.length - 1]);
};
const typeInLast = (selector: string, value: string): Step => async (container) => {
  const all = container.querySelectorAll(selector);
  await fireEvent.input(all[all.length - 1], { target: { value } });
};

let clock = 1_700_000_000_000;
afterEach(() => vi.restoreAllMocks());

/** ONE VISIT to a Settings editor: open it on the campaign as it stands, do things, press Save. */
async function visit(
  Component: any, name: string, stored: RulePackOverrides | undefined, steps: Step[], answers: string[] = []
): Promise<RulePackOverrides> {
  const queue = [...answers];
  vi.spyOn(window, 'prompt').mockImplementation(() => queue.shift() ?? null);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  // Fuels, engines and sensors mint their id from the clock; a real GM cannot click twice in one
  // millisecond, a test can.
  vi.spyOn(Date, 'now').mockImplementation(() => ++clock);
  const save = vi.fn();
  const r = render(Component, {
    props: { showModal: true, starmap: { name: 'Contract Reach', rulePackOverrides: stored } as any, ...packsAsThePageMounts(name, stored) },
    events: { save }
  });
  for (const step of steps) await step(r.container);
  await fireEvent.click([...r.container.querySelectorAll('button.primary')].find((b) => /^Save/.test((b.textContent ?? '').trim()))!);
  r.unmount();
  vi.restoreAllMocks();
  expect(save, `${name} did not hand anything back on Save`).toHaveBeenCalledTimes(1);
  // The page's own fold - a section the editor names replaces what was stored.
  return applyEditorOverrides(stored, save.mock.calls[0][0].detail);
}

interface Kind {
  what: string;
  section: keyof RulePackOverrides;
  name: string;
  Component: any;
  /** Add ONE definition, the n-th this test has made. */
  add: (n: number) => { steps: Step[]; answers?: string[] };
  /** Remove the definition added last. */
  remove: Step[];
}

const KINDS: Kind[] = [
  { what: 'custom gas', section: 'gasPhysics', name: 'EditAtmospheresModal', Component: EditAtmospheresModal,
    add: (n) => ({ steps: [click(/Add Custom Gas/)], answers: [`Xq${n}`] }),
    remove: [clickLast('.item-card .delete-btn')] },
  { what: 'custom atmosphere mix', section: 'atmosphereCompositions', name: 'EditAtmospheresModal', Component: EditAtmospheresModal,
    add: (n) => ({ steps: [click(/^Atmosphere Mixes$/), click(/Add Atmosphere Mix/), typeInLast('.item-header .name-input', `Mix ${n}`)] }),
    remove: [click(/^Atmosphere Mixes$/), clickLast('.item-card .delete-btn')] },
  { what: 'custom liquid', section: 'liquids', name: 'EditLiquidsModal', Component: EditLiquidsModal,
    add: (n) => ({ steps: [click(/Add Custom Liquid/)], answers: [`liquid-${n}`] }),
    remove: [clickLast('.item-card .delete-btn')] },
  { what: 'custom fuel', section: 'fuelDefinitions', name: 'EditFuelAndDrivesModal', Component: EditFuelAndDrivesModal,
    add: () => ({ steps: [click(/Add Fuel Type/)] }),
    remove: [clickLast('.item-card .delete-btn')] },
  { what: 'custom engine', section: 'engineDefinitions', name: 'EditFuelAndDrivesModal', Component: EditFuelAndDrivesModal,
    add: () => ({ steps: [click(/^Engine Definitions$/), click(/Add Engine Type/)] }),
    remove: [click(/^Engine Definitions$/), clickLast('.item-card .delete-btn')] },
  { what: 'custom sensor', section: 'sensorDefinitions', name: 'EditSensorsModal', Component: EditSensorsModal,
    add: () => ({ steps: [click(/Add Sensor Definition/)] }),
    remove: [clickLast('.item-card .delete-btn')] },
  { what: 'custom morphology', section: 'morphologies', name: 'EditBiospheresModal', Component: EditBiospheresModal,
    add: (n) => ({ steps: [click(/Add a morphology/)], answers: [`morph-${n}`] }),
    // The morphology rows are the FIRST `.rows`; the pigment list further down is a second one.
    remove: [async (c) => { const b = [...c.querySelector('.rows')!.querySelectorAll('button.mini.danger')]; await fireEvent.click(b[b.length - 1]); }] },
  { what: 'custom pigment', section: 'pigments', name: 'EditBiospheresModal', Component: EditBiospheresModal,
    add: (n) => ({ steps: [click(/Add a pigment/)], answers: [`pigment-${n}`] }),
    remove: [clickLast('.pigment-ref .rows button.mini.danger')] }
];

const count = (o: RulePackOverrides | undefined, section: keyof RulePackOverrides) =>
  authoredCounts(o, SHIPPED)[section as string] ?? 0;

describe('a second custom definition does not delete the first - every Settings editor', () => {
  for (const kind of KINDS) {
    it(`ONE PER VISIT: a ${kind.what} made on a second visit joins the one made on the first`, async () => {
      const first = kind.add(1);
      let stored = await visit(kind.Component, kind.name, undefined, first.steps, first.answers);
      expect(count(stored, kind.section), `after the first visit`).toBe(1);
      const second = kind.add(2);
      stored = await visit(kind.Component, kind.name, stored, second.steps, second.answers);
      expect(count(stored, kind.section), `after the second visit - the first ${kind.what} must still be there`).toBe(2);
      const third = kind.add(3);
      stored = await visit(kind.Component, kind.name, stored, third.steps, third.answers);
      expect(count(stored, kind.section), `after the third visit`).toBe(3);
    });

    it(`TWO IN ONE VISIT: both ${kind.what} definitions are stored`, async () => {
      const a = kind.add(1), b = kind.add(2);
      const stored = await visit(kind.Component, kind.name, undefined, [...a.steps, ...b.steps], [...(a.answers ?? []), ...(b.answers ?? [])]);
      expect(count(stored, kind.section)).toBe(2);
    });

    it(`AN UNCHANGED VISIT keeps both ${kind.what} definitions`, async () => {
      const a = kind.add(1), b = kind.add(2);
      let stored = await visit(kind.Component, kind.name, undefined, [...a.steps, ...b.steps], [...(a.answers ?? []), ...(b.answers ?? [])]);
      stored = await visit(kind.Component, kind.name, stored, []);
      expect(count(stored, kind.section)).toBe(2);
    });
  }

  it('A TWEAK TO A SHIPPED GAS survives adding a custom gas on a later visit, and the other way round', async () => {
    // Visit one: change a number on a gas the app ships.
    const shippedGas = Object.keys((SHIPPED as any).gasPhysics)[0];
    let stored = await visit(EditAtmospheresModal, 'EditAtmospheresModal', undefined, [async (c) => {
      const card = [...c.querySelectorAll('.item-card')].find((x) => x.querySelector('.formula')?.textContent === shippedGas)!;
      await fireEvent.input(card.querySelector('input[type="number"]')!, { target: { value: '0.999' } });
    }]);
    expect(stored.gasPhysics?.[shippedGas]?.molarMass).toBe(0.999);
    // Visit two: add a custom gas. The tweak must still be stored beside it.
    stored = await visit(EditAtmospheresModal, 'EditAtmospheresModal', stored, [click(/Add Custom Gas/)], ['Xq']);
    expect(Object.keys(stored.gasPhysics ?? {}).sort()).toEqual([shippedGas, 'Xq'].sort());
    expect(stored.gasPhysics?.[shippedGas]?.molarMass).toBe(0.999);
  });

  it('A VISIT TO ONE EDITOR never touches another editor\'s definitions', async () => {
    let stored: RulePackOverrides | undefined;
    for (const kind of KINDS) {
      const a = kind.add(1);
      stored = await visit(kind.Component, kind.name, stored, a.steps, a.answers);
    }
    for (const kind of KINDS) expect(count(stored, kind.section), kind.what).toBe(1);
  });
});

describe('how the page mounts the Settings editors (DATA-R47)', () => {
  it('EVERY editor that writes definitions back is diffed against the SHIPPED pack', () => {
    for (const name of new Set(KINDS.map((k) => k.name))) {
      expect(pageTag(name), name).toMatch(/\brulePack=\{selectedRulepack\}/);
      expect(pageTag(name), name).toMatch(/on:save=\{\(e\) => applyStarmapOverrides\(e\.detail\)\}/);
    }
  });

  it('the page folds a save through `applyEditorOverrides`, the function this gate drives', () => {
    const from = PAGE.indexOf('function applyStarmapOverrides');
    expect(PAGE.slice(from, from + 700)).toMatch(/applyEditorOverrides\(s\.rulePackOverrides, overrides\)/);
  });

  it('B132 still holds: the gas editor offers a custom liquid to condense into, from the effective pack', async () => {
    expect(pageTag('EditAtmospheresModal')).toMatch(/effectivePack=\{effectiveRulePack \?\? selectedRulepack\}/);
    // And the dropdown really carries it, mounted as the page mounts it.
    const stored = await visit(EditLiquidsModal, 'EditLiquidsModal', undefined, [click(/Add Custom Liquid/)], ['liquid-unobtainium']);
    expect(allLiquids(buildEffectiveRulePack(SHIPPED, stored)!).map((l) => l.name)).toContain('liquid-unobtainium');
    const r = render(EditAtmospheresModal, {
      props: { showModal: true, starmap: { rulePackOverrides: stored } as any, ...packsAsThePageMounts('EditAtmospheresModal', stored) }
    });
    const offered = new Set([...r.container.querySelectorAll('select option')].map((o) => o.getAttribute('value')));
    // A cloud dropdown only renders for a gas that condenses; the shipped pack has several.
    expect(offered.has('water'), 'a cloud dropdown is on screen').toBe(true);
    expect(offered.has('liquid-unobtainium')).toBe(true);
    r.unmount();
  });
});
