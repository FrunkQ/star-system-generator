import type { TransitionDefinition } from './schema';

// Auto-discover all transition modules using Vite's import.meta.glob.
// Each transition lives in definitions/<id>/index.ts and exports a default TransitionDefinition.
const modules = import.meta.glob<{ default: TransitionDefinition }>(
  './definitions/*/index.ts',
  { eager: true },
);

class TransitionRegistry {
  private transitions = new Map<string, TransitionDefinition>();

  constructor() {
    for (const mod of Object.values(modules)) {
      if (mod?.default) {
        this.transitions.set(mod.default.id, mod.default);
      }
    }
  }

  getAll(): TransitionDefinition[] {
    return [...this.transitions.values()].sort((a, b) => {
      if (a.id === 'none') return -1;
      if (b.id === 'none') return  1;
      return a.label.localeCompare(b.label);
    });
  }

  get(id: string): TransitionDefinition | undefined {
    return this.transitions.get(id);
  }

  getOrFallback(id: string): TransitionDefinition {
    return this.transitions.get(id) ?? this.transitions.get('none')!;
  }

  /** Returns the default param values for a transition. */
  defaultParams(id: string): Record<string, number | string> {
    const def = this.transitions.get(id);
    if (!def) return {};
    const result: Record<string, number | string> = {};
    for (const p of def.params) {
      result[p.id] = p.default;
    }
    return result;
  }
}

/** Singleton — imported wherever needed. */
export const transitionRegistry = new TransitionRegistry();
