// WS8 — SHOULD we offer this campaign a base-map upgrade? One decision function, so the answer cannot differ
// between the load path, the settings screen and any later entry point.
//
// The bar for offering is deliberately HIGH. A wrong "yes" interrupts a GM mid-session with a scary-sounding
// dialogue about their campaign; a wrong "no" costs them nothing they notice, because the map still works and
// the offer can be made again from Settings. So every uncertain case answers NO, and the reason is returned
// alongside so the decision is inspectable rather than mysterious.

import type { Starmap } from '$lib/types';
import { CURRENT_BASE_MAP_VERSION } from './provenance';
import { loadBaseMapManifest, matchBundledMap, looksLikeEdition1, type BaseMapManifest } from './baseMapManifest';
import type { BaseMapManifestEntry } from './rebase';

// B88 — WHERE A DECLINE IS REMEMBERED. It used to live ONLY in the localStorage key below, keyed by
// campaign id, which does not travel with the file: a user who declined was asked again on every
// refresh in another browser, on another device, or after clearing site data - and "Not now" recorded
// nothing at all, so only the quiet checkbox ever counted. The answer is now written ON THE CAMPAIGN
// (`baseMapUpgradeDeclined` / `baseMapUpgradeDismissed`), so it rides saves, bundles and devices. The
// localStorage key is still READ - additively, never swapped - so nobody who already dismissed is
// re-asked; it is no longer the only record.

/** Per-campaign "don't ask again", keyed by starmap id. Survives reloads; it is a preference, not campaign data. */
const DISMISS_KEY = 'sse2.baseMapUpgrade.dismissed';

function dismissedIds(): string[] {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

export function isUpgradeDismissed(starmapId: string): boolean {
  return dismissedIds().includes(starmapId);
}

/** Remember that this campaign does not want the offer. Silent on failure — a lost preference is not an error. */
export function dismissUpgrade(starmapId: string): void {
  try {
    const next = [...new Set([...dismissedIds(), starmapId])].slice(-200);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
  } catch { /* private mode, quota — the offer simply appears again */ }
}

/**
 * Record the GM's answer ON THE CAMPAIGN, so it travels with the file (B88). Returns a NEW map -
 * callers put it through the store, and nothing here mutates live campaign state.
 *
 * 'later'  = Not now: do not re-ask for the edition this build ships; a future edition may ask again.
 * 'never'  = do not ask again for this campaign, whatever edition arrives.
 */
export function recordUpgradeAnswer<T extends { baseMapUpgradeDeclined?: number; baseMapUpgradeDismissed?: boolean }>(
  campaign: T,
  answer: 'later' | 'never'
): T {
  return answer === 'never'
    ? { ...campaign, baseMapUpgradeDismissed: true }
    : { ...campaign, baseMapUpgradeDeclined: CURRENT_BASE_MAP_VERSION };
}

export interface UpgradeOffer {
  offer: boolean;
  /** Why, in developer terms. Logged, not shown to the GM. */
  reason: string;
  /** Present only when `offer` is true. */
  base?: BaseMapManifestEntry & { file: string };
  fromEdition?: number | null;
  manifest?: BaseMapManifest;
}

/**
 * Decide whether to offer. `manifest` may be passed in (tests, or a caller that already has it); otherwise it
 * is fetched, and an unavailable manifest means no offer.
 */
export async function shouldOfferUpgrade(
  campaign: Starmap | null | undefined,
  manifestIn?: BaseMapManifest | null
): Promise<UpgradeOffer> {
  if (!campaign || !campaign.systems?.length) return { offer: false, reason: 'no campaign loaded' };
  if (isUpgradeDismissed(campaign.id)) return { offer: false, reason: 'dismissed for this campaign (local preference)' };
  // On-map answers, which travel with the file (B88).
  if (campaign.baseMapUpgradeDismissed === true) return { offer: false, reason: 'dismissed for this campaign (stamped on the map)' };

  const manifest = manifestIn !== undefined ? manifestIn : await loadBaseMapManifest();
  if (!manifest) return { offer: false, reason: 'manifest unavailable' };

  const stamped = typeof campaign.baseMapVersion === 'number' && Number.isFinite(campaign.baseMapVersion);
  // A campaign already on the current edition — or somehow AHEAD of this build — is left alone. Offering an
  // "upgrade" that moved a map backwards would be a data-loss bug wearing a helpful hat.
  if (stamped && campaign.baseMapVersion! >= CURRENT_BASE_MAP_VERSION) {
    return { offer: false, reason: `already at base edition ${campaign.baseMapVersion}` };
  }

  // 'Not now' for the edition this build ships. A LATER edition may still be offered, which is what
  // separates it from the never-ask-again tick above.
  if (typeof campaign.baseMapUpgradeDeclined === 'number' && campaign.baseMapUpgradeDeclined >= CURRENT_BASE_MAP_VERSION) {
    return { offer: false, reason: `declined the upgrade to base edition ${CURRENT_BASE_MAP_VERSION}` };
  }

  const match = matchBundledMap(campaign, manifest);
  if (!match) return { offer: false, reason: 'no bundled base map recognised in this campaign' };

  // Unstamped: it must ALSO look like edition 1 by its ids. This is what stops a brand-new campaign started
  // from the current bundled map (stamped, so it never reaches here) or a hand-built map from being offered.
  if (!stamped && !looksLikeEdition1(campaign)) {
    return { offer: false, reason: 'unstamped and does not match edition 1' };
  }

  return {
    offer: true,
    reason: stamped ? `base edition ${campaign.baseMapVersion} < ${CURRENT_BASE_MAP_VERSION}` : 'unstamped edition-1 base map',
    base: match.entry,
    fromEdition: stamped ? campaign.baseMapVersion! : 1,
    manifest
  };
}
