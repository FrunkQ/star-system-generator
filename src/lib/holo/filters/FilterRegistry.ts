import * as THREE from 'three';
import type { FilterDefinition } from './schema';
import type { FilterParamValues } from './schema';

// Auto-discover all filter config modules using Vite's import.meta.glob.
// Each filter lives in definitions/<id>/config.ts and exports a FilterDefinition.
const configModules = import.meta.glob<{ default: FilterDefinition }>(
  './definitions/*/config.ts',
  { eager: true }
);

// Texture files declared by filters — loaded as URLs by Vite's asset pipeline.
const textureAssets = import.meta.glob<{ default: string }>(
  './definitions/*/*.{webp,png,jpg,jpeg}',
  { eager: true, query: '?url' }
);

class FilterRegistry {
  private filters = new Map<string, FilterDefinition>();
  private textureCache = new Map<string, THREE.Texture>();

  constructor() {
    for (const path of Object.keys(configModules)) {
      const mod = configModules[path];
      if (mod?.default) {
        this.filters.set(mod.default.id, mod.default);
      }
    }
  }

  getAll(): FilterDefinition[] {
    return [...this.filters.values()].sort((a, b) => {
      if (a.id === 'none') return -1;
      if (b.id === 'none') return  1;
      return a.name.localeCompare(b.name);
    });
  }

  get(id: string): FilterDefinition | undefined {
    return this.filters.get(id);
  }

  getOrFallback(id: string): FilterDefinition {
    return this.filters.get(id) ?? this.filters.get('none')!;
  }

  /**
   * Returns a defaults map for a filter's params.
   * Used when a config has no saved values for a filter yet.
   */
  defaultParams(id: string): FilterParamValues {
    const filter = this.filters.get(id);
    if (!filter) return {};
    const result: FilterParamValues = {};
    for (const param of filter.params) {
      result[param.id] = param.default as number | boolean | string;
    }
    return result;
  }

  /**
   * Resolves texture uniforms for a filter definition.
   * Caches loaded textures by URL to avoid duplicate GPU uploads.
   */
  resolveTextures(filterId: string): Record<string, THREE.Texture> {
    const filter = this.filters.get(filterId);
    if (!filter?.textures?.length) return {};

    const result: Record<string, THREE.Texture> = {};
    for (const decl of filter.textures) {
      // Build the glob key that matches the texture asset path
      const assetKey = Object.keys(textureAssets).find((k) =>
        k.includes(`/definitions/${filterId}/${decl.file}`)
      );
      if (!assetKey) {
        console.warn(`[FilterRegistry] Texture not found: ${filterId}/${decl.file}`);
        continue;
      }

      const url = textureAssets[assetKey]!.default;

      if (!this.textureCache.has(url)) {
        const tex = new THREE.TextureLoader().load(url);
        tex.wrapS = decl.wrapS === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
        tex.wrapT = decl.wrapT === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
        this.textureCache.set(url, tex);
      }

      result[decl.uniformName] = this.textureCache.get(url)!;
    }

    return result;
  }
}

// Singleton — imported wherever needed
export const filterRegistry = new FilterRegistry();
