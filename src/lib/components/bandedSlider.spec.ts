import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { realismBandFor, realismWording, bandOf } from './BandedSlider.svelte';
import { DEFAULT_KNOBS, KNOB_ROWS } from './GenerationDials.svelte';
import type { RulePack } from '$lib/types';

/**
 * The realism band under a control (inbox G24 part 2).
 *
 * Three things the row says the implementation must get right, and each has a test here:
 *   (a) THE EDGES ARE PACK DATA, never constants in code — so a GM running a deliberately
 *       fantastical setting moves the goalposts rather than fights them.
 *   (b) AMBER MEANS UNLIKELY, NOT WRONG. The owner's words were "possible, just unlikely".
 *   (c) IT IS A VOCABULARY, not a feature of one slider — one component, band supplied as data.
 */
function deepMerge(t: any, s: any): any {
  if (typeof t !== 'object' || t === null || Array.isArray(t)) return s;
  const out = { ...t };
  for (const k of Object.keys(s || {})) out[k] = (k in out) ? deepMerge(out[k], s[k]) : s[k];
  return out;
}
function pack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let p: any = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8'));
  for (const f of ['generation.json', 'planets.json', 'stars.json']) {
    const fp = path.join(base, f);
    if (fs.existsSync(fp)) p = deepMerge(p, JSON.parse(fs.readFileSync(fp, 'utf-8')));
  }
  return p as RulePack;
}
const P = pack();

describe('(a) the band edges are PACK DATA', () => {
  it('every generation dial has a band in the shipped pack', () => {
    for (const row of KNOB_ROWS) {
      const b = realismBandFor(P, row.key as string);
      expect(b, `no band for ${row.key}`).not.toBeNull();
    }
  });

  it('a pack with no bands renders plain rather than falling back to a hardcoded one', () => {
    expect(realismBandFor({} as RulePack, 'metallicity')).toBeNull();
    expect(realismBandFor(null, 'metallicity')).toBeNull();
    expect(realismBandFor(P, 'a-control-nobody-has-authored')).toBeNull();
  });

  it('a GM can widen a band by editing the pack, and the component follows', () => {
    const fantastical = deepMerge(P, {
      generation_parameters: { realism_bands: { controls: { rarity: { green: [0, 1], amber: [0, 1] } } } }
    }) as RulePack;
    expect(bandOf(1.0, realismBandFor(P, 'rarity'))).toBe('red');
    expect(bandOf(1.0, realismBandFor(fantastical, 'rarity'))).toBe('green');
  });

  it('green lies INSIDE amber on every shipped band, or the strip cannot be drawn', () => {
    for (const row of KNOB_ROWS) {
      const b = realismBandFor(P, row.key as string)!;
      expect(b.amber[0]).toBeLessThanOrEqual(b.green[0]);
      expect(b.amber[1]).toBeGreaterThanOrEqual(b.green[1]);
      expect(b.green[0]).toBeLessThan(b.green[1]);
    }
  });

  it('every shipped band says WHY it is where it is', () => {
    for (const row of KNOB_ROWS) {
      expect(realismBandFor(P, row.key as string)!.why, `${row.key} has no reasoning`).toBeTruthy();
    }
  });
});

describe('(b) the wording says unlikely, never invalid', () => {
  const w = realismWording(P);

  it('amber is about how rare it is, not about whether it is allowed', () => {
    expect(w.amber).toMatch(/few real systems/i);
  });

  it('no band is described as invalid, wrong, forbidden or an error', () => {
    for (const text of [w.green, w.amber, w.red]) {
      expect(text).not.toMatch(/invalid|forbidden|not allowed|illegal|error|wrong/i);
    }
  });

  it('even RED says the setting is still allowed', () => {
    expect(w.red).toMatch(/still allowed|still physical/i);
  });

  it('falls back to the same honest wording when a pack supplies none', () => {
    expect(realismWording({} as RulePack).amber).toMatch(/few real systems/i);
  });
});

describe('(c) the band a value falls in', () => {
  const band = { green: [0.4, 0.8] as [number, number], amber: [0.2, 0.9] as [number, number] };

  it('reads green inside, amber between, red outside', () => {
    expect(bandOf(0.6, band)).toBe('green');
    expect(bandOf(0.3, band)).toBe('amber');
    expect(bandOf(0.85, band)).toBe('amber');
    expect(bandOf(0.1, band)).toBe('red');
    expect(bandOf(0.95, band)).toBe('red');
  });

  it('an EDGE reads as the kinder band, so nudging onto a boundary never scolds', () => {
    expect(bandOf(0.4, band)).toBe('green');
    expect(bandOf(0.8, band)).toBe('green');
    expect(bandOf(0.2, band)).toBe('amber');
    expect(bandOf(0.9, band)).toBe('amber');
  });

  it('no band at all is no verdict, not a green one', () => {
    expect(bandOf(0.5, null)).toBeNull();
  });
});

describe('the defaults sit in the green', () => {
  it('every dial opens on a setting the bands call realistic', () => {
    for (const row of KNOB_ROWS) {
      const key = row.key as keyof typeof DEFAULT_KNOBS;
      const verdict = bandOf(DEFAULT_KNOBS[key], realismBandFor(P, key as string));
      expect(verdict, `${key} default ${DEFAULT_KNOBS[key]} is ${verdict}`).toBe('green');
    }
  });
});
