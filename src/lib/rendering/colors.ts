import type { CelestialBody, SystemNode } from "../types";
import { browser } from "$app/environment";
import { paletteOverrides, resolveToken } from "$lib/styles/paletteStore";

// Canonical body/star colours. Each entry is [css-token, default-hex]. The default hexes
// are the historical values, so nothing changes visually; reading them through the token
// system means the orrery / starmap / planner re-skin live when a colour is edited on the
// /palette settings page (and makes colour-blind presets possible). The values are cached
// and only re-resolved when the palette overrides change (canvas render loops call these
// per-node per-frame, so we must not hit getComputedStyle each time).

const STAR_DEFS: Record<string, [string, string]> = {
  O: ['--star-o', '#9bb0ff'],
  B: ['--star-b', '#aabfff'],
  A: ['--star-a', '#cad8ff'],
  F: ['--star-f', '#f8f7ff'],
  G: ['--star-g', '#fff4ea'],
  K: ['--star-k', '#ffd2a1'],
  M: ['--star-m', '#ffc46f'],
  L: ['--star-l', '#8a4a4a'],
  T: ['--star-t', '#4a2a2a'],
  Y: ['--star-y', '#2a1a1a'],
  'brown-dwarf': ['--body-brown-dwarf', '#5d4037'],
  WD: ['--star-wd', '#f0f0f0'],
  NS: ['--star-ns', '#c0c0ff'],
  magnetar: ['--star-magnetar', '#800080'],
  BH: ['--star-bh', '#000000'],
  BH_active: ['--star-bh', '#000000'],
  'red-giant': ['--star-red-giant', '#8b0000'],
  default: ['', '#ffffff']
};

const BODY_DEFS: Record<string, [string, string]> = {
  terrestrial: ['--body-terrestrial', '#cc6600'],
  gasGiant: ['--body-gas-giant', '#cc0000'],
  iceGiant: ['--body-ice-giant', '#add8e6'],
  brownDwarf: ['--body-brown-dwarf', '#5d4037'],
  habitable: ['--body-habitable', '#007bff'],
  biosphere: ['--body-biosphere', '#00ff00'],
  belt: ['--body-belt', '#888888'],
  construct: ['--body-construct', '#f0f0f0']
};

// Resolve a node's star colour key. Star classes come as either a single letter
// ("star/G") or a full spectral class ("star/G2V") or a named remnant ("star/red-giant",
// "star/WD", "star/BH"). Try an exact key, then the BH family, then the leading letter.
function starKey(node: { classes?: string[] }): string {
  const raw = (node.classes?.[0] || '').split('/')[1] || '';
  if (!raw) return 'default';
  if (STAR_DEFS[raw]) return raw;
  if (raw.includes('BH')) return 'BH';
  if (STAR_DEFS[raw[0]]) return raw[0];
  return 'default';
}

// Static default map kept for back-compat with direct importers (BodyStarTab swatch,
// SystemVisualizer). Not token-live; the live path is getPlanetColor/getNodeColor.
export const STAR_COLOR_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(STAR_DEFS).map(([k, [, hex]]) => [k, hex])
);

let _cache: { star: Record<string, string>; body: Record<string, string> } | null = null;
function pal() {
  if (!_cache) {
    _cache = {
      star: Object.fromEntries(
        Object.entries(STAR_DEFS).map(([k, [tok, hex]]) => [k, tok ? resolveToken(tok, hex) : hex])
      ),
      body: Object.fromEntries(
        Object.entries(BODY_DEFS).map(([k, [tok, hex]]) => [k, resolveToken(tok, hex)])
      )
    };
  }
  return _cache;
}
// Re-resolve colours when the user edits the palette.
if (browser) paletteOverrides.subscribe(() => { _cache = null; });

/**
 * Returns the primary visual color for a celestial body based on its type and tags.
 */
export function getPlanetColor(node: CelestialBody): string {
  const p = pal();
  if (node.roleHint === 'star') {
    return p.star[starKey(node)] || p.star['default'];
  }
  if (node.roleHint === 'belt') return p.body.belt;
  if (node.tags?.some(t => t.key === 'habitability/earth-like' || t.key === 'habitability/human')) return p.body.habitable;
  if (node.biosphere) return p.body.biosphere;
  if (node.classes?.some(c => c.includes('brown-dwarf'))) return p.body.brownDwarf;
  if (node.classes?.some(c => c.includes('ice-giant'))) return p.body.iceGiant;
  if (node.classes?.some(c => c.includes('gas-giant'))) return p.body.gasGiant;
  return p.body.terrestrial;
}

/**
 * Returns the visual color for any system node (body or construct).
 */
export function getNodeColor(node: SystemNode): string {
  if (node.kind === 'construct') {
    return node.icon_color || pal().body.construct;
  } else if (node.kind === 'body') {
    return getPlanetColor(node as CelestialBody);
  }
  return '#ffffff';
}
