// `film board`: a film's storyboard, made and kept from the terminal (`bun
// run board …` in the app). The board starts the film's flow: script, then
// board, then voice and scenes built to it. Each line it prints is one line,
// so an agent reads them; `board <film>` prints one line per try as it lands.
//
//   film board <film> [--beat id,id] [--tries 2] [--lanes 3] [--dry-run]
//       draw every panel the board lacks (the marks each beat's picture
//       names, at most three a beat; one at its start when it names none),
//       two tries each, on `okra image`'s Codex route; --dry-run prints the
//       prompts and draws nothing
//   film board style <film> --id 9005 --name "…" --block-file f --ref img [--world-file f]
//   film board import <film> --panel <beat>.<at> <file…> [--keep n --why "…"] [--from "…"] [--prompt-file f]
//   film board card <film> --panel <beat>.<at> --payoff word [--to mark]
//   film board verse <film> --panel <beat>.<at> --ref "Job 9:2" --text "…" --phrase "…"
//   film board tweak <film> <note> [--tries 2]
//
// A try kept, a beat approved or withdrawn, and the board read are the
// lab's commands (`film lab keep_try|approve_beat|withdraw_beat|board`, the
// same as the lab's MCP tools: `lab-commands.ts`).

import { Argument, Command, Flag } from 'effect/cli';
import {
  Array as Arr,
  Boolean as Bool,
  Console,
  DateTime,
  Effect,
  FileSystem,
  Option,
  Path,
  Result,
  Schema,
} from 'effect';
import {
  type BoardFile,
  BoardName,
  boardNamed,
  PANEL_START,
  type PanelText,
  TryExt,
  styleFile,
  cardLine,
  filmOrder,
  panelById,
  panelId,
  phraseIn,
  pickTry,
  withPanel,
} from '../core/board.ts';
import { BoardRefused, NoteNotFound } from '../core/refusals.ts';
import { noteById } from '../core/notes.ts';
import type { BoardBeat } from './board-prompt.ts';
import { MOST_LANES, TRIES, makeBoard, makeLine, refusedIn, tweakPanel } from './board-make.ts';
import { BoardStore } from './board-store.ts';
import { FilmRepo, type FilmName, filmNamed } from './film-repo.ts';
import { ImageRoute } from './image-route.ts';
import { NotesStore } from './notes-store.ts';

const film = Argument.String('film').pipe(
  Argument.withDescription('the film, a folder under src/films'),
);
const panelFlag = Flag.String('panel').pipe(
  Flag.withDescription('the panel, <beat>.<at>: its beat and the mark it is held from (or start)'),
);

/** The film's beats as the board reads them, from its script. */
const beatsOf = Effect.fn('Board.beats')(function* (name: FilmName) {
  const script = yield* (yield* FilmRepo).script(name);
  return yield* Option.match(script, {
    onNone: () =>
      Effect.fail(BoardRefused.make({ film: name, reason: 'the film has no script.ts to board' })),
    onSome: (beats) =>
      Effect.forEach(beats, (b) =>
        Option.match(boardNamed(b.id), {
          onNone: () =>
            Effect.fail(
              BoardRefused.make({
                film: name,
                reason: `beat ${b.id} names no board panel: letters, digits, _ and -`,
              }),
            ),
          onSome: (id) =>
            Effect.succeed<BoardBeat>({
              id,
              say: Option.fromUndefinedOr(b.say),
              picture: Option.fromUndefinedOr(b.picture),
            }),
        }),
      ),
  });
});

/** The film's acts (its declared look), none when it declares none. */
const actsOf = Effect.fn('Board.acts')(function* (name: FilmName) {
  const loaded = yield* (yield* FilmRepo).load(name);
  return Option.match(loaded.look, { onNone: () => [], onSome: (look) => look.acts });
});

const tryExtNamed = Schema.decodeUnknownOption(TryExt);

/** The extension of an image brought in as a try (`png` when it has none), or the refusal naming the file. */
const tryExtOf = (film: FilmName, source: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const ext = path.extname(source).toLowerCase().replace(/^\./, '') || 'png';
    return yield* Effect.fromOption(tryExtNamed(ext)).pipe(
      Effect.mapError(() =>
        BoardRefused.make({
          film,
          reason: `${source} is no board image: a try is png, jpg, jpeg or webp`,
        }),
      ),
    );
  });

/** `<beat>.<at>` read against the script: a beat it has, and a mark of its line (or `start`). */
const panelIn = (name: FilmName, beats: ReadonlyArray<BoardBeat>, id: string) =>
  Effect.gen(function* () {
    const dot = id.indexOf('.');
    const [beat, at] = Bool.match(dot < 0, {
      onTrue: (): readonly [string, string] => [id, ''],
      onFalse: (): readonly [string, string] => [id.slice(0, dot), id.slice(dot + 1)],
    });
    const found = Arr.findFirst(beats, (b) => b.id === beat).pipe(Option.filter(() => at !== ''));
    if (Option.isNone(found))
      return yield* BoardRefused.make({
        film: name,
        reason: `"${id}" is no panel: name it <beat>.<at>, a beat of ${beats.map((b) => b.id).join(', ')}`,
      });
    const marks = [
      ...Option.getOrElse(found.value.say, () => '').matchAll(/\{([A-Za-z0-9_-]+)\}/g),
    ].map((m) => Option.getOrElse(Option.fromUndefinedOr(m[1]), () => ''));
    if (at !== PANEL_START && !marks.includes(at))
      return yield* BoardRefused.make({
        film: name,
        reason: `beat ${beat} has no mark {${at}} (it has start, ${marks.join(', ')})`,
      });
    // Both name the panel's files and link: decoded, never written as they came.
    const names = Option.all({ beatId: boardNamed(found.value.id), mark: boardNamed(at) });
    if (Option.isNone(names))
      return yield* BoardRefused.make({
        film: name,
        reason: `"${id}" names no board panel: a beat and a mark are letters, digits, _ and -`,
      });
    return { beat: found.value, beatId: names.value.beatId, at: names.value.mark };
  });

/** Where `board` places panels: the film's order, every panel it holds and `id`. */
const orderWith = (beats: ReadonlyArray<BoardBeat>, board: BoardFile, id: string) =>
  filmOrder(beats, [...board.panels.map((p) => p.id), id]);

const emit = (line: Parameters<typeof makeLine>[0]) => Console.log(makeLine(line));

/** `board style`: the film's board look, its reference image copied into the board folder. */
const style = Command.make(
  'style',
  {
    film,
    id: Flag.String('id').pipe(
      Flag.withSchema(BoardName),
      Flag.withDescription("the style's id, as the looks study names it (9005)"),
    ),
    name: Flag.String('name').pipe(Flag.withDescription("the style's name")),
    blockFile: Flag.String('block-file').pipe(
      Flag.withDescription('a text file holding the style block every prompt opens with'),
    ),
    ref: Flag.String('ref').pipe(Flag.withDescription("the style's reference image")),
    worldFile: Flag.String('world-file').pipe(
      Flag.optional,
      Flag.withDescription(
        "a text file holding the film's world: what every panel shares, in a paragraph",
      ),
    ),
  },
  Effect.fn('film.board.style')(function* (input) {
    const fs = yield* FileSystem.FileSystem;
    const store = yield* BoardStore;
    const name = yield* filmNamed(input.film);
    const block = (yield* fs.readFileString(input.blockFile)).trim();
    const world = yield* Option.match(input.worldFile, {
      onNone: () => Effect.succeedNone,
      onSome: (f) => Effect.asSome(Effect.map(fs.readFileString(f), (s) => s.trim())),
    });
    const bytes = yield* fs.readFile(input.ref);
    const file = styleFile(input.id, yield* tryExtOf(name, input.ref));
    const sha256 = yield* store.put(name, file, bytes);
    yield* store.modify(name, (b) =>
      Result.succeed({
        ...b,
        style: {
          id: input.id,
          name: input.name,
          block,
          ref: file,
          sha256,
          ...Option.match(world, { onNone: () => ({}), onSome: (w) => ({ world: w }) }),
        },
      }),
    );
    yield* Console.log(`style ${input.id} name="${input.name}" ref=${file}`);
  }),
).pipe(
  Command.withDescription("Set the film's board look: its style block, reference image and world"),
);

/** `board import`: images made elsewhere, as tries of a panel. */
const importTries = Command.make(
  'import',
  {
    film,
    panel: panelFlag,
    files: Argument.String('file').pipe(
      Argument.variadic({ min: 1 }),
      Argument.withDescription('the images, in try order'),
    ),
    keep: Flag.Int('keep').pipe(
      Flag.optional,
      Flag.withDescription('which of them to keep, from 1'),
    ),
    why: Flag.String('why').pipe(Flag.optional, Flag.withDescription('why that one is kept')),
    from: Flag.String('from').pipe(
      Flag.optional,
      Flag.withDescription('where they came from, said plainly'),
    ),
    promptFile: Flag.String('prompt-file').pipe(
      Flag.optional,
      Flag.withDescription('the prompt they were made with'),
    ),
  },
  Effect.fn('film.board.import')(function* (input) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const store = yield* BoardStore;
    const name = yield* filmNamed(input.film);
    const beats = yield* beatsOf(name);
    const { beatId, at } = yield* panelIn(name, beats, input.panel);
    const id = panelId(beatId, at);
    const prompt = yield* Option.match(input.promptFile, {
      onNone: () => Effect.succeedNone,
      onSome: (f) => Effect.asSome(fs.readFileString(f)),
    });
    const stamp = DateTime.formatIso(yield* DateTime.now);
    const sources = yield* Effect.forEach(input.files, (source) =>
      Effect.zipWith(fs.readFile(source), tryExtOf(name, source), (bytes, ext) => ({
        bytes,
        ext,
        made: 'import' as const,
        ...Option.match(prompt, { onNone: () => ({}), onSome: (p) => ({ prompt: p }) }),
        refs: [],
        from: Option.getOrElse(input.from, () => path.basename(source)),
        at: stamp,
      })),
    );
    // `--keep` names one of the images given, checked before the board is touched.
    const keep = yield* Option.match(input.keep, {
      onNone: () => Effect.succeedNone,
      onSome: (k) =>
        Effect.asSome(
          Effect.filterOrFail(
            Effect.succeed(k - 1),
            (i) => Number.isInteger(i) && i >= 0 && i < sources.length,
            () =>
              BoardRefused.make({
                film: name,
                reason: `--keep ${k} names none of the ${sources.length} images given`,
              }),
          ),
        ),
    });
    const made = yield* store.addTries(
      name,
      { id, beat: beatId, at },
      (b) => orderWith(beats, b, id),
      sources,
    );
    yield* Option.match(
      Option.flatMap(keep, (i) => Option.fromUndefinedOr(made[i])),
      {
        onNone: () => Effect.void,
        onSome: (t) => store.modify(name, (b) => pickTry(b, id, t.n, input.why)),
      },
    );
    for (const t of made) yield* Console.log(`imported ${id} try=${t.n} file=${t.file}`);
  }),
).pipe(Command.withDescription('Bring images made elsewhere into the board as tries of a panel'));

/** A text panel set: a card or a verse page, in place of a picture. */
const setText = (
  input: { film: string; panel: string },
  text: (beat: BoardBeat, at: BoardName) => Effect.Effect<PanelText, BoardRefused>,
) =>
  Effect.gen(function* () {
    const store = yield* BoardStore;
    const name = yield* filmNamed(input.film);
    const beats = yield* beatsOf(name);
    const { beat, beatId, at } = yield* panelIn(name, beats, input.panel);
    const id = panelId(beatId, at);
    const set = yield* text(beat, at);
    yield* store.modify(name, (b) => {
      const was = panelById(b, id);
      if (Option.isSome(was) && was.value.tries.length > 0)
        return Result.fail({
          reason: `panel ${id} has drawn tries: a card or a verse sits on a panel of its own`,
        });
      return Result.succeed(
        withPanel(b, { id, beat: beatId, at, tries: [], text: set }, orderWith(beats, b, id)),
      );
    });
    yield* Console.log(`${set._tag.toLowerCase()} ${id}`);
  });

const card = Command.make(
  'card',
  {
    film,
    panel: panelFlag,
    payoff: Flag.String('payoff').pipe(Flag.withDescription('the payoff word, set large')),
    to: Flag.String('to').pipe(
      Flag.withSchema(BoardName),
      Flag.optional,
      Flag.withDescription('the mark its words end before (the end of the line when none)'),
    ),
  },
  Effect.fn('film.board.card')(function* (input) {
    yield* setText(input, (beat, at) =>
      Effect.gen(function* () {
        const set = {
          _tag: 'Card',
          payoff: input.payoff,
          ...Option.match(input.to, { onNone: () => ({}), onSome: (to) => ({ to }) }),
        } as const;
        const said = Option.getOrElse(beat.say, () => '');
        yield* refusedIn(input.film)(cardLine(beat.id, said, at, set));
        return set;
      }),
    );
  }),
).pipe(
  Command.withDescription(
    "Make a panel a full-screen card: the line's words from its mark, as spoken, set in the film's card style (CRAFT rule 1)",
  ),
);

const verse = Command.make(
  'verse',
  {
    film,
    panel: panelFlag,
    ref: Flag.String('ref').pipe(Flag.withDescription('the reference, e.g. Job 9:2')),
    text: Flag.String('text').pipe(
      Flag.withDescription('the verse as printed, verbatim (bible verse)'),
    ),
    phrase: Flag.String('phrase').pipe(
      Flag.withDescription('the phrase highlighted: a run of its words'),
    ),
  },
  Effect.fn('film.board.verse')(function* (input) {
    yield* setText(input, () =>
      Bool.match(phraseIn(input.text, input.phrase), {
        onTrue: () =>
          Effect.succeed({
            _tag: 'Verse',
            ref: input.ref,
            text: input.text,
            phrase: input.phrase,
          } as const),
        onFalse: () =>
          Effect.fail(
            BoardRefused.make({
              film: input.film,
              reason: `the phrase "${input.phrase}" is no run of the words of "${input.text}" (set both verbatim)`,
            }),
          ),
      }),
    );
  }),
).pipe(Command.withDescription('Make a panel a verse on its page, its phrase highlighted'));

const tweak = Command.make(
  'tweak',
  {
    film,
    note: Argument.String('note').pipe(
      Argument.withDescription('the lab note asking for it, e.g. n12'),
    ),
    tries: Flag.Int('tries').pipe(
      Flag.withDefault(TRIES),
      Flag.withDescription('how many tries to make'),
    ),
  },
  Effect.fn('film.board.tweak')(function* (input) {
    const notes = yield* NotesStore;
    const name = yield* filmNamed(input.film);
    const file = yield* notes.read(name);
    const note = yield* Effect.fromOption(noteById(file, input.note)).pipe(
      Effect.mapError(() =>
        NoteNotFound.make({ film: name, id: input.note, known: file.notes.map((n) => n.id) }),
      ),
    );
    const path = yield* Path.Path;
    const done = yield* tweakPanel(
      name,
      yield* beatsOf(name),
      yield* actsOf(name),
      note,
      path.join(notes.paths(name).stills, note.still),
      input.tries,
      emit,
    );
    const said = `made ${Bool.match(done.tries.length === 1, { onTrue: () => 'try', onFalse: () => 'tries' })} ${done.tries.join(', ')} of ${done.panel} from this note: pick one on the board`;
    yield* notes.reply(name, note.id, { by: 'agent', text: said, still: Option.none() });
    yield* Console.log(`replied ${note.id} text="${said}"`);
  }),
).pipe(
  Command.withDescription(
    "Make a note's panel again from the try it was written on, its words and its sketch; reply to the note",
  ),
);

/** `film board`, with its subcommands; the image route is `okra image` (Codex route). */
export const board = Command.make(
  'board',
  {
    film,
    beat: Flag.String('beat').pipe(
      Flag.optional,
      Flag.withDescription('only these beats, comma-separated'),
    ),
    tries: Flag.Int('tries').pipe(Flag.withDefault(TRIES), Flag.withDescription('tries per panel')),
    lanes: Flag.Int('lanes').pipe(
      Flag.withDefault(MOST_LANES),
      Flag.withDescription(`beats drawn at once (at most ${MOST_LANES})`),
    ),
    dryRun: Flag.Boolean('dry-run').pipe(
      Flag.withDefault(false),
      Flag.withDescription('print each prompt and its references; draw nothing'),
    ),
  },
  Effect.fn('film.board')(function* (input) {
    const name = yield* filmNamed(input.film);
    yield* makeBoard(
      name,
      yield* beatsOf(name),
      yield* actsOf(name),
      {
        beats: Option.match(input.beat, {
          onNone: () => [],
          onSome: (b) =>
            b
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s !== ''),
        }),
        tries: input.tries,
        lanes: input.lanes,
        dryRun: input.dryRun,
      },
      emit,
    );
  }),
).pipe(
  Command.withDescription(
    "Draw the film's storyboard: each beat's panels at the marks its picture turns on, two tries each on okra image (Codex route)",
  ),
  Command.withSubcommands([style, importTries, card, verse, tweak]),
  Command.provide(ImageRoute.layer),
);
