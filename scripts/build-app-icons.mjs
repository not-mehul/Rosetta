#!/usr/bin/env node
// Draws Rosetta's app icon and splash screens: a serif "R" in amber inside a
// 1px hairline frame, on Dusk's --bg-grad-mid (style.md §14).
//
//   npm run assets
//
// Colours come from the dusk-dawn package's tokens.json. The R is Fraunces (opsz 72, wght 400),
// the UI's own serif, outlined once so the drawing doesn't depend on the
// fonts installed where this runs.

import { mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(fileURLToPath(import.meta.resolve('dusk-dawn/tokens.json')), 'utf8')).color;
const BG = tokens['bg-grad-mid'].dusk;
const AMBER = tokens['accent-amber'].dusk;

// Fraunces "R", units per em 2000; bounds x 93…1360, y 0…1400 (y up).
const C = 'M1227.9 920.8Q1227.9 821.3 1184.6 741.5Q1141.2 661.7 1062.3 609.3Q983.5 557 875.4 537.7Q848.8 533.3 823.7 528.8Q798.6 524.4 773 521.5Q747.4 518.7 718.2 518.7Q651.3 518.7 592.2 527.7Q533.2 536.7 484.6 554.5Q436 572.3 399.9 598.6L408.2 644.5Q440.4 620.3 483.4 604.6Q526.3 588.9 575.4 581.4Q624.6 574 674.5 574Q825.8 574 913.4 662Q1000.9 750 1000.9 918.6Q1000.9 1044.3 947.5 1141.8Q894.1 1239.3 797.6 1295.1Q701.1 1351 572.2 1351H460.6V105.2Q460.6 85.9 470.7 75.2Q480.7 64.4 501.4 59.9L592.2 47.1Q606.4 43.4 611.8 37.6Q617.2 31.8 617.2 22.2Q617.2 0 587 0H123.6Q108.1 0 100.7 6.3Q93.4 12.5 93.4 22.2Q93.4 41 118.4 47.1L196.9 59.9Q218.5 64.5 229.2 75.2Q239.9 85.9 239.9 105.2V1298.9Q239.9 1315.9 229.1 1325.9Q218.3 1335.9 196.9 1340.1L118.4 1352.9Q93.4 1359 93.4 1377.8Q93.4 1388.3 100.7 1394.1Q108.1 1400 123.6 1400H575.9Q784.3 1400 929.8 1339.3Q1075.3 1278.5 1151.6 1170.5Q1227.9 1062.5 1227.9 920.8ZM719.1 543.9 932.6 569.2 1217.2 117.8Q1238.8 84.1 1263.6 69.8Q1288.4 55.5 1324.4 47.9Q1345.7 42.9 1352.7 37.4Q1359.8 31.8 1359.8 22.2Q1359.8 12.5 1351.9 6.3Q1344 0 1328.2 0H933.2Q902.9 0 902.9 22.2Q902.9 29.7 908 34.2Q913.1 38.7 923.6 42.1L967.9 49.5Q991 56 994.3 70.9Q997.6 85.7 981.5 112.5Z';
const C_BOX = { x: 93, y: 0, w: 1266, h: 1400 };

/**
 * An SVG of the mark: the R, `glyph` tall, centred in a size × size square;
 * the frame sits `inset` in from the edge. `stroke` is the hairline in px.
 */
function mark(size, { glyph, inset, stroke = 1, background = true, round = 0 }) {
  const scale = glyph / C_BOX.h;
  const tx = (size - C_BOX.w * scale) / 2 - C_BOX.x * scale;
  // Font units have y up: flip, then place the glyph's top at the centre minus half its height.
  const ty = (size + C_BOX.h * scale) / 2 + C_BOX.y * scale;
  const frame = inset > 0 ? `<rect x="${inset + stroke / 2}" y="${inset + stroke / 2}" width="${size - 2 * inset - stroke}" height="${size - 2 * inset - stroke}" fill="none" stroke="${AMBER}" stroke-opacity="0.6" stroke-width="${stroke}" rx="${round}"/>` : '';
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${background ? `<rect width="${size}" height="${size}" fill="${BG}"/>` : ''}
${frame}
<path d="${C}" fill="${AMBER}" transform="translate(${tx} ${ty}) scale(${scale} ${-scale})"/>
</svg>`);
}

const png = (svg, file) => {
  mkdirSync(dirname(file), { recursive: true });
  return sharp(svg).png().toFile(file);
};

const jobs = [];
const res = join(root, 'android/app/src/main/res');
if (existsSync(res)) {
  // Legacy and round icons (48dp) and the adaptive foreground (108dp, 72dp safe zone).
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, d] of Object.entries(densities)) {
    const s = Math.round(48 * d);
    const icon = mark(s, { glyph: s * 0.5, inset: s * 0.12, stroke: Math.max(1, d) });
    jobs.push(png(icon, join(res, `mipmap-${name}/ic_launcher.png`)), png(icon, join(res, `mipmap-${name}/ic_launcher_round.png`)));
    const f = Math.round(108 * d);
    jobs.push(png(mark(f, { glyph: f * 0.32, inset: f * 0.27, stroke: Math.max(1, d), background: false }), join(res, `mipmap-${name}/ic_launcher_foreground.png`)));
  }
  // Splash screens: every size the template ships, the mark at a quarter of the short side.
  for (const dir of readdirSync(res).filter((d) => d.startsWith('drawable'))) {
    const file = join(res, dir, 'splash.png');
    if (!existsSync(file)) continue;
    jobs.push(
      sharp(file)
        .metadata()
        .then(async ({ width, height }) => {
          const side = Math.round(Math.min(width, height) * 0.28);
          const logo = await sharp(mark(side, { glyph: side * 0.5, inset: side * 0.1, stroke: Math.max(1, Math.round(side / 240)) })).png().toBuffer();
          return sharp({ create: { width, height, channels: 3, background: BG } })
            .composite([{ input: logo, gravity: 'centre' }])
            .png()
            .toFile(file);
        }),
    );
  }
}

const ios = join(root, 'ios/App/App/Assets.xcassets');
if (existsSync(ios)) {
  jobs.push(png(mark(1024, { glyph: 512, inset: 124, stroke: 3 }), join(ios, 'AppIcon.appiconset/AppIcon-512@2x.png')));
  const logo = await sharp(mark(640, { glyph: 320, inset: 64, stroke: 3 })).png().toBuffer();
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    jobs.push(sharp({ create: { width: 2732, height: 2732, channels: 3, background: BG } }).composite([{ input: logo, gravity: 'centre' }]).png().toFile(join(ios, 'Splash.imageset', name)));
  }
}

jobs.push(png(mark(512, { glyph: 256, inset: 48, stroke: 2, round: 8 }), join(root, 'public/icon-512.png')));
await Promise.all(jobs);
console.log(`Wrote ${jobs.length} images.`);
