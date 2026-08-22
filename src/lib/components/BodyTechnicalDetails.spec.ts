// THE PANEL MUST ACTUALLY RENDER, AND NOTHING ELSE WAS CHECKING THAT.
//
// WHY THIS FILE EXISTS. A reference to an undefined identifier inside a Svelte component's script
// block is a RUNTIME error: `npm run build` compiles it happily, `svelte-check` does not flag it if
// the name merely looks like a variable, and the whole unit suite never notices because nothing
// mounts this component. So a `ReferenceError: NL is not defined` shipped to beta in the star branch
// of this panel, and the first thing to find it was the owner clicking a star.
//
// The gap is the point: this is the product's densest read-only surface — forty-odd cards, several
// of them branching on role — and it had NO test that so much as rendered it. These are deliberately
// shallow. They do not assert wording or layout, which change constantly; they assert that each KIND
// of body can be shown at all, and that the cards whose figures the physics drives are present with
// a number in them. That is exactly the class of fault that got through.
import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import BodyTechnicalDetails from './BodyTechnicalDetails.svelte';
import { loadStarterPack } from '$lib/import/realsky/testPack';
import { SystemProcessor } from '$lib/core/SystemProcessor';
import { setOverride } from '$lib/physics/overrides';
import { EARTH_MASS_KG, EARTH_RADIUS_KM } from '$lib/constants';
import type { System, CelestialBody, RulePack } from '$lib/types';

const rulePack = loadStarterPack() as unknown as RulePack;

function star(): CelestialBody {
  return {
    id: 'star', kind: 'body', name: 'Test Star', parentId: null, roleHint: 'star',
    massKg: 1.989e30, radiusKm: 696340, temperatureK: 5778, radiationOutput: 1,
    classes: ['star/G2V'], axial_tilt_deg: 0, rotation_period_hours: 600, tags: [],
    magneticField: { strengthGauss: 1 }
  } as unknown as CelestialBody;
}

function planet(): CelestialBody {
  return {
    id: 'p', kind: 'body', name: 'Test Planet', parentId: 'star', roleHint: 'planet',
    massKg: EARTH_MASS_KG, radiusKm: EARTH_RADIUS_KM,
    axial_tilt_deg: 23, rotation_period_hours: 24, tags: [], classes: [],
    makeup: { metal: 0.32, rock: 0.68, carbon: 0, ice: 0, gas: 0 },
    atmosphere: { pressure_bar: 1, composition: { N2: 0.78, O2: 0.22 } },
    orbit: { hostId: 'star', elements: { a_AU: 1, e: 0.02, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
  } as unknown as CelestialBody;
}

/** Process for real, so the panel sees the fields the engine actually commits. */
function processed(extra?: (s: CelestialBody, p: CelestialBody) => void) {
  const s = star(), p = planet();
  extra?.(s, p);
  const sys = {
    id: 'sys', name: 'T', seed: 'seed', epochT0: 0, age_Gyr: 4.6,
    rulePackId: 'test', rulePackVersion: '1', tags: [], nodes: [s, p]
  } as unknown as System;
  const out = new SystemProcessor().process(sys, rulePack);
  return {
    star: out.nodes.find((n) => n.id === 'star') as CelestialBody,
    planet: out.nodes.find((n) => n.id === 'p') as CelestialBody
  };
}

const cardLabels = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('.detail-item .label')).map((e) => e.textContent?.trim() ?? '');
const cardFor = (c: HTMLElement, label: string) =>
  Array.from(c.querySelectorAll('.detail-item'))
    .find((d) => d.querySelector('.label')?.textContent?.trim() === label);

describe('the panel renders at all — the check that was missing', () => {
  it('renders a STAR without throwing, and shows the star cards', () => {
    const { star: s } = processed();
    const { container } = render(BodyTechnicalDetails, { props: { body: s, rulePack } });
    const labels = cardLabels(container);
    for (const l of ['Magnetic activity (ionising)', 'Ionising output', 'Habitable zone',
      'Frost line', 'UV kill zone', 'Magnetic Field', 'Luminosity']) {
      expect(labels, l).toContain(l);
    }
  });

  it('renders a PLANET without throwing, and does not show it the star cards', () => {
    const { planet: p } = processed();
    const { container } = render(BodyTechnicalDetails, { props: { body: p, rulePack } });
    const labels = cardLabels(container);
    expect(labels).toContain('Mass');
    expect(labels).not.toContain('Magnetic activity (ionising)');
    expect(labels).not.toContain('Habitable zone');
  });

  it('renders an UNPROCESSED body — the editor mounts this before any pass has run', () => {
    expect(() => render(BodyTechnicalDetails, { props: { body: star(), rulePack } })).not.toThrow();
    expect(() => render(BodyTechnicalDetails, { props: { body: planet(), rulePack } })).not.toThrow();
  });
});

describe('the figures a pin drives reach the card', () => {
  it('a star card carries its activity, its field and a role note for the field', () => {
    const { star: s } = processed();
    const { container } = render(BodyTechnicalDetails, { props: { body: s, rulePack } });
    expect(cardFor(container, 'Magnetic activity (ionising)')?.textContent).toMatch(/\(\d/);
    const field = cardFor(container, 'Magnetic Field')!;
    expect(field.textContent).toMatch(/G/);
    // The role note is the whole point of that card now: it must say which of the three states it
    // is in rather than leaving a live input looking inert.
    expect(field.querySelector('.role-note')?.textContent?.trim()).toBeTruthy();
    // ...and the tooltip must be a real sentence, not the string "undefined" or an identifier.
    const tip = field.getAttribute('title') ?? '';
    expect(tip).toMatch(/AUTHORED, not derived/);
    expect(tip).not.toMatch(/undefined|\bNL\b/);
  });

  it('a PINNED activity says so on the card and changes the field’s role note', () => {
    const { star: s } = processed((st) => setOverride(st, 'flareActivity', 0.6));
    const { container } = render(BodyTechnicalDetails, { props: { body: s, rulePack } });
    expect(cardFor(container, 'Magnetic activity (ionising)')?.querySelector('.ovr-flag')?.textContent)
      .toBe('OVERRIDDEN');
    expect(cardFor(container, 'Magnetic Field')?.querySelector('.role-note')?.textContent)
      .toMatch(/that is pinned/);
  });

  it('a PINNED magnetosphere on a planet flags the card OVERRIDDEN', () => {
    const { planet: p } = processed((_s, pl) => setOverride(pl, 'magneticFieldGauss', 700000));
    const { container } = render(BodyTechnicalDetails, { props: { body: p, rulePack } });
    expect(cardFor(container, 'Magnetic Field')?.querySelector('.ovr-flag')?.textContent)
      .toBe('OVERRIDDEN');
  });

  it('the GM overrides strip lists what was pinned, and names the reason on hover', () => {
    const { planet: p } = processed((_s, pl) => {
      setOverride(pl, 'albedo', -0.5);
      pl.overrides!.anomalies = { albedo: { tag: 'anomaly/exotic-matter' } };
    });
    const { container } = render(BodyTechnicalDetails, { props: { body: p, rulePack } });
    const badge = container.querySelector('.overrides-callout .ovr-badge');
    expect(badge?.textContent?.trim()).toBe('Bond albedo');
    expect(badge?.getAttribute('title')).toMatch(/Reason given: Exotic Matter/);
    expect(badge?.getAttribute('title')).toMatch(/IMPOSSIBLE/);
  });
});
