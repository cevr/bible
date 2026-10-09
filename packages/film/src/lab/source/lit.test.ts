// What the Source view lights, pure: the cues playing at a time light the
// literals that write them and the calls that read them, by the clock; a cue
// the code does not write lights nothing; the view follows to the first.

import { Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import type { ResolvedCue, SceneCode } from '../../core/schema.ts';
import { liveAt } from '../../core/timeline.ts';
import { followLine, lineOf, lineSite, lineStarts, litNow } from './lit.ts';
import { FOLLOW, codeOpenOf, codeText, lineOpen } from './open.ts';

const TEXT = [
  'const lift = 1;', // 0..16
  'timeline: {', // 16..28
  '  rise: { dur: 1 },', // 28..
  '  fall: { after: "rise", dur: 1 },',
  '}',
  'f.at("rise"); f.at("fall");',
].join('\n');

/** The range of the first `needle` in `TEXT`. */
const range = (needle: string, from = 0): readonly [number, number] => {
  const start = TEXT.indexOf(needle, from);
  return [start, start + needle.length];
};

const code: SceneCode = {
  scene: 'robe',
  file: 'scenes/robe.ts',
  text: TEXT,
  cues: [
    { name: 'rise', at: range('rise: { dur: 1 }'), reads: [range('f.at("rise")')] },
    { name: 'fall', at: range('fall: { after: "rise", dur: 1 }'), reads: [range('f.at("fall")')] },
  ],
  knobs: [],
  marks: [],
  refused: [],
};

const cue = (start: number, dur: number): ResolvedCue => ({
  start,
  dur,
  end: start + dur,
  ease: 'linear',
  stagger: 0,
});

const cues = new Map([
  ['rise', cue(0, 1)],
  ['fall', cue(1, 1)],
  ['unwritten', cue(0, 2)],
]);

describe('the lines of a file', () => {
  test('a line starts after each newline, and an offset is on the line it falls in', () => {
    const starts = lineStarts('a\nbc\n\nd');
    expect(starts).toEqual([0, 2, 5, 6]);
    expect([0, 1, 2, 4, 5, 6, 7].map((o) => lineOf(starts, o))).toEqual([1, 1, 2, 2, 3, 4, 4]);
  });
});

describe('what is lit at a frame', () => {
  test('the playing cue lights its literal and its reads, and meters its line', () => {
    const lit = litNow(code, liveAt(cues, 0.5, 30));
    expect(lit.names).toEqual(['rise']);
    expect(lit.literals).toEqual([range('rise: { dur: 1 }')]);
    expect(lit.reads).toEqual([range('f.at("rise")')]);
    expect(lit.meters).toEqual([{ name: 'rise', line: 3, progress: 0.5 }]);
  });

  test('a cue the code does not write lights nothing; a frame between cues lights nothing', () => {
    expect(litNow(code, liveAt(new Map([['unwritten', cue(0, 2)]]), 1, 30)).names).toEqual([]);
    expect(litNow(code, liveAt(cues, 5, 30)).names).toEqual([]);
  });

  test('the same time lights the same ranges, whatever came before it', () => {
    const a = litNow(code, liveAt(cues, 1.5, 30));
    litNow(code, liveAt(cues, 0.2, 30));
    expect(litNow(code, liveAt(cues, 1.5, 30))).toEqual(a);
  });

  test('the view follows to the playing cue’s line, else to nothing', () => {
    expect(followLine(code, litNow(code, liveAt(cues, 1.5, 30)))).toEqual(Option.some(4));
    expect(followLine(code, litNow(code, liveAt(cues, 5, 30)))).toEqual(Option.none());
  });
});

describe('a line a note cites', () => {
  test('is the file, the number and the line’s text without its indent', () => {
    expect(lineSite(code, 3)).toEqual(
      Option.some({ file: 'scenes/robe.ts', line: 3, text: 'rise: { dur: 1 },' }),
    );
    expect(lineSite(code, 6)).toEqual(
      Option.some({ file: 'scenes/robe.ts', line: 6, text: 'f.at("rise"); f.at("fall");' }),
    );
  });

  test('is none for a line the file lacks, or a blank one', () => {
    expect(lineSite(code, 7)).toEqual(Option.none());
    expect(lineSite(code, 0)).toEqual(Option.none());
    expect(lineSite({ ...code, text: 'a\n\nb' }, 2)).toEqual(Option.none());
  });
});

describe('?code=', () => {
  test('follow and a line from 1 open the view; anything else leaves it shut', () => {
    expect(codeOpenOf('follow')).toEqual(Option.some(FOLLOW));
    expect(codeOpenOf('12')).toEqual(Option.some(lineOpen(12)));
    for (const text of ['', '0', '-3', '1.5', 'Follow', 'line', '12px'])
      expect(codeOpenOf(text)).toEqual(Option.none());
  });

  test('each opening prints as it reads', () => {
    for (const text of ['follow', '1', '240']) expect(codeText(codeOpenOf(text))).toBe(text);
    expect(codeText(Option.none())).toBe('');
  });
});
