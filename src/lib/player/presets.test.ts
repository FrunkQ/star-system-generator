import { describe, it, expect } from 'vitest';
import {
  BUILTIN_PRESETS, DEFAULT_PRESET, holoStyleOf, holoPresetToPlayer,
  makePresetId, duplicatePreset, CRT_GREEN, CRT_AMBER
} from './presets';

describe('unified player presets', () => {
  it('ships the six built-ins, all flagged builtIn with unique ids', () => {
    expect(BUILTIN_PRESETS).toHaveLength(6);
    expect(BUILTIN_PRESETS.every((p) => p.builtIn)).toBe(true);
    const ids = BUILTIN_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    // every field of the schema is present (built on DEFAULT_PRESET)
    for (const p of BUILTIN_PRESETS) {
      expect(Object.keys(DEFAULT_PRESET).every((k) => k in p)).toBe(true);
    }
  });

  it('Projection is a normal card: GM-driven, non-interactive, overhead — not a separate category', () => {
    const proj = BUILTIN_PRESETS.find((p) => p.id === 'projection')!;
    expect(proj.followGM).toBe(true);
    expect(proj.interactive).toBe(false);
    expect(proj.lockOverhead).toBe(true);
  });

  it('The Guide reproduces DON\'T PANIC on its cover', () => {
    const guide = BUILTIN_PRESETS.find((p) => p.id === 'guide')!;
    expect(guide.cover.enabled).toBe(true);
    expect(guide.cover.title).toBe("DON'T PANIC");
  });

  it('CRT built-in uses the single crt filter with a phosphor colour param', () => {
    const crt = BUILTIN_PRESETS.find((p) => p.id === 'crt')!;
    expect(crt.filter).toBe('crt');
    expect(crt.filterParams.phosphor).toBe(CRT_GREEN);
  });

  it('lockOverhead forces the holo tilt to top-down', () => {
    const proj = BUILTIN_PRESETS.find((p) => p.id === 'projection')!;
    expect(holoStyleOf(proj).angleDeg).toBe(0);
    const holo = BUILTIN_PRESETS.find((p) => p.id === 'holo')!;
    expect(holoStyleOf(holo).angleDeg).toBe(holo.angleDeg);
  });

  it('migrates old green/amber holo presets onto the consolidated crt+phosphor', () => {
    const green = holoPresetToPlayer({ id: 'g', name: 'Old Green', filter: 'retro_sci_fi_green' } as any);
    expect(green.filter).toBe('crt');
    expect(green.filterParams.phosphor).toBe(CRT_GREEN);
    expect(green.systemView).toBe('holo3d');

    const amber = holoPresetToPlayer({ id: 'a', name: 'Old Amber', filter: 'retro_sci_fi_amber' } as any);
    expect(amber.filterParams.phosphor).toBe(CRT_AMBER);
  });

  it('makePresetId is deterministic and de-duplicates', () => {
    expect(makePresetId('My Look', [])).toBe('pp-my-look');
    expect(makePresetId('My Look', ['pp-my-look'])).toBe('pp-my-look-2');
    expect(makePresetId('My Look', ['pp-my-look', 'pp-my-look-2'])).toBe('pp-my-look-3');
  });

  it('duplicatePreset yields an editable, uniquely-named copy', () => {
    const src = BUILTIN_PRESETS.find((p) => p.id === 'holo')!;
    const copy = duplicatePreset(src, BUILTIN_PRESETS.map((p) => p.id));
    expect(copy.builtIn).toBe(false);
    expect(copy.name).toBe('Holo Table copy');
    expect(copy.systemView).toBe('holo3d');
    expect(copy.id).not.toBe(src.id);
  });
});
