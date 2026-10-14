// The Board's sketch and note in a browser, over the probe film with the lab
// API faked: a sketch drawn on a panel's try stays through a view change and
// a fresh one starts on another try, while the note's words carry to it; a
// post that fails keeps the words and the sketch, one that lands clears them,
// and words written while a post is on its way stay when it lands. A try's
// image is served, so a note's still is made from it.

import { BunServices } from '@effect/platform-bun';
import { Deferred, Effect, Exit, FileSystem, Path } from 'effect';
import { Base64 } from 'effect/encoding';
import { describe, expect, it } from 'effect-bun-test';
import { ServerFailed, pageHref } from '../../../src/core/api.ts';
import {
  type FakeRoute,
  file,
  json,
  later,
  openLab,
  refused,
  route,
} from '../../../src/lab/fixtures/harness.ts';
import { PROBE } from '../../../src/lab/fixtures/probe-film.ts';
import { countIs, textHas, valueIs, waitFor } from '../../../src/lab/fixtures/settled.ts';
import type { Tab } from '../../../src/lab/fixtures/tab.ts';

const SLOW = 30_000;

/** A 1 × 1 PNG: the image every try of the probe board is served as. */
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** The PNG, on disk for the case: removed with its scope. */
const pngFile = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'board-try-' });
  const at = path.join(dir, 'try.png');
  yield* fs.writeFile(at, yield* Effect.fromResult(Base64.decode(PNG)).pipe(Effect.orDie));
  return at;
}).pipe(Effect.provide(BunServices.layer));

/** The note a post makes, as the server answers it. */
const made = (id: string) =>
  json({
    scene: 'one',
    T: 2,
    frame: 60,
    text: 'x',
    id,
    film: PROBE,
    seq: 1,
    changed: 1,
    status: 'open',
    still: `${id}.png`,
    thread: [],
    createdAt: '2026-10-14T00:00:00.000Z',
  });

const ITEMS = '.lab-sketch-items > *';
const TEXT = '.lab-board-text';
const COMMENT = '.lab-board-actions button:first-child';
const ASKED = '.lab-board-asked';

/** The Board open on beat one's `fall` panel in its draw view, every try's image served as `png`. */
const drawing = (png: string, routes: ReadonlyArray<FakeRoute>) =>
  Effect.gen(function* () {
    const opened = yield* openLab(
      [route('GET', /^\/board\/files\/[\w.]+\.png$/, () => file(png)), ...routes],
      { href: pageHref.boardBeat(PROBE, 'one', { panel: 'fall', view: 'draw' }) },
    );
    yield* waitFor(opened.page, '.lab-board-open');
    yield* waitFor(opened.page, '[aria-label="Pen"]');
    yield* opened.page.click('[aria-label="Pen"]');
    return opened;
  });

/** A pen stroke across the frame's upper third, `n`th of the case (each a little lower). */
const stroke = (page: Tab, n: number) =>
  Effect.gen(function* () {
    const box = yield* page.box('.lab-overlay');
    const y = box.y + box.height * (0.2 + n * 0.1);
    yield* page.mouse.move(box.x + box.width * 0.2, y);
    yield* page.mouse.down;
    yield* page.mouse.move(box.x + box.width * 0.6, y + 12, 8);
    yield* page.mouse.up;
  });

describe('the Board: a sketch and a note on a panel', () => {
  it.live(
    'a sketch stays through a view change, another try starts a fresh one, and the words carry to it',
    () =>
      Effect.gen(function* () {
        const png = yield* pngFile;
        const { page, errors } = yield* drawing(png, []);
        yield* stroke(page, 0);
        yield* countIs(page, ITEMS, 1);
        yield* page.fill(TEXT, 'lift the arm higher');
        // Compare, then Draw again: the same panel and try, so the same sketch and words.
        yield* page.click('[data-view="compare"]');
        yield* page.click('[data-view="draw"]');
        yield* countIs(page, ITEMS, 1);
        yield* valueIs(page, TEXT, 'lift the arm higher');
        // Try 2: a sketch is drawn on one image, so it starts fresh; the words are the panel's.
        yield* page.click('.lab-board-try[aria-pressed="false"]');
        yield* countIs(page, ITEMS, 0);
        yield* valueIs(page, TEXT, 'lift the arm higher');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a failed post keeps the words and the sketch; a landed one clears only what it sent',
    () =>
      Effect.gen(function* () {
        const png = yield* pngFile;
        const gate = yield* Deferred.make<void>();
        let posts = 0;
        const { page, errors } = yield* drawing(png, [
          route('POST', /^\/notes$/, () => {
            posts += 1;
            if (posts === 1)
              return refused(
                ServerFailed.make({ tag: 'StoreFailed', reason: 'the notes file is locked' }),
              );
            if (posts === 2) return made('n1');
            return later(gate, made('n2'));
          }),
        ]);
        // Refused: the words and the sketch are still there to send again.
        yield* stroke(page, 0);
        yield* page.fill(TEXT, 'the stack is too tall');
        yield* page.click(COMMENT);
        yield* textHas(page, ASKED, 'the notes file is locked');
        yield* valueIs(page, TEXT, 'the stack is too tall');
        yield* countIs(page, ITEMS, 1);
        // Landed: what it sent is cleared.
        yield* page.click(COMMENT);
        yield* textHas(page, ASKED, 'Posted n1');
        yield* valueIs(page, TEXT, '');
        yield* countIs(page, ITEMS, 0);
        // On its way: words written and a stroke drawn meanwhile stay once it lands.
        yield* stroke(page, 1);
        yield* page.fill(TEXT, 'and the judge smaller');
        yield* page.click(COMMENT);
        yield* textHas(page, ASKED, '…');
        yield* page.fill(TEXT, 'and the gavel lower');
        yield* stroke(page, 2);
        yield* Deferred.done(gate, Exit.void);
        yield* textHas(page, ASKED, 'Posted n2');
        yield* valueIs(page, TEXT, 'and the gavel lower');
        yield* countIs(page, ITEMS, 2);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
