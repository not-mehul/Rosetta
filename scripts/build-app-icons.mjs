#!/usr/bin/env node
// Draws Rosetta's app icon and splash screens: an open book, its right page
// lit as if by a reading lamp, a ribbon at the place, as a Lucide-style line
// mark in amber inside a 1px hairline frame, on Dusk's --bg-grad-mid
// (style.md §14). Android also gets a one-colour layer for themed icons, and
// the status-bar icon is the same book in white.
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

// The book, on a 24 × 24 grid. Each page rises from the spine and levels off,
// its outer corners softened; the right page carries the light and the ribbon.
const LEFT = 'M12 8.4C10 6.5 7.4 5.8 4.4 6.1a1 1 0 0 0-.9 1v10.3a.8.8 0 0 0 .9.8c3-.3 5.6.4 7.6 2.3';
const RIGHT = 'M12 8.4c2-1.9 4.6-2.6 7.6-2.3a1 1 0 0 1 .9 1v10.3a.8.8 0 0 1-.9.8c-3-.3-5.6.4-7.6 2.3';
const SPINE = 'M12 8.4v12.4';
const RIBBON = 'M15.2 6.1h2.7v6.3l-1.35-1.1-1.35 1.1z';
/** The book's stroke on the 24-unit grid. */
const STROKE = 1.15;

/** The book in one colour: the outline, the ribbon solid, the lit page a light tint. */
function book(colour, { light = true } = {}) {
  return `<defs><linearGradient id="lamp" x1="12" y1="6" x2="20.5" y2="20" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${colour}" stop-opacity="0.42"/><stop offset="1" stop-color="${colour}" stop-opacity="0.12"/></linearGradient></defs>${light ? `<path d="${RIGHT}z" fill="url(#lamp)"/>` : ''}<path d="${LEFT}"/><path d="${RIGHT}"/><path d="${SPINE}"/><path d="${RIBBON}" fill="${colour}" stroke="none"/>`;
}

/**
 * An SVG of the mark: the book, `glyph` tall, centred in a size × size
 * square; the frame sits `inset` in from the edge. `stroke` is the frame's hairline in px.
 */
function mark(size, { glyph, inset, stroke = 1, background = true, colour = AMBER, light = true }) {
  const scale = glyph / 24;
  const offset = (size - glyph) / 2;
  const frame = inset > 0 ? `<rect x="${inset + stroke / 2}" y="${inset + stroke / 2}" width="${size - 2 * inset - stroke}" height="${size - 2 * inset - stroke}" fill="none" stroke="${colour}" stroke-opacity="0.6" stroke-width="${stroke}"/>` : '';
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${background ? `<rect width="${size}" height="${size}" fill="${BG}"/>` : ''}
${frame}
<g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="${colour}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">
${book(colour, { light })}
</g>
</svg>`);
}

/** The browser tab's icon: the same mark on a rounded square. */
function favicon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${BG}"/><rect x="6.5" y="6.5" width="51" height="51" rx="7" fill="none" stroke="${AMBER}" stroke-opacity=".55"/><g transform="translate(11 11) scale(1.75)" fill="none" stroke="${AMBER}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${book(AMBER)}</g></svg>\n`;
}

/** The status-bar icon (reminders): the book in white on clear, as Android wants, as a vector. */
function statusIcon() {
  const path = (d, fill = false) =>
    fill
      ? `    <path android:fillColor="#FFFFFFFF" android:pathData="${d}" />`
      : `    <path android:fillColor="#00000000" android:strokeColor="#FFFFFFFF" android:strokeWidth="1.6" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="${d}" />`;
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- The reading-reminder notification's icon: Rosetta's book, white on clear
     as Android's status bar wants; tinted by iconColor in capacitor.config.ts.
     Drawn by npm run assets (scripts/build-app-icons.mjs). -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
${[path(LEFT), path(RIGHT), path(SPINE), path(RIBBON, true)].join('\n')}
</vector>
`;
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
    // Themed icons (Android 13+) tint this one-colour layer to the wallpaper: the book alone, no light, no frame.
    jobs.push(png(mark(f, { glyph: f * 0.44, inset: 0, background: false, colour: '#ffffff', light: false }), join(res, `mipmap-${name}/ic_launcher_monochrome.png`)));
  }
  writeFileSync(join(res, 'drawable/ic_stat_rosetta.xml'), statusIcon());
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

writeFileSync(join(root, 'public/favicon.svg'), favicon());
await Promise.all(jobs);
console.log(`Wrote ${jobs.length} images.`);
