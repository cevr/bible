// An ask's page, in parts the page composes: its head (what is asked, why,
// by whom, by when), the step the run is on (its blocks, each primitive its
// own part: a heading, prose, a picture, a choice, a free text), the send,
// and the ask once answered (every answer, typed) or closed. Each part reads
// the ask's provider (`context.tsx`) and nothing else, so a page is only
// which parts it shows and where; no part takes a flag that changes what it
// is.

import { For, type JSX, Show } from '@solidjs/web';
import { Toggle } from '@bible/ui/toggle';
import { ToggleGroup } from '@bible/ui/toggle-group';
import { Array as Arr, Match, Option, Predicate, Record } from 'effect';
import { type Accessor, createMemo } from 'solid-js';
import {
  type AskAnswer,
  type AskBlock,
  type AskImage,
  type AskRecord,
  askStatus,
  askedIn,
  blocksOf,
  endText,
} from '../../core/ask.ts';
import { pressed } from '../pressed.ts';
import { useAsk } from './context.tsx';

export { Provider } from './context.tsx';

type BlockOf<K extends AskBlock['kind']> = Extract<AskBlock, { readonly kind: K }>;

/** What an ask is in a word, on its chip. */
const STATUS_TEXT = { asking: 'waits on you', answered: 'answered', closed: 'closed' } as const;
const STATUS_STATE = { asking: 'warning', answered: 'approved', closed: 'stale' } as const;

/** The ask's head: its title, its state, why it is asked, who asked and by when. */
export const Head = () => {
  const { state } = useAsk();
  return (
    <Show when={Option.getOrUndefined(state.record())}>
      {(record: Accessor<AskRecord>) => {
        const status = () => askStatus(record().state);
        return (
          <header class="ak-head">
            <div class="rv-row">
              <h1>{record().title}</h1>
              <span class="sh-badge" data-state={STATUS_STATE[status()]} data-role="status">
                {STATUS_TEXT[status()]}
              </span>
            </div>
            <p class="ak-why">{record().why}</p>
            <p class="rv-meta">
              asked by {record().by}
              {Option.match(Option.fromUndefinedOr(record().deadline), {
                onNone: () => '',
                onSome: (d) => ` · by ${d.slice(0, 16).replace('T', ' ')}`,
              })}
            </p>
          </header>
        );
      }}
    </Show>
  );
};

/** A picture of an ask: its image, and its caption under it. */
const Img = (props: { readonly image: AskImage; readonly alt: string }) => (
  <figure class="ak-img">
    <img
      src={Option.getOrElse(Option.fromUndefinedOr(props.image.src), () => '')}
      alt={props.alt}
    />
    <Show when={props.image.caption}>
      {(caption: Accessor<string>) => <figcaption>{caption()}</figcaption>}
    </Show>
  </figure>
);

/** A title over what follows. */
export const Heading = (props: { readonly block: BlockOf<'heading'> }) => (
  <h2 class="ak-h">{props.block.text}</h2>
);

/** The context the owner decides in. */
export const Prose = (props: { readonly block: BlockOf<'prose'> }) => (
  <p class="ak-prose">{props.block.text}</p>
);

/** A still, a board try. */
export const Picture = (props: { readonly block: BlockOf<'image'> }) => (
  <Img
    image={props.block.image}
    alt={Option.getOrElse(Option.fromUndefinedOr(props.block.image.caption), () => '')}
  />
);

/** Choose one: each option a toggle, its picture over its label; pressing one again takes it back. */
export const ChooseOne = (props: { readonly block: BlockOf<'choose'> }) => {
  const { state, actions } = useAsk();
  const pictured = () => props.block.options.some((o) => Predicate.isNotUndefined(o.image));
  return (
    <fieldset class="ak-field" data-answer={props.block.id}>
      <legend>{props.block.label}</legend>
      <ToggleGroup<string>
        class="ak-options"
        data-pictured={pressed(pictured())}
        aria-label={props.block.label}
        value={Arr.filter([state.drafted(props.block.id)], (v) => v !== '')}
        onValueChange={(values) =>
          actions.set(
            props.block.id,
            Option.getOrElse(Arr.head(values), () => ''),
          )
        }
      >
        <For each={props.block.options}>
          {(option) => (
            <Toggle<string> class="ak-option" value={option.value} data-value={option.value}>
              {Option.match(Option.fromUndefinedOr(option.image), {
                onNone: () => '',
                onSome: (image) => <Img image={image} alt={option.label} />,
              })}
              <span class="ak-label">{option.label}</span>
            </Toggle>
          )}
        </For>
      </ToggleGroup>
    </fieldset>
  );
};

/** Free text: the owner's words. */
export const FreeText = (props: { readonly block: BlockOf<'free_text'> }) => {
  const { state, actions } = useAsk();
  return (
    <label class="ak-field" data-answer={props.block.id}>
      <span class="ak-legend">{props.block.label}</span>
      <textarea
        class="sh-field ak-text"
        name={props.block.id}
        rows={4}
        placeholder={Option.getOrElse(Option.fromUndefinedOr(props.block.placeholder), () => '')}
        value={state.drafted(props.block.id)}
        onInput={(e) => actions.set(props.block.id, e.currentTarget.value)}
      />
    </label>
  );
};

/** One block of a step, drawn by its own part. */
export const Block = (props: { readonly block: AskBlock }): JSX.Element =>
  Match.value(props.block).pipe(
    Match.discriminatorsExhaustive('kind')({
      heading: (b) => <Heading block={b} />,
      prose: (b) => <Prose block={b} />,
      image: (b) => <Picture block={b} />,
      choose: (b) => <ChooseOne block={b} />,
      free_text: (b) => <FreeText block={b} />,
    }),
  );

/**
 * The step the ask's run is on: its blocks, then `children` (its send). It
 * is drawn again only when the run moves to another step, by its name: a
 * draft's every keystroke leaves its fields, and the focus, where they are.
 */
export const Step = (props: { readonly children?: JSX.Element }) => {
  const { state } = useAsk();
  const name = createMemo(() => Option.getOrUndefined(Option.map(state.step(), (s) => s.name)));
  const blocks = () =>
    Option.match(state.step(), {
      onNone: (): ReadonlyArray<AskBlock> => [],
      onSome: (s) => blocksOf(s.step),
    });
  return (
    <Show when={name()} keyed>
      {(at: string) => (
        <section class="ak-step" data-step={at}>
          <For each={blocks()}>{(block) => <Block block={block} />}</For>
          {props.children}
        </section>
      )}
    </Show>
  );
};

/** The send: the step's answers to the lab, and what the last send said. */
export const Submit = () => {
  const { state, actions } = useAsk();
  const sending = () => state.phase() === 'Sending';
  return (
    <div class="ak-send">
      <button
        type="button"
        class="sh-btn"
        data-variant="primary"
        data-act="send"
        disabled={sending()}
        aria-busy={pressed(sending())}
        onClick={() => actions.submit()}
      >
        Send
      </button>
      <span class="rv-hint" role="status" aria-live="polite">
        {state.said()}
      </span>
    </div>
  );
};

/** An answer in words: a choice by its label, the words as they are. */
const answerText = (answer: AskAnswer): string =>
  Match.value(answer).pipe(
    Match.discriminatorsExhaustive('kind')({
      choose: (a) => a.label,
      free_text: (a) => a.text,
    }),
  );

/** The question that asked answer `id`, in the agent's words (its name, when no step asks it). */
const questionOf = (record: AskRecord, id: string): string =>
  Option.getOrElse(
    Arr.findFirst(Object.values(record.ask.steps).flatMap(askedIn), (b) => b.id === id).pipe(
      Option.map((b) => b.label),
    ),
    () => id,
  );

/** Every answer the ask holds, under the question that asked it: what the owner said. */
const Answers = (props: { readonly record: AskRecord }) => (
  <dl class="ak-answers">
    <For each={Record.toEntries(props.record.state.answers)}>
      {(entry) => (
        <div data-answer={entry[0]}>
          <dt>{questionOf(props.record, entry[0])}</dt>
          <dd>{answerText(entry[1])}</dd>
        </div>
      )}
    </For>
  </dl>
);

/** The ask once answered or closed: its end's words, or why it was closed, and every answer. */
export const Outcome = () => {
  const { state } = useAsk();
  return (
    <Show
      when={Option.getOrUndefined(Option.filter(state.record(), (r) => r.state._tag !== 'Asking'))}
    >
      {(record: Accessor<AskRecord>) => (
        <section class="ak-outcome" data-outcome={record().state._tag}>
          <p>
            {Match.value(record().state).pipe(
              Match.tag('Answered', (s) =>
                Option.getOrElse(
                  Option.flatMap(Record.get(record().ask.steps, s.step), endText),
                  () => 'Answered. The agent has it.',
                ),
              ),
              Match.tag('Closed', (s) => `Closed: ${s.why}`),
              Match.orElse(() => ''),
            )}
          </p>
          <Answers record={record()} />
        </section>
      )}
    </Show>
  );
};

/** While the ask is read, or why it cannot be. */
export const Status = () => {
  const { state } = useAsk();
  return (
    <p class="rv-hint" role="status" aria-live="polite">
      {Match.value(state.phase()).pipe(
        Match.when('Reading', () => 'Reading the ask…'),
        Match.when('Unreadable', () => `This ask cannot be read: ${state.said()}`),
        Match.orElse(() => ''),
      )}
    </p>
  );
};
