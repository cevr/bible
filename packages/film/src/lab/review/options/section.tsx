// A film's options page (`?film=<film>`): the film's newest render on the
// synced player with the sound heard over it, the score's options (each
// heard as the film's whole mix, one picked: `play` in `sound.ts`), each
// library sound's takes (heard alone, or in place in the film's mix; kept,
// unkept or rejected in the library's lock), and the film's undo, redo and
// check after every write.

import { For, Show } from '@solidjs/web';
import { onCleanup } from 'solid-js';
import { Duration, Effect, Fiber, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import {
  type EffectChoice,
  type EffectTake,
  type ScoreChoice,
  type ReviewVideo,
  type ScoreVariant,
  type TakeAct,
} from '../../../core/schema.ts';
import { scoreMixUrl, takeAudioUrl } from '../../../core/api.ts';
import { useReview } from '../context.tsx';
import { pressed, sizeText, videoUrl } from '../format.ts';
import { SyncEvent, timeText } from '../machine.ts';
import { Transport } from '../section.tsx';
import { ChoiceAct } from './api.ts';
import { FilmProvider, Heard, PICTURE, failedText, sameHeard, useFilm } from './context.tsx';

/** What a score option's badge says of it. */
const STATE_TEXT = {
  current: 'composed',
  stale: 'stale: composed before the acts changed',
  missing: 'not composed here',
} as const;

/** A picture's chip: where it lies (renders of one film share a name), and its size. */
const pictureLabel = (p: ReviewVideo): string => {
  const dir = p.ref.slice(0, Math.max(0, p.ref.length - p.name.length - 1));
  if (dir === '') return `${p.name} · ${sizeText(p.size)}`;
  return `${dir} · ${sizeText(p.size)}`;
};

/** The 🔊 that makes `heard` the sound over the picture. */
const HearButton = (props: { readonly heard: Heard; readonly disabled?: boolean }) => {
  const { heard, hear } = useFilm();
  const on = () => sameHeard(heard(), props.heard);
  return (
    <button
      type="button"
      class={['rv-sound', { on: on() }]}
      data-act="hear"
      title="Hear this over the picture"
      aria-pressed={pressed(on())}
      disabled={props.disabled}
      onClick={() => hear(props.heard)}
    >
      🔊
    </button>
  );
};

/** The render the sound plays over, on the clock, and the one `<audio>` heard with it. */
const Player = () => {
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

const ScoreCard = (props: { readonly score: ScoreChoice; readonly variant: ScoreVariant }) => {
  const { film, write, picture } = useFilm();
  const picked = () => props.variant.id === props.score.picked;
  const missing = props.variant.state === 'missing';
  return (
    <div class={['rv-card rv-option', { 'rv-audible': picked() }]} data-option={props.variant.id}>
      <div class="rv-cap">
        <span class="rv-name">{props.variant.id}</span>
        <Show when={picked()}>
          <span class="rv-badge">picked</span>
        </Show>
        <span class="rv-tag" data-state={props.variant.state}>
          {STATE_TEXT[props.variant.state]}
        </span>
        <HearButton heard={Heard.Score({ option: props.variant.id })} disabled={missing} />
      </div>
      <div class="rv-body">
        <div class="rv-meta">{props.variant.styles.join(' · ')}</div>
        <div class="rv-meta">
          {props.variant.movements.length} movement
          {Match.value(props.variant.movements.length === 1).pipe(
            Match.when(true, () => ''),
            Match.orElse(() => 's'),
          )}
        </div>
        <Show when={Option.isNone(picture()) && !missing}>
          <audio controls preload="none" src={scoreMixUrl(film, props.variant.id)} />
        </Show>
        <div class="rv-row">
          <button
            type="button"
            class="rv-chip"
            data-act="pick"
            aria-pressed={pressed(picked())}
            disabled={picked()}
            onClick={() => write(ChoiceAct.Pick({ option: props.variant.id }))}
          >
            {Match.value(picked()).pipe(
              Match.when(true, () => 'Played'),
              Match.orElse(() => 'Pick'),
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const ScoreSection = (props: { readonly score: ScoreChoice }) => (
  <>
    <h2 class="rv-h">
      Score{' '}
      <small>
        {props.score.variants.length} options · plays {props.score.picked}
      </small>
    </h2>
    <div class="rv-grid">
      <For each={props.score.variants}>
        {(variant) => <ScoreCard score={props.score} variant={variant} />}
      </For>
    </div>
  </>
);

/** What can become of a take: a kept one waits again; a candidate is kept or rejected. */
const actsFor = (take: EffectTake): ReadonlyArray<TakeAct> => {
  if (take.state === 'kept') return ['unkeep'];
  return ['keep', 'reject'];
};

const ACT_TITLES = { keep: 'Keep', unkeep: 'Unkeep', reject: 'Reject' } as const;

const TakeRow = (props: { readonly effect: EffectChoice; readonly take: EffectTake }) => {
  const { film, write } = useFilm();
  return (
    <div class="rv-take" data-take={props.take.id} data-state={props.take.state}>
      <div class="rv-row">
        <span class="rv-letter">{props.take.index}</span>
        <span class="rv-name">{props.take.state}</span>
        <span class="rv-tag">
          {props.take.secs.toFixed(1)} s · {props.take.loudest.toFixed(1)} LUFS ·{' '}
          {props.take.made.slice(0, 10)}
          {Match.value(props.take.current).pipe(
            Match.when(true, () => ''),
            Match.orElse(() => ' · for an older declaration'),
          )}
        </span>
      </div>
      <div class="rv-row">
        <audio
          controls
          preload="none"
          src={takeAudioUrl(film, props.effect.sound, props.take.id)}
        />
        <span class="rv-hint">in place</span>
        <HearButton heard={Heard.Take({ sound: props.effect.sound, take: props.take.id })} />
        <For each={actsFor(props.take)}>
          {(act) => (
            <button
              type="button"
              class="rv-chip"
              data-act={act}
              onClick={() =>
                write(ChoiceAct.Take({ sound: props.effect.sound, take: props.take.id, act }))
              }
            >
              {ACT_TITLES[act]}
            </button>
          )}
        </For>
      </div>
    </div>
  );
};

const EffectCard = (props: { readonly effect: EffectChoice }) => {
  const { send, picture } = useFilm();
  const jump = (t: number) => {
    send(SyncEvent.ScrubMoved({ t }));
    send(SyncEvent.ScrubReleased);
  };
  return (
    <div class="rv-card rv-option" data-sound={props.effect.sound}>
      <div class="rv-cap">
        <span class="rv-name">{props.effect.sound}</span>
        <span class="rv-tag">
          {props.effect.takes.filter((t) => t.state === 'kept').length} kept ·{' '}
          {props.effect.takes.filter((t) => t.state === 'candidate').length} waiting
        </span>
      </div>
      <div class="rv-body">
        <Show when={props.effect.placements.length > 0}>
          <div class="rv-row rv-pick">
            <span class="rv-hint">Plays at:</span>
            <For each={props.effect.placements}>
              {(p) => (
                <button
                  type="button"
                  class="rv-chip"
                  data-at={String(p.at)}
                  disabled={Option.isNone(picture())}
                  title={`${p.effect} in ${p.scene}`}
                  onClick={() => jump(p.at)}
                >
                  {timeText(p.at)} · {p.scene}
                </button>
              )}
            </For>
          </div>
        </Show>
        <For each={props.effect.takes}>
          {(take) => <TakeRow effect={props.effect} take={take} />}
        </For>
        <Show when={props.effect.takes.length === 0}>
          <p class="rv-hint">No takes yet: `film sfx` makes them.</p>
        </Show>
      </div>
    </div>
  );
};

/** Undo, redo, what the last write did, and the film's check after it. */
const WriteBar = () => {
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
      <details class="rv-check">
        <summary class="rv-hint" data-findings={String(findings().length)}>
          {Match.value(findings().length).pipe(
            Match.when(0, () => 'check: clean'),
            Match.when(1, () => 'check: 1 finding'),
            Match.orElse((n) => `check: ${n} findings`),
          )}
        </summary>
        <ul class="rv-findings">
          <For each={findings()}>
            {(f) => (
              <li data-level={f.level}>
                <b>{f.tag}</b> {f.message}
              </li>
            )}
          </For>
        </ul>
      </details>
    </section>
  );
};

const FilmBody = () => {
  const { choices } = useFilm();
  const scores = () => choices().choices.filter((c) => c._tag === 'ScoreChoice');
  const effects = () => choices().choices.filter((c) => c._tag === 'EffectChoice');
  return (
    <>
      <WriteBar />
      <Player />
      <For each={scores()}>{(score) => <ScoreSection score={score} />}</For>
      <Show when={effects().length > 0}>
        <h2 class="rv-h">
          Sounds <small>{effects().length}</small>
        </h2>
        <div class="rv-grid rv-wide">
          <For each={effects()}>{(effect) => <EffectCard effect={effect} />}</For>
        </div>
      </Show>
      <Show when={choices().choices.length === 0}>
        <p class="empty">This film has no score options or library sounds to choose between.</p>
      </Show>
    </>
  );
};

/** A film's options: its score's and its sounds', picked here and written to its source. */
export const FilmPage = (props: { readonly film: string }) => (
  <FilmProvider film={props.film}>
    <FilmBody />
  </FilmProvider>
);
