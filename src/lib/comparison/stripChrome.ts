// src/lib/comparison/stripChrome.ts
// EVERYTHING THE SIZE COMPARISON SAYS, DRAWN INTO A CANVAS — the labels, the sub-pixel dots, the
// selection and hover rings, and the ruler's reference arcs. It is the ONLY place any of it is
// drawn, and it draws into a 2D context rather than into the DOM.
//
// WHY, and it is a decision the owner took on 2026-07-18 rather than a preference (see
// `docs/dev/v2.2-player-view-visual-overhaul.md` section 7, engine map RENDER-S54): a player's view
// is drawn ONE way — canvas region into a shader — whatever the underlying view is. DOM chrome sits
// in SCREEN space and does not follow a warped, inset projection, so under a barrel-warped CRT
// preset the picture bends and the text laid over it stays straight, and every label drifts off the
// thing it names. Recorded as inbox B126, after two pushes went the wrong way trying to keep it.
//
// AND THE RULER FORCED THE ISSUE. Reference sizes drawn as ARCS concentric with the subject cannot
// be DOM at all without a second geometry engine, so the same change that answers "make the ruler
// more useful" is the one that finishes the retirement.
//
// WHAT IS NOT HERE: the CONTROLS. The header, the order pills, the steppers and the hide menu stay
// as DOM buttons, exactly as the holo keeps `BodyPicker` as DOM — a control is a thing you operate,
// not a thing the picture says, and controls do not have to survive the warp because a tap on one
// is routed by the browser, not by the shader.
//
// UNITS GO THROUGH `units.ts` AND NOWHERE ELSE. `formatPrefValues` is the string counterpart of the
// `UnitValue` component and runs the identical chain (resolveUnitPref -> resolveAutoUnit ->
// unitFromSI -> formatUnitNum -> unitIdLabel), so a size drawn here and the same size shown in a
// panel cannot disagree, and DATA-R20's rule that SIG_FIGS lives in `formatUnitNum` is not restated.
//
// THE UNIT IS NO LONGER CLICKABLE ON THE STRIP, and that is the decision the owner took when this
// was scoped: canvas text cannot be a button, and the alternative — a DOM renderer for the GM and a
// canvas one for the player — is two implementations of one set of labels, which is this codebase's
// most recurring recorded fault. The unit still cycles from every other panel and the strip follows,
// because both read the same `unitPrefs` store.
import { formatPrefValues, type UnitBodyType, type UnitPrefs } from '$lib/units';
import { belowFloorNote, DOT_PX, type LayoutSlot, type ReferenceArc, type StripLayout } from './layout';

/**
 * The subset of `CanvasRenderingContext2D` this module uses. Narrow on purpose: it is what makes the
 * whole thing gateable by handing it a recorder, and it is a shorter list than you would guess.
 */
export interface ChromeCtx {
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath?(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  clearRect(x: number, y: number, w: number, h: number): void;
  setLineDash?(pattern: number[]): void;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  globalAlpha: number;
}

// --- The look, in one table ----------------------------------------------------------------------
// Every one of these is a number a human will want to change after looking at the view, so none of
// them is allowed to sit inline in the drawing code (the standing rule on scattered constants).

export const CHROME = {
  /** The body name. */
  nameFont: '500 12px system-ui, -apple-system, "Segoe UI", sans-serif',
  nameColor: '#e7eefa',
  /** Its size, under the name. */
  sizeFont: '400 10px system-ui, -apple-system, "Segoe UI", sans-serif',
  sizeColor: '#8fa6c4',
  /** The "below 1 px at this scale" note under a dot. */
  floorFont: 'italic 400 10px system-ui, -apple-system, "Segoe UI", sans-serif',
  floorColor: '#6c7d96',
  /** Gap from a body's limb to its label. */
  labelGapPx: 8,
  /** Line height between the name and the size. */
  lineHeightPx: 12,
  /** The sub-pixel marker: a filled dot, never an inflated body (RENDER-S43). */
  dotColor: '#cfe0f5',
  /** The rings. Selection is the map's own gold; hover is the app's blue. */
  selectedColor: 'rgba(255, 214, 120, 0.85)',
  hoverColor: 'rgba(140, 190, 255, 0.55)',
  ringWidthPx: 2,
  /** How far outside a body's limb its ring is drawn, so it never hides the edge being measured. */
  ringOutsetPx: 3,
  /**
   * The ruler's arcs and their labels.
   *
   * SOLID, NOT DASHED, and that is a standing rule rather than a taste: a dash pattern costs the
   * rasteriser per SEGMENT over the whole path, and this view's paths are circles whose radius is
   * whatever the current zoom makes it. Owner, 2026-09-06: *"dashed lines billions of km across kill
   * the renderer"* - the same lesson the starmap's orbit lines already carry (engine map RENDER-S31).
   * A low-alpha hairline reads as a reference mark just as well and costs one stroke.
   */
  arcColor: 'rgba(255, 214, 120, 0.34)',
  arcLabelColor: 'rgba(255, 214, 120, 0.85)',
  arcWidthPx: 1,
  arcFont: '500 10px system-ui, -apple-system, "Segoe UI", sans-serif',
  /** The label sits this far outside the arc it names, along the radius. */
  arcLabelOffsetPx: 7,
  /**
   * Clear space demanded BETWEEN two labels, on top of their own measured widths.
   *
   * The rule is width-aware rather than a flat distance, because the names are not a flat width:
   * "Io" and "Kruger 60 B (DO Cephei)" want very different room, and a fixed gap either lets the
   * long ones collide or throws away the short ones. The far end of a real system is dozens of
   * moons inside a hundred pixels; the layout's alternating sides buy some room and then run out.
   * A name you cannot read is worse than no name, because it also hides the one next to it — and
   * the object is still there, still tappable, and still names itself the moment you scroll to it.
   */
  labelPaddingPx: 10
} as const;

export interface StripChromeSpec {
  layout: StripLayout;
  /** Role and true diameter per id — what the size string needs. From the view's own item map. */
  info: Map<string, { role: string; diameterKm: number }>;
  /** The reference circles to draw, from `referenceArcs`. Empty when the ruler is switched off. */
  arcs: ReferenceArc[];
  scrollPx: number;
  crossScrollPx: number;
  vw: number;
  vh: number;
  axis: 'x' | 'y';
  selectedId: string | null;
  hoveredId: string | null;
  prefs: UnitPrefs | undefined;
}

/** The pref bucket a role reads from. Same mapping the DOM labels used. */
export function bodyTypeOf(role: string): UnitBodyType {
  return role === 'star' ? 'star' : role === 'moon' ? 'moon' : 'planet';
}

/** Where a slot sits on screen, in view px. The one conversion; everything else reads it. */
export function slotScreenPos(
  slot: LayoutSlot, spec: { axis: 'x' | 'y'; scrollPx: number; crossScrollPx: number; vw: number; vh: number }
): { x: number; y: number } {
  const along = slot.centrePx - spec.scrollPx;
  const cross = slot.crossPx - spec.crossScrollPx;
  return spec.axis === 'x'
    ? { x: along, y: spec.vh / 2 + cross }
    : { x: spec.vw / 2 + cross, y: along };
}

/**
 * Draw the whole of the strip's chrome. Clears first: this is the only writer of this canvas.
 *
 * ORDER MATTERS AND IS THE READING ORDER: the ruler's arcs go UNDER everything, because they are a
 * grid rather than a subject; then the dots, then the rings, then the text on top, so a label is
 * never crossed by an arc it did not ask for.
 */
export function drawStripChrome(ctx: ChromeCtx, spec: StripChromeSpec): void {
  ctx.clearRect(0, 0, spec.vw, spec.vh);
  drawArcs(ctx, spec);
  // The last label drawn on each side, so a crowd at the small end thins itself out rather than
  // stacking into a smudge. Per SIDE, because the layout alternates them for exactly this reason and
  // two neighbours on opposite sides do not collide.
  const lastOn: Record<string, { at: number; half: number }> = {
    start: { at: -Infinity, half: 0 }, end: { at: -Infinity, half: 0 }
  };
  ctx.font = CHROME.nameFont;
  for (const slot of spec.layout.slots) {
    const p = slotScreenPos(slot, spec);
    // TWO DIFFERENT QUESTIONS, and answering them with one test was wrong. A body is worth DRAWING
    // marks on if any of it overlaps the window; its LABEL is worth drawing only if the label's own
    // anchor - the body's centre - is in the window. At true scale a star fills the screen from a
    // centre thousands of pixels off it, so the single test drew its name at an invisible point.
    const limit = spec.axis === 'x' ? spec.vw : spec.vh;
    const along = spec.axis === 'x' ? p.x : p.y;
    const overlaps = along > -slot.spanPx && along < limit + slot.spanPx;
    if (!overlaps) continue;
    if (slot.belowFloor) drawDot(ctx, p);
    drawRings(ctx, slot, p, spec);
    const centred = p.x >= 0 && p.x <= spec.vw && p.y >= 0 && p.y <= spec.vh;
    // ...and not on top of the last one on this side. MEASURED, so a long name asks for the room it
    // actually needs. The SELECTED object always gets its name whatever the crowd: it is the one the
    // reader asked about. (On a vertical strip the names stack by LINE HEIGHT rather than by width,
    // so that is what the half-extent means there.)
    const prev = lastOn[slot.labelSide];
    const half = spec.axis === 'x'
      ? ctx.measureText(slot.name).width / 2
      : CHROME.lineHeightPx;
    const room = Math.abs(along - prev.at) >= prev.half + half + CHROME.labelPaddingPx;
    if (centred && (room || slot.id === spec.selectedId)) {
      lastOn[slot.labelSide] = { at: along, half };
      drawLabel(ctx, slot, p, spec);
    }
  }
}

/**
 * THE RULER. Circles of the reference diameters, concentric with the middle of the window — which is
 * where the focused object is, by the focus law — so a reader sees how many Earths fit across the
 * thing they are looking at instead of carrying a pixel count across the screen.
 */
function drawArcs(ctx: ChromeCtx, spec: StripChromeSpec): void {
  if (!spec.arcs.length) return;
  const cx = spec.vw / 2, cy = spec.vh / 2;
  ctx.save();
  ctx.lineWidth = CHROME.arcWidthPx;
  ctx.strokeStyle = CHROME.arcColor;
  for (const a of spec.arcs) {
    ctx.beginPath();
    ctx.arc(cx, cy, a.radiusPx, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.font = CHROME.arcFont;
  ctx.fillStyle = CHROME.arcLabelColor;
  ctx.textBaseline = 'middle';
  for (const a of spec.arcs) {
    // Pushed a little further out along its own radius, so the text sits beside the line rather than
    // on it. The label point is guaranteed inside the window (see `referenceArcs`); the nudge is
    // small enough not to take it out.
    const dx = a.labelX - cx, dy = a.labelY - cy;
    const len = Math.hypot(dx, dy) || 1;
    const x = a.labelX + (dx / len) * CHROME.arcLabelOffsetPx;
    const y = a.labelY + (dy / len) * CHROME.arcLabelOffsetPx;
    // At the TOP of a circle - where these now go by default - the text wants to sit centred over
    // the line rather than starting at it, or every name is offset to one side of the mark it names.
    const nearTop = Math.abs(dx) < len * 0.35;
    ctx.textAlign = nearTop ? 'center' : dx < 0 ? 'right' : 'left';
    ctx.textBaseline = nearTop && dy < 0 ? 'bottom' : 'middle';
    ctx.fillText(a.label, x, y);
  }
  ctx.restore();
}

/** A sub-floor object is a MARKER, never an inflated body: a small disc where the object is. */
function drawDot(ctx: ChromeCtx, p: { x: number; y: number }): void {
  ctx.save();
  ctx.fillStyle = CHROME.dotColor;
  ctx.beginPath();
  ctx.arc(p.x, p.y, DOT_PX / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The selection and hover rings, drawn OUTSIDE the limb so they never hide the edge being measured. */
function drawRings(
  ctx: ChromeCtx, slot: LayoutSlot, p: { x: number; y: number }, spec: StripChromeSpec
): void {
  const selected = slot.id === spec.selectedId;
  const hovered = slot.id === spec.hoveredId;
  if (!selected && !hovered) return;
  ctx.save();
  ctx.lineWidth = CHROME.ringWidthPx;
  ctx.strokeStyle = selected ? CHROME.selectedColor : CHROME.hoverColor;
  ctx.beginPath();
  ctx.arc(p.x, p.y, slot.spanPx / 2 + CHROME.ringOutsetPx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * The name, the true size, and (for a dot) the note saying the marker is not the size.
 *
 * The label sits off the limb on the slot's own `labelSide`, which alternates once the bodies get
 * small enough for two names to collide — the poster's Titania/Rhea rows, decided by the layout law
 * rather than here.
 */
function drawLabel(
  ctx: ChromeCtx, slot: LayoutSlot, p: { x: number; y: number }, spec: StripChromeSpec
): void {
  const item = spec.info.get(slot.id);
  if (!item) return;
  const size = formatPrefValues(spec.prefs, 'radius', bodyTypeOf(item.role), [item.diameterKm]);
  const lines: { text: string; font: string; color: string }[] = [
    { text: slot.name, font: CHROME.nameFont, color: CHROME.nameColor },
    { text: size, font: CHROME.sizeFont, color: CHROME.sizeColor }
  ];
  if (slot.belowFloor) {
    lines.push({ text: belowFloorNote(slot.diameterPx), font: CHROME.floorFont, color: CHROME.floorColor });
  }
  const off = slot.spanPx / 2 + CHROME.labelGapPx;
  ctx.save();
  if (spec.axis === 'x') {
    // Under the body, or over it on the alternating side. `textBaseline` differs so that both sides
    // clear the limb by the same gap rather than by the same anchor.
    ctx.textAlign = 'center';
    const down = slot.labelSide === 'start';
    ctx.textBaseline = down ? 'top' : 'bottom';
    let y = p.y + (down ? off : -off);
    for (const l of lines) {
      ctx.font = l.font;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, p.x, y);
      y += down ? CHROME.lineHeightPx : -CHROME.lineHeightPx;
    }
  } else {
    // The phone's vertical strip: beside the body, reading outward from the centreline.
    const right = slot.labelSide === 'start';
    ctx.textAlign = right ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    const x = p.x + (right ? off : -off);
    let y = p.y - ((lines.length - 1) * CHROME.lineHeightPx) / 2;
    for (const l of lines) {
      ctx.font = l.font;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, x, y);
      y += CHROME.lineHeightPx;
    }
  }
  ctx.restore();
}
