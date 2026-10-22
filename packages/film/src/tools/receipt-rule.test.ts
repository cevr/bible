// The receipt rule is one sentence the code, its docs and the kit that reads
// receipts all hold: its words are the doc of `receipted` in `ask-store.ts`,
// and each place that states the rule states those words, read as prose (a
// comment's markers and line breaks, a table's spacing and case aside). A
// rule reworded in one place and not the others fails here.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option } from 'effect';
import { BunServices } from '@effect/platform-bun';

/** The repo's root, from this file. */
const ROOT = `${import.meta.dir}/../../../..`;

/** The rule, word for word. */
const RULE =
  "An image whose src the receipt names is served only as its copy. Each file-served image of an image block or an option is copied as the ask is made, or the make is refused (`AskRefused`, naming the src). A board block's panels and a video's poster or frame show live and bind nothing.";

/** Each place that states the rule, from the root. */
const PLACES = [
  'packages/film/src/tools/ask-store.ts',
  'packages/film/src/tools/asks-http.ts',
  'packages/film/src/core/ask.ts',
  'packages/film/src/core/api.ts',
  'packages/film/README.md',
  'docs/lessons.md',
  'apps/firsttheblade/kit/approval.ts',
];

/** `text` read as prose: a comment's markers and every run of space dropped to one, in lower case. */
const prose = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(/^\s*(\/\/|\/\*\*|\*\/|\*)?\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const read = (place: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.readFileString(`${ROOT}/${place}`));

describe('the receipt rule', () => {
  it.effect('is the doc of receipted in ask-store.ts, its first three sentences', () =>
    Effect.gen(function* () {
      const store = yield* read('packages/film/src/tools/ask-store.ts');
      const doc = Option.fromNullishOr(
        /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*const receipted =/.exec(store)?.[1],
      );
      const sentences = Option.map(doc, (d) =>
        prose(d)
          .trim()
          .split(/(?<=\.) /)
          .slice(0, 3)
          .join(' '),
      );
      expect(sentences).toEqual(Option.some(`the receipt rule: ${prose(RULE)}`));
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('is stated word for word in each place that states it', () =>
    Effect.gen(function* () {
      const missing = yield* Effect.filter(PLACES, (place) =>
        Effect.map(read(place), (text) => !prose(text).includes(prose(RULE))),
      );
      expect(missing).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
