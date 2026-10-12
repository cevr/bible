// The Transcript view (a talk's "the words are the edit"): the talk's
// sections in play order, each a paragraph of its take's words as the
// captions spell them, the words the cut strikes hidden until "Show cuts"
// (then shown struck through), the word playing at the frame lit, the words
// selected (`?words=a-b`) painted, and the word `?text=<word>` holds washed.
// Lit by the clock, never by what ran, so a link with `#t=` lights what its
// sender saw. The text is painted through the page's highlights
// (`browser/highlights.ts`), so it stays selectable and copyable, and a word
// lit costs no element.
//
// Closed at rest; opened by `?text=follow` (the view scrolls to the word
// playing until a hand scrolls it; Play or Follow takes it back) or
// `?text=<word>` (held there), by the lab's one Follow rule
// (`lab/follow.ts`). A tap on a word shows it: the frame seeks to where it
// starts, and it is selected (shift extends the selection); a text selection
// across words selects them. Under the words, what the selection can have
// done: Cut, Restore, Mark here. On a laptop it is a column beside the
// picture; on a phone a sheet of its own.

import { For, Portal, Show } from '@solidjs/web';
import { Array as Arr, Boolean as Bool, Effect, Option } from 'effect';
import { createEffect, createMemo, onCleanup } from 'solid-js';
import { Highlights, type HighlightName } from '../../browser/highlights.ts';
import { Selection, selectionText } from '../../command/selection.ts';
import type { CodeRange } from '../../core/schema.ts';
import { Target } from '../command/context-menu.tsx';
import { useFollow } from '../follow.ts';
import { pressed } from '../pressed.ts';
import { useLab } from '../shell.tsx';
import { Sheet } from '../sheet.tsx';
import { PHONE, useMatches } from '../viewport.ts';
import { TalkState, useTranscript } from './context.tsx';
import { type Row, type SectionRows, type WordAt, rangesOf } from './lit.ts';
import { FOLLOW_TEXT } from './open.ts';

/** A word as Follow names it: its section and its index, one string that settles while the word does. */
const keyOf = (at: WordAt) => `${at.section}:${at.index}`;

/** The row of `at` among `sections`. */
const rowOf = (sections: ReadonlyArray<SectionRows>, at: WordAt): Option.Option<Row> =>
  Option.flatMap(Option.fromUndefinedOr(sections.find((s) => s.id === at.section)), (s) =>
    Option.fromUndefinedOr(s.rows.find((r) => r.index === at.index)),
  );

/** The nearest ancestor of `el` that scrolls: the box the words move in, in the column and in the sheet alike. */
const scrollContainerOf = (el: HTMLElement): Option.Option<HTMLElement> =>
  Option.flatMap(Option.fromNullishOr(el.parentElement), (up) => {
    const y = getComputedStyle(up).overflowY;
    return Bool.match(y === 'auto' || y === 'scroll', {
      onTrue: () => Option.some(up),
      onFalse: () => scrollContainerOf(up),
    });
  });

/** The word a node of the text is in: its section and its index. */
const wordOfNode = (node: Option.Option<Node>): Option.Option<WordAt> =>
  Option.flatMap(
    Option.flatMap(
      Option.flatMap(node, (n) =>
        Option.orElse(
          Option.liftPredicate(n, (x): x is Element => x instanceof Element),
          () => Option.fromNullishOr(n.parentElement),
        ),
      ),
      (el) => Option.fromNullishOr(el.closest('[data-index]')),
    ),
    (el) =>
      Option.map(
        Option.fromNullishOr(el.closest('[data-scene]')?.getAttribute('data-scene')),
        (section) => ({ section, index: Number(el.getAttribute('data-index')) }),
      ),
  );

/** The talk's words, a paragraph to a section, with the lit, held and selected words painted. */
const Text = () => {
  const { meta } = useLab();
  const text = useTranscript();
  let page = Option.none<HTMLElement>();
  let scroller = Option.none<HTMLElement>();
  const box = () => {
    if (Option.isNone(scroller)) scroller = Option.flatMap(page, scrollContainerOf);
    return scroller;
  };

  const paint = (name: HighlightName, ranges: ReadonlyArray<CodeRange>) =>
    Option.map(page, (root) =>
      Effect.runSyncWith(meta.host)(Highlights.use((h) => h.paint(name, root, ranges))),
    );
  const rangesAt = (at: Option.Option<WordAt>) =>
    rangesOf(Option.toArray(Option.flatMap(at, (w) => rowOf(text.sections(), w))));
  createEffect(
    () => ({
      live: rangesAt(text.lit()),
      read: rangesAt(text.held()),
      picked: rangesOf(text.picked()),
      cuts: text.cuts(),
    }),
    (now) => {
      paint('lab-live', now.live);
      paint('lab-read', now.read);
      paint('lab-picked', now.picked);
    },
  );
  onCleanup(() =>
    Effect.runSyncWith(meta.host)(
      Highlights.use((h) =>
        Effect.andThen(
          Effect.andThen(h.clear('lab-live'), h.clear('lab-read')),
          h.clear('lab-picked'),
        ),
      ),
    ),
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
  useFollow({
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
  });

  // The page's text selection, when it spans any text.
  const textSelection = () =>
    Option.filter(Option.fromNullishOr(window.getSelection()), (s) => !s.isCollapsed);
  // The words a text selection spans, from the first to the last, in one section.
  const selectWords = (selection: globalThis.Selection) =>
    Option.map(
      Option.filter(
        Option.zipWith(
          wordOfNode(Option.fromNullishOr(selection.anchorNode)),
          wordOfNode(Option.fromNullishOr(selection.focusNode)),
          (a, b) => ({ a, b }),
        ),
        ({ a, b }) => a.section === b.section,
      ),
      ({ a, b }) =>
        text.selectRange(a.section, Math.min(a.index, b.index), Math.max(a.index, b.index)),
    );
  // A press that ends a text selection across words selects them; a tap on one word shows it.
  const released = (event: MouseEvent) => {
    const selection = textSelection();
    if (Option.isSome(selection)) {
      selectWords(selection.value);
      return;
    }
    const target = Option.filter(
      Option.fromNullishOr(event.target),
      (t): t is Node => t instanceof Node,
    );
    Option.map(wordOfNode(target), (at) =>
      Option.map(rowOf(text.sections(), at), (row) => text.tap(at.section, row, event.shiftKey)),
    );
  };
  return (
    <div class="lab-transcript-scroll">
      <div
        class="lab-transcript-page"
        data-cuts={pressed(text.cuts())}
        role="region"
        aria-label={`${Option.getOrElse(text.file(), () => 'talk.ts')}, the talk's words`}
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
                      <span
                        class="lab-transcript-w"
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

/** The view's head: the talk's file, Show cuts, Follow, and (in the column) Close. */
const Head = (props: { readonly close: boolean }) => {
  const { actions } = useLab();
  const text = useTranscript();
  const follow = () => {
    text.resume();
    if (Option.exists(text.open(), (o) => o._tag === 'Word'))
      actions.showText(Option.some(FOLLOW_TEXT));
  };
  return (
    <header class="lab-transcript-head">
      <span class="lab-transcript-file">{Option.getOrElse(text.file(), () => 'talk.ts')}</span>
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
      <Show when={props.close}>
        <button
          type="button"
          class="sh-btn lab-transcript-close"
          data-act="close-transcript"
          onClick={() => actions.dismissText()}
        >
          Close
        </button>
      </Show>
    </header>
  );
};

/** What the words selected can have done: their name, and Cut, Restore, Mark here. */
const Actions = () => {
  const text = useTranscript();
  return (
    <Show when={Option.getOrUndefined(text.selected())}>
      {(words) => (
        <footer class="lab-transcript-actions">
          <span class="lab-transcript-picked">{selectionText(words())}</span>
          <button
            type="button"
            class="sh-btn"
            data-act="cut-words"
            disabled={!text.canCut() || text.writing()}
            onClick={() => text.cut()}
          >
            Cut
          </button>
          <button
            type="button"
            class="sh-btn"
            data-act="restore-words"
            disabled={!text.canRestore() || text.writing()}
            onClick={() => text.restore()}
          >
            Restore
          </button>
          <button
            type="button"
            class="sh-btn"
            data-act="mark-word"
            disabled={!text.canCut() || text.writing()}
            onClick={() => text.mark()}
          >
            Mark here
          </button>
        </footer>
      )}
    </Show>
  );
};

/** The talk's words with the head once the server has read them; while it reads, or when it refuses, the words and the way out. */
const Body = (props: { readonly close: boolean }) => {
  const { actions } = useLab();
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
                <Show when={props.close}>
                  <button
                    type="button"
                    class="sh-btn lab-transcript-close"
                    data-act="close-transcript"
                    onClick={() => actions.dismissText()}
                  >
                    Close
                  </button>
                </Show>
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
        <Head close={props.close} />
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
          <Body close />
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
        <Body close={false} />
      </Sheet>
    </Show>
  );
};
