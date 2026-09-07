// G53: the Megaconstructs tab on the picker the wheel was invented for (the owner's correction,
// 2026-08-28 — the tab lives HERE, not on the old select dialog). DOM-verifiable (E7), so the
// acceptance criteria hold as tests on this surface too:
//   the tab appears when this host can take something and hides when it cannot (or no host);
//   a greyed row states WHY in a sentence; the previews are drawn from the registry.
import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import LoadConstructTemplateModal from './LoadConstructTemplateModal.svelte';
import type { CelestialBody, RulePack } from '$lib/types';

const pack = (): RulePack =>
  ({
    id: 'p', name: 'p',
    constructTemplates: {
      station: [
        { id: 't-station', name: 'Test Station', kind: 'construct', roleHint: 'construct', IsTemplate: true, tags: [], parentId: null, icon_type: 'square', icon_color: '#888' } as unknown as CelestialBody
      ],
      mega: [
        {
          id: 't-elevator', name: 'Space Elevator', kind: 'construct', roleHint: 'construct', IsTemplate: true,
          tags: [], parentId: null, megaType: 'space-elevator', artificial: true, icon_type: 'cross', icon_color: '#8fd3ff',
          requires: { hard: { hostKind: ['planet', 'moon'], hasSurface: true, needsGeostationary: true } },
          explain: 'A space elevator hangs from a geostationary orbit above a surface. {host} has no real geostationary altitude to hang it from.',
          description: 'A ribbon to geostationary.'
        } as unknown as CelestialBody,
        {
          id: 't-ringworld', name: 'Ringworld', kind: 'construct', roleHint: 'construct', IsTemplate: true,
          tags: [], parentId: null, megaType: 'ringworld', artificial: true, icon_type: 'circle', icon_color: '#9fe8a0',
          requires: { hard: { hostIsStar: true } },
          explain: 'A ringworld circles a star. {host} is not a star.',
          description: 'An inside-out world.'
        } as unknown as CelestialBody
      ]
    }
  }) as unknown as RulePack;

const earth = (): CelestialBody =>
  ({
    id: 'earth', name: 'Earth', parentId: 'sol', tags: [], kind: 'body', roleHint: 'planet',
    massKg: 5.972e24, radiusKm: 6371, rotation_period_hours: 23.934,
    orbitalBoundaries: {
      minLeoKm: 200, leoMoeBoundaryKm: 2000, meoHeoBoundaryKm: 50000,
      heoUpperBoundaryKm: 1.47e6, geoStationaryKm: 35786, isGeoFallback: false
    }
  }) as unknown as CelestialBody;

const sol = (): CelestialBody =>
  ({ id: 'sol', name: 'Sol', parentId: null, tags: [], kind: 'body', roleHint: 'star', massKg: 1.989e30, radiusKm: 696340 }) as unknown as CelestialBody;

const belt = (): CelestialBody =>
  ({ id: 'belt', name: 'Main Belt', parentId: 'sol', tags: [], kind: 'body', roleHint: 'belt' }) as unknown as CelestialBody;

describe('LoadConstructTemplateModal — the Megaconstructs tab (G53)', () => {
  it('with a capable host the title widens and both tabs show; ordinary flatten still excludes mega', () => {
    const { getByText, queryByText, container } = render(LoadConstructTemplateModal, {
      props: { rulePack: pack(), mode: 'create', hostBody: earth() }
    });
    expect(getByText('Create New Construct/Megaconstruct')).toBeTruthy();  // the owner's title
    expect(getByText('Constructs')).toBeTruthy();
    expect(getByText('Megaconstructs')).toBeTruthy();
    // Constructs tab is active: the station lists, the mega templates do NOT leak into it.
    expect(getByText('Test Station')).toBeTruthy();
    expect(queryByText('Space Elevator')).toBeNull();
    expect(container.textContent).toContain('1 construct');
  });

  it('the tab hides on a host that can take nothing, and in overwrite mode entirely', () => {
    const a = render(LoadConstructTemplateModal, { props: { rulePack: pack(), mode: 'create', hostBody: belt() } });
    expect(a.queryByText('Megaconstructs')).toBeNull();
    expect(a.getByText('Create New Construct')).toBeTruthy();  // plain title when no tab
    a.unmount();
    const b = render(LoadConstructTemplateModal, { props: { rulePack: pack(), mode: 'overwrite', hostBody: earth() } });
    expect(b.queryByText('Megaconstructs')).toBeNull();
    expect(b.queryByText('Space Elevator')).toBeNull();        // and never through the flatten
  });

  it('mega rows carry drawn previews; a greyed row states WHY and cannot be selected or created', async () => {
    const load = vi.fn();
    const { getByText, container } = render(LoadConstructTemplateModal, {
      props: { rulePack: pack(), mode: 'create', hostBody: earth() },
      events: { load }
    });
    await fireEvent.click(getByText('Megaconstructs'));
    // Both rows list; the elevator (available on Earth) leads, with an SVG portrait.
    expect(container.querySelectorAll('.browser-item.mega')).toHaveLength(2);
    expect(container.querySelectorAll('.browser-item.mega svg').length).toBe(2);
    // The greyed ringworld states why, host interpolated.
    expect(getByText('A ringworld circles a star. Earth is not a star.')).toBeTruthy();
    const greyRow = getByText('Ringworld').closest('.browser-item')!;
    expect(greyRow.classList.contains('unavailable')).toBe(true);
    await fireEvent.click(greyRow);                       // clicking it selects nothing
    const createBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Create')!;
    expect(createBtn.disabled).toBe(true);                // nothing selected — Create stays off
    await fireEvent.click(createBtn);
    expect(load).not.toHaveBeenCalled();
  });

  it('an available mega selects, shows the honest numbers, and Create dispatches it', async () => {
    const load = vi.fn();
    const { getByText, container } = render(LoadConstructTemplateModal, {
      props: { rulePack: pack(), mode: 'create', hostBody: sol() },
      events: { load }
    });
    await fireEvent.click(getByText('Megaconstructs'));
    const row = getByText('Ringworld').closest('.browser-item')!;
    expect(row.classList.contains('unavailable')).toBe(false);   // a star host takes a ringworld
    await fireEvent.click(row);
    // The footer speaks the registry's derived figures, not the tonnage line.
    expect(container.textContent).toMatch(/spin gravity ~1\.00 g/);
    expect(container.textContent).toMatch(/Earths of floor/);
    const createBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Create')!;
    expect(createBtn.disabled).toBe(false);
    await fireEvent.click(createBtn);
    expect(load).toHaveBeenCalledTimes(1);
    expect((load.mock.calls[0][0].detail as CelestialBody).megaType).toBe('ringworld');
  });

  it('switching tabs clears the selection, so Create never acts on a hidden choice', async () => {
    const { getByText, container } = render(LoadConstructTemplateModal, {
      props: { rulePack: pack(), mode: 'create', hostBody: earth() }
    });
    await fireEvent.click(getByText('Test Station'));
    const createBtn = () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Create')!;
    expect(createBtn().disabled).toBe(false);
    await fireEvent.click(getByText('Megaconstructs'));
    expect(createBtn().disabled).toBe(true);
  });
});
