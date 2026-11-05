#!/usr/bin/env node
// style.md §1.1: every colour is a token. Fails if a literal colour (hex, rgb(),
// hsl() or a named colour in a colour property) appears outside the generated
// tokens.css. rgba(var(--token-rgb), a) is allowed: the colour is still a token.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function walk(dir) {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(join(root, path)).isDirectory()) return walk(path);
    // tokens.css is generated from design/tokens.json; icons.ts is Lucide markup.
    return /\.(ts|svelte|css)$/.test(name) && !/(^tokens\.css|^icons\.ts)$/.test(name) ? [path] : [];
  });
}
const files = ['index.html', ...walk('src')];

const patterns = [
  { re: /#[0-9a-fA-F]{3,8}\b(?![-\w])/g, what: 'hex colour' },
  { re: /\b(?:rgba?|hsla?)\(\s*\d/g, what: 'literal rgb()/hsl()' },
  { re: /(?:color|background|border(?:-[a-z]+)?|fill|stroke|fillStyle|strokeStyle)\s*[:=]\s*['"]?(?:white|black|red|green|blue|gray|grey)\b/g, what: 'named colour' },
];

// Places a literal is expected: the theme-color meta tag's first-paint value
// (overwritten from --bg-grad-mid at startup), HTML entities and URL fragments.
const allowed = [/<meta name="theme-color" content="#[0-9a-f]+"/, /&#\d+;/, /href="#/];

let failures = 0;
for (const file of files) {
  const lines = readFileSync(join(root, file), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (allowed.some((a) => a.test(line))) return;
    for (const { re, what } of patterns) {
      for (const m of line.matchAll(re)) {
        // Skip sample EPUB content and XML entity-like strings inside template literals.
        if (what === 'hex colour' && /&#|\\u|x[0-9a-f]{2}/i.test(line.slice(Math.max(0, m.index - 2), m.index + 1))) continue;
        failures++;
        console.error(`${file}:${i + 1}: ${what} "${m[0]}"`);
      }
    }
  });
}

if (failures) {
  console.error(`\n${failures} literal colour(s) found. Use a token from design/tokens.json instead.`);
  process.exit(1);
}
console.log(`Colour check passed: no literal colours in ${files.length} files.`);
