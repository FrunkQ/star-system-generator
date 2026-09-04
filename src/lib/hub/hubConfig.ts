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
