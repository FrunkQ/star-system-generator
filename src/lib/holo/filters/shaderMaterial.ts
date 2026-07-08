import * as THREE from 'three';
import type { FilterDefinition } from './schema';
import type { FilterParamValues } from './schema';
import { filterRegistry } from './FilterRegistry';

/**
 * Builds the Three.js shader object expected by EffectComposer's ShaderPass:
 * { uniforms, vertexShader, fragmentShader }
 *
 * System uniforms (tDiffuse, time, resolution) are always included.
 * Filter params are mapped to u<PascalCase> uniforms automatically.
 */
export function buildShaderObject(
  filter: FilterDefinition,
  paramValues: FilterParamValues,
  resolution: THREE.Vector2
): {
  uniforms: Record<string, THREE.IUniform>;
  vertexShader: string;
  fragmentShader: string;
} {
  const uniforms: Record<string, THREE.IUniform> = {
    tDiffuse:   { value: null },           // Set by ShaderPass each frame
    time:       { value: 0 },
    resolution: { value: resolution },
  };

  // Map each param to a camelCase → uPascalCase uniform
  for (const param of filter.params) {
    const uniformName = paramToUniform(param.id);
    const value = paramValues[param.id] ?? param.default;
    if (param.type === 'color') {
      uniforms[uniformName] = { value: new THREE.Color(value as string) };
    } else {
      uniforms[uniformName] = { value: boolToFloat(param, value) };
    }
  }

  // Resolved texture uniforms from filter declaration
  const textures = filterRegistry.resolveTextures(filter.id);
  for (const [name, tex] of Object.entries(textures)) {
    uniforms[name] = { value: tex };
  }

  return {
    uniforms,
    vertexShader: filter.vertexShader,
    fragmentShader: filter.fragmentShader,
  };
}

/**
 * Updates just the param uniforms on an existing material's uniforms map.
 * Called on every param-value change to avoid rebuilding the full shader.
 */
export function updateUniforms(
  uniforms: Record<string, THREE.IUniform>,
  filter: FilterDefinition,
  paramValues: FilterParamValues
): void {
  for (const param of filter.params) {
    const uniformName = paramToUniform(param.id);
    const value = paramValues[param.id] ?? param.default;
    if (!uniforms[uniformName]) continue;
    if (param.type === 'color') {
      (uniforms[uniformName]!.value as THREE.Color).set(value as string);
    } else {
      uniforms[uniformName]!.value = boolToFloat(param, value);
    }
  }
}

/** camelCase param id → uPascalCase uniform name */
export function paramToUniform(id: string): string {
  return 'u' + id.charAt(0).toUpperCase() + id.slice(1);
}

/** Toggles are stored as boolean in state but GLSL needs float 0/1 */
function boolToFloat(
  param: FilterDefinition['params'][number],
  value: FilterParamValues[string]
): number | string | boolean {
  if (param.type === 'toggle') {
    return (value as boolean) ? 1.0 : 0.0;
  }
  return value as number | string;
}
