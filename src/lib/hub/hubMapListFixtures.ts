// A RECORDED-SHAPE ANSWER FROM THE HUB'S MAP LIST, for the R-20 gates - SYNTHESISED, never recorded.
//
// The live list carries real people's map titles and blurbs, and nothing a user made goes in this
// repository (the standing rule on `../user-test-files/`). So this reproduces the SHAPE measured
// against `explorers.starsystemx.com/api/maps` on 2026-09-11 (hub 0.59.2) with invented content:
// the same envelope keys, the same per-map keys INCLUDING the ones outside the contract
// (`info_density`, `cover_sha256`, `fan_setting`, `carried_images`...), because a parser that is
// only ever shown the contract's fields cannot be seen ignoring the rest.
//
// Imported by specs only; nothing in the app reads it.

export const LIVE_ORIGIN = 'https://explorers.starsystemx.com';

/** One map as the hub sends it, contract fields and card columns together. */
export function hubListEntry(i: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const slug = `synthetic-map-${i}`;
  return {
    auto_tags: ['campaign', 'moons'],
    blurb: i % 3 === 0 ? null : `An invented campaign, number ${i}.`,
    body_count: 10 * i,
    carried_images: 0,
    carried_models: 0,
    comments_count: i % 4,
    construct_count: i % 2,
    coverUrl: `${LIVE_ORIGIN}/asset/${'ab'.repeat(32)}`,
    cover_sha256: 'ab'.repeat(32),
    created_with: '3.1.64',
    // Hub 0.61.2 (D-90): `creator` on every map, `url` null until the hub has public profiles.
    creator: { name: `Synthetic Cartographer ${i}`, url: null },
    downloadUrl: `${LIVE_ORIGIN}/api/download/${slug}`,
    download_count: 3 * i,
    fan_setting: null,
    hearts_count: i,
    info_density: 0.5,
    information: 3,
    kind: 'starmap',
    openUrl: `https://beta.starsystemx.com/?open=${encodeURIComponent(`${LIVE_ORIGIN}/api/download/${slug}`)}`,
    slug,
    source_bytes: 1234,
    summary: null,
    system_count: i + 1,
    tags: ['sandbox'],
    title: `Synthetic Map ${i}`,
    updated_at: '2026-09-11T09:00:00.000Z',
    url: `${LIVE_ORIGIN}/s/${slug}`,
    ...overrides
  };
}

/** A whole page: the envelope exactly as measured, with `count` maps in it. */
export function hubListPage(count: number, extra: { page?: number; sort?: string; maps?: Record<string, unknown>[] } = {}) {
  return {
    maps: extra.maps ?? Array.from({ length: count }, (_, i) => hubListEntry(i + 1)),
    page: extra.page ?? 1,
    pageSize: 10,
    sort: extra.sort ?? 'detailed',
    downloadPath: '/api/download/{slug}',
    coverPath: '/asset/{sha256}'
  };
}

/**
 * A fetch double that answers by URL. Records every call and the init it was given. `reply` sees the
 * requested URL, so a test can serve a different page per `page=` or a map's bytes per download.
 */
export function listFetch(
  reply: (url: string) => { status?: number; json?: unknown; body?: Uint8Array; throws?: boolean }
) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const impl = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const r = reply(url);
    if (r.throws) throw new TypeError('Failed to fetch');
    const body = r.body ?? new TextEncoder().encode(JSON.stringify(r.json ?? {}));
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      body: null, // no stream: exercises the arrayBuffer fallback, as the map download's spec does
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}
