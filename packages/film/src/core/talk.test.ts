// How a talk plays (`talk.ts`), over synthetic transcripts
// (`fixtures/talk-take.ts`): a take of words each voiced over a known span,
// its loudness every 10 ms loud where a word is voiced and silent between. A
// seam is never inside a kept word's voiced span and always on a frame; the
// pieces add up to the section; a pause longer than the talk's `gaps` is
// tightened to it; a strike and its restore are inverse; a section reordered
// plays as it did; and the derived timings lay out as a film's do.

import { describe, expect, it } from 'bun:test';
import { Array as Arr, Option, Result, Schema } from 'effect';
import { SYNTHETIC_SOURCE, syntheticTake } from './fixtures/talk-take.ts';
import { layout } from './layout.ts';
import { noteT } from './notes.ts';
import { Timings } from './schema.ts';
import { SAFE_ZONES, roomAcross, safeRect } from './shorts.ts';
import {
  TALK_FORMATS,
  TALK_FPS,
  TALK_LAYOUT,
  type Talk,
  Talk as TalkSchema,
  type TalkCut,
  type TalkTake,
  talkCut,
  talkPhrases,
  talkTakes,
  talkTranscripts,
} from './talk.ts';

const WORDS = ['Is', 'the', 'um', 'verdict', 'a', 'cover', 'up', 'No', 'it', 'is', 'not'];

/** A talk over one take, its sections as given. */
const talkOf = (sections: Talk['sections'], extra: Partial<Talk> = {}): Talk => ({
  title: 'Is the verdict a cover-up?',
  format: 'question',
  takes: { a: 'take.why' },
  sections,
  ...extra,
});

const cutOf = (talk: Talk, take: TalkTake = syntheticTake(WORDS)) =>
  Result.getOrThrow(talkCut(talk, { a: take }));

/** Whether `t` falls on a frame of the talk's rate. */
const onFrame = (t: number) => Math.abs(t * TALK_FPS - Math.round(t * TALK_FPS)) < 1e-6;

/** Every piece edge of `cut` is on a frame and outside every kept word's voiced span. */
const seamsHold = (cut: TalkCut, take: TalkTake) => {
  for (const section of cut.sections)
    for (const piece of section.pieces)
      for (const edge of [piece.from, piece.to]) {
        expect(onFrame(edge)).toBe(true);
        for (const w of section.kept.flatMap((i) => take.words.slice(i, i + 1)))
          expect(edge <= w.voiced.start + 1e-9 || edge >= w.voiced.end - 1e-9).toBe(true);
      }
};

describe('a talk cut on its transcript', () => {
  it('never puts a seam inside a voiced span, and puts every seam on a frame', () => {
    const take = syntheticTake(WORDS, [0.1, 0.1, 0.05, 0.1, 0.6, 0.1, 0.02, 0.9, 0.1, 0.1, 0.1]);
    const cut = cutOf(
      talkOf([
        {
          id: 'claim',
          take: 'a',
          from: 0,
          to: 10,
          cut: [
            [2, 2],
            [8, 8],
          ],
        },
      ]),
      take,
    );
    expect(cut.sections[0]?.pieces.length).toBeGreaterThan(1);
    seamsHold(cut, take);
    // Every voiced span of a struck word is outside every piece.
    for (const i of [2, 8]) {
      const w = take.words[i];
      for (const piece of cut.sections[0]?.pieces ?? [])
        expect(
          (w?.voiced.end ?? 0) <= piece.from + 1e-9 || (w?.voiced.start ?? 0) >= piece.to - 1e-9,
        ).toBe(true);
    }
  });

  it('plays a kept word whole when the struck one beside it is under a frame away, the seam still on a frame', () => {
    // Words 1 and 2 are 10 ms apart, 1.11 s to 1.12 s (no frame boundary between), and 2 is struck.
    const take = syntheticTake(WORDS, [0.11, 0.1, 0.01, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
    const cut = cutOf(talkOf([{ id: 'claim', take: 'a', from: 0, to: 6, cut: [[2, 2]] }]), take);
    seamsHold(cut, take);
    expect(cut.sections[0]?.pieces.length).toBe(2);
    expect(cut.sections[0]?.pieces[0]?.to).toBeCloseTo(34 / TALK_FPS, 9);
  });

  it("cuts the first and last words of a section, adjacent strikes as one, and the take's last word", () => {
    const take = syntheticTake(WORDS);
    const last = WORDS.length - 1;
    const edges = cutOf(
      talkOf([
        {
          id: 'claim',
          take: 'a',
          from: 0,
          to: last,
          cut: [
            [0, 0],
            [2, 2],
            [3, 3],
            [last, last],
          ],
        },
      ]),
      take,
    );
    seamsHold(edges, take);
    expect(edges.sections[0]?.kept).toEqual([1, 4, 5, 6, 7, 8, 9]);
    // Two adjacent strikes cut as one strike over both does.
    const joined = cutOf(
      talkOf([
        {
          id: 'claim',
          take: 'a',
          from: 0,
          to: last,
          cut: [
            [0, 0],
            [2, 3],
            [last, last],
          ],
        },
      ]),
      take,
    );
    expect(joined.sections).toEqual(edges.sections);
    // A section ending on the take's last word, which stops voicing 10 ms
    // before the take ends (4.71 s of 4.72 s, no frame boundary between),
    // plays that word whole: its piece ends on the first frame past its
    // voice, under a frame past the take's end (silent there, the picture on
    // its last frame), never inside the word.
    const short = syntheticTake(WORDS, [0.11]);
    const clipped = { ...short, envelope: short.envelope.slice(0, 472) };
    const tail = cutOf(talkOf([{ id: 'tail', take: 'a', from: last - 1, to: last }]), clipped);
    seamsHold(tail, clipped);
    const end = Option.getOrThrow(Arr.last(tail.sections[0]?.pieces ?? [])).to;
    const voicedEnd = clipped.words[last]?.voiced.end ?? Infinity;
    expect(voicedEnd).toBeCloseTo(4.71, 9);
    expect(end).toBeGreaterThanOrEqual(voicedEnd);
    expect(end).toBeLessThan(4.72 + 1 / TALK_FPS);
  });

  it("adds its pieces up to the section's length, which lays out as its scene's", () => {
    const cut = cutOf(talkOf([{ id: 'claim', take: 'a', from: 0, to: 10, cut: [[2, 2]] }]));
    const [section] = cut.sections;
    const total = (section?.pieces ?? []).reduce((sum, p) => sum + (p.to - p.from), 0);
    expect(section?.voice.duration).toBeCloseTo(total, 9);
    expect(section?.voice.file).toBe(`${SYNTHETIC_SOURCE}/voice.flac`);
    const placed = Result.getOrThrow(layout(cut.scenes, cut.timings));
    expect(placed[0]?.dur).toBeCloseTo(total, 9);
    expect(placed[0]?.voice.recorded).toBe(true);
    // The pieces are back to back from zero, and each seam is where the next one starts.
    for (const [k, piece] of (section?.pieces ?? []).entries())
      expect(piece.at).toBeCloseTo(
        (section?.pieces ?? []).slice(0, k).reduce((sum, p) => sum + (p.to - p.from), 0),
        9,
      );
    expect(section?.seams).toEqual((section?.pieces ?? []).slice(1).map((p) => p.at));
  });

  it('strikes a word with a seam, and restoring it plays the section as before', () => {
    const whole = cutOf(talkOf([{ id: 'claim', take: 'a', from: 0, to: 6 }]));
    const struck = cutOf(talkOf([{ id: 'claim', take: 'a', from: 0, to: 6, cut: [[2, 2]] }]));
    const restored = cutOf(talkOf([{ id: 'claim', take: 'a', from: 0, to: 6, cut: [] }]));
    expect(whole.sections[0]?.pieces.length).toBe(1);
    expect(struck.sections[0]?.pieces.length).toBe(2);
    expect(struck.sections[0]?.kept).toEqual([0, 1, 3, 4, 5, 6]);
    expect(struck.sections[0]?.voice.duration).toBeLessThan(whole.sections[0]?.voice.duration ?? 0);
    expect(restored).toEqual(whole);
  });

  it('refuses a section that strikes every word it has', () => {
    const silent = talkCut(talkOf([{ id: 'claim', take: 'a', from: 2, to: 3, cut: [[2, 3]] }]), {
      a: syntheticTake(WORDS),
    });
    expect(Result.isFailure(silent) && silent.failure._tag).toBe('TalkSectionSilent');
  });

  it("tightens a pause longer than the talk's gaps to it, and keeps one shorter", () => {
    const take = syntheticTake(WORDS, [0.1, 0.1, 0.1, 0.1, 1.5, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
    const cut = cutOf(talkOf([{ id: 'claim', take: 'a', from: 0, to: 6 }], { gaps: 0.25 }), take);
    const words = cut.sections[0]?.voice.words ?? [];
    const pause = (i: number) => (words[i + 1]?.voiced.start ?? 0) - (words[i]?.voiced.end ?? 0);
    // Words 3 and 4 had 1.5 s between them: no more than the gap (and a frame) now.
    expect(pause(3)).toBeLessThanOrEqual(0.25 + 1 / TALK_FPS);
    // Words 0 and 1 had 0.1 s: kept as it was.
    expect(pause(0)).toBeCloseTo(0.1, 9);
    seamsHold(cut, take);
  });

  it('cuts at the quietest frame of a silence', () => {
    const take = syntheticTake(WORDS);
    // Room noise in the silence after word 1, quiet only either side of one frame boundary.
    const after = take.words[1]?.voiced.end ?? 0;
    const quiet = Math.ceil((after + 0.04) * TALK_FPS) / TALK_FPS;
    const envelope = take.envelope.map((level, k) => {
      const at = k * 0.01;
      const inSilence = at > after && at < after + 0.1;
      const besideQuiet = at >= quiet - 0.02 && at < quiet + 0.01;
      return [level, -50, -90][Number(inSilence) + Number(inSilence && besideQuiet)] ?? level;
    });
    const cut = cutOf(
      talkOf([{ id: 'claim', take: 'a', from: 0, to: 4, cut: [[2, 2]] }], { gaps: 0.25 }),
      { ...take, envelope },
    );
    expect(cut.sections[0]?.pieces[0]?.to).toBeCloseTo(quiet, 9);
  });

  it('plays each section as it did when the sections are reordered, so a note on one keeps its moment', () => {
    const hook = { id: 'hook', take: 'a', from: 7, to: 10 } as const;
    const claim = { id: 'claim', take: 'a', from: 0, to: 6, cut: [[2, 2]] } as const;
    const ahead = cutOf(talkOf([hook, claim]));
    const behind = cutOf(talkOf([claim, hook]));
    expect(ahead.sections.map((s) => s.id)).toEqual(['hook', 'claim']);
    expect(ahead.timings.scenes['claim']).toEqual(behind.timings.scenes['claim']);
    expect(ahead.timings.scenes['hook']).toEqual(behind.timings.scenes['hook']);
    // A note 0.4 s into the claim, made with the hook ahead, shows 0.4 s into the claim after the move.
    const placedAhead = Result.getOrThrow(layout(ahead.scenes, ahead.timings));
    const placedBehind = Result.getOrThrow(layout(behind.scenes, behind.timings));
    const note = { scene: 'claim', T: 0, local: 0.4 };
    const start = (placed: typeof placedAhead) =>
      placed.find((p) => p.spec.id === 'claim')?.start ?? -1;
    expect(noteT(placedAhead, TALK_FPS, note) - start(placedAhead)).toBeCloseTo(0.4, 6);
    expect(noteT(placedBehind, TALK_FPS, note) - start(placedBehind)).toBeCloseTo(0.4, 6);
  });

  it('spells a fixed word, marks its words in the line, and resolves a cue on a mark', () => {
    const cut = cutOf(
      talkOf(
        [
          {
            id: 'claim',
            take: 'a',
            from: 0,
            to: 6,
            cut: [[2, 2]],
            marks: { charge: 5 },
            timeline: { tablets: { mark: 'charge', dur: 1 } },
          },
        ],
        { fixes: { a: { '3': 'verdict,' } } },
      ),
    );
    expect(cut.scenes[0]?.say).toBe('Is the verdict, a {charge}cover up');
    const placed = Result.getOrThrow(layout(cut.scenes, cut.timings));
    const word = cut.sections[0]?.voice.words[4];
    expect(placed[0]?.cues.get('tablets')?.start).toBeCloseTo(word?.start ?? -1, 9);
  });

  it('writes every mark on a word that carries two, and a cue on either resolves', () => {
    const cut = cutOf(
      talkOf([
        {
          id: 'claim',
          take: 'a',
          from: 0,
          to: 6,
          marks: { charge: 5, verdict: 5 },
          timeline: { tablets: { mark: 'charge', dur: 1 }, seal: { mark: 'verdict', dur: 1 } },
        },
      ]),
    );
    expect(cut.scenes[0]?.say).toBe('Is the um verdict a {charge}{verdict}cover up');
    const placed = Result.getOrThrow(layout(cut.scenes, cut.timings));
    const word = cut.sections[0]?.voice.words[5];
    expect(placed[0]?.cues.get('tablets')?.start).toBeCloseTo(word?.start ?? -1, 9);
    expect(placed[0]?.cues.get('seal')?.start).toBeCloseTo(word?.start ?? -1, 9);
  });

  it('derives timings a film would keep: recorded, in order, inside the take', () => {
    const cut = cutOf(
      talkOf([
        {
          id: 'claim',
          take: 'a',
          from: 0,
          to: 10,
          cut: [
            [2, 2],
            [8, 9],
          ],
        },
      ]),
    );
    const decoded = Schema.decodeResult(Timings)(cut.timings);
    expect(Result.isSuccess(decoded)).toBe(true);
    expect(cut.timings.scenes['claim']?.source).toBe('recorded');
  });

  it('cuts equal edits over equal transcripts to equal plays', () => {
    const talk = talkOf([
      { id: 'hook', take: 'a', from: 7, to: 10 },
      { id: 'claim', take: 'a', from: 0, to: 6, cut: [[2, 2]], marks: { charge: 5 } },
    ]);
    const take = syntheticTake(WORDS, [0.1, 0.1, 0.1, 0.1, 1.5]);
    expect(cutOf(structuredClone(talk), structuredClone(take))).toEqual(cutOf(talk, take));
  });

  it('refuses a word past the end of its take, and a take it was not given', () => {
    const past = talkCut(talkOf([{ id: 'claim', take: 'a', from: 0, to: 40 }]), {
      a: syntheticTake(WORDS),
    });
    expect(Result.isFailure(past) && past.failure._tag).toBe('TalkWordMissing');
    const none = talkCut(talkOf([{ id: 'claim', take: 'a', from: 0, to: 3 }]), {});
    expect(Result.isFailure(none) && none.failure._tag).toBe('TalkTakeMissing');
  });

  it('refuses an edit that names a take it lacks, strikes outside its section, or marks a struck word', () => {
    const reasons = (talk: Talk) =>
      Result.match(Schema.decodeResult(TalkSchema)(talk), {
        onSuccess: () => '',
        onFailure: (e) => e.message,
      });
    expect(reasons(talkOf([{ id: 'claim', take: 'b', from: 0, to: 3 }]))).toContain('take "b"');
    expect(reasons(talkOf([{ id: 'claim', take: 'a', from: 2, to: 5, cut: [[1, 2]] }]))).toContain(
      'not inside 2–5',
    );
    expect(
      reasons(talkOf([{ id: 'claim', take: 'a', from: 0, to: 5, cut: [[2, 2]], marks: { m: 2 } }])),
    ).toContain('does not play');
    expect(reasons(talkOf([{ id: 'claim', take: 'a', from: 0, to: 5 }]))).toBe('');
  });

  it('is cut to one of the formats, each with its numbers as data', () => {
    // As a talk.ts on disk could say it: text, decoded once.
    const edit =
      '{"title":"Is the verdict a cover-up?","format":"vlog","takes":{"a":"take.why"},' +
      '"sections":[{"id":"claim","take":"a","from":0,"to":5}]}';
    const decoded = Schema.decodeResult(Schema.fromJsonString(TalkSchema))(edit);
    expect(Result.isFailure(decoded) && decoded.failure.message).toContain('format');
    expect(Object.keys(TALK_FORMATS)).toEqual(['question', 'episode']);
    expect(TALK_FORMATS.question.seconds).toEqual({ min: 45, max: 65 });
    expect(TALK_FORMATS.episode.seconds).toEqual({ min: 135, max: 170 });
  });
});

describe("a talk's takes, from the footage library", () => {
  const SHA = `0123456789ab${'0'.repeat(52)}`;
  const heard = syntheticTake(WORDS, [], 'take.why/0123456789ab', { width: 720, height: 1280 });
  const entry = (transcript: Option.Option<string>, kind: 'take' | 'clip' = 'take') => ({
    kind,
    sha256: SHA,
    bytes: 1,
    ext: '.mov',
    probe: {
      container: 'MP4',
      duration: 5,
      picture: {
        codec: 'hevc',
        width: 720,
        height: 1280,
        rotation: 0 as const,
        fps: 30,
        variable: false,
        start: 0,
      },
    },
    ...Option.match(transcript, {
      onNone: () => ({}),
      onSome: (file) => ({ transcript: file }),
    }),
  });
  const lockOf = (of: ReturnType<typeof entry>) => ({
    version: 1 as const,
    footage: { 'take.why': of },
  });
  const FILE = 'take.why.0123456789ab.2.json';
  const transcripts = new Map([
    [
      FILE,
      { source: 'take.why/0123456789ab', text: '', words: heard.words, envelope: heard.envelope },
    ],
  ]);
  const talk = talkOf([{ id: 'claim', take: 'a', from: 0, to: 6 }]);
  const reason = (result: ReturnType<typeof talkTakes>) =>
    Result.match(result, { onSuccess: () => '', onFailure: (e) => e.message });

  it('gives each take its source, its picture size and the words of the transcript the lock names', () => {
    expect(talkTranscripts(talk, lockOf(entry(Option.some(FILE))))).toEqual([FILE]);
    const takes = Result.getOrThrow(talkTakes(talk, lockOf(entry(Option.some(FILE))), transcripts));
    expect(takes).toEqual({ a: heard });
    expect(cutOf(talk, takes['a'])).toEqual(cutOf(talk, heard));
  });

  it("refuses a take the library lacks, has not heard, keeps as a clip, or whose transcript is another's or not here", () => {
    expect(reason(talkTakes(talk, { version: 1, footage: {} }, transcripts))).toContain(
      'does not have',
    );
    expect(reason(talkTakes(talk, lockOf(entry(Option.none())), transcripts))).toContain(
      'film footage make take.why',
    );
    expect(
      reason(talkTakes(talk, lockOf(entry(Option.some(FILE), 'clip')), transcripts)),
    ).toContain('a clip');
    expect(
      reason(
        talkTakes(talk, lockOf(entry(Option.some('take.why.0123456789ab.json'))), transcripts),
      ),
    ).toContain('is not here');
    const other = new Map([
      [
        FILE,
        {
          ...Option.getOrThrow(Option.fromUndefinedOr(transcripts.get(FILE))),
          source: 'take.why/ffffffffffff',
        },
      ],
    ]);
    expect(reason(talkTakes(talk, lockOf(entry(Option.some(FILE))), other))).toContain(
      'heard from take.why/ffffffffffff',
    );
  });
});

describe("a talk's captions", () => {
  /** Two sections of one take: the second plays words 7 to 10, its "No" quoted. */
  const talk = talkOf(
    [
      { id: 'claim', take: 'a', from: 0, to: 6, cut: [[2, 2]] },
      { id: 'answer', take: 'a', from: 7, to: 10 },
    ],
    { fixes: { a: { '3': 'verdict,' } }, quotes: [{ take: 'a', from: 7, to: 7 }] },
  );
  const cut = cutOf(talk);
  const placed = Result.getOrThrow(layout(cut.scenes, cut.timings));
  const phrases = talkPhrases(talk, cut, placed);

  it('says each kept word once, as the talk spells it, in order, and never a struck one', () => {
    expect(phrases.flatMap((p) => p.words.map((w) => w.text))).toEqual([
      'Is',
      'the',
      'verdict,',
      'a',
      'cover',
      'up',
      'No',
      'it',
      'is',
      'not',
    ]);
  });

  it('shows each word when it is heard on the talk clock, and keeps every phrase inside its section', () => {
    for (const [section, p] of Arr.zip(cut.sections, placed)) {
      const offset = p.start + p.speechStart;
      const inside = phrases.filter((ph) => ph.start >= p.start && ph.start < p.start + p.dur);
      expect(inside.flatMap((ph) => ph.words.map((w) => w.start))).toEqual(
        section.voice.words.map((w) => w.voiced.start + offset),
      );
      for (const ph of inside) expect(ph.end).toBeLessThanOrEqual(p.start + p.dur + 1e-9);
    }
  });

  it('golds the words the talk quotes, and no other', () => {
    expect(phrases.flatMap((p) => p.words.filter((w) => w.quoted).map((w) => w.text))).toEqual([
      'No',
    ]);
  });

  it("sets its words inside every platform's zone, its captions beside TikTok's buttons", () => {
    const room = safeRect(SAFE_ZONES.platforms);
    const { centre, hook, caption } = TALK_LAYOUT;
    // The hook, above every button column, centred on the frame.
    const high = roomAcross(SAFE_ZONES.platforms, room.top + 1);
    expect(centre - hook.width / 2).toBeGreaterThanOrEqual(high.left);
    expect(centre + hook.width / 2).toBeLessThanOrEqual(high.right);
    expect(hook.y).toBeGreaterThan(room.top);
    // The captions, down to the room's foot, beside the buttons.
    const low = roomAcross(SAFE_ZONES.platforms, room.bottom);
    expect(caption.centre - caption.width / 2).toBeGreaterThanOrEqual(low.left);
    expect(caption.centre + caption.width / 2).toBeLessThanOrEqual(low.right);
    expect(caption.y).toBeLessThan(room.bottom);
    // The captions take the whole room beside TikTok's buttons: 120 to 780 px.
    expect(caption).toEqual({ centre: 450, y: 1128, width: 660 });
    expect(hook.width).toBe(696);
  });
});
