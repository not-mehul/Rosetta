#!/usr/bin/env node
// Draws Rosetta's app icon and splash screens: the Rosetta Stone as a
// Lucide-style line mark (a broken tablet carrying its three scripts: signs,
// a running hand, and lines of Greek) in amber inside a 1px hairline frame, on
// Dusk's --bg-grad-mid (style.md §14).
//
//   npm run assets
//
// Colours come from the dusk-dawn package's tokens.json. The mark is drawn on
// Lucide's 24-unit grid with round caps and joins, the same as the UI's icons.

import { mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(fileURLToPath(import.meta.resolve('dusk-dawn/tokens.json')), 'utf8')).color;
const BG = tokens['bg-grad-mid'].dusk;
const AMBER = tokens['accent-amber'].dusk;

// The stone, on a 24 × 24 grid: the tablet with its broken top, then the three bands of script.
const STONE = [
  'M5 20.5V8.2l2.2-2.6 2.4.9 2.6-3 3.1 1.6 3.7-1.2v16.6z',
  'M9.35 10.2a.95.95 0 1 1-1.9 0a.95.95 0 1 1 1.9 0z',
  'M10.6 11.1l1.15-2.1 1.15 2.1z',
  'M14.4 9.2v1.9M15.9 9.2v1.9',
  'M7.5 13.9c.7-.8 1.4-.8 2.1 0s1.4.8 2.1 0 1.4-.8 2.1 0 1.4.8 2.1 0',
  'M7.5 16.7h8.5',
  'M7.5 18.6h5.2',
];
/** The stone's stroke on the 24-unit grid. */
const STONE_STROKE = 1.1;

/**
 * An SVG of the mark: the stone, `glyph` tall, centred in a size × size
 * square; the frame sits `inset` in from the edge. `stroke` is the frame's hairline in px.
 */
function mark(size, { glyph, inset, stroke = 1, background = true, round = 0 }) {
  const scale = glyph / 24;
  const offset = (size - glyph) / 2;
  const frame = inset > 0 ? `<rect x="${inset + stroke / 2}" y="${inset + stroke / 2}" width="${size - 2 * inset - stroke}" height="${size - 2 * inset - stroke}" fill="none" stroke="${AMBER}" stroke-opacity="0.6" stroke-width="${stroke}" rx="${round}"/>` : '';
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${background ? `<rect width="${size}" height="${size}" fill="${BG}"/>` : ''}
${frame}
<g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="${AMBER}" stroke-width="${STONE_STROKE}" stroke-linecap="round" stroke-linejoin="round">
${STONE.map((d) => `<path d="${d}"/>`).join('\n')}
</g>
</svg>`);
}

/** The browser tab's icon: the same mark on a rounded square. */
function favicon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${BG}"/><rect x="6.5" y="6.5" width="51" height="51" rx="7" fill="none" stroke="${AMBER}" stroke-opacity=".55"/><g transform="translate(11 11) scale(1.75)" fill="none" stroke="${AMBER}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${STONE.map((d) => `<path d="${d}"/>`).join('')}</g></svg>\n`;
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
    const icon = mark(s, { glyph: s * 0.62, inset: s * 0.12, stroke: Math.max(1, d) });
    jobs.push(png(icon, join(res, `mipmap-${name}/ic_launcher.png`)), png(icon, join(res, `mipmap-${name}/ic_launcher_round.png`)));
    const f = Math.round(108 * d);
    jobs.push(png(mark(f, { glyph: f * 0.44, inset: f * 0.27, stroke: Math.max(1, d), background: false }), join(res, `mipmap-${name}/ic_launcher_foreground.png`)));
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
          const logo = await sharp(mark(side, { glyph: side * 0.7, inset: side * 0.1, stroke: Math.max(1, Math.round(side / 240)) })).png().toBuffer();
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
  jobs.push(png(mark(1024, { glyph: 700, inset: 124, stroke: 3 }), join(ios, 'AppIcon.appiconset/AppIcon-512@2x.png')));
  const logo = await sharp(mark(640, { glyph: 440, inset: 64, stroke: 3 })).png().toBuffer();
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    jobs.push(sharp({ create: { width: 2732, height: 2732, channels: 3, background: BG } }).composite([{ input: logo, gravity: 'centre' }]).png().toFile(join(ios, 'Splash.imageset', name)));
  }
}

jobs.push(png(mark(512, { glyph: 360, inset: 48, stroke: 2, round: 8 }), join(root, 'public/icon-512.png')));
writeFileSync(join(root, 'public/favicon.svg'), favicon());
await Promise.all(jobs);
console.log(`Wrote ${jobs.length} images.`);
