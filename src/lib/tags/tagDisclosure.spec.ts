// THE DISCLOSURE LADDER (G54 phase 1) — hidden / anonymous / open, and what a player is told at each.
//
// The middle rung is the new one and it is the one with a real cost to getting wrong: `anonymous`
// promises that a tag's PRESENCE survives redaction while its IDENTITY does not. "Identity" is not
// only the key — it is the value, the label, the description, the category colour, the monogram, the
// hover text and anything else a surface derives from the tag. So the gates below do not check one
// field at a time; they populate EVERY field of a tag with a distinctive sentinel and then assert
// that no sentinel survives into anything a surface can render. That is the assertion that still
// holds when `Tag` grows a field nobody remembered to blank.
//
// It is computed at ONE point (engine-map TAG-9). A second site is how a leak happens.
import { describe, it, expect } from 'vitest';
import { redactTagsForPlayers, tagDisclosure, anonymousTag, ANONYMOUS_TAG_KEY } from './tagLifecycle';
import { markersFor, rollUpMarkers } from './mapHighlights';
import { describeTag, tagContextLabel, formatTagValue } from './tagPresentation';
import type { Tag } from '../types';

const cats = [
  { id: 'faction', shortName: 'Faction', longName: 'Faction', color: '#7d3fb0', appliesTo: ['planet'], enabled: true, tags: [], rules: [] },
  { id: 'plot', shortName: 'Plot', longName: 'Plot', color: '#666666', playerHidden: true, appliesTo: ['planet'], enabled: true, tags: [], rules: [] },
  { id: 'resource', shortName: 'Resource', longName: 'Resource', color: '#d4a843', appliesTo: ['planet'], enabled: true, tags: [], rules: [] }
] as any;
const keys = (t: Tag[]) => t.map((x) => x.key);

describe('the three rungs, one tag, no code fork per surface', () => {
  it('open (the default) leaves a tag exactly as it was', () => {
    const tags: Tag[] = [{ key: 'faction/red', value: 'ascendant' }];
    expect(redactTagsForPlayers(tags, cats)).toEqual(tags);
    expect(redactTagsForPlayers([{ key: 'faction/red', disclosure: 'open' }], cats))
      .toEqual([{ key: 'faction/red', disclosure: 'open' }]);
  });

  it('hidden strips it entirely — the player has no idea it exists', () => {
    expect(redactTagsForPlayers([{ key: 'faction/hidden-hand', disclosure: 'hidden' }], cats)).toEqual([]);
  });

  it('anonymous keeps the PRESENCE and destroys the IDENTITY', () => {
    const out = redactTagsForPlayers([{ key: 'faction/hidden-hand', disclosure: 'anonymous' }], cats);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(anonymousTag());
    expect(out[0].key).toBe(ANONYMOUS_TAG_KEY);
  });

  it('reads the ladder in one place, and the legacy spelling still means hidden', () => {
    expect(tagDisclosure({ key: 'a/b' } as Tag)).toBe('open');
    expect(tagDisclosure({ key: 'a/b', secret: true } as Tag)).toBe('hidden');
    expect(tagDisclosure({ key: 'a/b', disclosure: 'anonymous' } as Tag)).toBe('anonymous');
    // A campaign saved before G54 carries `secret: true` and must behave exactly as it did.
    expect(redactTagsForPlayers([{ key: 'faction/hidden-hand', secret: true }], cats)).toEqual([]);
  });

  it('lets an explicit rung win over the legacy flag rather than guessing', () => {
    // The editor never writes both, but an import or a hand-edited file can. One reader, one answer.
    expect(tagDisclosure({ key: 'a/b', secret: true, disclosure: 'anonymous' } as Tag)).toBe('anonymous');
  });
});

describe('what an anonymous tag can leak, which must be nothing', () => {
  // EVERY field of the tag carries a sentinel a grep can find. If a future `Tag` field is copied
  // through by accident, this fails without anyone having to remember to add an assertion.
  const LOADED: Tag = {
    key: 'faction/sentinelkey',
    value: 'sentinelvalue',
    ns: 'sentinelns',
    origin: 'manual',
    override: true,
    manual: true,
    coi: true,
    inherited: true,
    source: 'rule:sentinelsource',
    disclosure: 'anonymous'
  };
  const SENTINELS = ['sentinelkey', 'sentinelvalue', 'sentinelns', 'sentinelsource', 'faction'];
  const redacted = redactTagsForPlayers([LOADED], cats);

  it('carries no field of the original through the snapshot', () => {
    const json = JSON.stringify(redacted);
    for (const s of SENTINELS) expect(json).not.toContain(s);
  });

  it('renders no part of it through the presentation layer either', () => {
    const t = redacted[0];
    const p = describeTag(t.key);
    const rendered = [
      p.label, p.description, p.group, p.color,
      tagContextLabel(t.key, t.value),
      String(formatTagValue(t.key, t.value))
    ].join(' | ').toLowerCase();
    for (const s of SENTINELS) expect(rendered).not.toContain(s);
  });

  it('does not wear its old category colour', () => {
    // The subtlest leak of the set: a placeholder in Faction purple among neutral pills says which
    // category it came from without ever naming it.
    const factionColour = String((cats.find((c: any) => c.id === 'faction') as any).color).toLowerCase();
    const marker = markersFor(redacted, [{ ref: 'faction' }], cats)[0];
    expect(marker.color.toLowerCase()).not.toBe(factionColour);
    expect(marker.color).toBe(describeTag(ANONYMOUS_TAG_KEY).color);
  });

  it('shows a neutral marker with a question mark rather than initials of anything', () => {
    const marker = markersFor(redacted, [{ ref: 'faction' }], cats)[0];
    expect(marker.key).toBe(ANONYMOUS_TAG_KEY);
    expect(marker.monogram).toBe('?');
    expect(marker.label).toBe('Undisclosed');
  });
});

describe('the marker still appears, which is the whole point of the rung', () => {
  it('marks even when the selection names a category the placeholder is no longer in', () => {
    // `faction/hidden-hand` at rung anonymous reaches the player as `unknown/undisclosed`, which
    // matches no selection. A selection-only rule would delete exactly the presence it must keep.
    const forPlayers = redactTagsForPlayers([{ key: 'faction/hidden-hand', disclosure: 'anonymous' }], cats);
    expect(markersFor(forPlayers, [{ ref: 'faction' }], cats).map((m) => m.key)).toEqual([ANONYMOUS_TAG_KEY]);
  });

  it('marks even when the selection names something else entirely', () => {
    const forPlayers = redactTagsForPlayers([{ key: 'faction/hidden-hand', disclosure: 'anonymous' }], cats);
    expect(markersFor(forPlayers, [{ ref: 'resource/water-ice' }], cats).map((m) => m.key)).toEqual([ANONYMOUS_TAG_KEY]);
  });

  it('but does NOT put a badge on a map that is drawing none', () => {
    // The conservative half: an empty selection means the surface shows no badges at all, and this
    // must not be the one thing that puts one back.
    const forPlayers = redactTagsForPlayers([{ key: 'faction/hidden-hand', disclosure: 'anonymous' }], cats);
    expect(markersFor(forPlayers, [], cats)).toEqual([]);
  });

  it('rolls up to the system marker on the starmap like any other tag', () => {
    const bodies = [{ tags: redactTagsForPlayers([{ key: 'faction/hidden-hand', disclosure: 'anonymous' }], cats) }];
    expect(rollUpMarkers(bodies, [{ ref: 'faction' }], cats).map((m) => m.key)).toEqual([ANONYMOUS_TAG_KEY]);
  });

  it('takes the surface default style rather than inventing a shape', () => {
    // "It needs a neutral marker STYLE, not a new symbol system" — marker styles are shipped
    // vocabulary and the placeholder uses them unchanged.
    const forPlayers = redactTagsForPlayers([{ key: 'faction/x', disclosure: 'anonymous' }], cats);
    expect(markersFor(forPlayers, [{ ref: 'faction' }], cats, 'pin')[0].style).toBe('pin');
    expect(markersFor(forPlayers, [{ ref: 'faction' }], cats, 'flag')[0].style).toBe('flag');
  });
});

describe('a census is information too', () => {
  it('collapses several anonymous tags on one node into one placeholder', () => {
    const out = redactTagsForPlayers(
      [
        { key: 'faction/hidden-hand', disclosure: 'anonymous' },
        { key: 'resource/unobtainium', disclosure: 'anonymous' },
        { key: 'faction/red' }
      ],
      cats
    );
    expect(keys(out)).toEqual([ANONYMOUS_TAG_KEY, 'faction/red']);
  });

  it('and therefore shows one marker, not three', () => {
    const forPlayers = redactTagsForPlayers(
      [
        { key: 'faction/a', disclosure: 'anonymous' },
        { key: 'faction/b', disclosure: 'anonymous' },
        { key: 'faction/c', disclosure: 'anonymous' }
      ],
      cats
    );
    expect(markersFor(forPlayers, [{ ref: 'faction' }], cats)).toHaveLength(1);
  });
});

describe('the two mechanisms together', () => {
  it('a player-hidden category beats anonymous — no marker at all', () => {
    // The category flag is the GM saying the whole channel does not exist for players, which is a
    // stronger statement than any one tag's rung.
    const out = redactTagsForPlayers([{ key: 'plot/the-betrayal', disclosure: 'anonymous' }], cats);
    expect(out).toEqual([]);
    expect(markersFor(out, [{ ref: 'plot' }], cats)).toEqual([]);
  });

  it('leaves the GM side completely alone, which is why the two can differ', () => {
    const onBody: Tag[] = [
      { key: 'faction/hidden-hand', disclosure: 'anonymous' },
      { key: 'faction/plotted', disclosure: 'hidden' }
    ];
    const gm = markersFor(onBody, [{ ref: 'faction' }], cats);
    expect(gm.map((m) => m.key)).toEqual(['faction/hidden-hand', 'faction/plotted']);
    expect(gm.every((m) => m.key !== ANONYMOUS_TAG_KEY)).toBe(true);
  });

  it('keeps ordinary tags, and their values, untouched beside a placeholder', () => {
    const out = redactTagsForPlayers(
      [{ key: 'faction/secret-one', disclosure: 'anonymous' }, { key: 'resource/water-ice', value: '0.8' }],
      cats
    );
    expect(out[1]).toEqual({ key: 'resource/water-ice', value: '0.8' });
  });

  it('copes with no tags and no categories', () => {
    expect(redactTagsForPlayers(undefined, [])).toEqual([]);
    expect(redactTagsForPlayers([{ key: 'a/b', disclosure: 'anonymous' }], [])).toEqual([anonymousTag()]);
  });
});

describe('the placeholder key is reserved, and its presentation is registered like any other', () => {
  it('resolves to a neutral label, group and colour rather than a titlecased key', () => {
    const p = describeTag(ANONYMOUS_TAG_KEY);
    expect(p.label).toBe('Undisclosed');
    expect(p.group).toBe('Unknown');
    expect(p.description).toBeTruthy();
    // Not the unregistered-namespace fallback, which would be the tell that nobody registered it.
    expect(p.color).not.toBe('#888888');
  });

  it('says only that something is here, and names no category', () => {
    const p = describeTag(ANONYMOUS_TAG_KEY);
    const said = (p.label + ' ' + p.description).toLowerCase();
    for (const c of ['faction', 'resource', 'plot', 'construct', 'star', 'swarm']) expect(said).not.toContain(c);
  });
});
