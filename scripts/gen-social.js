const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'social');
fs.mkdirSync(OUT, { recursive: true });

const mark = fs.readFileSync(path.join(ROOT, 'assets', 'logo-mark.svg'));
const wordmark = fs.readFileSync(path.join(ROOT, 'assets', 'logo-wordmark-white.svg'));

const specs = [
  ['linkedin-company-banner', 1128, 191],
  ['linkedin-personal-banner', 1584, 396],
  ['linkedin-square', 1200, 1200],
  ['linkedin-portrait', 1080, 1350],
  ['og-share', 1200, 630],
  ['x-profile-banner', 1500, 500],
  ['x-instream', 1600, 900],
  ['facebook-cover', 820, 312],
  ['instagram-square', 1080, 1080],
  ['instagram-story', 1080, 1920],
  ['youtube-channel', 2560, 1440],
  ['youtube-thumbnail', 1280, 720],
];

(async () => {
  for (const [name, W, H] of specs) {
    const bg = await sharp(mark, { density: 300 })
      .resize({ width: W, height: H, fit: 'fill' })
      .png().toBuffer();
    const wmW = Math.round(Math.min(W * 0.5, H * 1.4));
    const wm = await sharp(wordmark, { density: 300 })
      .resize({ width: wmW })
      .png().toBuffer();
    const out = path.join(OUT, `${name}.png`);
    await sharp(bg).composite([{ input: wm, gravity: 'center' }]).png({ compressionLevel: 9 }).toFile(out);
    console.log(name, W, H, '→', fs.statSync(out).size);
  }
})();
