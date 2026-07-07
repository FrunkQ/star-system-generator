// Read a user-uploaded image file, downscale it to fit `maxPx` on the long edge, and return a compact
// JPEG data URI — small enough to store on a body/construct and save with the system without bloating
// files or the player broadcast. (Custom artwork is a nicety, not a full-res asset store.)
export function fileToDownscaledDataUrl(file: File, maxPx = 512, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('not an image')); return; }
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height, 1));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const cx = canvas.getContext('2d');
      if (!cx) { reject(new Error('no 2d context')); return; }
      cx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('could not decode image')); };
    img.src = objUrl;
  });
}
