// The Script page's reader (`/films/<film>/script…`): the film's beats in
// play order, each under its id and where it starts (one press on either
// shows the beat's first frame), with a quiet badge on a line no take voices
// as it reads now (timed by the estimate) and a marker for each note of its
// frames, then what its picture does (the script's brief, its cues and marks
// named in backticks links to them), its line as the film says it with a
// chip for each mark and its notes on words (`notes.tsx`: painted on the
// words, a correction's words instead after them, a marker after the last),
// the cues tied to what is selected in it with Note… on words (`tied.tsx`),
// the composer and the note selected while they are the beat's, and its
// sources. The head notes the frame shown (Note frame). The line's words
// are laid out, painted and pressed as the Transcript's are
// (`transcript/words.ts`): the word playing at the frame lit and the beat
// under it edged, the words selected (`?words=a-b`) painted and the words a
// mark, a cue or the note selected lands on washed, all through the page's
// highlights (the notes' too), so the text stays
// selectable and a word lit costs no element. A tap on a word shows it (the
// frame seeks to where it starts) and selects it (shift extends the
// selection); a text selection across words selects them; a word held (or
// right-clicked) opens the page's menu about it, whose Select to here extends
// the selection: a phone's range. The reader keeps the word playing in sight
// (`lab/follow.ts`) until a hand scrolls it; Follow or Play takes it back. On
// a laptop it is a column beside the picture; on a phone it scrolls under the
// picture and its track. Nothing here writes the script.

import { For, Portal, Show } from '@solidjs/web';
import { Array as Arr, Option } from 'effect';
import { createMemo } from 'solid-js';
import { Selection } from '../../command/selection.ts';
import { targetAttr } from '../../command/target.ts';
import { counted } from '../../core/words.ts';
import { Target } from '../command/context-menu.tsx';
import { useFollow } from '../follow.ts';
import { Frame } from '../notes/list.tsx';
import { Timecode } from '../page-shell.tsx';
import { pressed } from '../pressed.ts';
import { useLab } from '../shell.tsx';
import { type SectionRows, type WordAt, rangesOf, rowOf } from '../transcript/lit.ts';
import { usePainted, wordsReleased } from '../transcript/words.ts';
import { type BeatRow, ScriptState, useScript } from './context.tsx';
import { notedIn, notedPainted } from './noted.ts';
import {
  BeatMarkers,
  Composer,
  NoteButton,
  NotedAfter,
  ShownNote,
  useScriptNotes,
} from './notes.tsx';
import { MarkChip, Picture, Ties } from './tied.tsx';
import { marksIn } from './ties.ts';

/** What the reader follows, as Follow names it: the word playing (`w:<beat>:<index>`), else the beat under the frame (`b:<beat>`). */
const WORD_KEY = /^w:(.*):(\d+)$/;
const BEAT_KEY = /^b:(.*)$/;

/** The reader's head: how many beats the film has and how many are timed by the estimate, Note frame, and Follow. */
const Head = () => {
  const { meta } = useLab();
  const script = useScript();
  const estimated = script.beats.filter((b) => b.estimated).length;
  return (
    <header class="lab-script-head">
      <span class="lab-script-count lab-clamp">
        {[
          counted(script.beats.length, 'beat'),
          ...Arr.filter([`${estimated} estimated`], () => estimated > 0),
        ].join(' · ')}
      </span>
      <Frame hub={meta.hub} />
      <button
        type="button"
        class="sh-btn lab-script-follow"
        data-act="follow-script"
        aria-pressed={pressed(script.following())}
        title="Scroll with the frame"
        onClick={() => script.resume()}
      >
        Follow
      </button>
    </header>
  );
};

/** How the status line is announced: a read under way politely, a refusal at once. */
const STATUS_ROLE: Readonly<Record<ScriptState['_tag'], 'status' | 'alert'>> = {
  Reading: 'status',
  Read: 'status',
  Refused: 'alert',
};

/** While the script is read, or once it is refused, a line saying so (with Retry); the words stand meanwhile. */
const Status = () => {
  const script = useScript();
  return (
    <Show when={!ScriptState.$is('Read')(script.state())}>
      <div class="lab-script-status" role={STATUS_ROLE[script.state()._tag]}>
        <span class="lab-script-note">
          {ScriptState.$match(script.state(), {
            Reading: () => 'Reading the script…',
            Read: () => '',
            Refused: ({ reason }) => `Could not read the script's pictures: ${reason}`,
          })}
        </span>
        <Show when={ScriptState.$is('Refused')(script.state())}>
          <button
            type="button"
            class="sh-btn"
            data-act="retry-script"
            onClick={() => script.retry()}
          >
            Retry
          </button>
        </Show>
      </div>
    </Show>
  );
};

/**
 * A beat's line: its words, each a thing the page's menu opens on, inside
 * the line's own, and its marks, each a chip before the word it stands
 * before (`MarkChip`; never painted or selected as a word is).
 */
const Line = (props: { readonly line: SectionRows }) => {
  const script = useScript();
  const notes = useScriptNotes();
  // The staged film's, laid out once: a plain value.
  const line = props.line;
  const marks = marksIn(line);
  const noted = createMemo(() => notedIn(notes.noted().filter((n) => n.words.beat === line.id)));
  // A press that ends a text selection across words selects them; a tap on one word shows it.
  const released = wordsReleased({
    sections: () => script.lines,
    selectRange: script.selectRange,
    tap: script.tap,
  });
  return (
    <Target
      of={Selection.cases.Words.make({
        scene: line.id,
        from: Option.getOrElse(
          Option.map(Arr.head(line.rows), (r) => r.index),
          () => 0,
        ),
        to: Option.getOrElse(
          Option.map(Arr.last(line.rows), (r) => r.index),
          () => 0,
        ),
      })}
      class="lab-script-line"
      onClick={released}
    >
      <For each={line.rows}>
        {(row) => (
          <>
            <For each={marks.at(row.index)}>
              {(name) => <MarkChip beat={line.id} name={name} />}
            </For>
            <span
              class="lab-script-w"
              data-target={targetAttr(
                Selection.cases.Words.make({ scene: line.id, from: row.index, to: row.index }),
              )}
              data-index={row.index}
              data-from={row.from}
            >
              {row.text}
            </span>{' '}
            <For each={noted().at(row.index)}>{(n) => <NotedAfter noted={n} />}</For>
          </>
        )}
      </For>
      <For each={marks.end}>{(name) => <MarkChip beat={line.id} name={name} />}</For>
      <For each={noted().end}>{(n) => <NotedAfter noted={n} />}</For>
    </Target>
  );
};

/** A beat: its head (its id, where it starts, its badge), what its picture does, its line, and its sources. */
const Beat = (props: { readonly beat: BeatRow }) => {
  const { meta } = useLab();
  const script = useScript();
  const beat = props.beat;
  const said = () => script.said(beat.id);
  return (
    <section
      class="lab-script-beat"
      data-scene={beat.id}
      data-live={pressed(script.live() === beat.id)}
      aria-label={beat.id}
    >
      <header class="lab-script-beat-head">
        <button
          type="button"
          class="lab-script-id"
          data-act="seek-beat"
          title="Show the beat's first frame"
          onClick={() => script.seekBeat(beat.id)}
        >
          {beat.id}
          <Timecode class="lab-script-at" seconds={beat.start} fps={meta.film.fps} />
        </button>
        <Show when={beat.estimated}>
          <span
            class="sh-badge"
            data-state="stale"
            title="Narration estimated, not recorded: no take voices the line as it reads now"
          >
            estimated
          </span>
        </Show>
        <BeatMarkers beat={beat.id} />
      </header>
      <Show
        when={Option.getOrUndefined(
          Option.flatMap(said(), (b) => Option.fromUndefinedOr(b.picture)),
        )}
      >
        {(picture) => (
          <Picture
            beat={beat.id}
            text={picture()}
            cues={beat.ties.map((t) => t.cue)}
            marks={Option.getOrElse(
              Option.map(beat.line, (l) => l.marks),
              () => ({}),
            )}
          />
        )}
      </Show>
      {Option.toArray(beat.line).map((line) => (
        <Line line={line} />
      ))}
      <Ties beat={beat.id}>
        <NoteButton />
      </Ties>
      <Composer beat={beat.id} />
      <ShownNote beat={beat.id} />
      <Show
        when={Option.getOrUndefined(
          Option.filter(
            Option.map(said(), (b) => b.cite),
            (cite) => cite.length > 0,
          ),
        )}
      >
        {(cite) => (
          <ul class="lab-script-cite" aria-label="Sources">
            <For each={cite()}>{(source) => <li>{source}</li>}</For>
          </ul>
        )}
      </Show>
    </section>
  );
};

/** The beats in a box of their own that scrolls, the word playing and the words selected painted, kept in sight by Follow. */
const Beats = () => {
  const { meta } = useLab();
  const script = useScript();
  const notes = useScriptNotes();
  let page = Option.none<HTMLElement>();
  let scroller = Option.none<HTMLElement>();

  const rangesAt = (at: Option.Option<WordAt>) =>
    rangesOf(Option.toArray(Option.flatMap(at, (w) => rowOf(script.lines, w))));
  usePainted(
    meta.host,
    () => page,
    () => ({
      'lab-live': rangesAt(script.lit()),
      'lab-read': rangesOf([...script.read(), ...notes.shownRows()]),
      'lab-picked': rangesOf(script.picked()),
      ...notedPainted(notes.noted()),
    }),
  );

  // What the reader keeps in sight: the word playing, else the head of the beat under the frame.
  const looking = createMemo(() =>
    Option.match(script.lit(), {
      onSome: (w) => `w:${w.section}:${w.index}`,
      onNone: () => `b:${script.live()}`,
    }),
  );
  const found = (selector: string) =>
    Option.flatMap(page, (root) => Option.fromNullishOr(root.querySelector<HTMLElement>(selector)));
  useFollow({
    box: () => scroller,
    content: () => page,
    target: looking,
    span: (key) =>
      Option.map(
        Option.orElse(
          Option.flatMap(Option.fromNullishOr(WORD_KEY.exec(key)), ([, beat = '', index = '']) =>
            found(`[data-scene="${CSS.escape(beat)}"] [data-index="${index}"]`),
          ),
          () =>
            Option.flatMap(Option.fromNullishOr(BEAT_KEY.exec(key)), ([, beat = '']) =>
              found(`[data-scene="${CSS.escape(beat)}"] .lab-script-beat-head`),
            ),
        ),
        (row) => ({ first: row, last: row }),
      ),
    // Two lines clear of each edge.
    clear: () => {
      const lh = Option.match(page, {
        onNone: () => 0,
        onSome: (root) => Number.parseFloat(getComputedStyle(root).lineHeight) || 0,
      });
      return { top: 2 * lh, bottom: 2 * lh };
    },
    placing: script.following,
    reader: script.suspend,
    played: script.resume,
  });

  return (
    <div
      class="lab-script-scroll"
      role="region"
      tabindex="0"
      aria-label="The film's beats"
      ref={(el: HTMLDivElement) => {
        scroller = Option.some(el);
      }}
    >
      <div
        class="lab-script-page"
        ref={(el: HTMLDivElement) => {
          page = Option.some(el);
        }}
      >
        {/* The beats are the staged film's, laid out once: each a plain value, read where it is drawn. */}
        <For each={script.beats}>{(beat) => <Beat beat={beat} />}</For>
      </div>
    </div>
  );
};

/** The Script's reader: a column beside the picture on a laptop, under it on a phone. */
export const Reader = () => (
  <Portal mount={document.body}>
    <section class="lab-script" data-role="script" aria-label="Script">
      <Head />
      <Status />
      <Beats />
    </section>
  </Portal>
);
