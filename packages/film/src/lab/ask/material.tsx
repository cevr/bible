// The material an ask's section shows, in place, each through the part its
// own view draws it with, over the same reads: a set's document as the set's
// page reads it (`Markdown`, a long one clamped with Read all, so the
// question stays near it), a script in the Script reader (a film's or a
// series draft's, named as its page names it, its staging takes played and
// its delivery marks written as on the Script and draft pages), the Board's
// panels as the Board shows them (`PanelFigure`: each thumb, the words it
// holds over and its mark; a still opens large), a video in the review's
// player (`PlayedAlone`), a take as the studio plays it. Each part says
// where its material stands while it is not shown: read under way, could
// not be read (and why), or no longer there. Each part carries its own look
// (`PlaceStyle`), so it rides only on a page that shows it. Nothing here is
// a copy of a view: a fix to the view is a fix here.

import { useAtomValue } from '@bible/atom-solid';
import { For, type JSX, Show } from '@solidjs/web';
import { Array as Arr, Match, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import {
  type Accessor,
  type ParentProps,
  createEffect,
  createMemo,
  createSignal,
  untrack,
} from 'solid-js';
import { type AskBlock, scriptSource } from '../../core/ask.ts';
import { type ScriptBeats, attemptUrl, boardFileUrl, reviewFrameUrl } from '../../core/api.ts';
import { type BoardFile, type Panel, panelsOf, shownTry } from '../../core/board.ts';
import { docAt, videoAt } from '../../core/review.ts';
import { PanelFigure, PanelThumb } from '../board/view.tsx';
import { PANEL_THUMB_CSS } from '../board/style.ts';
import { lineWords, panelWords } from '../board/words.ts';
import { PlaceStyle } from '../place-style.tsx';
import { WIDE } from '../viewport.ts';
import { pressed } from '../pressed.ts';
import { SCRIPT_READ_CSS } from '../script/style.ts';
import { type LabFailure, reasonOf } from '../api.ts';
import { ReviewApi } from '../review/api.ts';
import { useReview } from '../review/context.tsx';
import { DraftReader, useDraftTitles } from '../review/draft.tsx';
import { FilmScriptReader } from '../review/film-script.tsx';
import { POSTER_W, videoSource } from '../review/format.ts';
import { PlayedAlone } from '../review/player.tsx';
import { READER_CSS, type Selecting, type WordsAt } from '../review/reader.tsx';
import { Markdown, ProxyPending, Zoom } from '../review/section.tsx';

type BlockOf<K extends AskBlock['kind']> = Extract<AskBlock, { readonly kind: K }>;

/**
 * The material's own look: a box the width of its section (its one column
 * never wider, so a video's own size cannot widen the page), its caption
 * under it; a long document clamped.
 */
const MATERIAL_CSS = `
.ak-mat{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s-2);min-width:0;margin:0}
.ak-mat-cap{margin:0;color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2)}
.ak-mat-status{margin:0;color:var(--text-2)}
.ak-mat-status[data-failed=true]{color:var(--state-warning)}
.ak-mat-name{margin:0;color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2)}
.ak-clamp{min-width:0}
.ak-clamp[data-open=false]{max-height:calc(12 * var(--lh-3));overflow:hidden}
.ak-clamp[data-open=false][data-long=true]{mask-image:linear-gradient(to bottom,var(--surface-0) 70%,transparent)}
.ak-read-all{justify-self:start;min-height:var(--hit)}
`;

/** The Board's panels in an ask: a beat's panels in a row under its id, at the film's aspect; two to a row at least 240 px wide on a laptop. */
const BOARD_MAT_CSS = `
.ak-board{display:grid;gap:var(--s-3)}
.ak-board-beat{display:grid;gap:var(--s-1)}
.ak-board-id{margin:0;color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2);font-weight:var(--w-2)}
.ak-board-panels{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(160px,100%),1fr));gap:var(--s-2)}
.ak-board-panel{display:flex;flex-direction:column;gap:var(--s-1);margin:0;min-width:0;padding:var(--s-1);
  border:var(--border);border-radius:var(--r-2);background:var(--surface-2)}
.ak-board-panel .rv-zoom img{border-radius:var(--r-1)}
@media ${WIDE}{.ak-board-panels{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}}
`;

/** The take's player: the width of the section, its words under it. */
const AUDIO_CSS = `
.ak-audio{display:block;width:100%;min-height:var(--hit)}
.ak-heard{margin:0;color:var(--text-1)}
`;

/** A material part's frame: its look, the part, and its caption when it has one. */
const Framed = (props: {
  readonly kind: AskBlock['kind'];
  readonly css: string;
  readonly caption: Option.Option<string>;
  readonly children: JSX.Element;
}) => (
  <figure class="ak-mat" data-material={props.kind}>
    <PlaceStyle
      css={`
        ${MATERIAL_CSS} ${props.css}
      `}
    />
    {props.children}
    <Show when={Option.getOrUndefined(props.caption)}>
      {(caption: Accessor<string>) => <figcaption class="ak-mat-cap">{caption()}</figcaption>}
    </Show>
  </figure>
);

/** Why the material is not shown: its read under way, failed (and why), or the material gone from it. */
const Missing = (props: {
  readonly read: AsyncResult.AsyncResult<unknown, LabFailure>;
  readonly what: string;
  readonly gone: string;
}) => (
  <p class="ak-mat-status" role="status" data-failed={pressed(!AsyncResult.isInitial(props.read))}>
    {AsyncResult.match(props.read, {
      onInitial: () => `Reading ${props.what}…`,
      onFailure: (f) => `Could not read ${props.what}: ${reasonOf(f.cause)}`,
      onSuccess: () => props.gone,
    })}
  </p>
);

/**
 * `children` clamped to about twelve lines, with Read all, once they run
 * longer: the question under a long document stays a short scroll away. The
 * box is held at the clamp until Read all opens it, so its words are
 * measured against the clamp itself (a box opened while it measures would
 * always fit its words); it watches their height (a document's text arrives
 * after it is drawn), and fades and offers Read all only once there is more
 * to read.
 */
const Clamped = (props: ParentProps) => {
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  const [long, setLong] = createSignal(false, { ownedWrite: true });
  let outer = Option.none<HTMLElement>();
  let words = Option.none<HTMLElement>();
  // Once laid out, and as the words grow (a document's text arrives after it is drawn).
  createEffect(
    () => true,
    () =>
      Option.match(words, {
        onNone: () => () => {},
        onSome: (inner) => {
          const observer = new ResizeObserver(() =>
            setLong(Option.exists(outer, (o) => inner.offsetHeight > o.clientHeight + 1)),
          );
          observer.observe(inner);
          return () => observer.disconnect();
        },
      }),
  );
  const measure = (inner: HTMLElement) => {
    words = Option.some(inner);
  };
  return (
    <>
      <div
        class="ak-clamp"
        data-open={pressed(open())}
        data-long={pressed(long())}
        ref={(el: HTMLElement) => {
          outer = Option.some(el);
        }}
      >
        <div ref={measure}>{props.children}</div>
      </div>
      <Show when={long() && !open()}>
        <button
          type="button"
          class="sh-btn ak-read-all"
          data-act="read-all"
          onClick={() => setOpen(true)}
        >
          Read all
        </button>
      </Show>
    </>
  );
};

/** A set's Markdown, as the set's page reads it, clamped while it is long. */
export const DocumentPart = (props: { readonly block: BlockOf<'document'> }) => {
  const { state } = useReview();
  const file = createMemo(() =>
    Option.flatMap(AsyncResult.value(state.index()), (index) => docAt(index, props.block.ref)),
  );
  return (
    <Framed kind="document" css="" caption={Option.fromUndefinedOr(props.block.caption)}>
      <Show
        when={Option.getOrUndefined(file())}
        keyed
        fallback={
          <Missing
            read={state.index()}
            what={props.block.ref}
            gone={`${props.block.ref} is no longer in the review`}
          />
        }
      >
        {(f) => (
          <Clamped>
            <Markdown file={f} />
          </Clamped>
        )}
      </Show>
    </Framed>
  );
};

/** The words selected in an ask's reader: its own, kept on the page while it is open. */
const useOwnSelecting = (): Selecting => {
  const [selected, setSelected] = createSignal(Option.none<WordsAt>());
  return {
    selected,
    select: (beat, w) => setSelected(Option.some({ beat, from: w.from, to: w.to })),
    clear: () => setSelected(Option.none()),
  };
};

/** A series draft in the reader, named as its page names it: its series, then its title. */
const DraftScript = (props: {
  readonly series: string;
  readonly draft: string;
  readonly only: Option.Option<ReadonlyArray<string>>;
  readonly selecting: Selecting;
}) => {
  const titles = useDraftTitles(props.series, props.draft);
  return (
    <>
      <p class="ak-mat-name" data-role="script-name">
        {titles.series()} · {titles.draft()}
      </p>
      <DraftReader
        series={props.series}
        draft={props.draft}
        only={props.only}
        selecting={props.selecting}
      />
    </>
  );
};

/**
 * A script in the Script reader: a film's, or a series draft's, every beat
 * or those named. A block never changes once the ask is read, so its source
 * is read once, as plain names: a reader keyed on a condition's value would
 * read it untracked in its own effects.
 */
export const ScriptPart = (props: { readonly block: BlockOf<'script'> }) => {
  const selecting = useOwnSelecting();
  const only = Option.fromUndefinedOr(props.block.beats);
  const source = untrack(() => scriptSource(props.block));
  return (
    <Framed
      kind="script"
      css={`
        ${SCRIPT_READ_CSS} ${READER_CSS}
      `}
      caption={Option.none()}
    >
      {Match.value(source).pipe(
        Match.tagsExhaustive({
          Film: (s) => (
            <>
              <p class="ak-mat-name" data-role="script-name">
                The script of {s.film}
              </p>
              <FilmScriptReader film={s.film} only={only} selecting={selecting} />
            </>
          ),
          Draft: (s) => (
            <DraftScript series={s.series} draft={s.draft} only={only} selecting={selecting} />
          ),
        }),
      )}
    </Framed>
  );
};

/** A panel of an ask's Board, and the words its beat's line says while it holds. */
interface PanelShown {
  readonly panel: Panel;
  readonly words: string;
}

/** A beat of an ask's Board: its id, and its panels the ask names. */
interface BeatShown {
  readonly beat: string;
  readonly panels: ReadonlyArray<PanelShown>;
}

/**
 * The panels `block` names of `board`, by beat in the board's order (every
 * panel, when it names none), each with the words its beat's line says
 * while it holds (from its mark to the next panel's of its beat, named or
 * not), its line as `script` reads it (none until it is read).
 */
const panelsShown = (
  board: BoardFile,
  block: BlockOf<'board'>,
  script: Option.Option<ScriptBeats>,
): ReadonlyArray<BeatShown> => {
  const named = Option.fromUndefinedOr(block.panels);
  const shown = board.panels.filter((p) =>
    Option.match(named, { onNone: () => true, onSome: (ids) => ids.includes(p.id) }),
  );
  const lineOf = (beat: string) =>
    Option.getOrElse(
      Option.flatMap(script, (s) =>
        Option.map(
          Option.flatMap(
            Arr.findFirst(s.beats, (b) => b.id === beat),
            (b) => Option.fromUndefinedOr(b.say),
          ),
          (say) => lineWords(beat, say),
        ),
      ),
      () => [],
    );
  return Arr.dedupe(shown.map((p) => p.beat)).map((beat): BeatShown => {
    const all = panelsOf(board, beat);
    const line = lineOf(beat);
    return {
      beat,
      panels: shown
        .filter((p) => p.beat === beat)
        .map((panel): PanelShown => {
          const at = all.findIndex((p) => p.id === panel.id);
          const until = Option.map(Arr.get(all, at + 1), (next) => next.at);
          return { panel, words: panelWords(line, panel.at, until) };
        }),
    };
  });
};

/** A panel's thumb in an ask: its still opens large (`?still=`); a card's words, and a panel with no try, stand as they are. */
const AskPanelThumb = (props: { readonly film: string; readonly panel: Panel }) => {
  const src = () => Option.map(shownTry(props.panel), (t) => boardFileUrl(props.film, t.file));
  const still = () => Option.filter(src(), () => !props.panel.text);
  return (
    <Show
      when={Option.getOrUndefined(still())}
      fallback={<PanelThumb panel={props.panel} src={src()} />}
    >
      {(at: Accessor<string>) => (
        <Zoom
          still={at()}
          alt=""
          name={`board-${props.panel.id}`}
          shown={{ src: at(), caption: `${props.panel.beat} · ${props.panel.at}` }}
        />
      )}
    </Show>
  );
};

/** A film's Board: the panels named, each as the Board shows it, by beat. */
export const BoardPart = (props: { readonly block: BlockOf<'board'> }) => {
  const { meta } = useReview();
  const read = useAtomValue(() => meta.board(props.block.film));
  // The words each panel holds over are the script's: read as every reader of the film reads it.
  const script = useAtomValue(() => meta.script(props.block.film));
  const beats = createMemo(() =>
    Option.map(AsyncResult.value(read()), (board) =>
      panelsShown(board, props.block, AsyncResult.value(script())),
    ),
  );
  return (
    <Framed
      kind="board"
      css={`
        ${PANEL_THUMB_CSS} ${BOARD_MAT_CSS}
      `}
      caption={Option.none()}
    >
      <Show
        when={Option.getOrUndefined(beats())}
        fallback={
          <Missing
            read={read()}
            what={`the Board of ${props.block.film}`}
            gone={`${props.block.film} has no Board`}
          />
        }
      >
        {(shown: Accessor<ReadonlyArray<BeatShown>>) => (
          <Show
            when={shown().length > 0}
            fallback={
              <p class="ak-mat-status" role="status" data-failed="true">
                The Board of {props.block.film} no longer has these panels
              </p>
            }
          >
            <div class="ak-board">
              <For each={shown()}>
                {(beat) => (
                  <section class="ak-board-beat" data-beat={beat.beat}>
                    <p class="ak-board-id">{beat.beat}</p>
                    <div class="ak-board-panels">
                      <For each={beat.panels}>
                        {(p) => (
                          <figure class="ak-board-panel" data-panel={p.panel.id}>
                            <PanelFigure
                              panel={p.panel}
                              thumb={<AskPanelThumb film={props.block.film} panel={p.panel} />}
                              words={p.words}
                              notes={0}
                            />
                          </figure>
                        )}
                      </For>
                    </div>
                  </section>
                )}
              </For>
            </div>
          </Show>
        )}
      </Show>
    </Framed>
  );
};

/** A video the review serves, in the review's player, from `at`. */
export const VideoPart = (props: { readonly block: BlockOf<'video'> }) => {
  const { state } = useReview();
  const video = createMemo(() =>
    Option.flatMap(AsyncResult.value(state.index()), (index) => videoAt(index, props.block.ref)),
  );
  return (
    <Framed kind="video" css="" caption={Option.fromUndefinedOr(props.block.caption)}>
      <Show
        when={Option.getOrUndefined(video())}
        keyed
        fallback={
          <Missing
            read={state.index()}
            what={props.block.ref}
            gone={`${props.block.ref} is no longer in the review`}
          />
        }
      >
        {(v) => (
          <Show
            when={Option.getOrUndefined(videoSource(v, state.quality()))}
            fallback={<ProxyPending video={v} />}
          >
            {(src: Accessor<string>) => (
              <PlayedAlone
                src={src()}
                video={v}
                poster={reviewFrameUrl(v.ref, Option.none(), POSTER_W)}
                at={props.block.at}
                quiet
              />
            )}
          </Show>
        )}
      </Show>
    </Framed>
  );
};

/** A take of a film's beat, as the studio plays it: the attempt named, or the one kept, and what was heard. */
export const AudioPart = (props: { readonly block: BlockOf<'audio'> }) => {
  const { meta } = useReview();
  const attempts = meta.runtime
    .atom(ReviewApi.use((api) => api.attempts(props.block.film, props.block.beat)))
    .pipe(Atom.withServerValue(() => AsyncResult.initial()));
  const read = useAtomValue(() => attempts);
  const take = createMemo(() =>
    Option.flatMap(AsyncResult.value(read()), (a) =>
      Arr.findFirst(a.attempts, (t) =>
        Option.match(Option.fromUndefinedOr(props.block.attempt), {
          onNone: () => t.kept,
          onSome: (file) => t.file === file,
        }),
      ),
    ),
  );
  return (
    <Framed kind="audio" css={AUDIO_CSS} caption={Option.fromUndefinedOr(props.block.caption)}>
      <Show
        when={Option.getOrUndefined(take())}
        keyed
        fallback={
          <Missing read={read()} what="the take" gone={`No take of ${props.block.beat} to play`} />
        }
      >
        {(t) => (
          <>
            <audio
              class="ak-audio"
              controls
              preload="none"
              src={attemptUrl(props.block.film, props.block.beat, t.file)}
            />
            <p class="ak-heard">{t.transcript}</p>
          </>
        )}
      </Show>
    </Framed>
  );
};
