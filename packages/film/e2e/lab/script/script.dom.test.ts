// The Script page in a browser, over the probe film with the lab API faked:
// a word clicked seeks to where it is said and selects it; a mark picked
// lists the cues tied to it, and a cue picked from that list is selected;
// and words selected, then Note… and Correct, post a note that carries
// them, what it asks and the words to say instead, which the reader paints
// on its line. What it posts the real notes store keeps (`notes.json`) and
// `film notes` prints, as the agent reads it.

import { BunServices } from '@effect/platform-bun';
import { Array as Arr, Effect, FileSystem, Layer, Option, Predicate, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import { type Note, NotePost, NotesFileJson } from '../../../src/core/schema.ts';
import {
  type Asked,
  type FakeRoute,
  type Json,
  DESK,
  PHONE,
  URL_T,
  json,
  openLab,
  route,
} from '../../../src/lab/fixtures/harness.ts';
import { PROBE, probeFilm } from '../../../src/lab/fixtures/probe-film.ts';
import {
  attributeIs,
  evaluates,
  textIs,
  textsAre,
  until,
  waitFor,
} from '../../../src/lab/fixtures/settled.ts';
import { WAIT_MS } from '../../../src/lab/fixtures/tab.ts';
import { FilmName } from '../../../src/tools/film-repo.ts';
import { NotesStore } from '../../../src/tools/notes-store.ts';
import { NOTES_LAB, notesCli, notesInMemory } from '../../../src/tools/testing.ts';

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

type JsonObject = { readonly [key: string]: Json };

const isObject = (value: Json): value is JsonObject =>
  Predicate.isObject(value) && !Array.isArray(value);

/**
 * The lab's notes, faked as its server keeps them: none at first; each the
 * page posts made a note (its draft, an id, its still's name, open), and
 * listed from then on.
 */
const keeping = (): ReadonlyArray<FakeRoute> => {
  const notes: Array<Json> = [];
  return [
    route('GET', /^\/notes$/, () => json({ film: PROBE, seq: notes.length, notes })),
    route('POST', /^\/notes$/, (asked) => {
      const seq = notes.length + 1;
      const id = `n${seq}`;
      const draft = Object.fromEntries(
        Object.entries(Option.getOrElse(Option.filter(asked.body, isObject), () => ({}))).filter(
          ([key]) => key !== 'still',
        ),
      );
      const made: Json = {
        ...draft,
        id,
        film: PROBE,
        seq,
        changed: seq,
        status: 'open',
        still: `${id}.png`,
        thread: [],
        createdAt: '2026-10-13T00:00:00.000Z',
      };
      notes.push(made);
      return json(made);
    }),
  ];
};

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

/** “rises slowly,” of beat one, corrected: what the page posts, the store keeps and `film notes` prints. */
const CORRECTED = {
  scene: 'one',
  words: Option.some({ beat: 'one', from: 2, to: 3, text: 'rises slowly,' }),
  kind: Option.some('correction' as const),
  replace: Option.some('climbs slowly,'),
  text: 'say “climbs slowly,” for “rises slowly,”',
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
    'words selected by a drag, then Note… and Correct: the note carries them, the store keeps them and film notes prints them',
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openLab(keeping(), {
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
        const body = Option.getOrThrow(Option.flatten(Option.fromUndefinedOr(posted(asked)[0])));
        const post = yield* Schema.decodeUnknownEffect(NotePost)(body);
        expect(asks(post)).toEqual(CORRECTED);
        // Its frame is where the first word is said.
        expect(Math.abs(post.T - saidAt('one', 2))).toBeLessThan(1 / 30);
        // What it posted, the notes store keeps in the film's notes.json, and film notes prints.
        const { still, ...draft } = post;
        yield* (yield* NotesStore).add(FilmName.make(PROBE), draft, still);
        const fs = yield* FileSystem.FileSystem;
        const kept = yield* Schema.decodeEffect(NotesFileJson)(
          yield* fs.readFileString(`${NOTES_LAB}/${PROBE}/notes.json`),
        );
        expect(kept.notes.map(asks)).toEqual([CORRECTED]);
        expect((yield* notesCli(PROBE)).lines[0]).toContain(
          ' words=one:2-3 said="rises slowly," kind=correction replace="climbs slowly," ',
        );
        expect(errors).toEqual([]);
      }).pipe(
        Effect.scoped,
        // The notes store and film notes over the probe film, in memory, and Bun's terminal.
        Effect.provide(Layer.merge(BunServices.layer, notesInMemory(PROBE))),
      ),
    SLOW,
  );

  it.live(
    'on a phone, Note… on the words selected opens the composer in a sheet, and a removal saves from it',
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openLab(keeping(), {
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
        expect(asks(yield* Schema.decodeUnknownEffect(NotePost)(body))).toEqual({
          scene: 'one',
          words: Option.some({ beat: 'one', from: 8, to: 9, text: 'down again.' }),
          kind: Option.some('removal'),
          replace: Option.none(),
          text: 'remove “down again.”',
        });
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
