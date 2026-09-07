// THE FIELD HELP HAS TO STAY TRUE, AND THESE ARE THE TWO WAYS IT GOES STALE.
//
// 1. A FIELD GAINS A "?" AND NEVER GETS AN ENTRY, or an entry is written for a field that has since
//    been renamed. Both leave a GM staring at the thing that started this: a number with no account
//    of itself. The editor's own markup is the authority for which fields exist, so this walks it.
// 2. A `reads` LINE NAMES A FILE THAT HAS MOVED. Every entry says where the engine reads the value,
//    by filename, because that is what lets the next person to change the physics find the sentence
//    they are about to falsify. A path that no longer resolves is a promise that has quietly lapsed.
//
// This is the [[D5]] discipline applied at field scale: the tag docs went 120 versions stale because
// nothing failed when they did.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GAS_FIELD_HELP, kindLabel, kindBlurb, placePopover, type FieldHelpKind } from './fieldHelp';

const EDITOR = resolve('src/lib/components/EditAtmospheresModal.svelte');

describe('gas field help', () => {
  const markup = readFileSync(EDITOR, 'utf-8');

  it('has an entry for every field the gas editor puts a "?" on', () => {
    const wired = [...markup.matchAll(/GAS_FIELD_HELP\.(\w+)/g)].map((m) => m[1]);
    expect(wired.length, 'the editor renders no FieldHelp at all').toBeGreaterThan(0);
    const missing = wired.filter((k) => !(k in GAS_FIELD_HELP));
    expect(missing, `wired in the editor with no entry: ${missing.join(', ')}`).toEqual([]);
  });

  it('puts a "?" on every editable field in the derivation block', () => {
    // The block the user got lost in. Every `bind:value={gas.X}` inside it should have help beside
    // it — an editable number with no explanation is exactly the fault this was built for.
    const block = markup.slice(
      markup.indexOf('Derivation &mdash; what the physics reads'),
      markup.indexOf('Cloud Formation') > 0 ? markup.indexOf('Cloud Formation') : undefined
    );
    const bound = [...block.matchAll(/bind:value=\{gas\.(\w+)\}/g)].map((m) => m[1]);
    const helped = new Set([...block.matchAll(/GAS_FIELD_HELP\.(\w+)/g)].map((m) => m[1]));
    const bare = [...new Set(bound)].filter((f) => !helped.has(f));
    expect(bare, `editable in the derivation block with no "?": ${bare.join(', ')}`).toEqual([]);
  });

  it('names a file that exists in every "what reads it" line', () => {
    const broken: string[] = [];
    for (const [key, help] of Object.entries(GAS_FIELD_HELP)) {
      for (const path of help.reads?.match(/[\w/]+\/[\w.]+\.ts/g) ?? []) {
        if (!existsSync(resolve('src/lib', path))) broken.push(`${key}: ${path}`);
      }
    }
    expect(broken, `named in a "what reads it" line but not on disk:\n  ${broken.join('\n  ')}`).toEqual([]);
  });

  // ABSOLUTE, NOT A RATIO. Every entry must answer the three questions the user actually asked —
  // what is it, is there a right answer to look up, and what do real values look like.
  it('answers what it is, which kind it is, and what a real value looks like', () => {
    const thin: string[] = [];
    for (const [key, help] of Object.entries(GAS_FIELD_HELP)) {
      if (!help.label.trim()) thin.push(`${key}: no label`);
      if ((help.what ?? '').length < 40) thin.push(`${key}: 'what' is too thin to answer anything`);
      if (!['measured', 'model', 'unread'].includes(help.kind)) thin.push(`${key}: bad kind`);
      // An unread field has no meaningful range to quote and needs its note instead; everything
      // else must show the reader what a real value looks like.
      if (help.kind !== 'unread' && !help.range) thin.push(`${key}: no example values`);
      if (help.kind === 'unread' && !help.note) thin.push(`${key}: unread and unexplained`);
    }
    expect(thin, thin.join('\n  ')).toEqual([]);
  });

  it('says of the model coefficients that they are invented, and of the unread one that nothing reads it', () => {
    // The two sentences that would have saved the afternoon this was written for.
    expect(GAS_FIELD_HELP.greenhouse.note).toMatch(/NOT GWP/);
    expect(GAS_FIELD_HELP.greenhouse.kind).toBe('model');
    expect(GAS_FIELD_HELP.radiativeCooling.kind).toBe('unread');
    expect(GAS_FIELD_HELP.radiativeCooling.reads).toMatch(/^Nothing\./);
    // And the chip wording has to survive, because the chip is what a reader takes in first.
    for (const k of ['measured', 'model', 'unread'] as FieldHelpKind[]) {
      expect(kindLabel(k).length).toBeGreaterThan(0);
      expect(kindBlurb(k).length).toBeGreaterThan(0);
    }
  });
});

// THE PANEL WAS CLIPPED, AND THAT IS WHY THIS IS ARITHMETIC RATHER THAN CSS. Measured on the real
// gas editor before the fix: the panel overflowed the modal's scrolling body by 146 px, losing its
// bottom - the "typical values" and the note, which is the half a reader actually needs. Positioning
// it `fixed` escapes the scroller; these pin that it lands somewhere usable.
const VP = { width: 1280, height: 720 };
describe('help panel placement', () => {
  it('drops below the button when there is room', () => {
    const box = placePopover({ left: 500, top: 200, bottom: 215 }, VP);
    expect(box.top).toBeGreaterThan(215);
    expect(box.maxH).toBeGreaterThan(400 - 1);
  });

  it('flips above when the button is near the bottom - the case that was cut off', () => {
    // A field low in a long list: 40 px below it, 640 above.
    const box = placePopover({ left: 500, top: 665, bottom: 680 }, VP);
    expect(box.top, 'it should sit above the button').toBeLessThan(665);
    expect(box.top + box.maxH, 'and must not run off the bottom').toBeLessThanOrEqual(VP.height);
    expect(box.maxH).toBeGreaterThanOrEqual(160);
  });

  it('never runs off any edge, wherever the button is', () => {
    for (const left of [0, 4, 640, 1200, 1279]) {
      for (const top of [0, 8, 300, 700, 719]) {
        const box = placePopover({ left, top, bottom: Math.min(top + 15, VP.height) }, VP);
        expect(box.left, `left edge at ${left},${top}`).toBeGreaterThanOrEqual(12);
        expect(box.left + 380, `right edge at ${left},${top}`).toBeLessThanOrEqual(VP.width - 12 + 0.001);
        expect(box.top, `top edge at ${left},${top}`).toBeGreaterThanOrEqual(12);
        expect(box.top + box.maxH, `bottom edge at ${left},${top}`).toBeLessThanOrEqual(VP.height + 0.001);
        expect(box.maxH, `usable height at ${left},${top}`).toBeGreaterThanOrEqual(160);
      }
    }
  });

  it('fits a narrow phone without hanging off the side', () => {
    const box = placePopover({ left: 300, top: 400, bottom: 415 }, { width: 375, height: 812 });
    expect(box.left).toBeGreaterThanOrEqual(12);
    expect(box.left).toBeLessThanOrEqual(375 - 12);
  });
});
