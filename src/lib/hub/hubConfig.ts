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
 * WHERE THE HUB IS TODAY. The Cloudflare Workers deploy, which is the origin that actually answers
 * (owner, 2026-09-01). A feature pointing at a domain that does not resolve yet is a broken feature,
 * so this is the live one and the cutover below is deliberately one token.
 */
const LIVE_ORIGIN = 'https://starsystemx-creator-hub.orange-tree-847c.workers.dev';

/**
 * WHERE THE HUB IS GOING. `explorers.starsystemx.com` is the agreed final name (owner, 2026-08-31).
 * AT CUTOVER: point `origin` and `browseUrl` at this instead — that is the whole change, and the
 * shareable links this app produces follow automatically because they are built from `HUB.origin`.
 *
 * Worth knowing at that moment: links already shared into a Discord carry the app's OWN origin, not
 * the hub's (`/?hub=<slug>` on starsystemx.com), so moving the hub does not break any link already
 * in the wild. Only this app's ability to REACH the hub moves.
 */
export const HUB_FINAL_ORIGIN = 'https://explorers.starsystemx.com';

export const HUB: HubConfig = {
  origin: LIVE_ORIGIN,
  downloadPath: (slug) => `/api/download/${encodeURIComponent(slug)}`,
  // `/s/`, not `/m/`. The hub redirects the old path so nothing broke, but a link this app hands a
  // GM should be the real one rather than a redirect (hub note, 2026-09-03).
  pagePath: (slug) => `/s/${encodeURIComponent(slug)}`,
  browseUrl: LIVE_ORIGIN,
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
//  - the workers.dev deploy, which is the origin that actually answers today;
//  - `explorers.starsystemx.com`, the agreed final name, listed AHEAD of the cutover so the hub's
//    button does not have to wait for an engine release on the day the DNS moves;
//  - `*.pages.dev`, the preview builds. THIS IS THE WIDEST ENTRY BY FAR and it is the first one to
//    remove: it trusts every Cloudflare Pages site on the internet, not just the hub's. It is here
//    because the hub asked for it by name and because the exposure is small and bounded - the
//    request carries no credentials, the bytes go through the same untrusted-file door an import
//    uses, and the GM is still asked before anything replaces a campaign. It is NOT here because
//    anybody thinks a stranger's Pages deploy is trustworthy.
export const TRUSTED_OPEN_HOSTS: readonly string[] = [
  new URL(LIVE_ORIGIN).hostname,
  new URL(HUB_FINAL_ORIGIN).hostname
];

/** Suffix matches, leading dot included so `notpages.dev` cannot pass as `*.pages.dev`. */
export const TRUSTED_OPEN_HOST_SUFFIXES: readonly string[] = ['.pages.dev'];

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
  const trusted =
    TRUSTED_OPEN_HOSTS.some((h) => h.toLowerCase() === host) ||
    TRUSTED_OPEN_HOST_SUFFIXES.some((s) => host.endsWith(s));
  if (!trusted) {
    return `This app only opens shared maps from the map library, and that link points at ${host}.`;
  }
  return null;
}
