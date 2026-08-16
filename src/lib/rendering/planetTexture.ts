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
import {
  landFieldFor, elevationAt, elevationAtDisc, vegetationBand, networkAt, edgeWobble, seedFrom,
  type LandField
} from './landmass';

// Offscreen texture resolution (diameter in px). Raised from 96 when the continent field landed:
// a warped fractal coastline has detail worth resolving, and 96 threw most of it away.
const SIZE = 256;
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

const clampVeil = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Paint sea, land and life from the SHARED elevation field.
 *
 * `at(px, py)` hands back the field value under a pixel, or null where there is no world (off the
 * edge of the disc). Both projections supply their own; everything else about how a rocky world's
 * surface is coloured lives here exactly once, so the 2D disc and the 3D sphere cannot drift apart.
 *
 * Vegetation is a BAND of the field just inside the shoreline, not a scatter — life reaches the land
 * at the water's edge and spreads inland, so raising the coverage widens the band toward the
 * interior. Past 100% of the land it spills into the shallows, which is why the slider goes further
 * on a world with very little dry ground.
 */
function paintSurfaceField(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  at: (px: number, py: number) => { e: number; lat: number; lon: number } | null,
  field: LandField,
  colours: { land: string; sea: string; deep: string; shallow: string },
  bands: SurfaceBand[],
  ice: IcePaint | null,
  seed: number
) {
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const LAND = rgbOf(colours.land), DEEP = rgbOf(colours.deep), SHALLOW = rgbOf(colours.shallow);
  const painted = bands.map((b) => ({ ...b, rgb: rgbOf(b.hex) }));
  const LANDICE = rgbOf('#f4f9ff');   // thick, bright, opaque — snow over ground
  const SEAICE = rgbOf('#cfe2f2');    // thinner, bluer, and it lets the water below show through
  const sea = field.seaLevel;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hit = at(x, y);
      const i = (y * w + x) * 4;
      if (hit === null) { px[i + 3] = 0; continue; }
      const e = hit.e;
      let r: number, g: number, b: number;
      if (e > sea) {
        // Land. Higher ground reads a touch paler and drier — the cheapest possible relief cue, and
        // what stops a continent looking like flat paint.
        const rel = Math.min(1, (e - sea) / Math.max(0.02, 1 - sea));
        r = LAND[0] + (255 - LAND[0]) * rel * 0.22;
        g = LAND[1] + (255 - LAND[1]) * rel * 0.22;
        b = LAND[2] + (255 - LAND[2]) * rel * 0.22;
      } else {
        // Sea, shading from a shelf tone at the coast to deep water offshore.
        const d = Math.min(1, (sea - e) / Math.max(0.02, sea * 0.55));
        r = SHALLOW[0] + (DEEP[0] - SHALLOW[0]) * d;
        g = SHALLOW[1] + (DEEP[1] - SHALLOW[1]) * d;
        b = SHALLOW[2] + (DEEP[2] - SHALLOW[2]) * d;
      }
      // EVERY contributing layer, in painter order — microbial first, then fungal over it, then
      // flora over that. Painting only the topmost was a shortcut that made the hierarchy invisible:
      // a world with three morphologies showed one colour, and reordering the rows did nothing.
      //
      // `holdsIce` accumulates as we go: it is how much of what is here can keep its own surface out
      // from under an ice cap. Same number that lets a morphology take the ocean, because it is the
      // same claim — whatever roofs a sea is not stopped by a glacier.
      let holdsIce = 0;
      for (const band of painted) {
        if (!(e > band.low && e <= band.high)) continue;
        // Fade toward the inland edge so a band does not end on a hard contour line.
        const span = Math.max(1e-4, band.high - band.low);
        const k = band.opacity * (0.55 + 0.45 * Math.min(1, ((band.high - e) / span) * 3));
        r += (band.rgb[0] - r) * k; g += (band.rgb[1] - g) * k; b += (band.rgb[2] - b) * k;
        holdsIce = Math.max(holdsIce, band.waterReach);
      }
      // ICE, last, because it covers what it covers. FOUR things stop it being the flat ellipse it
      // replaced, and all four are things you can see on a real world from orbit:
      //   - the two caps are DIFFERENT SIZES, because the hemispheres are not in the same season;
      //   - the edge is ragged, wobbled by its own noise field so it is not a ruled line;
      //   - it reaches further down HIGH GROUND, because highland is colder — mountain glaciers
      //     hanging below the cap proper;
      //   - sea ice is thinner, bluer and partly transparent, while land ice is thick and bright.
      if (ice) {
        const latDeg = (hit.lat * 180) / Math.PI;
        const capEdge = latDeg >= 0 ? ice.north : ice.south;
        if (capEdge < 89) {
          const wob = (edgeWobble(seed, hit.lon, hit.lat) - 0.5) * ice.ragged;
          const highland = e > sea ? Math.min(1, (e - sea) / Math.max(0.02, 1 - sea)) : 0;
          // Sea ice runs further from the pole than land ice does, and that is not decoration: open
          // water freezes at its own surface and the sheet spreads across it, while a coast has to
          // wait for snow to lie. Earth's Arctic is sea ice reaching well below its shores.
          const seaSpread = e > sea ? 0 : ice.seaSpread;
          const edge = capEdge + wob - highland * ice.highlandReach - seaSpread;
          const t = Math.min(1, Math.max(0, (Math.abs(latDeg) - edge) / ice.feather));
          if (t > 0) {
            const onLand = e > sea;
            const ICE = onLand ? LANDICE : SEAICE;
            const k = t * t * (3 - 2 * t) * (onLand ? 0.95 : 0.72) * (1 - holdsIce);
            r += (ICE[0] - r) * k; g += (ICE[1] - g) * k; b += (ICE[2] - b) * k;
          }
        }
      }
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function rgbOf(hex: string): [number, number, number] {
  const n = hex.replace('#', '');
  const t = n.length === 3 ? n.split('').map((q) => q + q).join('') : n;
  const v = parseInt(t, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Shade a hex toward white (f>0) or black (f<0), returning a hex. */
function toneHex(hex: string, f: number): string {
  const [r, g, b] = rgbOf(hex);
  const ch = (x: number) => Math.max(0, Math.min(255, Math.round(f >= 0 ? x + (255 - x) * f : x * (1 + f))));
  const h2 = (x: number) => ch(x).toString(16).padStart(2, '0');
  return `#${h2(r)}${h2(g)}${h2(b)}`;
}

/**
 * The land / sea / life inputs a rocky world's surface needs, gathered once for BOTH projections.
 *
 * The life colour taken is the TOP contributing layer of the painter stack — the most sophisticated
 * morphology present is the one you see from orbit, which is the whole point of the hierarchy — and
 * its coverage is what sets how far inland the band reaches.
 */

/** Pixel → surface point for the 2D disc: an ORTHOGRAPHIC view of the facing hemisphere. */
function discSampler(field: LandField, size: number) {
  return (x: number, y: number) => {
    const u = (x + 0.5) / size, v = (y + 0.5) / size;
    const e = elevationAtDisc(field, u, v);
    if (e === null) return null;
    const px = (u - 0.5) * 2, py = (0.5 - v) * 2;
    const pz = Math.sqrt(Math.max(0, 1 - px * px - py * py));
    return { e, lat: Math.asin(Math.max(-1, Math.min(1, py))), lon: Math.atan2(px, pz) };
  };
}

/** Pixel → surface point for the 3D sphere's equirect map. */
function equirectSampler(field: LandField, w: number, h: number) {
  return (x: number, y: number) => {
    const lat = Math.PI / 2 - ((y + 0.5) / h) * Math.PI;
    const lon = ((x + 0.5) / w) * 2 * Math.PI;
    return { e: elevationAt(field, lon, lat), lat, lon };
  };
}

/**
 * CITY LIGHTS — what a technological biosphere looks like on the night side.
 *
 * Drawn from the SAME band of the elevation field as that morphology's daylight colour, because a
 * city is lit exactly where it is built: the lights spread from the coast inland as the coverage
 * rises, and at full coverage the whole land glows. That is a planet-wide city, and the tag for it
 * is `biodiversity/ecumenopolis`.
 *
 * The structure matters more than the brightness. An even glow reads as fog; what makes it read as a
 * CITY is the arterial network between the dark blocks, so the lit set is ridged noise — thin
 * connected filaments — with a dim wash underneath for the built-up ground between them.
 */
function paintLights(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  at: (px: number, py: number) => { e: number; lat: number; lon: number } | null,
  bands: SurfaceBand[],
  seed: number
) {
  const img = ctx.createImageData(w, h);
  const px = img.data;
  // Warm amber: sodium- and filament-lit cities read orange from orbit, which is what every night
  // photograph of Earth and every artist's ecumenopolis has in common.
  const CORE = [255, 214, 150], ARTERY = [255, 176, 74];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hit = at(x, y);
      const i = (y * w + x) * 4;
      if (hit === null) { px[i + 3] = 0; continue; }
      let lit = 0;
      for (const band of bands) {
        if (!(hit.e > band.low && hit.e <= band.high)) continue;
        lit = Math.max(lit, band.light);
      }
      if (lit <= 0) { px[i + 3] = 0; continue; }
      // THE NETWORK IS THRESHOLDED BY HOW LIT THE PLACE IS, which is what separates a world that is
      // merely inhabited from a world that is one city. Earth is not dark because people are absent —
      // most of its land carries us — it is dark because only a few per cent of that land is built
      // and lit. So a low light value keeps only the brightest crests of the web and the night side
      // reads as scattered points along the coasts; a high one lets the whole grid through.
      const net = networkAt(seed, hit.lon, hit.lat);
      const cut = 1 - lit;
      if (net <= cut) { px[i + 3] = 0; continue; }
      const t = (net - cut) / Math.max(1e-4, 1 - cut);
      const glow = 0.25 + 0.75 * t;
      const a = Math.min(1, glow * (0.55 + 0.45 * lit));
      if (a < 0.02) { px[i + 3] = 0; continue; }
      px[i] = CORE[0] + (ARTERY[0] - CORE[0]) * (1 - t);
      px[i + 1] = CORE[1] + (ARTERY[1] - CORE[1]) * (1 - t);
      px[i + 2] = CORE[2] + (ARTERY[2] - CORE[2]) * (1 - t);
      px[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** One painted band of the elevation field: a morphology's colour between two thresholds. */
interface SurfaceBand {
  low: number; high: number; hex: string; opacity: number; light: number; morphology: string;
  /** How much of the world's water — and, by the same claim, its ice — this one can hold. */
  waterReach: number;
}

/** Everything the ice pass needs. `ragged` and `feather` are in DEGREES of latitude. */
interface IcePaint { north: number; south: number; ragged: number; feather: number; highlandReach: number; seaSpread: number; }

/** Fade a ground colour toward whatever is ABOVE it, by how much of the ground can be seen at all.
 *  The `surface` stop's weight carries that (see apparentColor): 1 on an ordinary world, and near
 *  zero under a sky nothing gets through — which is why nobody has photographed Venus's rock. */
function throughTheSky(hex: string, body: CelestialBody): string {
  const pal = body.apparentColor?.palette ?? [];
  const surf = pal.find((p) => p.role === 'surface');
  const seen = surf?.weight ?? 1;
  if (seen >= 0.995) return hex;
  const above = pal.filter((p) => p.role === 'cloud' || p.role === 'atmosphere').slice(-1)[0];
  if (!above) return hex;
  const a = rgbOf(hex), b = rgbOf(above.hex);
  const h2 = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h2(b[0] + (a[0] - b[0]) * seen)}${h2(b[1] + (a[1] - b[1]) * seen)}${h2(b[2] + (a[2] - b[2]) * seen)}`;
}

function surfacePaint(body: CelestialBody, landHex: string, seaHex: string, seaCover: number) {
  // Read the APPEARANCE MODEL, not the body. It has already dropped the layers that paint nothing,
  // gated out stars, belts and giants, and defaulted the land fraction — so a renderer that reached
  // round it would be re-deciding all three, badly and separately. That is what the model is for.
  const a = deriveAppearance(body);
  const field = landFieldFor(body.id || 'x', Math.max(0, Math.min(1, 1 - seaCover)));
  const land = throughTheSky(landHex, body);
  const sea = throughTheSky(seaHex, body);
  const colours = { land, sea, deep: toneHex(sea, -0.35), shallow: toneHex(sea, 0.3) };
  const bands: SurfaceBand[] = (a.vegetation?.layers ?? []).map((l) => {
    const band = vegetationBand(field, l.coverage, l.waterReach);
    return { low: band.low, high: band.high, hex: l.colorHex, opacity: l.opacity, light: l.light,
             morphology: l.morphology, waterReach: l.waterReach };
  }).filter((b) => b.high > b.low);
  const ice: IcePaint | null = a.polarIce && Math.min(a.polarIceLatDeg.north, a.polarIceLatDeg.south) < 89
    ? { north: a.polarIceLatDeg.north, south: a.polarIceLatDeg.south, ragged: 10, feather: 4, highlandReach: 16, seaSpread: 7 }
    : null;
  // Bands that EMIT — a technological morphology's night lights. Same band as its daylight colour,
  // because a city is lit exactly where it is built.
  const lights = bands.filter((b) => b.light > 0.001);
  return { field, colours, bands, ice, lights, seed: seedFrom(body.id || 'x') };
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
  const appear = deriveAppearance(body);

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
    // --- Rocky world: sea, land and life thresholded out of the SHARED elevation field, so the
    //     coastline the 3D globe draws is the same coastline, and plant life lands on the ground
    //     rather than in the sea. The scatter of circles this replaces rolled its own answer to
    //     "where is the land" three separate times.
    const land = surface?.hex ?? '#9c7a5a';
    const cover = ocean ? Math.min(0.98, ocean.weight) : 0;
    const paint = surfacePaint(body, land, ocean?.hex ?? '#2b6cb0', cover);
    paintSurfaceField(ctx, SIZE, SIZE, discSampler(paint.field, SIZE),
      paint.field, paint.colours, paint.bands, paint.ice, paint.seed);
    // Cloud deck on top. Its palette weight is the deck's VEIL — how much of the ground it hides —
    // so it must drive how much of the disc is covered, not just the alpha of a fixed handful of
    // streaks. A total veil (Venus: 0.2% sulphuric acid, but 0.18 bar of it) was drawing as a few
    // white streaks over bare brown ground, which is the one thing Venus never looks like. Past
    // ~0.75 the deck simply becomes the surface, with a little mottling for texture.
    //
    //     A world can carry SEVERAL decks (Titan: methane over ethane; a cold giant's stack). They
    //     paint deepest-first so the upper ones genuinely occlude the lower, and each deeper layer is
    //     shaded a touch darker — seen through the air above it. The palette's single strongest-veil
    //     stop is the fallback for bodies whose decks were not re-derived.
    const decks = appear.cloudDecks.length
      ? appear.cloudDecks.map((d) => ({ hex: d.colorHex, veil: clampVeil(d.opacity * d.coverage), ice: d.ice }))
      : clouds[0] ? [{ hex: clouds[0].hex, veil: clampVeil(clouds[0].weight), ice: false }] : [];
    decks.forEach((deck, i) => {
      const depth = decks.length - 1 - i;                     // 0 = top deck
      const hex = depth ? shade(deck.hex, Math.max(0.7, 1 - depth * 0.12)) : deck.hex;
      const veil = deck.veil;
      if (veil <= 0.02) return;
      ctx.fillStyle = hex;
      if (veil > 0.55) {
        ctx.globalAlpha = Math.min(1, 0.72 + (veil - 0.55) * 0.6);
        ctx.fillRect(0, 0, SIZE, SIZE);                       // full overcast: the deck IS the view
        ctx.globalAlpha = 0.25;
        drawPatches(ctx, rnd, shade(hex, 0.9), 0.35);         // faint mottling so it isn't flat
      } else {
        // Partial cover: elongated streaks, count and opacity both following the veil.
        ctx.globalAlpha = Math.min(0.85, 0.3 + veil * 0.7);
        const streaks = 3 + Math.round(veil * 14);
        for (let s = 0; s < streaks; s++) {
          const y = SIZE * rnd();
          ctx.beginPath();
          ctx.ellipse(SIZE * rnd(), y, SIZE * (0.16 + rnd() * 0.2), SIZE * 0.045, 0, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    });
  }

  // Space-weathering regolith greying of the BASE only (Moon/Mercury go grey). The feature OVERLAYS
  // (craters/cracks/tholins/frost/rifts) are NOT baked here: this disc texture is the base layer for
  // PlanetDisc, which draws those crisply as SVG on top; baking them too would double them. (The 3D
  // equirect sibling has no such overlay, so it DOES bake the full set.)
  {
    if (appear.regolith > 0) {
      ctx.globalCompositeOperation = 'saturation'; ctx.globalAlpha = appear.regolith;
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
    ctx.fillStyle = 'rgba(48,64,104,0.42)'; ctx.fill();                 // stormy vortex interior (darker = more contrast)
    ctx.strokeStyle = 'rgba(220,230,250,0.7)'; ctx.lineWidth = 2.6 * S; // bright jet rim
    ctx.beginPath();
    for (let x = 0; x <= EQ_W; x += 3) (x === 0 ? ctx.moveTo(x, yb(x)) : ctx.lineTo(x, yb(x)));
    ctx.stroke();
    ctx.fillStyle = 'rgba(205,218,242,0.42)';                          // a small bright eye at the pole
    ctx.beginPath(); ctx.ellipse(EQ_W / 2, baseLat * 0.35, EQ_W * 0.12, baseLat * 0.3, 0, 0, 2 * Math.PI); ctx.fill();
  }

  // (The flat cap wash that used to live here is gone. Ice is painted with the surface now, ragged
  //  along the same elevation field the coastline comes from, and reaching the latitude at which
  //  this world's own liquid freezes rather than a fixed 26% of the map. Two ice models would have
  //  disagreed about where the cap ends the moment either changed.)

  // SURFACE tholin staining only (Pluto's dark-red patches). An ATMOSPHERIC tholin haze (Titan) is
  // not part of the surface: it is a high photochemical layer that sits ABOVE the cloud decks, so
  // the 3D path draws it as its own outer shell (buildTholinHaze). Baking it into the surface here
  // put it UNDER the cloud shell, and Titan's pale methane deck then hid its orange haze entirely —
  // 3D read blue-white while the 2D disc, which draws tholin as a top overlay, read yellow-white.
  if (a.tholin && !a.tholin.atmospheric) {
    drawPatchesEquirect(ctx, rnd, a.tholin.colorHex, 0.22 + a.tholin.strength * 0.4, 0.5);
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
    const n = Math.round(90 + a.craters.density * 620);  // ~2x areal density: the sphere disperses them over far more visible surface than the 2D disc
    for (let i = 0; i < n; i++) {
      let x = rnd() * EQ_W;
      // FAR-side bias: the substellar/sub-parent face sits at the sheet CENTRE, so the shielded near
      // hemisphere is the middle and the more-cratered anti-parent side is the texture EDGES (which wrap
      // to the antistellar point). Push biased craters into the outer quarters.
      if (a.craters.farSideBias > 0 && rnd() < a.craters.farSideBias) x = rnd() < 0.5 ? rnd() * 0.25 * EQ_W : (0.75 + rnd() * 0.25) * EQ_W;
      crater(x, EQ_H * 0.5 + (rnd() - 0.5) * EQ_H * 0.95, (1.3 + rnd() * rnd() * 7) * S, false);
    }
    for (let i = 0; i < a.craters.rayed; i++) crater(rnd() * EQ_W, EQ_H * 0.5 + (rnd() - 0.5) * EQ_H * 0.7, (3.5 + rnd() * 3) * S, true);
  }

  // ROUGH REGOLITH — a small rubble pile: no craters, just a knobbly speckle of light highlights and
  // dark hollows (boulders + shadowed pits), denser/rougher the stronger it is.
  if (a.rough) {
    const n = Math.round(240 + a.rough.strength * 520);
    for (let i = 0; i < n; i++) {
      const x = rnd() * EQ_W, y = EQ_H * 0.5 + (rnd() - 0.5) * EQ_H * 0.98, r = (0.6 + rnd() * rnd() * 3.2) * S;
      const light = rnd() < 0.5;
      wrap((dx) => {
        const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, r);
        g.addColorStop(0, light ? `rgba(255,250,240,${0.12 + rnd() * 0.16})` : `rgba(20,16,12,${0.14 + rnd() * 0.2})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + dx, y, r, 0, 2 * Math.PI); ctx.fill();
      });
    }
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
    // Rocky world: the SAME elevation field the 2D disc thresholds, read through the equirect
    // mapping instead of an orthographic one. One geography, two projections.
    const land = surface?.hex ?? '#9c7a5a';
    const cover = ocean ? Math.min(0.98, ocean.weight) : 0;
    const paint = surfacePaint(body, land, ocean?.hex ?? '#2b6cb0', cover);
    paintSurfaceField(ctx, EQ_W, EQ_H, equirectSampler(paint.field, EQ_W, EQ_H),
      paint.field, paint.colours, paint.bands, paint.ice, paint.seed);
    // NB: clouds are NOT baked into the 3D surface — the holo draws them as separate drifting shells
    // (buildCloudDeck). The 2D disc still paints its own cloud streaks (it has no shell layer).
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
  const key = `eq|${body.id}|${ap.hex}|${ap.banding || 0}|${(body.hydrosphere?.coverage ?? 0).toFixed(2)}|${feat}|${((body as any).vegetation?.layers ?? []).map((l: any) => `${l.morphology}:${l.colorHex ?? '-'}:${l.coverage.toFixed(2)}`).join('+')}|` +
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
  // CITY LIGHTS share this map with the molten glow, because they are the same thing to a renderer:
  // places the surface emits rather than reflects. A world that is merely inhabited is not hot, so
  // the old "no glow unless molten" gate would have thrown its cities away.
  const litBands = (a.vegetation?.layers ?? []).some((l) => l.light > 0.001);
  if (!a.thermalGlow && !molten && !litBands) return null;
  const c = document.createElement('canvas'); c.width = EQ_W; c.height = EQ_H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, EQ_W, EQ_H);
  if (litBands) {
    const ocean = (body.apparentColor?.palette ?? []).find((q) => q.role === 'ocean');
    const paint = surfacePaint(body, '#9c7a5a', ocean?.hex ?? '#2b6cb0', ocean ? Math.min(0.98, ocean.weight) : 0);
    const lc = document.createElement('canvas'); lc.width = EQ_W; lc.height = EQ_H;
    paintLights(lc.getContext('2d')!, EQ_W, EQ_H, equirectSampler(paint.field, EQ_W, EQ_H), paint.lights, paint.seed);
    ctx.drawImage(lc, 0, 0);
  }
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

// City lights for the 2D disc, in the SAME orthographic frame as its surface texture — so the
// glow lines up with the continents it belongs to. The disc overlays this masked to the night side;
// the 3D sphere uses the equirect version as an emissive map and gets the terminator for free.
const lightsCache = new Map<string, HTMLCanvasElement | null>();
export function getPlanetLights(body: CelestialBody): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || !body.apparentColor) return null;
  const layers = ((body as any).vegetation?.layers ?? []).filter((l: any) => (l.light ?? 0) > 0.001);
  if (!layers.length) return null;
  const key = `lt|${body.id}|${(body.hydrosphere?.coverage ?? 0).toFixed(2)}|` +
    layers.map((l: any) => `${l.morphology}:${l.light.toFixed(2)}:${l.coverage.toFixed(2)}`).join('+');
  if (lightsCache.has(key)) return lightsCache.get(key)!;
  if (lightsCache.size > 200) lightsCache.clear();
  const ocean = body.apparentColor.palette.find((q) => q.role === 'ocean');
  const paint = surfacePaint(body, '#9c7a5a', ocean?.hex ?? '#2b6cb0', ocean ? Math.min(0.98, ocean.weight) : 0);
  let tex: HTMLCanvasElement | null = null;
  if (paint.lights.length) {
    tex = document.createElement('canvas');
    tex.width = SIZE; tex.height = SIZE;
    paintLights(tex.getContext('2d')!, SIZE, SIZE, discSampler(paint.field, SIZE), paint.lights, paint.seed);
  }
  lightsCache.set(key, tex);
  return tex;
}

export function getEmissiveEquirect(body: CelestialBody): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || !body.apparentColor) return null;
  const surfLiq = body.hydrosphere?.layers?.find((l) => l.location === 'surface')?.liquid ?? body.hydrosphere?.composition ?? '';
  const lightKey = ((body as any).vegetation?.layers ?? [])
    .filter((l: any) => (l.light ?? 0) > 0)
    .map((l: any) => `${l.morphology}:${l.light.toFixed(2)}:${l.coverage.toFixed(2)}`).join('+');
  const key = `em|${body.id}|${(body as any).temperatureRangeK?.max ?? ''}|${(body as any).temperatureRangeK?.min ?? ''}|${(body as any).tidallyLocked ? 1 : 0}|${surfLiq}|${(body.hydrosphere?.coverage ?? 0).toFixed(2)}|${lightKey}`;
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
  const key = `${body.id}|${ap.hex}|${ap.banding || 0}|${(body.hydrosphere?.coverage ?? 0).toFixed(2)}|${feat}|${((body as any).vegetation?.layers ?? []).map((l: any) => `${l.morphology}:${l.colorHex ?? '-'}:${l.coverage.toFixed(2)}`).join('+')}|` +
    ap.palette.map((p) => `${p.role}:${p.hex}:${p.weight.toFixed(2)}`).join(',');
  let tex = cache.get(key);
  if (!tex) {
    if (cache.size > 300) cache.clear();
    tex = render(body);
    cache.set(key, tex);
  }
  return tex;
}
