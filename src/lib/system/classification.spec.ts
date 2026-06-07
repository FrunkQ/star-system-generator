import { describe, it, expect } from 'vitest';
import { classifyByFingerprint } from './classification';
import type { Fingerprint } from '$lib/types';

// Phase 04 — fingerprint classifier. Each type is parameter bands; best base wins, modifiers
// stack. Soft edges are RELATIVE to the boundary (so a tiny moon can't half-match a giant).
const FPS: Fingerprint[] = [
  { class: 'planet/terrestrial', kind: 'base', match: { radius_Re: [0.3, 1.8], density: [3, 8.5] } },
  { class: 'planet/earth-analogue', kind: 'base', match: { mass_Me: [0.8, 1.3], 'hydrosphere.coverage': [0.5, 0.85], 'atm.composition.O2': [0.1, 0.35], Teq_K: [255, 300] } },
  { class: 'planet/gas-giant', kind: 'base', match: { mass_Me: [50, 4000], radius_Re: [3.5, 25] } },
  { class: 'planet/ice-giant', kind: 'base', match: { mass_Me: [8, 50], radius_Re: [2.5, 6], Teq_K: [0, 200] } },
  { class: 'planet/ringed', kind: 'modifier', match: { has_ring_child: [1, 1] } }
];

describe('classifyByFingerprint', () => {
  it('classifies an Earth twin as the specific type, not the generic one', () => {
    const earth = { mass_Me: 1, radius_Re: 1, density: 5.5, 'hydrosphere.coverage': 0.7, 'atm.composition.O2': 0.21, Teq_K: 255 };
    expect(classifyByFingerprint(earth, FPS, 4)[0]).toBe('planet/earth-analogue');
  });

  it('more specific (more matched bands) outranks the generic base', () => {
    // A gas giant matches both gas-giant (2 bands) and nothing else here.
    const jup = { mass_Me: 318, radius_Re: 11, density: 1.3, has_ring_child: 1 };
    const cls = classifyByFingerprint(jup, FPS, 4);
    expect(cls[0]).toBe('planet/gas-giant');
    expect(cls).toContain('planet/ringed'); // modifier stacks
  });

  it('a tiny moon does NOT half-match a giant (relative soft edge)', () => {
    const moon = { mass_Me: 0.02, radius_Re: 0.27, density: 3.3, Teq_K: 90 };
    const cls = classifyByFingerprint(moon, FPS, 4);
    expect(cls).not.toContain('planet/gas-giant');
    expect(cls).not.toContain('planet/ice-giant');
  });

  it('falls back to terrestrial/gas-giant when nothing matches', () => {
    const odd = { mass_Me: 0.4, radius_Re: 2.5, density: 0.2 }; // matches no band well
    expect(classifyByFingerprint(odd, FPS, 4).length).toBeGreaterThan(0);
  });

  it('weak modifier slivers are not added', () => {
    const noRing = { mass_Me: 318, radius_Re: 11, has_ring_child: 0 };
    expect(classifyByFingerprint(noRing, FPS, 4)).not.toContain('planet/ringed');
  });
});
