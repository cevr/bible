// The material an ask's section shows, in place, each through the part its
// own view draws it with, over the same reads: a set's document as the set's
// page reads it (`Markdown`), a script in the Script reader (a film's or a
// series draft's, its staging takes played and its delivery marks written
// as on the Script and draft pages), the Board's panels as the Board shows
// them (`PanelThumb`, `PanelSaid`), a video in the review's player
// (`PlayedAlone`), a take as the studio plays it. Each part carries its own
// look (`PlaceStyle`), so it rides only on a page that shows it. Nothing
// here is a copy of a view: a fix to the view is a fix here.

import { useAtomValue } from '@bible/atom-solid';
import { For, type JSX, Show } from '@solidjs/web';
import { Array as Arr, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { type Accessor, createMemo, createSignal } from 'solid-js';
import type { AskBlock } from '../../core/ask.ts';
import { attemptUrl, boardFileUrl, reviewFrameUrl } from '../../core/api.ts';
import { type BoardFile, type Panel, shownTry } from '../../core/board.ts';
import { docAt, videoAt } from '../../core/review.ts';
import { PanelSaid, PanelThumb } from '../board/view.tsx';
import { PANEL_THUMB_CSS } from '../board/style.ts';
import { PlaceStyle } from '../place-style.tsx';
import { SCRIPT_READ_CSS } from '../script/style.ts';
import { reasonOf } from '../api.ts';
import { ReviewApi } from '../review/api.ts';
import { useReview } from '../review/context.tsx';
import { DraftReader } from '../review/draft.tsx';
import { FilmScriptReader } from '../review/film-script.tsx';
import { POSTER_W, videoSource } from '../review/format.ts';
import { PlayedAlone } from '../review/player.tsx';
import { READER_CSS, type Selecting, type WordsAt } from '../review/reader.tsx';
import { Markdown, ProxyPending } from '../review/section.tsx';

type BlockOf<K extends AskBlock['kind']> = Extract<AskBlock, { readonly kind: K }>;

/** The material's own look: a box on the section's surface, its caption under it. */
const MATERIAL_CSS = `
.ak-mat{display:grid;gap:var(--s-2);min-width:0;margin:0}
.ak-mat-cap{margin:0;color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2)}
.ak-mat-status{margin:0;color:var(--text-2)}
`;

/** The Board's panels in an ask: a beat's panels in a row under its id, at the film's aspect. */
const BOARD_MAT_CSS = `
.ak-board{display:grid;gap:var(--s-3)}
.ak-board-beat{display:grid;gap:var(--s-1)}
.ak-board-id{margin:0;color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2);font-weight:var(--w-2)}
.ak-board-panels{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(160px,100%),1fr));gap:var(--s-2)}
.ak-board-panel{display:grid;gap:var(--s-1);margin:0;min-width:0}
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

/** Why the material is not shown yet: read under way, or not found. */
const Missing = (props: { readonly text: string }) => (
  <p class="ak-mat-status" role="status">
    {props.text}
  </p>
);

/** A set's Markdown, as the set's page reads it. */
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
        fallback={<Missing text={`Reading ${props.block.ref}…`} />}
      >
        {(f) => <Markdown file={f} />}
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

/** A script in the Script reader: a film's, or a series draft's, every beat or those named. */
export const ScriptPart = (props: { readonly block: BlockOf<'script'> }) => {
  const selecting = useOwnSelecting();
  const only = Option.fromUndefinedOr(props.block.beats);
  return (
    <Framed
      kind="script"
      css={`
        ${SCRIPT_READ_CSS} ${READER_CSS}
      `}
      caption={Option.none()}
    >
      <Show
        when={props.block.film}
        fallback={
          <DraftReader
            series={Option.getOrElse(Option.fromUndefinedOr(props.block.series), () => '')}
            draft={Option.getOrElse(Option.fromUndefinedOr(props.block.draft), () => '')}
            only={only}
            selecting={selecting}
          />
        }
      >
        {(film: Accessor<string>) => (
          <FilmScriptReader film={film()} only={only} selecting={selecting} />
        )}
      </Show>
    </Framed>
  );
};

/** The panels `block` names of `board`, by beat in the board's order (every panel, when it names none). */
const panelsShown = (board: BoardFile, block: BlockOf<'board'>) => {
  const named = Option.fromUndefinedOr(block.panels);
  const panels = board.panels.filter((p) =>
    Option.match(named, { onNone: () => true, onSome: (ids) => ids.includes(p.id) }),
  );
  return Arr.dedupe(panels.map((p) => p.beat)).map((beat) => ({
    beat,
    panels: panels.filter((p) => p.beat === beat),
  }));
};

/** A film's Board: the panels named, each as the Board shows it, by beat. */
export const BoardPart = (props: { readonly block: BlockOf<'board'> }) => {
  const { meta } = useReview();
  const read = useAtomValue(() => meta.board(props.block.film));
  const src = (panel: Panel) =>
    Option.map(shownTry(panel), (t) => boardFileUrl(props.block.film, t.file));
  return (
    <Framed
      kind="board"
      css={`
        ${PANEL_THUMB_CSS} ${BOARD_MAT_CSS}
      `}
      caption={Option.none()}
    >
      <Show
        when={Option.getOrUndefined(AsyncResult.value(read()))}
        keyed
        fallback={<Missing text={`Reading the Board of ${props.block.film}…`} />}
      >
        {(board: BoardFile) => (
          <div class="ak-board">
            <For each={panelsShown(board, props.block)}>
              {(beat) => (
                <section class="ak-board-beat" data-beat={beat.beat}>
                  <p class="ak-board-id">{beat.beat}</p>
                  <div class="ak-board-panels">
                    <For each={beat.panels}>
                      {(panel) => (
                        <figure class="ak-board-panel" data-panel={panel.id}>
                          <PanelThumb panel={panel} src={src(panel)} />
                          <PanelSaid panel={panel} notes={0} />
                        </figure>
                      )}
                    </For>
                  </div>
                </section>
              )}
            </For>
          </div>
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
        fallback={<Missing text={`Reading ${props.block.ref}…`} />}
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
          <Missing
            text={AsyncResult.match(read(), {
              onInitial: () => 'Reading the take…',
              onFailure: (f) => `Could not read the take: ${reasonOf(f.cause)}`,
              onSuccess: () => `No take of ${props.block.beat} to play`,
            })}
          />
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
