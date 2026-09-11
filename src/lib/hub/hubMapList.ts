// R-20: THE HUB'S MAP LIST, READ FOR A PANEL INSIDE THE APP (G98, Stream AA job 1).
//
// The owner, 2026-09-11: *"a small API that can provide a compact list of star systems in Explorers
// as a list INSIDE SSE to single click and load... thumbnail & key data & url. Be able to get them
// 10 at a time sorted by latest, most popular, most comments, etc."* And the same day, the bigger
// decision this panel serves: *"the load/new map modals are going to link to those available on the
// Explorers site RATHER than default ones shipped."*
//
// THE CONTRACT IS THE HUB'S and it is read where it lives
// (`starsystemx-creator-hub/docs/prompt-for-sse-2026-09-11-map-list-api.md`). Two rules from it
// govern everything below:
//
//  - READ ONLY THE FIELDS THE CONTRACT NAMES. The objects carry the hub's own card columns as well,
//    and those "may change without a version bump". So the parser builds a fresh object from named
//    fields and never spreads the response - a field that is not in `HubMapSummary` cannot reach a
//    component by accident, and a column the hub renames tomorrow cannot break a card today.
//  - `openUrl` IS NULL FOR A SINGLE SYSTEM, deliberately (R-18). This panel does not read it at
//    all: a click opens `downloadUrl` through the same door `?open=` uses, so the one field that
//    would have made a system look openable is simply not consulted.
//
// AND THE RESPONSE IS UNTRUSTED, exactly as a map is (engine map DATA-R35). Every address in it is
// put through `isTrustedOpenUrl` before it becomes a link, an image or a fetch: a list that named a
// download somewhere other than the hub would otherwise hand the one-click open an address the
// allow-list exists to refuse, and a cover on another host is a request this app would make on the
// GM's behalf to somebody it never chose. An entry whose download fails that test is DROPPED, not
// shown disabled - there is nothing a GM could do with it.
//
// THIS MODULE FETCHES AND REPORTS. It opens nothing; the panel hands a chosen map's `downloadUrl` to
// the route's `runHubOpenFromUrl`, which is the one door (DATA-R35 RULE ONE-C).
import { HUB, isTrustedOpenUrl } from './hubConfig';
import { fetchHubBytes, isValidHubSlug } from './hubClient';

/** Ten a time: the owner's number, and what the hub's note says to pass. */
export const HUB_LIST_PAGE_SIZE = 10;

/** The hub clamps `page` to 1..50, so asking for page 51 would quietly return page 50 again. */
export const HUB_LIST_MAX_PAGE = 50;

/**
 * A list of ten cards is kilobytes. The cap is there for the same reason the map download has one -
 * the answer is untrusted - and it is generous enough that a hub adding columns never trips it.
 */
export const MAX_HUB_LIST_BYTES = 2 * 1024 * 1024;

/**
 * THE ORDERS THE HUB OFFERS, and what a GM reads for each. Data, in one table: the order here is the
 * order of the menu, and the first is the default - `detailed`, which the hub itself suggests for a
 * panel "trying to show something good rather than something recent".
 */
export const HUB_MAP_SORTS = [
  { id: 'detailed', label: 'Best written-up' },
  { id: 'new', label: 'Newest' },
  { id: 'loved', label: 'Most starred' },
  { id: 'discussed', label: 'Most discussed' }
] as const;

export type HubMapSort = (typeof HUB_MAP_SORTS)[number]['id'];

/** A map as the panel may use it: the contract's field names, and only the ones a card shows. */
export interface HubMapSummary {
  slug: string;
  title: string;
  blurb: string | null;
  kind: 'starmap' | 'system';
  /** The map's page on the hub. Null when the response named somewhere that is not the hub. */
  url: string | null;
  /** Always an allow-listed hub address - an entry without one is never listed. */
  downloadUrl: string;
  /** 1200x630, scaled down hard on the card. Null when there is none or it was not on the hub. */
  coverUrl: string | null;
  system_count: number;
  body_count: number;
  construct_count: number;
  hearts_count: number;
  /** Optional in the contract (`comments_count?`), so absent stays absent rather than becoming 0. */
  comments_count: number | null;
  download_count: number;
}

export interface HubMapQuery {
  sort: HubMapSort;
  page: number;
  kind: 'starmap' | 'system';
  /** One tag, or none. The hub accepts up to eight; the panel only ever asks for the starter tag. */
  tag?: string | null;
}

export type HubMapListResult =
  | {
      ok: true;
      maps: HubMapSummary[];
      page: number;
      /** A full page came back, so there may be another. The hub sends no total, so this is the honest test. */
      hasMore: boolean;
      /** Entries the hub sent that could not be listed (wrong kind, or an address off the hub). */
      skipped: number;
    }
  | { ok: false; problem: string };

function clampPage(page: unknown): number {
  const n = Math.floor(Number(page));
  return Number.isFinite(n) ? Math.min(HUB_LIST_MAX_PAGE, Math.max(1, n)) : 1;
}

/** The list endpoint for a query, on `HUB.origin`. Built from `HUB` alone, so it can never address anywhere else. */
export function hubMapListUrl(query: HubMapQuery): string {
  const params = new URLSearchParams();
  params.set('kind', query.kind);
  params.set('sort', query.sort);
  params.set('limit', String(HUB_LIST_PAGE_SIZE));
  params.set('page', String(clampPage(query.page)));
  if (query.tag) params.set('tag', query.tag);
  return `${HUB.origin}${HUB.listPath}?${params.toString()}`;
}

/** A count from the response, or 0. Negative, fractional or non-numeric is not a count. */
function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/** An address from the response, kept only when this app would fetch from it. */
function hubAddress(value: unknown): string | null {
  return typeof value === 'string' && isTrustedOpenUrl(value) === null ? value.trim() : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * READ ONE PAGE OF THE HUB'S ANSWER. Pure, so the whole of "what does the panel believe" is testable
 * without a network. `expectedKind` is what was asked for: the hub honours `kind`, but the answer is
 * untrusted, and a system reaching a click-to-open list would open to the refusal R-18 describes.
 */
export function parseHubMapList(json: unknown, expectedKind: HubMapQuery['kind'], requestedPage: number): HubMapListResult {
  const raw = (json as { maps?: unknown })?.maps;
  if (!json || typeof json !== 'object' || !Array.isArray(raw)) {
    return { ok: false, problem: 'Explorers sent a list this app could not read. Try again shortly.' };
  }
  const maps: HubMapSummary[] = [];
  let skipped = 0;
  for (const entry of raw) {
    const m = entry as Record<string, unknown>;
    const slug = m?.slug;
    const downloadUrl = hubAddress(m?.downloadUrl);
    if (!isValidHubSlug(slug) || m?.kind !== expectedKind || !downloadUrl) {
      skipped++;
      continue;
    }
    maps.push({
      slug,
      title: text(m.title) ?? slug,
      blurb: text(m.blurb),
      kind: expectedKind,
      url: hubAddress(m.url),
      downloadUrl,
      coverUrl: hubAddress(m.coverUrl),
      system_count: count(m.system_count),
      body_count: count(m.body_count),
      construct_count: count(m.construct_count),
      hearts_count: count(m.hearts_count),
      comments_count: m.comments_count === undefined || m.comments_count === null ? null : count(m.comments_count),
      download_count: count(m.download_count)
    });
  }
  // The hub clamps the page it serves; when it says which page it served, believe it.
  const served = (json as { page?: unknown }).page;
  const page = typeof served === 'number' ? clampPage(served) : clampPage(requestedPage);
  return {
    ok: true,
    maps,
    page,
    // Measured against what the hub SENT, not what survived the checks: the page boundary is the hub's.
    hasMore: raw.length >= HUB_LIST_PAGE_SIZE && page < HUB_LIST_MAX_PAGE,
    skipped
  };
}

/**
 * FETCH ONE PAGE OF THE LIST. Never throws; every failure is a sentence for the panel, because a
 * blank list and a list that could not be fetched look identical to a GM unless somebody says which.
 */
export async function fetchHubMapList(query: HubMapQuery, fetchImpl: typeof fetch = fetch): Promise<HubMapListResult> {
  const got = await fetchHubBytes(hubMapListUrl(query), fetchImpl, MAX_HUB_LIST_BYTES);
  if (!got.ok) {
    switch (got.failure.reason) {
      case 'unreachable':
        return {
          ok: false,
          problem: `Could not reach Explorers, where shared maps live. You may be offline. You can still load a file, or try ${HUB.browseUrl} in a browser tab.`
        };
      case 'status':
      case 'not-found':
        return {
          ok: false,
          problem: `Explorers could not send its list just now (error ${got.failure.reason === 'status' ? got.failure.status : 404}). Try again shortly.`
        };
      default:
        return { ok: false, problem: 'Explorers sent a list this app could not read. Try again shortly.' };
    }
  }
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(got.bytes));
  } catch {
    return { ok: false, problem: 'Explorers sent a list this app could not read. Try again shortly.' };
  }
  return parseHubMapList(json, query.kind, query.page);
}
