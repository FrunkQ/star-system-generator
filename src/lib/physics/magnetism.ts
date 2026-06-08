// Derived MAGNETISM profile (proposal §2d). A planetary dynamo needs a convecting, electrically
// CONDUCTIVE fluid layer plus ROTATION. We already derive the conductive interior layers
// (fluidLayers.ts: metallic-hydrogen / superionic-water / liquid-iron / salty subsurface ocean),
// so magnetism reads those + rotation + makeup and reports WHAT field the physics implies and its
// GEOMETRY — descriptively. It does NOT overwrite the editable MagneticField.strengthGauss; it
// grounds a plausible RANGE and explains the dynamo (intrinsic vs induced, dipolar vs tilted/off-
// centre), so the displayed/edited value can be sanity-checked against the interior model.
import type { CelestialBody, Magnetism, DynamoSource, MagnetGeometry } from '$lib/types';
import { EARTH_MASS_KG } from '$lib/constants';
import { makeupFractions } from './makeup';

// Rotation support for a dynamo: fast spin organises convection into a strong, ordered field;
// very slow / tidally-locked spin (Venus 5832 h) barely sustains one. Earth (24 h) ≈ 1.
function rotationFactor(body: CelestialBody): number {
  const h = body.rotation_period_hours;
  if (!h || h <= 0) return 0.6;                 // unknown → middling
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

  // A carbon-rich interior forms a poorly-convecting polymeric C–N–H / diamond layer that damps a
  // deep dynamo (the "suppressed" case the brief calls out).
  const carbonSuppressed = mk.carbon > 0.3;

  if (interior?.liquid === 'metallic-hydrogen') {
    // Gas giant: liquid metallic hydrogen → the strongest, cleanly dipolar fields.
    source = 'metallic-hydrogen';
    geometry = 'dipolar';
    intrinsic = true;
    range = band(3 * rot, 16 * rot);
    notes.push('Liquid metallic-hydrogen envelope drives a strong dipolar field (Jupiter-class).');
  } else if (interior?.liquid === 'superionic-water') {
    // Ice giant: superionic-water mantle convects in a thin shell → tilted, off-centre, multipolar
    // (Uranus/Neptune fields are offset ~0.5 R and tilted ~60° from the spin axis).
    source = 'superionic-water';
    geometry = 'off-centre';
    intrinsic = true;
    range = band(0.1 * rot, 1.0 * rot);
    notes.push('Superionic-water mantle dynamo → tilted, off-centre, multipolar field (Uranus/Neptune-like).');
  } else if (interior?.liquid === 'liquid-iron' && massMe > 0.3) {
    // Rocky world with a molten iron core → Earth-like dipole, strength scaling with spin & size.
    if (carbonSuppressed) {
      source = 'suppressed';
      geometry = 'multipolar';
      intrinsic = true;
      range = band(0.005 * rot, 0.05 * rot);
      notes.push('Iron-core dynamo damped by a carbon-rich (polymeric C–N–H / diamond) layer → weak, disordered field.');
    } else if (rot < 0.12) {
      // Too slow to organise a dynamo (Venus): core may convect but the field is negligible.
      source = 'suppressed';
      geometry = 'none';
      intrinsic = false;
      range = band(0, 0.002);
      notes.push('Molten core present, but rotation is far too slow to sustain an ordered dynamo (Venus-like).');
    } else {
      source = 'iron-core';
      geometry = 'dipolar';
      intrinsic = true;
      const sizeF = Math.min(1.4, Math.max(0.4, Math.cbrt(massMe))); // bigger core → stronger
      range = band(0.1 * rot * sizeF, 0.7 * rot * sizeF);
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
    notes.push('Conductive subsurface ocean induces a weak field within the host planet\'s magnetosphere (Europa-like).');
  }

  if (source === 'none') {
    notes.push('No convecting conductive layer (or far too slow rotation) → no magnetic shielding.');
  }

  return { source, geometry, intrinsic, estimatedRangeGauss: range, notes };
}
