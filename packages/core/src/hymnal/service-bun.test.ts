/**
 * The Bun hymnal adapter against a real SQLite file.
 *
 * The hymnal stores refrains as verses with negative ids (-1, -2, …) ahead of
 * stanza 0. Decoding them is the adapter's job, so it is tested here rather
 * than through `HymnalService.Test`, which never decodes anything.
 */

import { BunServices } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, FileSystem, Layer, Schema } from 'effect';

import { HymnId, VerseId } from '../types/ids.js';
import { HymnVerse, isRefrain } from './schemas.js';
import { HymnalService } from './service.js';
import { layerHymnalBun } from './service-bun.js';

const encodeVerses = Schema.encodeSync(Schema.fromJsonString(Schema.Array(HymnVerse)));

const writeHymnalWithRefrain = (dbPath: string) => {
  const db = new Database(dbPath);
  db.run('CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
  db.run(`CREATE TABLE hymns (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, verses TEXT NOT NULL,
    category TEXT NOT NULL, category_id INTEGER NOT NULL)`);
  db.run(`INSERT INTO categories VALUES (1, 'Adoration and Praise')`);
  db.query('INSERT INTO hymns VALUES (?, ?, ?, ?, ?)').run(
    2,
    'All Creatures of Our God and King',
    encodeVerses([
      HymnVerse.make({
        id: VerseId.make(-1),
        text: 'Oh, praise Him! Oh, praise Him!\nAlleluia, alleluia, alleluia!',
      }),
      HymnVerse.make({
        id: VerseId.make(0),
        text: 'All creatures of our God and King,\nLift up your voice with us and sing:',
      }),
      HymnVerse.make({ id: VerseId.make(1), text: 'O rushing wind and breezes soft,' }),
    ]),
    'Adoration and Praise',
    1,
  );
  db.close();
};

/** The real adapter over a fresh hymnal file holding one hymn with a refrain. */
const HymnalWithRefrain = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'hymnal-' });
    const dbPath = `${directory}/hymnal.db`;
    writeHymnalWithRefrain(dbPath);
    const provider = ConfigProvider.make((path) => {
      if (path.join('_') === 'HYMNAL_DB_PATH') {
        return Effect.succeed(ConfigProvider.makeValue(dbPath));
      }
      if (path.join('_') === 'HOME') return Effect.succeed(ConfigProvider.makeValue(directory));
      return Effect.undefined;
    });
    return layerHymnalBun.pipe(Layer.provide(ConfigProvider.layer(provider)));
  }),
).pipe(Layer.provide(BunServices.layer), Layer.fresh);

describe('layerHymnalBun', () => {
  it.effect('reads a hymn whose refrain carries a negative verse id', () =>
    Effect.gen(function* () {
      const hymn = yield* HymnalService.use((service) => service.getHymn(HymnId.make(2)));
      expect(hymn.verses.map((verse) => Number(verse.id))).toEqual([-1, 0, 1]);
      expect(hymn.verses.map(isRefrain)).toEqual([true, false, false]);
    }).pipe(Effect.provide(HymnalWithRefrain)),
  );

  it.effect('finds it by lyric and summarizes it by its opening stanza, not its refrain', () =>
    Effect.gen(function* () {
      const [match] = yield* HymnalService.use((service) => service.searchHymns('praise him'));
      expect(match?.id).toBe(HymnId.make(2));
      expect(match?.firstLine).toBe('All creatures of our God and King,');
    }).pipe(Effect.provide(HymnalWithRefrain)),
  );
});
