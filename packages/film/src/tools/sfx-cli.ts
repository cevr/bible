// `film sfx`: the app's sound library from the command line. Every command
// but `make` is free: `list`, `plan` and `check` read the library and
// its lock; `describe` records each variant's onset and hit from its file;
// `audition` and `render` write WAVs under `<FILMS_OUT>/sounds` (`--trial`,
// a sound's code trial: its code version, heard beside its takes; `render
// --sheet`, each WAV's sheet beside it as a PNG, read in place of
// listening); `compare` prints a code trial's numbers beside what plays,
// each render's and each side's median, how far apart they stand, and how
// far each film's placement would hear the hit move; `audit` reads which
// generated sounds code can make, from their prompts; `ab` writes a sound's
// clips for an ask; `keep`, `reject` and `import` curate the lock; `pull`
// and `push` sync the private `files/` (and the films' scores) with the
// store; `push --from` sends from an older folder store too (the move to
// R2). `make` is the one paid command: it prints its plan and cost, and
// spends only with `--yes`, under `--cap` counting what `--tally` already
// records.
//
//   film sfx list [family] [--missing | --stale]
//   film sfx plan [name…] [--force]
//   film sfx make [name…] [--force] [--yes] [--cap n] [--tally file]
//   film sfx try <name> [--prompt p] [--secs s] [--influence i] [--count n] [--yes] [--cap n] [--tally file]
//   film sfx audition <name> [--candidates | --trial]
//   film sfx keep <name> <n…> [--replace]
//   film sfx unkeep <name> <n…>    film sfx reject <name> <n…>
//   film sfx import <file> <name>
//   film sfx render <name> [--seed n] [--trial] [--sheet]
//   film sfx compare <name>        film sfx audit
//   film sfx ab <name> --out <dir>
//   film sfx check [--json]      film sfx describe
//   film sfx pull                  film sfx push [--from folder]

import { Array as Arr, Console, Effect, Option, Schema } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import type { SoundEffect } from '../core/schema.ts';
import {
  type LibraryEntry,
  type MakeJob,
  familyOf,
  keptLoudness,
  levelOf,
  soundState,
} from '../core/sfx.ts';
import { VERDICT_LABEL, auditLibrary } from '../core/sfx-audit.ts';
import {
  HEARD_HIT,
  HIT_MOVE,
  type Profile,
  distance,
  hitMove,
  medianProfile,
} from '../core/synth/compare.ts';
import { describeGraph } from '../core/synth/graph/describe.ts';
import { FlagsConflict, LibraryCheckFailed } from './errors.ts';
import { FilmFolder, FilmRepo } from './film-repo.ts';
import { flagConflicts, givenFlags } from './render-plan.ts';
import {
  type AuditionOf,
  type Comparison,
  type LoadedLibrary,
  IMPORT_RULES,
  SoundLibrary,
  libraryLevel,
} from './library.ts';
import { CheckLineJson } from './fresh-film.ts';

const encodeCheckLine = Schema.encodeSync(CheckLineJson);

/** Which sounds `sfx list` prints. */
type ListFilter = 'all' | 'missing' | 'stale';

/** Where a sound's audio comes from, as `list` names it. */
const sourceOf = (entry: LibraryEntry): string => {
  switch (entry.kind) {
    case 'generated':
      return 'elevenlabs-paid-sfx';
    case 'recorded':
      return entry.licence.id;
    case 'code':
      return `code:${describeGraph(entry.sound.play)}`;
  }
};

/**
 * One line per sound: name, kind, use, state (current, stale, missing, or
 * derived for a code sound), variants kept (and candidates waiting),
 * level in dB relative to the voice, kept loudness and source, and `+ code
 * trial` when it has one. `family` narrows to one family (`paper`); `filter`
 * to the missing or stale.
 */
const listLines = (
  loaded: Pick<LoadedLibrary, 'library' | 'lock' | 'trials'>,
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
      let trial = '';
      if (loaded.trials.has(name)) trial = '  + code trial';
      return [
        [
          name.padEnd(18),
          entry.kind.padEnd(10),
          entry.use.padEnd(8),
          state._tag.toLowerCase().padEnd(8),
          `${kept}${waiting}`.padEnd(7),
          `${level} dB`.padEnd(7),
          Option.match(keptLoudness(entry, lock), {
            onNone: () => '-',
            onSome: (db) => db.toFixed(1),
          }).padStart(6),
          ` ${sourceOf(entry)}${trial}`,
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

/** A number with its sign, to `digits` places: how far a figure moved. */
const signed = (value: number, digits: number): string => {
  if (value > 0) return `+${value.toFixed(digits)}`;
  return value.toFixed(digits);
};

/** The columns a profile is printed in: each heading's width, the label's first. */
const PROFILE_COLUMNS: ReadonlyArray<readonly [string, number]> = [
  ['', 10],
  ['secs', 6],
  ['LUFS', 6],
  ['max', 6],
  ['peak', 6],
  ['onset', 6],
  ['hit', 6],
  ['stands', 7],
  ['tail', 6],
  ['centroid', 9],
  ['flat', 5],
  ['<30 Hz', 7],
];

/** A row of `PROFILE_COLUMNS`: the label left, each figure right. */
const profileRow = (cells: ReadonlyArray<string>): string =>
  cells
    .map((cell, i) => {
      const width = PROFILE_COLUMNS[i]?.[1] ?? 0;
      if (i === 0) return cell.padEnd(width);
      return cell.padStart(width);
    })
    .join(' ');

/** A profile's numbers under `PROFILE_COLUMNS`: seconds, LUFS, dBFS, Hz, a share as a percentage. */
const profileLine = (label: string, p: Profile): string =>
  profileRow([
    label,
    p.secs.toFixed(2),
    p.integrated.toFixed(1),
    p.momentaryMax.toFixed(1),
    p.peak.toFixed(1),
    p.onset.toFixed(2),
    p.hit.toFixed(2),
    p.stands.toFixed(1),
    p.tail.toFixed(2),
    `${p.centroid.toFixed(0)} Hz`,
    p.flatness.toFixed(2),
    `${(p.rumble * 100).toFixed(1)} %`,
  ]);

/**
 * What `compare` prints: each render of what plays and of the code trial,
 * each side's median, the bands either median hears (each band's share of
 * the power in dB, and how far the trial moved it), and the distances.
 */
const compareLines = (name: string, compared: Comparison): ReadonlyArray<string> => {
  const plays = medianProfile(Arr.map(compared.plays, (m) => m.profile));
  const trial = medianProfile(Arr.map(compared.trial, (m) => m.profile));
  const apart = distance(plays, trial);
  let moved = 'none';
  if (apart.apart.length > 0)
    moved = apart.apart.map((row) => `${row.band} ${signed(row.moved, 1)}`).join(', ');
  return [
    `${name}: its code trial beside what plays`,
    profileRow(['plays', ...PROFILE_COLUMNS.slice(1).map(([heading]) => heading)]),
    ...compared.plays.map((m) => profileLine(m.label, m.profile)),
    profileLine('median', plays),
    'code trial',
    ...compared.trial.map((m) => profileLine(m.label, m.profile)),
    profileLine('median', trial),
    `${'band'.padEnd(10)} ${'plays'.padStart(6)} ${'trial'.padStart(6)} ${'moved'.padStart(6)}  (share of the power, dB)`,
    ...apart.bands.map(
      (row) =>
        `${row.band.padEnd(10)} ${row.from.toFixed(1).padStart(6)} ${row.to.toFixed(1).padStart(6)} ${signed(row.moved, 1).padStart(6)}`,
    ),
    `balance ${apart.balance.toFixed(1)} dB RMS over ${apart.bands.length} bands; moved over 6 dB: ${moved}; hit moved ${signed(apart.hit * 1000, 0)} ms`,
  ];
};

/** A film's effect that places a sound: the film, the effect and what it lands on its cue. */
interface Placing {
  readonly film: string;
  readonly effect: string;
  readonly sync: NonNullable<SoundEffect['sync']>;
}

/**
 * The sync check `compare` prints: how far each film's placement of the
 * sound would hear the hit move if the code trial played in place of what
 * plays now, the medians' move and the worst seed's, marked where the worst
 * passes `HIT_MOVE`, or where what plays has no hit to hear (`HEARD_HIT`).
 */
const syncLines = (
  compared: Comparison,
  placings: ReadonlyArray<Placing>,
): ReadonlyArray<string> => {
  if (placings.length === 0) return ['sync: no film places it as an effect'];
  const plays = Arr.map(compared.plays, (m) => m.profile);
  const trial = Arr.map(compared.trial, (m) => m.profile);
  const width = Math.max(...placings.map((p) => `${p.film} ${p.effect}`.length));
  return [
    "sync: how far each placement would hear the hit move (the medians', the worst seed's)",
    ...placings.map(({ film, effect, sync }) => {
      const moved = hitMove(sync, plays, trial);
      let over = '';
      if (!moved.heard) over = `  no heard hit in what plays (it stands under ${HEARD_HIT} dB)`;
      else if (Math.abs(moved.worst) > HIT_MOVE) over = `  over ${Math.round(HIT_MOVE * 1000)} ms`;
      return `${`${film} ${effect}`.padEnd(width)}  ${sync.padEnd(5)}  median ${signed(moved.median * 1000, 0)} ms, worst ${signed(moved.worst * 1000, 0)} ms${over}`;
    }),
  ];
};

/** Every film's effects that place `name`, each read from the film's `sound.ts` alone. */
const placingsOf = Effect.fn('film.sfx.placings')(function* (name: string) {
  const repo = yield* FilmRepo;
  const films = yield* (yield* FilmFolder).names;
  const sounds = yield* Effect.forEach(films, (film) =>
    Effect.map(repo.sound(film), (sound) => ({ film, sound })),
  );
  return sounds.flatMap(({ film, sound }) =>
    Option.match(sound, {
      onNone: (): ReadonlyArray<Placing> => [],
      onSome: ({ effects }) =>
        Object.entries(effects).flatMap(([effect, fx]): ReadonlyArray<Placing> => {
          if (fx.sound !== name) return [];
          return [{ film, effect, sync: fx.sync ?? 'start' }];
        }),
    }),
  );
});

/**
 * What `audit` prints: each generated sound's verdict, the rule's reason and
 * the prompt's words that decided it, marked when it has a code trial; then
 * how many have each verdict.
 */
const auditLines = (loaded: Pick<LoadedLibrary, 'library' | 'trials'>): ReadonlyArray<string> => {
  const audited = auditLibrary(loaded.library);
  const counts = Object.entries(VERDICT_LABEL).map(
    ([verdict, label]) => `${audited.filter((a) => a.audited.verdict === verdict).length} ${label}`,
  );
  return [
    ...audited.map(({ name, audited: { verdict, reason, words } }) => {
      let held = '';
      if (words.length > 0) held = `: ${words.join(', ')}`;
      let trial = '';
      if (loaded.trials.has(name)) trial = '  + code trial';
      return `${name.padEnd(18)} ${VERDICT_LABEL[verdict].padEnd(25)} ${reason}${held}${trial}`;
    }),
    `${audited.length} generated: ${counts.join(', ')}`,
  ];
};

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
    trial: Flag.Boolean('trial').pipe(
      Flag.withDefault(false),
      Flag.withDescription("the sound's code trial's seeds, levelled as the sound plays"),
    ),
  },
  Effect.fn('film.sfx.audition')(function* (input) {
    if (input.candidates && input.trial)
      return yield* FlagsConflict.make({
        flag: 'trial',
        rule: 'excludes',
        other: 'candidates',
        reason: 'an audition plays one side: the candidates waiting, or the code trial',
      });
    let of: AuditionOf = 'plays';
    if (input.candidates) of = 'candidates';
    if (input.trial) of = 'trial';
    yield* Console.log(yield* (yield* SoundLibrary).audition(input.name, of));
  }),
).pipe(
  Command.withDescription(
    "One WAV of a sound's variants (or candidates, or code trial's seeds), each levelled as it would play, half a second apart",
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
    from: Flag.Finite('from').pipe(
      Flag.optional,
      Flag.withDescription("the cut's first second in the recording (with --to)"),
    ),
    to: Flag.Finite('to').pipe(
      Flag.optional,
      Flag.withDescription("the cut's last second in the recording (with --from)"),
    ),
  },
  Effect.fn('film.sfx.import')(function* (input) {
    const ends = { from: input.from, to: input.to };
    yield* Effect.fromResult(flagConflicts(givenFlags(ends), IMPORT_RULES));
    const cut = Option.all(ends);
    const imported = yield* (yield* SoundLibrary).importFile(input.file, input.name, cut);
    const { variant } = imported;
    const taken = Option.match(imported.cut, {
      onNone: () => 'whole',
      onSome: (c) => `${c.from.toFixed(2)}-${c.to.toFixed(2)}s`,
    });
    yield* Console.log(
      `imported  ${variant.file}  ${variant.secs.toFixed(2)}s  ${variant.licence}  cut=${taken}  gain=${imported.gain.toFixed(1)}dB  <30Hz=${(imported.rumble * 100).toFixed(1)}%`,
    );
  }),
).pipe(
  Command.withDescription(
    "A CC0 or CC BY recording into a declared recorded sound: folded to mono, cut (--from/--to, else its secs cut automatically), a one-shot's quiet ends trimmed, overs levelled to -1 dBFS, 44.1 kHz 24-bit FLAC under public/, measured",
  ),
);

const render = Command.make(
  'render',
  {
    name,
    seed: Flag.Int('seed').pipe(Flag.optional, Flag.withDescription('just this seed')),
    trial: Flag.Boolean('trial').pipe(
      Flag.withDefault(false),
      Flag.withDescription("the sound's code trial: its code version, heard beside what plays"),
    ),
    sheet: Flag.Boolean('sheet').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        "each WAV's sheet beside it as a PNG: spectrogram, waveform, loudness, onset, hit and loop",
      ),
    ),
  },
  Effect.fn('film.sfx.render')(function* (input) {
    const files = yield* (yield* SoundLibrary).render(input.name, {
      seed: input.seed,
      trial: input.trial,
      sheet: input.sheet,
    });
    for (const file of files) yield* Console.log(file);
  }),
).pipe(
  Command.withDescription(
    "A code sound's seeds as WAVs, or with --trial its code trial's, to hear it (with --sheet, to read it)",
  ),
);

const compare = Command.make(
  'compare',
  { name },
  Effect.fn('film.sfx.compare')(function* (input) {
    const compared = yield* (yield* SoundLibrary).compare(input.name);
    for (const line of compareLines(input.name, compared)) yield* Console.log(line);
    for (const line of syncLines(compared, yield* placingsOf(input.name))) yield* Console.log(line);
  }),
).pipe(
  Command.withDescription(
    "A sound's code trial beside what plays, in numbers: each render's loudness, timing, brightness and band balance, each side's median, how far the trial moved them, and how far each film's placement would hear the hit move (free; no verdict)",
  ),
);

const audit = Command.make(
  'audit',
  {},
  Effect.fn('film.sfx.audit')(function* () {
    const loaded = yield* (yield* SoundLibrary).load;
    for (const line of auditLines(loaded)) yield* Console.log(line);
  }),
).pipe(
  Command.withDescription(
    'Which generated sounds code can make, read from their prompts by ordered rules: each verdict with its reason and the words that decided it (free; no model)',
  ),
);

const ab = Command.make(
  'ab',
  {
    name,
    out: Flag.String('out').pipe(
      Flag.withDescription('the folder the clips and their sheets are written into'),
    ),
  },
  Effect.fn('film.sfx.ab')(function* (input) {
    for (const file of yield* (yield* SoundLibrary).ab(input.name, input.out))
      yield* Console.log(file);
  }),
).pipe(
  Command.withDescription(
    "A sound's clips for an ask: what plays now, and with a code trial the trial and both in one, each an MP4 of its line-up under its sheet, beside the sheet as a PNG (free)",
  ),
);

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
    compare,
    audit,
    ab,
    check,
    describe,
    pull,
    push,
  ]),
);
