// The lab's server: one web handler for the lab's whole API (`LabHttpApi` in
// `core/api.ts`, where every path, body and answer is declared), for every
// film the app has, and its pages (`LabPage`). It tweaks a film (notes on
// frames, the scene source the cues and knobs write back to, Undo and Redo,
// the studio) and reviews it (the renders under the roots, the film's
// choices and its project), and runs for days: `film lab`, the box's unit.
//
// The notes read and write through NotesStore, so the page and `film notes`
// see the same file. The scene source routes write through SceneWriter: each
// write lands in the scene's `.ts` file, then `film check --static` runs
// fresh; Undo and Redo put the newest write back or make it again.
//
// The API rewrites source and is reached from a phone, so every request, the
// pages included, passes the one gate (`api-server.ts`): the bound port's
// loopback names and the hosts it is told (`FILM_LAB_HOSTS`), nothing else.

import type { AskStore } from './ask-store.ts';
import { asksGroup } from './asks-http.ts';
import {
  Array as Arr,
  Cache,
  Config,
  DateTime,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Record as Rec,
  Result,
} from 'effect';
import type { HttpPlatform } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';
import { LabHttpApi, type MarksPost, type TalkWordsPost } from '../core/api.ts';
import { SourceRefused, StagingTakeUnknown, StillUnknown } from '../core/refusals.ts';
import { SCRIPT_FILE, editMarks, marksTarget, sayMissed } from './script-source.ts';
import { ScriptVoices } from './script-voice.ts';
import { StagingCache } from './staging.ts';
import { type Allowed, type BesideRoutes, answered, serveApi } from './api-server.ts';
import { choicesGroup } from './choices-http.ts';
import { Easel } from './easel.ts';
import type { Choices } from './choices.ts';
import { LabPage, mixedAnswer } from './lab-page.ts';
import { projectGroup } from './project-http.ts';
import { productionsGroup } from './production-http.ts';
import { CACHE, serveFile } from './review-file.ts';
import { reviewGroup } from './review-http.ts';
import type { Review } from './review.ts';
import type { ContentStore } from './content-store.ts';
import {
  FilmFolder,
  type FilmName,
  Stamped,
  filmNamed,
  keptWhenMade,
  masterFile,
} from './film-repo.ts';
import { NotesStore } from './notes-store.ts';
import { BoardStore } from './board-store.ts';
import { approveBeat, pickTry, withdrawBeat } from '../core/board.ts';
import { readKnob, readSpans } from './scene-source.ts';
import { SceneHead } from './scene-head.ts';
import { SceneSources } from './scene-sources.ts';
import { type CueWritten, SceneWriter } from './scene-writer.ts';
import { type Follows, type Remade, SourceWriter, type Wrote } from './source-writer.ts';
import { FreshFilm } from './fresh-film.ts';
import { stepsGroup, writeAnswer } from './steps-http.ts';
import { type StudioReadings, studioGroup } from './studio.ts';
import type { Takes } from './takes.ts';
import {
  TALK_FILE,
  commentsMoved,
  editMark,
  editStrikes,
  markMissed,
  markTarget,
  strikeTarget,
  strikesMissed,
  talkCutIn,
  talkWords,
} from './talk-source.ts';

/** A cue written: the span as the file now reads it, and where it resolves (or why it does not). */
const cueWritten = Effect.fn('lab.cueWritten')(function* (
  film: FilmName,
  cue: string,
  done: CueWritten,
) {
  const { written, read } = done;
  const spans = readSpans(written.file, written.after, written.exportName);
  const span = Option.match(Rec.get(spans, cue), {
    onNone: () => ({}),
    onSome: (s) => ({ span: s }),
  });
  // Where the cue lands is the write's own check: run fresh, on the text the write made.
  const { _tag, ...where } = read;
  return yield* writeAnswer(film, written, Effect.succeed({ ...span, ...where }));
});

/** The notes on the film's frames. */
const notesGroup = HttpApiBuilder.group(LabHttpApi, 'notes', (handlers) =>
  handlers
    .handle('list', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          return yield* (yield* NotesStore).read(film);
        }),
      ),
    )
    .handle('add', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          const { still, ...draft } = payload;
          return yield* (yield* NotesStore).add(film, draft, still);
        }),
      ),
    )
    .handle('reply', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          return yield* (yield* NotesStore).reply(film, params.id, {
            by: 'user',
            text: payload.text,
            still: Option.none(),
          });
        }),
      ),
    )
    .handle('resolve', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          return yield* (yield* NotesStore).resolve(film, params.id);
        }),
      ),
    )
    .handle('wait', ({ params, query }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          return yield* (yield* NotesStore).wait(
            film,
            query.since,
            Duration.seconds(query.timeout),
          );
        }),
      ),
    )
    .handle('still', ({ params, request }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          const file = yield* (yield* NotesStore).still(film, params.name);
          if (Option.isNone(file)) return yield* StillUnknown.make({ film, name: params.name });
          // A still is named by its number, written once.
          return yield* serveFile(request, file.value, CACHE.derived);
        }),
      ),
    ),
);

/** The scene source the lab edits. */
const scenesGroup = HttpApiBuilder.group(LabHttpApi, 'scenes', (handlers) =>
  handlers
    .handle('source', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          const found = yield* (yield* SceneSources).editable(film, params.scene);
          return {
            scene: params.scene,
            file: found.site.shown,
            cues: found.cues,
            knobs: found.knobs,
            refused: found.refused,
          };
        }),
      ),
    )
    .handle('code', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          const { site, ...found } = yield* (yield* SceneSources).code(film, params.scene);
          return { scene: params.scene, file: site.shown, ...found };
        }),
      ),
    )
    .handle('head', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          const head = yield* (yield* SceneHead).head(film, params.scene);
          return {
            scene: params.scene,
            file: head.site.shown,
            timeline: head.timeline,
            knobs: head.knobs,
            codeChanged: head.codeChanged,
            sameData: head.sameData,
          };
        }),
      ),
    )
    .handle('cue', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          const { scene, cue } = params;
          const written = yield* (yield* SceneWriter).setCue(film, scene, cue, payload);
          return yield* cueWritten(film, cue, written);
        }),
      ),
    )
    .handle('knob', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          const { scene, knob } = params;
          const written = yield* (yield* SceneWriter).setKnob(film, scene, knob, payload.value);
          const read = Effect.succeed(
            Result.match(readKnob(written.file, written.after, written.exportName, knob), {
              onFailure: () => ({}),
              onSuccess: (v) =>
                Option.match(v, { onNone: () => ({}), onSome: (k) => ({ knob: k }) }),
            }),
          );
          return yield* writeAnswer(film, written, read);
        }),
      ),
    ),
);

/** A talk's file as a write and a refusal name it (`talk.ts`), and what the write sets. */
interface TalkAt {
  readonly file: string;
  readonly target: string;
}

/**
 * `film`'s talk edit (`talk.ts`): its path, and its name as a write and a
 * refusal name it. A drawn film has none, refused in those words.
 */
const talkFile = Effect.fn('lab.talkFile')(function* (film: FilmName, target: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join((yield* FilmFolder).paths(film).dir, TALK_FILE);
  if (!(yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false))))
    return yield* SourceRefused.make({
      file: TALK_FILE,
      target,
      reason: `${film} is not a talk: it has no ${TALK_FILE}`,
    });
  const at: TalkAt = { file: TALK_FILE, target };
  return { path: file, at };
});

/**
 * What follows a talk's edit: its track, mixed again from the takes in the
 * pieces the edit now cuts (`film mix`, fresh), answering when it landed.
 * No file it names comes or goes: the takes are the footage library's.
 */
const talkFollows = Effect.fn('lab.talkFollows')(function* (film: FilmName) {
  const fs = yield* FileSystem.FileSystem;
  const fresh = yield* FreshFilm;
  const track = masterFile((yield* FilmFolder).paths(film));
  const landed = Effect.suspend(() => fs.stat(track)).pipe(
    Effect.map((info): Remade => Option.map(info.mtime, (at) => at.getTime())),
    Effect.orElseSucceed((): Remade => Option.none()),
  );
  const follows: Follows = {
    bring: () => Effect.void,
    putAway: () => Effect.void,
    remake: Option.some(Effect.suspend(() => fresh.remix(film)).pipe(Effect.andThen(landed))),
  };
  return follows;
});

/**
 * One write of `name`'s talk, one `SourceWriter.write`: `edit` of its
 * `talk.ts` as it is now, read back by `verify`, and judged by the talk its
 * new text cuts (`talkCutIn`), so a talk left unplayable is refused in the
 * cut's words with nothing written; its track mixed again once it lands.
 * Answered as a scene write is, with the mix it made.
 */
const talkWrite = (
  name: string,
  section: string,
  target: string,
  edit: (at: TalkAt, source: string) => Result.Result<string, SourceRefused>,
  verify: (
    at: TalkAt,
    after: string,
    before: string,
  ) => Result.Result<ReadonlyArray<string>, SourceRefused>,
) =>
  answered(
    Effect.gen(function* () {
      const film = yield* filmNamed(name);
      const { path, at } = yield* talkFile(film, target);
      // The cut is judged over the footage library as it is when the text is.
      const reads = yield* Effect.context<
        ContentStore | FileSystem.FileSystem | FilmFolder | Path.Path
      >();
      const [change, , remade] = yield* (yield* SourceWriter).write({
        film,
        scene: Option.some(section),
        file: path,
        target,
        edit: (source) => edit(at, source),
        // What it set reads back, and every comment stands by the key it is about.
        verify: (after, before) =>
          Result.flatMap(verify(at, after, before), (missed) =>
            Result.map(commentsMoved(at, after, before), (moved) => [...missed, ...moved]),
          ),
        check: (after) => Effect.asVoid(talkCutIn(at, after)).pipe(Effect.provideContext(reads)),
        follows: yield* talkFollows(film),
      });
      const wrote: Wrote = { scene: Option.some(section), file: path, target, change };
      return yield* writeAnswer(film, wrote, mixedAnswer(film, remade));
    }),
  );

/** A Cut (`strike`) or a Restore of the words a request names, of the film its route names. */
const strikesWritten =
  (strike: boolean) =>
  ({
    params,
    payload,
  }: {
    readonly params: { readonly film: string };
    readonly payload: TalkWordsPost;
  }) => {
    const { section, from, to } = payload;
    return talkWrite(
      params.film,
      section,
      strikeTarget(strike, section, from, to),
      (at, source) => editStrikes(at, source, section, { from, to }, strike),
      (at, after, before) => strikesMissed(at, after, before, section, { from, to }, strike),
    );
  };

/** A talk's words as the Transcript view reads them, and its writes there: Cut, Restore, Mark here. */
const talkGroup = HttpApiBuilder.group(LabHttpApi, 'talk', (handlers) =>
  handlers
    .handle('words', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          const { path, at } = yield* talkFile(film, 'its words');
          const source = yield* (yield* FileSystem.FileSystem).readFileString(path);
          return talkWords(at.file, yield* talkCutIn(at, source));
        }),
      ),
    )
    .handle('cut', strikesWritten(true))
    .handle('restore', strikesWritten(false))
    .handle('mark', ({ params, payload }) =>
      talkWrite(
        params.film,
        payload.section,
        markTarget(payload.section, payload.name, payload.word),
        (at, source) => editMark(at, source, payload.section, payload.name, payload.word),
        (at, after) => markMissed(at, after, payload.section, payload.name, payload.word),
      ),
    ),
);

/** How many films' scripts the lab keeps read: one film, a few stamps of it. */
const SCRIPTS_KEPT = 8;

/**
 * The film's script as the Script page reads it beside the staged film:
 * each beat's picture and sources, read fresh (`FreshFilm.script`) and kept
 * under the film's source stamp, so a brief fixed while the lab is open is
 * read once after the change. A failed read is not kept.
 */
const scriptGroup = HttpApiBuilder.group(LabHttpApi, 'script', (handlers) =>
  Effect.gen(function* () {
    const fresh = yield* FreshFilm;
    const folder = yield* FilmFolder;
    const read = yield* Cache.makeWith((at: Stamped) => fresh.script(at.film), {
      capacity: SCRIPTS_KEPT,
      timeToLive: keptWhenMade,
    });
    return handlers
      .handle('beats', ({ params }) =>
        answered(
          Effect.gen(function* () {
            const film = yield* filmNamed(params.film);
            const stamp = yield* folder.stamp(film);
            return { film, beats: yield* Cache.get(read, new Stamped({ film, stamp })) };
          }),
        ),
      )
      .handle('voice', ({ params }) =>
        answered(
          Effect.gen(function* () {
            const film = yield* filmNamed(params.film);
            return yield* (yield* ScriptVoices).voice(film);
          }),
        ),
      )
      .handle('take', ({ params, request }) =>
        answered(
          Effect.gen(function* () {
            yield* filmNamed(params.film);
            const found = yield* (yield* StagingCache).audioNamed(params.file);
            if (Option.isNone(found)) return yield* StagingTakeUnknown.make({ file: params.file });
            // Named by its request's key, a take's audio never changes.
            return yield* serveFile(request, found.value, CACHE.hashed);
          }),
        ),
      )
      .handle('marks', ({ params, payload }) => marksWrite(params.film, payload));
  }),
);

/**
 * A beat's delivery marks written into the film's `script.ts`: one splice
 * of its `say` literal, read back only when the line parses with the words
 * it had and exactly the marks asked (`sayMissed`). Its staging take is
 * voiced again by the fill, under its new key; no take of the film's is
 * touched.
 */
const marksWrite = (name: string, payload: MarksPost) =>
  answered(
    Effect.gen(function* () {
      const film = yield* filmNamed(name);
      const path = yield* Path.Path;
      const file = path.join((yield* FilmFolder).paths(film).dir, SCRIPT_FILE);
      const target = marksTarget(payload.beat);
      const [change] = yield* (yield* SourceWriter).write({
        film,
        scene: Option.some(payload.beat),
        file,
        target,
        edit: (source) => editMarks(source, payload.beat, payload.marks),
        verify: (after, before) => sayMissed(after, before, payload.beat, payload.marks),
        check: () => Effect.void,
      });
      const wrote: Wrote = { scene: Option.some(payload.beat), file, target, change };
      return yield* writeAnswer(film, wrote, Effect.succeed({}));
    }),
  );

/**
 * The film's storyboard: its record, its images (named by panel and try,
 * written once), and a pick, an approval or a withdrawal written through
 * the board store, so the CLI and the lab never write over each other.
 */
const boardGroup = HttpApiBuilder.group(LabHttpApi, 'board', (handlers) =>
  handlers
    .handle('read', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          return yield* (yield* BoardStore).read(film);
        }),
      ),
    )
    .handle('file', ({ params, request }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          const file = yield* (yield* BoardStore).image(film, params.file);
          return yield* serveFile(request, file, CACHE.derived);
        }),
      ),
    )
    .handle('pick', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          const board = yield* (yield* BoardStore).modify(film, (b) =>
            pickTry(b, payload.panel, payload.try, payload.why),
          );
          yield* Effect.log(`board.pick film=${film} panel=${payload.panel} try=${payload.try}`);
          return board;
        }),
      ),
    )
    .handle('approve', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          const at = DateTime.formatIso(yield* DateTime.now);
          const board = yield* (yield* BoardStore).modify(film, (b) =>
            approveBeat(b, payload.beat, at),
          );
          yield* Effect.log(`board.approve film=${film} beat=${payload.beat}`);
          return board;
        }),
      ),
    )
    .handle('withdraw', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          const board = yield* (yield* BoardStore).modify(film, (b) =>
            withdrawBeat(b, payload.beat),
          );
          yield* Effect.log(`board.withdraw film=${film} beat=${payload.beat}`);
          return board;
        }),
      ),
    ),
);

/** The pages' build: a wait that answers once a source a build read changes, or the page's film is mixed, or at once for a page another server served. */
const pageGroup = HttpApiBuilder.group(LabHttpApi, 'page', (handlers) =>
  handlers.handle('wait', ({ query }) =>
    answered(
      Effect.flatMap(LabPage, (page) =>
        page.wait(
          {
            since: query.since,
            server: Option.fromUndefinedOr(query.server),
            film: Option.fromUndefinedOr(query.film),
          },
          Duration.seconds(query.timeout),
        ),
      ),
    ),
  ),
);

/** A look: stills of a scene as its sources stand, from the page the lab holds warm (`Easel`). */
const looksGroup = HttpApiBuilder.group(LabHttpApi, 'looks', (handlers) =>
  handlers.handle('take', ({ params, payload }) =>
    answered(
      Effect.gen(function* () {
        const film = yield* filmNamed(params.film);
        return yield* (yield* Easel).look(film, payload);
      }),
    ),
  ),
);

/**
 * The hosts the lab answers to beside loopback: `FILM_LAB_HOSTS`,
 * comma-separated Host values (`bite-cristian.exe.xyz:8229`); a page served
 * through one may write from `http://` or `https://` it.
 */
export const labAllowed = Config.String('FILM_LAB_HOSTS').pipe(
  Config.withDefault(''),
  Config.map((text): Allowed => ({
    hosts: text
      .split(',')
      .map((host) => host.trim())
      .filter((host) => host.length > 0),
  })),
);

/**
 * The lab's address as a reader opens it: the first host it is told, over
 * HTTPS (the box's proxy in front), else where it is bound (`bound`).
 */
export const labLink = (bound: string, allowed: Allowed): string =>
  Option.match(Arr.head(allowed.hosts), {
    onNone: () => bound,
    onSome: (host) => `https://${host}/`,
  });

/**
 * What the lab's handlers run with: the notes store, the film's folder, its
 * source (read, written, stepped), its takes, the renders' index, the
 * choices, the pages, and `FreshFilm` for every read of a film's modules.
 * The lab runs for days and keeps a module as it first imported it, so
 * nothing here loads a film (`FilmRepo`), the sound library
 * (`SoundLibrary`) or mixes in process (`Mixer`): the studio reads the
 * script and voice fresh (`StudioReadings`) and remixes fresh, a cue write is
 * judged and resolved fresh (SceneWriter's check), a scene's drawing is
 * located fresh (`SceneSources`), and a film's options are
 * read and heard fresh (`Choices`). `lab-context.types.ts` fails the
 * typecheck if a loader joins.
 */
export type LabContext =
  | NotesStore
  | AskStore
  | BoardStore
  | FileSystem.FileSystem
  | Path.Path
  | HttpPlatform.HttpPlatform
  | ContentStore
  | FilmFolder
  | SceneSources
  | SceneWriter
  | SourceWriter
  | SceneHead
  | FreshFilm
  | Takes
  | StudioReadings
  | ScriptVoices
  | StagingCache
  | Review
  | Choices
  | LabPage
  | Easel;

/**
 * The lab's whole server as one web handler over the services the caller
 * runs with (`LabContext`): every request passes the gate with `allowed`
 * first, the pages included, so a foreign Host reads nothing; then the API's
 * routes answer theirs, for any film the app has, and the pages the rest.
 * A fixture's own routes (`beside`, outside `/api/`) pass the same gate.
 * Closed when the scope closes.
 */
export const labHandler = Effect.fn('film.lab.handler')(function* (
  allowed: Allowed,
  beside: BesideRoutes = Layer.empty,
) {
  // The script's reads are kept for the server's life: its group is built over the services
  // the server runs with.
  const reads = yield* Effect.context<FreshFilm | FilmFolder>();
  const routes = HttpApiBuilder.layer(LabHttpApi).pipe(
    Layer.provide(
      Layer.mergeAll(
        notesGroup,
        scenesGroup,
        stepsGroup,
        talkGroup,
        Layer.provide(scriptGroup, Layer.succeedContext(reads)),
        boardGroup,
        studioGroup,
        reviewGroup,
        choicesGroup,
        projectGroup,
        pageGroup,
        looksGroup,
        productionsGroup,
        asksGroup,
      ),
    ),
  );
  const page = (yield* LabPage).answer;
  return yield* serveApi(LabHttpApi, routes, { allowed, page, beside });
});
