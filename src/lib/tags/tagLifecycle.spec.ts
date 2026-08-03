// The provenance x operation matrix. Every origin, against every thing that removes tags.
//
// This suite exists because the fixture cannot defend this behaviour: `solar-system-derived.json`
// contains ZERO hand-added tags, so nothing in the baseline changes whether a manual tag survives a
// re-derive or is silently deleted — which is precisely how twenty-five sites came to delete them.
// The assertions below are the only thing standing between a GM's override and a future strip.
import { describe, it, expect } from 'vitest';
import type { Tag } from '../types';
import { tagOrigin, survivesRederive, isEngineOwned, stripForReprocess, stripRuleTags, emit, matchesTarget } from './tagLifecycle';

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

describe('matchesTarget', () => {
  it('treats a trailing slash as a namespace and anything else as an exact key', () => {
    expect(matchesTarget('geology/plate-tectonics', ['geology/'])).toBe(true);
    expect(matchesTarget('geology', ['geology/'])).toBe(false);
    expect(matchesTarget('orbit/retrograde', ['orbit/retrograde'])).toBe(true);
    expect(matchesTarget('orbit/retrograde-ish', ['orbit/retrograde'])).toBe(false);
  });
});
