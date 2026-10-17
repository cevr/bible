// The studio hears one voice at a time, on a laptop (1440 × 900) and a phone
// (390 × 844): Voice's take heard, the reader's Hear pauses it; the studio's
// Play then pauses the reader's. The audio is the page's own (`Media`): each
// element a play is asked of is kept as it plays, so the case reads whether
// each one plays from the media itself, not from its button. Every wait is on
// what the page shows or holds, never on time: the takes are a minute long,
// so a take found paused was paused, never ended.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import {
  DESK,
  type Json,
  PHONE,
  json,
  openPlayer,
  route,
} from '../../../src/lab/fixtures/harness.ts';
import { PROBE } from '../../../src/lab/fixtures/probe-film.ts';
import { attributeIs, until, waitFor } from '../../../src/lab/fixtures/settled.ts';
import { tone } from '../../../src/lab/fixtures/tone.ts';

const SLOW = 30_000;

/** A minute of tone: longer than the case, so no take ends by itself. */
const MINUTE = { _tag: 'Wav', bytes: tone(60, 0.1) } as const;

const SIZES = [
  { name: 'a laptop', viewport: DESK },
  { name: 'a phone', viewport: PHONE },
] as const;

/** Beat one's take kept, as the studio's takes read answers it. */
const KEPT_TAKE: Json = {
  beat: 'one',
  attempts: [
    {
      file: 'one.kept.flac',
      transcript: 'the ball climbs and falls',
      wer: 0,
      at: 1,
      duration: 9,
      kept: true,
      current: true,
    },
  ],
};

/** A word of a staging take, at `at` seconds. */
const word = (text: string, at: number): Json => ({
  text,
  start: at,
  end: at + 1,
  voiced: { start: at, end: at + 1 },
});

/** Beat one's staging take ready (long, so it plays on through the case), as `GET …/script/voice` answers. */
const VOICE: Json = {
  film: PROBE,
  spent: 0,
  cap: 100000,
  beats: [
    {
      id: 'one',
      take: {
        _tag: 'Ready',
        file: 'one.staging.mp3',
        duration: 9,
        words: ['the', 'ball', 'climbs', 'and', 'falls'].map((w, i) => word(w, i * 1.5)),
      },
    },
  ],
};

/** Each media element the page asks to play, kept on `window.heardMedia` (the page makes them off the DOM). */
const KEEP_PLAYED = `(() => {
  const play = HTMLMediaElement.prototype.play;
  window.heardMedia = [];
  HTMLMediaElement.prototype.play = function () {
    if (!window.heardMedia.includes(this)) window.heardMedia.push(this);
    return play.call(this);
  };
  return true;
})()`;

/** Whether the element whose address holds `part` plays now. */
const plays = (part: string) =>
  `window.heardMedia.some((el) => el.src.includes('${part}') && !el.paused)`;

/** Whether the element whose address holds `part` was played and stands paused before its end. */
const paused = (part: string) =>
  `window.heardMedia.some((el) => el.src.includes('${part}') && el.paused && !el.ended)`;

const TAKE = 'one.kept.flac';
const READER = 'one.staging.mp3';

/** The section `name` of the pane. */
const section = (name: string) => `.st-pane .st-sec[data-section="${name}"]`;

for (const size of SIZES)
  describe(`the studio's voice on ${size.name}`, () => {
    it.live(
      "pauses the take as the reader's Hear starts, and the studio's Play pauses both",
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* openPlayer(
            { href: pageHref.studio(PROBE, { sel: 'beat:one' }), viewport: size.viewport },
            '.st-timeline .st-clip',
            [
              route('GET', /^\/studio\/takes\/one\/attempts$/, () => json(KEPT_TAKE)),
              route('GET', /^\/studio\/takes\/one\/attempts\/one\.kept\.flac$/, () => MINUTE),
              route('GET', /^\/script\/voice$/, () => json(VOICE)),
              route('GET', /^\/script\/takes\/one\.staging\.mp3$/, () => MINUTE),
            ],
          );
          yield* page.evaluate(KEEP_PLAYED);
          const readerHear = `${section('Words')}[open] .lab-script-beat[data-beat="one"] [data-act="hear-beat"]`;
          yield* waitFor(page, readerHear);
          yield* page.click(`${section('Voice')} > summary`);
          const hearTake = `${section('Voice')}[open] [data-act="hear-take"]`;
          yield* page.click(hearTake);
          yield* attributeIs(page, hearTake, 'aria-pressed', 'true');
          yield* until(page, plays(TAKE));
          // The reader's Hear: its take plays, and Voice's take is paused and says so.
          yield* page.click(readerHear);
          yield* until(page, plays(READER));
          yield* until(page, paused(TAKE));
          yield* attributeIs(page, hearTake, 'aria-pressed', 'false');
          // Voice's take again, then the studio's Play: nothing the inspector plays is heard.
          yield* page.click(hearTake);
          yield* until(page, plays(TAKE));
          yield* until(page, paused(READER));
          yield* page.click('[data-act="play.toggle"]');
          yield* attributeIs(page, '[data-act="play.toggle"]', 'aria-pressed', 'true');
          yield* until(page, `${paused(TAKE)} && ${paused(READER)}`);
          yield* attributeIs(page, hearTake, 'aria-pressed', 'false');
          yield* attributeIs(page, readerHear, 'aria-pressed', 'false');
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );
  });
