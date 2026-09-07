import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SKINS, FLOAT_SKINS } from './skinStore';

/**
 * G34 addendum (2026-09-07). Two rules for the built-in skins:
 *  1. the registry (skinStore.ts) and the stylesheet (skins.css) name the SAME skins - classic is the
 *     one exception by design, because the tokens.css defaults ARE the classic skin;
 *  2. every skin keeps the CONTRAST the shipped four already had. The floors below are the shipped
 *     look MEASURED (text 14+, muted 5.3+, link 7.5+, accent 5.8+ on the panel; the classic accent
 *     carries its white at 3.1), rounded down a little - a bar the existing skins clear, not a target
 *     invented for the new ones. A light skin is exactly where a pale "muted" grey slips through
 *     unnoticed, and this is the check that catches it without a human eye.
 */
const grab = (s: string) => {
  const m: Record<string, string> = {};
  for (const x of s.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) m[x[1]] = x[2].trim();
  return m;
};
const css = readFileSync(resolve(process.cwd(), 'src/lib/styles/skins.css'), 'utf8');
const tokens = readFileSync(resolve(process.cwd(), 'src/lib/styles/tokens.css'), 'utf8');
const base = grab(tokens.slice(0, tokens.indexOf('}', tokens.indexOf(':root'))));
const blocks: Record<string, Record<string, string>> = {};
for (const b of css.matchAll(/:root\[data-skin='([a-z]+)'\]\s*\{([^}]*)\}/g)) blocks[b[1]] = grab(b[2]);
// The floating controls' own palettes (`data-float`), scoped under `.sse-float`.
const floatBlocks: Record<string, Record<string, string>> = {};
for (const b of css.matchAll(/:root\[data-float='([a-z]+)'\]\s+\.sse-float\s*\{([^}]*)\}/g)) floatBlocks[b[1]] = grab(b[2]);

function value(skin: Record<string, string>, token: string): string {
  const v = skin[token] ?? base[token];
  const ref = /var\((--[a-z0-9-]+)\)/.exec(v ?? '');
  return ref ? value(skin, ref[1]) : v;
}
// `--skin-*` are the skin's own values under a second name (tokens.css), read here the way the
// browser resolves them: on the root, against the skin.
const skinAliases: Record<string, string> = {};
for (const m of tokens.matchAll(/(--skin-[a-z-]+)\s*:\s*var\((--[a-z-]+)\)/g)) skinAliases[m[1]] = m[2];
const hex6 = (h: string) => (h.length === 4 ? '#' + h.slice(1).split('').map((c) => c + c).join('') : h);
const chan = (h: string) => [1, 3, 5].map((i) => parseInt(hex6(h).slice(i, i + 2), 16));
/** `color-mix(in srgb, A p%, B)`: A weighted p, B the rest, per channel in gamma-encoded sRGB. */
function mixHex(a: string, b: string, pa: number): string {
  const [x, y] = [chan(a), chan(b)];
  return '#' + x.map((v, i) => Math.round(v * pa + y[i] * (1 - pa)).toString(16).padStart(2, '0')).join('');
}
/** A float-palette expression evaluated FOR a skin: aliases resolved against it, then the mix. */
function evalFor(skin: Record<string, string>, expr: string): string {
  const e = expr.replace(/var\((--skin-[a-z-]+)\)/g, (_, k) => value(skin, skinAliases[k]));
  const m = /^color-mix\(in srgb,\s*(#[0-9a-fA-F]{3,6})\s+(\d+(?:\.\d+)?)%\s*,\s*(#[0-9a-fA-F]{3,6})\)$/.exec(e.trim());
  return m ? mixHex(m[1], m[3], Number(m[2]) / 100) : e.trim();
}
const floatValue = (skin: Record<string, string>, pal: Record<string, string>, token: string) =>
  token in pal ? evalFor(skin, pal[token]) : value(skin, token);
function luminance(hex: string): number {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const c = [0, 2, 4]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const FLOORS: Array<[fg: string, bg: string, min: number]> = [
  ['--text', '--bg-panel', 12],
  ['--text-muted', '--bg-panel', 5],
  ['--link', '--bg-panel', 7],
  ['--accent', '--bg-panel', 5.5],
  ['--on-accent', '--accent', 3],
  ['--text', '--bg-control', 12]
];

describe('interface skins', () => {
  it('the registry and the stylesheet name the same skins (classic is the tokens.css defaults)', () => {
    const registered = new Set(SKINS.map((s) => s.id as string).filter((id) => id !== 'classic'));
    expect(new Set(Object.keys(blocks))).toEqual(registered);
    expect(SKINS.some((s) => s.id === 'classic')).toBe(true);
  });

  it('every skin holds the contrast floors the shipped look set', () => {
    for (const s of SKINS) {
      const skin = s.id === 'classic' ? {} : blocks[s.id];
      for (const [fg, bg, min] of FLOORS) {
        const ratio = contrast(value(skin, fg), value(skin, bg));
        expect(ratio, `${s.id}: ${fg} on ${bg} is ${ratio.toFixed(2)}, floor ${min}`).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it('the floating-control palettes exist for every choice but "follow the skin", and hold the floors ON EVERY SKIN', () => {
    // The palettes are DERIVED - tinted with the skin's accent through the `--skin-*` aliases - so a
    // floor is only known once the mix is evaluated for each skin it could be worn over. Six skins,
    // two palettes, every pair: that is what a lilac that reads on Nebula but not on Terminal
    // would slip past otherwise.
    const expected = new Set(FLOAT_SKINS.map((f) => f.id as string).filter((id) => id !== 'skin'));
    expect(new Set(Object.keys(floatBlocks))).toEqual(expected);
    expect(Object.keys(skinAliases).length, 'tokens.css declares the --skin-* aliases').toBeGreaterThan(0);
    for (const s of SKINS) {
      const skin = s.id === 'classic' ? {} : blocks[s.id];
      for (const [id, pal] of Object.entries(floatBlocks)) {
        for (const [fg, bg, min] of FLOORS) {
          const ratio = contrast(floatValue(skin, pal, fg), floatValue(skin, pal, bg));
          expect(ratio, `float ${id} on ${s.id}: ${fg} on ${bg} is ${ratio.toFixed(2)}, floor ${min}`).toBeGreaterThanOrEqual(min);
        }
        // The light one is light and the dark one is dark on every skin: the whole point of the choice.
        const L = luminance(floatValue(skin, pal, '--bg-panel'));
        if (id === 'light') expect(L, `light float on ${s.id} is light`).toBeGreaterThan(0.75);
        if (id === 'dark') expect(L, `dark float on ${s.id} is dark`).toBeLessThan(0.06);
      }
    }
    // And the tint is REAL: Nebula's light panel is not the same paper as Classic's.
    expect(floatValue(blocks.nebula, floatBlocks.light, '--bg-panel')).not.toBe(floatValue({}, floatBlocks.light, '--bg-panel'));
  });

  it('a light skin exists, and it is light', () => {
    // The first four were all dark; Daylight is the one for a bright room, and "light" is a number.
    expect(luminance(value(blocks.daylight, '--bg-panel'))).toBeGreaterThan(0.8);
    expect(luminance(value(blocks.daylight, '--text'))).toBeLessThan(0.05);
  });
});
