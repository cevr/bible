// What the studio shows, derived from the probe film's timeline with no page:
// the beat at the playhead and a beat step, the viewer's picture and its tag,
// the lanes a phone keeps, the zoom steps and the ruler, the timecode, how a
// clip fits its width, and the header's and the Next row's words.

import { Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import type { FilmTimeline } from '../../core/timeline-schema.ts';
import { probeTimeline } from '../fixtures/probe-timeline.ts';
import {
  beatAt,
  beatNamed,
  beatPageHref,
  beatStep,
  clipFit,
  lanesShown,
  marksFit,
  nextText,
  pictureAt,
  pictureTag,
  pxPerSecond,
  scrollForZoom,
  rulerTicks,
  sentenceAt,
  timecode,
  waitsText,
  zoomFor,
  zoomStep,
} from './view-state.ts';

const drawn = probeTimeline(2);
const firstCut = probeTimeline(1);

const beatOf = (T: number) => Option.map(beatAt(drawn, T), (b) => b.beat);

describe('the beat at the playhead', () => {
  test('is the beat the time is in, its end the next one, and the last beat past the end', () => {
    expect(beatOf(0)).toEqual(Option.some('one'));
    expect(beatOf(4.715)).toEqual(Option.some('two'));
    expect(beatOf(12.315)).toEqual(Option.some('three'));
    expect(beatOf(99)).toEqual(Option.some('three'));
    expect(Option.map(beatNamed(drawn, 'two'), (b) => b.start)).toEqual(Option.some(4.715));
    expect(beatNamed(drawn, 'four')).toEqual(Option.none());
  });

  test('steps to the next beat, back to this one, and back past it from inside its first half second', () => {
    expect(beatStep(drawn, 1, 1)).toBe(4.715);
    expect(beatStep(drawn, 6, -1)).toBe(4.715);
    expect(beatStep(drawn, 4.9, -1)).toBe(0);
    expect(beatStep(drawn, 0, -1)).toBe(0);
    expect(beatStep(drawn, 10, 1)).toBe(8.26);
  });
});

describe('the page a beat is still worked on', () => {
  const two = Option.getOrThrow(beatNamed(drawn, 'two'));

  test("opens at the playhead in the beat's own time, else at the beat's start", () => {
    expect(beatPageHref('Script', 'probe', two, 6.215)).toEqual(
      Option.some('/films/probe/script/two#t=1.5'),
    );
    expect(beatPageHref('Board', 'probe', two, 6.215)).toEqual(
      Option.some('/films/probe/board/two#t=1.5'),
    );
    expect(beatPageHref('Lab', 'probe', two, 6.215)).toEqual(
      Option.some('/films/probe/lab/two#t=1.5'),
    );
    expect(beatPageHref('Script', 'probe', two, 1)).toEqual(Option.some('/films/probe/script/two'));
  });

  test('is none for a short, which has no such page', () => {
    expect(beatPageHref('Lab', 'probe/shorts/hook', two, 6.215)).toEqual(Option.none());
  });
});

describe("the viewer's picture", () => {
  test('is the drawn scene when the staged film is this version, else the Board panel there', () => {
    expect(pictureAt(drawn, 5, true)).toEqual({ _tag: 'Scene', beat: 'two' });
    expect(pictureAt(drawn, 5, false)).toEqual({
      _tag: 'Board',
      beat: 'two',
      panel: 'two.start',
      mark: 'start',
      file: 'two.start.1.png',
    });
    expect(pictureAt(firstCut, 5, true)._tag).toBe('Board');
  });

  test('is the card the engine sets on a Board card panel, with its words: never an empty frame', () => {
    expect(pictureAt(firstCut, 3, true)).toEqual({
      _tag: 'Card',
      beat: 'one',
      panel: 'one.fall',
      mark: 'fall',
      markAt: 2.6,
      text: { _tag: 'Card', payoff: 'down' },
      words: Option.some([
        { text: 'falls', payoff: false },
        { text: 'down', payoff: true },
        { text: 'again.', payoff: false },
      ]),
    });
    // The scene drawn there wins when the viewer can draw it.
    expect(pictureAt(drawn, 3, true)._tag).toBe('Scene');
    expect(pictureTag(pictureAt(firstCut, 3, true))).toBe('Board · one · card');
  });

  test("is tagged in the owner's words: the stage and the beat", () => {
    expect(pictureTag(pictureAt(drawn, 0, true))).toBe('Scene · one');
    expect(pictureTag(pictureAt(firstCut, 9, true))).toBe('Board · three');
    expect(pictureTag({ _tag: 'Empty', beat: Option.some('one') })).toBe('Script · one');
    expect(pictureTag({ _tag: 'Empty', beat: Option.none() })).toBe('No picture yet');
  });
});

describe('the lanes a window shows', () => {
  test('shows every lane on a laptop', () => {
    expect(lanesShown(drawn, false).map((l) => l.track)).toEqual([
      'script',
      'board',
      'voice',
      'scenes',
    ]);
  });

  test('keeps the script, the newest picture lane and the voice on a phone', () => {
    expect(lanesShown(drawn, true).map((l) => l.track)).toEqual(['script', 'scenes', 'voice']);
    expect(lanesShown(firstCut, true).map((l) => l.track)).toEqual(['script', 'board', 'voice']);
  });
});

describe('the zoom and the ruler', () => {
  test('steps the zoom in and out, held to its steps and never under the fit', () => {
    expect(zoomStep(1, 1)).toBe(1.5);
    expect(zoomStep(1.5, -1)).toBe(1);
    expect(zoomStep(1, -1)).toBe(1);
    expect(zoomStep(32, 1)).toBe(32);
    expect(zoomStep(2.5, 1)).toBe(3);
    expect(zoomStep(2.5, -1)).toBe(2);
  });

  test('fits the film in the width at zoom 1, and opens a phone where a second takes the pixels asked', () => {
    expect(pxPerSecond(1000, 10, 1)).toBe(100);
    expect(pxPerSecond(1000, 10, 2)).toBe(200);
    expect(pxPerSecond(1000, 0, 1)).toBe(0);
    expect(zoomFor(400, 1000, 10)).toBe(4);
    expect(zoomFor(10, 1000, 10)).toBe(1);
  });

  test('a zoom step keeps the playhead where it was on screen, held to the scroll range', () => {
    // At 100 px a second the playhead at 5 s sits 300 px into a view scrolled to 200 px.
    expect(scrollForZoom({ T: 5, from: 100, to: 150, left: 200, width: 400, duration: 10 })).toBe(
      450,
    );
    expect(scrollForZoom({ T: 5, from: 150, to: 100, left: 450, width: 400, duration: 10 })).toBe(
      200,
    );
    // Held to the scroll range: never before the start, never past the end.
    expect(scrollForZoom({ T: 0.5, from: 100, to: 200, left: 0, width: 400, duration: 10 })).toBe(
      50,
    );
    expect(scrollForZoom({ T: 1, from: 200, to: 100, left: 0, width: 400, duration: 10 })).toBe(0);
    expect(scrollForZoom({ T: 9, from: 300, to: 200, left: 2600, width: 400, duration: 10 })).toBe(
      1600,
    );
  });

  test('labels the ruler at the first step that leaves room between labels', () => {
    expect(rulerTicks(12.315, 100)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(rulerTicks(12.315, 20)).toEqual([0, 5, 10]);
  });
});

describe('the caption', () => {
  // Three sentences of 2, 4 and 2 words: shares of a quarter, a half and a quarter.
  const say = 'He fell. Then he rose, slowly. “Not yet!”';
  const speech = { start: 10, end: 18 };

  test("is the sentence at its share of the beat's speech span", () => {
    expect(sentenceAt(say, 10, Option.some(speech))).toBe('He fell.');
    expect(sentenceAt(say, 11.9, Option.some(speech))).toBe('He fell.');
    expect(sentenceAt(say, 12.1, Option.some(speech))).toBe('Then he rose, slowly.');
    expect(sentenceAt(say, 15.9, Option.some(speech))).toBe('Then he rose, slowly.');
    expect(sentenceAt(say, 16.1, Option.some(speech))).toBe('“Not yet!”');
  });

  test('before the speech is its first sentence, after it its last, and a silent beat its first', () => {
    expect(sentenceAt(say, 2, Option.some(speech))).toBe('He fell.');
    expect(sentenceAt(say, 30, Option.some(speech))).toBe('“Not yet!”');
    expect(sentenceAt(say, 13, Option.none())).toBe('He fell.');
    expect(sentenceAt('  a line with no stop  ', 13, Option.some(speech))).toBe(
      'a line with no stop',
    );
    expect(sentenceAt('', 13, Option.some(speech))).toBe('');
  });
});

describe('the words and the numbers', () => {
  test('prints a time as minutes, seconds and tenths, never negative', () => {
    expect(timecode(0)).toBe('0:00.0');
    expect(timecode(4.715)).toBe('0:04.7');
    expect(timecode(75.06)).toBe('1:15.0');
    expect(timecode(-3)).toBe('0:00.0');
  });

  test('draws a narrow clip as a tick, a middling one as a block, and a wide one with its label', () => {
    expect(clipFit(10)).toBe('tick');
    expect(clipFit(20)).toBe('block');
    expect(clipFit(40)).toBe('labelled');
    expect(marksFit(18, 2)).toBe(true);
    expect(marksFit(17, 2)).toBe(false);
    expect(marksFit(100, 0)).toBe(false);
  });

  test('says what waits on the owner, and what starts the next stage', () => {
    expect(waitsText(drawn)).toEqual(Option.some('1 waits on you'));
    const waiting = (count: number): FilmTimeline => ({
      ...drawn,
      header: {
        ...drawn.header,
        waits: { count, items: [{ kind: 'ask', id: 'a1', title: 'Which?', href: '/asks/a1' }] },
      },
    });
    expect(waitsText(waiting(2))).toEqual(Option.some('2 wait on you'));
    expect(waitsText(waiting(0))).toEqual(Option.none());
    expect(nextText(drawn)).toEqual(
      Option.some({ first: 'Render comes once the scenes are approved', later: 'Shorts' }),
    );
  });
});
