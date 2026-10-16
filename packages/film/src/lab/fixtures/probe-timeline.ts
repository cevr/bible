// The probe film's timeline as the lab's timeline route answers it
// (`GET /api/films/probe/timeline`): what the studio's browser tests open
// on. Two versions: v2, the open one, in the film's own files (the staged
// probe film draws its scenes), and v1 kept in its own folder (its Board
// panels show, its clock is silent). Its beats are the probe film's three
// scenes on the probe film's clock (`probe-film.ts`, 12.315 s), the first
// with its two marks and a Board card from its second (`{fall}`); one open
// ask flags the strip.

import { Boolean as Bool, Match } from 'effect';
import type { FilmTimeline, Lane } from '../../core/timeline-schema.ts';
import { PROBE } from './probe-film.ts';

/** The open ask on the probe film's strip. */
export const PROBE_ASK = 'a0123456789';

const BEATS = [
  {
    beat: 'one',
    start: 0,
    dur: 4.715,
    marks: [
      { name: 'rise', at: 1.2 },
      { name: 'fall', at: 2.6 },
    ],
  },
  { beat: 'two', start: 4.715, dur: 3.545, marks: [] },
  { beat: 'three', start: 8.26, dur: 4.055, marks: [] },
] as const;

const DURATION = 12.315;

const made = { state: 'made', clock: 'measured' } as const;

const versions = [
  { n: 1, title: 'First cut', open: false, files: 'folder' },
  { n: 2, title: 'Drawn', open: true, files: 'film' },
] as const;

const scriptLane: Lane = {
  track: 'script',
  clips: BEATS.map((b) => ({ ...made, beat: b.beat, start: b.start, dur: b.dur, marks: b.marks })),
};

/** The card the probe's first beat cuts to from its `{fall}`: the line's words from there, `down` its payoff. */
const FALL = 2.6;

const boardLane: Lane = {
  track: 'board',
  clips: BEATS.flatMap((b) => [
    {
      ...made,
      start: b.start,
      dur: Bool.match(b.beat === 'one', { onTrue: () => FALL - b.start, onFalse: () => b.dur }),
      panel: `${b.beat}.start`,
      beat: b.beat,
      mark: 'start',
      markAt: b.start,
      try: 1,
      file: `${b.beat}.start.1.png`,
      card: false,
    },
    ...Bool.match(b.beat === 'one', {
      onTrue: () => [
        {
          ...made,
          start: FALL,
          dur: b.start + b.dur - FALL,
          panel: 'one.fall',
          beat: b.beat,
          mark: 'fall',
          markAt: FALL,
          card: true,
          text: { _tag: 'Card', payoff: 'down' } as const,
          words: [
            { text: 'falls', payoff: false },
            { text: 'down', payoff: true },
            { text: 'again.', payoff: false },
          ],
        },
      ],
      onFalse: () => [],
    }),
  ]),
};

const voiceLane: Lane = {
  track: 'voice',
  clips: BEATS.map((b) => ({
    ...made,
    start: b.start,
    dur: b.dur - 0.6,
    beat: b.beat,
    source: 'staging',
  })),
};

const scenesLane: Lane = {
  track: 'scenes',
  clips: BEATS.map((b) => ({ ...made, start: b.start, dur: b.dur, beat: b.beat })),
};

const waits = {
  count: 1,
  items: [{ kind: 'ask', id: PROBE_ASK, title: 'Which opening?', href: `/asks/${PROBE_ASK}` }],
} as const;

/** What both versions share: the film, its clock, its bands, its Next row and its open ask. */
const shared = {
  film: PROBE,
  production: PROBE,
  versions,
  duration: DURATION,
  bands: [
    { name: 'opening', from: 'one', start: 0, end: 8.26 },
    { name: 'close', from: 'three', start: 8.26, end: DURATION },
  ],
  next: {
    stage: 'render',
    starts: 'Render comes once the scenes are approved',
    later: ['shorts'],
  },
  markers: [
    { kind: 'ask', id: PROBE_ASK, title: 'Which opening?', at: 4.715, href: `/asks/${PROBE_ASK}` },
  ],
} as const;

/** v1, kept in its own folder: its script, Board and voice, no scenes drawn. */
const firstCut: FilmTimeline = {
  ...shared,
  version: versions[0],
  lanes: [scriptLane, boardLane, voiceLane],
  flow: [
    { state: 'reached', stage: 'script' },
    { state: 'reached', stage: 'board' },
    { state: 'reached', stage: 'voice' },
  ],
  header: { stage: 'board', waits, working: [] },
};

/** v2, the open version in the film's own files: its scenes drawn too. */
const drawn: FilmTimeline = {
  ...shared,
  version: versions[1],
  lanes: [scriptLane, boardLane, voiceLane, scenesLane],
  flow: [
    { state: 'reached', stage: 'script' },
    { state: 'reached', stage: 'board' },
    { state: 'reached', stage: 'voice' },
    { state: 'reached', stage: 'scenes' },
  ],
  header: { stage: 'scenes', waits, working: [] },
};

/** Version `n` of the probe film's timeline: v2 draws scenes; v1 shows its Board alone. */
export const probeTimeline = (n: 1 | 2): FilmTimeline =>
  Match.value(n).pipe(
    Match.when(1, () => firstCut),
    Match.orElse(() => drawn),
  );
