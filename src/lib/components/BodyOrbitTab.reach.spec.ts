// B23 at the control a GM actually types into: a star about a central black hole may be set past
// 1,000,000 AU, out to the hole's own reach - and a Sun-like system keeps exactly the ceiling it had.
import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import { tick } from 'svelte';
import BodyOrbitTab from './BodyOrbitTab.svelte';
import { starmapStore } from '$lib/starmapStore';

const M_SUN = 1.989e30;
const mount = async (rootMassSuns: number) => {
  const hole: any = { id: 'bh', name: 'Hole', kind: 'body', roleHint: 'star', parentId: null, massKg: rootMassSuns * M_SUN, radiusKm: 30000, temperatureK: 0, tags: [] };
  const star: any = { id: 's', name: 'Star', kind: 'body', roleHint: 'star', parentId: 'bh', massKg: M_SUN, radiusKm: 695700, temperatureK: 5772, tags: [],
    orbit: { hostId: 'bh', hostMu: 1, t0: 0, elements: { a_AU: 5000, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } };
  const system = { id: 'sys', name: 'sys', nodes: [hole, star] };
  const { container } = render(BodyOrbitTab, { props: { body: star, parentBody: hole, system } });
  await tick();
  const box = container.querySelector('.form-group input[type="number"]') as HTMLInputElement;
  const type = async (v: string) => { await fireEvent.input(box, { target: { value: v } }); await tick(); };
  return { star, type };
};

afterEach(() => starmapStore.set(null));

describe('a companion may be typed out to the system\'s reach', () => {
  it('2,000,000 AU from a ten-thousand-sun black hole is kept as typed', async () => {
    const { star, type } = await mount(1e4);
    await type('2000000');
    expect(star.orbit.elements.a_AU).toBe(2000000);
  });
  it('...and its reach (2.72 million AU) is still a ceiling against a slipped exponent', async () => {
    const { star, type } = await mount(1e4);
    await type('1e49');
    expect(star.orbit.elements.a_AU).toBeGreaterThan(2.72e6);
    expect(star.orbit.elements.a_AU).toBeLessThan(2.73e6);
  });
  it('a Sun-mass root keeps the 1e6 AU ceiling it always had', async () => {
    const { star, type } = await mount(1);
    await type('2000000');
    expect(star.orbit.elements.a_AU).toBe(1e6);
  });
  it('...until the GM sets a wider System edge in Settings (20 ly), which is then the ceiling', async () => {
    starmapStore.set({ systemEdgeAu: 20 * 63241.077 } as any);
    const { star, type } = await mount(1);
    await type('1200000');
    expect(star.orbit.elements.a_AU).toBe(1200000);
  });
});
