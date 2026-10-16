// A variant's approval and what was said of it, as a render's card in the
// review shows them (`section.tsx`): its approve and unapprove (only what is
// current is approved, as the version seen now; unapprove withdraws every
// approval of it), its comments, each marked when it was said of an earlier
// version, and a line to say another. A say goes where the card is told
// (`Sayer`): a render's to its project.

import { For, Show } from '@solidjs/web';
import { Option } from 'effect';
import { createSignal, untrack } from 'solid-js';
import { withdrawSay } from '../../core/api.ts';
import type { ApprovalState, SaidComment } from '../../core/catalogue.ts';
import type { ChoiceVariant } from '../../core/choice.ts';
import { pressed } from '../pressed.ts';
import type { InspectorBox } from './inspector.tsx';
import { APPROVE_TITLE, type OwnSay } from './things.ts';

/**
 * Where a card's says go: a render's to its project. `use` makes a control's own say (`useWrite`),
 * once, as the control is made.
 */
export interface Sayer {
  readonly use: () => OwnSay;
}

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
const SayBox = (props: {
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
        aria-label="Comment"
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

/** An approve button: approved as it is now, or again once it has changed. */
const ApproveButton = (props: {
  readonly approval: ApprovalState;
  readonly approve: () => void;
  readonly disabled?: boolean;
}) => (
  <button
    type="button"
    class="sh-btn"
    data-act="approve"
    data-approval={props.approval}
    aria-pressed={pressed(props.approval === 'approved')}
    disabled={props.disabled === true || props.approval === 'approved'}
    onClick={() => props.approve()}
  >
    {APPROVE_TITLE[props.approval]}
  </button>
);

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
export const Approval = (props: { readonly variant: ChoiceVariant; readonly sayer: Sayer }) => (
  <>
    <Approve variant={props.variant} sayer={props.sayer} />
    <Show when={props.variant.approval !== 'none'}>
      <UnapproveButton variant={props.variant} sayer={props.sayer} />
    </Show>
  </>
);

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
