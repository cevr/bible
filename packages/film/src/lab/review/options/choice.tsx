// One choice point as the review shows it (`core/choice.ts`), the same card
// for every kind and at every level of the film: its title and lines, its
// knob (a sound layer's level: a slider, and its value a field typed to the
// step, nudged by its arrows), and each variant with its state, what it is, how it is seen or
// heard (a render's video; a take alone, its own file; in place: 🔊 over the
// picture), the verbs its state allows (pick, unpick, reject), its approval
// (approve, unapprove) and what was said of it; at rest only what most
// visits use, the rest in the variant's inspector, its menu and its keys
// (`../inspector.tsx`, `../things.ts`); the instants a point plays at are
// jumps in its card's menu and on `.`/`,`, and ⌥←/→ audition its variants
// (`keys.ts`). A say goes where the card is
// told (`Sayer`): a choice's to the film's choices, a render's to its
// project. Each part reads its props as they change, so a card updates in
// place: a playing clip plays on and a half-typed comment stays.

import { For, type JSX, Show } from '@solidjs/web';
import { Option } from 'effect';
import { type Accessor, createEffect, createMemo, createSignal, untrack } from 'solid-js';
import { type Say, choiceAloneUrl, reviewFrameUrl } from '../../../core/api.ts';
import type { ApprovalState, SaidComment } from '../../../core/catalogue.ts';
import {
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
import type { Inspected } from '../../../core/field.ts';
import { ChoiceAct } from './api.ts';
import { Playing, samePlaying, useAct, useFilm } from './context.tsx';
import { Selection } from '../../../command/selection.ts';
import { Target } from '../../command/context-menu.tsx';
import {
  CommentCount,
  InspectName,
  Inspector,
  type InspectorBox,
  useThing,
} from '../inspector.tsx';
import type { ThingVerb, VerbId } from '../things.ts';
import { verbTitle } from './keys.ts';
import { Field } from '../../command/inspector.tsx';

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
  /** The inspector's handle on the box: its field's ref (focused when it opened at the box) and its draft. */
  readonly box?: InspectorBox;
}) => {
  // In an inspector the line holds its draft, which outlives the box; elsewhere its own text.
  const draft = Option.map(Option.fromUndefinedOr(untrack(() => props.box)), (b) => b.draft);
  const [own, setOwn] = createSignal('');
  const text = () => Option.match(draft, { onNone: own, onSome: (d) => d.get() });
  const setText = (next: string) =>
    Option.match(draft, { onNone: () => setOwn(next), onSome: (d) => d.set(next) });
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
        ref={(el: HTMLInputElement) => {
          Option.map(Option.fromUndefinedOr(props.box), (b) => b.input(el));
        }}
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
export const ApproveButton = (props: {
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

/** A variant's unapprove (it withdraws every approval of it), waiting while its own is in flight. */
const UnapproveButton = (props: { readonly variant: ChoiceVariant; readonly sayer: Sayer }) => {
  const withdrawing = props.sayer.use();
  return (
    <button
      type="button"
      class="rv-chip"
      data-act="unapprove"
      disabled={withdrawing.waiting()}
      onClick={() => withdrawing.say(props.variant, { _tag: 'Withdraw' })}
    >
      Unapprove
    </button>
  );
};

/** A variant's approve: only what is current is approved, as the version seen now. */
const Approve = (props: { readonly variant: ChoiceVariant; readonly sayer: Sayer }) => {
  const approving = props.sayer.use();
  return (
    <ApproveButton
      approval={props.variant.approval}
      disabled={props.variant.state !== 'current' || approving.waiting()}
      approve={() => approving.say(props.variant, { _tag: 'Approve' })}
    />
  );
};

/** A variant's approve and unapprove, as its inspector offers them. */
const Approval = (props: { readonly variant: ChoiceVariant; readonly sayer: Sayer }) => (
  <>
    <Approve variant={props.variant} sayer={props.sayer} />
    <Show when={props.variant.approval !== 'none'}>
      <UnapproveButton variant={props.variant} sayer={props.sayer} />
    </Show>
  </>
);

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
const CommentBox = (props: {
  readonly variant: ChoiceVariant;
  readonly sayer: Sayer;
  readonly box: InspectorBox;
}) => {
  const commenting = props.sayer.use();
  return (
    <SayBox
      disabled={commenting.waiting()}
      box={props.box}
      say={(text) => commenting.say(props.variant, { _tag: 'Comment', text })}
    />
  );
};

/** The verbs a variant's row moves out of sight: into its menu, its inspector and its keys. */
type RareVerb = Extract<ChoiceVerb, 'unpick' | 'reject'>;

const isRare = (verb: ChoiceVerb): verb is RareVerb => verb === 'unpick' || verb === 'reject';

/** A rare verb's id among the page's commands (`things.ts`). */
const VERB_ID = { unpick: 'unkeep', reject: 'reject' } as const satisfies Record<RareVerb, VerbId>;

/**
 * The verbs a variant allows now, as its commands run them: approve and
 * unapprove where it is said of, unkeep and reject where its state allows;
 * none while the row's own write is in flight.
 */
const variantVerbs = (
  point: ChoicePoint,
  variant: ChoiceVariant,
  saying: OwnSay,
  verbing: ReturnType<typeof useAct>,
): ReadonlyArray<ThingVerb> => {
  const said = Option.isSome(point.address) && !saying.waiting();
  const approve: ThingVerb = {
    id: 'approve',
    label: APPROVE_TITLE[variant.approval],
    run: () => saying.say(variant, { _tag: 'Approve' }),
  };
  const unapprove: ThingVerb = {
    id: 'unapprove',
    label: 'Unapprove',
    run: () => saying.say(variant, { _tag: 'Withdraw' }),
  };
  const rare = variant.verbs
    .filter(isRare)
    .filter(() => !verbing.waiting())
    .map((verb): ThingVerb => ({
      id: VERB_ID[verb],
      label: verbTitle(point.kind, verb),
      run: () => verbing.write(ChoiceAct.Verb({ point: point.id, variant: variant.id, verb })),
    }));
  return [
    ...[approve].filter(
      () => said && variant.state === 'current' && variant.approval !== 'approved',
    ),
    ...[unapprove].filter(() => said && variant.approval !== 'none'),
    ...rare,
  ];
};

/**
 * One variant: at rest its name (a tap inspects it), its state, its first
 * line, how it is seen or heard, its pick (picked: a filled check, not a
 * colour), its approve where it is the picked one (or a scene's render:
 * approving is that page's goal), and a dot counting what was said of it. The rest is in its inspector: every line,
 * unapprove, unkeep and reject, the comments and the comment box; and in
 * its context menu.
 */
const VariantRow = (props: {
  readonly point: ChoicePoint;
  readonly variant: ChoiceVariant;
  readonly sayer: Sayer;
  readonly more?: () => JSX.Element;
}) => {
  const said = () => Option.isSome(props.point.address);
  const { film } = useFilm();
  // A row is keyed by its variant: its selection is fixed for as long as it lives.
  const selection = untrack(() =>
    Selection.cases.Variant.make({ film, point: props.point.id, variant: props.variant.id }),
  );
  const title = () => `${props.variant.label} of ${props.point.title}`;
  const saying = props.sayer.use();
  const verbing = useAct();
  useThing({
    selection,
    title,
    commentable: said,
    verbs: () => variantVerbs(props.point, props.variant, saying, verbing),
  });
  const approveAtRest = () => said() && (props.variant.picked || props.point.kind === 'render');
  return (
    <Target
      of={selection}
      class="rv-take"
      data-variant={props.variant.id}
      data-state={props.variant.state}
      data-picked={pressed(props.variant.picked)}
    >
      <div class="rv-row">
        <InspectName of={selection}>
          <span class="rv-name">{props.variant.label}</span>
        </InspectName>
        <Show when={props.variant.picked}>
          <span class="rv-picked">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="7" />
              <path d="M4.8 8.3l2.1 2.1 4.3-4.6" />
            </svg>
            picked
          </span>
        </Show>
        <StateTags variant={props.variant} />
        <CommentCount of={selection} count={props.variant.comments.length} />
      </div>
      <Show when={props.variant.lines[0]}>
        {(line) => (
          <div class="rv-meta lab-clamp" title={props.variant.lines.join('\n')}>
            {line()}
          </div>
        )}
      </Show>
      <div class="rv-row">
        <Media point={props.point} variant={props.variant} />
        <For each={props.variant.verbs.filter((verb) => !isRare(verb))}>
          {(verb) => <VerbButton point={props.point} variant={props.variant} verb={verb} />}
        </For>
        <Show when={approveAtRest()}>
          <Approve variant={props.variant} sayer={props.sayer} />
        </Show>
      </div>
      <Inspector of={selection} title={title()}>
        {(box) => (
          <>
            <div class="rv-row">
              <StateTags variant={props.variant} />
            </div>
            <For each={props.variant.lines}>{(line) => <div class="rv-meta">{line}</div>}</For>
            <div class="rv-row">
              <Show when={said()}>
                <Approval variant={props.variant} sayer={props.sayer} />
              </Show>
              <For each={props.variant.verbs.filter(isRare)}>
                {(verb) => <VerbButton point={props.point} variant={props.variant} verb={verb} />}
              </For>
            </div>
            {Option.getOrUndefined(
              Option.map(Option.fromUndefinedOr(props.more), (more) => more()),
            )}
            <Comments comments={props.variant.comments} />
            <Show when={said()}>
              <CommentBox variant={props.variant} sayer={props.sayer} box={box} />
            </Show>
          </>
        )}
      </Inspector>
    </Target>
  );
};

/** A variant's state, and its approval when it has one. */
const StateTags = (props: { readonly variant: ChoiceVariant }) => (
  <>
    <span class="rv-tag" data-state={props.variant.state}>
      {stateText(props.variant.state, props.variant.staleBy)}
    </span>
    <Show when={props.variant.approval !== 'none'}>
      <span class="rv-badge" data-approval={props.variant.approval}>
        {APPROVAL_TEXT[props.variant.approval]}
      </span>
    </Show>
  </>
);

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
      <Field field={knobField(props.point, props.knob, value(), setting.waiting(), set)} />
      <span class="rv-tag">{props.knob.unit}</span>
      <Show when={Option.getOrUndefined(props.knob.fixed)}>
        {(why) => <span class="rv-hint">{why()}</span>}
      </Show>
    </div>
  );
};

/**
 * A knob's value as a field (UR-46): typed to any value its range holds
 * (arithmetic too, committed on Enter), its arrows stepping the knob's step,
 * Shift ten of them, Alt a tenth; refused while its value is computed or its
 * own write is in flight.
 */
const knobField = (
  point: ChoicePoint,
  knob: ChoiceKnob,
  value: number,
  waiting: boolean,
  write: (to: number) => void,
): Inspected => ({
  id: point.id,
  label: `${point.title} (${knob.unit})`,
  spec: {
    unit: knob.unit,
    step: knob.step,
    coarse: knob.step * 10,
    fine: knob.step / 10,
    min: Option.some(knob.min),
    max: Option.some(knob.max),
    readOnly: false,
    why: Option.none(),
  },
  value,
  refusal: Option.orElse(knob.fixed, () => Option.liftPredicate('writing…', () => waiting)),
  write,
});

/**
 * One choice point: its lines, its knob, its variants. A
 * choice's says go to the film's choices; a render's card is told where its
 * go (`sayer`). Why a stale variant is stale is its own (`staleBy`).
 */
export const ChoiceCard = (props: {
  readonly point: ChoicePoint;
  readonly sayer?: Sayer;
  /** More for its variants' inspectors (a scene's render: the choices that play in it). */
  readonly more?: () => JSX.Element;
}) => {
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
  const { film } = useFilm();
  return (
    <Target
      of={Selection.cases.Point.make({ film, point: props.point.id })}
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
        <Show when={Option.getOrUndefined(props.point.knob)}>
          {(knob) => <Knob point={props.point} knob={knob()} />}
        </Show>
        <For each={props.point.variants} keyed={(v) => v.id}>
          {(variant) => (
            <VariantRow point={props.point} variant={variant()} sayer={sayer} more={props.more} />
          )}
        </For>
        <Show when={props.point.variants.length === 0 && Option.isNone(props.point.knob)}>
          <p class="rv-hint">Nothing to choose between yet.</p>
        </Show>
      </div>
    </Target>
  );
};
