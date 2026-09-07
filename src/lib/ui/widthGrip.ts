// A drag handle that changes a control's WIDTH rather than its place - the undo pill's right edge
// (A98). It follows the floating grip's gesture rules: pointer capture, persist on release, and a
// double-click puts the natural width back. Width 0 means "natural" everywhere it is stored, so a
// control that has never been widened costs nothing to lay out.

export interface WidthGripOptions {
  /** The width now (px), or 0 for the control's natural width. */
  get(): number;
  /** The natural width to start a drag from when the stored width is 0. */
  natural(): number;
  /** Called on every move with `final` false, and once more on release with `final` true. */
  set(width: number, final: boolean): void;
  min: number;
  max: number;
}

export function widthGrip(node: HTMLElement, opts: WidthGripOptions) {
  let dragging = false;
  let startX = 0;
  let base = 0;
  const clamp = (w: number) => Math.round(Math.min(opts.max, Math.max(opts.min, w)));

  const down = (e: PointerEvent) => {
    dragging = true;
    startX = e.clientX;
    base = opts.get() || opts.natural();
    try { node.setPointerCapture(e.pointerId); } catch { /* not capturable - pointermove still fires */ }
    e.preventDefault(); // no text selection while the width is being dragged
  };
  const move = (e: PointerEvent) => {
    if (dragging) opts.set(clamp(base + (e.clientX - startX)), false);
  };
  const up = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    opts.set(clamp(base + (e.clientX - startX)), true);
  };
  const reset = () => opts.set(0, true);

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);
  node.addEventListener('dblclick', reset);
  return {
    destroy() {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      node.removeEventListener('dblclick', reset);
    }
  };
}
