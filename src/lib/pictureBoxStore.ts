// The info-panel picture's SIZE AND FIT, as per-viewer preferences (owner, 2026-08-21: "smaller -
// more letterbox", then "player selectable and hold across all info screens", then "able to grab and
// scale like the sidebar itself... so GM can see the whole image but smaller, or just the centred
// slice"). Persisted per browser, so the GM and each player window hold their own - this is chrome,
// never campaign data and never broadcast (the A10/A3 rule).
//
//   pictureBoxH  - the box height in px, dragged via the grip under the picture; 48px is minimised.
//   pictureFit   - 'slice' crops to the centre band (object-fit: cover); 'whole' letterboxes the
//                  full image smaller (contain). Toggled by the hover icon on the picture.
import { writable } from 'svelte/store';

export type PictureFit = 'slice' | 'whole';
export const PICTURE_MIN_H = 48;
export const PICTURE_MAX_H = 420;
export const PICTURE_DEFAULT_H = 170;

const KEY = 'sse-picture-box';

function load(): { h: number; fit: PictureFit } {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      const h = Math.min(PICTURE_MAX_H, Math.max(PICTURE_MIN_H, Number(p.h) || PICTURE_DEFAULT_H));
      return { h, fit: p.fit === 'whole' ? 'whole' : 'slice' };
    }
  } catch { /* fall through to defaults */ }
  return { h: PICTURE_DEFAULT_H, fit: 'slice' };
}

const first = load();
export const pictureBoxH = writable<number>(first.h);
export const pictureFit = writable<PictureFit>(first.fit);

if (typeof localStorage !== 'undefined') {
  let h = first.h, fit = first.fit;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ h, fit })); } catch { /* private mode */ } };
  pictureBoxH.subscribe((v) => { h = v; save(); });
  pictureFit.subscribe((v) => { fit = v; save(); });
}
