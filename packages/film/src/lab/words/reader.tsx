// The one words reader (a series draft's page, a film's or a draft's script
// in an ask, a beat's words in the studio's inspector and its whole script
// there): the beats in order, each under
// its id and label with its staging take (▶ and its pace once ready), its
// line at the reading size with its delivery marks (a stressed word heavier,
// a pause's glyph in its gap), what its picture does and its sources quiet
// under it. The staging voice is the film reader's own (`script/voice.tsx`
// over the source's routes; `script/voiced.tsx` draws it), so the fill keeps
// a take ready for every spoken beat and the reader never asks for one.
//
// At rest it is the words, their marks, a ready take and its pace: no
// control of its own. A tap on a word selects it (shift extends; a text
// selection across words selects them), where its page keeps a selection
// (`Selecting`: the URL on a draft's page and in the studio, the ask's own
// on an ask), and
// opens the box under its line: Hear, Clear and the words' delivery, each a
// tap written at once through the source (`POST …/marks`); its takes are
// read again, the beat's new take queued first. A page that notes words
// (`ReaderPage.noting`: the studio's) adds its note on them under their
// delivery. What it reads and writes is
// its source's (`ScriptSource`): a draft's routes, a film's. The page it is
// on (`ReaderPage`) gives its host, its commands and its runtime; a page
// with a playhead names the beat it is in (`live`), which the reader marks
// and keeps in sight by the lab's one Follow rule (`lab/follow.ts`).

import { For, type JSX, Show } from '@solidjs/web';
import { Array as Arr, Effect, Option, Result } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type { Accessor } from 'solid-js';
import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { Frames } from '../../browser/frames.ts';
import { Selection } from '../../command/selection.ts';
import { targetAttr } from '../../command/target.ts';
import type { Host } from '../../browser/host.ts';
import type { Hub } from '../../command/hub.ts';
import type { DraftBeatRead, MarksPost, ScriptVoice } from '../../core/api.ts';
import type { NoteWords } from '../../core/schema.ts';
import type { Mark } from '../../core/delivery.ts';
import { parse } from '../../core/narration.ts';
import type { LabFailure } from '../api.ts';
import { Target } from '../command/context-menu.tsx';
import { type FollowClock, useFollow } from '../follow.ts';
import { pressed } from '../pressed.ts';
import { BriefBox } from '../script/brief.tsx';
import { scriptCommands } from '../script/commands.ts';
import { gapBefore } from '../script/delivery.ts';
import { VoiceOver, type VoiceSource, polled, useVoice } from '../script/voice.tsx';
import {
  Delivery,
  GapGlyph,
  HearWords,
  HearIt,
  Spend,
  TakeState,
  type Words,
  stressAttr,
} from '../script/voiced.tsx';
import { type Row, type SectionRows, type WordAt, rangesOf, rowOf } from '../transcript/lit.ts';
import { usePainted, wordsReleased } from '../transcript/words.ts';
import type { ReviewApi } from '../review/api.ts';

/**
 * The reader's own look, over the Script's (`SCRIPT_READ_CSS`): a head that
 * keeps its ▶'s height, a brief's code and its sources in their inks, the
 * word heard lit and the words selected painted as the Script's are, the
 * playhead's beat ruled, a brief behind its disclosure.
 */
export const READER_CSS = `
.rd-label { color: var(--text-2); }
/* A head keeps the height of its ▶ before a take lands, so the page does not shift as takes arrive. */
.rd .lab-script-beat-head { min-height: var(--hit); }
/* A cue's name in a brief, set apart from its prose; sources in the brief's ink, not the head's quieter one. */
.rd .lab-script-code { font: inherit; color: var(--text-1); }
.rd .lab-script-cite { color: var(--text-2); }
/* The script's one labelled press for its sound, at its head, the pointer's size. */
.rd-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); padding: var(--s-2) var(--gutter) 0; }
.rd-head .lab-script-spend { padding: 0; }
.lab-script-hear-all { min-height: var(--hit); }
::highlight(lab-live) { background-color: color-mix(in srgb, var(--state-live) 26%, transparent); color: var(--text-1); }
::highlight(lab-picked) { background-color: var(--accent-wash); color: var(--text-1); text-decoration: underline var(--accent); }
/* The beat at the page's playhead: a rule down its edge, never a fill, so the words keep their ink. */
.rd .lab-script-beat[data-live="true"] { box-shadow: inset 2px 0 0 var(--state-live); }
/* A brief behind its disclosure: one quiet line until asked. */
.rd-brief { margin: 0 0 var(--s-2); color: var(--text-2); }
.rd-brief > summary { min-height: var(--hit); display: flex; align-items: center; cursor: pointer; }
.rd-follow { min-height: var(--hit); }
`;

/** A beat as the reader lays it out: its line's words (none for a beat that says nothing) and its marks. */
interface ReadBeat {
  readonly read: DraftBeatRead;
  readonly line: Option.Option<SectionRows>;
  readonly marks: ReadonlyArray<Mark>;
}

/**
 * The beats laid out: each spoken line's words as the voice says them
 * (`parse`: its cues and marks in braces never shown), each word with its
 * offset in the one text, running on across the beats, as the Script's do.
 */
const laidOut = (beats: ReadonlyArray<DraftBeatRead>): ReadonlyArray<ReadBeat> => {
  let at = 0;
  return beats.map((read): ReadBeat => {
    const parsed = Option.flatMap(Option.fromUndefinedOr(read.say), (say) =>
      Result.getSuccess(parse(read.id, say)),
    );
    const line = Option.map(
      Option.filter(parsed, (p) => p.spoken !== ''),
      (p): SectionRows => ({
        id: read.id,
        take: '',
        marks: {},
        rows: p.spoken.split(' ').map((text, index): Row => {
          const from = at;
          at += text.length + 1;
          return { index, text, struck: false, from, start: Option.none() };
        }),
      }),
    );
    return {
      read,
      line,
      marks: Option.getOrElse(
        Option.map(parsed, (p) => p.delivery),
        () => [],
      ),
    };
  });
};

/** The words of `rows` from `from` to `to`, as they read. */
const wordsText = (rows: ReadonlyArray<Row>, w: Words): string =>
  rows
    .filter((r) => r.index >= w.from && r.index <= w.to)
    .map((r) => r.text)
    .join(' ');

/** The words of `rows` from `from` to `to`, as the box's head quotes them. */
const quoted = (rows: ReadonlyArray<Row>, w: Words): string => `“${wordsText(rows, w)}”`;

/** A beat's line: each word an element the page paints, a stressed one heavier, a pause's glyph in its gap. */
const Line = (props: {
  readonly line: SectionRows;
  readonly marks: ReadonlyArray<Mark>;
  readonly released: (event: MouseEvent) => void;
}) => {
  const voice = useVoice();
  // As the page has them: after its own write, the marks that write left, until the line is read again.
  const marks = () => voice.marksOf(props.line.id, props.marks);
  return (
    // A word held (or right-clicked) opens its menu: Select to here, a phone's range.
    <Target
      of={Selection.cases.Words.make({
        scene: props.line.id,
        from: Option.getOrElse(
          Option.map(Arr.head(props.line.rows), (r) => r.index),
          () => 0,
        ),
        to: Option.getOrElse(
          Option.map(Arr.last(props.line.rows), (r) => r.index),
          () => 0,
        ),
      })}
      class="lab-script-line"
      data-scene={props.line.id}
      onClick={props.released}
    >
      <For each={props.line.rows}>
        {(row) => (
          <>
            <GapGlyph gap={gapBefore(marks(), row.index)} />
            <span
              class="lab-script-w"
              data-target={targetAttr(
                Selection.cases.Words.make({
                  scene: props.line.id,
                  from: row.index,
                  to: row.index,
                }),
              )}
              data-index={row.index}
              data-from={row.from}
              data-stress={stressAttr(marks(), row.index)}
            >
              {row.text}
            </span>{' '}
          </>
        )}
      </For>
    </Target>
  );
};

/** Under a beat's line while words of it are selected: what they say, Hear, Clear, and their delivery. */
const Selected = (props: {
  readonly beat: ReadBeat;
  readonly words: Option.Option<Words>;
  readonly clear: () => void;
  readonly noting: Noting;
}) => (
  <Show
    when={Option.getOrUndefined(
      Option.zipWith(props.beat.line, props.words, (line, w) => ({ line, w })),
    )}
  >
    {(s) => (
      <section class="lab-script-ties" aria-label="The words selected">
        <header class="lab-script-ties-head">
          <span class="lab-script-ties-what lab-clamp">{quoted(s().line.rows, s().w)}</span>
          <HearWords beat={props.beat.read.id} words={props.words} />
          <button
            type="button"
            class="sh-btn"
            data-act="clear-draft"
            title="Select nothing"
            onClick={() => props.clear()}
          >
            Clear
          </button>
        </header>
        <Delivery
          beat={props.beat.read.id}
          marks={props.beat.marks}
          spoken={s()
            .line.rows.map((r) => r.text)
            .join(' ')}
          selected={props.words}
        />
        {/* Keyed by the words: other words selected take a note of their own. */}
        <Show
          when={Option.getOrUndefined(
            Option.map(props.noting, (note) => ({
              note,
              words: {
                beat: props.beat.read.id,
                from: s().w.from,
                to: s().w.to,
                text: wordsText(s().line.rows, s().w),
              },
            })),
          )}
          keyed
        >
          {(noted: {
            readonly note: (words: NoteWords) => JSX.Element;
            readonly words: NoteWords;
          }) => noted.note(noted.words)}
        </Show>
      </section>
    )}
  </Show>
);

/** The inline Markdown a brief or a source writes: `**bold**` and `` `code` ``, the rest as written. */
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`)/;

/** A piece of a brief or source: its bold or code drawn as such, its markers dropped. */
const piece = (text: string) => {
  if (text.startsWith('**') && text.endsWith('**') && text.length > 4) {
    return <strong>{text.slice(2, -2)}</strong>;
  }
  if (text.startsWith('`') && text.endsWith('`') && text.length > 2) {
    return <code class="lab-script-code">{text.slice(1, -1)}</code>;
  }
  return text;
};

/** A brief's or a source's text with its inline Markdown drawn, not shown as asterisks. */
const Inline = (props: { readonly text: string }) => <>{props.text.split(INLINE).map(piece)}</>;

/**
 * How a reader shows a beat's picture brief: in its box (three lines on a
 * phone until More), or behind a disclosure, shut until asked (the studio's
 * inspector, where the words lead).
 */
export type BriefShown = 'boxed' | 'disclosed';

/** A beat's picture brief, as the reader shows it (`BriefShown`). */
const Brief = (props: { readonly shown: BriefShown; readonly children: JSX.Element }) => (
  <Show when={props.shown === 'disclosed'} fallback={<BriefBox>{props.children}</BriefBox>}>
    <details class="rd-brief">
      <summary>Picture</summary>
      <p class="lab-script-picture">{props.children}</p>
    </details>
  </Show>
);

/** A beat: its id and label with its take, its brief, its line, the box over what is selected in it, and its sources. */
const Beat = (props: {
  readonly beat: ReadBeat;
  readonly words: Option.Option<Words>;
  readonly released: (event: MouseEvent) => void;
  readonly clear: () => void;
  /** Whether the page's playhead is in it. */
  readonly live: boolean;
  readonly brief: BriefShown;
  readonly noting: Noting;
}) => (
  <section
    class="lab-script-beat"
    data-beat={props.beat.read.id}
    data-live={pressed(props.live)}
    aria-label={props.beat.read.id}
  >
    <header class="lab-script-beat-head">
      <span>{props.beat.read.id}</span>
      <Show when={props.beat.read.label !== ''}>
        <span class="rd-label">{props.beat.read.label}</span>
      </Show>
      <TakeState beat={props.beat.read.id} />
    </header>
    <Show when={props.beat.read.brief}>
      {(brief) => (
        <Brief shown={props.brief}>
          <Inline text={brief()} />
        </Brief>
      )}
    </Show>
    {Option.toArray(props.beat.line).map((line) => (
      <Line line={line} marks={props.beat.marks} released={props.released} />
    ))}
    <Selected beat={props.beat} words={props.words} clear={props.clear} noting={props.noting} />
    <Show when={props.beat.read.cite.length > 0}>
      <ul class="lab-script-cite" aria-label="Sources">
        <For each={props.beat.read.cite}>
          {(source) => (
            <li>
              <Inline text={source} />
            </li>
          )}
        </For>
      </ul>
    </Show>
  </section>
);

/** How a reader's status line is announced: a read under way politely, a refusal at once. */
export const STATUS_ROLE = { true: 'alert', false: 'status' } as const;

/** Words selected in one beat: its id, the first word and the last. */
interface WordsAt extends Words {
  readonly beat: string;
}

/**
 * Where a reader's words selected are kept, and how a tap moves them: its
 * page's to own (the URL on a draft's page and in the studio, the ask's own
 * on an ask).
 */
export interface Selecting {
  readonly selected: Accessor<Option.Option<WordsAt>>;
  readonly select: (beat: string, words: Words) => void;
  readonly clear: () => void;
}

/** Words selected that the page keeps as its own while it is open (an ask's), never in its URL. */
export const useOwnSelecting = (): Selecting => {
  const [selected, setSelected] = createSignal(Option.none<WordsAt>());
  return {
    selected,
    select: (beat, w) => setSelected(Option.some({ beat, from: w.from, to: w.to })),
    clear: () => setSelected(Option.none()),
  };
};

/**
 * A page's playhead, which its reader follows: the beat it is in, marked and
 * kept in sight in the box the reader scrolls in (`box`, its top `clearTop`
 * under a sticky head), by the lab's one Follow rule on the page's `clock`;
 * Hear pauses it (`pause`) and gives way once it plays.
 */
interface Playhead {
  readonly beat: Accessor<Option.Option<string>>;
  readonly clock: FollowClock;
  readonly box: () => Option.Option<HTMLElement>;
  readonly clearTop: () => number;
  readonly pause: () => void;
}

/** A page's note on words selected, drawn under their delivery: the words as a note carries them. */
type Noting = Option.Option<(words: NoteWords) => JSX.Element>;

/**
 * The page a reader is on: its host (the frames Hear lights the word heard
 * on), its commands (Select to here), its runtime (the source's reads and
 * writes), its playhead where it has one, and its note on words selected
 * where it notes them.
 */
export interface ReaderPage {
  readonly host: Host;
  readonly hub: Hub;
  readonly runtime: Atom.AtomRuntime<ReviewApi, never>;
  readonly playhead: Option.Option<Playhead>;
  readonly noting: Noting;
}

/** Whether the reader keeps the playhead's beat in sight: until a hand scrolls it, then again on Follow or Play. */
interface Following {
  readonly on: Accessor<boolean>;
  readonly resume: () => void;
}

/** The beats, the word heard lit, the words selected painted, and the playhead's beat followed. */
const Beats = (props: {
  readonly page: ReaderPage;
  readonly beats: Accessor<ReadonlyArray<ReadBeat>>;
  readonly selecting: Selecting;
  readonly following: Following & { readonly suspend: () => void };
  readonly brief: BriefShown;
}) => {
  const meta = props.page;
  const voice = useVoice();
  const lines = createMemo(() => props.beats().flatMap((b) => Option.toArray(b.line)));
  const selected = createMemo(() =>
    Option.map(props.selecting.selected(), (w): WordAt & Words => ({
      section: w.beat,
      index: w.from,
      from: w.from,
      to: w.to,
    })),
  );
  // A tap selects the word (shift: from the selection's first to it); a text selection across words selects them.
  const released = wordsReleased({
    sections: lines,
    selectRange: (beat, from, to) => props.selecting.select(beat, { from, to }),
    tap: (beat, row, extend) =>
      props.selecting.select(
        beat,
        Option.getOrElse(
          Option.map(
            Option.filter(selected(), (w) => extend && w.section === beat),
            (w) => ({ from: Math.min(w.from, row.index), to: Math.max(w.from, row.index) }),
          ),
          () => ({ from: row.index, to: row.index }),
        ),
      ),
  });
  // A phone has no Shift: tap the first word, hold the last, Select to here.
  onCleanup(
    meta.hub.commands.register(
      ...scriptCommands({
        selection: () =>
          Option.map(props.selecting.selected(), (w) =>
            Selection.cases.Words.make({ scene: w.beat, from: w.from, to: w.to }),
          ),
        select: (w) => props.selecting.select(w.scene, { from: w.from, to: w.to }),
      }),
    ),
  );
  let page = Option.none<HTMLElement>();
  usePainted(
    meta.host,
    () => page,
    () => ({
      'lab-live': rangesOf(Option.toArray(Option.flatMap(voice.heard(), (w) => rowOf(lines(), w)))),
      'lab-picked': rangesOf(
        Option.getOrElse(
          Option.flatMap(selected(), (w) =>
            Option.map(
              Arr.findFirst(lines(), (l) => l.id === w.section),
              (l) => l.rows.filter((r) => r.index >= w.from && r.index <= w.to),
            ),
          ),
          (): ReadonlyArray<Row> => [],
        ),
      ),
    }),
  );
  // The box over a selection is brought into sight as it opens, a link pasted with one
  // included: its choices are on the screen with its words.
  createEffect(
    () => Option.map(selected(), (w) => `${w.section}:${w.from}-${w.to}`),
    (key) => {
      // Moved on (another selection, or the page gone) before it lands, the scroll is not made.
      const stop = Option.map(
        Option.flatMap(
          Option.flatMap(key, () => page),
          (el) => Option.fromNullishOr(el.querySelector('.lab-script-ties')),
        ),
        // Once laid out (its choices drawn, the page's type set): the whole box, not its top.
        (box) =>
          Effect.runCallbackWith(meta.host)(
            Effect.promise(() => document.fonts.ready).pipe(
              Effect.andThen(Frames.use((f) => f.next)),
              Effect.andThen(Effect.sync(() => box.scrollIntoView({ block: 'nearest' }))),
            ),
          ),
      );
      return () => {
        Option.map(stop, (interrupt) => interrupt());
      };
    },
  );
  const wordsOf = (beat: string): Option.Option<Words> =>
    Option.map(
      Option.filter(selected(), (w) => w.section === beat),
      (w) => ({ from: w.from, to: w.to }),
    );
  const live = () =>
    Option.getOrElse(
      Option.flatMap(meta.playhead, (p) => p.beat()),
      () => '',
    );
  // The playhead's beat kept in sight in the box the reader scrolls in, by the lab's one Follow rule.
  Option.map(meta.playhead, (playhead) =>
    useFollow(
      {
        box: playhead.box,
        content: () => page,
        target: live,
        span: (beat) =>
          Option.map(
            Option.flatMap(page, (root) =>
              Option.fromNullishOr(
                root.querySelector<HTMLElement>(
                  `.lab-script-beat[data-beat="${CSS.escape(beat)}"]`,
                ),
              ),
            ),
            (section) => ({ first: section, last: section }),
          ),
        clear: () => ({ top: playhead.clearTop(), bottom: 0 }),
        placing: props.following.on,
        reader: props.following.suspend,
        played: props.following.resume,
      },
      playhead.clock,
    ),
  );
  return (
    <div
      class="rd"
      ref={(el: HTMLElement) => {
        page = Option.some(el);
      }}
    >
      <For each={props.beats()} keyed={(b) => b.read.id}>
        {(beat) => (
          <Beat
            beat={beat()}
            words={wordsOf(beat().read.id)}
            released={released}
            clear={() => props.selecting.clear()}
            live={beat().read.id === live()}
            brief={props.brief}
            noting={meta.noting}
          />
        )}
      </For>
    </div>
  );
};

/**
 * What a reader reads and writes through: a series draft's routes, a
 * film's. `voice` reads each spoken beat's staging take (read, never
 * voiced: the fill keeps them); `mark` writes a beat's delivery marks, its
 * answer the source's own (a draft's read as the write leaves it, a film's
 * script read again).
 */
interface ScriptSource {
  readonly voice: Effect.Effect<ScriptVoice, LabFailure, ReviewApi>;
  readonly mark: (post: MarksPost) => Effect.Effect<unknown, LabFailure, ReviewApi>;
  /** A take's audio, by the name its `Ready` gives it. */
  readonly takeUrl: (file: string) => string;
  /** What a beat's head says once its marks are written. */
  readonly written: string;
  /** Reads the script again: a line changed under the reader. */
  readonly reread: () => void;
}

/**
 * The beats `beats` read through `source` on `page`, laid out under its
 * staging voice, their words selected as `selecting` keeps them; with `cost`,
 * its head says the day's staging spend (an ask's leaves it out); `brief`
 * says how a beat's picture brief shows (boxed, the default). On a page with
 * a playhead, the beat it is in is marked and kept in sight until a hand
 * scrolls the box, and Follow in the head takes it back.
 */
export const ScriptReader = (props: {
  readonly page: ReaderPage;
  readonly beats: Accessor<ReadonlyArray<DraftBeatRead>>;
  readonly source: ScriptSource;
  readonly selecting: Selecting;
  readonly cost: boolean;
  readonly brief?: BriefShown;
}) => {
  const meta = props.page;
  const beats = createMemo(() => laidOut(props.beats()));
  const [on, setOn] = createSignal(true);
  const following = {
    on,
    resume: () => setOn(true),
    suspend: () => setOn(false),
  };
  const voice: VoiceSource = {
    // The page's alone: the server's render never waits on the takes, nor queues one.
    reading: meta.runtime
      .atom(polled(props.source.voice))
      .pipe(Atom.withServerValue(() => AsyncResult.initial())),
    write: meta.runtime.fn((post: MarksPost) => Effect.suspend(() => props.source.mark(post))),
    takeUrl: (file) => props.source.takeUrl(file),
    beats: () => beats().map((b) => b.read.id),
    host: meta.host,
    player: Option.map(meta.playhead, (p) => ({ pause: p.pause, playing: p.clock.playing })),
    written: props.source.written,
    reread: Option.some(() => props.source.reread()),
  };
  return (
    <VoiceOver source={voice}>
      <div class="rd-head">
        <HearIt beats={beats().map((b) => b.read.id)} />
        <Show when={Option.isSome(meta.playhead) && !on()}>
          <button type="button" class="sh-btn rd-follow" onClick={following.resume}>
            Follow
          </button>
        </Show>
        <Spend cost={props.cost} />
      </div>
      <Beats
        page={meta}
        beats={beats}
        selecting={props.selecting}
        following={following}
        brief={props.brief ?? 'boxed'}
      />
    </VoiceOver>
  );
};
