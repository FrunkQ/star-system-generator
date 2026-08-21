// G16 - THE PICTURE BEHIND THE STARS, and the ONE place its geometry is worked out.
//
// A GM can put their own image behind the starmap: a sector map, empire borders, a hand-drawn chart.
// It attaches one of two ways, and the difference is the whole feature:
//
//   'screen' - DECORATION, attached to the viewport. It holds still while the systems move under it.
//              That is what the shipped Milky Way has always done, and it stays the default.
//   'map'    - GEOREFERENCED. The image is placed IN MAP COORDINATES, so a system sits on the same
//              pixel of the picture at every zoom and pan. Borders drawn on a sector map stay where
//              the GM drew them.
//
// WHY THIS MODULE EXISTS RATHER THAN THE MATHS LIVING ON EACH SURFACE. Four surfaces draw this image
// - the GM 2D map (SVG), the player 2D and 3D starmap (one WebGL scene, flat or tilted) and the
// starmap document - and in map-fixed mode a surface that computes the rectangle even slightly
// differently is not "a bit off", it is showing the player a WRONG MAP. So every surface asks this
// module for the rectangle in MAP COORDINATES and then applies only its own view transform.
//
// MAP UNITS ARE THE CAMPAIGN'S OWN UNIT, never light years by assumption (A43). `widthUnits` is read
// in whatever `campaignUnit()` returns, and `pixelsPerUnit` is the ruler that turns it into the
// coordinate space `system.position.x/y` already live in.
import type { MapBackground, Starmap } from '$lib/types';
import type { PlayerAsset } from '$lib/player/presetTypes';

/** The shipped example: ESO's Milky Way, credited in the About box. */
export const DEFAULT_BACKGROUND_URL = '/images/ui/MilkyWay.jpg';
export const DEFAULT_BACKGROUND_CREDIT = 'ESO/L. Calcada & S. Brunier, CC BY 4.0';
export const DEFAULT_BACKGROUND_SOURCE = 'https://www.eso.org/public/images/eso0932a/';

/** The ruler a campaign with no scale block gets. Matches `applyUnitChange`'s own fallback. */
export const DEFAULT_PIXELS_PER_UNIT = 25;

export const DEFAULT_MAP_BACKGROUND: MapBackground = {
  source: 'default',
  attach: 'screen',
  opacity: 1,
  sizePct: 100,
  widthUnits: 40,
  offsetX: 0,
  offsetY: 0,
  rotationDeg: 0
};

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Fill in every field, so no surface has to guess what an older save left out. */
export function normaliseMapBackground(bg: Partial<MapBackground> | null | undefined): MapBackground {
  const b = { ...DEFAULT_MAP_BACKGROUND, ...(bg ?? {}) };
  return {
    source: b.source === 'none' || b.source === 'asset' ? b.source : 'default',
    assetId: b.assetId,
    attach: b.attach === 'map' ? 'map' : 'screen',
    opacity: clamp(num(b.opacity, 1), 0, 1),
    sizePct: clamp(num(b.sizePct, 100), 5, 100),
    // A width of zero would collapse the image to nothing and read as "the feature is broken"; the
    // control cannot produce it, but a hand-edited save can.
    widthUnits: Math.max(1e-6, num(b.widthUnits, DEFAULT_MAP_BACKGROUND.widthUnits)),
    offsetX: num(b.offsetX, 0),
    offsetY: num(b.offsetY, 0),
    rotationDeg: num(b.rotationDeg, 0)
  };
}

/** The campaign's ruler: map coordinates per campaign distance unit. */
export function backgroundPixelsPerUnit(
  starmap: { scale?: { pixelsPerUnit?: number } | null } | null | undefined
): number {
  const ppu = starmap?.scale?.pixelsPerUnit;
  return typeof ppu === 'number' && ppu > 0 ? ppu : DEFAULT_PIXELS_PER_UNIT;
}

/** A background resolved to something drawable: which URL, how it attaches, and its provenance. */
export interface ResolvedBackground {
  url: string;
  attach: 'screen' | 'map';
  opacity: number;
  sizePct: number;
  bg: MapBackground;
  /** Credit line for the About box and ATTRIBUTIONS.md - null when the GM recorded none. */
  credit: string | null;
  sourceUrl: string | null;
  /** True for the shipped ESO image, which carries its own hardcoded credit. */
  isDefault: boolean;
  /** Human name of an uploaded image, for the About line. */
  name?: string;
  /** Natural pixel size when the asset recorded it; the surface measures the bitmap otherwise. */
  naturalW?: number;
  naturalH?: number;
}

/**
 * What this campaign actually shows behind the stars, or null for nothing.
 *
 * An 'asset' background whose asset has been deleted resolves to NULL rather than silently falling
 * back to the Milky Way: a GM who removed the picture should see it gone, and the About credit must
 * never claim ESO's work for a slot the GM has taken over (DATA-M4 - attribution follows what is
 * displayed, and CC BY 4.0 makes that a licence condition, not a courtesy).
 */
export function resolveMapBackground(
  starmap: { mapBackground?: MapBackground | null } | null | undefined,
  assets: PlayerAsset[] = []
): ResolvedBackground | null {
  const bg = normaliseMapBackground(starmap?.mapBackground);
  if (bg.source === 'none') return null;
  const common = { attach: bg.attach, opacity: bg.opacity, sizePct: bg.sizePct, bg };
  if (bg.source === 'default') {
    return {
      ...common, url: DEFAULT_BACKGROUND_URL, isDefault: true,
      credit: DEFAULT_BACKGROUND_CREDIT, sourceUrl: DEFAULT_BACKGROUND_SOURCE
    };
  }
  const asset = assets.find((a) => a.id === bg.assetId);
  if (!asset) return null;
  return {
    ...common, url: asset.dataUrl, isDefault: false, name: asset.name,
    credit: asset.credit ?? null, sourceUrl: asset.sourceUrl ?? null,
    naturalW: asset.w, naturalH: asset.h
  };
}

/**
 * The image's rectangle IN MAP COORDINATES - the space `system.position.x/y` live in.
 *
 * `aspect` is the bitmap's width/height. Height follows from it rather than being a second control,
 * because a georeferenced picture that can be stretched independently in x and y is one a GM can put
 * permanently out of register without ever seeing a wrong number.
 *
 * `offsetX/offsetY` place the image's CENTRE, in campaign units. Centre rather than a corner so that
 * rotation and a width change both leave the picture where the GM put it.
 */
export interface BackgroundRect {
  cx: number; cy: number;   // centre, in map coordinates
  w: number; h: number;     // size, in map coordinates
  rotationDeg: number;      // clockwise, about the centre, in the SVG sense (map y increases downward)
}

export function backgroundRectMap(bg: MapBackground, aspect: number, pixelsPerUnit: number): BackgroundRect {
  const ppu = pixelsPerUnit > 0 ? pixelsPerUnit : DEFAULT_PIXELS_PER_UNIT;
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const w = bg.widthUnits * ppu;
  return { cx: bg.offsetX * ppu, cy: bg.offsetY * ppu, w, h: w / a, rotationDeg: bg.rotationDeg };
}

/**
 * The rectangle's four corners in map coordinates, clockwise from the image's top-left.
 *
 * Exported because it is what makes rotation TESTABLE - "corners land where the maths says" is an
 * acceptance criterion, and a corner is the only part of a rotated rectangle whose position a test
 * can state without re-deriving the rotation it is checking.
 */
export function backgroundCornersMap(rect: BackgroundRect): Array<{ x: number; y: number }> {
  const t = (rect.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(t), sin = Math.sin(t);
  const hw = rect.w / 2, hh = rect.h / 2;
  // Map y increases DOWNWARD (the SVG convention this map has always used), so a positive angle
  // turns the picture clockwise on screen - the same direction SVG's own rotate() turns it.
  const local: Array<[number, number]> = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  return local.map(([dx, dy]) => ({
    x: rect.cx + dx * cos - dy * sin,
    y: rect.cy + dx * sin + dy * cos
  }));
}

/**
 * Where a MAP POINT falls inside the image, as a 0..1 fraction of its width and height. Outside the
 * picture the numbers simply run past 0..1.
 *
 * This is the registration check in one function: feed it a system's map position and the answer is
 * which pixel of the sector map that system sits on. It is view-independent by construction, which
 * is exactly why every surface can be proved to agree without rendering any of them.
 */
export function mapPointToImageUV(rect: BackgroundRect, x: number, y: number): { u: number; v: number } {
  const t = (-rect.rotationDeg * Math.PI) / 180; // un-rotate about the centre
  const cos = Math.cos(t), sin = Math.sin(t);
  const dx = x - rect.cx, dy = y - rect.cy;
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  return { u: lx / rect.w + 0.5, v: ly / rect.h + 0.5 };
}

/**
 * FOLLOW A RULER CHANGE, so a unit CONVERT does not throw the picture out of register.
 *
 * A43's convert mode rescales `pixelsPerUnit` and leaves every coordinate alone: the map does not
 * move, only what the numbers are called changes. The anchor is stored in UNITS, so it is one of
 * those readings and has to be relabelled the same way - 40 pc wide becomes 130.4 ly wide, and the
 * image covers exactly the same ground. Without this a GM converting ly to pc would find their
 * sector map three times too small, which in map-fixed mode is a wrong map rather than a wrong look.
 *
 * A `relabel` never calls this, by construction: it does not touch `pixelsPerUnit`, so the readings
 * were already right and the picture already sits where it sat.
 */
export function rescaleMapBackgroundForRuler(
  bg: MapBackground | null | undefined,
  oldPixelsPerUnit: number,
  newPixelsPerUnit: number
): MapBackground | undefined {
  if (!bg) return bg ?? undefined;
  if (!(oldPixelsPerUnit > 0) || !(newPixelsPerUnit > 0) || oldPixelsPerUnit === newPixelsPerUnit) return bg;
  const f = oldPixelsPerUnit / newPixelsPerUnit; // map coordinates held constant
  return {
    ...bg,
    widthUnits: bg.widthUnits * f,
    offsetX: bg.offsetX * f,
    offsetY: bg.offsetY * f
  };
}

/**
 * A sensible first anchor for a freshly-chosen image: as wide as the charted systems spread, centred
 * on them. A GM who picks a sector map and sees nothing (because the default 40 units happened to be
 * a hundredth of their map) reads the feature as broken; landing it over the stars gives them
 * something to adjust rather than something to hunt for.
 */
export function suggestAnchor(
  starmap: Starmap | null | undefined
): Pick<MapBackground, 'widthUnits' | 'offsetX' | 'offsetY'> {
  const ppu = backgroundPixelsPerUnit(starmap);
  const systems: any[] = (starmap as any)?.systems ?? [];
  if (!systems.length) {
    return {
      widthUnits: DEFAULT_MAP_BACKGROUND.widthUnits,
      offsetX: DEFAULT_MAP_BACKGROUND.offsetX,
      offsetY: DEFAULT_MAP_BACKGROUND.offsetY
    };
  }
  const xs = systems.map((s) => s?.position?.x ?? 0);
  const ys = systems.map((s) => s?.position?.y ?? 0);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spread = Math.max(maxX - minX, maxY - minY, 1);
  return {
    widthUnits: round2((spread * 1.2) / ppu),
    offsetX: round2((minX + maxX) / 2 / ppu),
    offsetY: round2((minY + maxY) / 2 / ppu)
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;
