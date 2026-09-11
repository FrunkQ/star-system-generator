// THE CREATOR HUB, AS THIS APP ADDRESSES IT — one file, so changing where the hub lives is one edit.
//
// Everything the engine needs to know about the hub is here: where it is, what its endpoints are
// called, and which parts of the integration are switched on. Nothing else in the codebase should
// contain a hub URL; `hubClient.ts` and the save flow ask this module.
//
// WHY A CONFIG FILE RATHER THAN A CONSTANT BURIED IN THE CLIENT (owner, 2026-08-31: "have it as a
// config item to easily update"): the domain was still a placeholder in `creator-hub-terms-draft.md`
// while this was being built, and a name that is still being decided must not end up spelled out at
// four call sites. When R-09's `PUBLIC_ANALYTICS` build switch lands, `HUB.origin` is the obvious
// second thing to read from that same mechanism - deliberately NOT invented here first, because two
// config mechanisms answering one question is the fault this repo keeps writing rules about.

export interface HubConfig {
  /** Scheme and host, no trailing slash. THE line to change if the hub moves. */
  origin: string;
  /** Public download of a shared map. No account needed. Live since 2026-08-30. */
  downloadPath: (slug: string) => string;
  /** The human-facing page for a map — what to offer when a fetch cannot happen at all. */
  pagePath: (slug: string) => string;
  /** Where a GM goes to browse. The funnel's other direction. */
  browseUrl: string;
  /**
   * R-20: the map LIST, as JSON, for the panel inside the load screens. No account, CORS open,
   * cached 60 s at the hub's edge. The contract is the hub's
   * `docs/prompt-for-sse-2026-09-11-map-list-api.md`, read where it lives.
   */
  listPath: string;
  /**
   * The tag the owner puts on the maps that stand in for the ones this app used to ship (G98,
   * 2026-09-11). The New Starmap screen asks the list for it first. The hub's to spell, so it is
   * spelt once, here.
   */
  starterTag: string;
  /**
   * The pill the hub puts in a map's `auto_tags` when it read something wrong in the file - often
   * something that stops this app opening it (hub D-88/D-89, R-20 reply of 2026-09-11). The hub
   * sorts those maps last; the list shows them and SAYS so rather than hiding them, which is the
   * hub's own rule ("last, not hidden").
   */
  needsFixTag: string;
  /**
   * UPLOAD IS OFF UNTIL THE HUB SIDE EXISTS. Two things are owed and neither may be invented: the
   * device-code pairing endpoint, and the exact attestation wording (it must be shown verbatim and
   * must never be pre-ticked, so a placeholder would defeat its entire purpose). The request for
   * both is written up in `docs/dev/hub-pairing-and-upload-request.md`.
   *
   * Everything behind this flag is BUILT — see `hubUpload.ts` — so turning it on is this boolean
   * plus the endpoint details, not a feature.
   */
  uploadEnabled: boolean;
}

/**
 * WHERE THE HUB IS. **THE CUTOVER HAPPENED 2026-09-06** and this is the agreed final name (owner,
 * 2026-08-31), measured serving the hub at `x-hub-version: 0.24.0` with
 * `access-control-allow-origin: *` on the download. The line above used to say "where the hub is
 * going"; it now says where it is, which is the whole of the change that file promised.
 */
export const HUB_ORIGIN = 'https://explorers.starsystemx.com';

/**
 * WHERE THE HUB ALSO STILL ANSWERS. The Cloudflare Workers deploy was the live origin until the
 * cutover and **still serves the same hub** (measured the same day, same version header), so it is
 * kept for two reasons rather than tidied away: links carrying it are in the wild - in Discords, in
 * anybody's bookmarks - and they must keep naming a map; and it is the fallback if the custom
 * hostname ever stops resolving. It is NOT where this app addresses the hub any more.
 */
export const HUB_LEGACY_ORIGIN = 'https://starsystemx-creator-hub.orange-tree-847c.workers.dev';

export const HUB: HubConfig = {
  origin: HUB_ORIGIN,
  downloadPath: (slug) => `/api/download/${encodeURIComponent(slug)}`,
  // `/s/`, not `/m/`. The hub redirects the old path so nothing broke, but a link this app hands a
  // GM should be the real one rather than a redirect (hub note, 2026-09-03).
  pagePath: (slug) => `/s/${encodeURIComponent(slug)}`,
  browseUrl: HUB_ORIGIN,
  listPath: '/api/maps',
  starterTag: 'default',
  needsFixTag: 'needs-a-fix',
  uploadEnabled: false
};

/** The public link that opens a shared map straight into this app — the funnel, as a string. */
export function shareableAppLink(slug: string, appOrigin: string): string {
  return `${appOrigin.replace(/\/+$/, '')}/?hub=${encodeURIComponent(slug)}`;
}

// --- R-17: opening a map from an ADDRESS rather than a code -------------------------------------
//
// `https://starsystemx.com/?open=<percent-encoded download URL>` is the hub's "Open in Star System
// Explorer" button beside a map's download. The difference from `?hub=<slug>` is the whole of the
// risk: a slug is a name this app turns into an address on the hub's own origin, so the destination
// was never in the link's gift. `?open=` hands the app the ADDRESS, and a URL parameter the app
// will fetch and then load is an SSRF-shaped thing.
//
// THE ALLOW-LIST IS THE ENTIRE DEFENCE, AND IT IS DATA, so tightening it later is one edit here
// rather than a hunt through the fetch code. It lives beside the rest of the hub's addresses for
// the reason stated at the top of this file: nothing else in the codebase should contain one.
//
// WHAT IS ON IT AND WHY EACH ENTRY IS THERE (hub's R-17, 2026-09-05):
//  - `explorers.starsystemx.com`, where the hub lives since the cutover of 2026-09-06;
//  - the workers.dev deploy, which was the live origin until that day and still answers, so links
//    carrying it keep working. **LISTING THE SECOND NAME AHEAD OF THE CUTOVER IS THE REASON THE
//    CUTOVER COST NOTHING:** the hub started publishing `explorers` download URLs and the engine
//    accepted them with no release, which was the whole point of writing the list this way;
//  - `*.pages.dev`, the preview builds. THIS IS THE WIDEST ENTRY BY FAR and it is the first one to
//    remove: it trusts every Cloudflare Pages site on the internet, not just the hub's. It is here
//    because the hub asked for it by name and because the exposure is small and bounded - the
//    request carries no credentials, the bytes go through the same untrusted-file door an import
//    uses, and the GM is still asked before anything replaces a campaign. It is NOT here because
//    anybody thinks a stranger's Pages deploy is trustworthy.
export const TRUSTED_OPEN_HOSTS: readonly string[] = [
  new URL(HUB_ORIGIN).hostname,
  new URL(HUB_LEGACY_ORIGIN).hostname
];

/** Suffix matches, leading dot included so `notpages.dev` cannot pass as `*.pages.dev`. */
export const TRUSTED_OPEN_HOST_SUFFIXES: readonly string[] = ['.pages.dev'];

/**
 * IS THIS HOST THE HUB? One answer, used by everything that needs to ask.
 *
 * `isTrustedOpenUrl` needs it to decide what to FETCH, and `parseHubReference` needs it to decide
 * whether a pasted path NAMES a map. Those were two questions with two answers until the cutover
 * made them disagree: the reference parser compared against `HUB.origin` alone, so the moment the
 * origin moved, a workers.dev link that still works would have stopped being recognised. Two
 * spellings of one idea is the fault this codebase keeps writing rules about.
 */
export function isHubHost(host: string): boolean {
  const h = host.toLowerCase();
  return TRUSTED_OPEN_HOSTS.some((t) => t.toLowerCase() === h) ||
    TRUSTED_OPEN_HOST_SUFFIXES.some((s) => h.endsWith(s));
}

/**
 * IS THIS AN ADDRESS THE APP IS WILLING TO FETCH A MAP FROM? Returns `null` when it is, and
 * otherwise the reason, in words a GM can read - because this refusal is shown to a person who
 * clicked a link and deserves to know why nothing happened.
 *
 * Pure, and deliberately paranoid about the things a look-alike link does:
 *  - `https:` ONLY. `http:` is a downgrade a link should not be able to ask for, and `javascript:`,
 *    `data:` and `file:` are not fetches of a remote map at all.
 *  - NO USERINFO. `https://explorers.starsystemx.com@evil.example/` has a HOST of `evil.example`
 *    and reads to a human as the hub. The host check already refuses it; refusing the shape as
 *    well means a later reader who re-derives the host by hand cannot reintroduce the trick.
 *  - THE DEFAULT PORT ONLY. A trusted host on a strange port is a different service.
 *  - EXACT HOSTS, or a genuine subdomain of a suffix. `explorers.starsystemx.com.evil.example`
 *    ends with nothing on this list and is refused, which is the case the list exists for.
 */
export function isTrustedOpenUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return 'That link did not carry a map address.';
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return 'That link does not contain a web address this app can read.';
  }
  if (url.protocol !== 'https:') {
    return `Shared maps are only opened over https, and that link is ${url.protocol.replace(':', '')}.`;
  }
  if (url.username || url.password) {
    return 'That link has a sign-in embedded in it, which a shared-map address never does.';
  }
  if (url.port) {
    return `That link points at port ${url.port}, and the map library does not answer there.`;
  }
  const host = url.hostname.toLowerCase();
  if (!isHubHost(host)) {
    return `This app only opens shared maps from the map library, and that link points at ${host}.`;
  }
  return null;
}
