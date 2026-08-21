// What a player must never receive.
//
// A secret tag is the one piece of tag data with a real cost to getting wrong: the GM's hidden
// faction, the plot hook they have not sprung yet. It is redacted at ONE point — the player snapshot
// every player surface reads — because a second redaction site is how a leak happens: one surface
// gets the fix, another does not, and nothing reports the difference.
import { describe, it, expect } from 'vitest';
import { redactTagsForPlayers } from './tagLifecycle';
import { markersFor } from './mapHighlights';
import type { Tag } from '../types';

const cats = [
  { id: 'faction', playerHidden: false },
  { id: 'plot', playerHidden: true },
  { id: 'resource' }
];
const keys = (t: Tag[]) => t.map((x) => x.key);

describe('redacting tags for players', () => {
  it('drops a tag marked secret', () => {
    const out = redactTagsForPlayers(
      [{ key: 'faction/red' }, { key: 'faction/hidden-hand', secret: true }],
      cats
    );
    expect(keys(out)).toEqual(['faction/red']);
  });

  it('drops every tag of a player-hidden category', () => {
    const out = redactTagsForPlayers(
      [{ key: 'plot/the-lost-fleet' }, { key: 'plot/betrayal' }, { key: 'resource/water-ice' }],
      cats
    );
    expect(keys(out)).toEqual(['resource/water-ice']);
  });

  it('leaves ordinary tags completely alone', () => {
    const tags: Tag[] = [{ key: 'resource/water-ice', value: '0.8' }, { key: 'geology/plate-tectonics' }];
    expect(redactTagsForPlayers(tags, cats)).toEqual(tags);
  });

  it('redacts regardless of the case a key was written in', () => {
    expect(redactTagsForPlayers([{ key: 'Plot/Betrayal' }], cats)).toEqual([]);
  });

  it('hides a secret tag even when its category is visible', () => {
    // The two mechanisms are independent: per-tag for one secret among many, per-category for a
    // whole channel of GM-only information.
    expect(redactTagsForPlayers([{ key: 'resource/unobtainium', secret: true }], cats)).toEqual([]);
  });

  it('copes with no tags and no categories', () => {
    expect(redactTagsForPlayers(undefined, [])).toEqual([]);
    expect(redactTagsForPlayers([{ key: 'a/b' }], [])).toHaveLength(1);
  });
});

describe('a secret tag cannot become a player-facing map badge', () => {
  // The safety argument for map highlights, stated as a test rather than left as reasoning.
  //
  // Highlighting is a SELECTION — it names a category or a key, never a body — and the marker builder
  // is given whatever tags the surface already holds. A player surface holds the redacted snapshot.
  // So "highlight the whole Faction category" is safe to leave switched on: the secret faction was
  // removed before any marker existed, and the marker builder never had to know who was watching.
  const cats = [
    { id: 'faction', shortName: 'Faction', longName: 'Faction', color: '#333', appliesTo: ['planet'], enabled: true, tags: [], rules: [] },
    { id: 'plot', shortName: 'Plot', longName: 'Plot', color: '#666', playerHidden: true, appliesTo: ['planet'], enabled: true, tags: [], rules: [] }
  ] as any;

  it('drops it before markers are built, even when its category is highlighted', () => {
    const onBody: Tag[] = [{ key: 'faction/open-guild' }, { key: 'faction/hidden-hand', secret: true }];
    const forPlayers = redactTagsForPlayers(onBody, cats);
    const markers = markersFor(forPlayers, [{ ref: 'faction' }], cats);
    expect(markers.map((m) => m.key)).toEqual(['faction/open-guild']);
  });

  it('drops a whole player-hidden category the same way', () => {
    const forPlayers = redactTagsForPlayers([{ key: 'plot/the-betrayal' }], cats);
    expect(markersFor(forPlayers, [{ ref: 'plot' }], cats)).toEqual([]);
  });

  it('still badges it on the GM side, which is the point of keeping the two apart', () => {
    const onBody: Tag[] = [{ key: 'faction/hidden-hand', secret: true }];
    expect(markersFor(onBody, [{ ref: 'faction' }], cats)).toHaveLength(1);
  });
});
