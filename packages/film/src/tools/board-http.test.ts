// The board's routes as the Board page calls them: the record read (an empty
// board before the first panel), an image it names served and one it does
// not refused, a try kept with why, a beat's board approved once every
// picture panel keeps a try, then withdrawn; a refusal answers 422 naming why.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Schema } from 'effect';
import { labUrls } from '../core/api.ts';
import { type BoardFile, BoardFileJson, BoardName } from '../core/board.ts';
import { Segment } from '../core/segment.ts';
import { labHandler } from './lab.ts';
import { labInMemory, text } from './testing.ts';

const tried = (n: number) => ({
  n,
  file: Segment.make(`cold.righteous.${n}.png`),
  sha256: `s${n}`,
  made: 'import' as const,
  refs: [],
  at: '2026-10-14T00:00:00.000Z',
});

const board: BoardFile = {
  film: 'f',
  panels: [
    {
      id: 'cold.righteous',
      beat: BoardName.make('cold'),
      at: BoardName.make('righteous'),
      tries: [tried(1), tried(2)],
    },
  ],
  approvals: [],
};

/** Film `f` with its board record and its first try's image. */
const files = () =>
  new Map<string, Uint8Array>([
    ['/films/f/scenes/index.ts', text('export {};\n')],
    ['/films/f/board.json', text(Schema.encodeSync(BoardFileJson)(board))],
    ['/films/f/board/cold.righteous.1.png', text('image one')],
    ['/films/f/v1/script.ts', text('export const script = [];\n')],
    ['/films/f/v1/board.json', text(Schema.encodeSync(BoardFileJson)(board))],
    ['/films/f/v1/board/cold.righteous.2.png', text('v1 image two')],
  ]);

const at = (path: string) => `http://127.0.0.1:4401${path}`;
const bound = { hostname: '127.0.0.1', port: 4401 } as const;
/** A board post's body: what the page sends. */
const Body = Schema.Struct({
  panel: Schema.optionalKey(Schema.String),
  try: Schema.optionalKey(Schema.Finite),
  why: Schema.optionalKey(Schema.String),
  beat: Schema.optionalKey(Schema.String),
});
const post = (path: string, body: typeof Body.Type) =>
  new Request(at(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: Schema.encodeSync(Schema.fromJsonString(Body))(body),
  });
const get = (path: string) => new Request(at(path), { method: 'GET' });

describe('the board routes', () => {
  it.effect('read the record, serve an image it names and refuse one it does not', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler();
      const read = yield* Effect.promise(() =>
        lab(get(labUrls.board.read({ params: { film: 'f' } })), bound),
      );
      expect(read.status).toBe(200);
      const got = yield* Effect.promise(() => read.json());
      expect(got.panels[0].id).toBe('cold.righteous');
      const image = yield* Effect.promise(() =>
        lab(
          get(
            labUrls.board.file({ params: { film: 'f', file: 'cold.righteous.1.png' }, query: {} }),
          ),
          bound,
        ),
      );
      expect([image.status, yield* Effect.promise(() => image.text())]).toEqual([200, 'image one']);
      for (const file of ['cold.righteous.2.png', 'notes.json']) {
        const missing = yield* Effect.promise(() =>
          lab(get(labUrls.board.file({ params: { film: 'f', file }, query: {} })), bound),
        );
        expect([file, missing.status]).toEqual([file, 404]);
      }
    }).pipe(Effect.scoped, Effect.provide(labInMemory(files()))),
  );

  it.effect("serve a version folder's image from its own Board, and not the film's", () =>
    Effect.gen(function* () {
      const lab = yield* labHandler();
      const ask = (file: string, query: { readonly folder?: Segment }) =>
        Effect.promise(() =>
          lab(get(labUrls.board.file({ params: { film: 'f', file }, query })), bound),
        );
      const v1Folder = { folder: Segment.make('v1') };
      const v1 = yield* ask('cold.righteous.2.png', v1Folder);
      expect([v1.status, yield* Effect.promise(() => v1.text())]).toEqual([200, 'v1 image two']);
      expect((yield* ask('cold.righteous.1.png', v1Folder)).status).toBe(404);
      expect((yield* ask('cold.righteous.2.png', {})).status).toBe(404);
    }).pipe(Effect.scoped, Effect.provide(labInMemory(files()))),
  );

  it.effect('keep a try with why, approve the beat, withdraw it; refuse what the board lacks', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler();
      const ask = (path: string, body: typeof Body.Type) =>
        Effect.gen(function* () {
          const r = yield* Effect.promise(() => lab(post(path, body), bound));
          return { status: r.status, body: yield* Effect.promise(() => r.json()) };
        });
      const early = yield* ask(labUrls.board.approve({ params: { film: 'f' } }), { beat: 'cold' });
      expect(early.status).toBe(422);
      expect(early.body.reason).toBe('pick a try of cold.righteous first');
      const picked = yield* ask(labUrls.board.pick({ params: { film: 'f' } }), {
        panel: 'cold.righteous',
        try: 2,
        why: 'the calmer judge',
      });
      expect(picked.status).toBe(200);
      expect(picked.body.panels[0]).toMatchObject({ kept: 2, why: 'the calmer judge' });
      const approved = yield* ask(labUrls.board.approve({ params: { film: 'f' } }), {
        beat: 'cold',
      });
      expect(approved.body.approvals.map((a: { beat: string }) => a.beat)).toEqual(['cold']);
      const withdrawn = yield* ask(labUrls.board.withdraw({ params: { film: 'f' } }), {
        beat: 'cold',
      });
      expect(withdrawn.body.approvals).toEqual([]);
      const unknown = yield* ask(labUrls.board.pick({ params: { film: 'f' } }), {
        panel: 'cold.job',
        try: 1,
      });
      expect([unknown.status, unknown.body._tag]).toEqual([422, 'BoardRefused']);
    }).pipe(Effect.scoped, Effect.provide(labInMemory(files()))),
  );
});
