// One choice point as the review shows it (`core/choice.ts`), the same card
// for every kind and at every level of the film: its title and lines, its
// knob (a sound layer's level: a slider, and its value a field typed to the
// step, nudged by its arrows), and each variant with its state when it is not
// current (in full in its sheet), what it is, how it is seen or
// heard (a render's video; a take alone, its own file; in place: a speaker over the
// picture), the verbs its state allows (pick, unpick, reject), its approval
// (approve, unapprove) and what was said of it; at rest only what most
// visits use, the rest in the variant's inspector, its menu and its keys
// (`../inspector.tsx`, `../things.ts`); the instants a point plays at are
// jumps in its card's menu and on `.`/`,`, and ⌥←/→ audition its variants
// (`keys.ts`). A say goes where the card is
// told (`Sayer`): a choice's to the film's choices, a render's to its
// project. Each part reads its props as they change, so a card updates in
// place: a playing clip plays on and a half-typed comment stays.

import { For, Show } from '@solidjs/web';
import { Option } from 'effect';
import { type Accessor, createEffect, createMemo, createSignal, untrack } from 'solid-js';
import { type Say, reviewFrameUrl, withdrawSay } from '../../../core/api.ts';
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
import { pressed } from '../../pressed.ts';
import { APPROVAL_TEXT, POSTER_W, stateText, videoSource } from '../format.ts';
import { PlayedAlone } from '../player.tsx';
import { ProxyPending } from '../section.tsx';
import type { Inspected } from '../../../core/field.ts';
import { ChoiceAct } from './api.ts';
import { Playing, samePlaying, useAct, useFilm } from './context.tsx';
import { Selection } from '../../../command/selection.ts';
import { Target } from '../../command/context-menu.tsx';
import {
  InspectName,
  Inspector,
  type InspectorBox,
  useInspected,
  useThing,
} from '../inspector.tsx';
import type { ThingVerb, VerbId } from '../things.ts';
import { type InPlace, verbTitle } from './keys.ts';
import { Field } from '../../command/inspector.tsx';
import { HearIcon } from '../../page-shell.tsx';

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

/** The speaker that makes `playing` the sound over the picture. */
export const HearButton = (props: { readonly playing: Playing; readonly disabled?: boolean }) => {
  const { playing, hear } = useFilm();
  const on = () => samePlaying(playing(), props.playing);
  return (
    <button
      type="button"
      class={['sh-tool', 'rv-sound', { on: on() }]}
      data-act="hear"
      title="Hear this over the picture"
      aria-pressed={pressed(on())}
      disabled={props.disabled}
      onClick={() => hear(props.playing)}
    >
      <HearIcon />
    </button>
  );
};

/**
 * A variant's ▶ hear alone (UR-52): its sound with nothing under it, on the
 * film's one alone player; pressed again, or the clock played, it stops.
 */
const AloneButton = (props: { readonly variant: InPlace }) => {
  const { alone, hearAlone } = useFilm();
  const on = () =>
    Option.exists(
      alone(),
      (a) => a.point === props.variant.point && a.variant === props.variant.variant,
    );
  return (
    <button
      type="button"
      class={['sh-tool', 'rv-sound', { on: on() }]}
      data-act="hear-alone"
      aria-label="Hear alone"
      aria-pressed={pressed(on())}
      onClick={() => hearAlone(props.variant)}
    >
      {ALONE_GLYPH[Number(on())]}
    </button>
  );
};

/** ▶ to hear a variant alone, ■ to stop it. */
const ALONE_GLYPH = ['▶', '■'] as const;

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
        class="sh-btn"
        data-act="comment"
        disabled={text().trim() === '' || props.disabled === true}
      >
        Comment
      </button>
    </form>
  );
};

/**
 * An approve button: approved as it is now, or again once it has changed;
 * while it waits on something first (`first`: a scene's render), disabled,
 * saying what (`Approve · render first`). A `brief` one (a card's, with no
 * room for it) says only `Approve` and keeps what it waits on for its title
 * and its name to a screen reader.
 */
export const ApproveButton = (props: {
  readonly approval: ApprovalState;
  readonly approve: () => void;
  readonly disabled?: boolean;
  readonly first?: string;
  readonly brief?: boolean;
}) => {
  const waiting = () =>
    Option.map(Option.fromUndefinedOr(props.first), (first) => `Approve · ${first}`);
  const said = () => Option.filter(waiting(), () => props.brief === true);
  return (
    <button
      type="button"
      class="sh-btn"
      data-act="approve"
      data-approval={props.approval}
      aria-pressed={pressed(props.approval === 'approved')}
      title={Option.getOrUndefined(said())}
      aria-label={Option.getOrUndefined(said())}
      disabled={
        props.disabled === true || props.approval === 'approved' || Option.isSome(waiting())
      }
      onClick={() => props.approve()}
    >
      {Option.getOrElse(
        Option.filter(waiting(), () => props.brief !== true),
        () => APPROVE_TITLE[props.approval],
      )}
    </button>
  );
};

/**
 * A render's video, kept in place while its file stays the same, showing a
 * still of itself until it plays, on a clock of its own with the review's
 * transport row (`PlayedAlone`); while its proxy is being made, says so.
 */
export const Seen = (props: { readonly video: ReviewVideo }) => {
  const { state } = useReview();
  const src = createMemo(() => Option.getOrUndefined(videoSource(props.video, state.quality())));
  const poster = createMemo(() => reviewFrameUrl(props.video.ref, Option.none(), POSTER_W));
  return (
    <Show when={src()} fallback={<ProxyPending video={props.video} />}>
      {(source) => <PlayedAlone src={source()} poster={poster()} />}
    </Show>
  );
};

/** What a variant plays: its video, or its sound alone and in place. */
const Media = (props: { readonly point: ChoicePoint; readonly variant: ChoiceVariant }) => {
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
        <AloneButton variant={{ point: props.point.id, variant: props.variant.id }} />
      </Show>
      <Show when={Option.exists(heard(), (h) => h.inPlace)}>
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
      class="sh-btn"
      data-act="unapprove"
      disabled={withdrawing.waiting()}
      onClick={() => withdrawing.say(props.variant, withdrawSay())}
    >
      Unapprove
    </button>
  );
};

/**
 * A variant's approve: only what is current is approved, as the version seen
 * now. `first` is what one not current waits on, said on it (a scene's
 * render: `render first`).
 */
export const Approve = (props: {
  readonly variant: ChoiceVariant;
  readonly sayer: Sayer;
  readonly first?: string;
  /** Said in one word, what it waits on in its title (`ApproveButton`): a card's. */
  readonly brief?: boolean;
}) => {
  const approving = props.sayer.use();
  return (
    <ApproveButton
      approval={props.variant.approval}
      disabled={props.variant.state !== 'current' || approving.waiting()}
      first={Option.getOrUndefined(
        Option.filter(Option.fromUndefinedOr(props.first), () => props.variant.state !== 'current'),
      )}
      brief={props.brief}
      approve={() => approving.say(props.variant, { _tag: 'Approve' })}
    />
  );
};

/** A variant's approve and unapprove, as its inspector offers them. */
export const Approval = (props: {
  readonly variant: ChoiceVariant;
  readonly sayer: Sayer;
  readonly first?: string;
}) => (
  <>
    <Approve variant={props.variant} sayer={props.sayer} first={props.first} />
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
      class="sh-btn"
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
export const CommentBox = (props: {
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
    run: () => saying.say(variant, withdrawSay()),
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

/** A variant as a thing of the page: what its row, its card and its inspector read of it. */
interface VariantThing {
  /** Its selection, fixed for as long as its row lives (a row is keyed by its variant). */
  readonly selection: Selection;
  readonly title: () => string;
  /** Whether it is said of (approved, commented on): its point has an address. */
  readonly said: () => boolean;
}

/**
 * Register a point's variant as a thing of the page for as long as the
 * calling row lives: its inspector's title, whether it takes comments, and
 * the verbs its menu, ⌘K and keys run (`variantVerbs`). A project's scene
 * card is such a row, as a choice's variant row is.
 */
export const useVariantThing = (props: {
  readonly point: ChoicePoint;
  readonly variant: ChoiceVariant;
  readonly sayer: Sayer;
}): VariantThing => {
  const said = () => Option.isSome(props.point.address);
  const { film } = useFilm();
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
  return { selection, title, said };
};

/**
 * One variant: at rest its name (a tap inspects it), its state, its first
 * line, how it is seen or heard, its pick (picked: a filled check, not a
 * colour), its approve where it is the picked one, and a dot counting what
 * was said of it. The rest is in its inspector (`VariantInspector`, the
 * page's, not the row's): every line, unapprove, unkeep and reject, the
 * comments and the comment box; and in its context menu.
 */
const VariantRow = (props: {
  readonly point: ChoicePoint;
  readonly variant: ChoiceVariant;
  readonly sayer: Sayer;
}) => {
  const { film } = useFilm();
  // A row is keyed by its variant: its selection is fixed for as long as it lives.
  const selection = untrack(() =>
    Selection.cases.Variant.make({ film, point: props.point.id, variant: props.variant.id }),
  );
  const inspected = useInspected(selection);
  const approveAtRest = () =>
    Option.isSome(props.point.address) && (props.variant.picked || props.point.kind === 'render');
  return (
    <Target
      of={selection}
      class="rv-take"
      data-variant={props.variant.id}
      data-state={props.variant.state}
      data-picked={pressed(props.variant.picked)}
      data-selected={pressed(inspected())}
    >
      <div class="rv-row">
        <InspectName of={selection} comments={props.variant.comments.length}>
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
        <RowState variant={props.variant} />
      </div>
      <Show when={props.variant.lines[0]}>
        {(line) => (
          <div class="rv-meta lab-clamp" title={props.variant.lines.join('\n')}>
            {line()}
          </div>
        )}
      </Show>
      <div class="rv-row rv-acts">
        <Media point={props.point} variant={props.variant} />
        <For each={props.variant.verbs.filter((verb) => !isRare(verb))}>
          {(verb) => <VerbButton point={props.point} variant={props.variant} verb={verb} />}
        </For>
        <Show when={approveAtRest()}>
          <Approve variant={props.variant} sayer={props.sayer} />
        </Show>
      </div>
    </Target>
  );
};

/**
 * A choice's variant as a thing of the page (`useVariantThing`) and its
 * inspector: every line, its approval, unkeep and reject, the comments and
 * the comment box.
 */
const VariantInspector = (props: {
  readonly point: ChoicePoint;
  readonly variant: ChoiceVariant;
  readonly sayer: Sayer;
}) => {
  const { selection, title, said } = useVariantThing(props);
  return (
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
          <Comments comments={props.variant.comments} />
          <Show when={said()}>
            <CommentBox variant={props.variant} sayer={props.sayer} box={box} />
          </Show>
        </>
      )}
    </Inspector>
  );
};

/**
 * Every variant of `points` as a thing of the page, and its sheet: the
 * page's, whichever cards it shows, so a sheet a link names opens though
 * Show only (`?only=`) leaves its card out.
 */
export const ChoiceSheets = (props: { readonly points: ReadonlyArray<ChoicePoint> }) => (
  <For each={props.points} keyed={(p) => p.id}>
    {(point) => {
      const sayer = choiceSayer(point);
      return (
        <For each={point().variants} keyed={(v) => v.id}>
          {(variant) => <VariantInspector point={point()} variant={variant()} sayer={sayer} />}
        </For>
      );
    }}
  </For>
);

/** A row's word for a variant's state, when it is not current (UR-49): why is its sheet's. */
const ROW_STATE = {
  stale: 'Out of date',
  missing: 'Not made yet',
} as const satisfies Record<Exclude<ChoiceVariant['state'], 'current'>, string>;

/**
 * A variant's state on its row, only when it is not current (UR2-2), and its
 * approval when it has one; its sheet says the state in full (`StateTags`).
 */
const RowState = (props: { readonly variant: ChoiceVariant }) => {
  const notCurrent = (): Option.Option<keyof typeof ROW_STATE> =>
    Option.fromUndefinedOr(
      Object.keys(ROW_STATE).find((s): s is keyof typeof ROW_STATE => s === props.variant.state),
    );
  return (
    <>
      <For each={Option.toArray(notCurrent())}>
        {(s) => (
          <span
            class="rv-badge"
            data-state={s}
            title={stateText(props.variant.state, props.variant.staleBy)}
          >
            {ROW_STATE[s]}
          </span>
        )}
      </For>
      <Show when={props.variant.approval !== 'none'}>
        <span class="rv-badge" data-approval={props.variant.approval}>
          {APPROVAL_TEXT[props.variant.approval]}
        </span>
      </Show>
    </>
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

/** Open the card of `point` where it sits (a fold it is in opens), and bring it into view. */
const revealPoint = (point: string) =>
  Option.map(Option.fromNullishOr(document.getElementById(`point-${point}`)), (card) => {
    Option.map(Option.fromNullishOr(card.closest('details')), (d) => {
      d.open = true;
    });
    card.scrollIntoView({ block: 'center' });
    return card;
  });

/**
 * A card's first control that takes the keyboard: where it lands when the
 * card is gone to. A disabled one (a computed level's slider and field) is
 * passed over.
 */
const FIRST_CONTROL = '.rv-body :is(button, input, select, a[href]):not(:disabled)';

/**
 * Reveal the card of `point` and put the keyboard on its first control that
 * takes it, else on the card itself, so what the keys select next (an
 * audition, a pick) is this point's and not the one focused before.
 */
export const focusPoint = (point: string) =>
  Option.map(revealPoint(point), (card) =>
    Option.getOrElse(
      Option.fromNullishOr(card.querySelector<HTMLElement>(FIRST_CONTROL)),
      () => card,
    ).focus({ preventScroll: true }),
  );

/** Where a choice's says go: the film's choices, under its point. */
const choiceSayer = (point: () => ChoicePoint): Sayer => ({
  use: () => {
    const saying = useAct();
    return {
      waiting: saying.waiting,
      say: (variant, say) =>
        saying.write(ChoiceAct.Say({ point: point().id, variant: variant.id, say })),
    };
  },
});

/**
 * One choice point: its lines, its knob, its variants. A
 * choice's says go to the film's choices. Why a stale variant is stale is
 * its own (`staleBy`).
 */
export const ChoiceCard = (props: { readonly point: ChoicePoint }) => {
  const sayer = choiceSayer(() => props.point);
  const { film } = useFilm();
  return (
    <Target
      of={Selection.cases.Point.make({ film, point: props.point.id })}
      class="rv-card rv-option"
      id={`point-${props.point.id}`}
      // Out of the tab order, but where Go to puts the keyboard when no control takes it.
      tabindex="-1"
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
          {(variant) => <VariantRow point={props.point} variant={variant()} sayer={sayer} />}
        </For>
        <Show when={props.point.variants.length === 0 && Option.isNone(props.point.knob)}>
          <p class="rv-hint">Nothing to choose between yet.</p>
        </Show>
      </div>
    </Target>
  );
};
