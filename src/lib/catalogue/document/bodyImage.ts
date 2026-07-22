// Shared loader for a body's photo (the `image.url` on a node) — used by the Document view and the
// 2D/3D info panel so the same-origin rule and the auto-centre focus analysis live in ONE place.
// Same-origin only (data: URLs, app-relative paths, or this origin): a cross-origin image would taint
// the WebGL surface the filter reads from.
import type { System } from '$lib/types';
import { analyzeImageFocus, type ImageFocus } from './imageFocus';

export interface LoadedBodyImage { img: CanvasImageSource; aspect: number; focus: ImageFocus | null }

export function loadBodyImage(
  system: System | null,
  id: string,
  cb: (loaded: LoadedBodyImage | null) => void
): void {
  const n: any = (system?.nodes ?? []).find((x) => x.id === id);
  const url: string | undefined = n?.image?.url;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const sameOrigin = !!url && (url.startsWith('data:') || url.startsWith('/') || (!!origin && url.startsWith(origin)));
  if (!sameOrigin) { cb(null); return; }
  const im = new Image();
  im.onload = () => cb({
    img: im,
    aspect: (im.naturalWidth || 1) / (im.naturalHeight || 1),
    focus: analyzeImageFocus(im) // auto-centre: frame to the body's edge, not the picture's
  });
  im.onerror = () => cb(null);
  im.src = url!;
}
