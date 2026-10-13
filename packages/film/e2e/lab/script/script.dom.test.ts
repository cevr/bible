// The Script page in a browser, over the probe film with the lab API faked
// but for its notes, which the lab's own handler answers (`labHandler`, over
// a notes store in memory): a word clicked seeks to where it is said and
// selects it; a mark picked lists the cues tied to it, and a cue picked from
// that list is selected; and words selected, then Note… and Correct, post a
// note that carries them, what it asks and the words to say instead, which
// the reader paints on its line. What it posts reaches the lab's notes
// route, its store keeps (`notes.json`) and `film notes` prints, as the
// agent reads it. A correction saved with its words unchanged posts
// nothing: its labelled field is marked, described by why, and has the keys.

import { BunServices } from '@effect/platform-bun';
import { Array as Arr, Effect, FileSystem, Layer, Option, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { labUrls, pageHref } from '../../../src/core/api.ts';
import { type Note, NotePost, NotesFileJson } from '../../../src/core/schema.ts';
import {
  type Asked,
  type FakeRoute,
  type Json,
  DESK,
  PHONE,
  URL_T,
  json,
  madeBy,
  openLab,
  route,
  text as said,
} from '../../../src/lab/fixtures/harness.ts';
import { PROBE, probeFilm } from '../../../src/lab/fixtures/probe-film.ts';
import {
  attributeIs,
  describedBy,
  evaluates,
  textIs,
  textsAre,
  until,
  waitFor,
} from '../../../src/lab/fixtures/settled.ts';
import { WAIT_MS } from '../../../src/lab/fixtures/tab.ts';
import { labHandler } from '../../../src/tools/lab.ts';
import { NOTES_LAB, labInMemory, notesCli, text } from '../../../src/tools/testing.ts';

/** Long enough to open the Script, select, write and save, and read the notes back: twice a wait's own bound. */
const SLOW = 2 * WAIT_MS;

const placed = probeFilm().placed;

/** Where word `index` of beat `id`'s line is said, in film seconds, as the Script times its words. */
const saidAt = (id: string, index: number): number =>
  Option.getOrElse(
    Option.flatMap(
      Arr.findFirst(placed, (p) => p.spec.id === id),
      (p) =>
        Option.map(
          Option.fromUndefinedOr(p.voice.words[index]),
          (w) => p.start + p.speechStart + w.voiced.start,
        ),
    ),
    () => Number.NaN,
  );

/** A word of a beat's line, on the page. */
const word = (beat: string, index: number) => `[data-scene="${beat}"] [data-index="${index}"]`;

/** What the page's URL selects: `key`'s value in its query, '' for none. */
const selects = (key: string) => `(new URLSearchParams(location.search).get('${key}') ?? '')`;

/** An expression run in the page: whether `selector` matches, each after a space no line breaks at (so none starts a line). */
const heldBefore = (selector: string) =>
  `((all) => all.length > 0 && all.every((el) => el.previousSibling !== null && el.previousSibling.nodeType === Node.TEXT_NODE && el.previousSibling.textContent.endsWith('\\u00a0')))([...document.querySelectorAll('${selector}')])`;

/** The lab's handler, as `film lab` serves it: what its notes routes answer. */
type Lab = Effect.Success<ReturnType<typeof labHandler>>;

/** Where the lab's server listens: the one host its handler answers. */
const BOUND = { hostname: '127.0.0.1', port: 4401 } as const;

const JsonText = Schema.fromJsonString(Schema.Json);

/** What the lab's handler (`lab`) answers `method` on `path` with `body`: its JSON at its status, or its text when it is not JSON. */
const askLab = (lab: Lab, method: FakeRoute['method'], path: string, body: Option.Option<Json>) =>
  madeBy(
    Effect.gen(function* () {
      const sent = yield* Effect.transposeOption(Option.map(body, Schema.encodeEffect(JsonText)));
      const response = yield* Effect.promise(() =>
        lab(
          new Request(`http://${BOUND.hostname}:${BOUND.port}${path}`, {
            method,
            headers: { 'content-type': 'application/json' },
            body: Option.getOrUndefined(sent),
          }),
          BOUND,
        ),
      );
      const answered = yield* Effect.promise(() => response.text());
      return Option.match(Schema.decodeOption(JsonText)(answered), {
        onNone: () => said(answered, response.status),
        onSome: (value) => json(value, response.status),
      });
    }).pipe(Effect.orDie),
  );

/**
 * The probe film's notes, answered by the lab's own handler (`lab`): what
 * the page lists and posts reaches its routes and the notes store behind
 * them, as `film lab` serves them.
 */
const labNotes = (lab: Lab): ReadonlyArray<FakeRoute> => [
  route('GET', /^\/notes$/, () =>
    askLab(lab, 'GET', labUrls.notes.list({ params: { film: PROBE } }), Option.none()),
  ),
  route('POST', /^\/notes$/, (asked) =>
    askLab(lab, 'POST', labUrls.notes.add({ params: { film: PROBE } }), asked.body),
  ),
];

/**
 * `effect` over the lab's services in memory, the probe film's folder among
 * its films and its notes kept there, fresh for each test, with Bun's
 * terminal beside them.
 */
const overTheLab = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.provide(
    effect,
    Layer.merge(
      BunServices.layer,
      labInMemory(new Map([[`/films/${PROBE}/scenes/index.ts`, text('export default []')]])),
    ),
  );

/** The notes the page posted, in order. */
const posted = (asked: ReadonlyArray<Asked>) =>
  asked.filter((a) => a.method === 'POST' && a.path === '/notes').map((a) => a.body);

/** What a note asks of its words, as the Script posts it: its words, its kind and a correction's words instead. */
const asks = (note: Pick<Note, 'scene' | 'words' | 'kind' | 'replace' | 'text'>) => ({
  scene: note.scene,
  words: Option.fromUndefinedOr(note.words),
  kind: Option.fromUndefinedOr(note.kind),
  replace: Option.fromUndefinedOr(note.replace),
  text: note.text,
});

/** The notes the lab's store keeps for the probe film (`notes.json`), as what each asks. */
const kept = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const file = yield* Schema.decodeEffect(NotesFileJson)(
    yield* fs.readFileString(`${NOTES_LAB}/${PROBE}/notes.json`),
  );
  return file.notes.map(asks);
});

/** “rises slowly,” of beat one, corrected: what the page posts, the store keeps and `film notes` prints. */
const CORRECTED = {
  scene: 'one',
  words: Option.some({ beat: 'one', from: 2, to: 3, text: 'rises slowly,' }),
  kind: Option.some('correction' as const),
  replace: Option.some('climbs slowly,'),
  text: 'say “climbs slowly,” for “rises slowly,”',
};

/** “down again.” of beat one, removed: what the page posts and the store keeps. */
const REMOVED = {
  scene: 'one',
  words: Option.some({ beat: 'one', from: 8, to: 9, text: 'down again.' }),
  kind: Option.some('removal' as const),
  replace: Option.none(),
  text: 'remove “down again.”',
};

describe('the Script', () => {
  for (const [name, viewport] of [
    ['1440', DESK],
    ['390', PHONE],
  ] as const)
    it.live(`at ${name}, a word clicked seeks to where it is said and selects it`, () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openLab([], {
          href: pageHref.scriptBeat(PROBE, 'one'),
          viewport,
        });
        yield* page.click(word('one', 7));
        yield* until(page, `${selects('words')} === '7-7'`);
        yield* evaluates(page, `Math.abs(${URL_T} - ${saidAt('one', 7)}) < 0.04`, true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    );

  it.live('a mark picked lists the cues tied to it; a cue picked from the list is selected', () =>
    Effect.gen(function* () {
      const { page, errors } = yield* openLab([], { href: pageHref.scriptBeat(PROBE, 'three') });
      yield* page.click('[data-scene="three"] .lab-script-mark[data-mark="near"]');
      yield* until(page, `${selects('mark')} === 'near'`);
      yield* textsAre(page, '[data-scene="three"] .lab-script-tie-name', ['push']);
      yield* page.click('[data-scene="three"] .lab-script-tie');
      yield* until(page, `${selects('cue')} === 'push' && ${selects('mark')} === ''`);
      yield* attributeIs(page, '[data-scene="three"] .lab-script-tie', 'aria-current', 'true');
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live(
    "words selected by a drag, then Note… and Correct: the lab's notes route keeps the note, its words and what it asks, and film notes prints them",
    () =>
      overTheLab(
        Effect.gen(function* () {
          const lab = yield* labHandler({ hosts: [] });
          const { page, asked, errors } = yield* openLab(labNotes(lab), {
            href: pageHref.scriptBeat(PROBE, 'one'),
          });
          // A drag across two words selects them, as a text selection.
          const from = yield* page.box(word('one', 2));
          const to = yield* page.box(word('one', 3));
          yield* page.mouse.move(from.x + 2, from.y + from.height / 2);
          yield* page.mouse.down;
          yield* page.mouse.move(to.x + to.width - 2, to.y + to.height / 2, 5);
          yield* page.mouse.up;
          yield* until(page, `${selects('words')} === '2-3'`);
          yield* page.click('[data-act="note-words"]');
          yield* waitFor(page, '[data-role="script-compose"] .lab-compose:not([hidden])');
          yield* page.click('[data-role="script-compose"] [data-ask="correction"]');
          yield* waitFor(page, '[data-role="script-compose"] .lab-instead');
          yield* page.fill('[data-role="script-compose"] .lab-instead', 'climbs slowly,');
          yield* page.click('[data-role="script-compose"] button[type="submit"]');
          // Saved, the note is selected: its words struck, the words instead after them, its marker.
          yield* until(page, `${selects('note')} === 'n1'`);
          yield* textIs(page, '[data-scene="one"] .lab-script-instead', 'climbs slowly,');
          yield* waitFor(page, '[data-scene="one"] .lab-script-noted[data-note="n1"]');
          // The words instead and the marker are held to the words before them by spaces no line
          // breaks at, so neither starts a line away from the words the note is on.
          yield* evaluates(page, heldBefore('[data-scene="one"] .lab-script-instead'), true);
          yield* evaluates(page, heldBefore('[data-scene="one"] .lab-script-noted'), true);
          const body = Option.getOrThrow(Option.flatten(Option.fromUndefinedOr(posted(asked)[0])));
          const post = yield* Schema.decodeUnknownEffect(NotePost)(body);
          expect(asks(post)).toEqual(CORRECTED);
          // Its frame is where the first word is said.
          expect(Math.abs(post.T - saidAt('one', 2))).toBeLessThan(1 / 30);
          // The lab's route kept it in the film's notes.json, and film notes prints it.
          expect(yield* kept).toEqual([CORRECTED]);
          expect((yield* notesCli(PROBE)).lines[0]).toContain(
            ' words=one:2-3 said="rises slowly," kind=correction replace="climbs slowly," ',
          );
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      ),
    SLOW,
  );

  it.live(
    'a correction saved with its words unchanged marks their field, says why beside it and takes the keys there, until a word is written in it',
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openLab([], {
          href: pageHref.scriptBeat(PROBE, 'one', { words: '2-3' }),
        });
        const compose = '[data-role="script-compose"]';
        const instead = `${compose} .lab-instead`;
        yield* page.click('[data-act="note-words"]');
        yield* waitFor(page, `${compose} .lab-compose:not([hidden])`);
        yield* page.click(`${compose} [data-ask="correction"]`);
        // The field is labelled where it stands, its label the name it is known by.
        yield* textIs(page, `${compose} .lab-instead-field .lab-field-label`, 'Say instead');
        yield* evaluates(
          page,
          `document.querySelector('${instead}').labels[0].textContent`,
          'Say instead',
        );
        yield* attributeIs(page, instead, 'aria-invalid', 'false');
        yield* page.click(`${compose} button[type="submit"]`);
        yield* attributeIs(page, instead, 'aria-invalid', 'true');
        yield* evaluates(page, describedBy(instead), 'Write the words to say instead.');
        yield* evaluates(
          page,
          `document.activeElement === document.querySelector('${instead}')`,
          true,
        );
        yield* attributeIs(page, `${compose} textarea`, 'aria-invalid', 'false');
        // A word written in the field clears it: no longer invalid, nothing said of it.
        yield* page.fill(instead, 'climbs slowly,');
        yield* attributeIs(page, instead, 'aria-invalid', 'false');
        yield* evaluates(page, describedBy(instead), '');
        expect(posted(asked)).toEqual([]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
  );

  it.live(
    "on a phone, Note… on the words selected opens the composer in a sheet, and a removal saves from it to the lab's notes",
    () =>
      overTheLab(
        Effect.gen(function* () {
          const lab = yield* labHandler({ hosts: [] });
          const { page, asked, errors } = yield* openLab(labNotes(lab), {
            href: pageHref.scriptBeat(PROBE, 'one', { words: '8-9' }),
            viewport: PHONE,
          });
          yield* page.click('[data-act="note-words"]');
          const sheet = '.lab-script-sheet';
          yield* waitFor(page, `${sheet} .lab-compose:not([hidden])`);
          yield* page.click(`${sheet} [data-ask="removal"]`);
          yield* page.click(`${sheet} button[type="submit"]`);
          yield* until(page, `${selects('note')} === 'n1' && !document.querySelector('${sheet}')`);
          yield* waitFor(page, '[data-scene="one"] .lab-script-noted[data-note="n1"]');
          const body = Option.getOrThrow(Option.flatten(Option.fromUndefinedOr(posted(asked)[0])));
          expect(asks(yield* Schema.decodeUnknownEffect(NotePost)(body))).toEqual(REMOVED);
          expect(yield* kept).toEqual([REMOVED]);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      ),
    SLOW,
  );
});
