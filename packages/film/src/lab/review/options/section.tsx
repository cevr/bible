// A film's choices page (`?film=<film>`): the film's newest render on the
// synced player with the sound heard over it, and every choice point the
// film has (`core/choice.ts`), a card each (`choice.tsx`), by kind: the
// score's options (`play` in `sound.ts`), its looks (`looks` in
// `palette.ts`), each library sound's takes (the library's lock), each
// beat's recorded voice, and each sound layer's level (a knob). Undo, redo
// and the film's check follow every write; after a pick or a knob the sound
// check runs (`film check --sound`: dead air, balance against the picked
// score) and its findings are shown.

import { For, Show } from '@solidjs/web';
import { onCleanup } from 'solid-js';
import { Duration, Effect, Fiber, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type { ChoiceKind, ChoicePoint } from '../../../core/choice.ts';
import type { ReviewVideo } from '../../../core/review.ts';
import type { CheckLine } from '../../../core/schema.ts';
import { useReview } from '../context.tsx';
import { pressed, sizeText, videoUrl } from '../format.ts';
import { Transport } from '../section.tsx';
import { ChoiceAct } from './api.ts';
import { ChoiceCard, HearButton } from './choice.tsx';
import { FilmProvider, Heard, PICTURE, failedText, useFilm } from './context.tsx';

/** A picture's chip: where it lies (renders of one film share a name), and its size. */
const pictureLabel = (p: ReviewVideo): string => {
  const dir = p.ref.slice(0, Math.max(0, p.ref.length - p.name.length - 1));
  if (dir === '') return `${p.name} · ${sizeText(p.size)}`;
  return `${dir} · ${sizeText(p.size)}`;
};

/** The render the sound plays over, on the clock, and the one `<audio>` heard with it. */
export const Player = () => {
  const { state } = useReview();
  const { choices, picture, choosePicture, mix, driver, sync, send } = useFilm();
  const mixes = () => Option.toArray(mix());
  return (
    <Show
      when={Option.getOrUndefined(picture())}
      keyed
      fallback={
        <p class="rv-hint rv-note">
          No render of this film under the review's roots yet: each option plays alone below.
        </p>
      }
    >
      {(video) => (
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
                    aria-pressed={pressed(p.ref === video.ref)}
                    onClick={() => choosePicture(p.ref)}
                  >
                    {pictureLabel(p)}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <div class="rv-card rv-picture" data-id={PICTURE}>
            <video
              preload="auto"
              playsinline
              muted
              src={videoUrl(video, state.quality())}
              ref={(el: HTMLVideoElement) => driver.attach(PICTURE, el)}
            />
            <div class="rv-cap">
              <span class="rv-name">{video.name}</span>
              <span class="rv-tag">{video.ref}</span>
              <HearButton heard={Heard.Own()} />
            </div>
          </div>
          <For each={mixes()}>{(src) => <Mix src={src} />}</For>
        </>
      )}
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
    driver.attach(src, el);
  };
  return <audio class="rv-mix" preload="auto" src={src} ref={attach} />;
};

/** Undo, redo, what the last write did, and the film's check after it. */
export const WriteBar = () => {
  const { check, wrote, write } = useFilm();
  const report = () => AsyncResult.value(check());
  const step = (which: 'undo' | 'redo') =>
    Option.flatMap(report(), (r) => Option.fromUndefinedOr(r[which]));
  const findings = () =>
    Option.getOrElse(
      Option.map(report(), (r) => r.findings),
      () => [],
    );
  const status = () =>
    Match.value(wrote()).pipe(
      Match.when(
        (r) => r.waiting,
        () => 'writing…',
      ),
      Match.orElse((r) =>
        AsyncResult.match(r, {
          onInitial: () => '',
          onSuccess: (s) => `wrote ${s.value.target} · ${s.value.file}`,
          onFailure: () => failedText(r),
        }),
      ),
    );
  return (
    <section class="rv-writes">
      <div class="rv-row">
        <button
          type="button"
          class="rv-chip"
          data-act="undo"
          disabled={Option.isNone(step('undo'))}
          title={Option.getOrElse(
            Option.map(step('undo'), (s) => `undo ${s.target} in ${s.file}`),
            () => 'nothing to undo',
          )}
          onClick={() => write(ChoiceAct.Undo())}
        >
          Undo
        </button>
        <button
          type="button"
          class="rv-chip"
          data-act="redo"
          disabled={Option.isNone(step('redo'))}
          title={Option.getOrElse(
            Option.map(step('redo'), (s) => `redo ${s.target} in ${s.file}`),
            () => 'nothing to redo',
          )}
          onClick={() => write(ChoiceAct.Redo())}
        >
          Redo
        </button>
        <span class="rv-hint rv-status" data-failed={pressed(AsyncResult.isFailure(wrote()))}>
          {status()}
        </span>
      </div>
      {/* The check folds away: its findings are read when asked for, not over the player. */}
      <Findings name="check" findings={findings()} />
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
export const ChoiceSection = (props: {
  readonly title: string;
  readonly points: ReadonlyArray<ChoicePoint>;
}) => (
  <Show when={props.points.length > 0}>
    <h2 class="rv-h">
      {props.title} <small>{props.points.length}</small>
    </h2>
    <div class="rv-grid rv-wide">
      <For each={props.points}>{(point) => <ChoiceCard point={point} />}</For>
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
