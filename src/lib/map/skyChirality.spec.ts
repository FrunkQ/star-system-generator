// A93: THE SKY MUST NOT BE A MIRROR IMAGE. A user placed Orion's stars at their real right ascensions
// and declinations and the system view's sky showed the constellation reversed left-to-right.
//
// The map's equatorial frame is right-handed (positions.mjs: x = cos dec cos ra, y = cos dec sin ra,
// z = north). The scene is Y-up. Carrying a direction across by SWAPPING two axes, (x, y, z) -> (x, z, y),
// is an improper rotation - it flips chirality - and every sky it draws is mirrored. This gate is
// ABSOLUTE rather than relative on purpose (engine map PHY-34): it asks the one question a photograph
// answers. From Sol, facing Orion with celestial north up, EAST IS TO THE LEFT - so Betelgeuse
// (RA 5h55m, higher) must appear left of Rigel (RA 5h14m). The user's photo shows exactly that; the
// render showed the opposite.
import { describe, it, expect } from 'vitest';
import { radecToXyzLy } from '$lib/import/realsky/positions.mjs';
import { skyDirToScene } from './skyStars';

type V = [number, number, number];
const norm = (v: V): V => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** A unit direction in the map's equatorial frame, from real coordinates (distance is irrelevant). */
function dirOf(raDeg: number, decDeg: number) {
  const p = radecToXyzLy(raDeg, decDeg, 1);
  const l = Math.hypot(p.x, p.y, p.z);
  return { x: p.x / l, y: p.y / l, z: p.z / l };
}

describe('A93: the sky keeps its handedness', () => {
  // Real coordinates (J2000). Betelgeuse: RA 05h55m10s = 88.79 deg, Dec +07 24'. Rigel: 05h14m32s = 78.63 deg, Dec -08 12'.
  const betelgeuse = skyDirToScene(dirOf(88.79, 7.41));
  const rigel = skyDirToScene(dirOf(78.63, -8.20));

  it('celestial north maps to scene up, so "north up" is the scene camera’s natural frame', () => {
    const northPole = skyDirToScene({ x: 0, y: 0, z: 1 });
    expect(northPole[1]).toBeCloseTo(1, 6);
  });

  it('from Sol, facing Orion with north up, Betelgeuse is EAST of Rigel - which is to the LEFT', () => {
    // The viewer stands at the origin looking along the direction between the two stars, north (+Y) up.
    // In a right-handed scene, right = look x up, so left = up x look.
    const look = norm([(betelgeuse[0] + rigel[0]) / 2, (betelgeuse[1] + rigel[1]) / 2, (betelgeuse[2] + rigel[2]) / 2]);
    const up: V = [0, 1, 0];
    const left = norm(cross(up, look));
    const betelgeuseRelativeToRigel = sub(betelgeuse, rigel);
    // Positive = Betelgeuse lies on the viewer's left, as in every photograph of Orion.
    expect(dot(betelgeuseRelativeToRigel, left)).toBeGreaterThan(0);
  });

  it('and Betelgeuse is still ABOVE Rigel (declination survives the mapping)', () => {
    expect(betelgeuse[1]).toBeGreaterThan(rigel[1]);
  });
});
