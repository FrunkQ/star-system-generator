import { describe, it, expect } from 'vitest';
import { BROADCAST_WORDS, mintBroadcastId, slugifyStarmapName, isValidBroadcastId } from './broadcastId';

describe('broadcastId', () => {
  it('word pool is deduplicated, charset-clean and big enough for the entropy claim', () => {
    expect(new Set(BROADCAST_WORDS).size).toBe(BROADCAST_WORDS.length);
    for (const w of BROADCAST_WORDS) expect(w).toMatch(/^[a-z]{2,12}$/);
    // 2 distinct words + 3 digits must clear ~2^27 (~134M) combinations:
    // pairs = N*(N-1), suffix = 1000.
    const combos = BROADCAST_WORDS.length * (BROADCAST_WORDS.length - 1) * 1000;
    expect(combos).toBeGreaterThan(134_000_000);
  });

  it('mints name-slug + two distinct words + three digits', () => {
    for (let k = 0; k < 200; k++) {
      const id = mintBroadcastId('My Tuesday Game');
      const m = id.match(/^my_tuesday_game-([a-z]+)-([a-z]+)-(\d{3})$/);
      expect(m, id).toBeTruthy();
      expect(m![1]).not.toBe(m![2]);
      expect(BROADCAST_WORDS).toContain(m![1]);
      expect(BROADCAST_WORDS).toContain(m![2]);
      expect(isValidBroadcastId(id)).toBe(true);
    }
  });

  it('omits the prefix when the name slugs to nothing', () => {
    for (const name of ['', '   ', '星図', '!!!', undefined, null] as const) {
      const id = mintBroadcastId(name as string | null | undefined);
      expect(id).toMatch(/^[a-z]+-[a-z]+-\d{3}$/);
    }
  });

  it('slugs stay inside the PeerJS charset and the length cap', () => {
    expect(slugifyStarmapName('My Tuesday Game')).toBe('my_tuesday_game');
    expect(slugifyStarmapName("The GM's — Big! Campaign #2")).toBe('the_gms_big_campaign_2');
    expect(slugifyStarmapName('A'.repeat(60))).toHaveLength(24);
    expect(slugifyStarmapName('--__weird__--')).toBe('weird');
    for (const name of ['Café Nébula', 'spaced   out   far   beyond   the   cap   here']) {
      const s = slugifyStarmapName(name);
      expect(s.length).toBeLessThanOrEqual(24);
      if (s) expect(s).toMatch(/^[a-z0-9_-]+$/);
    }
  });

  it('two mints practically never collide', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 500; k++) seen.add(mintBroadcastId('x'));
    expect(seen.size).toBeGreaterThan(495);
  });
});
