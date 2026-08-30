// B112 — A SAVE DESCRIBES WHAT THE GM MADE, NOT WHAT THE APP SHIPS.
//
// Found by the Creator Hub, 2026-08-28, deriving facets from real save files: `temporal_registry` in
// every real starmap holds exactly the four shipped calendars, `coiCategories` the nine shipped tag
// categories, `reasonsConfig` the enabled-state of all of them. The GM authored none of it. A facet
// counting custom calendars therefore fired on every map ever made, and the only cure available to a
// reader was to hardcode a baseline of this repo's shipped names and subtract it — a list that must
// be kept in step with this repo forever.
//
// THE FAULT IS IN THE FILE, NOT THE FACET: nothing reading a save could tell "this campaign uses a
// custom reckoning" from "this campaign was saved by Star System Explorer".
//
// It is emphatically NOT a size item, and the hub measured it so nobody argues: the shipped-defaults
// block is under 4% of a 327 KB save, while 45% is the pretty-printing that makes the file
// hand-editable and diffable — a deliberate, correct trade that this must not touch.
//
// THE LAST TEST IS THE ONE THAT MATTERS. This is a SERIALISATION change, not a data-model change:
// a file written before it must load to exactly the same campaign as one written after.
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync } from 'fs';
import { tagCategories, tagRulesEnabled, pristineTagCategories } from '$lib/tags/tagCategories';
import { coiForStarmap, mergeStarmapCoIs, coiCategories } from '$lib/constructs/coi';
import { reasonsConfigForStarmap, applyStarmapReasonsConfig, reasonsConfig } from '$lib/physics/reasonsToVisit';
import {
  applyTemporalRegistryConfig, temporalForExport, ensureTemporalState, createDefaultTemporalState
} from '$lib/temporal/defaults';
import { registriesForStarmap } from '$lib/io/saveRegistries';
import { canonicalJson } from '$lib/io/shippedDefaults';
import type { Starmap, TemporalState } from '$lib/types';

const SHIPPED_CALENDARS = JSON.parse(readFileSync('static/temporal/calendars.json', 'utf8'));
const OLD_SAVE = JSON.parse(readFileSync('tests/fixtures/b112-pre-delta-starmap.json', 'utf8'));

// The shipped calendar library reaches the app by fetch, which no test has. Adopt it explicitly so
// these run against the four real calendars rather than the built-in single fallback.
function useShippedCalendars() {
  applyTemporalRegistryConfig(SHIPPED_CALENDARS);
}

// Every one of these mutates app-wide stores, so each starts from the untouched app.
const PRISTINE = pristineTagCategories();
beforeEach(() => {
  tagCategories.set(PRISTINE.map((c) => structuredClone(c)));
  tagRulesEnabled.set(true);
  useShippedCalendars();
});

describe('B112 — a save carries the GM\'s registries, not the app\'s', () => {
  // ACCEPTANCE 1: "Open a fresh campaign, add nothing, export."
  it('a fresh campaign with nothing added exports NOTHING of the app\'s own library', () => {
    const registries = registriesForStarmap();
    expect(registries.coiCategories, 'nine shipped categories were being written as the GM\'s').toBeUndefined();
    expect(registries.reasonsConfig, 'a switchboard nobody touched says nothing').toBeUndefined();
    expect(registries.poiPacks, 'an empty array is not a statement').toBeUndefined();

    const temporal = temporalForExport(createDefaultTemporalState());
    expect(Object.keys(temporal!.temporal_registry), 'four shipped calendars').toEqual([]);
  });

  // ACCEPTANCE 2: "Add one custom calendar, export. It should be the only one in the file."
  it('one custom calendar is the only calendar in the file', () => {
    const base = createDefaultTemporalState();
    const withCustom: TemporalState = {
      ...base,
      activeCalendarKey: 'Thousand Suns Reckoning',
      temporal_registry: {
        ...base.temporal_registry,
        'Thousand Suns Reckoning': {
          id: 'THOUSAND_SUNS', math_type: 'RATIO_LINEAR', epoch_offset_t: '435084632967250575',
          format: 'TS {val}', parameters: { units_per_earth_year: 1000, seconds_per_earth_year: 31557600, precision_digits: 2 }
        }
      } as TemporalState['temporal_registry']
    };
    const out = temporalForExport(withCustom)!;
    expect(Object.keys(out.temporal_registry)).toEqual(['Thousand Suns Reckoning']);
    // …and WHICH reckoning the campaign runs on is the GM's decision, so it is still recorded
    expect(out.activeCalendarKey).toBe('Thousand Suns Reckoning');
  });

  it('a SHIPPED calendar the GM has edited is written in full — an alteration is authorship', () => {
    const base = createDefaultTemporalState();
    const edited = structuredClone(base.temporal_registry);
    (edited['Earth Gregorian'] as any).format = '{year} of the Long Peace';
    const out = temporalForExport({ ...base, temporal_registry: edited })!;
    expect(Object.keys(out.temporal_registry)).toEqual(['Earth Gregorian']);
    expect((out.temporal_registry['Earth Gregorian'] as any).format).toBe('{year} of the Long Peace');
  });

  it('a category the GM added, or edited, is the only one exported', () => {
    // add one
    tagCategories.update((cs) => [...cs, {
      id: 'allegiance', shortName: 'Allegiance', longName: 'Allegiance', color: '#8844cc',
      appliesTo: ['construct'], enabled: true, tags: [{ key: 'allegiance/hegemony', label: 'The Hegemony' }], rules: []
    } as never]);
    expect(coiForStarmap().map((c) => c.id)).toEqual(['allegiance']);

    // …and editing a shipped one counts too
    tagCategories.update((cs) => cs.map((c) => (c.id === 'drive' ? { ...c, longName: 'Propulsion' } : c)));
    expect(coiForStarmap().map((c) => c.id).sort()).toEqual(['allegiance', 'drive']);
  });

  it('only the switches the GM actually moved are recorded', () => {
    expect(reasonsConfigForStarmap()).toBeUndefined();

    tagCategories.update((cs) => cs.map((c) => (c.id === 'science' ? { ...c, enabled: false } : c)));
    const cfg = reasonsConfigForStarmap()!;
    expect(cfg.categories).toEqual({ science: false });

    // the master switch is its own statement
    tagRulesEnabled.set(false);
    expect(reasonsConfigForStarmap()!.enabled).toBe(false);
  });

  // WHY THE COMPARISON IS ON VALUES AND NOT ON TEXT. `io/bundle.ts` sets out the plain .json save as
  // the file "GMs hand-edit them, diff them, and swap art in them" — so a save that has been through
  // a text editor, a formatter or any other tool is an ORDINARY input, and such a tool is free to
  // reorder the keys inside an object. Compared as text, a shipped calendar with its keys in a
  // different order is a calendar the GM wrote, and the app writes the whole library back into the
  // next save. Same content, same calendar, and the file must not start claiming otherwise.
  it('a shipped calendar whose keys have been reordered is still ours, not the GM\'s', () => {
    const base = createDefaultTemporalState();
    const shuffled = structuredClone(base.temporal_registry);
    const greg = shuffled['Earth Gregorian'] as Record<string, unknown>;
    // exactly the same calendar, written out back-to-front — as a formatter or a hand edit may leave it
    shuffled['Earth Gregorian'] = Object.fromEntries(Object.entries(greg).reverse()) as never;
    expect(JSON.stringify(shuffled['Earth Gregorian']), 'the text really did change')
      .not.toBe(JSON.stringify(greg));

    const out = temporalForExport({ ...base, temporal_registry: shuffled })!;
    expect(Object.keys(out.temporal_registry), 'nothing was authored, so nothing is written').toEqual([]);
  });

  // THE ROUND TRIP THAT ACTUALLY HAPPENS: a GM opens a campaign saved last month and saves it again.
  //
  // This is the case the value-comparison exists for, and a falsification pass is what found that
  // out. `mergeStarmapCoIs` rebuilds every category it loads with its OWN key order, which is not
  // the order the seeded store uses — so a comparison by plain `JSON.stringify` calls all nine
  // shipped categories "edited by the GM" the moment a save has been through a load, and writes the
  // whole library straight back into the next file. The fix would have looked like it worked on a
  // fresh campaign and done nothing at all for anybody with an existing one.
  it('opening a pre-B112 save and saving it again does NOT write the app\'s library back', () => {
    loadRegistries(OLD_SAVE);
    expect(coiForStarmap().map((c) => c.id), 'only the GM\'s category survives a re-save').toEqual(['allegiance']);

    // The switchboard keeps exactly two entries, and BOTH are honest — this assertion was written
    // as `toBeUndefined()` first and the failure taught something worth keeping:
    //   `allegiance` is the GM's own category, so its switch is the GM's too;
    //   `intrigue` ships DISABLED and the file has it enabled, which is a real difference.
    // The second is also the honest limit of a delta: this build cannot know whether an OLDER build
    // shipped `intrigue` enabled, so a first re-save may carry forward a switch nobody moved. That
    // errs towards KEEPING the GM's data rather than dropping it, which is the right way to be
    // wrong, and it only ever affects the first re-save of a pre-B112 file.
    expect(registriesForStarmap().reasonsConfig).toEqual({
      enabled: true,
      categories: { allegiance: true, intrigue: true }
    });
    // …and what is NOT there is the whole point: the seven shipped switches nobody touched.
    const carried = Object.keys((registriesForStarmap().reasonsConfig as any).categories);
    expect(carried).not.toContain('science');
    expect(carried).not.toContain('status');
    expect(carried.length, 'thirteen switches went in; two come out').toBe(2);
  });

  // ACCEPTANCE 3, AND THE ONE THAT MATTERS: old file and new file, same campaign, same result.
  it('a save written BEFORE this change loads to exactly the same campaign as one written after', () => {
    // (a) load the old file — the full shipped registries, as every real save on record carries them
    const afterOld = loadRegistries(OLD_SAVE);

    // (b) re-export it the NEW way, from the very state the old file just produced…
    const delta = {
      temporal: temporalForExport(afterOld.temporal),
      ...registriesForStarmap()
    };
    // …the delta really is smaller: the app's library is gone and the GM's is not
    expect(Object.keys(delta.temporal!.temporal_registry)).toEqual(['Thousand Suns Reckoning']);
    expect((delta.coiCategories as any[]).map((c) => c.id)).toEqual(['allegiance']);

    // (c) load THAT, from a fresh app, and demand the identical campaign
    tagCategories.set(PRISTINE.map((c) => structuredClone(c)));
    tagRulesEnabled.set(true);
    const afterNew = loadRegistries({ ...OLD_SAVE, ...delta, coiCategories: delta.coiCategories });

    expect(canonicalJson(afterNew.cois)).toBe(canonicalJson(afterOld.cois));
    expect(canonicalJson(afterNew.reasons)).toBe(canonicalJson(afterOld.reasons));
    expect(canonicalJson(afterNew.temporal)).toBe(canonicalJson(afterOld.temporal));

    // and the GM's own work is present in both, which is the point of the exercise
    expect(afterNew.cois.some((c) => c.id === 'allegiance')).toBe(true);
    expect(afterNew.temporal!.temporal_registry['Thousand Suns Reckoning']).toBeTruthy();
    expect(afterNew.temporal!.activeCalendarKey).toBe('Thousand Suns Reckoning');
    // …as is the app's library, put back by the load path where it belongs
    expect(Object.keys(afterNew.temporal!.temporal_registry).sort())
      .toEqual([...Object.keys(SHIPPED_CALENDARS.temporal_registry), 'Thousand Suns Reckoning'].sort());
  });
});

/** The three load-side calls `openStarmapPayload` makes, in its order. */
function loadRegistries(doc: any) {
  applyStarmapReasonsConfig(doc.reasonsConfig);
  mergeStarmapCoIs(doc.coiCategories);
  const map = ensureTemporalState({ ...doc } as Starmap);
  return { cois: get(coiCategories), reasons: get(reasonsConfig), temporal: map.temporal };
}
