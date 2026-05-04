const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'social');
fs.mkdirSync(OUT, { recursive: true });

const heroPath = path.join(ROOT, 'assets', 'hero.webp');
const wordmarkSvg = fs.readFileSync(path.join(ROOT, 'assets', 'logo-wordmark-white.svg'));

// hero.webp full size and focal box (user-specified)
const HERO_W = 1800;
const HERO_H = 1130;
const FOCAL_W = 1289;
const FOCAL_H = 843;
// Focal center: top-left region of hero (where mark+wordmark sit in source)
const FOCAL_CX = FOCAL_W / 2;
const FOCAL_CY = FOCAL_H / 2;

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
    // Scale hero so the focal box covers the output canvas, then crop so focal-center
    // sits at canvas-center. Clamp crop within hero bounds.
    const scale = Math.max(W / FOCAL_W, H / FOCAL_H);
    const scaledW = Math.round(HERO_W * scale);
    const scaledH = Math.round(HERO_H * scale);
    const focalCxS = FOCAL_CX * scale;
    const focalCyS = FOCAL_CY * scale;
    let cropLeft = Math.round(focalCxS - W / 2);
    let cropTop = Math.round(focalCyS - H / 2);
    cropLeft = Math.max(0, Math.min(scaledW - W, cropLeft));
    cropTop = Math.max(0, Math.min(scaledH - H, cropTop));

    const heroBg = await sharp(heroPath)
      .resize({ width: scaledW, height: scaledH, fit: 'fill' })
      .extract({ left: cropLeft, top: cropTop, width: W, height: H })
      .png().toBuffer();

    // Wordmark: centered horizontally, placed in upper third of canvas
    const wmTargetW = Math.round(Math.min(W * 0.45, H * 0.6));
    const wm = await sharp(wordmarkSvg, { density: 400 })
      .resize({ width: wmTargetW })
      .png().toBuffer();
    const wmMeta = await sharp(wm).metadata();
    const wmLeft = Math.round((W - wmMeta.width) / 2);
    const wmTop = Math.round(H / 4 - wmMeta.height / 2);

    const out = path.join(OUT, `${name}.png`);
    await sharp(heroBg)
      .composite([
        { input: wm, left: Math.max(8, wmLeft), top: Math.max(8, wmTop) },
      ])
      .png({ compressionLevel: 9 })
      .toFile(out);
    console.log(name, W, H, '→', fs.statSync(out).size);
  }
})();
