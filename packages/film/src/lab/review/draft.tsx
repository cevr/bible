// A series draft in the Script reader (`/series/<series>/<draft>`, the
// review's): the draft's beats as its Markdown reads now (`core/draft.ts`,
// read by the server and sent with the page), each under its number and
// label with its staging take (▶ and its pace once ready), its line at the
// reading size with its delivery marks (a stressed word heavier, a pause's
// glyph in its gap), what its picture does and its sources quiet under it.
// The staging voice is the film reader's own (`script/voice.tsx` over the
// draft's routes; `script/voiced.tsx` draws it), so the fill keeps a take
// ready for every spoken beat and the reader never asks for one.
//
// At rest the page is the words, their marks, a ready take and its pace: no
// control of its own. A tap on a word selects it (shift extends; a text
// selection across words selects them), kept in the URL
// (`/series/<series>/<draft>/<beat>?words=<a>-<b>`), and opens the box
// under its line: Hear, Clear and the words' delivery, each a tap written
// at once into the draft's Markdown (`POST …/marks`, one cell changed and
// not another byte); the draft as the write leaves it is shown, and its
// takes read again, the beat's new take queued first.

import { useAtomValue } from '@bible/atom-solid';
import { For, Show } from '@solidjs/web';
import { Array as Arr, Effect, Option, Result } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type { Accessor } from 'solid-js';
import { createEffect, createMemo, createSignal } from 'solid-js';
import { Frames } from '../../browser/frames.ts';
import { addressOn } from '../../browser/host.ts';
import { wordsIn, wordsText } from '../../command/selection.ts';
import {
  type DraftBeatRead,
  type DraftRead,
  type MarksPost,
  draftTakeUrl,
  pageHref,
} from '../../core/api.ts';
import type { Mark } from '../../core/delivery.ts';
import { parse } from '../../core/narration.ts';
import { reasonOf } from '../api.ts';
import { PlaceStyle } from '../place-style.tsx';
import { BriefBox } from '../script/brief.tsx';
import { SCRIPT_READ_CSS } from '../script/style.ts';
import { gapBefore } from '../script/delivery.ts';
import { VoiceOver, type VoiceSource, polled, useVoice } from '../script/voice.tsx';
import {
  Delivery,
  GapGlyph,
  HearWords,
  Spend,
  TakeState,
  type Words,
  stressAttr,
} from '../script/voiced.tsx';
import { type Row, type SectionRows, type WordAt, rangesOf, rowOf } from '../transcript/lit.ts';
import { usePainted, wordsReleased } from '../transcript/words.ts';
import { ReviewApi } from './api.ts';
import { useReview } from './context.tsx';

/**
 * A draft's own look, over the reader's (`SCRIPT_READ_CSS`): one column at
 * a reading measure, its title and its series over the beats, the word heard
 * lit and the words selected painted as the Script's are.
 */
const DRAFT_CSS = `
.dr { max-width: 720px; margin: 0 auto; background: var(--surface-1); }
.dr-head { padding: var(--s-3) var(--gutter) 0; }
.dr-head h1 { margin: 0; font-size: var(--fs-5); line-height: var(--lh-5); font-weight: var(--w-3); }
.dr-series { margin: 0; color: var(--text-2); font-size: var(--fs-2); line-height: var(--lh-2); }
.dr-label { color: var(--text-2); }
/* A head keeps the height of its ▶ before a take lands, so the page does not shift as takes arrive. */
.dr .lab-script-beat-head { min-height: var(--hit); }
/* A cue's name in a brief, set apart from its prose; sources in the brief's ink, not the head's quieter one. */
.dr .lab-script-code { font: inherit; color: var(--text-1); }
.dr .lab-script-cite { color: var(--text-2); }
.dr-status { margin: 0; padding: var(--s-3) var(--gutter); color: var(--text-2); }
::highlight(lab-live) { background-color: color-mix(in srgb, var(--state-live) 26%, transparent); color: var(--text-1); }
::highlight(lab-picked) { background-color: var(--accent-wash); color: var(--text-1); text-decoration: underline var(--accent); }
`;

/** How the status line is announced: a read under way politely, a refusal at once. */
const STATUS_ROLE = { true: 'alert', false: 'status' } as const;

/** A beat of the draft as the reader lays it out: its line's words (none for a beat that says nothing) and its marks. */
interface DraftBeat {
  readonly read: DraftBeatRead;
  readonly line: Option.Option<SectionRows>;
  readonly marks: ReadonlyArray<Mark>;
}

/**
 * The draft's beats laid out: each spoken line's words as the voice says
 * them (`parse`: its cues and marks in braces never shown), each word with
 * its offset in the one text, running on across the beats, as the Script's
 * do.
 */
const laidOut = (draft: DraftRead): ReadonlyArray<DraftBeat> => {
  let at = 0;
  return draft.beats.map((read): DraftBeat => {
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

/** The words of `rows` from `from` to `to`, as the box's head quotes them. */
const quoted = (rows: ReadonlyArray<Row>, w: Words): string =>
  `“${rows
    .filter((r) => r.index >= w.from && r.index <= w.to)
    .map((r) => r.text)
    .join(' ')}”`;

/** A beat's line: each word an element the page paints, a stressed one heavier, a pause's glyph in its gap. */
const Line = (props: {
  readonly line: SectionRows;
  readonly marks: ReadonlyArray<Mark>;
  readonly released: (event: MouseEvent) => void;
}) => (
  // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- the words are text, painted and selectable as the film reader's are (`transcript/words.ts`): a press released on them reads what it selected, and no word is a control of its own
  <p class="lab-script-line" data-scene={props.line.id} onClick={props.released}>
    <For each={props.line.rows}>
      {(row) => (
        <>
          <GapGlyph gap={gapBefore(props.marks, row.index)} />
          <span
            class="lab-script-w"
            data-index={row.index}
            data-from={row.from}
            data-stress={stressAttr(props.marks, row.index)}
          >
            {row.text}
          </span>{' '}
        </>
      )}
    </For>
  </p>
);

/** Under a beat's line while words of it are selected: what they say, Hear, Clear, and their delivery. */
const Selected = (props: {
  readonly beat: DraftBeat;
  readonly words: Option.Option<Words>;
  readonly clear: () => void;
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
          words={s().line.rows.length}
          selected={props.words}
        />
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

/** A beat: its number and label with its take, its brief, its line, the box over what is selected in it, and its sources. */
const Beat = (props: {
  readonly beat: DraftBeat;
  readonly words: Option.Option<Words>;
  readonly released: (event: MouseEvent) => void;
  readonly clear: () => void;
}) => (
  <section class="lab-script-beat" data-beat={props.beat.read.id} aria-label={props.beat.read.id}>
    <header class="lab-script-beat-head">
      <span>{props.beat.read.id}</span>
      <Show when={props.beat.read.label !== ''}>
        <span class="dr-label">{props.beat.read.label}</span>
      </Show>
      <TakeState beat={props.beat.read.id} />
    </header>
    <Show when={props.beat.read.brief}>
      {(brief) => (
        <BriefBox>
          <Inline text={brief()} />
        </BriefBox>
      )}
    </Show>
    {Option.toArray(props.beat.line).map((line) => (
      <Line line={line} marks={props.beat.marks} released={props.released} />
    ))}
    <Selected beat={props.beat} words={props.words} clear={props.clear} />
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

/** The draft's beats, the word heard lit and the words selected painted. */
const Beats = (props: {
  readonly series: string;
  readonly draft: string;
  readonly beats: Accessor<ReadonlyArray<DraftBeat>>;
}) => {
  const { state, meta } = useReview();
  const voice = useVoice();
  const address = addressOn(meta.host);
  const lines = createMemo(() => props.beats().flatMap((b) => Option.toArray(b.line)));
  // The words selected, as the URL holds them: in one beat, the first not after the last.
  const selected = createMemo(() => {
    const place = state.place();
    if (place._tag !== 'Draft') return Option.none<WordAt & Words>();
    return Option.map(wordsIn(place.beat, place.words), (w) => ({
      section: w.scene,
      index: w.from,
      from: w.from,
      to: w.to,
    }));
  });
  const select = (beat: string, w: Words) =>
    address.go(pageHref.draftBeat(props.series, props.draft, beat, wordsText(w)));
  const clear = () => address.go(pageHref.draft(props.series, props.draft));
  // A tap selects the word (shift: from the selection's first to it); a text selection across words selects them.
  const released = wordsReleased({
    sections: lines,
    selectRange: (beat, from, to) => select(beat, { from, to }),
    tap: (beat, row, extend) =>
      select(
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
      Option.map(
        Option.flatMap(
          Option.flatMap(key, () => page),
          (el) => Option.fromNullishOr(el.querySelector('.lab-script-ties')),
        ),
        // Once laid out (its choices drawn, the page's type set): the whole box, not its top.
        (box) =>
          Effect.runForkWith(meta.host)(
            Effect.promise(() => document.fonts.ready).pipe(
              Effect.andThen(Frames.use((f) => f.next)),
              Effect.andThen(Effect.sync(() => box.scrollIntoView({ block: 'nearest' }))),
            ),
          ),
      );
    },
  );
  const wordsOf = (beat: string): Option.Option<Words> =>
    Option.map(
      Option.filter(selected(), (w) => w.section === beat),
      (w) => ({ from: w.from, to: w.to }),
    );
  return (
    <div
      ref={(el: HTMLElement) => {
        page = Option.some(el);
      }}
    >
      <For each={props.beats()} keyed={(b) => b.read.id}>
        {(beat) => (
          <Beat beat={beat()} words={wordsOf(beat().read.id)} released={released} clear={clear} />
        )}
      </For>
    </div>
  );
};

/** The draft read, and its beats laid out under its staging voice. */
const Reader = (props: {
  readonly series: string;
  readonly draft: string;
  readonly shown: Accessor<DraftRead>;
  readonly answer: (read: DraftRead) => void;
}) => {
  const { meta } = useReview();
  const beats = createMemo(() => laidOut(props.shown()));
  const source: VoiceSource = {
    // The page's alone: the server's render never waits on the takes, nor queues one.
    reading: meta.runtime
      .atom(polled(ReviewApi.use((api) => api.draftVoice(props.series, props.draft))))
      .pipe(Atom.withServerValue(() => AsyncResult.initial())),
    write: meta.runtime.fn((post: MarksPost) =>
      ReviewApi.use((api) => api.draftMarks(props.series, props.draft, post)).pipe(
        Effect.tap((read) => Effect.sync(() => props.answer(read))),
      ),
    ),
    takeUrl: (file) => draftTakeUrl(props.series, props.draft, file),
    beats: () => beats().map((b) => b.read.id),
    host: meta.host,
    player: Option.none(),
    written: 'marked in the draft',
  };
  return (
    <VoiceOver source={source}>
      <Spend />
      <Beats series={props.series} draft={props.draft} beats={beats} />
    </VoiceOver>
  );
};

/** Series draft `draft` of `series`: its head, then its beats, or why it cannot be read. */
export const DraftPage = (props: { readonly series: string; readonly draft: string }) => {
  const { meta, state } = useReview();
  const read = useAtomValue(() => meta.draft(props.series, props.draft));
  // A mark write's answer stands over the read it was made on, the draft as the write left it,
  // until the draft is read again (a refresh): then the read is the draft as it stands.
  const [answered, setAnswered] = createSignal(
    Option.none<{ readonly read: DraftRead; readonly over: Option.Option<DraftRead> }>(),
    { ownedWrite: true },
  );
  const shown = createMemo(() => {
    const now = AsyncResult.value(read());
    return Option.getOrElse(
      Option.map(
        Option.filter(
          answered(),
          (a) => Option.getOrUndefined(a.over) === Option.getOrUndefined(now),
        ),
        (a) => Option.some(a.read),
      ),
      () => now,
    );
  });
  const seriesTitle = () =>
    Option.getOrElse(
      Option.flatMap(AsyncResult.value(state.series()), (l) =>
        Option.map(
          Option.fromUndefinedOr(l.series.find((s) => s.name === props.series)),
          (s) => s.title,
        ),
      ),
      () => props.series,
    );
  return (
    <>
      <PlaceStyle
        css={`
          ${SCRIPT_READ_CSS} ${DRAFT_CSS}
        `}
      />
      <article class="dr" data-draft={`${props.series}/${props.draft}`}>
        <header class="dr-head">
          <p class="dr-series">{seriesTitle()}</p>
          <h1>
            {Option.getOrElse(
              Option.map(shown(), (d) => d.title),
              () => props.draft,
            )}
          </h1>
        </header>
        <Show
          when={Option.getOrUndefined(shown())}
          fallback={
            <p class="dr-status" role={STATUS_ROLE[`${AsyncResult.isFailure(read())}`]}>
              {AsyncResult.match(read(), {
                onInitial: () => 'Reading the draft…',
                onFailure: (f) => `Could not read the draft: ${reasonOf(f.cause)}`,
                onSuccess: () => '',
              })}
            </p>
          }
        >
          {(d) => (
            <Reader
              series={props.series}
              draft={props.draft}
              shown={d}
              answer={(next) =>
                setAnswered(Option.some({ read: next, over: AsyncResult.value(read()) }))
              }
            />
          )}
        </Show>
      </article>
    </>
  );
};
