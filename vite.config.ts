/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { cpSync, existsSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

// pdf.js loads CMaps, standard fonts, colour profiles and image decoders by
// URL. Copy them into public/pdfjs/ so they ship with the app and a PDF opens
// offline (style.md §1.7). public/pdfjs/ is generated, not committed.
function pdfAssets(): Plugin {
  return {
    name: 'rosetta-pdfjs-assets',
    buildStart() {
      for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
        const from = `node_modules/pdfjs-dist/${dir}`;
        if (existsSync(from)) cpSync(from, `public/pdfjs/${dir}`, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [pdfAssets(), svelte()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Keep in sync with android.minWebViewVersion in capacitor.config.ts.
    target: ['chrome111', 'safari16'],
    chunkSizeWarningLimit: 1600,
  },
  server: {
    port: 5173,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    // The formats parse XML and HTML with DOMParser, as they do in the app.
    environment: 'jsdom',
    setupFiles: ['tests/unit/setup.ts'],
  },
});
