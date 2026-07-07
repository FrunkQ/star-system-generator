import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { starmapStore } from '$lib/starmapStore';
import { systemStore } from '$lib/stores';
import { customTagVocabulary } from './customTags';

// The current-open-system store also feeds the vocabulary; keep it out of these starmap-only cases.
beforeEach(() => systemStore.set(null));

const sys = (id: string, tagsA: any[], tagsB: any[] = []) => ({
  id, name: id, system: { id, name: id, nodes: [
    { id: id + '-a', kind: 'body', tags: tagsA },
    { id: id + '-b', kind: 'construct', tags: tagsB }
  ] }
});

describe('customTagVocabulary — starmap-wide manual-tag vocabulary', () => {
  it('aggregates manual tags across ALL systems, excludes derived/PoI tags, counts + sorts', () => {
    starmapStore.set({
      name: 'Map',
      systems: [
        sys('A', [{ key: 'faction/red-syndicate', manual: true }, { key: 'geology/plate-tectonics' /* derived, no manual */ }]),
        sys('B', [{ key: 'faction/red-syndicate', manual: true }, { key: 'plot/the-lost-fleet', manual: true }],
                 [{ key: 'status/damaged', manual: true, coi: true }])
      ]
    } as any);

    const vocab = get(customTagVocabulary);
    const keys = vocab.map((e) => e.key);
    // Custom tags from BOTH systems are present (cross-system sharing).
    expect(keys).toContain('faction/red-syndicate');
    expect(keys).toContain('plot/the-lost-fleet');
    expect(keys).toContain('status/damaged'); // construct manual tag included too
    // Derived (non-manual) tags are NOT in the vocabulary.
    expect(keys).not.toContain('geology/plate-tectonics');
    // Counts reflect usage; the twice-used tag sorts first.
    expect(vocab[0].key).toBe('faction/red-syndicate');
    expect(vocab.find((e) => e.key === 'faction/red-syndicate')!.count).toBe(2);
  });

  it('is empty with no starmap', () => {
    starmapStore.set(null);
    expect(get(customTagVocabulary)).toEqual([]);
  });
});
