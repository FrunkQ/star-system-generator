// Filter parameter METADATA (labels/types/ranges/groups) for building editor controls, WITHOUT the
// three.js-dependent registry — so the preset editor in the main app can render every filter's full
// control set without pulling three into the main bundle. The config modules import only the schema
// type + glsl raw strings (no three), so importing them here is safe.
import type { FilterParam } from './schema';
import crt from './definitions/crt/config';
import nightVision from './definitions/night_vision/config';
import thermal from './definitions/thermal/config';

export interface FilterMeta {
  params: FilterParam[];
  groups?: { id: string; label: string; collapsed?: boolean }[];
}

export const FILTER_PARAM_META: Record<string, FilterMeta> = {
  crt: { params: crt.params, groups: crt.groups },
  night_vision: { params: nightVision.params, groups: nightVision.groups },
  thermal: { params: thermal.params, groups: thermal.groups }
};

export function filterMeta(id: string): FilterMeta | null {
  return FILTER_PARAM_META[id] ?? null;
}
