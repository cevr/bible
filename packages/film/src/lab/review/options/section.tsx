// A film's choices page (`?film=<film>`): the film's newest render on the
// synced player with the sound heard over it, and every choice point the
// film has (`core/choice.ts`), a card each (`choice.tsx`), by kind: the
// score's options (`play` in `sound.ts`), its looks (`looks` in
// `palette.ts`), each library sound's takes (the library's lock), each
// beat's recorded voice, and each sound layer's level (a knob). Undo and
// redo name the source change they step, and the film's check is the one the
// last write answered; after a pick or a knob the sound check runs (`film check --sound`: dead air, balance against the picked
// score) and its findings are shown.

import { For, Show } from '@solidjs/web';
import { type Accessor, createMemo, onCleanup } from 'solid-js';
import { Duration, Effect, Fiber, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { playableOf } from '../../../browser/media-browser.ts';
import type { ChoiceKind, ChoicePoint } from '../../../core/choice.ts';
import type { ReviewVideo } from '../../../core/review.ts';
import type { CheckLine } from '../../../core/schema.ts';
import { useReview } from '../context.tsx';
import { pressed, sizeText, videoSource } from '../format.ts';
import { ProxyPending, Transport } from '../section.tsx';
import { failedText, statusText } from '../loaded.tsx';
import { ChoiceAct } from './api.ts';
import { ChoiceCard, HearButton } from './choice.tsx';
import { FilmProvider, PICTURE, Playing, useAct, useFilm } from './context.tsx';

/** A picture's chip: where it lies (renders of one film share a name), and its size. */
const pictureLabel = (p: ReviewVideo): string => {
  const dir = p.ref.slice(0, Math.max(0, p.ref.length - p.name.length - 1));
  if (dir === '') return `${p.name} · ${sizeText(p.size)}`;
  return `${dir} · ${sizeText(p.size)}`;
};

/**
 * The render the sound plays over, on the clock, and the one `<audio>` heard
 * with it. Made once while the film has a picture: a write's answer (new
 * choices, the same picture) updates it in place, so a playing film plays on;
 * choosing another picture changes the one `<video>`'s source.
 */
export const Player = () => {
  const { state } = useReview();
  const { choices, picture, choosePicture, mix, driver, sync, send } = useFilm();
  const mixes = () => Option.toArray(mix());
  return (
    <Show
      when={Option.getOrUndefined(picture())}
      fallback={
        <p class="rv-hint rv-note">
          No render of this film under the review's roots yet: each option plays alone below.
        </p>
      }
    >
      {(video: Accessor<ReviewVideo>) => {
        // The same file answered again keeps its source, so nothing reloads.
        const src = createMemo(() => Option.getOrUndefined(videoSource(video(), state.quality())));
        return (
          <>
            <Transport
              sync={sync}
              send={send}
              hint="space · ←/→ 2 s · 🔊 picks the sound heard over the picture"
            />
            <Show when={choices().pictures.length > 1}>
              <div class="rv-row rv-pick">
                <span class="rv-hint">Picture:</span>
                <For each={choices().pictures}>
                  {(p) => (
                    <button
                      type="button"
                      class="rv-chip"
                      data-picture={p.ref}
                      aria-pressed={pressed(p.ref === video().ref)}
                      onClick={() => choosePicture(p.ref)}
                    >
                      {pictureLabel(p)}
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <div class="rv-card rv-picture" data-id={PICTURE}>
              <Show when={src()} fallback={<ProxyPending video={video()} />}>
                {(source) => {
                  // The clock holds only a video on the page: it lets go when the placeholder returns.
                  onCleanup(() => driver.detach(PICTURE));
                  return (
                    <video
                      preload="auto"
                      playsinline
                      muted
                      src={source()}
                      ref={(el: HTMLVideoElement) => driver.attach(PICTURE, playableOf(el))}
                    />
                  );
                }}
              </Show>
              <div class="rv-cap">
                <span class="rv-name">{video().name}</span>
                <span class="rv-tag">{video().ref}</span>
                <HearButton playing={Playing.Own()} />
              </div>
            </div>
            <For each={mixes()}>{(mixSrc) => <Mix src={mixSrc} />}</For>
          </>
        );
      }}
    </Show>
  );
};

/** How long a mix that failed to load waits before it is asked for again, and how often. */
const MIX_RETRY_MS = 5000;
const MIX_TRIES = 6;

/**
 * The mix heard: an `<audio>` on the player's clock, gone when another is
 * chosen. A film's first mix renders the whole film, so a load that fails
 * (the connection dropped while it rendered) asks again: the server's mix
 * ran on, and is found made.
 */
const Mix = (props: { readonly src: string }) => {
  const { driver } = useFilm();
  const src = props.src;
  let tries = 0;
  let waiting = Option.none<Fiber.Fiber<void>>();
  onCleanup(() => {
    Option.map(waiting, (f) => Effect.runFork(Fiber.interrupt(f)));
    driver.detach(src);
  });
  const attach = (el: HTMLAudioElement) => {
    el.addEventListener('error', () => {
      if (tries >= MIX_TRIES) return;
      tries += 1;
      waiting = Option.some(
        Effect.runFork(
          Effect.sleep(Duration.millis(MIX_RETRY_MS)).pipe(
            Effect.andThen(Effect.sync(() => el.load())),
          ),
        ),
      );
    });
    driver.attach(src, playableOf(el));
  };
  return <audio class="rv-mix" preload="auto" src={src} ref={attach} />;
};

const STEP_WORD = { undo: 'Undo', redo: 'Redo' } as const;

/** An undo's or a redo's button: it names what it would do, and is disabled when there is nothing to. */
const StepButton = (props: { readonly which: 'undo' | 'redo'; readonly act: ChoiceAct }) => {
  const { steps } = useFilm();
  const stepping = useAct();
  const step = () => Option.flatMap(steps(), (s) => Option.fromUndefinedOr(s[props.which]));
  const word = () => STEP_WORD[props.which];
  return (
    <button
      type="button"
      class="rv-chip"
      data-act={props.which}
      disabled={Option.isNone(step()) || stepping.waiting()}
      title={Option.getOrElse(
        Option.map(step(), (s) => `${props.which} ${s.target} in ${s.file}`),
        () => `nothing to ${props.which}`,
      )}
      onClick={() => stepping.write(props.act)}
    >
      {Option.match(step(), { onNone: word, onSome: (s) => `${word()} ${s.target}` })}
    </button>
  );
};

/** Undo and redo, each naming the source change it steps; what the last write did; the film's check after it. */
export const WriteBar = () => {
  const { findings, wrote, reading } = useFilm();
  return (
    <section class="rv-writes" data-reading={pressed(reading())}>
      <div class="rv-row">
        <StepButton which="undo" act={ChoiceAct.Undo()} />
        <StepButton which="redo" act={ChoiceAct.Redo()} />
        <span class="rv-hint rv-status" data-failed={pressed(AsyncResult.isFailure(wrote()))}>
          {statusText(wrote(), 'writing…', (w) => `wrote ${w.target} · ${w.file}`)}
        </span>
      </div>
      {/* The check folds away: its findings are read when asked for, not over the player. */}
      <Findings name="check" findings={Option.getOrElse(findings(), () => [])} />
      <SoundFindings />
    </section>
  );
};

/** `n` findings as a summary says them. */
const findingsText = (name: string, n: number) =>
  Match.value(n).pipe(
    Match.when(0, () => `${name}: clean`),
    Match.when(1, () => `${name}: 1 finding`),
    Match.orElse((count) => `${name}: ${count} findings`),
  );

/** A check's findings, folded away under their count. */
const Findings = (props: {
  readonly name: string;
  readonly findings: ReadonlyArray<CheckLine>;
}) => (
  <details class="rv-check" data-check={props.name}>
    <summary class="rv-hint" data-findings={String(props.findings.length)}>
      {findingsText(props.name, props.findings.length)}
    </summary>
    <ul class="rv-findings">
      <For each={props.findings}>
        {(f) => (
          <li data-level={f.level}>
            <b>{f.tag}</b> {f.message}
          </li>
        )}
      </For>
    </ul>
  </details>
);

/** The sound check after the last pick or knob: running, its findings, or why it could not run. */
const SoundFindings = () => {
  const { soundCheck } = useFilm();
  // Read again as the check runs and answers.
  const shown = () =>
    Match.value(soundCheck()).pipe(
      Match.when(
        (r) => r.waiting,
        () => (
          <p class="rv-hint" data-check="sound" aria-busy="true">
            sound check: hearing the mix…
          </p>
        ),
      ),
      Match.orElse((r) =>
        AsyncResult.match(r, {
          onInitial: () => <></>,
          onSuccess: (s) => <Findings name="sound check" findings={s.value.findings} />,
          onFailure: () => (
            <p class="rv-hint" data-check="sound" data-failed="true">
              sound check: {failedText(r)}
            </p>
          ),
        }),
      ),
    );
  return <>{shown()}</>;
};

/** Each kind's heading, in the order the page shows them. */
const KINDS: ReadonlyArray<{ readonly kind: ChoiceKind; readonly title: string }> = [
  { kind: 'score', title: 'Score' },
  { kind: 'look', title: 'Looks' },
  { kind: 'take', title: 'Sounds' },
  { kind: 'voice', title: 'Voice' },
  { kind: 'level', title: 'Levels' },
];

/** A heading and a card for each of `points`. */
const ChoiceSection = (props: {
  readonly title: string;
  readonly points: ReadonlyArray<ChoicePoint>;
}) => (
  <Show when={props.points.length > 0}>
    <h2 class="rv-h">
      {props.title} <small>{props.points.length}</small>
    </h2>
    <div class="rv-grid rv-wide">
      <For each={props.points} keyed={(p) => p.id}>
        {(point) => <ChoiceCard point={point()} />}
      </For>
    </div>
  </Show>
);

const FilmBody = () => {
  const { choices } = useFilm();
  return (
    <>
      <WriteBar />
      <Player />
      <For each={KINDS}>
        {(k) => (
          <ChoiceSection
            title={k.title}
            points={choices().points.filter((p) => p.kind === k.kind)}
          />
        )}
      </For>
      <Show when={choices().points.length === 0}>
        <p class="empty">This film has nothing to choose between.</p>
      </Show>
    </>
  );
};

/** A film's choices: every choice point it has, picked here and written to its source. */
export const FilmPage = (props: { readonly film: string }) => (
  <FilmProvider film={props.film}>
    <FilmBody />
  </FilmProvider>
);
