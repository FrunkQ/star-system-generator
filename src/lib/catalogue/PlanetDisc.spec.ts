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
  it('renders an SVG disc tinted by the apparent colour', () => {
    const { container } = render(PlanetDisc, { props: { body: planet() } });
    const svg = container.querySelector('svg.planet-disc');
    expect(svg).toBeTruthy();
    // The cartoon-sphere gradient and the body circle are always present.
    expect(container.querySelector('radialGradient')).toBeTruthy();
    expect(container.querySelector('circle')).toBeTruthy();
  });

  it('draws ring ellipses when ringed', () => {
    const plain = render(PlanetDisc, { props: { body: planet(), ringed: false } });
    expect(plain.container.querySelectorAll('ellipse').length).toBe(0);
    const ringed = render(PlanetDisc, { props: { body: planet(), ringed: true } });
    expect(ringed.container.querySelectorAll('ellipse').length).toBe(2); // back + front halves
  });

  it('draws latitudinal bands for a banded giant', () => {
    const giant = planet({ apparentColor: { hex: '#d8b48a', palette: [], banding: 6 } });
    const { container } = render(PlanetDisc, { props: { body: giant } });
    expect(container.querySelectorAll('rect').length).toBeGreaterThan(0);
  });
});
