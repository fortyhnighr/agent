/**
 * Minimal ambient declarations for the Node built-ins the test suite uses.
 * The gameplay build never imports these; only `tests/determinism.test.ts`
 * reads the source tree to prove the simulation is free of ambient time and
 * randomness.
 */

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isDirectory(): boolean };
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
}

declare const process: { cwd(): string };
