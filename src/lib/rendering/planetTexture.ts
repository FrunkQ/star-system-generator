// Procedural planet discs for the orrery's true-colour mode (#9). Instead of flattening the
// apparent-colour engine's layers into one swatch, this renders them as a little texture:
//   rocky  — land base + ocean patches at the TRUE coverage fraction (the ocean colour is already
//            starlight × refractive-index aware), cloud streaks on top, haze as a rim+wash.
//   gas    — latitudinal cloud banding (count from rotation, via apparentColor.banding), with the
//            engine's chromophore band colours and a seeded storm oval or two.
//   hot    — incandescent radial glow over everything, weighted like the engine's mix.
// Everything is driven by body.apparentColor.palette (roles + weights) + hydrosphere coverage, so
// sliding a gas mix / coverage / temperature in the editor visibly changes the disc. Textures are
// seeded from the body id (stable frame-to-frame) and cached on an offscreen canvas.
import type { CelestialBody, ApparentColorStop } from '$lib/types';

const SIZE = 96; // offscreen texture resolution (diameter in px)
const cache = new Map<string, HTMLCanvasElement>();

// Deterministic PRNG seeded from the body id.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, f: number): string {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const v = parseInt(n, 16);
  const ch = (x: number) => Math.max(0, Math.min(255, Math.round(x * f)));
  return `rgb(${ch((v >> 16) & 255)},${ch((v >> 8) & 255)},${ch(v & 255)})`;
}

function stop(palette: ApparentColorStop[], role: string): ApparentColorStop | undefined {
  return palette.find((p) => p.role === role);
}

// How many seeded blobs give an expected union coverage f when each blob covers fraction a of the
// disc: n = ln(1−f)/ln(1−a). Keeps 50% coverage actually LOOKING like half-and-half.
function blobCountFor(f: number, a: number): number {
  const clamped = Math.min(0.92, Math.max(0.03, f));
  return Math.min(48, Math.max(1, Math.round(Math.log(1 - clamped) / Math.log(1 - a))));
}

function drawPatches(ctx: CanvasRenderingContext2D, rnd: () => number, color: string, fraction: number, alpha = 1) {
  const R = SIZE / 2;
  const br = R * 0.30;                       // blob radius
  const a = (br * br) / (R * R);             // single-blob share of the disc
  const n = blobCountFor(fraction, a);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    // random point inside the disc (sqrt for uniform area)
    const t = 2 * Math.PI * rnd();
    const d = R * Math.sqrt(rnd());
    const x = R + d * Math.cos(t), y = R + d * Math.sin(t);
    ctx.beginPath();
    ctx.ellipse(x, y, br * (0.6 + rnd() * 0.8), br * (0.5 + rnd() * 0.7), rnd() * Math.PI, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function render(body: CelestialBody): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext('2d')!;
  const rnd = mulberry32(hashStr(body.id || 'x'));
  const ap = body.apparentColor!;
  const palette = ap.palette || [];
  const R = SIZE / 2;

  // everything clipped to the disc
  ctx.beginPath(); ctx.arc(R, R, R, 0, 2 * Math.PI); ctx.clip();

  const surface = stop(palette, 'surface');
  const ocean = stop(palette, 'ocean');
  const clouds = palette.filter((p) => p.role === 'cloud');
  const haze = stop(palette, 'atmosphere');
  const inc = stop(palette, 'incandescent');
  const banding = ap.banding || 0;

  if (banding > 0) {
    // --- Gas/ice giant: latitudinal banding (count from rotation), drawn HORIZONTAL. The spin-axis
    //     TILT is applied by the renderer rotating the whole body (texture + squash + poles) as one, so
    //     the bands and the oblate flattening stay consistent. Chromophore band stops exist only for
    //     warm ammonia giants (Jupiter/Saturn) — their absence marks a smooth ice giant, low-contrast
    //     and NO storm.
    const chromo = clouds.slice(1);                 // engine emits these only for ammonia giants
    const smooth = chromo.length === 0;
    const base = clouds[0]?.hex ?? surface?.hex ?? '#c9b89a';
    const n = Math.max(2, banding);
    const bandH = SIZE / n;
    const lo = smooth ? 0.985 : 0.86, hi = smooth ? 1.015 : 1.06;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = shade(base, i % 2 === 0 ? hi : lo);
      ctx.fillRect(0, i * bandH, SIZE, bandH + 1);
    }
    for (const ch of chromo) {
      const row = Math.floor(rnd() * n);
      ctx.globalAlpha = Math.min(0.7, ch.weight + 0.2);
      ctx.fillStyle = ch.hex;
      ctx.fillRect(0, row * bandH, SIZE, bandH * (0.6 + rnd() * 0.8));
      ctx.globalAlpha = 1;
    }
    // Great-Red-Spot-style oval only on banded ammonia giants, sitting on one band.
    if (!smooth && n >= 4 && rnd() > 0.35) {
      const row = 1 + Math.floor(rnd() * (n - 2));
      ctx.fillStyle = shade(chromo[0]?.hex ?? base, 0.78);
      ctx.beginPath();
      ctx.ellipse(SIZE * (0.25 + rnd() * 0.5), (row + 0.5) * bandH, bandH * 1.1, bandH * 0.45, 0, 0, 2 * Math.PI);
      ctx.fill();
    }
  } else {
    // --- Rocky world: land vs liquid at the true coverage fraction. If the world is mostly
    //     ocean, paint ocean as the base and draw LAND patches instead, so the % reads right.
    const land = surface?.hex ?? '#9c7a5a';
    const cover = ocean ? Math.min(0.98, ocean.weight) : 0;
    if (ocean && cover >= 0.5) {
      ctx.fillStyle = ocean.hex; ctx.fillRect(0, 0, SIZE, SIZE);
      drawPatches(ctx, rnd, land, 1 - cover);
    } else {
      ctx.fillStyle = land; ctx.fillRect(0, 0, SIZE, SIZE);
      if (ocean && cover > 0.02) drawPatches(ctx, rnd, ocean.hex, cover);
    }
    // cloud streaks on top — elongated, weight-driven opacity
    const deck = clouds[0];
    if (deck) {
      ctx.globalAlpha = Math.min(0.85, 0.35 + deck.weight * 0.5);
      ctx.fillStyle = deck.hex;
      const streaks = 5 + Math.floor(rnd() * 4);
      for (let i = 0; i < streaks; i++) {
        const y = SIZE * rnd();
        ctx.beginPath();
        ctx.ellipse(SIZE * rnd(), y, SIZE * (0.16 + rnd() * 0.2), SIZE * 0.045, 0, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // --- Haze: a wash plus a stronger limb tint (atmosphere reads thickest at the edge).
  if (haze) {
    const w = Math.min(0.8, haze.weight);
    ctx.globalAlpha = w * 0.22;
    ctx.fillStyle = haze.hex;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.globalAlpha = 1;
    const rim = ctx.createRadialGradient(R, R, R * 0.55, R, R, R);
    rim.addColorStop(0, 'rgba(0,0,0,0)');
    rim.addColorStop(1, haze.hex);
    ctx.globalAlpha = w * 0.55;
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.globalAlpha = 1;
  }

  // --- Incandescence (lava / very hot worlds) glows over everything, engine-weighted.
  if (inc) {
    const g = ctx.createRadialGradient(R, R, 0, R, R, R);
    g.addColorStop(0, inc.hex);
    g.addColorStop(1, shade(inc.hex, 0.55));
    ctx.globalAlpha = Math.min(0.9, inc.weight);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.globalAlpha = 1;
  }

  return c;
}

// ─── Equirectangular sibling for the 3D holo view ──────────────────────────────────────────────
// Same inputs as the disc (palette roles, banding, coverage, seeded PRNG) but laid out as a 2:1
// equirect sheet that wraps onto a sphere. No baked terminator/limb here — the 3D scene lights the
// sphere and draws the atmosphere, so this is pure day-side albedo. Blobs are drawn three times
// (x, x±W) so nothing seams at the ±180° meridian. Poles pinch is acceptable for stylised worlds.
const EQ_W = 512;
const EQ_H = 256;
const eqCache = new Map<string, HTMLCanvasElement>();

function drawPatchesEquirect(ctx: CanvasRenderingContext2D, rnd: () => number, color: string, fraction: number, alpha = 1) {
  const br = EQ_W * 0.075; // blob radius in px
  const a = (Math.PI * br * br) / (EQ_W * EQ_H); // single-blob share of the sheet
  const n = blobCountFor(fraction, a);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const x = rnd() * EQ_W;
    const y = rnd() * EQ_H;
    const rx = br * (0.6 + rnd() * 0.8);
    const ry = br * (0.5 + rnd() * 0.7);
    const rot = rnd() * Math.PI;
    for (const dx of [-EQ_W, 0, EQ_W]) {
      ctx.beginPath();
      ctx.ellipse(x + dx, y, rx, ry, rot, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function renderEquirect(body: CelestialBody): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = EQ_W;
  c.height = EQ_H;
  const ctx = c.getContext('2d')!;
  const rnd = mulberry32(hashStr((body.id || 'x') + '|eq'));
  const ap = body.apparentColor!;
  const palette = ap.palette || [];

  const surface = stop(palette, 'surface');
  const ocean = stop(palette, 'ocean');
  const clouds = palette.filter((p) => p.role === 'cloud');
  const haze = stop(palette, 'atmosphere');
  const inc = stop(palette, 'incandescent');
  const banding = ap.banding || 0;

  if (banding > 0) {
    // Gas/ice giant: latitudinal bands are simply horizontal stripes across the whole sheet.
    const chromo = clouds.slice(1);
    const smooth = chromo.length === 0;
    const base = clouds[0]?.hex ?? surface?.hex ?? '#c9b89a';
    const n = Math.max(2, banding);
    const bandH = EQ_H / n;
    const lo = smooth ? 0.985 : 0.86;
    const hi = smooth ? 1.015 : 1.06;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = shade(base, i % 2 === 0 ? hi : lo);
      ctx.fillRect(0, i * bandH, EQ_W, bandH + 1);
    }
    for (const ch of chromo) {
      const row = Math.floor(rnd() * n);
      ctx.globalAlpha = Math.min(0.7, ch.weight + 0.2);
      ctx.fillStyle = ch.hex;
      ctx.fillRect(0, row * bandH, EQ_W, bandH * (0.6 + rnd() * 0.8));
      ctx.globalAlpha = 1;
    }
    if (!smooth && n >= 4 && rnd() > 0.35) {
      const row = 1 + Math.floor(rnd() * (n - 2));
      const cx = EQ_W * rnd();
      ctx.fillStyle = shade(chromo[0]?.hex ?? base, 0.78);
      for (const dx of [-EQ_W, 0, EQ_W]) {
        ctx.beginPath();
        ctx.ellipse(cx + dx, (row + 0.5) * bandH, bandH * 1.4, bandH * 0.5, 0, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  } else {
    // Rocky world: land vs liquid at the true coverage fraction, wrapped.
    const land = surface?.hex ?? '#9c7a5a';
    const cover = ocean ? Math.min(0.98, ocean.weight) : 0;
    if (ocean && cover >= 0.5) {
      ctx.fillStyle = ocean.hex;
      ctx.fillRect(0, 0, EQ_W, EQ_H);
      drawPatchesEquirect(ctx, rnd, land, 1 - cover);
    } else {
      ctx.fillStyle = land;
      ctx.fillRect(0, 0, EQ_W, EQ_H);
      if (ocean && cover > 0.02) drawPatchesEquirect(ctx, rnd, ocean.hex, cover);
    }
    const deck = clouds[0];
    if (deck) {
      ctx.globalAlpha = Math.min(0.85, 0.35 + deck.weight * 0.5);
      ctx.fillStyle = deck.hex;
      const streaks = 6 + Math.floor(rnd() * 5);
      for (let i = 0; i < streaks; i++) {
        const y = EQ_H * rnd();
        const cx = EQ_W * rnd();
        const rx = EQ_W * (0.1 + rnd() * 0.12);
        const ry = EQ_H * 0.04;
        for (const dx of [-EQ_W, 0, EQ_W]) {
          ctx.beginPath();
          ctx.ellipse(cx + dx, y, rx, ry, 0, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  // Haze: a uniform wash (the limb glow is drawn in 3D, not baked here).
  if (haze) {
    ctx.globalAlpha = Math.min(0.8, haze.weight) * 0.18;
    ctx.fillStyle = haze.hex;
    ctx.fillRect(0, 0, EQ_W, EQ_H);
    ctx.globalAlpha = 1;
  }
  // Incandescence: a uniform hot tint (radial glow is a 3D effect).
  if (inc) {
    ctx.globalAlpha = Math.min(0.9, inc.weight);
    ctx.fillStyle = inc.hex;
    ctx.fillRect(0, 0, EQ_W, EQ_H);
    ctx.globalAlpha = 1;
  }
  return c;
}

// Equirect texture for a body, cached on the same look-defining key as the disc.
export function getPlanetTextureEquirect(body: CelestialBody): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || !body.apparentColor) return null;
  const ap = body.apparentColor;
  const key = `eq|${body.id}|${ap.hex}|${ap.banding || 0}|${(body.hydrosphere?.coverage ?? 0).toFixed(2)}|` +
    ap.palette.map((p) => `${p.role}:${p.hex}:${p.weight.toFixed(2)}`).join(',');
  let tex = eqCache.get(key);
  if (!tex) {
    if (eqCache.size > 200) eqCache.clear();
    tex = renderEquirect(body);
    eqCache.set(key, tex);
  }
  return tex;
}

// Cached fetch: key on everything that changes the look, so editor tweaks re-render immediately.
export function getPlanetTexture(body: CelestialBody): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || !body.apparentColor) return null;
  const ap = body.apparentColor;
  const key = `${body.id}|${ap.hex}|${ap.banding || 0}|${(body.hydrosphere?.coverage ?? 0).toFixed(2)}|` +
    ap.palette.map((p) => `${p.role}:${p.hex}:${p.weight.toFixed(2)}`).join(',');
  let tex = cache.get(key);
  if (!tex) {
    if (cache.size > 300) cache.clear();
    tex = render(body);
    cache.set(key, tex);
  }
  return tex;
}
