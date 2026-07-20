// Derived MAGNETISM profile (proposal §2d). A planetary dynamo needs a convecting, electrically
// CONDUCTIVE fluid layer plus ROTATION. We already derive the conductive interior layers
// (fluidLayers.ts: metallic-hydrogen / superionic-water / molten-iron / salty subsurface ocean),
// so magnetism reads those + rotation + makeup and reports WHAT field the physics implies and its
// GEOMETRY — descriptively. It does NOT overwrite the editable MagneticField.strengthGauss; it
// grounds a plausible RANGE and explains the dynamo (intrinsic vs induced, dipolar vs tilted/off-
// centre), so the displayed/edited value can be sanity-checked against the interior model.
import type { CelestialBody, Magnetism, MagneticField, DynamoSource, MagnetGeometry } from '$lib/types';
import { EARTH_MASS_KG } from '$lib/constants';
import { makeupFractions } from './makeup';

// Which magnetic/* shielding tag a body carries. F-OVR (E3): a MANUALLY-set field overrides the
// derived interior dynamo — its strength alone decides shielding (0 → unshielded, >0 → a field), so
// zeroing the field strips the tag and raising it adds one, regardless of what the interior implies.
// When a manual field is present but the interior model finds NO natural source for it (not a dynamo,
// not induced), the field is ANOMALOUS — the GM put it there (artificial / exotic / unknown origin),
// so it gets its own tag rather than masquerading as an intrinsic dynamo. Without a manual override the
// tag follows the derived magnetism model (intrinsic dynamo / induced / none).
// A field this weak (< ~10% of Earth's ~0.5 G) exists but is negligible for shielding — a TENUOUS
// magnetosphere (Mercury ≈ 0.003 G, ~1% of Earth's).
export const TENUOUS_GAUSS = 0.05;

// Format a field strength in Gauss with enough precision to SEE a tenuous field — a fixed 2 dp showed
// Mercury's ~0.003 G as "0.00 G". Small fields get more decimals.
export function formatGauss(g: number): string {
  const v = g || 0;
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.01) return v.toFixed(3);
  if (v > 0) return v.toFixed(4);
  return '0';
}

export function magneticShieldingTag(magnetism: Magnetism, field?: MagneticField): string {
  const s = field?.strengthGauss ?? 0; // the effective field (GM-set if manual, else derived from the model)
  const inducedSource = magnetism.source === 'salty-ocean-induced';
  if (s <= 0) return 'magnetic/unshielded';
  if (inducedSource) return 'magnetic/induced';            // induced fields are inherently weak — keep the label
  if (s < TENUOUS_GAUSS) return 'magnetic/tenuous';        // present but negligible (Mercury-like)
  if (field?.manual && magnetism.source === 'none') return 'magnetic/anomalous'; // GM field with no interior source
  return 'magnetic/dynamo';
}

// Rotation support for a dynamo: fast spin organises convection into a strong, ordered field;
// very slow / tidally-locked spin (Venus 5832 h) barely sustains one. Earth (24 h) ≈ 1.
function rotationFactor(body: CelestialBody): number {
  const h = Math.abs(body.rotation_period_hours ?? 0); // retrograde (negative) spin is just as slow/fast
  if (!h) return 0.6;                           // unknown → middling
  return Math.max(0.04, Math.min(1.6, 24 / h)); // 10 h → 1.6 (clamped), 24 h → 1, 5832 h → ~0.04
}

function band(lo: number, hi: number): { min: number; max: number } {
  return { min: +lo.toFixed(4), max: +hi.toFixed(4) };
}

export interface MagnetismOpts {
  // True when this body orbits inside a host's strong magnetosphere (a giant planet) — the
  // precondition for an INDUCED field from a conductive subsurface ocean (Europa around Jupiter).
  insideHostMagnetosphere?: boolean;
}

export function deriveMagnetism(body: CelestialBody, opts: MagnetismOpts = {}): Magnetism {
  const mk = makeupFractions(body);
  const massMe = (body.massKg ?? 0) / EARTH_MASS_KG;
  const rot = rotationFactor(body);
  const layers = body.hydrosphere?.layers ?? [];
  const interior = layers.find((l) => l.location === 'interior' && l.conductive);
  const subsurfaceOcean = layers.find((l) => l.location === 'subsurface' && l.conductive);
  const notes: string[] = [];

  let source: DynamoSource = 'none';
  let geometry: MagnetGeometry = 'none';
  let intrinsic = false;
  let range = band(0, 0);
  // A single representative strength (Gauss), calibrated to the real planets, scaled by rotation (a
  // faster dynamo → stronger field) and core size. The field derives from this unless the GM overrides it.
  let nominalGauss = 0;

  // A carbon-rich interior forms a poorly-convecting polymeric C–N–H / diamond layer that damps a
  // deep dynamo (the "suppressed" case the brief calls out).
  const carbonSuppressed = mk.carbon > 0.3;

  if (interior?.liquid === 'metallic-hydrogen') {
    // Gas giant: liquid metallic hydrogen → the strongest, cleanly dipolar fields.
    source = 'metallic-hydrogen';
    geometry = 'dipolar';
    intrinsic = true;
    // HELIUM RAIN: in a COOL giant interior helium becomes immiscible in metallic hydrogen and rains
    // out, forming a stably-stratified layer that throttles the dynamo (why Saturn's field is ~20x
    // weaker than Jupiter's). A HOT interior — from mass (self-compression) or strong insolation (hot
    // Jupiters) — avoids it. `interiorWarmth` proxies that; heFactor is ~1 for Jupiter/hot Jupiters and
    // drops toward 0.05 for cool Saturn-and-below giants. (Calibrated: Jupiter ≈ 4.3 G, Saturn ≈ 0.2 G.)
    const massMj = massMe / 317.8;
    const insolationBoost = Math.min(1.5, (body.equilibriumTempK ?? 0) / 1000);
    const interiorWarmth = massMj + insolationBoost;
    const heFactor = Math.max(0.05, Math.min(1, (interiorWarmth - 0.35) / (0.9 - 0.35)));
    range = band(3 * rot * heFactor, 16 * rot * heFactor);
    nominalGauss = 2.7 * rot * heFactor;
    notes.push(heFactor < 0.5
      ? 'A cool interior lets helium rain out and throttle the metallic-hydrogen dynamo → a weak, axisymmetric field (Saturn-like).'
      : 'Liquid metallic-hydrogen envelope drives a strong dipolar field (Jupiter-class).');
  } else if (interior?.liquid === 'superionic-water') {
    // Ice giant: superionic-water mantle convects in a thin shell → tilted, off-centre, multipolar
    // (Uranus/Neptune fields are offset ~0.5 R and tilted ~60° from the spin axis).
    source = 'superionic-water';
    geometry = 'off-centre';
    intrinsic = true;
    range = band(0.1 * rot, 1.0 * rot);
    nominalGauss = 0.15 * rot; // Uranus/Neptune ≈ 0.14–0.23 G
    notes.push('Superionic-water mantle dynamo → tilted, off-centre, multipolar field (Uranus/Neptune-like).');
    // A molten iron core drives a dynamo. Normally that shows up as a conductive molten-iron layer on a
    // rocky-mass world; but a metal-RICH body (Mercury is ~70 % iron) retains a partially molten core and
    // a weak field even when it's small and the layer model calls the core solid — hence the metal escape.
  } else if ((interior?.liquid === 'molten-iron' && massMe > 0.3) || (mk.metal > 0.5 && massMe > 0.02)) {
    const sizeF = Math.min(1.4, Math.max(0.3, Math.cbrt(massMe))); // bigger core → stronger
    if (carbonSuppressed) {
      source = 'suppressed';
      geometry = 'multipolar';
      intrinsic = true;
      range = band(0.005 * rot, 0.05 * rot);
      nominalGauss = 0.02 * rot * sizeF;
      notes.push('Iron-core dynamo damped by a carbon-rich (polymeric C–N–H / diamond) layer → weak, disordered field.');
    } else if (rot < 0.12) {
      // Very slow rotation can't organise an ordered dynamo. A large iron core (Mercury) still musters a
      // weak, disordered field; an Earth-composition slow rotator (Venus) is left essentially unshielded.
      const bigIronCore = mk.metal > 0.5;
      source = 'suppressed';
      geometry = bigIronCore ? 'multipolar' : 'none';
      intrinsic = bigIronCore;
      range = bigIronCore ? band(0.001, 0.006) : band(0, 0.002);
      nominalGauss = bigIronCore ? 0.003 : 0; // Mercury ≈ 0.003 G (tenuous); Venus ≈ 0
      notes.push(bigIronCore
        ? 'A large iron core keeps a weak, disordered field despite very slow rotation (Mercury-like).'
        : 'Molten core present, but rotation is far too slow to sustain an ordered dynamo (Venus-like).');
    } else {
      source = 'iron-core';
      geometry = 'dipolar';
      intrinsic = true;
      range = band(0.1 * rot * sizeF, 0.7 * rot * sizeF);
      nominalGauss = 0.5 * rot * sizeF; // Earth ≈ 0.5 G
      notes.push('Molten iron core → Earth-like dipolar field; shields the atmosphere from stellar wind.');
    }
  }

  // Induced field: a conductive (salty) subsurface ocean inside a host magnetosphere carries
  // induced currents → a weak, purely induced field (no internal dynamo). This OVERRIDES "none".
  if (!intrinsic && subsurfaceOcean && opts.insideHostMagnetosphere) {
    source = 'salty-ocean-induced';
    geometry = 'induced';
    intrinsic = false;
    range = band(0.0005, 0.01);
    nominalGauss = 0.005;
    notes.push('Conductive subsurface ocean induces a weak field within the host planet\'s magnetosphere (Europa-like).');
  }

  if (source === 'none') {
    notes.push('No convecting conductive layer (or far too slow rotation) → no magnetic shielding.');
  }

  return { source, geometry, intrinsic, estimatedRangeGauss: range, nominalGauss, notes };
}
