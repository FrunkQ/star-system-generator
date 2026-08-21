/**
 * embedOrigins.ts — the ONE allowlist of parent origins that may drive an embedded SSE2 surface
 * over window.postMessage: the /bridge discovery frame and the /catalogue embed-mode commands.
 *
 * Every inbound message is checked against `event.origin` with this; every outbound reply names
 * the caller's origin as `targetOrigin` — never '*'. Same-origin (SSE2 framing itself, e.g. the
 * preset editor's own preview) is always allowed. Add a host app here when it ships; a wildcard
 * would hand any page that framed us a discovery/command surface.
 * (docs/dev/vtt-integration-design.md 9.2)
 */

const EXACT_ORIGINS = new Set<string>([
  'https://www.mappadux.com',
  'https://mappadux.com',
  'https://beta.mappadux.com',
]);

// Local development of any host app: http(s)://localhost or 127.0.0.1 on any port.
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isAllowedEmbedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  if (typeof window !== 'undefined' && origin === window.location.origin) return true;
  if (EXACT_ORIGINS.has(origin)) return true;
  return DEV_ORIGIN.test(origin);
}
