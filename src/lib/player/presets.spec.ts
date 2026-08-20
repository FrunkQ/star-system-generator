// The shipped six. These were tuned by the owner in the live editor and exported; this file is what
// stops them drifting back to something nobody looked at.
//
// It deliberately does NOT restate every field — that would just be the preset written twice, and a
// test you have to edit in lockstep with the thing it guards is a test people delete. It pins the
// choices that carry intent, plus the two structural properties that are easy to break by accident.
import { describe, it, expect } from 'vitest';
import { BUILTIN_PRESETS, DEFAULT_PRESET, normalizePreset, holoStyleOf, systemStageStyle } from './presets';

const byId = Object.fromEntries(BUILTIN_PRESETS.map((p) => [p.id, p]));

describe('the shipped six', () => {
  it('is exactly these six, in this order — the picker reads top-left to bottom-right', () => {
    expect(BUILTIN_PRESETS.map((p) => p.id))
      .toEqual(['guide', 'datapad', 'console', 'crt', 'holo', 'projection']);
  });

  it('every one is marked builtIn, or it would be deletable and editable in place', () => {
    for (const p of BUILTIN_PRESETS) expect(p.builtIn).toBe(true);
  });

  it('every one carries a description — it is the only prose on the picker card', () => {
    for (const p of BUILTIN_PRESETS) expect(p.description.length).toBeGreaterThan(10);
  });

  // A preset is written as a DELTA from DEFAULT_PRESET, so anything it does not name it inherits.
  // normalizePreset is what fills those in for a preset loaded from an older campaign; if a built-in
  // does not survive it unchanged, the two paths disagree about what the preset IS.
  it('survives normalizePreset unchanged — the load path and the code path must agree', () => {
    for (const p of BUILTIN_PRESETS) {
      expect(normalizePreset(structuredClone(p))).toEqual(expect.objectContaining({ id: p.id, name: p.name }));
      const n = normalizePreset(structuredClone(p));
      for (const k of Object.keys(p) as (keyof typeof p)[]) {
        if (k === 'cover' || k === 'filterParams' || k === 'starmapOverlay' || k === 'systemOverlay') continue;
        expect([k, n[k]]).toEqual([k, p[k]]);
      }
    }
  });

  describe('the intent of each', () => {
    it('The Guide is the illustrated one: rainbow, guide tips, a cover, and oversized type', () => {
      const p = byId.guide;
      expect(p.accentColor).toBe('rainbow');
      expect(p.guideTips).toBe('both');
      expect(p.cover.enabled).toBe(true);
      expect(p.systemView).toBe('document');
      expect(p.starmapFontScale).toBeGreaterThan(1.4);
    });

    it('Datapad is company-issue: a branded cover and a watermark on BOTH stages', () => {
      const p = byId.datapad;
      expect(p.cover.graphic?.assetId).toBe('builtin-wy-logo');
      expect(p.starmapOverlay?.assetId).toBe('builtin-wy-logo');
      expect(p.systemOverlay?.assetId).toBe('builtin-wy-logo');
      expect(p.liveReadings).toBe(true); // an instrument reads what is in the tanks now
    });

    it('Console reads distances honestly — the tightest spread of the six, on a scaled grid', () => {
      const p = byId.console;
      expect(p.compression).toBeLessThan(0.5);
      expect(p.grid).toBe('scaled');
      expect(p.liveReadings).toBe(true);
      expect(p.constellationLabelSize).toBeGreaterThan(0); // the only one that NAMES the charted stars
    });

    it('CRT ships a fully tuned filter, not the defaults — it is the worked example', () => {
      const p = byId.crt;
      expect(p.filter).toBe('crt');
      // More than just the phosphor: scanlines, vignette, skew, tearing.
      expect(Object.keys(p.filterParams).length).toBeGreaterThan(6);
      expect(p.listStyle).toBe('cards'); // the blocky terminal feel
      expect(p.bodyStyle).toBe('white'); // bleached, so the tint has one palette to work on
    });

    it('Holo is the only preset whose STARMAP is 3D as well, with the depth curtain on', () => {
      const p = byId.holo;
      expect(p.starmapView).toBe('holo3d');
      expect(p.systemView).toBe('holo3d');
      expect(p.starmapGridDepth).toBeGreaterThan(0);
      expect(p.markerStyle).toBe('pin');
    });

    it('Projection is a DISPLAY: it follows the GM and cannot be poked', () => {
      const p = byId.projection;
      expect(p.followGM).toBe(true);
      expect(p.interactive).toBe(false);
      expect(p.orbitSpeed).toBeGreaterThan(0); // alive on a table nobody is touching
    });
  });

  // The six exist to show the tool off as much as to be used. If a future edit collapses them onto one
  // look, this is what says so.
  it('between them they exercise the engine rather than repeating one look', () => {
    const distinct = (f: (p: (typeof BUILTIN_PRESETS)[number]) => unknown) => new Set(BUILTIN_PRESETS.map(f)).size;
    expect(distinct((p) => p.systemView)).toBeGreaterThanOrEqual(3);
    expect(distinct((p) => p.starmapView)).toBeGreaterThanOrEqual(2);
    expect(distinct((p) => p.transition)).toBeGreaterThanOrEqual(4);
    expect(distinct((p) => p.font)).toBeGreaterThanOrEqual(4);
    expect(distinct((p) => p.bodyGfx)).toBeGreaterThanOrEqual(2);
    expect(BUILTIN_PRESETS.filter((p) => p.cover.enabled).length).toBeGreaterThanOrEqual(3);
    expect(BUILTIN_PRESETS.filter((p) => p.filter !== 'none').length).toBeGreaterThanOrEqual(1);
  });

  it('leaves DEFAULT_PRESET alone — a delta must not mutate the base it spreads from', () => {
    expect(DEFAULT_PRESET.id).toBe('default');
    expect(DEFAULT_PRESET.builtIn).toBeUndefined();
    expect(DEFAULT_PRESET.cover.enabled).toBe(false);
    expect(DEFAULT_PRESET.filter).toBe('none');
  });
});

// The two 3D maps drew body/system names in DIFFERENT colours: the starmap took the preset's accent
// (`mono ? '#dfe6f0' : accentColor`), the system map passed null and kept a fixed pale blue. Both
// choices were defensible alone — the system map's comment argued a neutral base is truest under a
// CRT filter — and together they were a theme that only applied to half the app. One rule now, and
// this pins it as ONE rule rather than two that happen to agree.
describe('label colour is the same rule on both 3D maps', () => {
  it('takes the preset accent', () => {
    expect(holoStyleOf({ ...DEFAULT_PRESET, accentColor: '#ff8800' }).labelColor).toBe('#ff8800');
  });

  it('flattens the rainbow sentinel rather than handing a canvas a keyword', () => {
    const c = holoStyleOf({ ...DEFAULT_PRESET, accentColor: 'rainbow' }).labelColor!;
    expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('goes neutral in the monochrome body style, matching the starmap mono branch exactly', () => {
    expect(holoStyleOf({ ...DEFAULT_PRESET, bodyStyle: 'white', accentColor: '#ff8800' }).labelColor).toBe('#dfe6f0');
  });

  it('survives the 2D flattening, which only overrides camera fields', () => {
    const p = { ...DEFAULT_PRESET, systemView: 'diagram2d' as const, accentColor: '#22cc99' };
    expect(systemStageStyle(p).labelColor).toBe('#22cc99');
  });

  it('never yields undefined for a real preset, or the scene falls back to its own default', () => {
    for (const a of ['#123456', 'rainbow', '', undefined]) {
      expect(holoStyleOf({ ...DEFAULT_PRESET, accentColor: a as string }).labelColor).toBeTruthy();
    }
  });
});
