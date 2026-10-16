// The GPU launcher: how a Chrome Bun spawns gets its GPU back on macOS. Bun
// 1.4.3 spawns every Chrome with `--disable-gpu` (hard-coded beside
// `--headless`; no option drops it), which no later flag undoes: Chrome's GPU
// process then runs with `--use-gl=disabled`, and a page has no hardware
// video encoder. A Chrome whose flags ask for the GPU (`GPU_FLAG`) on macOS
// is spawned through a launcher (`gpuLauncher`, written by `tools/chrome.ts`
// into the process's Chrome profile and named to Bun as its Chrome), which
// drops that one flag and execs the real Chrome. Never on another platform:
// Linux renders and the browser tests draw WebGL on SwiftShader on purpose.

/**
 * The flag a caller asks for Chrome's GPU with (`launchArgs`,
 * tools/browser.ts): on macOS it launches Chrome through the GPU launcher
 * (`throughGpuLauncher`). Chrome itself reads nothing from it.
 */
export const GPU_FLAG = '--enable-gpu';

/** The flag Bun adds to every Chrome it spawns, which the GPU launcher drops. */
const DISABLE_GPU = '--disable-gpu';

/** Whether a Chrome with `argv` on `platform` is launched through the GPU launcher: on macOS, when it asks for the GPU. */
export const throughGpuLauncher = (platform: string, argv: ReadonlyArray<string>): boolean =>
  platform === 'darwin' && argv.includes(GPU_FLAG);

/** `text` as one word of a shell script, whatever it holds. */
const shellWord = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

/**
 * The GPU launcher for the Chrome at `chrome`: a POSIX shell script Bun
 * spawns as its Chrome. It passes on every argument Bun gives it but
 * `--disable-gpu`, in order, and execs Chrome in its own process, so Bun's
 * DevTools pipe and its kill reach Chrome itself.
 */
export const gpuLauncher = (chrome: string): string =>
  [
    '#!/bin/sh',
    'for arg do',
    '  shift',
    `  [ "$arg" = ${DISABLE_GPU} ] || set -- "$@" "$arg"`,
    'done',
    `exec ${shellWord(chrome)} "$@"`,
    '',
  ].join('\n');
