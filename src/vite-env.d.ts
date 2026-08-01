/// <reference types="vite/client" />

/** Injected from package.json by vite.config.ts. */
declare const __APP_VERSION__: string;

declare module "*.md?raw" {
  const content: string;
  export default content;
}
