import { get } from 'svelte/store';
import { starmapStore } from './starmapStore';
import type { Starmap } from './types';

describe('starmapStore', () => {
  beforeEach(() => {
    starmapStore.set(null); // Reset store before each test
  });

  it('should have a null initial value', () => {
    expect(get(starmapStore)).toBeNull();
  });

  it('should set and retrieve a starmap', () => {
    const testStarmap: Starmap = {
      id: 'test-starmap-1',
      name: 'Test Starmap',
      systems: [],
      routes: [],
    };
    starmapStore.set(testStarmap);
    expect(get(starmapStore)).toEqual(testStarmap);
  });

  it('should update an existing starmap', () => {
    const initialStarmap: Starmap = {
      id: 'test-starmap-1',
      name: 'Test Starmap',
      systems: [],
      routes: [],
    };
    starmapStore.set(initialStarmap);

    const updatedStarmap: Starmap = {
      ...initialStarmap,
      name: 'Updated Test Starmap',
      systems: [{ id: 'sys1', name: 'System 1', position: { x: 0, y: 0 }, system: {} as any }],
    };

    starmapStore.update(starmap => {
      if (starmap) {
        starmap.name = updatedStarmap.name;
        starmap.systems = updatedStarmap.systems;
      }
      return starmap;
    });

    expect(get(starmapStore)).toEqual(updatedStarmap);
  });

  it('should add a system to the starmap', () => {
    const initialStarmap: Starmap = {
      id: 'test-starmap-1',
      name: 'Test Starmap',
      systems: [],
      routes: [],
    };
    starmapStore.set(initialStarmap);

    const newSystemNode = { id: 'sys1', name: 'System 1', position: { x: 0, y: 0 }, system: {} as any };

    starmapStore.update(starmap => {
      if (starmap) {
        starmap.systems = [...starmap.systems, newSystemNode];
      }
      return starmap;
    });

    expect(get(starmapStore)?.systems).toEqual([newSystemNode]);
  });

  it('should add a route to the starmap', () => {
    const initialStarmap: Starmap = {
      id: 'test-starmap-1',
      name: 'Test Starmap',
      systems: [{ id: 'sys1', name: 'System 1', position: { x: 0, y: 0 }, system: {} as any }],
      routes: [],
    };
    starmapStore.set(initialStarmap);

    const newRoute = { id: 'route1', sourceSystemId: 'sys1', targetSystemId: 'sys2', distance: 5, unit: 'J' };

    starmapStore.update(starmap => {
      if (starmap) {
        starmap.routes = [...starmap.routes, newRoute];
      }
      return starmap;
    });

    expect(get(starmapStore)?.routes).toEqual([newRoute]);
  });

  it('should delete a route from the starmap', () => {
    const route1 = { id: 'route1', sourceSystemId: 'sys1', targetSystemId: 'sys2', distance: 5, unit: 'J' };
    const route2 = { id: 'route2', sourceSystemId: 'sys2', targetSystemId: 'sys3', distance: 10, unit: 'LY' };
    const initialStarmap: Starmap = {
      id: 'test-starmap-1',
      name: 'Test Starmap',
      systems: [],
      routes: [route1, route2],
    };
    starmapStore.set(initialStarmap);

    starmapStore.update(starmap => {
      if (starmap) {
        starmap.routes = starmap.routes.filter(r => r.id !== 'route1');
      }
      return starmap;
    });

    expect(get(starmapStore)?.routes).toEqual([route2]);
  });

  it('should delete a system and its associated routes from the starmap', () => {
    const sys1 = { id: 'sys1', name: 'System 1', position: { x: 0, y: 0 }, system: {} as any };
    const sys2 = { id: 'sys2', name: 'System 2', position: { x: 100, y: 100 }, system: {} as any };
    const route1 = { id: 'route1', sourceSystemId: 'sys1', targetSystemId: 'sys2', distance: 5, unit: 'J' };
    const route2 = { id: 'route2', sourceSystemId: 'sys2', targetSystemId: 'sys3', distance: 10, unit: 'LY' };
    const initialStarmap: Starmap = {
      id: 'test-starmap-1',
      name: 'Test Starmap',
      systems: [sys1, sys2],
      routes: [route1, route2],
    };
    starmapStore.set(initialStarmap);

    starmapStore.update(starmap => {
      if (starmap) {
        starmap.systems = starmap.systems.filter(s => s.id !== 'sys1');
        starmap.routes = starmap.routes.filter(r => r.sourceSystemId !== 'sys1' && r.targetSystemId !== 'sys1');
      }
      return starmap;
    });

    expect(get(starmapStore)?.systems).toEqual([sys2]);
    expect(get(starmapStore)?.routes).toEqual([route2]);
  });
});
