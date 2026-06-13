import { describe, it, expect } from 'vitest';
import { sanitizeStarmapForRuntime } from './starmapSanitizer';
import type { Starmap } from '$lib/types';

// A negative/NaN semi-major axis (sign slip during a manual orbit edit — a user's Kerbol import
// had Laythe at a_AU = -0.0018) threw IndexSizeError in ctx.ellipse and froze the orrery. The
// sanitizer self-heals it on load by taking the magnitude.
function starmapWith(aAU: number): Starmap {
  return {
    systems: [
      {
        id: 'sys1',
        system: {
          nodes: [
            { id: 'star', kind: 'body', roleHint: 'star', name: 'Sun', parentId: null },
            {
              id: 'moon', kind: 'body', roleHint: 'moon', name: 'Laythe', parentId: 'star',
              orbit: { hostId: 'star', elements: { a_AU: aAU, e: 0.1, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
            }
          ]
        }
      }
    ]
  } as unknown as Starmap;
}

describe('starmap sanitizer — bad semi-major axis self-heal', () => {
  it('flips a negative a_AU to its magnitude', () => {
    const out = sanitizeStarmapForRuntime(starmapWith(-0.0018171382));
    const moon = out.systems[0].system.nodes.find((n: any) => n.id === 'moon') as any;
    expect(moon.orbit.elements.a_AU).toBeCloseTo(0.0018171382, 10);
  });

  it('zeroes a NaN a_AU instead of leaving it', () => {
    const out = sanitizeStarmapForRuntime(starmapWith(NaN));
    const moon = out.systems[0].system.nodes.find((n: any) => n.id === 'moon') as any;
    expect(moon.orbit.elements.a_AU).toBe(0);
  });

  it('leaves a valid a_AU untouched (same object reference)', () => {
    const input = starmapWith(0.5);
    const out = sanitizeStarmapForRuntime(input);
    expect(out).toBe(input); // no change → returns the original
  });
});
