const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'social');
fs.mkdirSync(OUT, { recursive: true });

const markSvg = fs.readFileSync(path.join(ROOT, 'assets', 'logo-mark.svg'));
const wordmarkSvg = fs.readFileSync(path.join(ROOT, 'assets', 'logo-wordmark-white.svg'));

// Source mark dimensions (from viewBox)
const MARK_W = 966;
const MARK_H = 575;
const MARK_AR = MARK_W / MARK_H;

const NAVY = { r: 0x1c, g: 0x2e, b: 0x3f };

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
    // Canvas: solid navy
    const canvas = sharp({
      create: { width: W, height: H, channels: 4, background: { ...NAVY, alpha: 1 } }
    });

    // Mosaic mark: fill height keeping aspect, anchored to right edge
    const markH = H;
    const markW = Math.round(markH * MARK_AR);
    const mark = await sharp(markSvg, { density: 400 })
      .resize({ width: markW, height: markH, fit: 'fill' })
      .png().toBuffer();
    const markLeft = W - markW; // could be negative; sharp clips automatically? Use extract or position via top/left with negative — sharp doesn't accept negative.
    // For wide banners markW > W is rare (only when H very tall vs W); for tall banners markW < W so markLeft > 0
    // Need handling: if markW > W, crop the mark from its right side to width W
    let markComp = mark;
    let mLeft = markLeft;
    let mTop = 0;
    if (markLeft < 0) {
      // Crop mark so its rightmost W pixels remain
      markComp = await sharp(mark).extract({ left: -markLeft, top: 0, width: W, height: H }).png().toBuffer();
      mLeft = 0;
    }

    // Wordmark: top-left, sized relative to canvas height
    const wmH = Math.round(Math.min(H * 0.18, W * 0.10));
    const wm = await sharp(wordmarkSvg, { density: 400 })
      .resize({ height: wmH })
      .png().toBuffer();
    const wmMeta = await sharp(wm).metadata();
    const padX = Math.round(Math.min(W, H) * 0.05);
    const padY = padX;

    const out = path.join(OUT, `${name}.png`);
    await canvas
      .composite([
        { input: markComp, left: mLeft, top: mTop },
        { input: wm, left: padX, top: padY },
      ])
      .png({ compressionLevel: 9 })
      .toFile(out);
    console.log(name, W, H, '→', fs.statSync(out).size);
  }
})();
