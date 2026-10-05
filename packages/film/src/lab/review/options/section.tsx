// A film's choices page (`/films/<film>/choices`): the film's newest render on the
// synced player with the sound heard over it, and every choice point the
// film has (`core/choice.ts`), a card each (`choice.tsx`), by kind: the
// score's options (`play` in `sound.ts`), its looks (`looks` in
// `palette.ts`), each library sound's takes (the library's lock), each
// beat's recorded voice, and each sound layer's level (a knob). Undo and
// Redo are the page's commands, each naming the source change it steps, and
// every write says what it did in a receipt; the film's check is the one the
// last write answered; after a pick or a knob the sound check runs (`film
// check --sound`: dead air, balance against the picked score); both checks
// are counts that open the Findings sheet (`findings.tsx`).

import { For, type JSX, Show } from '@solidjs/web';
import { type Accessor, createEffect, createMemo, onCleanup } from 'solid-js';
import { useAtomValue } from '@bible/atom-solid';
import * as UrlAtom from '@bible/url-state/atom';
import { Places } from '../../../core/api.ts';
import { Duration, Effect, Fiber, Option } from 'effect';
import { playableOf } from '../../../browser/media.ts';
import { type Command, type CommandId, boundChange, quietly } from '../../../command/command.ts';
import { Selection } from '../../../command/selection.ts';
import {
  type ChoiceKind,
  type ChoicePoint,
  ONLY_TEXT,
  type ShownOnly,
  shownIn,
} from '../../../core/choice.ts';
import type { ReviewVideo } from '../../../core/review.ts';
import type { ChangeId } from '../../../core/schema.ts';
import { Findings } from './findings.tsx';
import { stepWhyNot } from '../../api.ts';
import { useReview } from '../context.tsx';
import { pressed, sizeText, videoSource } from '../format.ts';
import { useInspectorPlace } from '../inspector.tsx';
import { ProxyPending, Transport } from '../section.tsx';
import { ChoiceAct } from './api.ts';
import { ChoiceCard, ChoiceSheets, HearButton, revealPoint } from './choice.tsx';
import { FilmProvider, PICTURE, Playing, useAct, useFilm } from './context.tsx';
import { REVIEW_REDO, REVIEW_UNDO } from './receipt.ts';

/** A picture's chip: where it lies (renders of one film share a name), and its size. */
const pictureLabel = (p: ReviewVideo): string => {
  const dir = p.ref.slice(0, Math.max(0, p.ref.length - p.name.length - 1));
  if (dir === '') return `${p.name} · ${sizeText(p.size)}`;
  return `${dir} · ${sizeText(p.size)}`;
};

/**
 * The film's player: its transport, docked as Project's is, over the render
 * the sound plays over, and the one `<audio>` heard with it (`FilmTransport`,
 * `FilmPicture`); while the film has no render, a line that says so.
 */
const Player = () => {
  const { picture } = useFilm();
  return (
    <Show
      when={Option.isSome(picture())}
      fallback={
        <p class="rv-hint rv-note">
          No render of this film under the review's roots yet: each option plays alone below.
        </p>
      }
    >
      <section class="sh-dock">
        <FilmTransport />
      </section>
      <FilmPicture />
    </Show>
  );
};

/**
 * The film's transport (play, the time, the scrub, the rate) on its player's
 * clock while the film has a render to play; `fallback` while it has none, so
 * no control stands that would play nothing.
 */
export const FilmTransport = (props: { readonly fallback?: JSX.Element }) => {
  const { picture, sync, send } = useFilm();
  return (
    <Show when={Option.isSome(picture())} fallback={props.fallback}>
      <Transport sync={sync} send={send} />
    </Show>
  );
};

/**
 * The render the sound plays over, on the clock, and the one `<audio>` heard
 * with it. Made once while the film has a picture: a write's answer (new
 * choices, the same picture) updates it in place, so a playing film plays on;
 * choosing another picture changes the one `<video>`'s source. None while
 * the film has no render.
 */
export const FilmPicture = () => {
  const { state } = useReview();
  const { choices, picture, choosePicture, mix, driver } = useFilm();
  const mixes = () => Option.toArray(mix());
  return (
    <Show when={Option.getOrUndefined(picture())}>
      {(video: Accessor<ReviewVideo>) => {
        // The same file answered again keeps its source, so nothing reloads.
        const src = createMemo(() => Option.getOrUndefined(videoSource(video(), state.quality())));
        return (
          <>
            <Show when={choices().pictures.length > 1}>
              <div class="rv-row rv-pick">
                <span class="rv-hint">Picture:</span>
                <For each={choices().pictures}>
                  {(p) => (
                    <button
                      type="button"
                      class="sh-btn"
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
 * and the last step has answered. A receipt's names the change it acts on:
 * stepped only when it is this film's and the one the stack would step
 * (`stepWhyNot`), else said why not, never another change.
 */
export const StepCommands = () => {
  const { meta } = useReview();
  const { film, steps } = useFilm();
  const stepping = useAct();
  const step = (which: 'undo' | 'redo') =>
    Option.flatMap(steps(), (s) => Option.fromUndefinedOr(s[which]));
  const command = (
    id: CommandId,
    which: 'undo' | 'redo',
    label: string,
    key: string,
    act: (change: Option.Option<ChangeId>) => ChoiceAct,
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
    fits: (bound) => stepWhyNot(which, film, steps())(bound),
    run: quietly((_, how) => {
      void stepping.write(act(Option.flatMap(Option.fromUndefinedOr(how.bound), boundChange)));
    }),
  });
  onCleanup(
    meta.hub.commands.register(
      command(REVIEW_UNDO, 'undo', 'Undo', 'mod+z', (change) => ChoiceAct.Undo({ change })),
      command(REVIEW_REDO, 'redo', 'Redo', 'mod+shift+z', (change) => ChoiceAct.Redo({ change })),
    ),
  );
  return <></>;
};

/** Each kind's heading, in the order the page shows them. */
const KINDS: ReadonlyArray<{ readonly kind: ChoiceKind; readonly title: string }> = [
  { kind: 'score', title: 'Score' },
  { kind: 'look', title: 'Looks' },
  { kind: 'take', title: 'Sounds' },
  { kind: 'voice', title: 'Voice' },
  { kind: 'level', title: 'Levels' },
];

/** A heading and a card for each of `points` (how many, the kinds strip says: UR-7). */
const ChoiceSection = (props: {
  readonly title: string;
  readonly points: ReadonlyArray<ChoicePoint>;
}) => (
  <Show when={props.points.length > 0}>
    <h2 class="rv-h">{props.title}</h2>
    <div class="rv-list">
      <For each={props.points} keyed={(p) => p.id}>
        {(point) => <ChoiceCard point={point()} />}
      </For>
    </div>
  </Show>
);

/**
 * While the page shows only the points in one state (`?only=`, AA-14), what
 * it shows and the way back to every point; nothing while it shows them all.
 */
export const OnlyShown = () => {
  const { only, showOnly } = useFilm();
  return (
    <Show when={Option.getOrUndefined(only())}>
      {(state: Accessor<ShownOnly>) => (
        <p class="rv-row rv-hint" data-only={state()}>
          Showing only the points {ONLY_TEXT[state()]}.
          <button
            type="button"
            class="sh-btn"
            data-act="show-every-point"
            onClick={() => showOnly(Option.none())}
          >
            Show every point
          </button>
        </p>
      )}
    </Show>
  );
};

/** The choices' place: the card in focus is its `?point=`. */
const choicesPlace = UrlAtom.place(Places.choices);

/** The variant `v`'s `?point=` and `?inspect=` name, when the film's choices hold it. */
const variantNamed = (
  film: string,
  points: ReadonlyArray<ChoicePoint>,
  v: { readonly point: string; readonly inspect: string },
): Option.Option<Selection> =>
  Option.map(
    Option.filter(Option.fromUndefinedOr(points.find((p) => p.id === v.point)), (p) =>
      p.variants.some((x) => x.id === v.inspect),
    ),
    (p) => Selection.cases.Variant.make({ film, point: p.id, variant: v.inspect }),
  );

/** A variant of `film`, as `?point=` and `?inspect=` name it. */
const variantKeys = (film: string, selection: Selection) =>
  Option.map(
    Option.filter(
      Option.liftPredicate(selection, Selection.guards.Variant),
      (s) => s.film === film,
    ),
    (s) => ({ point: s.point, inspect: s.variant }),
  );

const FilmBody = () => {
  const { film, choices, only, reading } = useFilm();
  // The open sheet is the URL's (`?inspect=`, a variant of the card in focus): a tap on a
  // variant's name names both in one step (Back closes it); Close, Escape and a swipe name
  // none, the card staying in focus; a link, Back and Forward open what they name.
  useInspectorPlace({
    place: Places.choices,
    named: (v) => variantNamed(film, choices().points, v.query),
    naming: (v, s) =>
      Option.map(variantKeys(film, s), (keys) => ({ ...v, query: { ...v.query, ...keys } })),
    cleared: (v) => ({ ...v, query: { ...v.query, inspect: '' } }),
  });
  // The card the URL's `?point=` names is brought into view, as on the project:
  // a link's first render (Open on Choices), and each Back or Forward to another.
  const at = useAtomValue(() => choicesPlace);
  createEffect(
    () =>
      Option.filter(
        Option.map(at(), (v) => v.query.point),
        (point) => point !== '',
      ),
    (point) => {
      Option.map(point, revealPoint);
    },
  );
  return (
    // The page's own box (`display: contents`): says while the film is read again.
    <div class="rv-choices" data-reading={pressed(reading())}>
      <StepCommands />
      <Findings />
      <Player />
      <OnlyShown />
      <For each={KINDS}>
        {(k) => (
          <ChoiceSection
            title={k.title}
            points={choices().points.filter((p) => p.kind === k.kind && shownIn(only())(p))}
          />
        )}
      </For>
      <Show when={choices().points.length === 0}>
        <p class="empty">This film has nothing to choose between.</p>
      </Show>
      {/* Every variant's sheet is the page's, whichever cards Show only leaves in. */}
      <ChoiceSheets points={choices().points} />
    </div>
  );
};

/** A film's choices: every choice point it has, picked here and written to its source. */
export const FilmPage = (props: { readonly film: string }) => (
  <FilmProvider film={props.film}>
    <FilmBody />
  </FilmProvider>
);
