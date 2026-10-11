// A talk's page (`talk.ts`): 9:16 at the talk's rate, each frame the take's
// footage frame its cut names, cropped by the section's `frame` and `zoom`
// knobs, its hook and captions set inside every platform's zone. The footage
// is the host's: the film only says what each frame reads (`footageAt`), and
// draws what it is given, so a frame's draw is the same in any order.

import { Array as Arr, Effect, Result } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { SYNTHETIC_VOICE, syntheticTake } from '../core/fixtures/talk-take.ts';
import { SAFE_ZONES, SHORT_LAYOUT, safeRect } from '../core/shorts.ts';
import { TALK_FPS, type Talk, talkCut, talkPhrases } from '../core/talk.ts';
import type { Film, FootageRead } from './film.ts';
import { recorder, withDom } from './fixtures/stand-in.ts';
import type { ProbeSink } from './probe.ts';
import { talkFilms } from './talk.ts';

const SOURCE = 'take.why/0123456789ab';
const WORDS = [
  'The',
  'law',
  'um',
  'was',
  'given.',
  'Why?',
  'To',
  'show',
  'us',
  'hour',
  'need',
  'of',
  'grace.',
];

/** The take, its picture `width` × `height`: one long pause, before word 8. */
const takeOf = (width: number, height: number) => ({
  ...syntheticTake(
    WORDS,
    WORDS.map((_, i) => [0.1, 0.9][Number(i === 8)] ?? 0.1),
    SYNTHETIC_VOICE,
  ),
  source: SOURCE,
  width,
  height,
});

const HOOK = 'Why give a law no one keeps?';

const TALK: Talk = {
  title: 'Why the law?',
  format: 'question',
  hook: HOOK,
  takes: { a: 'take.why' },
  fixes: { a: { '9': 'our' } },
  quotes: [{ take: 'a', from: 10, to: 12 }],
  sections: [
    { id: 'law', take: 'a', from: 0, to: 5, cut: [[2, 2]] },
    { id: 'need', take: 'a', from: 6, to: 12, knobs: { frame: [600, 540], zoom: 2 } },
  ],
};

const TAKE = takeOf(1080, 1920);

/** The talk as the films index loads it, made afresh, its narration at `/full.wav`. */
const talkOf = (take = TAKE, talk: Talk = TALK): Effect.Effect<Film> =>
  Effect.map(
    Effect.promise(() =>
      talkFilms({
        why: () => Effect.runPromise(Effect.succeed({ talk, takes: { a: take } })),
      }).why(),
    ),
    (loaded) => loaded.film({ audio: '/full.wav' }),
  );

/** A font's box, as a canvas measures it: the stand-in measures widths alone. */
const FONT_BOX = { fontBoundingBoxAscent: 48, fontBoundingBoxDescent: 14 };

/** A stand-in page, every call it is asked to make logged with its arguments. */
const page = () => {
  const log: Array<string> = [];
  const images = new Map<unknown, string>();
  const named = new Map<string, HTMLCanvasElement>();
  const r = recorder(1080, 1920, {
    measure: (_font, text) => text.length * 20,
    onCall: (key, args) =>
      log.push(`${String(key)}(${args.map((a) => images.get(a) ?? String(a)).join(',')})`),
  });
  const ctx = new Proxy(r.ctx, {
    get: (target, key) => {
      if (key !== 'measureText') return Reflect.get(target, key);
      return (text: string) => ({ ...target.measureText(text), ...FONT_BOX });
    },
    set: (target, key, value) => Reflect.set(target, key, value),
  });
  /** A picture for each read, named by it, as the host would decode it. */
  const frame = (read: FootageRead) => {
    const name = `${read.source}@${read.at.toFixed(4)}`;
    const image = named.get(name) ?? withDom(() => document.createElement('canvas'));
    images.set(image, name);
    named.set(name, image);
    return image;
  };
  return { ctx, log, footage: { frame } };
};

describe('a talk', () => {
  it.effect(
    'is 9:16 at 1080 × 1920, at the talk rate, as long as its sections, playing its mixed narration',
    () =>
      Effect.gen(function* () {
        const film = yield* talkOf();
        expect([film.width, film.height, film.fps]).toEqual([1080, 1920, TALK_FPS]);
        expect(film.placed.map((p) => p.spec.id)).toEqual(['law', 'need']);
        expect(film.duration).toBeCloseTo(
          film.placed.reduce((n, p) => n + p.dur, 0),
          9,
        );
        expect(film.audio).toBe('/full.wav');
      }),
  );

  it.effect(
    'reads, at each frame, the source frame its cut names: the frame before a seam ends the piece, the seam starts the next',
    () =>
      Effect.gen(function* () {
        const film = yield* talkOf();
        const at = (T: number) => film.footageAt?.(T) ?? [];
        expect(at(0).map((r) => r.source)).toEqual([SOURCE]);
        // Frame `i`'s read, as a source frame number: reads sit mid-frame.
        const sourceFrame = (i: number) =>
          Math.round((at(i / TALK_FPS)[0]?.at ?? -1) * TALK_FPS - 0.5);
        const cut = Result.getOrThrow(talkCut(TALK, { a: TAKE }));
        // law: a strike (word 2), one seam inside it; need: the long pause tightened, one more.
        expect(cut.sections.map((s) => s.pieces.length)).toEqual([2, 2]);
        const frameOf = (s: number) => Math.round(s * TALK_FPS);
        for (const [section, p] of Arr.zip(cut.sections, film.placed)) {
          const start = frameOf(p.start);
          expect(sourceFrame(start)).toBe(frameOf(section.pieces[0]?.from ?? -1));
          for (const [before, after] of Arr.zip(section.pieces, section.pieces.slice(1))) {
            const seam = start + frameOf(after.at);
            expect(sourceFrame(seam - 1)).toBe(frameOf(before.to) - 1);
            expect(sourceFrame(seam)).toBe(frameOf(after.from));
          }
          const end = start + frameOf(p.dur) - 1;
          expect(sourceFrame(end)).toBe(frameOf(section.pieces.at(-1)?.to ?? -1) - 1);
        }
      }),
  );

  it.effect(
    "draws the take cropped by its section's `frame` and `zoom`: 9:16, about the frame, zoomed in, kept inside the picture",
    () =>
      Effect.gen(function* () {
        const wide = yield* talkOf(takeOf(1920, 1080));
        const drawn = (film: Film, T: number) => {
          const { ctx, log, footage } = page();
          film.render(ctx, T, { footage, captions: false });
          return log.filter((l) => l.startsWith('drawImage('));
        };
        // law: no knobs, the largest 9:16 crop about the picture's middle (607.5 × 1080).
        expect(drawn(wide, 0.05)[0]).toMatch(
          new RegExp(
            `^drawImage\\(take\\.why/0123456789ab@[\\d.]+,${(1920 - 607.5) / 2},0,607.5,1080,0,0,1080,1920\\)$`,
          ),
        );
        // need: about (600, 540), two times in.
        const need = wide.placed[1]?.start ?? 0;
        expect(drawn(wide, need + 0.05)[0]).toMatch(/,448\.125,270,303\.75,540,0,0,1080,1920\)$/);
        // A frame past the picture's edge is held inside it.
        const edge = yield* talkOf(takeOf(1920, 1080), {
          ...TALK,
          sections: [{ ...TALK.sections[0], knobs: { frame: [10, 10], zoom: 1.5 } }],
        });
        expect(drawn(edge, 0.05)[0]).toMatch(/,0,0,405,720,0,0,1080,1920\)$/);
      }),
  );

  it.effect(
    "probes the phrase heard, fixes applied, inside every platform's zone, and the footage frame it drew",
    () =>
      Effect.gen(function* () {
        const film = yield* talkOf();
        const need = film.placed[1];
        const word = need?.voice.words[3];
        const T = (need?.start ?? 0) + (need?.speechStart ?? 0) + (word?.voiced.start ?? 0) + 0.05;
        const { ctx, footage } = page();
        const sink: ProbeSink = { texts: [], inks: [], footage: [] };
        film.render(ctx, T, { footage, probe: sink });
        const captions = sink.texts.filter((t) => t.caption === true);
        const cut = Result.getOrThrow(talkCut(TALK, { a: TAKE }));
        const phrase = talkPhrases(TALK, cut, film.placed).find((p) => p.start <= T && T < p.end);
        const said = phrase?.words.map((w) => w.text) ?? [];
        expect(captions.map((t) => t.text).join(' ')).toBe(said.join(' '));
        // Heard as "hour", fixed to "our".
        expect(said).toContain('our');
        expect(said).not.toContain('hour');
        const room = safeRect(SAFE_ZONES.platforms);
        for (const t of captions) {
          expect(t.x).toBeGreaterThanOrEqual(room.left);
          expect(t.x + t.w).toBeLessThanOrEqual(room.right);
          expect(t.y).toBeGreaterThanOrEqual(room.top);
          expect(t.y + t.h).toBeLessThanOrEqual(room.bottom);
        }
        expect(sink.footage).toEqual([...(film.footageAt?.(T) ?? [])]);
      }),
  );

  it.effect('sets its hook during its hold and draws none after its fade', () =>
    Effect.gen(function* () {
      const film = yield* talkOf();
      const hookAt = (T: number) => {
        const { ctx, footage } = page();
        const sink: ProbeSink = { texts: [], inks: [] };
        film.render(ctx, T, { footage, probe: sink, captions: false });
        return sink.texts.map((t) => t.text).join(' ');
      };
      expect(hookAt(1)).toBe(HOOK);
      const { hold, fade } = SHORT_LAYOUT.hook;
      expect(hookAt(hold + fade + 0.1)).toBe('');
    }),
  );

  it.effect('draws each frame the same whatever order the frames are drawn in', () =>
    Effect.gen(function* () {
      const [inOrder, outOfOrder] = yield* Effect.all([talkOf(), talkOf()]);
      const frames = Arr.makeBy(Math.round(inOrder.duration * TALK_FPS), (i) => i).filter(
        (i) => i % 7 === 0,
      );
      const shuffled = frames.toSorted((a, b) => ((a * 7919) % 101) - ((b * 7919) % 101));
      expect(shuffled).not.toEqual(frames);
      /** Each frame's calls, drawn in `order` on a fresh page of a fresh talk, its words set first. */
      const logsIn = (film: Film, order: ReadonlyArray<number>) => {
        const { ctx, log, footage } = page();
        const firstWord = (film.placed[0]?.voice.words[0]?.voiced.start ?? 0) + 0.05;
        film.render(ctx, firstWord, { footage });
        const logs = new Map<number, ReadonlyArray<string>>();
        for (const i of order) {
          const from = log.length;
          film.render(ctx, i / TALK_FPS, { footage });
          logs.set(i, log.slice(from));
        }
        return frames.map((i) => logs.get(i));
      };
      expect(logsIn(outOfOrder, shuffled)).toEqual(logsIn(inOrder, frames));
    }),
  );
});
