/// <reference types="svelte" />
/// <reference types="vite/client" />

/** package.json version, injected by vite.config.ts. */
declare const __APP_VERSION__: string;


/** mammoth's prebuilt browser bundle has the same API as the package. */
declare module 'mammoth/mammoth.browser.js' {
  import mammoth from 'mammoth';
  export default mammoth;
}
