// `film sfx`: the app's sound library from the command line. Every command
// but `make` is free: `list`, `plan`, `check` and `guard` read the library and
// its lock; `describe` records each variant's onset and hit from its file; `audition` and `render` write WAVs under `<FILMS_OUT>/sounds`;
// `keep`, `reject` and `import` curate the lock; `pull` and `push` sync the
// private `files/` (and the films' scores) with the store; `push --from` sends
// from an older folder store too (the move to R2). `make` is the one paid command: it prints
// its plan and cost, and spends only with `--yes`, under `--cap` counting what
// `--tally` already records.
//
//   film sfx list [family] [--missing | --stale]
//   film sfx plan [name…] [--force]
//   film sfx make [name…] [--force] [--yes] [--cap n] [--tally file]
//   film sfx try <name> [--prompt p] [--secs s] [--influence i] [--count n] [--yes] [--cap n] [--tally file]
//   film sfx audition <name> [--candidates]
//   film sfx keep <name> <n…> [--replace]
//   film sfx unkeep <name> <n…>    film sfx reject <name> <n…>
//   film sfx import <file> <name>
//   film sfx render <name> [--seed n]
//   film sfx check [--json]      film sfx describe
//   film sfx pull                  film sfx push [--from folder]
//   film sfx guard <file…>         (the pre-commit hook: staged audio the repo may not take)

import { Console, Effect, Option, Schema } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import {
  type LibraryEntry,
  type LockEntry,
  type MakeJob,
  familyOf,
  levelOf,
  soundState,
} from '../core/sfx.ts';
import { LibraryCheckFailed, SoundsRefused } from './errors.ts';
import { FilmRepo } from './film-repo.ts';
import { type LoadedLibrary, SoundLibrary, libraryLevel } from './library.ts';
import { CheckLineJson } from './fresh-film.ts';

const encodeCheckLine = Schema.encodeSync(CheckLineJson);

/** Which sounds `sfx list` prints. */
type ListFilter = 'all' | 'missing' | 'stale';

/** Where a sound's audio comes from, as `list` names it. */
const sourceOf = (entry: LibraryEntry): string => {
  switch (entry.kind) {
    case 'generated':
      return 'elevenlabs-paid-sfx';
    case 'procedural':
      return `procedural:${entry.recipe.recipe}`;
    case 'recorded':
      return entry.licence.id;
  }
};

/** The kept variants' mean loudness as the mix levels them: momentary max for a one-shot, integrated for a bed. */
const keptLoudness = (entry: LibraryEntry, lock: Option.Option<LockEntry>): string => {
  const kept = Option.match(lock, { onNone: () => [], onSome: (l) => l.variants });
  if (kept.length === 0) return '-';
  const measure = kept.map((v) => {
    if (entry.use === 'bed') return v.loudness.integrated;
    return v.loudness.momentaryMax;
  });
  return `${(measure.reduce((a, b) => a + b, 0) / measure.length).toFixed(1)}`;
};

/**
 * One line per sound: name, kind, use, state (current, stale, missing, or
 * derived for a procedural sound), variants kept (and candidates waiting),
 * level in dB relative to the voice, kept loudness and source. `family`
 * narrows to one family (`paper`); `filter` to the missing or stale.
 */
const listLines = (
  loaded: Pick<LoadedLibrary, 'library' | 'lock'>,
  family: Option.Option<string>,
  filter: ListFilter,
): ReadonlyArray<string> =>
  Object.entries(loaded.library)
    .filter(([name]) =>
      Option.match(family, { onNone: () => true, onSome: (f) => familyOf(name) === f }),
    )
    .flatMap(([name, entry]) => {
      const lock = Option.fromUndefinedOr(loaded.lock[name]);
      const state = soundState(entry, lock);
      if (filter === 'missing' && state._tag !== 'Missing') return [];
      if (filter === 'stale' && state._tag !== 'Stale') return [];
      let kept = '0';
      if (state._tag !== 'Missing') kept = `${state.variants}`;
      let waiting = '';
      if (state._tag !== 'Derived' && state.candidates > 0) waiting = ` +${state.candidates}?`;
      const level = levelOf(entry, Option.none()).toFixed(0);
      return [
        [
          name.padEnd(18),
          entry.kind.padEnd(10),
          entry.use.padEnd(8),
          state._tag.toLowerCase().padEnd(8),
          `${kept}${waiting}`.padEnd(7),
          `${level} dB`.padEnd(7),
          keptLoudness(entry, lock).padStart(6),
          ` ${sourceOf(entry)}`,
        ].join(' '),
      ];
    });

/** Each job `make` would run, and the total it would spend. */
const planLines = (jobs: ReadonlyArray<MakeJob>): ReadonlyArray<string> => [
  ...jobs.map(
    (job) =>
      `${job.name.padEnd(18)} ${job.count} × ${job.entry.secs}s  ${job.credits} credits  "${job.entry.prompt}"`,
  ),
  `total ${jobs.reduce((sum, job) => sum + job.count, 0)} candidates, ${jobs.reduce((sum, job) => sum + job.credits, 0)} credits`,
];

const names = Argument.String('name').pipe(
  Argument.variadic(),
  Argument.withDescription('just these sounds (every declared one when none)'),
);
const namesOf = (given: ReadonlyArray<string>): Option.Option<ReadonlySet<string>> =>
  Option.liftPredicate(new Set(given), (set) => set.size > 0);
const name = Argument.String('name').pipe(
  Argument.withDescription('a sound, as the library names it'),
);
const force = Flag.Boolean('force').pipe(
  Flag.withDefault(false),
  Flag.withDescription('a full set of candidates again, even for a current sound'),
);
const picks = Argument.Int('n').pipe(
  Argument.variadic({ min: 1 }),
  Argument.withDescription('candidates by number (1-based), as audition --candidates plays them'),
);

const list = Command.make(
  'list',
  {
    family: Argument.String('family').pipe(
      Argument.optional,
      Argument.withDescription('just this family (paper, amb, tone, …)'),
    ),
    missing: Flag.Boolean('missing').pipe(
      Flag.withDefault(false),
      Flag.withDescription('just the sounds nothing was kept for'),
    ),
    stale: Flag.Boolean('stale').pipe(
      Flag.withDefault(false),
      Flag.withDescription('just the sounds whose declaration changed since they were made'),
    ),
  },
  Effect.fn('film.sfx.list')(function* (input) {
    const loaded = yield* (yield* SoundLibrary).load;
    let filter: ListFilter = 'all';
    if (input.missing) filter = 'missing';
    if (input.stale) filter = 'stale';
    for (const line of listLines(loaded, input.family, filter)) yield* Console.log(line);
  }),
).pipe(
  Command.withDescription(
    'Every sound in the library: kind, use, state, variants kept (+ candidates waiting), level, loudness, source',
  ),
);

const plan = Command.make(
  'plan',
  { names, force },
  Effect.fn('film.sfx.plan')(function* (input) {
    const jobs = yield* (yield* SoundLibrary).plan(namesOf(input.names), input.force);
    for (const line of planLines(jobs)) yield* Console.log(line);
  }),
).pipe(
  Command.withDescription('What make would generate and what it would cost, in credits (free)'),
);

const spendFlags = {
  yes: Flag.Boolean('yes').pipe(
    Flag.withDefault(false),
    Flag.withDescription('spend the credits the plan prints'),
  ),
  cap: Flag.Int('cap').pipe(
    Flag.optional,
    Flag.withDescription('the most credits spent in all, counting what --tally records'),
  ),
  tally: Flag.String('tally').pipe(
    Flag.optional,
    Flag.withDescription('a TSV each generation is appended to: name, variant, seconds, credits'),
  ),
};

const make = Command.make(
  'make',
  { names, force, ...spendFlags },
  Effect.fn('film.sfx.make')(function* (input) {
    const library = yield* SoundLibrary;
    const chosen = namesOf(input.names);
    for (const line of planLines(yield* library.plan(chosen, input.force)))
      yield* Console.log(line);
    const made = yield* library.make({
      names: chosen,
      force: input.force,
      yes: input.yes,
      cap: input.cap,
      tally: input.tally,
    });
    for (const v of made)
      yield* Console.log(`made  ${v.file}  ${v.secs.toFixed(2)}s  ${v.credits} credits`);
  }),
).pipe(
  Command.withDescription(
    'Generate candidates for the missing or stale generated sounds (paid: prints the plan, spends only with --yes)',
  ),
);

const tryCommand = Command.make(
  'try',
  {
    name,
    prompt: Flag.String('prompt').pipe(
      Flag.optional,
      Flag.withDescription('the prompt in place of the declared one'),
    ),
    secs: Flag.Finite('secs').pipe(
      Flag.optional,
      Flag.withDescription('the length, in seconds (0.5–30), in place of the declared one'),
    ),
    influence: Flag.Finite('influence').pipe(
      Flag.optional,
      Flag.withDescription('prompt_influence (0–1) in place of the declared one'),
    ),
    count: Flag.Int('count').pipe(
      Flag.withDefault(2),
      Flag.withDescription('how many candidates to make'),
    ),
    ...spendFlags,
  },
  Effect.fn('film.sfx.try')(function* (input) {
    const made = yield* (yield* SoundLibrary).trial(
      input.name,
      { prompt: input.prompt, secs: input.secs, influence: input.influence },
      input.count,
      { yes: input.yes, cap: input.cap, tally: input.tally },
    );
    for (const v of made)
      yield* Console.log(
        `made  ${v.file}  ${v.secs.toFixed(2)}s  ${v.credits} credits  request=${v.request.slice(0, 12)}`,
      );
  }),
).pipe(
  Command.withDescription(
    "Candidates made with other settings than the declaration's (paid, as make): they wait under their own request, keepable once the declaration says the same",
  ),
);

const audition = Command.make(
  'audition',
  {
    name,
    candidates: Flag.Boolean('candidates').pipe(
      Flag.withDefault(false),
      Flag.withDescription('the candidates waiting, numbered as keep and reject take them'),
    ),
  },
  Effect.fn('film.sfx.audition')(function* (input) {
    yield* Console.log(yield* (yield* SoundLibrary).audition(input.name, input.candidates));
  }),
).pipe(
  Command.withDescription(
    "One WAV of a sound's variants (or candidates), each levelled as it would play, half a second apart",
  ),
);

const keep = Command.make(
  'keep',
  {
    name,
    picks,
    replace: Flag.Boolean('replace').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        'keep them in place of the kept variants, which wait again as candidates',
      ),
    ),
  },
  Effect.fn('film.sfx.keep')(function* (input) {
    const library = yield* SoundLibrary;
    const takes = yield* library.takesAt(input.name, input.picks, 'candidates');
    const entry = yield* library.keep(input.name, takes, input.replace);
    yield* Console.log(
      `${input.name} variants=${entry.variants.length} candidates=${entry.candidates.length}`,
    );
  }),
).pipe(
  Command.withDescription(
    'Keep candidates as the variants the mix plays: beside the kept ones, or in their place with --replace',
  ),
);

const unkeep = Command.make(
  'unkeep',
  {
    name,
    picks: Argument.Int('n').pipe(
      Argument.variadic({ min: 1 }),
      Argument.withDescription('kept variants by number (1-based), as audition plays them'),
    ),
  },
  Effect.fn('film.sfx.unkeep')(function* (input) {
    const library = yield* SoundLibrary;
    const takes = yield* library.takesAt(input.name, input.picks, 'kept');
    const entry = yield* library.unkeep(input.name, takes);
    yield* Console.log(
      `${input.name} variants=${entry.variants.length} candidates=${entry.candidates.length}`,
    );
  }),
).pipe(
  Command.withDescription(
    'Stop playing kept variants: each waits again as a candidate, to keep or reject later',
  ),
);

const reject = Command.make(
  'reject',
  { name, picks },
  Effect.fn('film.sfx.reject')(function* (input) {
    const library = yield* SoundLibrary;
    const takes = yield* library.takesAt(input.name, input.picks, 'candidates');
    const entry = yield* library.reject(input.name, takes);
    yield* Console.log(
      `${input.name} candidates=${entry.candidates.length} rejected=${entry.rejected.length}`,
    );
  }),
).pipe(Command.withDescription('Drop candidates; a rejected one is never offered again'));

const importCommand = Command.make(
  'import',
  {
    file: Argument.String('file').pipe(Argument.withDescription('a recording, in any format')),
    name,
  },
  Effect.fn('film.sfx.import')(function* (input) {
    const variant = yield* (yield* SoundLibrary).importFile(input.file, input.name);
    yield* Console.log(
      `imported  ${variant.file}  ${variant.secs.toFixed(2)}s  ${variant.licence}`,
    );
  }),
).pipe(
  Command.withDescription(
    'A CC0 recording into a declared recorded sound: trimmed, 44.1 kHz 24-bit FLAC under public/, measured',
  ),
);

const render = Command.make(
  'render',
  {
    name,
    seed: Flag.Int('seed').pipe(Flag.optional, Flag.withDescription('just this seed')),
  },
  Effect.fn('film.sfx.render')(function* (input) {
    for (const file of yield* (yield* SoundLibrary).render(input.name, input.seed))
      yield* Console.log(file);
  }),
).pipe(Command.withDescription("A procedural sound's seeds as WAVs, to hear a recipe"));

const check = Command.make(
  'check',
  {
    json: Flag.Boolean('json').pipe(
      Flag.withDefault(false),
      Flag.withDescription('print each finding as one line of JSON (level, tag, message)'),
    ),
  },
  Effect.fn('film.sfx.check')(function* (input) {
    const found = yield* (yield* SoundLibrary).check;
    for (const finding of found) {
      const level = libraryLevel(finding);
      if (input.json)
        yield* Console.log(encodeCheckLine({ level, tag: finding._tag, message: finding.message }));
      else yield* Console.log(`${level.padEnd(7)} ${finding._tag.padEnd(16)} ${finding.message}`);
    }
    const errors = found.filter((f) => libraryLevel(f) === 'error').length;
    yield* Effect.log(`sfx.check errors=${errors} warnings=${found.length - errors}`);
    if (errors > 0)
      return yield* LibraryCheckFailed.make({ errors, warnings: found.length - errors });
  }),
).pipe(
  Command.withDescription(
    'Every library finding: unmade or stale sounds, files missing or not their hash, licences, loop seams, lead-ins and unrecorded hits',
  ),
);

const describe = Command.make(
  'describe',
  {},
  Effect.fn('film.sfx.describe')(function* () {
    const wrote = yield* (yield* SoundLibrary).describe;
    yield* Effect.log(`sfx.describe variants=${wrote}`);
  }),
).pipe(
  Command.withDescription(
    "Record each variant's onset and hit in the lock, measured from its file (free; no generation)",
  ),
);

const pull = Command.make(
  'pull',
  {},
  Effect.fn('film.sfx.pull')(function* () {
    const scores = yield* (yield* FilmRepo).scores;
    const { fetched, had, missing } = yield* (yield* SoundLibrary).pull(scores);
    for (const file of missing) yield* Console.log(`missing  ${file}  (not in the store)`);
    yield* Console.log(`pulled ${fetched}, had ${had}, missing ${missing.length}`);
  }),
).pipe(
  Command.withDescription(
    "Bring the lock's generated files and the films' scores back from the store",
  ),
);

const push = Command.make(
  'push',
  {
    from: Flag.String('from').pipe(
      Flag.optional,
      Flag.withDescription(
        'a folder store (an older one, e.g. ~/film-sounds) to send each file from when it is not here; nothing is deleted from it',
      ),
    ),
  },
  Effect.fn('film.sfx.push')(function* (input) {
    const scores = yield* (yield* FilmRepo).scores;
    const { sent, had, missing, total } = yield* (yield* SoundLibrary).push(scores, input.from);
    for (const file of sent) yield* Console.log(`sent  ${file}`);
    let nowhere = 'not here, not in the store';
    if (Option.isSome(input.from))
      nowhere = `not here, not in ${input.from.value}, not in the store`;
    for (const file of missing) yield* Console.log(`missing  ${file}  (${nowhere})`);
    yield* Console.log(
      `pushed ${sent.length}, had ${had}, missing ${missing.length}, of ${total} private files`,
    );
  }),
).pipe(
  Command.withDescription(
    "Copy the lock's generated files and the films' scores the store lacks (or holds with other bytes) into it, each read back by hash",
  ),
);

const guard = Command.make(
  'guard',
  {
    files: Argument.String('file').pipe(
      Argument.variadic(),
      Argument.withDescription('the staged files (the hook passes them)'),
    ),
  },
  Effect.fn('film.sfx.guard')(function* (input) {
    const scores = yield* (yield* FilmRepo).scores;
    const refused = yield* (yield* SoundLibrary).guard(input.files, scores);
    for (const r of refused) yield* Console.error(`refused  ${r.message}`);
    if (refused.length > 0) return yield* SoundsRefused.make({ files: refused.map((r) => r.file) });
  }),
).pipe(
  Command.withDescription(
    "Refuse staged audio a public repo may not take: generated sounds and scores (or copies of them), anything in a film's sound/, and public audio that is no CC0 variant",
  ),
);

/** `film sfx`, over the app's library (`SoundLibrary`). */
export const sfx = Command.make('sfx').pipe(
  Command.withDescription("The app's sound library: list, plan, make, curate, check and sync it"),
  Command.withSubcommands([
    list,
    plan,
    make,
    tryCommand,
    audition,
    keep,
    unkeep,
    reject,
    importCommand,
    render,
    check,
    describe,
    pull,
    push,
    guard,
  ]),
);
