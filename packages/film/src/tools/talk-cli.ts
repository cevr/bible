// `film talk`: a talk read as its edit plays it (`core/talk.ts`). A talk is
// cut on word indices into its takes' transcripts, which nobody reads bare:
// `words` prints how long the talk plays against its format's length, then
// each section's words with their indices, as `[33]law`, a struck word as
// `[34]~um~`, so the agent and the owner name words by what they say. With
// `--take`, a take's whole transcript, every word the edit could play.
//
//   film talk words <talk> [--take key]

import { Console, Effect, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { type CutSection, TALK_FORMATS, type TalkTake } from '../core/talk.ts';
import { NotATalk } from './errors.ts';
import { FilmRepo, type LoadedTalk } from './film-repo.ts';

/** Words to a printed line. */
const PER_LINE = 12;

/** The talk's title, its format, and how long it plays against the format's length. */
const lengthLine = (talk: LoadedTalk): string => {
  const format = TALK_FORMATS[talk.talk.format];
  const { min, max } = format.seconds;
  const plays = talk.cut.sections.reduce((sum, section) => sum + section.voice.duration, 0);
  const fit = ['under', 'within', 'over'][Number(plays >= min) + Number(plays > max)] ?? 'within';
  return `${talk.talk.title}  ${format.title}  plays ${plays.toFixed(2)}s, ${fit} its ${min}–${max}s`;
};

/** `words` as lines of `[i]word`, `PER_LINE` a line, each struck one `[i]~word~`. */
const wordLines = (
  take: TalkTake,
  indices: ReadonlyArray<number>,
  struck: (i: number) => boolean,
): ReadonlyArray<string> => {
  const shown = indices.map((i) => {
    const text = Option.match(Option.fromUndefinedOr(take.words[i]), {
      onNone: () => '?',
      onSome: (w) => w.text,
    });
    return [`[${i}]${text}`, `[${i}]~${text}~`][Number(struck(i))] ?? `[${i}]${text}`;
  });
  return Array.from(
    { length: Math.ceil(shown.length / PER_LINE) },
    (_, k) => `  ${shown.slice(k * PER_LINE, (k + 1) * PER_LINE).join(' ')}`,
  );
};

/** A section's head line and its words, kept and struck. */
const sectionLines = (talk: LoadedTalk, section: CutSection): ReadonlyArray<string> => {
  const edit = talk.talk.sections.find((s) => s.id === section.id);
  const from = edit?.from ?? 0;
  const to = edit?.to ?? -1;
  const kept = new Set(section.kept);
  const all = Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => from + k);
  const take = talk.takes[section.take];
  const head = [
    section.id.padEnd(16),
    `take ${section.take}`,
    `${from}–${to}`,
    `${section.voice.duration.toFixed(2)}s`,
    `${section.pieces.length} piece${['s', ''][Number(section.pieces.length === 1)] ?? 's'}`,
  ].join('  ');
  return [
    head,
    ...Option.match(Option.fromUndefinedOr(take), {
      onNone: () => [],
      onSome: (words) => wordLines(words, all, (i) => !kept.has(i)),
    }),
  ];
};

const words = Command.make(
  'words',
  {
    film: Argument.String('talk').pipe(
      Argument.withDescription('the talk, a folder under src/films'),
    ),
    take: Flag.String('take').pipe(
      Flag.optional,
      Flag.withDescription(
        "print this take's whole transcript instead (its key in the talk's takes)",
      ),
    ),
  },
  Effect.fn('film.talk.words')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    const talk = yield* Effect.fromOption(loaded.talk, () => NotATalk.make({ film: input.film }));
    const lines = Option.match(input.take, {
      onNone: () => [
        lengthLine(talk),
        ...talk.cut.sections.flatMap((section) => sectionLines(talk, section)),
      ],
      onSome: (key) =>
        Option.match(Option.fromUndefinedOr(talk.takes[key]), {
          onNone: () => [`no take "${key}" (the takes: ${Object.keys(talk.takes).join(', ')})`],
          onSome: (take) => [
            `take ${key}  ${talk.talk.takes[key] ?? ''}  ${take.words.length} words`,
            ...wordLines(
              take,
              take.words.map((_, i) => i),
              () => false,
            ),
          ],
        }),
    });
    for (const line of lines) yield* Console.log(line);
  }),
).pipe(
  Command.withDescription(
    "Print a talk's sections as its edit plays them: each word with its index, the struck ones marked",
  ),
);

/** `film talk`, over the films folder's talks. */
export const talk = Command.make('talk').pipe(
  Command.withDescription("A talk's edit, read as it plays"),
  Command.withSubcommands([words]),
);
