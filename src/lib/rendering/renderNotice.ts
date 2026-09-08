// THE ONE LINE A 3D SURFACE CAN PUT IN FRONT OF WHOEVER IS LOOKING.
//
// C20. Two different things now need to say something over a 3D view, and they are the same KIND of
// thing to the person reading it - "the picture is not what you expected, here is why and here is
// what to do":
//
//   * the render path (job 2): this browser is drawing on the processor, low power is on;
//   * a lost context (job 3): the browser took this view's graphics context back.
//
// They get ONE channel, not one each. Two stores would mean two boxes able to appear at once over
// the same canvas, and every host would have to know about both - which is how the notice ends up
// written into each host separately and drifting, the fault this codebase keeps paying for. The
// hosts (`HoloView`, `SizeComparisonView`) render `RenderNotice` bound to this and know nothing
// about who wrote it.
//
// LAST WRITER WINS, deliberately: these are rare, and the most recent thing to go wrong is the one
// worth reading. A lost context after a software-rendering warning is a bigger fact than the warning.

import { writable } from 'svelte/store';

/** The sentence to show over a 3D view, or null. Session-only; never persisted. */
export const renderNotice = writable<string | null>(null);

/** Say something. A null clears it. */
export function setRenderNotice(message: string | null): void {
	renderNotice.set(message);
}

/** The reader has read it. Nothing brings it back on its own. */
export function dismissRenderNotice(): void {
	renderNotice.set(null);
}
