// Generate small WebP thumbnails for the planet-type images used in the "add by type"
// picker. The originals (static/images/planet_types/*.jpg) are ~0.5-0.8 MB each and were
// being rendered into 80px circles — 41 MB of full-res art for a thumbnail grid. We emit
// 128px WebP thumbs (~3-6 KB each) into a thumbs/ subfolder; the picker points at those via
// thumbUrl() and the big body image keeps the full-res original.
//
//   node scripts/gen-thumbs.cjs
//
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'static', 'images', 'planet_types');
const OUT = path.join(SRC, 'thumbs');
const SIZE = 128;

(async () => {
  if (!fs.existsSync(SRC)) { console.error('No source dir', SRC); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs.readdirSync(SRC).filter((f) => /\.(jpe?g|png)$/i.test(f));
  let total = 0, bytesIn = 0, bytesOut = 0;
  for (const f of files) {
    const inPath = path.join(SRC, f);
    const outPath = path.join(OUT, f.replace(/\.(jpe?g|png)$/i, '.webp'));
    await sharp(inPath)
      .resize(SIZE, SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: 72 })
      .toFile(outPath);
    bytesIn += fs.statSync(inPath).size;
    bytesOut += fs.statSync(outPath).size;
    total++;
  }
  const kb = (n) => Math.round(n / 1024);
  console.log(`Wrote ${total} thumbs → ${OUT}`);
  console.log(`  ${kb(bytesIn)} KB original  →  ${kb(bytesOut)} KB thumbs  (${(100 * bytesOut / bytesIn).toFixed(1)}%)`);
})();
