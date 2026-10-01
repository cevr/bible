// `film media push` into a folder store under a temp folder: two renders with
// one name in two film folders are kept apart, each under its path below
// FILMS_OUT, and a key the store holds with other bytes is refused, not
// replaced. Synthetic files only; nothing leaves the machine.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import {
  Cause,
  ConfigProvider,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
} from 'effect';
import { Command } from 'effect/cli';
import { StoreKeyTaken } from './errors.ts';
import { media } from './media-cli.ts';
import { folderStore } from './media-store.ts';
import { PrivateStore } from './private-store.ts';

/** The private store, a folder at `store`, and renders under `out`. */
const storeAt = (out: string, store: string) =>
  Layer.merge(
    Layer.effect(
      PrivateStore,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        return PrivateStore.of({ store: Effect.succeed(folderStore(fs, path, store)) });
      }),
    ),
    ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_OUT: out })),
  );

/** `film media …args` with renders under `out` and the store in `store`: how it ended. */
const run = (out: string, store: string, args: ReadonlyArray<string>) =>
  Command.runWith(media, { version: '0' })(args).pipe(
    Effect.provide(storeAt(out, store)),
    Effect.exit,
  );

/** Whether a run ended refusing a key the store holds with other bytes. */
const keyTaken = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.match(exit, {
    onSuccess: () => false,
    onFailure: (cause) => Option.exists(Cause.findErrorOption(cause), Schema.is(StoreKeyTaken)),
  });

describe('film media push', () => {
  it.effect.layer(BunServices.layer)(
    'keeps two renders of one name apart, and refuses a key held with other bytes',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = yield* fs.makeTempDirectoryScoped({ prefix: 'media-push-' });
        const out = path.join(home, 'out');
        const store = path.join(home, 'store');
        const sheet = (film: string) => path.join(out, film, 'contact.jpg');
        for (const film of ['a', 'b']) {
          yield* fs.makeDirectory(path.join(out, film), { recursive: true });
          yield* fs.writeFileString(sheet(film), `the contact sheet of ${film}`);
        }
        const held = (key: string) => fs.readFileString(path.join(store, 'renders', key));

        expect(Exit.isSuccess(yield* run(out, store, ['push', sheet('a'), sheet('b')]))).toBe(true);
        expect(yield* held('a/contact.jpg')).toBe('the contact sheet of a');
        expect(yield* held('b/contact.jpg')).toBe('the contact sheet of b');

        // Both named into one folder: the second would replace the first, so it is refused.
        yield* run(out, store, ['push', '--under', 'kept', sheet('a')]);
        const taken = yield* run(out, store, ['push', '--under', 'kept', sheet('b')]);
        expect(keyTaken(taken)).toBe(true);
        expect(yield* held('kept/contact.jpg')).toBe('the contact sheet of a');
      }).pipe(Effect.scoped),
  );
});
