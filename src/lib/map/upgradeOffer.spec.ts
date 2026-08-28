import { describe, it, expect, beforeEach } from 'vitest';
import { shouldOfferUpgrade, dismissUpgrade, isUpgradeDismissed, recordUpgradeAnswer } from './upgradeOffer';
import { matchBundledMap, looksLikeEdition1, EDITION_1_SYSTEM_IDS, type BaseMapManifest } from './baseMapManifest';
import { CURRENT_BASE_MAP_VERSION } from './provenance';
import type { Starmap } from '$lib/types';

const MANIFEST: BaseMapManifest = {
  baseMapVersion: 2,
  maps: [
    { id: 'starmap-local-neighbourhood', file: 'LN.json', name: 'Local Neighbourhood', systemIds: EDITION_1_SYSTEM_IDS.slice(0, 10) },
    { id: 'starmap-local-neighbourhood-scifi', file: 'LN-SF.json', name: 'Local Neighbourhood (SF)', systemIds: EDITION_1_SYSTEM_IDS.slice(0, 10) }
  ]
};

function campaign(ids: string[], over: Partial<Starmap> = {}): Starmap {
  return {
    id: 'c1', name: 'C', distanceUnit: 'ly', unitIsPrefix: false, routes: [],
    systems: ids.map((id) => ({ id, name: id, position: { x: 0, y: 0 }, system: { id, nodes: [] } as any })),
    ...over
  } as Starmap;
}

beforeEach(() => localStorage.clear());

describe('upgrade offer — when to offer', () => {
  it('offers for an UNSTAMPED campaign built on the old bundled map', async () => {
    const r = await shouldOfferUpgrade(campaign(EDITION_1_SYSTEM_IDS.slice(0, 6)), MANIFEST);
    expect(r.offer).toBe(true);
    expect(r.fromEdition).toBe(1);
    expect(r.base?.file).toBe('LN.json');
  });

  it('offers for a campaign stamped with an OLDER edition', async () => {
    const r = await shouldOfferUpgrade(campaign(EDITION_1_SYSTEM_IDS.slice(0, 6), { baseMapVersion: 1 }), MANIFEST);
    expect(r.offer).toBe(true);
    expect(r.fromEdition).toBe(1);
  });

  it('does NOT offer for a campaign already on the current edition', async () => {
    const r = await shouldOfferUpgrade(campaign(EDITION_1_SYSTEM_IDS.slice(0, 6), { baseMapVersion: CURRENT_BASE_MAP_VERSION }), MANIFEST);
    expect(r.offer).toBe(false);
  });

  it('does NOT offer a DOWNGRADE to a campaign from a future edition', async () => {
    const r = await shouldOfferUpgrade(campaign(EDITION_1_SYSTEM_IDS.slice(0, 6), { baseMapVersion: CURRENT_BASE_MAP_VERSION + 5 }), MANIFEST);
    expect(r.offer).toBe(false);
  });

  it('does NOT offer for a campaign the GM built from scratch', async () => {
    const r = await shouldOfferUpgrade(campaign(['mine-a', 'mine-b', 'mine-c', 'mine-d']), MANIFEST);
    expect(r.offer).toBe(false);
    expect(r.reason).toContain('no bundled base map recognised');
  });

  it('does NOT offer on a single coincidental shared id', async () => {
    const r = await shouldOfferUpgrade(campaign(['sys-sol', 'mine-a', 'mine-b']), MANIFEST);
    expect(r.offer).toBe(false);
  });

  it('does NOT offer when the manifest is unavailable', async () => {
    const r = await shouldOfferUpgrade(campaign(EDITION_1_SYSTEM_IDS.slice(0, 6)), null);
    expect(r.offer).toBe(false);
    expect(r.reason).toContain('manifest unavailable');
  });

  it('does NOT offer for an empty or missing campaign', async () => {
    expect((await shouldOfferUpgrade(null, MANIFEST)).offer).toBe(false);
    expect((await shouldOfferUpgrade(campaign([]), MANIFEST)).offer).toBe(false);
  });
});

describe('upgrade offer — "do not ask again"', () => {
  it('suppresses the offer for that campaign only', async () => {
    const c = campaign(EDITION_1_SYSTEM_IDS.slice(0, 6));
    dismissUpgrade(c.id);
    expect(isUpgradeDismissed(c.id)).toBe(true);
    expect((await shouldOfferUpgrade(c, MANIFEST)).offer).toBe(false);
    const other = campaign(EDITION_1_SYSTEM_IDS.slice(0, 6), { id: 'c2' });
    expect((await shouldOfferUpgrade(other, MANIFEST)).offer).toBe(true);
  });

  it('is idempotent', () => {
    dismissUpgrade('x'); dismissUpgrade('x');
    expect(JSON.parse(localStorage.getItem('sse2.baseMapUpgrade.dismissed')!)).toEqual(['x']);
  });
});

describe('bundled-map matching', () => {
  it('picks the entry with the most shared ids, and is stable on a tie', () => {
    const m = matchBundledMap(campaign(EDITION_1_SYSTEM_IDS.slice(0, 5)), MANIFEST);
    expect(m?.entry.id).toBe('starmap-local-neighbourhood'); // tie -> first entry
    expect(m?.overlap).toBe(5);
  });

  it('matches on ids, never on the campaign name', () => {
    const renamed = campaign(EDITION_1_SYSTEM_IDS.slice(0, 6), { name: 'The Sprawl' });
    expect(matchBundledMap(renamed, MANIFEST)?.entry.id).toBe('starmap-local-neighbourhood');
  });

  it('recognises edition 1 by its recorded ids', () => {
    expect(looksLikeEdition1(campaign(['sys-sol', 'sys-sirius', 'sys-tauceti']))).toBe(true);
    expect(looksLikeEdition1(campaign(['sys-sol', 'sys-sirius']))).toBe(false);
  });
});


// B88 - a decline must RIDE THE FILE. It used to live only in this browser's localStorage, so a user
// with a campaign that matched on three ids was re-offered the upgrade on every single refresh.
describe('upgrade offer - a decline recorded ON THE MAP', () => {
  it("'Not now' stamps the declined edition and silences the offer for it", async () => {
    const before = campaign(EDITION_1_SYSTEM_IDS.slice(0, 6));
    expect((await shouldOfferUpgrade(before, MANIFEST)).offer).toBe(true);

    const after = recordUpgradeAnswer(before, 'later');
    expect(after.baseMapUpgradeDeclined).toBe(CURRENT_BASE_MAP_VERSION);
    expect((await shouldOfferUpgrade(after, MANIFEST)).offer).toBe(false);
  });

  it('survives a save/load round trip through JSON, which localStorage never did', async () => {
    const declined = recordUpgradeAnswer(campaign(EDITION_1_SYSTEM_IDS.slice(0, 6)), 'later');
    const roundTripped = JSON.parse(JSON.stringify(declined)) as Starmap;
    localStorage.clear();   // another browser, another device, cleared site data
    expect((await shouldOfferUpgrade(roundTripped, MANIFEST)).offer).toBe(false);
  });

  it("'Not now' is NOT 'never': a LATER base edition may still be offered", async () => {
    const declined = recordUpgradeAnswer(campaign(EDITION_1_SYSTEM_IDS.slice(0, 6)), 'later');
    // A future build ships a newer edition than the one that was declined.
    const futureManifest: BaseMapManifest = { ...MANIFEST, baseMapVersion: CURRENT_BASE_MAP_VERSION + 1 };
    const stillDeclined = { ...declined, baseMapUpgradeDeclined: CURRENT_BASE_MAP_VERSION - 1 };
    expect((await shouldOfferUpgrade(stillDeclined, futureManifest)).offer).toBe(true);
  });

  it("'do not ask again' silences every edition, for good", async () => {
    const never = recordUpgradeAnswer(campaign(EDITION_1_SYSTEM_IDS.slice(0, 6)), 'never');
    expect(never.baseMapUpgradeDismissed).toBe(true);
    expect((await shouldOfferUpgrade(never, MANIFEST)).offer).toBe(false);
  });

  it('still honours the OLD localStorage dismissal, so nobody is re-asked (additive, not a swap)', async () => {
    const c = campaign(EDITION_1_SYSTEM_IDS.slice(0, 6));
    dismissUpgrade(c.id);
    expect(isUpgradeDismissed(c.id)).toBe(true);
    expect((await shouldOfferUpgrade(c, MANIFEST)).offer).toBe(false);
  });

  it('records without mutating the campaign it was handed', () => {
    const c = campaign(EDITION_1_SYSTEM_IDS.slice(0, 6));
    const snapshot = JSON.stringify(c);
    recordUpgradeAnswer(c, 'later');
    recordUpgradeAnswer(c, 'never');
    expect(JSON.stringify(c)).toBe(snapshot);
  });

  it('THE NEGATIVE THAT MATTERS: a genuine edition-1 campaign that has NOT declined is still offered', async () => {
    const r = await shouldOfferUpgrade(campaign(EDITION_1_SYSTEM_IDS.slice(0, 8)), MANIFEST);
    expect(r.offer).toBe(true);
    expect(r.fromEdition).toBe(1);
  });
});
