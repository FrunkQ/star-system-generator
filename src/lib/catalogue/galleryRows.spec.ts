// THE TWO REFERENCE GALLERIES SHOW THE SAME BODIES ([[G91]]), and this is the gate that says so.
//
// `galleryExamples.ts` has always claimed in its header to be "the shared array of synthetic EXAMPLE
// bodies used by BOTH reference galleries ... so they show the same worlds and stay in step". It was
// not true of the small bodies: `/discgallery` kept its own copy of that row inside the page, so the
// 2D gallery had a shelf of convincing potatoes while the 3D gallery had never drawn an asteroid at
// all - and that is why nobody noticed for the life of the project that 3D drew every body as a
// perfectly smooth ball. A drifted copy did not merely risk a difference; it HID one.
//
// So there are two claims here and they are different: the arrays are shared (a source pin, because
// the 2D page is markup a test cannot render meaningfully), and the bodies in them actually come out
// LUMPY when built for 3D (a real build, because "it is in the array" is not "it draws as a rock").
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { GALLERY_ROWS, GALLERY_SMALL_BODIES, GALLERY_CONTACT_BINARIES } from './galleryExamples';
import { buildBodyLook } from '$lib/holo/bodyLook';
import { lobeCount } from './smallBodyShape';
import type { CelestialBody } from '$lib/types';

const PAGE = fs.readFileSync(path.resolve('src/routes/discgallery/+page.svelte'), 'utf-8');

describe('both galleries read one array', () => {
  it('the 3D gallery gets a small-body row and a contact-binary row', () => {
    const titles = GALLERY_ROWS.map((r) => r.title.toLowerCase());
    expect(titles.some((t) => t.includes('small bodies'))).toBe(true);
    expect(titles.some((t) => t.includes('contact binaries'))).toBe(true);
    const rows = GALLERY_ROWS.filter((r) => /small bodies|contact binaries/i.test(r.title));
    expect(rows.flatMap((r) => r.bodies).length).toBe(
      GALLERY_SMALL_BODIES.length + GALLERY_CONTACT_BINARIES.length);
  });

  // A SOURCE PIN, and it is checking for the ABSENCE of the thing that drifted. The 2D page builds
  // its rows in markup, so what can be asserted is that it takes these two rows from the shared
  // module and does not roll its own list of rocks beside them.
  it('the 2D gallery takes both rows from the shared module', () => {
    expect(PAGE, 'the 2D gallery no longer imports the shared small-body row')
      .toMatch(/GALLERY_SMALL_BODIES/);
    expect(PAGE, 'the 2D gallery has no contact-binary row')
      .toMatch(/GALLERY_CONTACT_BINARIES/);
    expect(PAGE.match(/const\s+smallBodies\s*=/), 'the page has grown its own copy of the row again')
      .toBeNull();
  });
});

describe('the bodies in those rows really are rocks', () => {
  const build = (b: CelestialBody) =>
    buildBodyLook(b, 1, { bodyStyle: 'flat', atmospheres: false, aurora: 'off', dynamics: false } as never);
  const radii = (m: THREE.Mesh) => {
    const pos = (m.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    return Array.from({ length: pos.count }, (_, i) => v.fromBufferAttribute(pos, i).length());
  };

  it('every small body but the round one is displaced in 3D', () => {
    for (const b of GALLERY_SMALL_BODIES) {
      const rs = radii(build(b).mesh);
      const relief = Math.max(...rs) - Math.min(...rs);
      // The last entry is the 500 km dwarf, in the row deliberately as the round control.
      if (/round dwarf/i.test(b.name!)) expect(relief, b.name).toBeLessThan(0.02);
      else expect(relief, b.name).toBeGreaterThan(0.05);
    }
  });

  it('every contact binary is lobed, and measurably longer than it is round', () => {
    for (const b of GALLERY_CONTACT_BINARIES) {
      expect(lobeCount(b), b.name).toBeGreaterThanOrEqual(2);
      const rs = radii(build(b).mesh);
      expect(Math.max(...rs) / Math.min(...rs), b.name).toBeGreaterThan(2);
    }
  });

  // Both rows carry the class as well as the fact, so the gallery's captions and the classifier's
  // own answer cannot say different things about the same example.
  it('each example carries the class its shape claims', () => {
    for (const b of GALLERY_CONTACT_BINARIES) {
      expect(b.classes, b.name).toContain('asteroid/contact-binary');
    }
    for (const b of GALLERY_SMALL_BODIES) {
      if (/round dwarf/i.test(b.name!)) continue;
      expect((b.classes ?? []).some((c) => c.startsWith('asteroid/')), b.name).toBe(true);
    }
  });
});
