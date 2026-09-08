import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import { drawsHeavy } from './lowPowerStore';
import { pixelRatioFor, skipFrame, MAX_PIXEL_RATIO, LOW_POWER_FRAME_MS } from './rendering/lowPowerRender';

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

  // THIS TEST USED TO ASSERT THE OPPOSITE, and the reason it changed is worth keeping (C20).
  // G80 stored OFF as an ABSENCE, on the sound reasoning that the absent key IS the default - true
  // while nothing but a person could set the value. Something can now: the software-rasteriser probe
  // proposes low power for a machine that is drawing on its processor. So absence had to stop
  // meaning "off" and start meaning "nobody has said", or the first automatic proposal would
  // silently overrule a GM who had deliberately turned it off, with no way for them to win.
  it('stores an explicit OFF, because an absence now means nobody has said', async () => {
    const { lowPower, lowPowerChoice } = await import('./lowPowerStore');
    expect(get(lowPowerChoice)).toBe('auto');            // untouched: the machine may answer
    lowPower.set(true);
    expect(localStorage.getItem('sse-low-power')).toBe('1');
    lowPower.set(false);
    expect(localStorage.getItem('sse-low-power')).toBe('0');   // a person said no, and it sticks
    expect(get(lowPowerChoice)).toBe('off');
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

// The surfaces cannot be rendered in a unit test - two of them build WebGL - so the wiring is read
// out of the SOURCE, which is this project's idiom for a seam a test cannot reach.
describe('the surfaces are actually wired to it', () => {
  const read = (p: string) => readFileSync(p, 'utf8');

  it('has the checkbox on the GM view, next to the other view options', () => {
    const view = read('src/lib/components/SystemView.svelte');
    expect(view).toContain("import { lowPower } from '$lib/lowPowerStore'");
    expect(view).toContain('bind:checked={$lowPower}');
    expect(view).toContain('Low power');
  });

  it('offers the same control on a PLAYER view, under the performance heading', () => {
    // Owner, 2026-09-07: "same control in player view settings" - for the GM who knows the tablet at
    // the end of the table is elderly and cannot tick a box on it himself.
    const editor = read('src/lib/components/PlayerPresetEditor.svelte');
    expect(editor).toContain('Low power mode');
    expect(editor).toContain('lowPower: e.currentTarget.checked');
    // In the section that already exists for exactly this question, not a new one beside it.
    const at = editor.indexOf('Performance tweaks (for lower end devices)');
    expect(at).toBeGreaterThan(-1);
    expect(editor.indexOf('Low power mode')).toBeGreaterThan(at);
    const types = read('src/lib/player/presetTypes.ts');
    expect(types).toContain('lowPower?: boolean;');
  });

  it('makes the HOLO take EITHER source, and compose the preset switches on top', () => {
    const holo = read('src/lib/holo/HoloView.svelte');
    // Either the machine's own switch or the GM's answer for it is enough.
    expect(holo).toContain('const low = $lowPower || s.lowPower === true;');
    expect(holo).toContain('controller?.setLowPower(low);');
    expect(holo).toContain('setAtmospheres(drawsHeavy(s.atmospheres, low))');
    expect(holo).toContain('setAuroras(drawsHeavy(s.auroras, low))');
    // ...and re-applies when the box is ticked, or it would wait for an unrelated change.
    expect(holo).toContain('$lowPower; applyStyle(style);');
  });

  it('makes the SIZE COMPARISON drop shells, auroras AND lightning, and rebuild', () => {
    const view = read('src/lib/components/SizeComparisonView.svelte');
    expect(view).toContain('handle?.setLowPower($lowPower)');
    const scene = read('src/lib/holo/comparisonScene.ts');
    // All three, because the owner watched a planet keep flashing at him with the switch on:
    // "low power mode does not yet turn off auroras and lightning flashes on the size comparison".
    expect(scene).toContain('atmospheres: !lowPower,');
    expect(scene).toContain('dynamics: !lowPower,');
    expect(scene).toContain("aurora: lowPower ? 'off' : 'model',");
    // A shell is a CHILD of the look, so there is nothing to reveal that was never built: the switch
    // has to REBUILD. Read from inside the function - that line appears elsewhere in the file.
    const at = scene.indexOf('function setLowPower(on: boolean)');
    expect(at).toBeGreaterThan(-1);
    const body = scene.slice(at, at + 800);
    expect(body).toContain('for (const id of [...built.keys()]) destroy(id);');
    expect(body).toContain('if (on === lowPower) return;');   // and does not rebuild for nothing
  });

  it('gates the animated extras at the BUILD, because a frozen bolt is worse than a flash', () => {
    const look = read('src/lib/holo/bodyLook.ts');
    expect(look).toContain('dynamics?: boolean;');
    expect(look).toContain('const dynamics = opts.dynamics !== false;');
    // Lightning, magma and cryo plumes - the three animated extras with no switch anywhere else.
    expect(look).toContain('const storms = dynamics ? lightningStrength(node.tags) : 0;');
    expect(look).toContain('if (appear.magma && dynamics) {');
    expect(look).toContain('if (appear.cryoPlumes && dynamics) {');
    // The AURORAS are deliberately not in that set: they already have their own control, and one
    // switch swallowing another's job makes the second look broken.
    expect(look).not.toContain('aurora && dynamics');
  });
});

describe('the two renderer levers that cost fidelity', () => {
  const read = (p: string) => readFileSync(p, 'utf8');

  it('renders one device pixel per CSS pixel on low power, and caps at 2 otherwise', () => {
    // A retina 2 is FOUR times the fragments of 1, and fill rate is what an alpha-heavy scene is
    // short of. This is the biggest single lever in the app and the reason it is behind the switch:
    // it is a visibly softer picture.
    // The panel has to CLAIM more than one device pixel or the two answers are the same number and
    // the assertion proves nothing - jsdom reports 1 by default.
    const real = window.devicePixelRatio;
    try {
      Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true });
      expect(pixelRatioFor(true)).toBe(1);
      expect(pixelRatioFor(false)).toBe(MAX_PIXEL_RATIO);   // capped: 3 is cost nobody can see
      Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
      expect(pixelRatioFor(false)).toBe(1);                 // ...and never invented where there is none
      expect(pixelRatioFor(true)).toBe(1);
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', { value: real, configurable: true });
    }
  });

  it('skips frames only on low power, and lets a due frame through', () => {
    expect(skipFrame(false, 1000, 999)).toBe(false);          // never when it is off
    expect(skipFrame(true, 1000, 999)).toBe(true);            // 1 ms after the last: far too soon
    expect(skipFrame(true, 1000, 1000 - LOW_POWER_FRAME_MS)).toBe(false);   // a full period: due
    // THE SLACK IS THE POINT. A 60 Hz display delivers frames 16.67 ms apart, so a naive 33 ms gate
    // passes one every OTHER frame and lands on 30 fps by luck; allowing a frame within one tick of
    // being due keeps the cadence honest on 60, 120 and 144 Hz panels alike.
    expect(skipFrame(true, 1000, 1000 - 33.34)).toBe(false);  // two 60 Hz ticks
    expect(skipFrame(true, 1000, 1000 - 26)).toBe(false);     // within the slack: let it through
    expect(skipFrame(true, 1000, 1000 - 16.67)).toBe(true);   // one tick: not yet
    // A clock that has not started, or a NaN, must not freeze the view solid.
    expect(skipFrame(true, NaN, 0)).toBe(false);
    expect(skipFrame(true, 1000, NaN)).toBe(false);
  });

  it('pulls both levers on both renderers', () => {
    for (const p of ['src/lib/holo/scene.ts', 'src/lib/holo/comparisonScene.ts']) {
      const src = read(p);
      // THE BUILD-TIME RATIO MOVED, THE GUARANTEE DID NOT (C20). It used to be `pixelRatioFor(false)`
      // written out here; it is now inside `createGlRenderer`, which is the only thing allowed to
      // build a renderer at all. So this asserts the site still gets its renderer from the factory,
      // and `glRenderer.spec.ts` asserts the factory still caps the ratio. Between them the cover is
      // the same as before, and `glRendererSites.spec.ts` stops anyone slipping back out of it.
      expect(src, p).toContain('createGlRenderer(');           // the build-time ratio, via the factory
      expect(src, p).toContain('pixelRatioFor(on)');          // ...and the switch moving it
      expect(src, p).toContain('skipFrame(');
      // setPixelRatio does nothing until a setSize follows it: the drawing buffer keeps its old size.
      const at = src.indexOf('pixelRatioFor(on)');
      expect(src.slice(at, at + 260), p).toMatch(/setSize|resize\(/);
    }
  });
});
