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
    // --- Gas/ice giant: latitudinal banding (count from rotation), TILTED by the spin axis so a
    //     world tipped on its side like Uranus (98°) shows near-vertical bands. Chromophore band
    //     stops exist only for warm ammonia giants (Jupiter/Saturn) — their absence marks a smooth
    //     ice giant (Uranus/Neptune), which gets very low contrast and NO storm.
    const chromo = clouds.slice(1);                 // engine emits these only for ammonia giants
    const smooth = chromo.length === 0;
    const base = clouds[0]?.hex ?? surface?.hex ?? '#c9b89a';
    const n = Math.max(2, banding);
    const bandH = SIZE / n;
    const lo = smooth ? 0.985 : 0.86, hi = smooth ? 1.015 : 1.06;
    // Draw bands in a centred, over-sized, rotated frame so the tilt covers the whole canvas.
    const R = SIZE * 0.75;                           // half-extent (> canvas diagonal/2) after rotation
    const nDraw = Math.ceil((2 * R) / bandH) + 1;
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.rotate(((body.axial_tilt_deg ?? 0) * Math.PI) / 180);
    for (let i = 0; i < nDraw; i++) {
      ctx.fillStyle = shade(base, i % 2 === 0 ? hi : lo);
      ctx.fillRect(-R, -R + i * bandH, 2 * R, bandH + 1);
    }
    for (const ch of chromo) {
      const row = Math.floor(rnd() * nDraw);
      ctx.globalAlpha = Math.min(0.7, ch.weight + 0.2);
      ctx.fillStyle = ch.hex;
      ctx.fillRect(-R, -R + row * bandH, 2 * R, bandH * (0.6 + rnd() * 0.8));
      ctx.globalAlpha = 1;
    }
    // Great-Red-Spot-style oval only on banded ammonia giants, sitting on one band.
    if (!smooth && n >= 4 && rnd() > 0.35) {
      const row = 2 + Math.floor(rnd() * Math.max(1, nDraw - 4));
      ctx.fillStyle = shade(chromo[0]?.hex ?? base, 0.78);
      ctx.beginPath();
      ctx.ellipse((rnd() - 0.5) * SIZE * 0.7, -R + (row + 0.5) * bandH, bandH * 1.1, bandH * 0.45, 0, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.restore();
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

// Cached fetch: key on everything that changes the look, so editor tweaks re-render immediately.
export function getPlanetTexture(body: CelestialBody): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || !body.apparentColor) return null;
  const ap = body.apparentColor;
  const key = `${body.id}|${ap.hex}|${ap.banding || 0}|${(body.hydrosphere?.coverage ?? 0).toFixed(2)}|` +
    `${Math.round(body.axial_tilt_deg ?? 0)}|` +
    ap.palette.map((p) => `${p.role}:${p.hex}:${p.weight.toFixed(2)}`).join(',');
  let tex = cache.get(key);
  if (!tex) {
    if (cache.size > 300) cache.clear();
    tex = render(body);
    cache.set(key, tex);
  }
  return tex;
}
