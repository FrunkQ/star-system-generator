import { describe, it, expect } from 'vitest';
import { transitionRegistry } from './TransitionRegistry';

// The registry auto-discovers definitions via import.meta.glob (Vite). These assert the ported set
// loads and behaves — ids present, 'none' sorted first, and default params resolve.
describe('transitionRegistry', () => {
  it('discovers the ported transition definitions', () => {
    const ids = transitionRegistry.getAll().map((d) => d.id);
    expect(ids).toContain('none');
    expect(ids).toContain('fade');
    expect(ids).toContain('crt_collapse');
    expect(ids).toContain('wipe');
    expect(ids).toContain('static_dissolve');
    expect(ids[0]).toBe('none'); // 'none' always sorts first
  });

  it('resolves default params for a transition', () => {
    const p = transitionRegistry.defaultParams('fade');
    expect(p.duration).toBeTypeOf('number');
    expect(transitionRegistry.defaultParams('none')).toEqual({});
  });

  it('falls back to none for an unknown id', () => {
    expect(transitionRegistry.getOrFallback('does-not-exist').id).toBe('none');
  });
});
