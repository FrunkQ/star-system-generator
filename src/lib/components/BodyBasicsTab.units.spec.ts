// LUNAR MASSES AND LUNAR RADII IN THE SIZE EDITOR (Discord: "there should definitely be moon masses
// in the mass scales" / moon radii as a selectable unit; owner: "Easy. Tiny tweak.").
//
// The ladder is pinned in `units.spec.ts`. What those pins cannot say is whether this editor USES
// it - and it did not: the mass field kept a table of its own that knew four of the ladder's stops
// and showed every other one as "M⊕". So the field is mounted here and its unit button is read.
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, it, expect, beforeEach } from 'vitest';
import BodyBasicsTab from './BodyBasicsTab.svelte';
import { unitPrefs } from '$lib/unitPrefsStore';
import { loadStarterPack } from '$lib/import/realsky/testPack';
import { EARTH_MASS_KG, LUNA_MASS_KG, LUNA_RADIUS_KM } from '$lib/constants';
import { UNIT_QUANTITIES, unitIdLabel, type UnitId } from '$lib/units';

const rulePack = loadStarterPack() as any;

function luna() {
  return {
    id: 'm', kind: 'body', roleHint: 'moon', name: 'Luna', parentId: 'p', classes: ['planet/barren'], tags: [],
    massKg: LUNA_MASS_KG, radiusKm: LUNA_RADIUS_KM, makeup: { metal: 0.05, rock: 0.95 },
    orbit: { hostId: 'p', elements: { a_AU: 0.00257, e: 0.05, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
  } as any;
}

function mount(prefs: Record<string, string>) {
  unitPrefs.set(prefs);
  const body = luna();
  const { container } = render(BodyBasicsTab, { props: { body, rulePack } });
  const massBtn = container.querySelector('button[aria-label="Change mass units"]') as HTMLButtonElement;
  const radBtn = container.querySelector('button[aria-label="Change radius units"]') as HTMLButtonElement;
  const massNum = massBtn.parentElement!.querySelector('input.sc-num') as HTMLInputElement;
  const radNum = radBtn.parentElement!.querySelector('input.sc-num') as HTMLInputElement;
  return { body, container, massBtn, radBtn, massNum, radNum };
}

describe('the Size editor reads mass and radius in lunar units', () => {
  beforeEach(() => unitPrefs.set({}));

  it('shows Luna as exactly one lunar mass when the campaign is on the lunar stop', () => {
    const { massBtn, massNum } = mount({ 'mass:moon': 'M-Luna' });
    expect(massBtn.textContent?.trim()).toBe('M☾');
    expect(massBtn.getAttribute('title')).toContain('lunar masses');
    expect(Number(massNum.value)).toBe(1);
  });

  it('labels the field with the stop the campaign is ACTUALLY on, for every stop of the ladder', () => {
    // kt, Mt and Gt all used to read "M⊕" here while every other panel read the real unit.
    for (const stop of UNIT_QUANTITIES.mass.stops as readonly UnitId[]) {
      if (stop === 'auto') continue;
      const { massBtn } = mount({ 'mass:moon': stop });
      expect(massBtn.textContent?.trim(), stop).toBe(unitIdLabel(stop));
    }
  });

  it('a mass typed in lunar masses is stored as that many Moons', async () => {
    const { body, massNum } = mount({ 'mass:moon': 'M-Luna' });
    massNum.value = '2';
    await fireEvent.change(massNum);
    await tick();
    expect(body.massKg / LUNA_MASS_KG).toBeCloseTo(2, 6);
  });

  it('cycles the radius through lunar radii, and Luna is one of them', async () => {
    const { radBtn, radNum } = mount({});
    const seen: string[] = [radBtn.textContent!.trim()];
    for (let i = 0; i < 4; i++) { await fireEvent.click(radBtn); await tick(); seen.push(radBtn.textContent!.trim()); }
    // Earth first, as it always was; the two clicks a GM already knew still land where they did.
    expect(seen).toEqual(['R⊕', 'R♃', 'km', 'R☾', 'R⊕']);
    for (let i = 0; i < 3; i++) { await fireEvent.click(radBtn); await tick(); }
    expect(radBtn.textContent?.trim()).toBe('R☾');
    expect(radBtn.getAttribute('title')).toContain('lunar radii');
    expect(Number(radNum.value)).toBe(1);
  });

  it('leaves the default exactly as it was: Earth masses, Earth radii', () => {
    const { massBtn, radBtn, massNum } = mount({});
    expect(massBtn.textContent?.trim()).toBe('M⊕');
    expect(radBtn.textContent?.trim()).toBe('R⊕');
    expect(Number(massNum.value)).toBeCloseTo(LUNA_MASS_KG / EARTH_MASS_KG, 5);
  });
});
