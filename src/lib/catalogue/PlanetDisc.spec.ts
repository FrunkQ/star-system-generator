import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import PlanetDisc from './PlanetDisc.svelte';
import type { CelestialBody } from '$lib/types';

function planet(extra: Partial<CelestialBody> = {}): CelestialBody {
  return {
    id: 'p', name: 'Testworld', kind: 'body', roleHint: 'planet', parentId: 'star',
    apparentColorHex: '#3a7bd5',
    ...extra
  } as CelestialBody;
}

describe('PlanetDisc', () => {
  it('renders an SVG disc', () => {
    const { container } = render(PlanetDisc, { props: { body: planet() } });
    expect(container.querySelector('svg.planet-disc')).toBeTruthy();
    expect(container.querySelector('radialGradient')).toBeTruthy();
  });

  it('draws ring halves (transformed ellipses) only when ringed', () => {
    const plain = render(PlanetDisc, { props: { body: planet(), ringed: false } });
    expect(plain.container.querySelectorAll('ellipse[transform]').length).toBe(0);
    const ringed = render(PlanetDisc, { props: { body: planet(), ringed: true } });
    expect(ringed.container.querySelectorAll('ellipse[transform]').length).toBe(2);
  });

  it('ring size scales with density', () => {
    const rx = (c: Element) => parseFloat(c.querySelector('ellipse[transform]')!.getAttribute('rx')!);
    const sw = (c: Element) => parseFloat(c.querySelector('ellipse[transform]')!.getAttribute('stroke-width')!);
    const sparse = render(PlanetDisc, { props: { body: planet(), ringed: true, ringDensity: 0.1 } });
    const dense = render(PlanetDisc, { props: { body: planet(), ringed: true, ringDensity: 0.95 } });
    expect(rx(dense.container)).toBeGreaterThan(rx(sparse.container));
    expect(sw(dense.container)).toBeGreaterThan(sw(sparse.container));
  });

  it('renders a belt as a field of rocks, not a sphere', () => {
    const belt = planet({ roleHint: 'belt', massKg: 3e21 } as any);
    const { container } = render(PlanetDisc, { props: { body: belt } });
    // Many small rock circles, denser with more mass.
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(5);
    const sparse = render(PlanetDisc, { props: { body: planet({ roleHint: 'belt', massKg: 1e19 } as any) } });
    expect(sparse.container.querySelectorAll('circle').length)
      .toBeLessThan(container.querySelectorAll('circle').length);
  });

  it('draws magma patches for a tidally volcanic world (and not otherwise)', () => {
    const quiet = render(PlanetDisc, { props: { body: planet() } });
    expect(quiet.container.querySelector('radialGradient[id^="magma-"]')).toBeFalsy();
    const io = planet({ tags: [{ key: 'tidal/volcanism' }] as any });
    const { container } = render(PlanetDisc, { props: { body: io } });
    expect(container.querySelector('radialGradient[id^="magma-"]')).toBeTruthy();
    expect(container.querySelectorAll('g[clip-path] circle[fill^="url(#magma"]').length).toBeGreaterThan(0);
  });

  it('stamps any world called Earth as Mostly Harmless', () => {
    const earth = render(PlanetDisc, { props: { body: planet({ name: 'Earth' }) } });
    expect(earth.container.querySelector('.harmless-stamp')).toBeTruthy();
    const other = render(PlanetDisc, { props: { body: planet({ name: 'Arrakis' }) } });
    expect(other.container.querySelector('.harmless-stamp')).toBeFalsy();
  });

  // Composition redesign stage 4: sub-300km solids render as a seeded IRREGULAR outline
  // (repeatable per body id), cratered, still coloured by composition. Planets stay round.
  describe('small-body irregular outline', () => {
    const asteroid = (id: string, extra: Partial<CelestialBody> = {}) => planet({
      id, name: 'Rock', radiusKm: 5, massKg: 1e13,
      makeup: { rock: 0.85, metal: 0.15 }, ...extra
    } as any);

    it('an asteroid renders an irregular path, not a circle sphere', () => {
      const { container } = render(PlanetDisc, { props: { body: asteroid('a1') } });
      expect(container.querySelector('path[fill^="url(#sph"]')).toBeTruthy();
      expect(container.querySelector('circle[r="30"][fill^="url(#sph"]')).toBeFalsy();
      expect(container.querySelector('clipPath path')).toBeTruthy();     // features clip to the shape
      expect(container.querySelectorAll('g[clip-path] circle[fill^="rgba(0,0,0"]').length).toBeGreaterThan(0); // cratered
    });

    it('the outline is repeatable per id and differs between ids', () => {
      const d = (c: Element) => c.querySelector('path[fill^="url(#sph"]')!.getAttribute('d');
      const a = render(PlanetDisc, { props: { body: asteroid('same') } });
      const b = render(PlanetDisc, { props: { body: asteroid('same') } });
      const c = render(PlanetDisc, { props: { body: asteroid('other') } });
      expect(d(a.container)).toBe(d(b.container));
      expect(d(a.container)).not.toBe(d(c.container));
    });

    it('an asteroid-classed body is irregular regardless of size; a planet stays round', () => {
      const classed = render(PlanetDisc, { props: { body: planet({ id: 'x', radiusKm: 400, massKg: 1e20, classes: ['asteroid/c-type'], makeup: { carbon: 0.5, rock: 0.5 } } as any) } });
      expect(classed.container.querySelector('path[fill^="url(#sph"]')).toBeTruthy();
      const world = render(PlanetDisc, { props: { body: planet({ id: 'y', radiusKm: 6371, massKg: 5.97e24 } as any) } });
      expect(world.container.querySelector('circle[r="30"]')).toBeTruthy();
      expect(world.container.querySelector('path[fill^="url(#sph"]')).toBeFalsy();
    });
  });
});
