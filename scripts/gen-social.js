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

    // Mosaic mark: fill height keeping aspect, anchored to LEFT edge.
    // If markW > W, keep the LEFT portion of the mark visible (crop the right overflow).
    const markH = H;
    const markW = Math.round(markH * MARK_AR);
    const mark = await sharp(markSvg, { density: 400 })
      .resize({ width: markW, height: markH, fit: 'fill' })
      .png().toBuffer();
    let markComp = mark;
    let mLeft = 0;
    let visibleMarkW = markW;
    if (markW > W) {
      markComp = await sharp(mark).extract({ left: 0, top: 0, width: W, height: H }).png().toBuffer();
      visibleMarkW = W;
    }

    // Wordmark: centered horizontally over the visible mark, vertically in the upper triangles
    // (top quadrant of mark — y range 0..H/2, centered at H/4)
    const wmTargetW = Math.round(Math.min(visibleMarkW * 0.55, W * 0.45));
    const wm = await sharp(wordmarkSvg, { density: 400 })
      .resize({ width: wmTargetW })
      .png().toBuffer();
    const wmMeta = await sharp(wm).metadata();
    const wmLeft = Math.round(mLeft + (visibleMarkW - wmMeta.width) / 2);
    const wmTop = Math.round(H / 4 - wmMeta.height / 2);

    const out = path.join(OUT, `${name}.png`);
    await canvas
      .composite([
        { input: markComp, left: mLeft, top: 0 },
        { input: wm, left: Math.max(0, wmLeft), top: Math.max(0, wmTop) },
      ])
      .png({ compressionLevel: 9 })
      .toFile(out);
    console.log(name, W, H, '→', fs.statSync(out).size);
  }
})();
