// The lab's routes as the page calls them: a note posted with its still is
// listed and served, a wait hands back the change, a user reply reopens the
// thread, and a bad body or an unknown note answers with its status.

import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, Encoding, Layer, Path, Schema } from 'effect';
import { NotesFile, NotesWait } from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import { labHandler } from './lab.ts';
import { NotesStore } from './notes-store.ts';
import { memoryFileSystem, text } from './testing.ts';

const files = () => new Map<string, Uint8Array>();

const labLayer = (store: Map<string, Uint8Array>) =>
  NotesStore.layer.pipe(
    Layer.provide(ContentStore.layer),
    Layer.provideMerge([
      memoryFileSystem(store),
      Path.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_LAB: '/lab' })),
    ]),
  );

const png = text('frame');

const request = (method: string, path: string, body?: string) =>
  new Request(`http://lab.test${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  });

const draft = `{"scene":"hand","T":230.38,"frame":6911,"cue":{"name":"topple","edge":"end"},"box":{"x":860,"y":640,"w":200,"h":120},"text":"too low","still":"${Encoding.encodeBase64(png)}"}`;

describe('lab routes', () => {
  it.effect('a posted note is listed, its still served, and a wait returns it', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler('f');
      const posted = yield* Effect.promise(() => lab(request('POST', '/lab/notes', draft)));
      expect(posted.status).toBe(200);
      const listed = yield* Effect.promise(() =>
        lab(request('GET', '/lab/notes')).then((r) => r.json()),
      );
      const file = yield* Schema.decodeUnknownEffect(NotesFile)(listed);
      expect(file.notes.map((n) => [n.id, n.scene, n.cue?.name, n.still])).toEqual([
        ['n1', 'hand', 'topple', 'n1.png'],
      ]);
      const still = yield* Effect.promise(() => lab(request('GET', '/lab/stills/n1.png')));
      expect(still.headers.get('content-type')).toBe('image/png');
      expect(new Uint8Array(yield* Effect.promise(() => still.arrayBuffer()))).toEqual(png);
      const waited = yield* Effect.promise(() =>
        lab(request('GET', '/lab/notes/wait?since=0&timeout=1')).then((r) => r.json()),
      );
      const wait = yield* Schema.decodeUnknownEffect(NotesWait)(waited);
      expect(wait.events.map((e) => e._tag)).toEqual(['NoteAdded']);
      expect(wait.cursor).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(labLayer(files()))),
  );

  it.effect('a user reply reopens the note; resolve closes it', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler('f');
      yield* Effect.promise(() => lab(request('POST', '/lab/notes', draft)));
      const replied = yield* Effect.promise(() =>
        lab(request('POST', '/lab/notes/n1/reply', '{"text":"lower still"}')).then((r) => r.json()),
      );
      expect(replied).toMatchObject({
        status: 'open',
        thread: [{ by: 'user', text: 'lower still' }],
      });
      const resolved = yield* Effect.promise(() =>
        lab(request('POST', '/lab/notes/n1/resolve', '{}')).then((r) => r.json()),
      );
      expect(resolved).toMatchObject({ status: 'resolved' });
    }).pipe(Effect.scoped, Effect.provide(labLayer(files()))),
  );

  it.effect('a bad body is a 400, an unknown note a 404, a path for a still a 404', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler('f');
      const status = (req: Request) => Effect.promise(() => lab(req).then((r) => r.status));
      expect(yield* status(request('POST', '/lab/notes', '{"scene":"hand"}'))).toBe(400);
      expect(yield* status(request('POST', '/lab/notes/n9/resolve', '{}'))).toBe(404);
      expect(yield* status(request('GET', '/lab/stills/..%2Fnotes.json'))).toBe(404);
    }).pipe(Effect.scoped, Effect.provide(labLayer(files()))),
  );
});
