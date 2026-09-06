import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import { drawsHeavy } from './lowPowerStore';

// Owner, 2026-09-06: "checkbox in the corner for low power machines... on GM view (option on player
// views). Just strip resource hungry transparencies (atmospheres)".
//
// The switch describes THE MACHINE. That is what makes it different from every other view setting in
// this app, and it is the whole reason it is allowed to reach a player view where the GM's
// orbit-line strength is not ([[A10]]/[[A3]]): a weak GPU is weak whoever is looking at it.

describe('low power composes with the preset, and off wins', () => {
  it('drops a shell if EITHER the picture or the machine says so', () => {
    expect(drawsHeavy(true, false)).toBe(true);      // wanted, and the machine can
    expect(drawsHeavy(true, true)).toBe(false);      // the machine cannot
    expect(drawsHeavy(false, false)).toBe(false);    // the preset said no
    expect(drawsHeavy(false, true)).toBe(false);     // both said no
  });

  it('treats an ABSENT preset field as wanted, which is what every saved preset relies on', () => {
    // `atmospheres?: boolean` is optional and every preset written before it existed has no value at
    // all. Reading undefined as "off" would strip the clouds from every campaign ever saved.
    expect(drawsHeavy(undefined, false)).toBe(true);
    expect(drawsHeavy(undefined, true)).toBe(false);
  });

  it('never lets low power turn something back ON', () => {
    // The composition is one-way on purpose: each switch answers a different question and neither
    // has the standing to overrule the other in the direction of MORE work.
    for (const wanted of [false] as const) {
      for (const low of [true, false]) expect(drawsHeavy(wanted, low)).toBe(false);
    }
  });
});

describe('low power is remembered on this machine and nowhere else', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('defaults OFF, so nothing changes for anyone who has not asked', async () => {
    const { lowPower } = await import('./lowPowerStore');
    expect(get(lowPower)).toBe(false);
  });

  it('reads a machine that has been switched on before', async () => {
    localStorage.setItem('sse-low-power', '1');
    const { lowPower } = await import('./lowPowerStore');
    expect(get(lowPower)).toBe(true);
  });

  it('stores the OFF state as an absence rather than a "0" nobody would recognise', async () => {
    const { lowPower } = await import('./lowPowerStore');
    lowPower.set(true);
    expect(localStorage.getItem('sse-low-power')).toBe('1');
    lowPower.set(false);
    expect(localStorage.getItem('sse-low-power')).toBeNull();
  });

  it('survives a browser that refuses site data', async () => {
    // A private window, or "block site data", throws on the ACCESS itself - not on a missing key.
    // A machine we cannot ask about is assumed to be a normal one; stripping everyone's clouds
    // because storage was unavailable would be the worse guess.
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('access denied');
    });
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('access denied');
    });
    try {
      const { lowPower } = await import('./lowPowerStore');
      expect(get(lowPower)).toBe(false);
      expect(() => lowPower.set(true)).not.toThrow();   // and the session still honours it
      expect(get(lowPower)).toBe(true);
    } finally {
      spy.mockRestore();
      setSpy.mockRestore();
    }
  });
});

// The three surfaces cannot be rendered in a unit test - two of them build WebGL - so the wiring is
// read out of the SOURCE, which is this project's idiom for a seam a test cannot reach.
describe('the surfaces are actually wired to it', () => {
  const read = (p: string) => readFileSync(p, 'utf8');

  it('has the checkbox on the GM view, next to the other view options', () => {
    const view = read('src/lib/components/SystemView.svelte');
    expect(view).toContain("import { lowPower } from '$lib/lowPowerStore'");
    expect(view).toContain('bind:checked={$lowPower}');
    expect(view).toContain('Low power');
  });

  it('makes the HOLO compose the two switches rather than reading the preset alone', () => {
    const holo = read('src/lib/holo/HoloView.svelte');
    expect(holo).toContain('setAtmospheres(drawsHeavy(s.atmospheres, $lowPower))');
    expect(holo).toContain('setAuroras(drawsHeavy(s.auroras, $lowPower))');
    // ...and re-applies when the box is ticked, or it would wait for an unrelated change.
    expect(holo).toContain('$lowPower; applyStyle(style);');
  });

  it('makes the SIZE COMPARISON drop them too, and rebuild when it changes', () => {
    const view = read('src/lib/components/SizeComparisonView.svelte');
    expect(view).toContain('handle?.setAtmospheres(!$lowPower)');
    const scene = read('src/lib/holo/comparisonScene.ts');
    // The strip never passed the flag at all, so it drew every cloud deck on objects that fill the
    // screen - the most expensive thing on it.
    expect(scene).toContain('atmospheres,');
    expect(scene).toContain('function setAtmospheres(on: boolean)');
    // A shell is a CHILD of the look, so there is nothing to reveal that was never built: the switch
    // has to REBUILD, exactly as the holo's own does. Read from inside the function, because that
    // same line appears elsewhere in the file and a whole-file search would pass on it.
    const at = scene.indexOf('function setAtmospheres(on: boolean)');
    const body = scene.slice(at, at + 400);
    expect(body).toContain('for (const id of [...built.keys()]) destroy(id);');
    expect(body).toContain('if (on === atmospheres) return;');   // and does not rebuild for nothing
  });
});
