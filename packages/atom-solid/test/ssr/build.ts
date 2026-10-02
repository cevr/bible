/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noThrowStatement, effect/noNewError -- a build
 * harness at the host boundary: Bun's bundler and Solid's compiler are
 * Promise based, and a failed build is a defect of the test. */
// Compiles the SSR proof's App twice with Solid's compiler, as an app would:
// the server bundle (`ssr`, hydratable, target bun) and the client bundle
// (`dom`, hydratable, target browser, Solid's development build so a
// hydration mismatch is reported).
import { transform } from '@solidjs/compiler';
import type { BunPlugin } from 'bun';

import type * as ServerEntry from './server-entry.tsx';

const solid = (generate: 'dom' | 'ssr'): BunPlugin => ({
  name: `solid-${generate}`,
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const code = await Bun.file(args.path).text();
      const out = transform(code, {
        filename: args.path,
        generate,
        hydratable: true,
        moduleName: '@solidjs/web',
      });
      return { contents: out.code, loader: 'ts' };
    });
  },
});

const checked = (output: Bun.BuildOutput): Bun.BuildOutput => {
  if (!output.success) throw new Error(output.logs.map(String).join('\n'));
  return output;
};

/** Builds both halves into `outdir`; returns the server module and the client script. */
export const build = async (outdir: string) => {
  checked(
    await Bun.build({
      entrypoints: [`${import.meta.dir}/server-entry.tsx`],
      plugins: [solid('ssr')],
      target: 'bun',
      outdir: `${outdir}/server`,
    }),
  );
  checked(
    await Bun.build({
      entrypoints: [`${import.meta.dir}/client.tsx`],
      plugins: [solid('dom')],
      target: 'browser',
      conditions: ['development'],
      outdir: `${outdir}/client`,
    }),
  );
  const server: typeof ServerEntry = await import(`${outdir}/server/server-entry.js`);
  return {
    render: server.render,
    findings: server.findings,
    page: server.page,
    client: await Bun.file(`${outdir}/client/client.js`).text(),
  };
};
