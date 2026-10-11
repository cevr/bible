// Build the accused's rig: write the generated project (`project/`), compile
// it with the Rive CLI offline and unsigned (`rive --once`: no account, no
// scripts), and copy the .riv beside the look, where the look imports it.
// `bun looks/rive/build.ts [--inspect] [--screenshot]`, from the film's folder
// or anywhere: paths are this file's.
//
// Prints each step's wall time, so the agent loop (change → see it) is
// measured, not guessed.

import { accusedRml } from './rig.ts';

const here = import.meta.dir;
const project = `${here}/project`;
const rive = `${process.env['HOME']}/.rive/bin/rive`;
const args = new Set(process.argv.slice(2));

const timed = async <A>(label: string, run: () => Promise<A>): Promise<A> => {
  const began = performance.now();
  const out = await run();
  console.log(`${label}: ${(performance.now() - began).toFixed(0)} ms`);
  return out;
};

const exec = async (argv: ReadonlyArray<string>) => {
  const proc = Bun.spawn([...argv], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
};

const rml = await timed('generate', async () => accusedRml());
await Bun.write(`${project}/rive.yaml`, 'name: accused\nmain: Accused\n');
await Bun.write(`${project}/accused.rml`, rml);
console.log(`accused.rml: ${rml.split('\n').length} lines, ${rml.length} bytes`);

const built = await timed('rive --once', () =>
  exec([rive, project, '--once', '--quiet', '--format=json']),
);
if (built.code !== 0) {
  console.error(built.stdout, built.stderr);
  process.exit(1);
}
const report = JSON.parse(built.stdout.trim()) as {
  data: { riv: string; bytes: number };
  warnings: string[];
};
console.log(`riv: ${report.data.bytes} bytes; warnings: ${report.warnings.length}`);
for (const w of report.warnings) console.log(`  warning: ${w}`);
await Bun.write(`${here}/accused.riv`, Bun.file(report.data.riv));

if (args.has('--inspect')) {
  const inspected = await timed('rive inspect', () =>
    exec([rive, 'inspect', project, '--summary']),
  );
  console.log(inspected.stdout.trim(), inspected.stderr.trim());
}
if (args.has('--screenshot')) {
  for (const advance of ['0', '1']) {
    const shot = await timed(`rive --screenshot (advance ${advance})`, () =>
      exec([
        rive,
        project,
        `--screenshot=${here}/project/build/shot-${advance}.png`,
        `--advance=${advance}`,
      ]),
    );
    if (shot.code !== 0) console.error(shot.stdout, shot.stderr);
  }
}
