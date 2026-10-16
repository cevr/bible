// The Transcript view (a talk's "the words are the edit"): the talk's
// sections in play order, each a paragraph of its take's words as the
// captions spell them, the words the cut strikes hidden until "Show cuts"
// (then shown struck through), the word playing at the frame lit, the words
// selected (`?words=a-b`) painted, and the word `?text=<word>` holds washed.
// Lit by the clock, never by what ran, so a link with `#t=` lights what its
// sender saw. The text is painted through the page's highlights
// (`browser/highlights.ts`), so it stays selectable and copyable, and a word
// lit costs no element; its words are laid out, painted and pressed as the
// Script's are (`words.ts`).
//
// Closed at rest; opened by `?text=follow` (the view scrolls to the word
// playing until a hand scrolls it; Play or Follow takes it back) or
// `?text=<word>` (held there), by the lab's one Follow rule
// (`lab/follow.ts`); its scrolling words are a tab stop, so the keyboard
// scrolls them. A tap on a word shows it: the frame seeks to where it
// starts, and it is selected (shift extends the selection); a text selection
// across words selects them; a word held (or right-clicked) opens the page's
// menu about it, whose Select to here extends the selection to it: a
// phone's range. Under the words, what the selection can have done: Cut,
// Restore, Mark here, each the command of that name (`commands.ts`). On a
// laptop it is a column beside the picture; on a phone a sheet of its own.

import { For, Portal, Show } from '@solidjs/web';
import { Array as Arr, Boolean as Bool, Option } from 'effect';
import { type ParentProps, createMemo } from 'solid-js';
import { BY_BUTTON } from '../../command/command.ts';
import { Selection, selectionText } from '../../command/selection.ts';
import { targetAttr } from '../../command/target.ts';
import { Target } from '../command/context-menu.tsx';
import { useFollow } from '../follow.ts';
import { pressed } from '../pressed.ts';
import { useLab, useLabClock } from '../shell.tsx';
import { Sheet } from '../sheet.tsx';
import { PHONE, useMatches } from '../viewport.ts';
import { playsAny, strikesAny } from './commands.ts';
import { TalkState, useTranscript } from './context.tsx';
import { type WordAt, rangesOf, rowOf } from './lit.ts';
import { FOLLOW_TEXT } from './open.ts';
import { usePainted, wordsReleased } from './words.ts';

/** A word as Follow names it: its section and its index, one string that settles while the word does. */
const keyOf = (at: WordAt) => `${at.section}:${at.index}`;

/** The talk's words, a paragraph to a section, with the lit, held and selected words painted. */
const Text = () => {
  const { meta } = useLab();
  const text = useTranscript();
  let page = Option.none<HTMLElement>();
  // The box the words move in: the view's own, in the column and in the sheet alike.
  let scroller = Option.none<HTMLElement>();
  const box = () => scroller;

  const rangesAt = (at: Option.Option<WordAt>) =>
    rangesOf(Option.toArray(Option.flatMap(at, (w) => rowOf(text.sections(), w))));
  usePainted(
    meta.host,
    () => page,
    () => {
      // Painted again as the struck words show or hide.
      text.cuts();
      return {
        'lab-live': rangesAt(text.lit()),
        'lab-read': rangesAt(text.held()),
        'lab-picked': rangesOf(text.picked()),
      };
    },
  );

  // The word the view looks at: the held word, else the one playing while it follows.
  const looking = createMemo(() =>
    Option.match(
      Option.orElse(text.held(), () =>
        Option.flatMap(
          Option.filter(Option.some(text.following()), (on) => on),
          () => text.lit(),
        ),
      ),
      { onNone: () => '', onSome: keyOf },
    ),
  );
  useFollow(
    {
      box,
      content: () => page,
      target: looking,
      span: (key) => {
        const [section = '', index = ''] = key.split(':');
        return Option.map(
          Option.flatMap(page, (root) =>
            Option.fromNullishOr(
              root.querySelector<HTMLElement>(
                `[data-scene="${CSS.escape(section)}"] [data-index="${index}"]`,
              ),
            ),
          ),
          (word) => ({ first: word, last: word }),
        );
      },
      // Two lines clear of each edge.
      clear: () => {
        const lh = Option.match(page, {
          onNone: () => 0,
          onSome: (root) => Number.parseFloat(getComputedStyle(root).lineHeight) || 0,
        });
        return { top: 2 * lh, bottom: 2 * lh };
      },
      placing: text.placing,
      reader: text.suspend,
      played: () => {
        if (Option.exists(text.open(), (o) => o._tag === 'Follow')) text.resume();
      },
    },
    useLabClock(),
  );

  // A press that ends a text selection across words selects them; a tap on one word shows it.
  const released = wordsReleased({
    sections: text.sections,
    selectRange: text.selectRange,
    tap: text.tap,
  });
  return (
    <div
      class="lab-transcript-scroll"
      role="region"
      tabindex="0"
      aria-label={`${Option.getOrElse(text.file(), () => 'talk.ts')}, the talk's words`}
      ref={(el: HTMLDivElement) => {
        scroller = Option.some(el);
      }}
    >
      <div
        class="lab-transcript-page"
        data-cuts={pressed(text.cuts())}
        ref={(el: HTMLDivElement) => {
          page = Option.some(el);
        }}
      >
        <For each={text.sections()} keyed={(s) => s.id}>
          {(section) => (
            <section class="lab-transcript-section" data-scene={section().id}>
              <h3 class="lab-transcript-scene">{section().id}</h3>
              {/* The section's words are a thing the page's context menu opens on, as a line of code is. */}
              <Target
                of={Selection.cases.Words.make({
                  scene: section().id,
                  from: Option.getOrElse(
                    Option.map(Arr.head(section().rows), (r) => r.index),
                    () => 0,
                  ),
                  to: Option.getOrElse(
                    Option.map(Arr.last(section().rows), (r) => r.index),
                    () => 0,
                  ),
                })}
                class="lab-transcript-words"
                onClick={released}
              >
                <For each={section().rows} keyed={(r) => r.index}>
                  {(row) => (
                    <>
                      {/* A word is a thing of its own the menu opens on, nested in its section's: Select to here, Cut… */}
                      <span
                        class="lab-transcript-w"
                        data-target={targetAttr(
                          Selection.cases.Words.make({
                            scene: section().id,
                            from: row().index,
                            to: row().index,
                          }),
                        )}
                        data-index={row().index}
                        data-struck={pressed(row().struck)}
                        data-from={row().from}
                      >
                        {row().text}
                      </span>{' '}
                    </>
                  )}
                </For>
              </Target>
            </section>
          )}
        </For>
      </div>
    </div>
  );
};

/** The column's way out: Close (a sheet has its own). */
const Close = () => {
  const { actions } = useLab();
  return (
    <button
      type="button"
      class="sh-btn lab-transcript-close"
      data-act="close-transcript"
      onClick={() => actions.dismissText()}
    >
      Close
    </button>
  );
};

/** The view's head: the talk's file, Show cuts, Follow, and what its place adds after them (`children`: the column's Close). */
const Head = (props: ParentProps) => {
  const { actions } = useLab();
  const text = useTranscript();
  const follow = () => {
    text.resume();
    if (Option.exists(text.open(), (o) => o._tag === 'Word'))
      actions.showText(Option.some(FOLLOW_TEXT));
  };
  return (
    <header class="lab-transcript-head">
      <span class="lab-transcript-file lab-clamp">
        {Option.getOrElse(text.file(), () => 'talk.ts')}
      </span>
      <button
        type="button"
        class="sh-btn lab-transcript-cuts"
        data-act="show-cuts"
        aria-pressed={pressed(text.cuts())}
        title="Show the words the cut strikes"
        onClick={() => text.showCuts(!text.cuts())}
      >
        Show cuts
      </button>
      <button
        type="button"
        class="sh-btn lab-transcript-follow"
        data-act="follow-transcript"
        aria-pressed={pressed(text.following())}
        title="Scroll with the frame"
        onClick={follow}
      >
        Follow
      </button>
      {props.children}
    </header>
  );
};

/** What the words selected can have done: their name, and Cut, Restore, Mark here, each its command run by a button. */
const Actions = () => {
  const { meta } = useLab();
  const text = useTranscript();
  const run = (id: string) => () => meta.hub.invokeId(id, BY_BUTTON);
  return (
    <Show when={Option.getOrUndefined(text.selected())}>
      {(words) => (
        <footer class="lab-transcript-actions">
          <span class="lab-transcript-picked">{selectionText(words())}</span>
          <button
            type="button"
            class="sh-btn"
            data-act="cut-words"
            disabled={!playsAny(text.picked()) || text.writing()}
            onClick={run('transcript.cut')}
          >
            Cut
          </button>
          <button
            type="button"
            class="sh-btn"
            data-act="restore-words"
            disabled={!strikesAny(text.picked()) || text.writing()}
            onClick={run('transcript.restore')}
          >
            Restore
          </button>
          <button
            type="button"
            class="sh-btn"
            data-act="mark-word"
            disabled={!playsAny(text.picked()) || text.writing()}
            onClick={run('transcript.mark')}
          >
            Mark here
          </button>
        </footer>
      )}
    </Show>
  );
};

/**
 * The talk's words with the head once the server has read them; while it
 * reads, or when it refuses, the words and the way out. `children`: what its
 * place adds to the head (the column's Close).
 */
const Body = (props: ParentProps) => {
  const text = useTranscript();
  const read = () => TalkState.$is('Read')(text.state());
  return (
    <section class="lab-transcript" data-role="transcript">
      <Show
        when={read()}
        fallback={
          <>
            <Show when={TalkState.$is('Refused')(text.state())}>
              <header class="lab-transcript-head">
                <span class="lab-transcript-file">talk.ts</span>
                <button
                  type="button"
                  class="sh-btn lab-transcript-retry"
                  data-act="retry-transcript"
                  onClick={() => text.retry()}
                >
                  Retry
                </button>
                {props.children}
              </header>
            </Show>
            <p
              class="lab-transcript-note"
              role={Bool.match(TalkState.$is('Refused')(text.state()), {
                onTrue: () => 'alert',
                onFalse: () => 'status',
              })}
            >
              {TalkState.$match(text.state(), {
                Idle: () => 'Reading the talk…',
                Reading: () => 'Reading the talk…',
                Read: () => '',
                Refused: ({ reason }) => `Could not read the talk: ${reason}`,
              })}
            </p>
          </>
        }
      >
        <Head>{props.children}</Head>
        <Text />
        <Actions />
      </Show>
    </section>
  );
};

/** On a laptop, the open view as a column beside the picture. */
export const Column = () => {
  const { state, meta } = useLab();
  const phone = useMatches(meta.host, PHONE);
  return (
    <Show when={!phone() && Option.isSome(state.text())}>
      <Portal mount={document.body}>
        <aside class="lab-transcript-col" aria-label="Transcript">
          <Body>
            <Close />
          </Body>
        </aside>
      </Portal>
    </Show>
  );
};

/** On a phone, the open view in a sheet of its own. */
export const OwnSheet = () => {
  const { state, actions, meta } = useLab();
  const phone = useMatches(meta.host, PHONE);
  return (
    <Show when={phone() && Option.isSome(state.text())}>
      <Sheet
        host={meta.host}
        hub={meta.hub}
        role="transcript"
        class="lab-transcript-sheet"
        title="Transcript"
        initialFocus={() => false}
        onClose={actions.dismissText}
      >
        <Body />
      </Sheet>
    </Show>
  );
};
