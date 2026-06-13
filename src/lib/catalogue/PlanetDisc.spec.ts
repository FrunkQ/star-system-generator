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

  it('renders a belt as a field of rocks, not a sphere', () => {
    const belt = planet({ roleHint: 'belt', massKg: 3e21 } as any);
    const { container } = render(PlanetDisc, { props: { body: belt } });
    // Many small rock circles, denser with more mass.
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(5);
    const sparse = render(PlanetDisc, { props: { body: planet({ roleHint: 'belt', massKg: 1e19 } as any) } });
    expect(sparse.container.querySelectorAll('circle').length)
      .toBeLessThan(container.querySelectorAll('circle').length);
  });

  it('stamps any world called Earth as Mostly Harmless', () => {
    const earth = render(PlanetDisc, { props: { body: planet({ name: 'Earth' }) } });
    expect(earth.container.querySelector('.harmless-stamp')).toBeTruthy();
    const other = render(PlanetDisc, { props: { body: planet({ name: 'Arrakis' }) } });
    expect(other.container.querySelector('.harmless-stamp')).toBeFalsy();
  });
});
