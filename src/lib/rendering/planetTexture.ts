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
import { deriveAppearance } from './planetAppearance';

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

  // Space-weathering regolith greying of the BASE only (Moon/Mercury go grey). The feature OVERLAYS
  // (craters/cracks/tholins/frost/rifts) are NOT baked here: this disc texture is the base layer for
  // PlanetDisc, which draws those crisply as SVG on top; baking them too would double them. (The 3D
  // equirect sibling has no such overlay, so it DOES bake the full set.)
  {
    const a = deriveAppearance(body);
    if (a.regolith > 0) {
      ctx.globalCompositeOperation = 'saturation'; ctx.globalAlpha = a.regolith;
      ctx.fillStyle = 'hsl(0,0%,55%)'; ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
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
const EQ_W = 1024;  // hi-res so surface detail (craters, lineae) stays crisp wrapped onto the 3D sphere
const EQ_H = 512;
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

// Paint the foundation-driven surface weathering into the equirect sheet (512×256), reading the shared
// appearance model so the 3D holo sphere shows the SAME features the 2D disc draws: age-graded craters
// (leading-hemisphere biased when tidally locked) + fresh rayed craters, icy lineae, crustal rifts,
// tholin staining and bright volatile frost. Longitude = x, latitude = y; strokes wrap at the seam.
function paintFeaturesEquirect(ctx: CanvasRenderingContext2D, body: CelestialBody, rnd: () => number) {
  const a = deriveAppearance(body);
  const wrap = (draw: (dx: number) => void) => { for (const dx of [-EQ_W, 0, EQ_W]) draw(dx); };
  const S = EQ_W / 512; // absolute-px sizes scale with the sheet resolution (relative ones auto-scale)

  // Space-weathered regolith: desaturate an airless silicate surface toward grey (Moon/Mercury).
  if (a.regolith > 0) {
    ctx.globalCompositeOperation = 'saturation'; ctx.globalAlpha = a.regolith;
    ctx.fillStyle = 'hsl(0,0%,55%)'; ctx.fillRect(0, 0, EQ_W, EQ_H);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  // EYEBALL — a tidally-locked world's permanent day/night split: a hot (baked or molten-glowing)
  // substellar hemisphere fading through a terminator ring to a frozen antistellar one. The substellar
  // point sits at the sheet centre (the 3D scene turns that face toward the star); the radial gradient
  // reads as concentric climate zones out to the frozen far side.
  if (a.eyeball) {
    const g = ctx.createRadialGradient(EQ_W / 2, EQ_H / 2, 0, EQ_W / 2, EQ_H / 2, EQ_W * 0.45);
    g.addColorStop(0, a.eyeball.dayHex);
    g.addColorStop(0.32, a.eyeball.dayHex);
    g.addColorStop(0.62, a.eyeball.kind === 'cold' ? '#5a6b82' : shade(a.eyeball.dayHex, -0.5)); // terminator
    g.addColorStop(1, a.eyeball.nightHex);
    ctx.globalAlpha = a.eyeball.molten ? 0.9 : 0.8; ctx.fillStyle = g;
    ctx.fillRect(0, 0, EQ_W, EQ_H); ctx.globalAlpha = 1;
  }

  // POLAR ICE CAPS — bright frozen caps at the two poles (the equirect's top and bottom rows ARE the
  // poles). A soft gradient fading toward the equator; craters/features drawn after show faintly through.
  // POLAR VORTEX — a gas giant's geometric polar jet (Saturn hexagon). A polygon ringing the north
  // pole: the boundary latitude waves N times with longitude, so from the pole it reads as an N-gon.
  if (a.polarVortex) {
    const sides = a.polarVortex.sides, baseLat = EQ_H * 0.1, amp = EQ_H * 0.028;
    const yb = (x: number) => baseLat + amp * Math.cos(sides * (x / EQ_W) * 2 * Math.PI);
    ctx.beginPath(); ctx.moveTo(0, 0);
    for (let x = 0; x <= EQ_W; x += 3) ctx.lineTo(x, yb(x));
    ctx.lineTo(EQ_W, 0); ctx.closePath();
    ctx.fillStyle = 'rgba(70,90,130,0.32)'; ctx.fill();                 // stormy vortex interior
    ctx.strokeStyle = 'rgba(210,222,245,0.5)'; ctx.lineWidth = 2 * S;   // bright jet rim
    ctx.beginPath();
    for (let x = 0; x <= EQ_W; x += 3) (x === 0 ? ctx.moveTo(x, yb(x)) : ctx.lineTo(x, yb(x)));
    ctx.stroke();
    ctx.fillStyle = 'rgba(200,215,240,0.35)';                          // a small bright eye at the pole
    ctx.beginPath(); ctx.ellipse(EQ_W / 2, baseLat * 0.35, EQ_W * 0.12, baseLat * 0.3, 0, 0, 2 * Math.PI); ctx.fill();
  }

  if (a.polarIce) {
    // Bright frozen caps. The equirect pinches at the poles, so keep the cap SOLID across most of its
    // latitude band (only fading near the equator edge) — otherwise it collapses into an invisible speck.
    const capH = EQ_H * 0.26;
    for (const top of [true, false]) {
      const y0 = top ? 0 : EQ_H, y1 = top ? capH : EQ_H - capH;
      const cg = ctx.createLinearGradient(0, y0, 0, y1);
      cg.addColorStop(0, 'rgba(242,248,255,0.95)'); cg.addColorStop(0.7, 'rgba(242,248,255,0.9)'); cg.addColorStop(1, 'rgba(242,248,255,0)');
      ctx.fillStyle = cg; ctx.fillRect(0, Math.min(y0, y1), EQ_W, capH);
    }
  }

  if (a.tholin) {
    if (a.tholin.atmospheric) {
      ctx.globalAlpha = 0.22 + a.tholin.strength * 0.35; ctx.fillStyle = a.tholin.colorHex;
      ctx.fillRect(0, 0, EQ_W, EQ_H); ctx.globalAlpha = 1;
    } else {
      drawPatchesEquirect(ctx, rnd, a.tholin.colorHex, 0.22 + a.tholin.strength * 0.4, 0.5);
    }
  }
  if (a.frost) drawPatchesEquirect(ctx, rnd, a.frost.colorHex, 0.18 + a.frost.coverage * 0.32, 0.45);

  if (a.craters) {
    // A crater = a shadowed BOWL (dark radial gradient) ringed by a brighter RIM — reads as a real pit,
    // not a flat dot. A FRESH one adds a soft ejecta blanket and a DIFFUSE ray splash (short, jittered,
    // faint — not clean spokes).
    // High contrast so the pit survives the sphere's diffuse lighting: a deep dark floor, a crisp bright
    // rim, and a thin dark outer shadow so it reads as a raised-rim bowl rather than a smudge.
    // POLE-PINCH FIX: near the poles the equirect squeezes horizontally (longitude lines converge), so
    // a crater drawn round would smear into a pinched swirl. Pre-STRETCH each crater horizontally by
    // 1/cos(latitude) (a save/scale transform); the sphere's UV squeeze then brings it back to round.
    const crater = (x: number, y: number, r: number, fresh: boolean) => {
      const cosLat = Math.max(0.16, Math.cos((0.5 - y / EQ_H) * Math.PI));
      const xs = 1 / cosLat, lw = (w: number) => w / xs; // undo the h-scale for stroke widths
      wrap((dx) => {
        ctx.save(); ctx.translate(x + dx, y); ctx.scale(xs, 1);
        if (fresh) {
          const eg = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 3.2);
          eg.addColorStop(0, 'rgba(230,236,246,0.24)'); eg.addColorStop(1, 'rgba(230,236,246,0)');
          ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(0, 0, r * 3.2, 0, 2 * Math.PI); ctx.fill();
          ctx.strokeStyle = 'rgba(238,242,250,0.16)';
          const nr = 16 + Math.floor(rnd() * 8);
          for (let k = 0; k < nr; k++) {
            const ang = (k / nr) * 2 * Math.PI + (rnd() - 0.5) * 0.4, len = r * (1.2 + rnd() * rnd() * 2.8);
            ctx.lineWidth = lw((0.4 + rnd() * 0.4) * S);
            ctx.beginPath(); ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r); ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len); ctx.stroke();
          }
        }
        const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        fg.addColorStop(0, 'rgba(0,0,0,0.5)'); fg.addColorStop(0.68, 'rgba(0,0,0,0.22)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(0, 0, r, 0, 2 * Math.PI); ctx.fill();
        ctx.strokeStyle = 'rgba(12,12,16,0.35)'; ctx.lineWidth = lw(Math.max(0.5 * S, r * 0.12));
        ctx.beginPath(); ctx.arc(0, 0, r * 1.04, 0, 2 * Math.PI); ctx.stroke();
        ctx.strokeStyle = fresh ? 'rgba(248,250,255,0.72)' : 'rgba(238,238,244,0.42)';
        ctx.lineWidth = lw(Math.max(0.5 * S, r * 0.22)); ctx.beginPath(); ctx.arc(0, 0, r * 0.88, 0, 2 * Math.PI); ctx.stroke();
        ctx.restore();
      });
    };
    const n = Math.round(45 + a.craters.density * 300);  // dense saturation to match the 2D disc
    for (let i = 0; i < n; i++) {
      let x = rnd() * EQ_W;
      if (a.craters.leadBias > 0 && rnd() < a.craters.leadBias) x = rnd() * 0.5 * EQ_W; // leading hemisphere
      crater(x, EQ_H * 0.5 + (rnd() - 0.5) * EQ_H * 0.95, (1.3 + rnd() * rnd() * 7) * S, false);
    }
    for (let i = 0; i < a.craters.rayed; i++) crater(rnd() * EQ_W, EQ_H * 0.5 + (rnd() - 0.5) * EQ_H * 0.7, (3.5 + rnd() * 3) * S, true);
  }

  if (a.iceCracks) {
    // A cellular / tortoise-shell fracture NETWORK — scatter nodes and link each to its nearest few
    // with short, slightly-bowed ridges. This reads like Europa's lineae / Pluto's polygonal terrain,
    // and every segment is length-capped so no crack loops the whole globe.
    const sev = a.iceCracks.severity, nn = Math.round(22 + sev * 34);
    const maxLen = EQ_W * 0.14;
    const nodes: [number, number][] = [];
    for (let i = 0; i < nn; i++) nodes.push([rnd() * EQ_W, EQ_H * 0.08 + rnd() * EQ_H * 0.84]);
    ctx.strokeStyle = a.iceCracks.colorHex; ctx.globalAlpha = 0.55; ctx.lineWidth = (0.7 + sev * 0.8) * S; ctx.lineCap = 'round';
    for (let i = 0; i < nodes.length; i++) {
      const near = nodes.map((p, j) => ({ j, d: Math.hypot(p[0] - nodes[i][0], p[1] - nodes[i][1]) }))
        .filter((o) => o.j > i && o.d < maxLen).sort((a2, b2) => a2.d - b2.d).slice(0, 3);
      for (const { j, d } of near) {
        const [x1, y1] = nodes[i], [x2, y2] = nodes[j];
        const mx = (x1 + x2) / 2 + (rnd() - 0.5) * d * 0.35, my = (y1 + y2) / 2 + (rnd() - 0.5) * d * 0.35;
        wrap((dx) => { ctx.beginPath(); ctx.moveTo(x1 + dx, y1); ctx.quadraticCurveTo(mx + dx, my, x2 + dx, y2); ctx.stroke(); });
      }
    }
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
  }

  if (a.rifts) {
    const n = 1 + Math.round(a.rifts.extent);         // one or two canyons, not a barcode
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const y = EQ_H * (0.3 + rnd() * 0.4), x = rnd() * EQ_W, len = EQ_W * (0.16 + rnd() * 0.18); // shorter
      const ey = y + (rnd() - 0.5) * 16 * S, bow = (rnd() - 0.5) * 18 * S;
      wrap((dx) => {
        ctx.strokeStyle = 'rgba(34,40,52,0.4)'; ctx.lineWidth = 2.4 * S;   // a soft shadowed trough, not a bar
        ctx.beginPath(); ctx.moveTo(x + dx, y); ctx.quadraticCurveTo(x + dx + len / 2, y + bow, x + dx + len, ey); ctx.stroke();
        ctx.strokeStyle = 'rgba(210,222,238,0.28)'; ctx.lineWidth = 0.5 * S; // faint sunlit rim
        ctx.beginPath(); ctx.moveTo(x + dx, y); ctx.quadraticCurveTo(x + dx + len / 2, y + bow, x + dx + len, ey); ctx.stroke();
      });
    }
    ctx.lineCap = 'butt';
  }
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

  // Foundation-driven surface weathering (craters/cracks/rifts/tholins/frost) over the base surface.
  paintFeaturesEquirect(ctx, body, rnd);

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
  const g = (body as any).geoActivity;
  const feat = `${g?.regime ?? ''}:${(g?.surfaceAgeGyr ?? 0).toFixed(2)}:${(body as any).irradiationDose ?? ''}:${((body as any).volatiles?.retained ?? []).join('+')}:${(body as any).tidallyLocked ? 1 : 0}:${(body as any).starTidallyLocked ? 1 : 0}:${(body as any).makeup?.ice ?? ''}:${(body.tags ?? []).some((t) => t.key === 'climate/polar-ice') ? 'pi' : ''}:${(body as any).temperatureRangeK?.max ?? ''}:${(body.tags ?? []).find((t) => t.key === 'feature/polar-vortex')?.value ?? ''}`;
  const key = `eq|${body.id}|${ap.hex}|${ap.banding || 0}|${(body.hydrosphere?.coverage ?? 0).toFixed(2)}|${feat}|` +
    ap.palette.map((p) => `${p.role}:${p.hex}:${p.weight.toFixed(2)}`).join(',');
  let tex = eqCache.get(key);
  if (!tex) {
    if (eqCache.size > 80) eqCache.clear(); // 1024×512 canvases are ~2 MB each — keep the cache bounded
    tex = renderEquirect(body);
    eqCache.set(key, tex);
  }
  return tex;
}

// EMISSIVE equirect: where the surface GLOWS of its own heat (a super-hot molten world, or a molten
// eyeball's substellar hemisphere). Black elsewhere. Used as the sphere's emissiveMap in the 3D scene,
// so the glow is self-lit and shows on the night side / against space. Returns null for cool worlds.
const emCache = new Map<string, HTMLCanvasElement | null>();
function renderEmissiveEquirect(body: CelestialBody): HTMLCanvasElement | null {
  const a = deriveAppearance(body);
  const molten = !!a.eyeball?.molten;
  if (!a.thermalGlow && !molten) return null;
  const c = document.createElement('canvas'); c.width = EQ_W; c.height = EQ_H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, EQ_W, EQ_H);
  if (molten && a.eyeball) {
    // Glow confined to the molten substellar hemisphere; falls to black by the terminator.
    const g = ctx.createRadialGradient(EQ_W / 2, EQ_H / 2, 0, EQ_W / 2, EQ_H / 2, EQ_W * 0.34);
    g.addColorStop(0, a.eyeball.dayHex); g.addColorStop(0.55, shade(a.eyeball.dayHex, -0.35)); g.addColorStop(1, '#000');
    ctx.fillStyle = g; ctx.fillRect(0, 0, EQ_W, EQ_H);
  } else if (a.thermalGlow) {
    ctx.globalAlpha = 0.45 + a.thermalGlow.strength * 0.55; ctx.fillStyle = a.thermalGlow.colorHex;
    ctx.fillRect(0, 0, EQ_W, EQ_H); ctx.globalAlpha = 1;
  }
  return c;
}
export function getEmissiveEquirect(body: CelestialBody): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || !body.apparentColor) return null;
  const key = `em|${body.id}|${(body as any).temperatureRangeK?.max ?? ''}|${(body as any).temperatureRangeK?.min ?? ''}|${(body as any).tidallyLocked ? 1 : 0}`;
  if (emCache.has(key)) return emCache.get(key)!;
  if (emCache.size > 80) emCache.clear();
  const tex = renderEmissiveEquirect(body);
  emCache.set(key, tex);
  return tex;
}

// Cached fetch: key on everything that changes the look, so editor tweaks re-render immediately.
export function getPlanetTexture(body: CelestialBody): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || !body.apparentColor) return null;
  const ap = body.apparentColor;
  const g = (body as any).geoActivity;
  const feat = `${g?.regime ?? ''}:${(g?.surfaceAgeGyr ?? 0).toFixed(2)}:${(body as any).irradiationDose ?? ''}:${((body as any).volatiles?.retained ?? []).join('+')}:${(body as any).tidallyLocked ? 1 : 0}`;
  const key = `${body.id}|${ap.hex}|${ap.banding || 0}|${(body.hydrosphere?.coverage ?? 0).toFixed(2)}|${feat}|` +
    ap.palette.map((p) => `${p.role}:${p.hex}:${p.weight.toFixed(2)}`).join(',');
  let tex = cache.get(key);
  if (!tex) {
    if (cache.size > 300) cache.clear();
    tex = render(body);
    cache.set(key, tex);
  }
  return tex;
}
