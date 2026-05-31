/*
 * Production/preview launcher for the in-house bun adapter (see ./index.ts).
 *
 * `bun run start` runs this. It imports the built SSR entry (dist/server/entry.mjs,
 * produced by `astro build`) and calls its `start` export, which boots Bun.serve.
 * HOST/PORT env vars (set by the `start` script or the platform) override the
 * adapter's configured bind. This bypasses `astro preview` entirely — see the note
 * in index.ts on why previewEntrypoint is omitted.
 */

const entryUrl = new URL('../dist/server/entry.mjs', import.meta.url);

const file = Bun.file(entryUrl);
if (!(await file.exists())) {
  console.error(`[studies] No build found at ${entryUrl.pathname}. Run \`bun run build\` first.`);
  process.exit(1);
}

const mod: unknown = await import(entryUrl.href);
if (
  typeof mod !== 'object' ||
  mod === null ||
  !('start' in mod) ||
  typeof mod.start !== 'function'
) {
  console.error(
    `[studies] Built entry at ${entryUrl.pathname} does not export a start() function.`,
  );
  process.exit(1);
}
mod.start();
