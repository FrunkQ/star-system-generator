import { describe, it, expect, beforeEach } from 'vitest';
import { shouldOfferUpgrade, dismissUpgrade, isUpgradeDismissed } from './upgradeOffer';
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
