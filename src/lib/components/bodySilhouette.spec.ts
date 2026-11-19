// THE CUTAWAY MUST CLIP TO THE SILHOUETTE THE DISC ACTUALLY DRAWS, and this renders both to check
// it rather than checking that both call the same function.
//
// A source-level pin would pass while the two drifted apart in any of the ways they could: one of
// them passing the body through a wrapper, one of them memoising against a stale key, one of them
// left on a circle. What a GM sees is two SVG paths, so two SVG paths are what is compared — and a
// mismatch here is a cutaway whose cut faces stop short of the rock's edge, which is exactly the
// fault the shared outline was introduced to prevent.
import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import PlanetDisc from '$lib/catalogue/PlanetDisc.svelte';
import CompositionCrossSection from './CompositionCrossSection.svelte';
import type { CelestialBody, Makeup } from '$lib/types';

function rock(extra: Partial<CelestialBody> = {}): CelestialBody {
  return {
    id: 'rock-1', name: 'Rock', kind: 'body', roleHint: 'planet', parentId: 'star',
    apparentColorHex: '#8a8f99', massKg: 4.6e16, radiusKm: 18,
    makeup: { rock: 0.6, ice: 0.4 }, classes: ['asteroid/s-type'],
    ...extra
  } as CelestialBody;
}
const MAKEUP: Required<Makeup> = { metal: 0.1, rock: 0.5, carbon: 0.1, ice: 0.3, gas: 0 };

/** Every `d` the component drew, so a change of markup cannot quietly empty this test. */
function paths(container: Element): string[] {
  return [...container.querySelectorAll('path')]
    .map((p) => p.getAttribute('d') ?? '')
    .filter((d) => d.length > 0);
}

describe('the disc and the cutaway draw the same rock', () => {
  for (const lobes of [undefined, 2, 3]) {
    const label = lobes === undefined ? 'an ordinary asteroid' : `a ${lobes}-lobed body`;
    it(`${label}: the cutaway's clip path is the disc's silhouette, character for character`, () => {
      const body = rock({ id: `shared-${lobes ?? 1}`, lobes } as Partial<CelestialBody>);
      const disc = render(PlanetDisc, { props: { body } });
      const xsec = render(CompositionCrossSection, { props: { body, makeup: MAKEUP, seed: body.id } });

      const discPaths = paths(disc.container);
      const clip = xsec.container.querySelector(`#xsec-body-${body.id} path`)?.getAttribute('d');

      expect(discPaths.length, 'the disc drew no path at all').toBeGreaterThan(0);
      expect(clip, 'the cutaway fell back to a circle for a small body').toBeTruthy();
      expect(discPaths, 'the cutaway is clipping to something the disc never drew').toContain(clip);
    });
  }

  // The fallback is a real state, not an oversight: a body big enough to have pulled itself round is
  // a circle in both, and the clip path is absent because a circle is used instead.
  it('a round world uses a circle in both, and no silhouette path', () => {
    const world = rock({ id: 'big', radiusKm: 6371, massKg: 5.97e24, classes: [] });
    const xsec = render(CompositionCrossSection, { props: { body: world, makeup: MAKEUP, seed: 'big' } });
    expect(xsec.container.querySelector('#xsec-body-big path')).toBeNull();
    expect(xsec.container.querySelector('#xsec-body-big circle')).toBeTruthy();
  });
});
