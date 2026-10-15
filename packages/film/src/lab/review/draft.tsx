// A series draft in the Script reader (`/series/<series>/<draft>`, the
// review's): the draft's beats as its Markdown reads now (`core/draft.ts`,
// read by the server and sent with the page), drawn by the review's Script
// reader (`reader.tsx`) over the draft's routes: its staging takes, its
// delivery marks written into the draft's Markdown (`POST …/marks`, one cell
// changed and not another byte), the draft as the write leaves it shown and
// its takes read again, the beat's new take queued first.
//
// The words selected are kept in the URL on the draft's page
// (`/series/<series>/<draft>/<beat>?words=<a>-<b>`); an ask that shows the
// draft keeps its own (`DraftReader`, whose `selecting` the page gives).

import { useAtomValue } from '@bible/atom-solid';
import { Show } from '@solidjs/web';
import { Effect, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { createMemo, createSignal, untrack } from 'solid-js';
import { addressOn } from '../../browser/host.ts';
import { wordsIn, wordsText } from '../../command/selection.ts';
import { type DraftRead, draftTakeUrl, pageHref } from '../../core/api.ts';
import { reasonOf } from '../api.ts';
import { PlaceStyle } from '../place-style.tsx';
import { SCRIPT_READ_CSS } from '../script/style.ts';
import { ReviewApi } from './api.ts';
import { useReview } from './context.tsx';
import { READER_CSS, STATUS_ROLE, ScriptReader, type Selecting } from './reader.tsx';

/**
 * A draft's page's own look, over the reader's (`READER_CSS`): one column at
 * a reading measure, its title and its series over the beats.
 */
const DRAFT_CSS = `
.dr { max-width: 720px; margin: 0 auto; background: var(--surface-1); }
.dr-head { padding: var(--s-3) var(--gutter) 0; }
.dr-head h1 { margin: 0; font-size: var(--fs-5); line-height: var(--lh-5); font-weight: var(--w-3); }
.dr-series { margin: 0; color: var(--text-2); font-size: var(--fs-2); line-height: var(--lh-2); }
.dr-status { margin: 0; padding: var(--s-3) var(--gutter); color: var(--text-2); }
`;

/**
 * Series draft `draft` of `series` in the reader, as its Markdown reads now:
 * its beats (only those `only` names, when it names some), or why it cannot
 * be read; a mark write's answer, the draft as the write left it, stands
 * over the read it was sent over until the draft is read again.
 */
export const DraftReader = (props: {
  readonly series: string;
  readonly draft: string;
  readonly only: Option.Option<ReadonlyArray<string>>;
  readonly selecting: Selecting;
}) => {
  const { meta } = useReview();
  const read = useAtomValue(() => meta.draft(props.series, props.draft));
  // A refresh since outranks an answer sent over an older read.
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
  const beats = () =>
    Option.match(shown(), {
      onNone: () => [],
      onSome: (d) =>
        Option.match(props.only, {
          onNone: () => d.beats,
          onSome: (only) => d.beats.filter((b) => only.includes(b.id)),
        }),
    });
  return (
    <Show
      when={Option.isSome(shown())}
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
      <ScriptReader
        beats={beats}
        selecting={props.selecting}
        source={{
          voice: ReviewApi.use((api) => api.draftVoice(props.series, props.draft)),
          // The answer is bound to the read the write was sent over: a refresh since outranks it.
          mark: (post) => {
            const over = untrack(() => AsyncResult.value(read()));
            return ReviewApi.use((api) => api.draftMarks(props.series, props.draft, post)).pipe(
              Effect.tap((next) =>
                Effect.sync(() => setAnswered(Option.some({ read: next, over }))),
              ),
            );
          },
          takeUrl: (file) => draftTakeUrl(props.series, props.draft, file),
          written: 'marked in the draft',
        }}
      />
    </Show>
  );
};

/** The words selected on a draft's page, as its URL holds them: in one beat, the first not after the last. */
const useUrlSelecting = (series: string, draft: string): Selecting => {
  const { state, meta } = useReview();
  const address = addressOn(meta.host);
  return {
    selected: () => {
      const place = state.place();
      if (place._tag !== 'Draft') return Option.none();
      return Option.map(wordsIn(place.beat, place.words), (w) => ({
        beat: w.scene,
        from: w.from,
        to: w.to,
      }));
    },
    select: (beat, w) => address.go(pageHref.draftBeat(series, draft, beat, wordsText(w))),
    clear: () => address.go(pageHref.draft(series, draft)),
  };
};

/** Series draft `draft` of `series`: its head, then its beats, or why it cannot be read. */
export const DraftPage = (props: { readonly series: string; readonly draft: string }) => {
  const { meta, state } = useReview();
  const read = useAtomValue(() => meta.draft(props.series, props.draft));
  // Made once, in the page's body: a prop's getter would make it at each read, outside its owner.
  const selecting = useUrlSelecting(props.series, props.draft);
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
          ${SCRIPT_READ_CSS} ${READER_CSS} ${DRAFT_CSS}
        `}
      />
      <article class="dr" data-draft={`${props.series}/${props.draft}`}>
        <header class="dr-head">
          <p class="dr-series">{seriesTitle()}</p>
          <h1>
            {Option.getOrElse(
              Option.map(AsyncResult.value(read()), (d) => d.title),
              () => props.draft,
            )}
          </h1>
        </header>
        <DraftReader
          series={props.series}
          draft={props.draft}
          only={Option.none()}
          selecting={selecting}
        />
      </article>
    </>
  );
};
