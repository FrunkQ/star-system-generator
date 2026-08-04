// What shows on a map, and in whose colour.
import { describe, it, expect } from 'vitest';
import { markersFor, rollUpMarkers, capMarkers, monogramOf, MARKER_CAP } from './mapHighlights';
import type { TagCategory } from './tagCategories';

const cats = [
  {
    id: 'faction', shortName: 'Faction', longName: 'Faction', color: '#333333', textColor: '#ffffff',
    appliesTo: ['planet'], enabled: true, rules: [],
    tags: [
      { key: 'faction/red-syndicate', label: 'Red Syndicate', color: '#ff0000' },
      { key: 'faction/blue-star', label: 'Blue Star', color: '#0000ff' },
      { key: 'faction/plain', label: 'Plain' }
    ]
  },
  {
    id: 'frontier', shortName: 'Frontier', longName: 'Frontier', color: '#6fae8f',
    appliesTo: ['planet'], enabled: true, rules: [],
    tags: [{ key: 'frontier/refuelling', label: 'Refuelling' }]
  }
] as unknown as TagCategory[];

const keys = (m: { key: string }[]) => m.map((x) => x.key);

describe('markersFor', () => {
  it('shows nothing when nothing is selected', () => {
    expect(markersFor([{ key: 'faction/red-syndicate' }], [], cats)).toEqual([]);
  });

  it('a CATEGORY selection lights up every tag in it', () => {
    const m = markersFor(
      [{ key: 'faction/red-syndicate' }, { key: 'faction/blue-star' }, { key: 'resource/water-ice' }],
      [{ ref: 'faction' }], cats
    );
    expect(keys(m)).toEqual(['faction/blue-star', 'faction/red-syndicate']);
  });

  it('a SPECIFIC TAG selection lights up only its bearers', () => {
    const m = markersFor(
      [{ key: 'frontier/refuelling' }, { key: 'frontier/waystation' }],
      [{ ref: 'frontier/refuelling' }], cats
    );
    expect(keys(m)).toEqual(['frontier/refuelling']);
  });

  it('each tag keeps its OWN colour — the point of the whole mechanism', () => {
    const m = markersFor(
      [{ key: 'faction/red-syndicate' }, { key: 'faction/blue-star' }, { key: 'faction/plain' }],
      [{ ref: 'faction' }], cats
    );
    expect(m.find((x) => x.key === 'faction/red-syndicate')!.color).toBe('#ff0000');
    expect(m.find((x) => x.key === 'faction/blue-star')!.color).toBe('#0000ff');
    // no override → the category's colour
    expect(m.find((x) => x.key === 'faction/plain')!.color).toBe('#333333');
  });

  it('a category and a specific tag can be selected together', () => {
    const m = markersFor(
      [{ key: 'faction/red-syndicate' }, { key: 'frontier/refuelling' }],
      [{ ref: 'faction' }, { ref: 'frontier/refuelling' }], cats
    );
    expect(keys(m)).toEqual(['faction/red-syndicate', 'frontier/refuelling']);
  });

  it('naming a tag outright beats naming its category, for style', () => {
    const m = markersFor(
      [{ key: 'faction/red-syndicate' }],
      [{ ref: 'faction', style: 'ring' }, { ref: 'faction/red-syndicate', style: 'pin' }], cats
    );
    expect(m[0].style).toBe('pin');
  });

  it('falls back to the surface default style', () => {
    expect(markersFor([{ key: 'faction/plain' }], [{ ref: 'faction' }], cats, 'flag')[0].style).toBe('flag');
  });

  it('matches regardless of the case a tag was written in', () => {
    expect(keys(markersFor([{ key: 'Faction/Red-Syndicate' }], [{ ref: 'faction' }], cats))).toEqual(['faction/red-syndicate']);
  });

  it('orders by category then key, so badges do not reshuffle', () => {
    const m = markersFor(
      [{ key: 'frontier/refuelling' }, { key: 'faction/red-syndicate' }],
      [{ ref: 'faction' }, { ref: 'frontier' }], cats
    );
    expect(keys(m)).toEqual(['faction/red-syndicate', 'frontier/refuelling']);
  });

  it('never shows one key twice', () => {
    const m = markersFor([{ key: 'faction/plain' }, { key: 'faction/plain' }], [{ ref: 'faction' }], cats);
    expect(m).toHaveLength(1);
  });
});

describe('rollUpMarkers — what a system shows on the starmap', () => {
  it('unions across every body, not just the star', () => {
    // The interesting cases are never on the star: a faction holding one moon, a refuelling stop at
    // a gas giant.
    const bodies = [
      { tags: [{ key: 'star/whatever' }] },
      { tags: [{ key: 'faction/red-syndicate' }] },
      { tags: [{ key: 'frontier/refuelling' }] }
    ];
    const m = rollUpMarkers(bodies, [{ ref: 'faction' }, { ref: 'frontier' }], cats);
    expect(keys(m)).toEqual(['faction/red-syndicate', 'frontier/refuelling']);
  });

  it('shows several factions in one system rather than picking one', () => {
    const bodies = [{ tags: [{ key: 'faction/red-syndicate' }] }, { tags: [{ key: 'faction/blue-star' }] }];
    expect(rollUpMarkers(bodies, [{ ref: 'faction' }], cats)).toHaveLength(2);
  });

  it('collapses the same tag carried by several bodies', () => {
    const bodies = [{ tags: [{ key: 'faction/plain' }] }, { tags: [{ key: 'faction/plain' }] }];
    expect(rollUpMarkers(bodies, [{ ref: 'faction' }], cats)).toHaveLength(1);
  });

  it('shows nothing when nothing is selected', () => {
    expect(rollUpMarkers([{ tags: [{ key: 'faction/plain' }] }], [], cats)).toEqual([]);
  });
});

describe('capMarkers', () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `k${i}` })) as any;

  it('passes a short list through untouched', () => {
    expect(capMarkers(mk(3)).overflow).toBe(0);
  });

  it('caps and reports the remainder', () => {
    const { shown, overflow } = capMarkers(mk(MARKER_CAP + 3));
    expect(shown).toHaveLength(MARKER_CAP);
    expect(overflow).toBe(3);
  });
});

describe('monogramOf — text that survives a colour-blind table or a CRT filter', () => {
  it('takes initials from two words', () => expect(monogramOf('Red Syndicate')).toBe('RS'));
  it('takes two letters from one word', () => expect(monogramOf('Refuelling')).toBe('RE'));
  it('treats a hyphen as a word break', () => expect(monogramOf('blue-star')).toBe('BS'));
  it('never returns empty', () => expect(monogramOf('  ')).toBe('?'));
});
