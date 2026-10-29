/// <reference types="vite/client" />

// package.json version, injected by `define` in vite.config.ts
declare const __APP_VERSION__: string;

// Each locale catalog's native `name`, by language code, injected by `define` in vite.config.ts
declare const __LANGUAGE_NAMES__: Record<string, string>;
