// src/lib/map/keepACopy.ts
//
// "KEEP A COPY" - the one-version safety net for a rehosting (G72). Browser storage is per ORIGIN, so as
// long as the app keeps its hostname a move between hosts loses nobody's campaign; but a cutover is the
// moment a stale service-worker shell, a mistyped DNS record or a changed hostname can put a campaign out
// of reach, and a file on the GM's own disk is the one copy no migration can touch. So the release that
// precedes a cutover asks ONCE, per campaign: download a full bundle now, or say you already have one.
// There is no third way out of the notice, which is what "force save" means here.
//
// The answer is stamped on the campaign (`keptCopyForVersion`), the way the base-map upgrade offer records
// its answer (`upgradeOffer.ts`): it rides saves, bundles and devices, so a re-import does not re-ask, and
// a campaign created AFTER the armed version is never asked at all - it has nothing to lose to a move.
//
// Both knobs are DATA, set once per cutover: the version the notice is armed from, and the new address
// if the hostname itself changes (null while it does not).
import { compareBuildVersions } from './provenance';

/**
 * The app version from which the notice is armed, or null while it is DISARMED. Armed at 3.0.326 for the
 * 2026-09-06 rehosting; disarmed the same evening on the owner's word ("kill this happening - we are all good
 * now") once the cutover turned out to move only the DNS zone and never the app. Set a version string here
 * to arm it again for a real host or hostname move; nothing else needs touching.
 */
export const KEEP_A_COPY_FROM: string | null = null;

/** Where the app will live if its hostname changes. `null` means "same address, different house". */
export const NEW_ADDRESS: string | null = null;

type Stamped = { systems?: unknown[]; keptCopyForVersion?: string; createdWithVersion?: string; appVersion?: string };

/**
 * Should this campaign be asked to keep a copy? Yes when the app is at or past the armed version, the
 * campaign has systems worth keeping, and its stamp is absent or older than the armed version.
 */
export function shouldAskToKeepACopy(
	map: Stamped | null | undefined,
	appVersion: string,
	armedFrom: string | null = KEEP_A_COPY_FROM
): boolean {
	if (!armedFrom) return false; // disarmed: nobody is asked, whatever the version
	if (!map || !Array.isArray(map.systems) || map.systems.length === 0) return false;
	if (compareBuildVersions(appVersion, armedFrom) < 0) return false;
	const kept = map.keptCopyForVersion;
	return !kept || compareBuildVersions(kept, armedFrom) < 0;
}

/** The GM has a copy (downloaded through the notice, or says so): record it on the campaign. */
export function recordKeptCopy<T extends Stamped>(map: T, forVersion: string | null = KEEP_A_COPY_FROM): T {
	return forVersion ? { ...map, keptCopyForVersion: forVersion } : map;
}

/** The notice's own words, so the modal and any test say the same thing. */
export function keepACopyMessage(): { title: string; body: string; address: string | null } {
	return {
		title: 'Keep a copy of this campaign',
		body: NEW_ADDRESS
			? 'Star System Explorer is moving to a new address. Your campaign lives in this browser, and a file on your own disk is the one copy a move cannot touch. Download it now, then carry on; you can load the file at the new address.'
			: 'Star System Explorer is about to change hosting. Nothing should change for you, but your campaign lives in this browser, and a file on your own disk is the one copy a move cannot touch. Download it now, then carry on as usual.',
		address: NEW_ADDRESS
	};
}
