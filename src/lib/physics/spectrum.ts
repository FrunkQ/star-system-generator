// The SPECTRAL VOCABULARY — a wavelength grid, Planck's law, integration, photon counting, and one
// colour-matching step. Nothing here knows about stars, atmospheres, plants or planets; the domain
// modules (surfaceSpectrum, pigments, vegetation) compose these.
//
// TWO RULES GOVERN THIS FILE AND BOTH HAVE ALREADY COST SOMETHING (inbox B45, B54):
//
//  1. THE HUMAN COLOUR-MATCHING STEP IS THE LAST STEP AND BELONGS ONLY ON THE PRESENTATION BRANCH.
//     `spectrumToHex` projects a spectrum through the human retina's response. Anything asking "how
//     much light is available to an organism" must read `radiantPower` or `photonFlux` instead —
//     never an RGB. Deriving RGB first and selecting on it is the Rec. 709 luma bug one level up,
//     deeper and harder to see: green carries 0.7152 in that weighting because OUR eyes are
//     green-sensitive, which is a fact about us smuggled into a claim about alien biology.
//
//  2. PHOTOSYNTHESIS IS QUANTUM-DRIVEN, NOT ENERGY-DRIVEN. One photon drives one charge separation
//     regardless of its energy (above threshold), so the honest measure of "available light" for a
//     pigment is the PHOTON COUNT, not the radiant power. `photonFlux` is what the pigment branch
//     reads; `radiantPower` is what the thermal reader wants. They are different questions and this
//     file answers both rather than making one stand in for the other.
//
// GRID CHOICE, and it is deliberately NOT "the visible band" — visible is OUR band. 280–1400 nm is
// the window in which a photon can drive photochemistry at all: below ~280 nm a photon carries
// enough energy (>4.4 eV) to break the bonds it would otherwise power, and above ~1400 nm it carries
// too little (<0.9 eV) to drive a charge separation across a biological reaction centre. Both ends
// are set by molecular physics, not by eyes. 10 nm bins: fine enough to resolve a pigment absorption
// band (typical width 20–80 nm) and an atmospheric window, coarse enough to stay cheap on every body
// in a system on every process() pass.
import { PLANCK_H, BOLTZMANN_K, C_MS } from '$lib/constants';

export const GRID_MIN_NM = 280;
export const GRID_MAX_NM = 1400;
export const GRID_STEP_NM = 10;

/** The shared wavelength grid, nm. Every Spectrum in the engine is sampled on exactly this. */
export const GRID_NM: number[] = (() => {
  const out: number[] = [];
  for (let nm = GRID_MIN_NM; nm <= GRID_MAX_NM + 1e-9; nm += GRID_STEP_NM) out.push(Math.round(nm));
  return out;
})();

/**
 * Spectral irradiance sampled on GRID_NM, in W·m⁻²·nm⁻¹. `value[i]` belongs to `GRID_NM[i]`.
 * (PHY-2: WHAT it measures — power arriving per unit area per unit wavelength; WHERE — stated by
 * whoever produced it; UNITS — W·m⁻²·nm⁻¹.)
 */
export type Spectrum = number[];

/** A flat spectrum of the given spectral irradiance. */
export function constantSpectrum(value = 0): Spectrum {
  return GRID_NM.map(() => value);
}

/**
 * Planck's law, spectral radiance per unit WAVELENGTH: B(λ,T) = 2hc²/λ⁵ / (exp(hc/λkT) − 1).
 * Returned in SI (W·m⁻²·sr⁻¹·m⁻¹) — only the SHAPE is used here, since callers normalise to a
 * total irradiance they already know.
 */
export function planckRadiance(nm: number, tempK: number): number {
  if (!(tempK > 0) || !(nm > 0)) return 0;
  const lambda = nm * 1e-9;
  const a = (2 * PLANCK_H * C_MS * C_MS) / Math.pow(lambda, 5);
  const x = (PLANCK_H * C_MS) / (lambda * BOLTZMANN_K * tempK);
  // exp overflows for very cold sources at short wavelengths; expm1 keeps the tail finite and small.
  if (x > 700) return 0;
  return a / Math.expm1(x);
}

/**
 * The fraction of a blackbody's TOTAL power that comes out shortward of `nm` — the closed form, not
 * a sum over the shared grid.
 *
 * It cannot be a grid sum: `GRID_MIN_NM` is 280, and the question this answers is precisely "how
 * much is below 280?". It also must not be a numeric integral in a caller's loop — this sits on a
 * UI path (stellar zones, redrawn as a GM drags a star's temperature) and a thousand-sample
 * quadrature per star per frame is not free.
 *
 * The series is standard and exact in the limit: with x = hc/(lambda k T), the fraction of blackbody
 * power emitted at wavelengths BELOW lambda is
 *
 *     F(x) = (15 / pi^4) * SUM_n  e^(-nx)/n * ( x^3 + 3x^2/n + 6x/n^2 + 6/n^3 )
 *
 * which converges geometrically — ten terms is far past double precision for any x above ~1, and x
 * for a biological UV edge on any star is well above that.
 *
 * WHAT IT MEASURES, WHERE, IN WHAT UNITS (PHY-2): a dimensionless share of the emitter's own
 * bolometric output, at the emitter's surface, 0..1. Multiply by a luminosity to get a luminosity.
 */
export function blackbodyFractionBelowNm(nm: number, tempK: number): number {
  if (!(tempK > 0) || !(nm > 0)) return 0;
  const x = (PLANCK_H * C_MS) / (nm * 1e-9 * BOLTZMANN_K * tempK);
  if (x > 700) return 0;                       // colder than any practical emitter at this edge
  if (x < 1e-6) return 1;                      // hotter than the edge by any margin that matters
  let sum = 0;
  for (let n = 1; n <= 20; n++) {
    const nx = n * x;
    if (nx > 700) break;
    sum += (Math.exp(-nx) / n) * (x * x * x + (3 * x * x) / n + (6 * x) / (n * n) + 6 / (n * n * n));
  }
  return Math.min(1, (15 / Math.pow(Math.PI, 4)) * sum);
}

/**
 * A blackbody spectrum scaled so its integral OVER THE GRID equals `totalWm2`.
 *
 * Note honestly what that means: a real blackbody radiates outside 280–1400 nm too, and for a cool
 * star most of its power does. Normalising over the grid means `totalWm2` is the in-grid power, not
 * the bolometric one — so callers must hand in the in-grid share, not the whole flux. `gridShare`
 * below is what computes that share, and `starSpectrum` in surfaceSpectrum.ts is the one caller.
 */
export function blackbodySpectrum(tempK: number, totalWm2: number): Spectrum {
  const shape = GRID_NM.map((nm) => planckRadiance(nm, tempK));
  const area = integrate(shape);
  if (!(area > 0)) return constantSpectrum(0);
  const k = totalWm2 / area;
  return shape.map((v) => v * k);
}

/**
 * The fraction of a blackbody's TOTAL (bolometric) output that falls inside the grid. Computed by
 * comparing the grid integral against the Stefan–Boltzmann total of the same Planck curve, so it
 * needs no second constant and cannot drift from `planckRadiance`.
 */
export function gridShare(tempK: number): number {
  if (!(tempK > 0)) return 0;
  // Integrate the same Planck curve over a wide range (1–100,000 nm, log-spaced) as the bolometric
  // reference. Log spacing keeps the short-wavelength peak of a hot star resolved without needing
  // 100,000 samples.
  const N = 600;
  const lo = Math.log(1), hi = Math.log(1e5);
  let total = 0;
  let prevNm = Math.exp(lo), prevV = planckRadiance(prevNm, tempK);
  for (let i = 1; i <= N; i++) {
    const nm = Math.exp(lo + ((hi - lo) * i) / N);
    const v = planckRadiance(nm, tempK);
    total += ((v + prevV) / 2) * (nm - prevNm);
    prevNm = nm; prevV = v;
  }
  if (!(total > 0)) return 0;
  const inGrid = integrate(GRID_NM.map((nm) => planckRadiance(nm, tempK)));
  return Math.max(0, Math.min(1, inGrid / total));
}

/** Trapezoidal integral over the grid → W·m⁻² (the units of whatever the spectrum carries × nm). */
export function integrate(spec: Spectrum): number {
  let sum = 0;
  for (let i = 1; i < GRID_NM.length; i++) {
    sum += ((spec[i] ?? 0) + (spec[i - 1] ?? 0)) / 2 * (GRID_NM[i] - GRID_NM[i - 1]);
  }
  return sum;
}

/** Total radiant power in the grid, W·m⁻². The THERMAL reader's measure. */
export function radiantPower(spec: Spectrum): number {
  return integrate(spec);
}

/**
 * Photon flux, photons·m⁻²·s⁻¹ — the QUANTUM measure, and the one a pigment model must use.
 * n(λ) = E(λ)·λ/(hc), integrated over the grid. A red photon carries less energy than a blue one
 * but drives exactly as many charge separations, which is why this and `radiantPower` rank stars
 * differently and why using the wrong one is not a rounding error.
 */
export function photonFlux(spec: Spectrum): number {
  const perNm = GRID_NM.map((nm, i) => ((spec[i] ?? 0) * (nm * 1e-9)) / (PLANCK_H * C_MS));
  return integrate(perNm);
}

/** Per-bin photon flux density, photons·m⁻²·s⁻¹·nm⁻¹ — for scoring against absorption bands. */
export function photonSpectrum(spec: Spectrum): Spectrum {
  return GRID_NM.map((nm, i) => ((spec[i] ?? 0) * (nm * 1e-9)) / (PLANCK_H * C_MS));
}

/**
 * Where the spectrum peaks, in nm.
 *
 * STATED RATHER THAN INHERITED SILENTLY (inbox B53): this is the peak PER UNIT WAVELENGTH. The peak
 * per unit FREQUENCY of the same curve sits at a different wavelength — about 1.76× longer — and
 * "the peak" is ambiguous between them. Wien's displacement law in the per-wavelength form gives
 * 2.898e6 nm·K / T: ~502 nm for the Sun, which is what the reference charts quote and what this
 * returns. A page that claims to show the working has to say which one it means.
 */
export function peakNm(spec: Spectrum): number {
  let best = 0, bestI = 0;
  for (let i = 0; i < spec.length; i++) if ((spec[i] ?? 0) > best) { best = spec[i]; bestI = i; }
  return GRID_NM[bestI] ?? GRID_MIN_NM;
}

/** Wien's displacement law, per unit wavelength — the analytic peak of an unfiltered blackbody. */
export function wienPeakNm(tempK: number): number {
  return tempK > 0 ? 2.897771955e6 / tempK : 0;
}

// ── PRESENTATION BRANCH ONLY, BELOW THIS LINE ────────────────────────────────────────────────────
// Everything from here projects a spectrum onto the human visual system. It is welcome on the
// OUTPUT — "this would look green to you" is the most useful sentence on the page — and forbidden
// in any derivation. If a selection, a score or a ranking reads one of these, that is the bug.

// CIE 1931 2° colour-matching functions, multi-lobe Gaussian fit (Wyman, Sloan & Shirley, Journal of
// Computer Graphics Techniques 2:2, 2013). Accurate to about 1% of peak — far inside anything a
// swatch can show — and it is 12 numbers rather than a 471-row table.
function lobe(x: number, mu: number, s1: number, s2: number): number {
  const t = (x - mu) * (x < mu ? 1 / s1 : 1 / s2);
  return Math.exp(-0.5 * t * t);
}
function cieX(nm: number): number {
  return 1.056 * lobe(nm, 599.8, 37.9, 31.0) + 0.362 * lobe(nm, 442.0, 16.0, 26.7) - 0.065 * lobe(nm, 501.1, 20.4, 26.2);
}
function cieY(nm: number): number {
  return 0.821 * lobe(nm, 568.8, 46.9, 40.5) + 0.286 * lobe(nm, 530.9, 16.3, 31.1);
}
function cieZ(nm: number): number {
  return 1.217 * lobe(nm, 437.0, 11.8, 36.0) + 0.681 * lobe(nm, 459.0, 26.0, 13.8);
}

/** CIE XYZ tristimulus of a spectrum (unnormalised — Y is proportional to luminance). */
export function spectrumToXyz(spec: Spectrum): [number, number, number] {
  const x = integrate(GRID_NM.map((nm, i) => (spec[i] ?? 0) * cieX(nm)));
  const y = integrate(GRID_NM.map((nm, i) => (spec[i] ?? 0) * cieY(nm)));
  const z = integrate(GRID_NM.map((nm, i) => (spec[i] ?? 0) * cieZ(nm)));
  return [x, y, z];
}

function srgbGamma(u: number): number {
  const v = Math.max(0, Math.min(1, u));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/**
 * SPECTRAL UPSAMPLING — turn an authored hex into a plausible smooth REFLECTANCE curve.
 *
 * This is what lets the whole engine stop multiplying RGBs together. A material's colour in the rule
 * pack is a measurement someone made under ordinary daylight; treating it as a reflectance SPECTRUM
 * and filtering real light through it is strictly better than multiplying two three-component
 * numbers, because it gets the interaction with an alien star and a filtering atmosphere right
 * instead of approximating it in the wrong space (inbox B54).
 *
 * The method is the standard one (Smits, 1999): start with the WHITE component — the smallest
 * channel, which every channel shares — then add the excess of each primary as a smooth, broad,
 * non-negative lobe. Smooth and broad matters: real materials do not have spiky reflectance, and a
 * spiky basis would produce colours that shift wildly under a slightly different illuminant.
 *
 * SAY WHAT IT IS NOT. This is an upsample, not a measurement. Infinitely many spectra look like any
 * given colour under daylight ("metamers"), and this returns one plausible member of that set. It is
 * flat past the red end, because an authored colour says nothing at all about the infrared — a
 * neutral assumption rather than a right answer. Authoring real reflectance curves per material
 * would beat it, and the pack's shape already allows that.
 */
export const BASIS_LOBES = [
  { c: 640, w: 95 },   // long
  { c: 545, w: 70 },   // middle
  { c: 458, w: 62 }    // short
];
export function reflectanceFromHex(hex: string): Spectrum {
  return reflectanceFromLinear(...srgbToLinear(hex));
}

/** sRGB hex → linear RGB. Reflectance is a linear quantity; an authored hex is a display colour. */
export function srgbToLinear(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const v = parseInt(n, 16);
  const f = (u: number) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
  return [f(((v >> 16) & 255) / 255), f(((v >> 8) & 255) / 255), f((v & 255) / 255)];
}

/**
 * The basis WEIGHTS for a linear RGB — white plus the three lobes.
 *
 * SOLVED, not fitted. The reflectance is a linear combination of the four basis curves and the
 * conversion to linear sRGB is linear in the spectrum, so the whole map from weights to colour is a
 * single 3x3 (the white basis is flat and lands exactly on (1,1,1) by construction). Inverting it
 * once gives the weights in closed form.
 *
 * It replaced a two-pass iterative correction. Same answers, but it is ~40x cheaper and exact, which
 * is what makes filtering a whole IMAGE through a world's light affordable — a quarter of a million
 * pixels cannot each afford an iterative fit.
 */
export function basisWeights(r: number, g: number, b: number): [number, number, number, number] {
  const white = Math.min(r, g, b);
  const e = [r - white, g - white, b - white];
  const M = basisInv();
  // NOT clamped to zero. The lobes are broad and overlap heavily in the eye's response — the long
  // one spills a great deal into the green — so a saturated red needs a NEGATIVE green weight to
  // cancel that spill. Clamping the weights left the spill in, and a pillar-box red came back as
  // pale peach under our own sun: a round trip that should not move at all. Subtraction between
  // basis functions is how this method is meant to work; the RESULT is clamped non-negative
  // instead, which is where the physical constraint actually belongs.
  return [
    white,
    M[0][0] * e[0] + M[0][1] * e[1] + M[0][2] * e[2],
    M[1][0] * e[0] + M[1][1] * e[1] + M[1][2] * e[2],
    M[2][0] * e[0] + M[2][1] * e[1] + M[2][2] * e[2]
  ];
}

/** A reflectance curve for a linear RGB. */
export function reflectanceFromLinear(r: number, g: number, b: number): Spectrum {
  const [w, wr, wg, wb] = basisWeights(r, g, b);
  const raw = GRID_NM.map((nm, i) =>
    Math.max(0, w + wr * BASIS_CURVES[0][i] + wg * BASIS_CURVES[1][i] + wb * BASIS_CURVES[2][i]));
  // SCALE, NEVER CLAMP. A reflectance cannot exceed 1, but a saturated colour needs a taller lobe
  // than that — three broad basis curves cannot make a pillar-box red without one. CLIPPING the peak
  // flattens it and broadens the curve, which changes the HUE: a saturated red came back as pale
  // peach even under our own sun, a round trip that should not move at all. Scaling the whole curve
  // instead moves the LIGHTNESS and leaves the hue alone — and darker is the honest answer, because
  // a maximally saturated surface really is a dark one.
  const peak = Math.max(...raw);
  return peak > 1 ? raw.map((v) => v / peak) : raw;
}

/** Each lobe sampled on the grid, once. Flat past the red end — an authored colour says nothing
 *  about the infrared, so nothing is invented there. */
const BASIS_CURVES: number[][] = BASIS_LOBES.map((bs) =>
  GRID_NM.map((nm) => {
    const t = (Math.min(nm, 700) - bs.c) / bs.w;
    return Math.exp(-0.5 * t * t);
  }));

/** The 3x3 taking lobe weights to linear sRGB under equal-energy light, inverted.
 *  LAZY, because it needs the D65 constant declared further down and module initialisation runs top
 *  to bottom — an eager version threw "cannot access D65 before initialization" on import. */
let _basisInv: number[][] | null = null;
function basisInv(): number[][] {
  if (_basisInv) return _basisInv;
  _basisInv = (() => {
  const cols = BASIS_CURVES.map((curve) => linearRgbOf(curve));
  // Column-major → the matrix A with A·w = rgb.
  const A = [
    [cols[0][0], cols[1][0], cols[2][0]],
    [cols[0][1], cols[1][1], cols[2][1]],
    [cols[0][2], cols[1][2], cols[2][2]]
  ];
  const d =
    A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
    A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
    A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
  if (!d) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const inv = (i: number, j: number) => {
    const m = [0, 1, 2].filter((x) => x !== j).map((x) => [0, 1, 2].filter((y) => y !== i).map((y) => A[x][y]));
    const c = m[0][0] * m[1][1] - m[0][1] * m[1][0];
    return ((i + j) % 2 ? -c : c) / d;
  };
    return [0, 1, 2].map((i) => [0, 1, 2].map((j) => inv(i, j)));
  })();
  return _basisInv;
}

/** Linear-sRGB of a reflectance curve under EQUAL-ENERGY light — the reference the upsample corrects
 *  against, chosen because it has no colour of its own to bias the fit. */
function linearRgbOf(refl: Spectrum): [number, number, number] {
  const [x, y, z] = spectrumToXyz(refl);
  const [wx, wy, wz] = spectrumToXyz(GRID_NM.map(() => 1));
  const rx = wx > 0 ? (x / wx) * D65[0] : 0;
  const ry = wy > 0 ? (y / wy) * D65[1] : 0;
  const rz = wz > 0 ? (z / wz) * D65[2] : 0;
  return [
    3.2404542 * rx - 1.5371385 * ry - 0.4985314 * rz,
    -0.9692660 * rx + 1.8760108 * ry + 0.0415560 * rz,
    0.0556434 * rx - 0.2040259 * ry + 1.0572252 * rz
  ];
}

/**
 * What a material of this authored colour LOOKS LIKE under a given light, as human eyes would see it.
 *
 * The one call that replaces "multiply the star's RGB by the material's RGB" everywhere. It filters
 * the actual arriving spectrum through the material's reflectance and converts once, at the end — so
 * a sea under a red dwarf comes out murky amber because of what its water absorbs and what its sky
 * left, rather than because two hex values were multiplied together.
 */
export function materialUnderLight(hex: string, light: Spectrum): string {
  const refl = reflectanceFromHex(hex);
  return reflectedHexUnderIlluminant(light.map((v, i) => v * refl[i]), light);
}

/** The D65 white point in XYZ (Y normalised to 1) — the white the sRGB matrix below is built for. */
const D65: [number, number, number] = [0.95047, 1.0, 1.08883];

function hex2(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
}

/**
 * A spectrum as a hex colour, AS HUMAN EYES WOULD SEE IT — say whose, always.
 *
 * `whiteRef` is the illuminant to adapt to. Passing the surface spectrum itself is CHROMATIC
 * ADAPTATION to the local star: a perfectly white surface under that light comes out white, which is
 * what a human standing there would eventually see and what a correctly white-balanced photograph
 * shows. Omitting it leaves the star's own cast in the answer (an M dwarf's world all in orange).
 * Both are honest; they answer different questions, so the caller says which it wants.
 */
export function spectrumToHex(spec: Spectrum, whiteRef?: Spectrum): string {
  const [x, y, z] = spectrumToXyz(spec);
  let rx = x, ry = y, rz = z;
  if (whiteRef) {

    // Von Kries-style adaptation: divide by the reference illuminant channel-wise so only the SHAPE
    // of the reflectance survives, then re-express against D65 — the white point the sRGB matrix
    // below expects. Skipping that second half leaves the neutral at equal-energy white instead,
    // which is a real illuminant but not this colour space's, and it tints every swatch warm.
    const [wx, wy, wz] = spectrumToXyz(whiteRef);
    rx = wx > 0 ? (x / wx) * D65[0] : 0;
    ry = wy > 0 ? (y / wy) * D65[1] : 0;
    rz = wz > 0 ? (z / wz) * D65[2] : 0;
  } else {
    const m = Math.max(x, y, z);
    if (m > 0) { rx = x / m; ry = y / m; rz = z / m; }
  }
  return xyzToHex(rx, ry, rz);
}

/**
 * A reflected spectrum as a hex colour UNDER ITS OWN STAR — the star's cast left in, and the
 * BRIGHTNESS preserved relative to what a perfect white reflector under the same light would give.
 *
 * This is the one a renderer must use. `spectrumToHex` with adaptation shows the pigment's identity
 * and is right for a legend; using it on a world would white-balance the vegetation while the same
 * world's oceans and rocks — which the apparent-colour model already filters through raw starlight —
 * stayed unbalanced, and the two would disagree about what the star looks like.
 *
 * It is also what makes "the plants read black under an M dwarf" come out of the sums rather than
 * being asserted: a pigment reflecting only far-red and infrared has nothing left in the band a
 * human eye answers to, and the normalisation here keeps that darkness instead of scaling it away.
 */
export function reflectedHexUnderIlluminant(reflected: Spectrum, illuminant: Spectrum): string {
  const [x, y, z] = spectrumToXyz(reflected);
  const [wx, wy, wz] = spectrumToXyz(illuminant);
  const m = Math.max(wx, wy, wz);
  if (!(m > 0)) return '#000000';
  return xyzToHex(x / m, y / m, z / m);
}

/**
 * The colour of a single wavelength, as human eyes would see it — for a chart's wavelength ribbon.
 *
 * Built by pushing a narrow spike through the SAME colour-matching path as everything else rather
 * than carrying a rainbow lookup table beside it. A second table would be a second authority on what
 * 550 nm looks like, and the two would drift. Outside the eye's range it returns black, which is the
 * honest answer: a chart's ribbon should go dark in the infrared, because you cannot see it.
 */
export function wavelengthHex(nm: number): string {
  const [x, y, z] = spikeXyz(nm);
  // NORMALISE AGAINST THE WHOLE BAND, not against this wavelength's own maximum channel.
  //
  // Per-wavelength normalisation was the bug: out in the tails the tristimulus values are vanishingly
  // small AND numerically meaningless — the ragged remains of a Gaussian fit — and dividing them by
  // their own maximum scaled that noise up to full saturation. The ribbon came out bright cyan at
  // 300 nm and mint green at 780 nm, which is not a subtle error: it is colour where the eye has
  // none. Against a shared maximum, brightness follows the eye's actual response, so the ribbon
  // simply fades to black at both ends — which is what "you cannot see it" looks like.
  if (!(SPIKE_PEAK > 0)) return '#000000';
  // Below a fraction of a percent of peak response there is nothing to show; call it black rather
  // than letting the gamut repair below turn a rounding error into a hue.
  if (Math.max(x, y, z) / SPIKE_PEAK < 0.004) return '#000000';
  return xyzToHex(x / SPIKE_PEAK, y / SPIKE_PEAK, z / SPIKE_PEAK);
}

/** Tristimulus of a narrow spike at a wavelength — the ribbon's per-sample colour, before scaling. */
function spikeXyz(nm: number): [number, number, number] {
  return spectrumToXyz(GRID_NM.map((g) => Math.exp(-0.5 * Math.pow((g - nm) / 6, 2))));
}
/** The strongest response any single wavelength provokes — the ribbon's shared brightness scale. */
const SPIKE_PEAK = (() => {
  let peak = 0;
  for (const nm of GRID_NM) {
    const [x, y, z] = spikeXyz(nm);
    peak = Math.max(peak, x, y, z);
  }
  return peak;
})();

function xyzToHex(rx: number, ry: number, rz: number): string {
  // XYZ (D65) → linear sRGB
  const r = 3.2404542 * rx - 1.5371385 * ry - 0.4985314 * rz;
  const g = -0.9692660 * rx + 1.8760108 * ry + 0.0415560 * rz;
  const b = 0.0556434 * rx - 0.2040259 * ry + 1.0572252 * rz;
  // A saturated spectral colour can land outside the sRGB gamut (a negative channel). Desaturate
  // toward the luminance it already has rather than clipping to black, which would turn a vivid
  // out-of-gamut violet into a wrong-hued near-black.
  const lo = Math.min(r, g, b);
  const [r2, g2, b2] = lo < 0 ? [r - lo, g - lo, b - lo] : [r, g, b];
  const hi = Math.max(r2, g2, b2, 1e-9);
  const k = hi > 1 ? 1 / hi : 1;
  return `#${hex2(srgbGamma(r2 * k))}${hex2(srgbGamma(g2 * k))}${hex2(srgbGamma(b2 * k))}`;
}
