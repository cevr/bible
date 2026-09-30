// One choice point as the review shows it (`core/choice.ts`), the same card
// for every kind and at every level of the film: its title and lines, the
// instants it plays at (a jump on the clock), its knob (a sound layer's
// level), and each variant with its state, what it is, how it is heard
// (alone: its own file; in place: 🔊 over the picture), the verbs its state
// allows (pick, unpick, reject), its approval and what was said of it. The
// project view places the same cards at the address they belong to.

import { For, Show } from '@solidjs/web';
import { Match, Option } from 'effect';
import { createSignal } from 'solid-js';
import { choiceAloneUrl } from '../../../core/api.ts';
import type { ApprovalState, SaidComment } from '../../../core/catalogue.ts';
import {
  type ChoiceKind,
  type ChoiceKnob,
  type ChoicePoint,
  type ChoiceVariant,
  type ChoiceVerb,
  VariantMedia,
} from '../../../core/choice.ts';
import { pressed } from '../format.ts';
import { SyncEvent, timeText } from '../machine.ts';
import { ChoiceAct } from './api.ts';
import { Heard, sameHeard, useFilm } from './context.tsx';

/** What a variant's state badge says of it. */
const STATE_TEXT = {
  current: 'current',
  stale: 'stale: made for an earlier version',
  missing: 'not made here',
} as const;

/** A verb's button, as a kind names it: a take is kept, anything else picked. */
const verbTitle = (kind: ChoiceKind, verb: ChoiceVerb): string =>
  Match.value(verb).pipe(
    Match.when('pick', () =>
      Match.value(kind).pipe(
        Match.when('take', () => 'Keep'),
        Match.when('voice', () => 'Keep as the take'),
        Match.orElse(() => 'Pick'),
      ),
    ),
    Match.when('unpick', () => 'Unkeep'),
    Match.orElse(() => 'Reject'),
  );

/** The approve button's words for an approval. */
const approveTitle = (approval: ApprovalState): string =>
  Match.value(approval).pipe(
    Match.when('approved', () => 'Approved'),
    Match.when('stale', () => 'Approve again'),
    Match.orElse(() => 'Approve'),
  );

/** The 🔊 that makes `heard` the sound over the picture. */
export const HearButton = (props: { readonly heard: Heard; readonly disabled?: boolean }) => {
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

/** What was said, each marked when it was said of an earlier version. */
export const Comments = (props: { readonly comments: ReadonlyArray<SaidComment> }) => (
  <Show when={props.comments.length > 0}>
    <ul class="rv-comments">
      <For each={props.comments}>
        {(c) => (
          <li data-comment={c.id} data-earlier={pressed(!c.onThis)}>
            <Show when={!c.onThis}>
              <span class="rv-hint">(earlier) </span>
            </Show>
            {c.text}
          </li>
        )}
      </For>
    </ul>
  </Show>
);

/** A line to say something, and its button; `say` gets the text, the line empties. */
export const SayBox = (props: { readonly say: (text: string) => void }) => {
  const [text, setText] = createSignal('');
  const send = () => {
    const said = text().trim();
    if (said === '') return;
    props.say(said);
    setText('');
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
        placeholder="Say something of it"
        value={text()}
        onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
          setText(e.currentTarget.value)
        }
      />
      <button type="submit" class="rv-chip" data-act="comment" disabled={text().trim() === ''}>
        Say
      </button>
    </form>
  );
};

/** A variant's approve button: approved as it is now, or again once it has changed. */
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
    {approveTitle(props.approval)}
  </button>
);

const VariantRow = (props: { readonly point: ChoicePoint; readonly variant: ChoiceVariant }) => {
  const { film, write } = useFilm();
  const point = props.point;
  const variant = props.variant;
  const heard = VariantMedia.match(variant.media, {
    Heard: (h) => Option.some(h),
    Seen: () => Option.none(),
    Unseen: () => Option.none(),
  });
  const missing = variant.state === 'missing';
  return (
    <div
      class={['rv-take', { 'rv-audible': variant.picked }]}
      data-variant={variant.id}
      data-state={variant.state}
      data-picked={pressed(variant.picked)}
    >
      <div class="rv-row">
        <span class="rv-name">{variant.label}</span>
        <Show when={variant.picked}>
          <span class="rv-badge">picked</span>
        </Show>
        <span class="rv-tag" data-state={variant.state}>
          {STATE_TEXT[variant.state]}
        </span>
      </div>
      <For each={variant.lines}>{(line) => <div class="rv-meta">{line}</div>}</For>
      <div class="rv-row">
        <Show when={Option.exists(heard, (h) => h.alone) && !missing}>
          <audio controls preload="none" src={choiceAloneUrl(film, point.id, variant.id)} />
        </Show>
        <Show when={Option.exists(heard, (h) => h.inPlace)}>
          <span class="rv-hint">in place</span>
          <HearButton
            heard={Heard.InPlace({ point: point.id, variant: variant.id })}
            disabled={missing}
          />
        </Show>
        <For each={variant.verbs}>
          {(verb) => (
            <button
              type="button"
              class="rv-chip"
              data-act={verb}
              onClick={() => write(ChoiceAct.Verb({ point: point.id, variant: variant.id, verb }))}
            >
              {verbTitle(point.kind, verb)}
            </button>
          )}
        </For>
        <Show when={Option.isSome(point.address)}>
          <ApproveButton
            approval={variant.approval}
            disabled={missing}
            approve={() => write(ChoiceAct.Approve({ point: point.id, variant: variant.id }))}
          />
        </Show>
      </div>
      <Comments comments={variant.comments} />
      <Show when={Option.isSome(point.address)}>
        <SayBox
          say={(text) => write(ChoiceAct.Comment({ point: point.id, variant: variant.id, text }))}
        />
      </Show>
    </div>
  );
};

/** A level's knob: set on release, written into `sound.ts`; a computed level only shown. */
const Knob = (props: { readonly point: ChoicePoint; readonly knob: ChoiceKnob }) => {
  const { write } = useFilm();
  const [value, setValue] = createSignal(props.knob.value);
  const fixed = props.knob.fixed;
  return (
    <div class="rv-row rv-knob" data-knob={props.point.id}>
      <input
        type="range"
        min={props.knob.min}
        max={props.knob.max}
        step={props.knob.step}
        value={value()}
        disabled={Option.isSome(fixed)}
        title={Option.getOrElse(fixed, () => '')}
        onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
          setValue(Number(e.currentTarget.value))
        }
        onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
          write(ChoiceAct.Knob({ point: props.point.id, value: Number(e.currentTarget.value) }))
        }
      />
      <output class="rv-tag">
        {value()} {props.knob.unit}
      </output>
      <Show when={Option.getOrUndefined(fixed)}>
        {(why) => <span class="rv-hint">{why()}</span>}
      </Show>
    </div>
  );
};

/** One choice point: its lines, where it plays, its knob, its variants. */
export const ChoiceCard = (props: { readonly point: ChoicePoint }) => {
  const { send, picture } = useFilm();
  const point = props.point;
  const jump = (t: number) => {
    send(SyncEvent.ScrubMoved({ t }));
    send(SyncEvent.ScrubReleased);
  };
  return (
    <div class="rv-card rv-option" data-point={point.id} data-kind={point.kind}>
      <div class="rv-cap">
        <span class="rv-name">{point.title}</span>
        <span class="rv-tag">{point.lines.join(' · ')}</span>
      </div>
      <div class="rv-body">
        <Show when={point.marks.length > 0}>
          <div class="rv-row rv-pick">
            <span class="rv-hint">Plays at:</span>
            <For each={point.marks}>
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
        <Show when={Option.getOrUndefined(point.knob)} keyed>
          {(knob: ChoiceKnob) => <Knob point={point} knob={knob} />}
        </Show>
        <For each={point.variants}>
          {(variant) => <VariantRow point={point} variant={variant} />}
        </For>
        <Show when={point.variants.length === 0 && Option.isNone(point.knob)}>
          <p class="rv-hint">Nothing to choose between yet.</p>
        </Show>
      </div>
    </div>
  );
};
