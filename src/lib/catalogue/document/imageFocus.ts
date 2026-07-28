// Auto-centre a body photo: find the SUBJECT (the planet/star disc) against the dark space background so
// the document can frame to the body's edge, not the picture's. Space renders sit on near-black, so the
// subject is simply the bright pixels — we take their bounding box. Degrades to null (frame the whole
// picture as before) when the subject fills the frame, is missing, or the image can't be sampled.

// Normalised body box: centre (cx, cy) and half-extents (hx, hy), all fractions of the image w/h in 0..1.
export interface ImageFocus { cx: number; cy: number; hx: number; hy: number; }

export function analyzeImageFocus(img: CanvasImageSource): ImageFocus | null {
  const iw = (img as any).naturalWidth || (img as any).width || 0;
  const ih = (img as any).naturalHeight || (img as any).height || 0;
  if (!iw || !ih || typeof document === 'undefined') return null;
  // Downsample to a small canvas — a bounding box doesn't need full resolution and this keeps it cheap.
  const S = 96;
  const w = Math.max(1, Math.round(S * Math.min(1, iw / ih)));
  const h = Math.max(1, Math.round(S * Math.min(1, ih / iw)));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  let data: Uint8ClampedArray;
  try {
    ctx.drawImage(img, 0, 0, w, h);
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null; // tainted / unreadable — fall back to picture-centred framing
  }
  // A pixel is "subject" if it has meaningful alpha AND is brighter than the dark backdrop.
  const LUMA = 34; // 0..255 threshold above near-black space
  let minX = w, minY = h, maxX = -1, maxY = -1, count = 0;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const a = data[i + 3];
      if (a < 24) continue;
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (luma < LUMA) continue;
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
      count++;
    }
  }
  if (maxX < 0 || count < 8) return null; // no subject found
  const frac = count / (w * h);
  if (frac > 0.93) return null; // subject fills the frame — nothing to re-centre
  const bx0 = minX, by0 = minY, bx1 = maxX + 1, by1 = maxY + 1;
  return {
    cx: (bx0 + bx1) / 2 / w,
    cy: (by0 + by1) / 2 / h,
    hx: (bx1 - bx0) / 2 / w,
    hy: (by1 - by0) / 2 / h
  };
}
