import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.notmehul.rosetta',
  appName: 'Rosetta',
  webDir: 'dist',
  // WebView background before the page paints: Dusk's --bg-grad-mid.
  backgroundColor: '#0f0d0b',
  android: {
    allowMixedContent: false,
    // Android System WebView updates through the Play Store; 111 (early 2023)
    // covers 100dvh, crypto.randomUUID, createImageBitmap and the rest of what
    // the UI and pdf.js's legacy build use. Keep in sync with build.target in vite.config.ts.
    minWebViewVersion: 111,
  },
  plugins: {
    SystemBars: {
      // index.html opts into edge-to-edge with viewport-fit=cover; the CSS
      // pads the layout with the --inset-* variables (components.css).
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      // Follow the system until src/platform/theme.svelte.ts applies the user's theme.
      style: 'DEFAULT',
    },
    SplashScreen: {
      // Dusk's --bg-grad-mid behind the serif R; hidden by main.ts after the first paint.
      launchAutoHide: false,
      backgroundColor: '#0f0d0b',
      showSpinner: false,
    },
  },
};

export default config;
