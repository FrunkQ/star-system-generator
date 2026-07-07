import { describe, it, expect } from 'vitest';
import { constructDriveTag, constructRefuelTags, inheritedConstructTags, byId } from './inheritance';
import type { CelestialBody, EngineDefinition, FuelDefinition } from '../types';

const engines: EngineDefinition[] = [
  { id: 'engine-fusion-epstein', name: 'Epstein', type: 'Fusion', fuel_type_id: 'fuel-fusion-dt', thrust_kN: 1, efficiency_isp: 1, description: '', drive_tags: [] },
  { id: 'engine-warp-drive', name: 'Warp', type: 'Spacetime', fuel_type_id: 'fuel-exotic-matter', thrust_kN: 0, efficiency_isp: 0, description: '', drive_tags: ['drive/warp'] },
  { id: 'engine-ntr-solid', name: 'NTR', type: 'Nuclear Thermal', fuel_type_id: 'fuel-hydrogen', thrust_kN: 1, efficiency_isp: 1, description: '', drive_tags: [] }
];
const fuels: FuelDefinition[] = [
  { id: 'fuel-fusion-dt', name: 'D-T', density_kg_per_m3: 1, description: '', refuel_tags: ['resource/deuterium', 'frontier/gas-skimming'], availability: 'common' },
  { id: 'fuel-exotic-matter', name: 'Exotic', density_kg_per_m3: 1, description: '', refuel_tags: ['resource/exotic-matter'], availability: 'exotic' },
  { id: 'fuel-hydrogen', name: 'LH2', density_kg_per_m3: 1, description: '', refuel_tags: ['resource/water-ice', 'frontier/gas-skimming'], availability: 'common' }
];
const E = byId(engines);
const F = byId(fuels);
const ship = (engs: string[], tanks: string[]): CelestialBody => ({
  id: 's', name: 'S', kind: 'construct', parentId: null,
  engines: engs.map((id) => ({ engine_id: id, quantity: 1 })),
  fuel_tanks: tanks.map((id) => ({ fuel_type_id: id, capacity_units: 1, current_units: 1 }))
} as any);

describe('constructDriveTag (drive inherited from engines)', () => {
  it('a torch/sublight ship has no FTL drive (null)', () => {
    expect(constructDriveTag(ship(['engine-fusion-epstein'], []), E)).toBeNull();
  });
  it('a warp ship inherits drive/warp', () => {
    expect(constructDriveTag(ship(['engine-ntr-solid', 'engine-warp-drive'], []), E)).toBe('drive/warp');
  });
  it('no engines = sublight (null)', () => {
    expect(constructDriveTag(ship([], []), E)).toBeNull();
  });
});

describe('constructRefuelTags (refuel sources from fuel tanks)', () => {
  it('gathers + dedupes resource/frontier tags across tanks', () => {
    const tags = constructRefuelTags(ship([], ['fuel-fusion-dt', 'fuel-hydrogen']), F);
    expect(tags).toEqual(expect.arrayContaining(['resource/deuterium', 'resource/water-ice', 'frontier/gas-skimming']));
    expect(tags.filter((t) => t === 'frontier/gas-skimming').length).toBe(1); // deduped
  });
  it('an exotic-fuel ship sources only its exotic resource', () => {
    expect(constructRefuelTags(ship([], ['fuel-exotic-matter']), F)).toEqual(['resource/exotic-matter']);
  });
});

describe('inheritedConstructTags', () => {
  it('flags inherited drive + refuel tags (not manual)', () => {
    const tags = inheritedConstructTags(ship(['engine-warp-drive'], ['fuel-exotic-matter']), E, F);
    expect(tags).toContainEqual({ key: 'drive/warp', inherited: true, coi: true });
    expect(tags).toContainEqual({ key: 'resource/exotic-matter', inherited: true, coi: true });
    expect(tags.every((t) => t.inherited && !(t as any).manual)).toBe(true);
  });
});

describe('byId accepts {entries} or a bare array', () => {
  it('builds the same map either way', () => {
    expect(byId({ entries: engines }).get('engine-warp-drive')?.drive_tags).toEqual(['drive/warp']);
    expect(byId(engines).get('engine-warp-drive')?.drive_tags).toEqual(['drive/warp']);
  });
});
