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

  // The two properties that make Projection a projection are DRIVER properties, not camera ones. It
  // was also asserted `lockOverhead` here, and that stopped being true when the owner rebuilt the
  // preset on the tilted 3D table (2026-08-17) — overhead was one way to make a table plate, never
  // the definition. The camera behaviour it was really guarding is tested below, on its own fixture.
  it('Projection is a normal card: GM-driven and non-interactive — not a separate category', () => {
    const proj = BUILTIN_PRESETS.find((p) => p.id === 'projection')!;
    expect(proj.followGM).toBe(true);
    expect(proj.interactive).toBe(false);
  });

  it('The Guide reproduces DON\'T PANIC on its cover', () => {
    const guide = BUILTIN_PRESETS.find((p) => p.id === 'guide')!;
    expect(guide.cover.enabled).toBe(true);
    expect(guide.cover.title).toMatch(/^DON'T PANIC/);
  });

  it('CRT built-in uses the single crt filter with a phosphor colour param', () => {
    const crt = BUILTIN_PRESETS.find((p) => p.id === 'crt')!;
    expect(crt.filter).toBe('crt');
    expect(crt.filterParams.phosphor).toBe(CRT_GREEN);
  });

  // Tested on its OWN fixture rather than by borrowing whichever shipped preset happens to set the
  // flag. It used to read `projection`, which tied a rule about holoStyleOf to a preset the owner is
  // free to retune — and did, at which point a true statement about the code failed.
  it('lockOverhead forces the holo tilt to top-down', () => {
    const tilted = { ...DEFAULT_PRESET, angleDeg: 64, lockOverhead: false };
    const pinned = { ...DEFAULT_PRESET, angleDeg: 64, lockOverhead: true };
    expect(holoStyleOf(pinned).angleDeg).toBe(0);
    expect(holoStyleOf(tilted).angleDeg).toBe(64);
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
