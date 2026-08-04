// The provenance x operation matrix. Every origin, against every thing that removes tags.
//
// This suite exists because the fixture cannot defend this behaviour: `solar-system-derived.json`
// contains ZERO hand-added tags, so nothing in the baseline changes whether a manual tag survives a
// re-derive or is silently deleted — which is precisely how twenty-five sites came to delete them.
// The assertions below are the only thing standing between a GM's override and a future strip.
import { describe, it, expect } from 'vitest';
import type { Tag } from '../types';
import { tagOrigin, survivesRederive, isEngineOwned, stripForReprocess, stripRuleTags, emit, matchesTarget, canonicalTagKey, tagSlugSegment, canonicaliseTags, namespaceProvenance, registerCategoryProvenance } from './tagLifecycle';

const t = (key: string, extra: Partial<Tag> = {}): Tag => ({ key, ...extra });

describe('tagOrigin — inference from the flags actually written today', () => {
  it('reads an explicit origin over any inference', () => {
    expect(tagOrigin({ key: 'geology/plate-tectonics', origin: 'manual' })).toBe('manual');
    expect(tagOrigin({ key: 'faction/red', origin: 'physics' })).toBe('physics');
  });

  it('infers manual from the manual flag, whatever the namespace', () => {
    // The override case: a physics-namespace key the GM added by hand.
    expect(tagOrigin(t('geology/plate-tectonics', { manual: true }))).toBe('manual');
  });

  it('infers rule from a rule: source', () => {
    expect(tagOrigin(t('resource/helium-3', { source: 'rule:he3-old-regolith' }))).toBe('rule');
  });

  it('infers inherited and runtime-derived construct tags', () => {
    expect(tagOrigin(t('drive/jump-drive', { inherited: true, coi: true }))).toBe('inherited');
    expect(tagOrigin({ key: 'status/in-transit-system', coi: true, derived: true } as Tag)).toBe('derived');
  });

  it('treats a hand-chosen CoI tag as manual', () => {
    expect(tagOrigin(t('purpose/mining', { coi: true }))).toBe('manual');
  });

  it('classifies generation provenance as authored, not physics', () => {
    // B10 / C3c: an inferred spin value must stay distinguishable from a measured one. These survive
    // today only because no strip site names them; naming the class is what stops that being luck.
    expect(tagOrigin(t('spin/axis-inferred'))).toBe('authored');
    expect(tagOrigin(t('spin/period-inferred'))).toBe('authored');
    expect(tagOrigin(t('spin/tipped'))).toBe('authored');
    expect(tagOrigin(t('origin/migrated'))).toBe('authored');
    expect(tagOrigin(t('origin/captured'))).toBe('authored');
    expect(tagOrigin(t('orbit/retrograde'))).toBe('authored');
    expect(tagOrigin(t('orbit/double'))).toBe('authored');
    expect(tagOrigin(t('traveller/satellite-main-world'))).toBe('authored');
  });

  it('does NOT treat re-derived orbit keys as authored', () => {
    // `orbit/` is a mixed namespace and this is the reason it is matched key-by-key.
    expect(tagOrigin(t('orbit/tidally-locked'))).toBe('physics');
    expect(tagOrigin(t('orbit/spin-orbit-resonance'))).toBe('physics');
    expect(tagOrigin(t('orbit/locked-star'))).toBe('physics');
  });

  it('defaults to physics for an engine namespace', () => {
    expect(tagOrigin(t('geology/plate-tectonics'))).toBe('physics');
    expect(tagOrigin(t('hazard/radiation', { value: 'hours' }))).toBe('physics');
  });
});

describe('survivesRederive — the single rule', () => {
  const cases: [string, Tag, boolean][] = [
    ['physics', t('geology/plate-tectonics'), false],
    ['rule', t('resource/water-ice', { source: 'rule:ice' }), false],
    ['authored', t('spin/axis-inferred'), true],
    ['manual', t('faction/red-syndicate', { manual: true }), true],
    ['manual override', t('tidal/volcanism', { manual: true }), true],
    ['inherited', t('drive/warp', { inherited: true }), true],
    ['derived', { key: 'status/adrift', derived: true } as Tag, true]
  ];
  for (const [name, tag, expected] of cases) {
    it(`${name} ${expected ? 'survives' : 'is cleared'}`, () => {
      expect(survivesRederive(tag)).toBe(expected);
      expect(isEngineOwned(tag)).toBe(!expected);
    });
  }
});

describe('stripForReprocess', () => {
  it('clears engine tags in the target namespace and nothing else', () => {
    const tags = [t('geology/plate-tectonics'), t('geology/inactive'), t('tidal/volcanism'), t('spin/axis-inferred')];
    expect(stripForReprocess(tags, ['geology/']).map((x) => x.key)).toEqual([
      'tidal/volcanism',
      'spin/axis-inferred'
    ]);
  });

  it('SPARES a hand-added tag inside the target namespace — the whole point', () => {
    const tags = [t('geology/plate-tectonics'), t('geology/cryovolcanism', { manual: true })];
    const kept = stripForReprocess(tags, ['geology/']);
    expect(kept.map((x) => x.key)).toEqual(['geology/cryovolcanism']);
  });

  it('spares generation provenance even when its namespace is targeted', () => {
    const tags = [t('spin/axis-inferred'), t('spin/period-inferred')];
    expect(stripForReprocess(tags, ['spin/'])).toHaveLength(2);
  });

  it('matches exact keys as well as namespaces', () => {
    const tags = [t('thermal/self-luminous'), t('thermal/other')];
    expect(stripForReprocess(tags, ['thermal/self-luminous']).map((x) => x.key)).toEqual(['thermal/other']);
  });

  it('tolerates an undefined tag list', () => {
    expect(stripForReprocess(undefined, ['geology/'])).toEqual([]);
  });

  it('is idempotent — stripping twice equals stripping once', () => {
    const tags = [t('geology/a'), t('geology/b', { manual: true })];
    const once = stripForReprocess(tags, ['geology/']);
    expect(stripForReprocess(once, ['geology/'])).toEqual(once);
  });
});

describe('stripRuleTags', () => {
  it('clears rule-emitted tags in the category and spares hand-added ones', () => {
    const tags = [
      t('resource/helium-3', { source: 'rule:he3' }),
      t('resource/spice', { manual: true }),
      t('science/biosignatures', { source: 'rule:bio' })
    ];
    expect(stripRuleTags(tags, ['resource/']).map((x) => x.key)).toEqual(['resource/spice', 'science/biosignatures']);
  });

  it('does not delete a PHYSICS tag that happens to sit in a rule category', () => {
    const tags = [t('frontier/refuelling')];
    expect(stripRuleTags(tags, ['frontier/'])).toHaveLength(1);
  });
});

describe('emit — the guard that stops an override being duplicated', () => {
  it('pushes when the key is absent', () => {
    const tags: Tag[] = [];
    emit(tags, t('hazard/radiation', { value: 'hours' }));
    expect(tags).toHaveLength(1);
  });

  it('does not push when a manual tag already claims the key', () => {
    // A GM override SUPPRESSES the derived emission rather than sitting beside it. Same answer B28
    // and B31 reached by hand.
    const tags = [t('hazard/radiation', { value: 'background', manual: true })];
    emit(tags, t('hazard/radiation', { value: 'lethal' }));
    expect(tags).toHaveLength(1);
    expect(tags[0].value).toBe('background');
  });

  it('a strip-then-emit round trip leaves exactly one tag, with the GM winning', () => {
    let tags = [t('hazard/radiation', { value: 'background', manual: true })];
    for (let pass = 0; pass < 3; pass++) {
      tags = stripForReprocess(tags, ['hazard/radiation']);
      emit(tags, t('hazard/radiation', { value: 'lethal' }));
    }
    expect(tags).toHaveLength(1);
    expect(tags[0].value).toBe('background');
  });

  it('a strip-then-emit round trip re-creates a purely derived tag unchanged', () => {
    let tags = [t('hazard/radiation', { value: 'lethal' })];
    for (let pass = 0; pass < 3; pass++) {
      tags = stripForReprocess(tags, ['hazard/radiation']);
      emit(tags, t('hazard/radiation', { value: 'lethal' }));
    }
    expect(tags).toHaveLength(1);
    expect(tags[0].value).toBe('lethal');
  });
});

describe('provenance comes from the category, the tag carries only a flag', () => {
  it('answers per namespace without anything being registered first', () => {
    // Seeded at load from ENGINE_NAMESPACES. If this needs a store import to pass, the registration
    // is lazy again and every generated tag silently reads as physics.
    expect(namespaceProvenance('spin/axis-inferred')).toBe('authored');
    expect(namespaceProvenance('geology/plate-tectonics')).toBe('physics');
  });

  it('lets an exact key override its namespace, which orbit/ needs', () => {
    expect(namespaceProvenance('orbit/retrograde')).toBe('authored');   // the generator's claim
    expect(namespaceProvenance('orbit/tidally-locked')).toBe('physics'); // re-derived every pass
  });

  it('takes a user category\'s declared provenance', () => {
    registerCategoryProvenance([{ id: 'lore', provenance: 'authored' }]);
    expect(namespaceProvenance('lore/the-lost-fleet')).toBe('authored');
    expect(tagOrigin(t('lore/the-lost-fleet'))).toBe('authored');
    registerCategoryProvenance([]);   // re-seeds the engine namespaces
    expect(namespaceProvenance('spin/tipped')).toBe('authored');
  });

  it('keeps the engine namespaces when user categories are re-registered', () => {
    registerCategoryProvenance([{ id: 'faction', provenance: 'manual' }]);
    expect(namespaceProvenance('geology/x')).toBe('physics');
  });

  it('lets the TAG\'s own flag win over its category', () => {
    // The division of labour: the flag says a human put it there, the category says what the
    // namespace is otherwise.
    expect(tagOrigin(t('geology/plate-tectonics', { manual: true }))).toBe('manual');
    expect(tagOrigin(t('geology/plate-tectonics'))).toBe('physics');
  });
});

describe('tag keys are case-insensitive', () => {
  it('folds case and spaces to one spelling', () => {
    expect(canonicalTagKey('Smugglers')).toBe('smugglers');
    expect(canonicalTagKey('SMUGGLERS')).toBe('smugglers');
    expect(canonicalTagKey('  Red Syndicate  ')).toBe('red-syndicate');
    expect(canonicalTagKey('Faction/Red Syndicate')).toBe('faction/red-syndicate');
  });

  it('keeps slashes in a whole key but collapses them in a segment', () => {
    expect(canonicalTagKey('faction/red')).toBe('faction/red');
    expect(tagSlugSegment('Search/Rescue')).toBe('search-rescue');
  });

  it('drops punctuation that cannot appear in a key', () => {
    expect(canonicalTagKey("O'Brien's Rest!")).toBe('obriens-rest');
    expect(canonicalTagKey('!!!')).toBe('');
  });

  it('matches targets regardless of the case a tag was written in', () => {
    expect(matchesTarget('Geology/Plate-Tectonics', ['geology/'])).toBe(true);
    expect(matchesTarget('HAZARD/RADIATION', ['hazard/radiation'])).toBe(true);
  });

  it('does not let a namespace target match a longer namespace', () => {
    expect(matchesTarget('surfacewater/x', ['surface/'])).toBe(false);
  });

  it('collapses tags that differ only in case, and the GM wins', () => {
    const folded = canonicaliseTags([
      t('hazard/radiation', { value: 'lethal' }),
      t('Hazard/Radiation', { value: 'background', manual: true })
    ]);
    expect(folded).toHaveLength(1);
    expect(folded[0].key).toBe('hazard/radiation');
    expect(folded[0].value).toBe('background');
  });

  it('emit() will not add a tag that already exists in another case', () => {
    const tags = [t('Smugglers', { manual: true })];
    emit(tags, t('smugglers'));
    expect(tags).toHaveLength(1);
  });
});

describe('matchesTarget', () => {
  it('treats a trailing slash as a namespace and anything else as an exact key', () => {
    expect(matchesTarget('geology/plate-tectonics', ['geology/'])).toBe(true);
    expect(matchesTarget('geology', ['geology/'])).toBe(false);
    expect(matchesTarget('orbit/retrograde', ['orbit/retrograde'])).toBe(true);
    expect(matchesTarget('orbit/retrograde-ish', ['orbit/retrograde'])).toBe(false);
  });
});
