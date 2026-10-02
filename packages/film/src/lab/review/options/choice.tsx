// One choice point as the review shows it (`core/choice.ts`), the same card
// for every kind and at every level of the film: its title and lines, the
// instants it plays at (a jump on the clock), its knob (a sound layer's
// level), and each variant with its state, what it is, how it is seen or
// heard (a render's video; a take alone, its own file; in place: 🔊 over the
// picture), the verbs its state allows (pick, unpick, reject), its approval
// (approve, withdraw) and what was said of it. A say goes where the card is
// told (`Sayer`): a choice's to the film's choices, a render's to its
// project. Each part reads its props as they change, so a card updates in
// place: a playing clip plays on and a half-typed comment stays.

import { For, Show } from '@solidjs/web';
import { Option } from 'effect';
import { type Accessor, createEffect, createMemo, createSignal } from 'solid-js';
import { type Say, choiceAloneUrl, reviewFrameUrl } from '../../../core/api.ts';
import type { ApprovalState, SaidComment } from '../../../core/catalogue.ts';
import {
  type ChoiceKind,
  type ChoiceKnob,
  type ChoicePoint,
  type ChoiceVariant,
  type ChoiceVerb,
  VariantMedia,
} from '../../../core/choice.ts';
import type { ReviewVideo } from '../../../core/review.ts';
import { useReview } from '../context.tsx';
import { APPROVAL_TEXT, POSTER_W, pressed, stateText, videoSource } from '../format.ts';
import { ProxyPending } from '../section.tsx';
import { SyncEvent, timeText } from '../machine.ts';
import { ChoiceAct } from './api.ts';
import { Playing, samePlaying, useAct, useFilm } from './context.tsx';

/** A verb's button, as a kind names it: a take is kept, anything else picked. */
const verbTitle = (kind: ChoiceKind, verb: ChoiceVerb): string => {
  if (verb === 'unpick') return 'Unkeep';
  if (verb === 'reject') return 'Reject';
  if (kind === 'take') return 'Keep';
  if (kind === 'voice') return 'Keep as the take';
  return 'Pick';
};

/** The approve button's words for an approval. */
const APPROVE_TITLE = {
  none: 'Approve',
  approved: 'Approved',
  stale: 'Approve again',
} as const satisfies Record<ApprovalState, string>;

/** One control's say: whether its own is in flight, and the say, answering whether it was said. */
interface OwnSay {
  readonly waiting: Accessor<boolean>;
  readonly say: (variant: ChoiceVariant, say: Say) => Promise<boolean>;
}

/**
 * Where a card's says go: a choice's to the film's choices (the default), a
 * render's to its project. `use` makes a control's own say (`useWrite`),
 * once, as the control is made.
 */
export interface Sayer {
  readonly use: () => OwnSay;
}

/** The 🔊 that makes `playing` the sound over the picture. */
export const HearButton = (props: { readonly playing: Playing; readonly disabled?: boolean }) => {
  const { playing, hear } = useFilm();
  const on = () => samePlaying(playing(), props.playing);
  return (
    <button
      type="button"
      class={['rv-sound', { on: on() }]}
      data-act="hear"
      title="Hear this over the picture"
      aria-pressed={pressed(on())}
      disabled={props.disabled}
      onClick={() => hear(props.playing)}
    >
      🔊
    </button>
  );
};

/** What was said, each marked when it was said of an earlier version. */
export const Comments = (props: { readonly comments: ReadonlyArray<SaidComment> }) => (
  <Show when={props.comments.length > 0}>
    <ul class="rv-comments">
      <For each={props.comments} keyed={(c) => c.id}>
        {(c) => (
          <li data-comment={c().id} data-earlier={pressed(!c().onThis)}>
            <Show when={!c().onThis}>
              <span class="rv-hint">(earlier) </span>
            </Show>
            {c().text}
          </li>
        )}
      </For>
    </ul>
  </Show>
);

/**
 * A line to say something, and its button; `say` gets the text and answers
 * whether it was said. While a say is in flight the button waits; the line
 * empties once the say is said (unless it was typed on since), and a say
 * that fails leaves the text for another try.
 */
export const SayBox = (props: {
  readonly say: (text: string) => Promise<boolean>;
  readonly disabled?: boolean;
}) => {
  const [text, setText] = createSignal('');
  const send = () => {
    const said = text().trim();
    if (said === '' || props.disabled === true) return;
    void props.say(said).then((ok) => {
      if (ok && text().trim() === said) setText('');
    });
  };
  return (
    <form
      class="rv-row rv-say"
      onSubmit={(e: SubmitEvent) => {
        e.preventDefault();
        send();
      }}
    >
      <input
        class="rv-comment-input"
        placeholder="Add a comment"
        value={text()}
        onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
          setText(e.currentTarget.value)
        }
      />
      <button
        type="submit"
        class="rv-chip"
        data-act="comment"
        disabled={text().trim() === '' || props.disabled === true}
      >
        Comment
      </button>
    </form>
  );
};

/** An approve button: approved as it is now, or again once it has changed. */
const ApproveButton = (props: {
  readonly approval: ApprovalState;
  readonly approve: () => void;
  readonly disabled?: boolean;
}) => (
  <button
    type="button"
    class="rv-chip"
    data-act="approve"
    data-approval={props.approval}
    aria-pressed={pressed(props.approval === 'approved')}
    disabled={props.disabled === true || props.approval === 'approved'}
    onClick={() => props.approve()}
  >
    {APPROVE_TITLE[props.approval]}
  </button>
);

/**
 * A render's video, kept in place while its file stays the same, showing a
 * still of itself until it plays; while its proxy is being made, says so.
 */
const Seen = (props: { readonly video: ReviewVideo }) => {
  const { state } = useReview();
  const src = createMemo(() => Option.getOrUndefined(videoSource(props.video, state.quality())));
  const poster = createMemo(() => reviewFrameUrl(props.video.ref, Option.none(), POSTER_W));
  return (
    <Show when={src()} fallback={<ProxyPending video={props.video} />}>
      {(source) => <video controls preload="none" playsinline poster={poster()} src={source()} />}
    </Show>
  );
};

/** What a variant plays: its video, or its sound alone and in place. */
const Media = (props: { readonly point: ChoicePoint; readonly variant: ChoiceVariant }) => {
  const { film } = useFilm();
  const seen = () =>
    VariantMedia.match(props.variant.media, {
      Seen: ({ video }) => Option.some(video),
      Heard: () => Option.none(),
      Unseen: () => Option.none(),
    });
  const heard = () =>
    VariantMedia.match(props.variant.media, {
      Heard: (h) => Option.some(h),
      Seen: () => Option.none(),
      Unseen: () => Option.none(),
    });
  const missing = () => props.variant.state === 'missing';
  return (
    <>
      <Show when={Option.getOrUndefined(seen())}>{(video) => <Seen video={video()} />}</Show>
      <Show when={Option.exists(heard(), (h) => h.alone) && !missing()}>
        <audio
          controls
          preload="none"
          src={choiceAloneUrl(film, props.point.id, props.variant.id)}
        />
      </Show>
      <Show when={Option.exists(heard(), (h) => h.inPlace)}>
        <span class="rv-hint">in place</span>
        <HearButton
          playing={Playing.InPlace({ point: props.point.id, variant: props.variant.id })}
          disabled={missing()}
        />
      </Show>
    </>
  );
};

/** A variant's withdraw, waiting while its own is in flight. */
const WithdrawButton = (props: { readonly variant: ChoiceVariant; readonly sayer: Sayer }) => {
  const withdrawing = props.sayer.use();
  return (
    <button
      type="button"
      class="rv-chip"
      data-act="withdraw"
      disabled={withdrawing.waiting()}
      onClick={() => withdrawing.say(props.variant, { _tag: 'Withdraw' })}
    >
      Withdraw
    </button>
  );
};

/** A variant's approve and withdraw: only what is current is approved, as the version seen now. */
const Approval = (props: { readonly variant: ChoiceVariant; readonly sayer: Sayer }) => {
  const approving = props.sayer.use();
  return (
    <>
      <ApproveButton
        approval={props.variant.approval}
        disabled={props.variant.state !== 'current' || approving.waiting()}
        approve={() => approving.say(props.variant, { _tag: 'Approve' })}
      />
      <Show when={props.variant.approval !== 'none'}>
        <WithdrawButton variant={props.variant} sayer={props.sayer} />
      </Show>
    </>
  );
};

/** A verb's button on a variant, waiting while its own write is in flight. */
const VerbButton = (props: {
  readonly point: ChoicePoint;
  readonly variant: ChoiceVariant;
  readonly verb: ChoiceVerb;
}) => {
  const verbing = useAct();
  return (
    <button
      type="button"
      class="rv-chip"
      data-act={props.verb}
      disabled={verbing.waiting()}
      onClick={() =>
        verbing.write(
          ChoiceAct.Verb({ point: props.point.id, variant: props.variant.id, verb: props.verb }),
        )
      }
    >
      {verbTitle(props.point.kind, props.verb)}
    </button>
  );
};

/** A variant's comment box, waiting while its own say is in flight. */
const CommentBox = (props: { readonly variant: ChoiceVariant; readonly sayer: Sayer }) => {
  const commenting = props.sayer.use();
  return (
    <SayBox
      disabled={commenting.waiting()}
      say={(text) => commenting.say(props.variant, { _tag: 'Comment', text })}
    />
  );
};

const VariantRow = (props: {
  readonly point: ChoicePoint;
  readonly variant: ChoiceVariant;
  readonly sayer: Sayer;
}) => {
  const said = () => Option.isSome(props.point.address);
  return (
    <div
      class={['rv-take', { 'rv-audible': props.variant.picked }]}
      data-variant={props.variant.id}
      data-state={props.variant.state}
      data-picked={pressed(props.variant.picked)}
    >
      <div class="rv-row">
        <span class="rv-name">{props.variant.label}</span>
        <Show when={props.variant.picked}>
          <span class="rv-badge">picked</span>
        </Show>
        <span class="rv-tag" data-state={props.variant.state}>
          {stateText(props.variant.state, props.variant.staleBy)}
        </span>
        <Show when={props.variant.approval !== 'none'}>
          <span class="rv-badge" data-approval={props.variant.approval}>
            {APPROVAL_TEXT[props.variant.approval]}
          </span>
        </Show>
      </div>
      <For each={props.variant.lines}>{(line) => <div class="rv-meta">{line}</div>}</For>
      <div class="rv-row">
        <Media point={props.point} variant={props.variant} />
        <For each={props.variant.verbs}>
          {(verb) => <VerbButton point={props.point} variant={props.variant} verb={verb} />}
        </For>
        <Show when={said()}>
          <Approval variant={props.variant} sayer={props.sayer} />
        </Show>
      </div>
      <Comments comments={props.variant.comments} />
      <Show when={said()}>
        <CommentBox variant={props.variant} sayer={props.sayer} />
      </Show>
    </div>
  );
};

/**
 * A level's knob: set on release, written into `sound.ts`; a computed level
 * only shown. It shows the value being dragged, else the film's; a write
 * that fails shows the film's value again (the failure is on the status line).
 */
const Knob = (props: { readonly point: ChoicePoint; readonly knob: ChoiceKnob }) => {
  const setting = useAct();
  const [dragged, setDragged] = createSignal(Option.none<number>());
  // The film's value moved (a write answered it): what was dragged is written.
  createEffect(
    () => props.knob.value,
    () => {
      setDragged(Option.none());
    },
  );
  const value = () => Option.getOrElse(dragged(), () => props.knob.value);
  const set = (to: number) =>
    void setting.write(ChoiceAct.Knob({ point: props.point.id, value: to })).then((ok) => {
      if (!ok) setDragged(Option.none());
    });
  return (
    <div class="rv-row rv-knob" data-knob={props.point.id}>
      <input
        type="range"
        min={props.knob.min}
        max={props.knob.max}
        step={props.knob.step}
        value={value()}
        disabled={Option.isSome(props.knob.fixed) || setting.waiting()}
        title={Option.getOrElse(props.knob.fixed, () => '')}
        onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
          setDragged(Option.some(Number(e.currentTarget.value)))
        }
        onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
          set(Number(e.currentTarget.value))
        }
      />
      <output class="rv-tag">
        {value()} {props.knob.unit}
      </output>
      <Show when={Option.getOrUndefined(props.knob.fixed)}>
        {(why) => <span class="rv-hint">{why()}</span>}
      </Show>
    </div>
  );
};

/** The instants a point plays at, each a jump on the clock. */
const Marks = (props: { readonly point: ChoicePoint }) => {
  const { send, picture } = useFilm();
  const jump = (t: number) => {
    send(SyncEvent.ScrubMoved({ t }));
    send(SyncEvent.ScrubReleased);
  };
  return (
    <Show when={props.point.marks.length > 0}>
      <div class="rv-row rv-pick">
        <span class="rv-hint">Plays at:</span>
        <For each={props.point.marks}>
          {(m) => (
            <button
              type="button"
              class="rv-chip"
              data-at={String(m.t)}
              disabled={Option.isNone(picture())}
              onClick={() => jump(m.t)}
            >
              {timeText(m.t)} · {m.label}
            </button>
          )}
        </For>
      </div>
    </Show>
  );
};

/**
 * One choice point: its lines, where it plays, its knob, its variants. A
 * choice's says go to the film's choices; a render's card is told where its
 * go (`sayer`). Why a stale variant is stale is its own (`staleBy`).
 */
export const ChoiceCard = (props: { readonly point: ChoicePoint; readonly sayer?: Sayer }) => {
  /** A choice's says go to the film's choices. */
  const ofChoices: Sayer = {
    use: () => {
      const saying = useAct();
      return {
        waiting: saying.waiting,
        say: (variant, say) =>
          saying.write(ChoiceAct.Say({ point: props.point.id, variant: variant.id, say })),
      };
    },
  };
  const sayer: Sayer = { use: () => (props.sayer ?? ofChoices).use() };
  return (
    <div
      class="rv-card rv-option"
      id={`point-${props.point.id}`}
      data-point={props.point.id}
      data-kind={props.point.kind}
    >
      <div class="rv-cap">
        <span class="rv-name">{props.point.title}</span>
        <span class="rv-tag">{props.point.lines.join(' · ')}</span>
      </div>
      <div class="rv-body">
        <Marks point={props.point} />
        <Show when={Option.getOrUndefined(props.point.knob)}>
          {(knob) => <Knob point={props.point} knob={knob()} />}
        </Show>
        <For each={props.point.variants} keyed={(v) => v.id}>
          {(variant) => <VariantRow point={props.point} variant={variant()} sayer={sayer} />}
        </For>
        <Show when={props.point.variants.length === 0 && Option.isNone(props.point.knob)}>
          <p class="rv-hint">Nothing to choose between yet.</p>
        </Show>
      </div>
    </div>
  );
};
