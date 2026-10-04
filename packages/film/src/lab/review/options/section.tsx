// A film's choices page (`/films/<film>/choices`): the film's newest render on the
// synced player with the sound heard over it, and every choice point the
// film has (`core/choice.ts`), a card each (`choice.tsx`), by kind: the
// score's options (`play` in `sound.ts`), its looks (`looks` in
// `palette.ts`), each library sound's takes (the library's lock), each
// beat's recorded voice, and each sound layer's level (a knob). Undo and
// Redo are the page's commands, each naming the source change it steps, and
// every write says what it did in a receipt; the film's check is the one the
// last write answered; after a pick or a knob the sound check runs (`film
// check --sound`: dead air, balance against the picked score) and its
// findings are shown.

import { For, Show } from '@solidjs/web';
import { type Accessor, createMemo, onCleanup } from 'solid-js';
import { Duration, Effect, Fiber, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { playableOf } from '../../../browser/media-browser.ts';
import { type Command, type CommandId, quiet } from '../../../command/command.ts';
import type { ChoiceKind, ChoicePoint } from '../../../core/choice.ts';
import type { ReviewVideo } from '../../../core/review.ts';
import type { CheckLine } from '../../../core/schema.ts';
import { useReview } from '../context.tsx';
import { pressed, sizeText, videoSource } from '../format.ts';
import { ProxyPending, Transport } from '../section.tsx';
import { ChoiceAct } from './api.ts';
import { ChoiceCard, HearButton } from './choice.tsx';
import { FilmProvider, PICTURE, Playing, useAct, useFilm } from './context.tsx';
import { REVIEW_REDO, REVIEW_UNDO, findingsText } from './receipt.ts';

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

/**
 * Undo and Redo of the film's source as the page's commands (UR-35): ⌘Z and
 * ⇧⌘Z, ⌘K, the page's context menu and a receipt's Undo, each naming the
 * change it would step, available while the film's stack has one that way
 * and the last step has answered.
 */
const StepCommands = () => {
  const { meta } = useReview();
  const { steps } = useFilm();
  const stepping = useAct();
  const step = (which: 'undo' | 'redo') =>
    Option.flatMap(steps(), (s) => Option.fromUndefinedOr(s[which]));
  const command = (
    id: CommandId,
    which: 'undo' | 'redo',
    label: string,
    key: string,
    act: ChoiceAct,
  ): Command => ({
    id,
    label,
    labelIn: () =>
      Option.match(step(which), { onNone: () => label, onSome: (s) => `${label} ${s.target}` }),
    group: 'Edit',
    keys: [key],
    about: ['Page'],
    touch: `the receipt's ${label}, or long-press the page`,
    when: () => Option.isSome(step(which)) && !stepping.waiting(),
    run: () =>
      Effect.sync(() => {
        void stepping.write(act);
        return quiet;
      }),
  });
  onCleanup(
    meta.hub.commands.register(
      command(REVIEW_UNDO, 'undo', 'Undo', 'mod+z', ChoiceAct.Undo()),
      command(REVIEW_REDO, 'redo', 'Redo', 'mod+shift+z', ChoiceAct.Redo()),
    ),
  );
  return <></>;
};

/** The film's check after the last write, and the sound check after it; Undo and Redo as commands. */
export const WriteBar = () => {
  const { findings, reading } = useFilm();
  return (
    <section class="rv-writes" data-reading={pressed(reading())}>
      <StepCommands />
      {/* The check folds away: its findings are read when asked for, not over the player. */}
      <Findings name="check" findings={Option.getOrElse(findings(), () => [])} />
      <SoundFindings />
    </section>
  );
};

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
  // While it runs, and why it could not, the receipt says (`soundReceipt`).
  return (
    <Show when={Option.getOrUndefined(AsyncResult.value(soundCheck()))}>
      {(check) => <Findings name="sound check" findings={check().findings} />}
    </Show>
  );
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
