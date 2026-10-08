// Filled in by Vite's `define` at build time from Vercel's system environment
// variables. Both are empty outside Vercel, e.g. in local development.
declare const __COMMIT_SHA__: string;
declare const __COMMIT_MESSAGE__: string;

export type Version = { sha: string; message: string };

export const VERSION: Version = { sha: __COMMIT_SHA__, message: __COMMIT_MESSAGE__ };
