/**
 * Generate the title painting and every beat that carries a `concept`.
 *
 *   bun skills/bible/scripts/deck/gen_images.ts <deckDir> [id ...]
 *
 * Idempotent: an existing images/<id>.png is skipped, so rerun to sweep
 * stragglers; delete a png to re-roll it. Four workers, one retry each.
 */
import { dirname, resolve } from 'node:path';
import { readManifest } from './manifest.ts';
import { CHARACTERS, IMAGE_SIZE, PALETTE_REF, SCENE_REF, prompt } from './series.ts';

const [deckArg, ...ids] = Bun.argv.slice(2);
if (deckArg === undefined) throw new Error('usage: gen_images.ts <deckDir> [id ...]');
const deckDir = resolve(deckArg);
const decksDir = dirname(deckDir);
const manifest = await readManifest(deckDir);

const jobs = [
  { id: 'title', concept: manifest.titleConcept, character: undefined },
  ...manifest.slides.flatMap((slide) =>
    slide.concept === undefined
      ? []
      : [{ id: slide.id, concept: slide.concept, character: slide.character }],
  ),
];

const only = new Set(ids);
const queue = jobs.filter((job) => only.size === 0 || only.has(job.id));
const failures: Array<string> = [];

const run = async (job: (typeof jobs)[number]) => {
  const out = resolve(deckDir, 'images', `${job.id}.png`);
  if (await Bun.file(out).exists()) return;
  const refs = [
    PALETTE_REF,
    job.character === undefined ? SCENE_REF : CHARACTERS[job.character].ref,
  ];
  const args = [
    'okra',
    'image',
    prompt(job.concept),
    ...refs.flatMap((ref) => ['--ref', resolve(decksDir, ref)]),
    '--size',
    IMAGE_SIZE,
    '-o',
    out,
  ];
  for (const attempt of [1, 2]) {
    const proc = Bun.spawn(args, { stdout: 'ignore', stderr: 'pipe' });
    if ((await proc.exited) === 0 && (await Bun.file(out).exists())) {
      console.log(`ok ${job.id}`);
      return;
    }
    console.log(
      `fail(${attempt}) ${job.id}: ${(await new Response(proc.stderr).text()).slice(-300)}`,
    );
  }
  failures.push(job.id);
};

await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let job = queue.shift(); job !== undefined; job = queue.shift()) await run(job);
  }),
);

if (failures.length > 0) {
  console.log(`FAILED: ${failures.join(' ')}`);
  process.exit(1);
}
console.log('all paintings present');
