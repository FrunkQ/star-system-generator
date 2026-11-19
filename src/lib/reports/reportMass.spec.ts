// "THE DISPLAY IS UNHELPFUL WHEN MOST DISKS/BELTS ARE ORDERS OF MAGNITUDE BELOW 0.001 - I SUGGEST
// SCIENTIFIC NOTATION OR DISPLAYING MASS IN KG" (Discord, 09-08).
//
// The system report formatted a mass itself - `mRel.toFixed(3) + ' M⊕'` - so everything lighter
// than half a thousandth of an Earth printed "0.000 M⊕": a belt, a small moon, an asteroid. G34
// moved the report's temperatures, radii and speeds onto the campaign's unit prefs and missed this
// one, which left a second copy of "how a mass is written" that the ladder's own small-number rule
// (exponential below 1e-3, pinned in `units.spec.ts`) never reached.
//
// The report is mounted and its Mass cells are read; what they must equal is whatever the ONE
// formatter says, so this cannot drift into a third opinion.
import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import ReportDocument from './ReportDocument.svelte';
import { formatPref } from '$lib/units';
import { EARTH_MASS_KG, LUNA_MASS_KG } from '$lib/constants';

const orbit = (hostId: string, a_AU: number) => ({ hostId, elements: { a_AU, e: 0.01, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } });
const PHOBOS_KG = 1.066e16;

function system() {
  return {
    id: 's', name: 'Test', seed: 's', epochT0: 0, age_Gyr: 4.6,
    nodes: [
      { id: 'star', name: 'Sol', kind: 'body', roleHint: 'star', parentId: null, classes: ['star/G'], massKg: 1.989e30, radiusKm: 696340, temperatureK: 5778, tags: [] },
      { id: 'p', name: 'Marsish', kind: 'body', roleHint: 'planet', parentId: 'star', classes: ['planet/desert'], massKg: 0.107 * EARTH_MASS_KG, radiusKm: 3389.5, tags: [], orbit: orbit('star', 1.52) },
      { id: 'm', name: 'Speck', kind: 'body', roleHint: 'moon', parentId: 'p', classes: ['asteroid/c-type'], massKg: PHOBOS_KG, radiusKm: 11.3, tags: [], orbit: orbit('p', 0.0000627) }
    ]
  } as any;
}

/** The text of every "Mass" row in the rendered report. */
function massCells(prefs: Record<string, string> = {}): string[] {
  const { container } = render(ReportDocument, { props: { system: system(), mode: 'GM', theme: 'retro', prefs } });
  return Array.from(container.querySelectorAll('tr'))
    .filter((tr) => tr.querySelector('th')?.textContent?.trim() === 'Mass')
    .map((tr) => (tr.querySelector('td')?.textContent ?? '').replace(/ /g, ' ').trim());
}

describe('the system report writes a mass through the unit system', () => {
  it('never prints a body that HAS a mass as zero', () => {
    const cells = massCells();
    expect(cells.length, 'the report has Mass rows').toBeGreaterThanOrEqual(2);
    // ABSOLUTE: no cell reads as a zero mass. This is the reported fault, whole.
    for (const c of cells) expect(c, c).not.toMatch(/^0(\.0+)? /);
  });

  it('shows a tiny moon in scientific notation, exactly as every panel does', () => {
    const cells = massCells();
    expect(cells).toContain(formatPref({}, 'mass', 'moon', PHOBOS_KG));
    expect(formatPref({}, 'mass', 'moon', PHOBOS_KG)).toBe('1.78e-9 M⊕');
    expect(cells).toContain(formatPref({}, 'mass', 'planet', 0.107 * EARTH_MASS_KG));
  });

  it('follows the campaign’s mass unit, like its radii and temperatures already do', () => {
    const cells = massCells({ 'mass:moon': 'M-Luna', 'mass:planet': 't' });
    expect(cells).toContain(formatPref({ 'mass:moon': 'M-Luna' }, 'mass', 'moon', PHOBOS_KG));
    expect(cells.some((c) => c.endsWith(' M☾'))).toBe(true);
    expect(cells.some((c) => c.endsWith(' t'))).toBe(true);
    expect(LUNA_MASS_KG).toBeGreaterThan(PHOBOS_KG);
  });
});
