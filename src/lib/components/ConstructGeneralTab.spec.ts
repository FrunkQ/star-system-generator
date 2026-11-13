// THE ORBIT TAB'S TWO PLACEMENT FAULTS (found live, 2026-09-26, a space elevator sent to L2):
//   1. it read the L-point off a `$:` mirror of the select, which is one flush behind inside the
//      change handler - so every L-point pick was applied one pick LATE, under the wrong label;
//   2. it offered L1-L5, every orbit band and every host to a structure that can only stand on a
//      surface (the create dialog narrows by the type's record; the edit surface did not).
// The DOM is a declarative surface (E7), so both are held here rather than left to an eyeball.
import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import { tick } from 'svelte';
import ConstructGeneralTab from './ConstructGeneralTab.svelte';
import { AU_KM } from '$lib/constants';
import { computeWorldPositions } from '$lib/physics/worldPositions';

const system = (construct: Record<string, unknown>): any => ({
  id: 'sys', name: 'sys',
  nodes: [
    { id: 'sol', name: 'Sol', kind: 'body', roleHint: 'star', parentId: null, massKg: 1.989e30, radiusKm: 695700, temperatureK: 5772, tags: [] },
    { id: 'earth', name: 'Earth', kind: 'body', roleHint: 'planet', parentId: 'sol', massKg: 5.972e24, radiusKm: 6371,
      rotation_period_hours: 23.934, axial_tilt_deg: 0, tags: [],
      orbit: { hostId: 'sol', hostMu: 1.327e20, t0: 0, elements: { a_AU: 1, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0 } },
      orbitalBoundaries: { minLeoKm: 200, leoMoeBoundaryKm: 2000, meoHeoBoundaryKm: 50000, heoUpperBoundaryKm: 1.47e6, geoStationaryKm: 35786, isGeoFallback: false } },
    { id: 'jove', name: 'Jove', kind: 'body', roleHint: 'planet', parentId: 'sol', massKg: 1.9e27, radiusKm: 69911, classes: ['planet/gas-giant'], tags: [],
      orbit: { hostId: 'sol', hostMu: 1.327e20, t0: 0, elements: { a_AU: 5.2, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0 } } },
    { id: 'x', name: 'X', kind: 'construct', parentId: 'earth', placement: 'Surface', tags: [],
      physical_parameters: { dimensionsM: [45e6, 30, 30], massKg: 0 },
      orbit: { hostId: 'earth', hostMu: 3.986e14, t0: 0, elements: { a_AU: 6371 / AU_KM, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 2.0 } },
      ...construct }
  ]
});
const mount = async (construct: Record<string, unknown>) => {
  const sys = system(construct);
  const node = sys.nodes[3];
  const { container } = render(ConstructGeneralTab, { props: { system: sys, construct: node } });
  await tick();
  const zone = container.querySelector('#placement') as HTMLSelectElement;
  const host = container.querySelector('#parent-body') as HTMLSelectElement;
  const pick = async (el: HTMLSelectElement, value: string) => { await fireEvent.change(el, { target: { value } }); await tick(); };
  const offered = () => Array.from(zone.options).filter((o) => !o.disabled).map((o) => o.value);
  return { sys, node, container, zone, host, pick, offered };
};

describe('an L-point pick is applied on the pick that made it, not the next one', () => {
  it('a station sent to L2 is AT L2 at once: marker, sibling parentage and a 1.01 AU orbit', async () => {
    const { node, zone, pick } = await mount({});
    await pick(zone, 'L2');
    expect(node.placement).toBe('L2');
    expect(node.coOrbital).toEqual({ hostId: 'earth', point: 'l2' });
    expect(node.parentId).toBe('sol');
    expect(node.ui_parentId).toBe('earth');
    expect(node.orbit.elements.a_AU).toBeGreaterThan(1.005);
  });
  it('and coming back to Surface lands it on the surface - not at the point it just left', async () => {
    const { node, zone, pick } = await mount({});
    await pick(zone, 'L2');
    await pick(zone, 'Surface');
    expect(node.placement).toBe('Surface');
    expect(node.coOrbital).toBeUndefined();
    expect(node.parentId).toBe('earth');
    expect(node.orbit.elements.a_AU).toBeCloseTo(6371 / AU_KM, 12);
  });
});

describe('a space elevator is offered what an elevator can take, here as in the create dialog', () => {
  const ELEVATOR = { megaType: 'space-elevator' };
  it('the zone list is Surface alone - no orbit band, no Lagrange point', async () => {
    const { offered } = await mount(ELEVATOR);
    expect(offered()).toEqual(['Surface']);
  });
  it('a host with nothing to anchor to is greyed, with the sentence that says why', async () => {
    const { host } = await mount(ELEVATOR);
    const opt = (id: string) => Array.from(host.options).find((o) => o.value === id)!;
    expect(opt('earth').disabled).toBe(false);
    expect(opt('sol').disabled).toBe(true);
    expect(opt('jove').disabled).toBe(true);
    expect(opt('sol').title).toContain('Sol');
  });
  it('an L2 value arriving anyway is not written, and neither is a host it cannot stand on', async () => {
    const { sys, node, zone, host, pick } = await mount(ELEVATOR);
    const before = JSON.stringify(node);
    // jsdom lets a test set a value the list does not offer; a stale select or a script can too.
    zone.add(new Option('L2', 'L2'));
    await pick(zone, 'L2');
    await pick(host, 'sol');
    expect(JSON.stringify(node)).toBe(before);
    const p = computeWorldPositions(sys, 0);
    expect(Math.hypot(p.get('x')!.x - p.get('earth')!.x, p.get('x')!.y - p.get('earth')!.y) * AU_KM).toBeCloseTo(6371, 3);
  });
  it('it has no altitude slider and no orbital position to move: its place is its anchor', async () => {
    const { container, node } = await mount(ELEVATOR);
    expect(container.querySelector('.slider-svg')).toBeNull();
    const anomaly = container.querySelector('#anomaly') as HTMLInputElement;
    expect(anomaly.disabled).toBe(true);
    await fireEvent.input(anomaly, { target: { value: '200' } });
    expect(node.orbit.elements.M0_rad).toBe(2.0);
    expect(container.textContent).toContain('stands on its anchor');
  });
  it('an ordinary station keeps every option, every host and its sliders', async () => {
    const { offered, host, container } = await mount({});
    expect(offered()).toEqual(['Surface', 'Low Orbit', 'Medium Orbit', 'High Orbit', 'Geostationary Orbit', 'L1', 'L2', 'L3', 'L4', 'L5']);
    expect(Array.from(host.options).filter((o) => o.value && o.disabled)).toHaveLength(0);
    expect(container.querySelector('.slider-svg')).not.toBeNull();
    expect((container.querySelector('#anomaly') as HTMLInputElement).disabled).toBe(false);
  });
});
