// What the studio page shows, derived from the film's timeline (the read
// model, `core/timeline-schema.ts`) and where the owner is in it: the beat
// at the playhead, the picture the viewer shows there, the lanes a window
// of a width holds, the ruler's ticks at a zoom, the selection the address
// names, the timecode, and the page a beat's material is still kept on.
// Pure: the page's parts and its machine read
// these, and its tests check them without a page.

import { Array as Arr, Boolean as Bool, Match, Option, Order } from 'effect';
import { endsSentence } from '../../core/narration.ts';
import { CLOCK_EPSILON, frameAtOrBefore } from '../../core/time.ts';
import type { PanelText } from '../../core/board.ts';
import type {
  BoardClip,
  FilmTimeline,
  FilmVersion,
  Lane,
  Marker,
  ScriptClip,
  Track,
  VoiceClip,
  Waiting,
} from '../../core/timeline-schema.ts';

/** An open note's flag. */
type NoteMarker = Extract<Marker, { readonly kind: 'note' }>;

/** An open ask's flag. */
type AskMarker = Extract<Marker, { readonly kind: 'ask' }>;

/** A clip as the timeline lays it out: where it starts and how long it lasts, in film seconds. */
interface Spanned {
  readonly start: number;
  readonly dur: number;
}

/** Whether film second `T` is in `clip` (its start in, its end out). */
const holds = (clip: Spanned, T: number) => T >= clip.start && T < clip.start + clip.dur;

/** The script's beats, in film order; none when the version has no script lane. */
const beatsOf = (timeline: FilmTimeline): ReadonlyArray<ScriptClip> =>
  timeline.lanes.flatMap((lane) =>
    Match.value(lane).pipe(
      Match.when({ track: 'script' }, (l) => l.clips),
      Match.orElse(() => []),
    ),
  );

/** The beat at film second `T`: the one it is in, else the last before it (the end shows the last beat). */
export const beatAt = (timeline: FilmTimeline, T: number): Option.Option<ScriptClip> =>
  Option.orElse(
    Arr.findFirst(beatsOf(timeline), (b) => holds(b, T)),
    () => Arr.findLast(beatsOf(timeline), (b) => b.start <= T),
  );

/** The beat named `id`. */
export const beatNamed = (timeline: FilmTimeline, id: string): Option.Option<ScriptClip> =>
  Arr.findFirst(beatsOf(timeline), (b) => b.beat === id);

/**
 * The beat start `step` beats from the one at `T` (−1 the one before, +1
 * the next): back from inside a beat's first half second goes to the beat
 * before, else to this beat's start, as an editor's previous-edit does.
 */
export const beatStep = (timeline: FilmTimeline, T: number, step: -1 | 1): number => {
  const beats = beatsOf(timeline);
  const at = Arr.findLastIndex(beats, (b) => b.start <= T);
  const here = Option.getOrElse(at, () => -1);
  const target = Match.value(step).pipe(
    Match.when(1, () => here + 1),
    Match.orElse(() => {
      const start = Option.getOrElse(
        Option.map(Arr.get(beats, here), (b) => b.start),
        () => 0,
      );
      return Bool.match(T - start > 0.5, { onTrue: () => here, onFalse: () => here - 1 });
    }),
  );
  return Option.getOrElse(
    Option.map(Arr.get(beats, Math.max(0, Math.min(target, beats.length - 1))), (b) => b.start),
    () => 0,
  );
};

/**
 * What the viewer shows at the playhead: a drawn scene, a Board panel's
 * picture (its kept try, or the try `tried` the inspector shows), a Board
 * card the engine sets (its text, held from its mark said at `markAt`, and
 * its words as the line says them), or the beat's empty frame.
 */
export type Picture =
  | { readonly _tag: 'Scene'; readonly beat: string }
  | {
      readonly _tag: 'Board';
      readonly beat: string;
      readonly panel: string;
      readonly mark: string;
      readonly file: string;
      readonly tried: Option.Option<number>;
    }
  | {
      readonly _tag: 'Card';
      readonly beat: string;
      readonly panel: string;
      readonly mark: string;
      readonly markAt: number;
      readonly text: PanelText;
      readonly words: Option.Option<NonNullable<BoardClip['words']>>;
    }
  | { readonly _tag: 'Empty'; readonly beat: Option.Option<string> };

/** The scenes drawn, in film order. */
const sceneClips = (timeline: FilmTimeline) =>
  timeline.lanes.flatMap((lane) =>
    Match.value(lane).pipe(
      Match.when({ track: 'scenes' }, (l) => l.clips),
      Match.orElse(() => []),
    ),
  );

/** The Board's panels, in film order. */
const boardClips = (timeline: FilmTimeline): ReadonlyArray<BoardClip> =>
  timeline.lanes.flatMap((lane) =>
    Match.value(lane).pipe(
      Match.when({ track: 'board' }, (l) => l.clips),
      Match.orElse(() => []),
    ),
  );

/** The Board panel `id` of `timeline`. */
export const panelNamed = (timeline: FilmTimeline, id: string): Option.Option<BoardClip> =>
  Arr.findFirst(boardClips(timeline), (clip) => clip.panel === id);

/** Beat `beat`'s Board panels in `timeline`, in film order. */
export const panelsOfBeat = (timeline: FilmTimeline, beat: string): ReadonlyArray<BoardClip> =>
  boardClips(timeline).filter((clip) => clip.beat === beat);

/** Beat `beat`'s take in `timeline`: the staging voice's or the owner's. */
export const voiceOfBeat = (timeline: FilmTimeline, beat: string): Option.Option<VoiceClip> =>
  Arr.findFirst(
    timeline.lanes.flatMap((lane) =>
      Match.value(lane).pipe(
        Match.when({ track: 'voice' }, (l) => l.clips),
        Match.orElse(() => []),
      ),
    ),
    (clip) => clip.beat === beat,
  );

/** Whether `timeline` has a scene that draws beat `beat`. */
export const hasScene = (timeline: FilmTimeline, beat: string): boolean =>
  timeline.lanes.some((lane) =>
    Match.value(lane).pipe(
      Match.when({ track: 'scenes' }, (l) => l.clips.some((clip) => clip.beat === beat)),
      Match.orElse(() => false),
    ),
  );

/** What waits on the owner in a beat: his notes on it, and the open asks flagged in its span. */
interface BeatMarkers {
  readonly notes: ReadonlyArray<NoteMarker>;
  readonly asks: ReadonlyArray<AskMarker>;
}

/** What waits on the owner in beat `beat` (`BeatMarkers`). */
export const markersOfBeat = (timeline: FilmTimeline, beat: ScriptClip): BeatMarkers => ({
  notes: timeline.markers.filter((m): m is NoteMarker => m.kind === 'note' && m.beat === beat.beat),
  asks: timeline.markers.filter((m): m is AskMarker => m.kind === 'ask' && holds(beat, m.at)),
});

/** Whether beat `beat` has Board panels in `timeline`: its pane head offers Approve then. */
export const hasBoard = (timeline: FilmTimeline, beat: string): boolean =>
  boardClips(timeline).some((clip) => clip.beat === beat);

/**
 * The picture at film second `T`: the scene drawn there when the viewer
 * can draw it (`drawable`: the film staged is this version), else the Board
 * panel held there (its picture, or the card the engine sets on it), else
 * the beat's empty frame. The newest stage made wins, as design §1 says.
 */
export const pictureAt = (timeline: FilmTimeline, T: number, drawable: boolean): Picture => {
  const beat = Option.map(beatAt(timeline, T), (b) => b.beat);
  const scene = Option.filter(
    Arr.findFirst(sceneClips(timeline), (c) => holds(c, T)),
    () => drawable,
  );
  if (Option.isSome(scene)) return { _tag: 'Scene', beat: scene.value.beat };
  const panel = Option.flatMap(
    Arr.findFirst(boardClips(timeline), (c) => holds(c, T)),
    (c): Option.Option<Picture> =>
      Option.orElse(
        Option.map(Option.fromUndefinedOr(c.text), (text): Picture => ({
          _tag: 'Card',
          beat: c.beat,
          panel: c.panel,
          mark: c.mark,
          markAt: c.markAt,
          text,
          words: Option.fromUndefinedOr(c.words),
        })),
        () =>
          Option.map(Option.fromUndefinedOr(c.file), (file): Picture => ({
            _tag: 'Board',
            beat: c.beat,
            panel: c.panel,
            mark: c.mark,
            file,
            tried: Option.none(),
          })),
      ),
  );
  return Option.getOrElse(panel, (): Picture => ({ _tag: 'Empty', beat }));
};

/** A try the inspector shows of a panel: the panel's clip, the try's number and its picture's file. */
interface ShownTry {
  readonly clip: BoardClip;
  readonly n: number;
  readonly file: string;
}

/**
 * The picture at film second `T` with try `shown` over it: while the
 * playhead is in its panel's hold, the viewer shows that try, whatever the
 * newest stage there is, so the owner holds it against the scene; outside
 * the hold, the film's own picture.
 */
export const withTry = (picture: Picture, shown: Option.Option<ShownTry>, T: number): Picture =>
  Option.match(
    Option.filter(shown, (s) => holds(s.clip, T)),
    {
      onNone: () => picture,
      onSome: (s): Picture => ({
        _tag: 'Board',
        beat: s.clip.beat,
        panel: s.clip.panel,
        mark: s.clip.mark,
        file: s.file,
        tried: Option.some(s.n),
      }),
    },
  );

/** A Board card at the playhead (`Picture`'s `Card`). */
export type CardPicture = Extract<Picture, { readonly _tag: 'Card' }>;

/**
 * A verse page's text in three: before its phrase, the phrase highlighted,
 * and after it; the whole text unhighlighted when the phrase is not in it.
 */
export const verseParts = (
  text: string,
  phrase: string,
): { readonly before: string; readonly phrase: string; readonly after: string } =>
  Option.match(
    Option.liftPredicate(text.indexOf(phrase), (at) => at >= 0 && phrase !== ''),
    {
      onNone: () => ({ before: text, phrase: '', after: '' }),
      onSome: (at) => ({
        before: text.slice(0, at),
        phrase,
        after: text.slice(at + phrase.length),
      }),
    },
  );

/** The viewer's tag: the stage shown and the beat, in the owner's words (`Board · woman`), never a file. */
export const pictureTag = (picture: Picture): string =>
  Match.value(picture).pipe(
    Match.tag('Scene', (p) => `Scene · ${p.beat}`),
    Match.tag('Board', (p) =>
      Option.match(p.tried, {
        onNone: () => `Board · ${p.beat}`,
        onSome: (n) => `Board · ${p.beat} · try ${n}`,
      }),
    ),
    Match.tag('Card', (p) => `Board · ${p.beat} · ${p.text._tag.toLowerCase()}`),
    Match.tag('Empty', (p) =>
      Option.match(p.beat, { onNone: () => 'No picture yet', onSome: (b) => `Script · ${b}` }),
    ),
    Match.exhaustive,
  );

/** The lanes the newest picture comes from, newest first: a phone shows one of them. */
const PICTURE_TRACKS: ReadonlyArray<Track> = ['scenes', 'board'];

/** How many lanes a phone shows: the script, the newest picture lane and the voice. */
const PHONE_LANES = 3;

/**
 * The lanes a window shows: every lane on a laptop; on a phone (`compact`)
 * the script, the newest picture lane (the scenes, else the Board) and the
 * voice, in that order, at most `PHONE_LANES`, the words getting the rest
 * of the screen.
 */
export const lanesShown = (timeline: FilmTimeline, compact: boolean): ReadonlyArray<Lane> => {
  if (!compact) return timeline.lanes;
  const picture = Arr.findFirst(PICTURE_TRACKS, (track) =>
    timeline.lanes.some((lane) => lane.track === track),
  );
  const order: ReadonlyArray<Track> = ['script', ...Option.toArray(picture), 'voice'];
  return Arr.take(
    order.flatMap((track) => timeline.lanes.filter((lane) => lane.track === track)),
    PHONE_LANES,
  );
};

/** The track a lane is, as its header names it. */
export const TRACK_TITLE: Readonly<Record<Track, string>> = {
  script: 'Script',
  concept: 'Concept',
  board: 'Board',
  voice: 'Voice',
  scenes: 'Scenes',
  sound: 'Sound',
  render: 'Render',
};

/** Zoom steps, as factors over the fit (the whole film in the timeline's width). */
const ZOOMS: ReadonlyArray<number> = [1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];

/** The zoom one step in (`+1`) or out (`−1`) from `zoom`, held to the steps. */
export const zoomStep = (zoom: number, step: -1 | 1): number => {
  const sorted = Arr.sort(ZOOMS, Order.Number);
  return Match.value(step).pipe(
    Match.when(1, () =>
      Option.getOrElse(
        Arr.findFirst(sorted, (z) => z - zoom > CLOCK_EPSILON),
        () => zoom,
      ),
    ),
    Match.orElse(() =>
      Option.getOrElse(
        Arr.findLast(sorted, (z) => zoom - z > CLOCK_EPSILON),
        () => 1,
      ),
    ),
  );
};

/** A sentence of a line, and how many of the line's words are said by its end. */
interface Sentence {
  readonly words: ReadonlyArray<string>;
  readonly by: number;
}

/**
 * The sentence of a beat's line `say` heard at `T`: the line's sentences take
 * the beat's speech span by their share of its words, so the sentence is the
 * one whose share holds `T`'s place in the span; the first before it (and on
 * a silent beat), the last after it.
 */
export const sentenceAt = (
  say: string,
  T: number,
  speech: Option.Option<{ readonly start: number; readonly end: number }>,
): string => {
  const words = say.split(/\s+/).filter((w) => w.length > 0);
  // Each sentence with the count of words said by its end.
  const none: ReadonlyArray<Sentence> = [];
  const sentences = Arr.reduce(words, none, (acc, word, i): ReadonlyArray<Sentence> =>
    Option.match(
      Option.filter(Arr.last(acc), (open) => !Option.exists(Arr.last(open.words), endsSentence)),
      {
        onNone: () => [...acc, { words: [word], by: i + 1 }],
        onSome: (open) => [...acc.slice(0, -1), { words: [...open.words, word], by: i + 1 }],
      },
    ),
  );
  const place = Option.getOrElse(
    Option.map(
      Option.filter(speech, (span) => span.end > span.start),
      (span) => Math.min(1, Math.max(0, (T - span.start) / (span.end - span.start))),
    ),
    () => 0,
  );
  return Option.getOrElse(
    Option.map(
      Option.orElse(
        Arr.findFirst(sentences, (sentence) => place * words.length < sentence.by),
        () => Arr.last(sentences),
      ),
      (sentence) => sentence.words.join(' '),
    ),
    () => '',
  );
};

/** Pixels a film second takes in a timeline `width` px wide at `zoom` (1: the whole film fits). */
export const pxPerSecond = (width: number, duration: number, zoom: number): number =>
  Bool.match(duration > 0, {
    onTrue: () => (Math.max(0, width) / duration) * zoom,
    onFalse: () => 0,
  });

/**
 * The scroll a zoom step from `from` to `to` px a second leaves, in a view `width` px wide
 * scrolled to `left`: the playhead at `T` keeps its x on screen, held to the scroll range.
 */
export const scrollForZoom = (zoom: {
  readonly T: number;
  readonly from: number;
  readonly to: number;
  readonly left: number;
  readonly width: number;
  readonly duration: number;
}): number =>
  Math.min(
    Math.max(0, zoom.duration * zoom.to - zoom.width),
    Math.max(0, zoom.T * zoom.to - (zoom.T * zoom.from - zoom.left)),
  );

/** The zoom at which a film second takes `px` pixels: a phone opens so a beat is readable. */
export const zoomFor = (px: number, width: number, duration: number): number => {
  const fit = pxPerSecond(width, duration, 1);
  return Bool.match(fit > 0, { onTrue: () => Math.max(1, px / fit), onFalse: () => 1 });
};

/** The ruler's steps, in seconds: the first that leaves `RULER_GAP` px between labels wins. */
const RULER_STEPS: ReadonlyArray<number> = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

/** The least room between two ruler labels, in px. */
const RULER_GAP = 72;

/** The ruler's ticks over `duration` at `perSecond` px a second: each labelled second. */
export const rulerTicks = (duration: number, perSecond: number): ReadonlyArray<number> => {
  const step = Option.getOrElse(
    Arr.findFirst(RULER_STEPS, (s) => s * perSecond >= RULER_GAP),
    () => 600,
  );
  return Arr.makeBy(Math.floor(duration / step) + 1, (i) => i * step);
};

/** A film time as the studio prints it: `M:SS.t` (tenths), never negative. */
export const timecode = (T: number): string => {
  const tenths = frameAtOrBefore(Math.max(0, T), 10);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths % 10}`;
};

/** How a clip is drawn: a tick, a block, or a block with its label. */
type ClipFit = 'tick' | 'block' | 'labelled';

/** How a clip is drawn at its width: a tick under 16 px, a block with no label under 40, else labelled. */
export const clipFit = (width: number): ClipFit =>
  Match.value(width).pipe(
    Match.when(
      (w) => w < 16,
      (): ClipFit => 'tick',
    ),
    Match.when(
      (w) => w < 40,
      (): ClipFit => 'block',
    ),
    Match.orElse((): ClipFit => 'labelled'),
  );

/** Room each mark needs, in px: marks show on a clip only when each has this much. */
const MARK_ROOM = 9;

/** Whether a clip `width` px wide has room for `marks` diamonds. */
export const marksFit = (width: number, marks: number): boolean =>
  marks > 0 && width >= marks * MARK_ROOM;

/** The words of the header's wait line: `N wait on you` (`1 waits on you`); none at 0. */
export const waitsText = (timeline: FilmTimeline): Option.Option<string> =>
  Option.map(
    Option.filter(Option.fromUndefinedOr(timeline.header.waits), (w) => w.count > 0),
    (w) =>
      `${w.count} ${Bool.match(w.count === 1, { onTrue: () => 'waits', onFalse: () => 'wait' })} on you`,
  );

/** One thing waiting on the owner, as the waits menu lists it. */
export const waitingText = (waiting: Waiting): string =>
  Match.value(waiting).pipe(
    Match.discriminatorsExhaustive('kind')({
      ask: (w) => `Ask: ${w.title}`,
      note: (w) => `Note: ${w.text}`,
      approve: (w) => `Approve ${w.beat}’s Board`,
    }),
  );

/** The phone's waits line: "N wait on you", then the first thing that waits. */
export const waitsLine = (timeline: FilmTimeline): Option.Option<string> =>
  Option.flatMap(Option.fromUndefinedOr(timeline.header.waits), (waits) =>
    Option.map(
      waitsText(timeline),
      (words) => `${words} · ${waitingText(Arr.headNonEmpty(waits.items))}`,
    ),
  );

/** The stage's word in the header (`Board`). */
export const STAGE_TITLE: Readonly<Record<FilmTimeline['header']['stage'], string>> = {
  script: 'Script',
  concept: 'Concept',
  board: 'Board',
  voice: 'Voice',
  animatic: 'Animatic',
  scenes: 'Scenes',
  sound: 'Sound',
  render: 'Render',
  shorts: 'Shorts',
};

/** The Next row's words: the first stage ahead and what starts it (`Board starts from …`), and the later ones. */
export const nextText = (
  timeline: FilmTimeline,
): Option.Option<{ readonly first: string; readonly later: string }> =>
  Option.map(Option.fromUndefinedOr(timeline.next), (next) => ({
    first: next.starts,
    later: next.later.map((stage) => STAGE_TITLE[stage]).join(' · '),
  }));

/** The version chip: the film's versions as the last timeline read named them, and the one the page is at. */
export interface VersionChip {
  readonly versions: ReadonlyArray<FilmVersion>;
  readonly at: number;
}

/**
 * The version chip while the page is at version `v` (0: the open one), its
 * versions the last timeline read named (`last`): kept while another version
 * is read or cannot be, so the owner can always pick another. None before
 * any timeline is read.
 */
export const versionChip = (
  last: Option.Option<FilmTimeline>,
  v: number,
): Option.Option<VersionChip> =>
  Option.map(last, (timeline) => ({
    versions: timeline.versions,
    at: Bool.match(v > 0, {
      onTrue: () => v,
      onFalse: () =>
        Option.getOrElse(
          Option.map(
            Arr.findFirst(timeline.versions, (version) => version.open),
            (version) => version.n,
          ),
          () => timeline.version.n,
        ),
    }),
  }));

/** Whether version `version` can be opened: one replaced in place kept nothing to show. */
export const versionOpens = (version: FilmVersion): boolean => version.files !== 'none';

/**
 * Whether `timeline`'s version is the one kept in the film's own files: the
 * registry's film plays it, the film's script holds its words and board,
 * and the inspector writes them and the Lab shows them. A version in its own
 * folder, or with nothing kept, is none of these.
 */
export const keptInFilm = (timeline: FilmTimeline): boolean => timeline.version.files === 'film';
