// R-05: FETCHING A SHARED MAP FROM THE CREATOR HUB — the funnel, from the engine's side.
//
// A link on the hub (or in a Discord) is `https://starsystemx.com/?hub=<slug>`, and this is what
// turns that into a running campaign instead of a download-then-import. `GET /api/download/<slug>`
// needs no account and returns the bundle.
//
// EVERYTHING HERE TREATS THE ANSWER AS UNTRUSTED, and the slug as untrusted before that. The slug
// arrives in a URL a stranger can craft and hand to somebody; the bytes arrive from a host that is
// ours today and is still a network in between. So:
//
//   - the slug is VALIDATED BEFORE a URL is built from it, never after. Interpolating unchecked
//     text into a URL is how a link ends up addressing something other than the hub;
//   - the response is SIZE-CAPPED while it downloads, not after, so a hostile or broken response
//     cannot exhaust memory before anyone has a chance to reject it;
//   - the bytes go through `classifySaveFile`, the SAME door an imported file uses, and then
//     through the ordinary import fix-up and validation. There is no shortcut for hub content;
//   - and nothing here opens anything. This module fetches and reports; the decision to replace
//     what is in the browser belongs to the caller, and to the person using it.
//
// CROSS-ORIGIN: the app and the hub are different hosts, so this needs the hub to send
// `Access-Control-Allow-Origin` for the app's origin. When it does not, the failure is a network
// error indistinguishable from being offline - which is why `hubMapUrl` is exported: the caller
// can offer the plain link as the way through rather than leaving a dead end.

/**
 * What a hub slug may look like. Deliberately narrow: lower-case letters, digits and hyphens, and
 * it must start with one of the first two. Anything else - a slash, a dot, a colon, a percent, a
 * space - is refused before it is ever put in a URL, because the whole point of validating a slug
 * is that it happens BEFORE the string becomes an address.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** A bundle big enough for any real campaign and small enough not to be a weapon. */
export const MAX_HUB_BYTES = 64 * 1024 * 1024;

/** Give up rather than hang a startup on a host that accepts the connection and then says nothing. */
const FETCH_TIMEOUT_MS = 30_000;

import { HUB } from './hubConfig';

export type HubFetch =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; problem: string };

/** True for a slug this module is willing to build a URL from. */
export function isValidHubSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

/**
 * TURN WHATEVER SOMEBODY PASTED INTO A SLUG, or null.
 *
 * People do not paste slugs. They paste the thing in their clipboard, which is whichever URL they
 * happened to be looking at - the hub's page for the map, the one-click app link out of a Discord,
 * or occasionally the raw download endpoint. All three name the same map, so all three are
 * accepted, and so is a bare slug for anyone who does have one.
 *
 * It reads the URL rather than pattern-matching the whole string, so a link with tracking junk on
 * the end (`?utm_source=...`, a trailing `#`) still works - which is what a link out of a chat app
 * actually looks like. The result is validated like any other slug before it is used.
 */
export function parseHubReference(text: string): string | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;
  if (isValidHubSlug(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  // The app's own one-click link: `/?hub=<slug>`, accepted from ANY host, because the app runs on
  // several - starsystemx.com, beta., a pages.dev verification build, localhost - and a link from
  // one of them names exactly the same map.
  const q = url.searchParams.get('hub');
  if (q && isValidHubSlug(q)) return q;

  // A PATH only names a map when it is the HUB'S path. Taking the last segment of any URL at all
  // would quietly turn an unrelated link into a map code and fetch whatever the hub had under that
  // name - not dangerous, since the request is still built on the hub's own origin, but it would
  // be a confident wrong answer where "that is not a shared-map link" is the honest one.
  if (url.host !== new URL(HUB.origin).host) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  const candidate = last.toLowerCase().endsWith('.sse.zip') ? last.slice(0, -'.sse.zip'.length) : last;
  return isValidHubSlug(candidate) ? candidate : null;
}

/** The hub's page for a map — what to show a GM when the fetch itself could not happen. */
export function hubMapUrl(slug: string): string {
  return `${HUB.origin}${HUB.pagePath(slug)}`;
}

/** The download endpoint for a map. Only ever called with a slug that has passed validation. */
export function hubDownloadUrl(slug: string): string {
  return `${HUB.origin}${HUB.downloadPath(slug)}`;
}

/**
 * Fetch a shared map's bytes. Never throws: every failure comes back as a sentence a GM can act on,
 * because this runs at startup where an exception would be a blank screen.
 */
export async function fetchHubMap(slug: string, fetchImpl: typeof fetch = fetch): Promise<HubFetch> {
  if (!isValidHubSlug(slug)) {
    return { ok: false, problem: 'That shared-map link does not look like one — the code in it contains characters a hub map id never has.' };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  let response: Response;
  try {
    response = await fetchImpl(hubDownloadUrl(slug), {
      signal: controller?.signal,
      // A shared map is public and needs no account; sending credentials to another origin for a
      // link a stranger supplied would be the wrong default even where it would work.
      credentials: 'omit',
      redirect: 'follow'
    });
  } catch {
    return {
      ok: false,
      problem: `Could not reach the map library. Check your connection, or open ${hubMapUrl(slug)} in a browser tab and download the map from there.`
    };
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (response.status === 404) {
    return { ok: false, problem: 'That shared map no longer exists, or its link has changed. Ask whoever sent it for a fresh one.' };
  }
  if (!response.ok) {
    return { ok: false, problem: `The map library could not send that map (error ${response.status}). It may be a temporary problem — try again shortly.` };
  }

  // The declared length is a CLAIM, so it is used only as an early exit; the real cap is applied to
  // the bytes as they arrive, below.
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_HUB_BYTES) {
    return { ok: false, problem: `That map is larger than this app will open from a link (${Math.round(declared / 1e6)} MB). Download it from the hub and open it as a file.` };
  }

  try {
    const bytes = await readCapped(response, MAX_HUB_BYTES);
    if (!bytes) {
      return { ok: false, problem: 'That map is larger than this app will open from a link. Download it from the hub and open it as a file.' };
    }
    if (!bytes.length) {
      return { ok: false, problem: 'The map library returned an empty file.' };
    }
    return { ok: true, bytes };
  } catch {
    return { ok: false, problem: 'The download stopped part way through. Try again, or download the map from the hub and open it as a file.' };
  }
}

/**
 * Read a response body, giving up the moment it exceeds `max`. Streamed where the platform allows
 * it: `arrayBuffer()` has already allocated the whole thing by the time it could be measured, which
 * is exactly the allocation a cap is supposed to prevent.
 */
async function readCapped(response: Response, max: number): Promise<Uint8Array | null> {
  const reader = response.body?.getReader?.();
  if (!reader) {
    // No streams (older engines, and some test doubles): fall back to the whole buffer and check.
    const buf = new Uint8Array(await response.arrayBuffer());
    return buf.length > max ? null : buf;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > max) {
      try { await reader.cancel(); } catch { /* already finished */ }
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
