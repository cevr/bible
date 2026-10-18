// An ask's page, in parts the page composes: its head (what is asked, why,
// by when), the index of its sections (each a jump to it, ✓ once its
// questions are answered), its sections on one page (each a step the
// owner's answers reach, headed `2 of 3 · The Board` and held at the top
// while it is read: its blocks, each primitive its own part: a heading,
// prose, a picture, a choice, a free text, and the material it is about,
// `material.tsx`), the one send held in reach (how many questions are
// answered; a Send with one open goes to it, marks it and names it), and
// the ask once answered (every answer, typed) or closed. On a page of asks
// each ask is a part of its own: headed under the page's title
// (`PartHead`), shown while it asks (`WhileAsking`), folded to a line of its
// answers once settled (`Folded`), and the one the page takes the owner to
// (`TakeTo`). Every element a part finds is found inside its own ask
// (`[data-ask]`), so two asks' steps and answers of one name never meet. Each part reads
// the ask's provider (`context.tsx`) and nothing else, so a page is only
// which parts it shows and where; no part takes a flag that changes what it
// is.

import { For, type JSX, Show } from '@solidjs/web';
import { Toggle } from '@bible/ui/toggle';
import { ToggleGroup } from '@bible/ui/toggle-group';
import { Array as Arr, Match, Option, Predicate, Record } from 'effect';
import { type Accessor, createEffect, createMemo, onSettled } from 'solid-js';
import {
  type AskAnswer,
  type AskBlock,
  type AskImage,
  type AskRecord,
  type Asking,
  type Section,
  askStatus,
  askedIn,
  blocksOf,
  endText,
  neededText,
  optionsShown,
  requiredOf,
  titleOf,
} from '../../core/ask.ts';
import type { Input } from '../../browser/keys.ts';
import { focusFor } from '../focus.ts';
import { pressed } from '../pressed.ts';
import { useReview } from '../review/context.tsx';
import { useAsk } from './context.tsx';
import { AudioPart, BoardPart, DocumentPart, ScriptPart, VideoPart } from './material.tsx';

export { Provider } from './context.tsx';

type BlockOf<K extends AskBlock['kind']> = Extract<AskBlock, { readonly kind: K }>;

/**
 * What a settled ask is in a word, on its chip, and the chip's state. One that waits wears none:
 * the dock's count (`2 of 3 answered`) already says what is left, and one gold on the page is
 * the Send's.
 */
const SETTLED = {
  answered: { text: 'answered', state: 'approved' },
  closed: { text: 'closed', state: 'stale' },
} as const;
type Settled = (typeof SETTLED)[keyof typeof SETTLED];

/** The ask's head, its title drawn by `title`: its state, why it is asked, and by when when it must be. */
const HeadWith = (props: { readonly title: (text: string) => JSX.Element }) => {
  const { state } = useAsk();
  return (
    <Show when={Option.getOrUndefined(state.record())}>
      {(record: Accessor<AskRecord>) => {
        const settled = () =>
          Match.value(askStatus(record().state)).pipe(
            Match.when('asking', () => Option.none<Settled>()),
            Match.orElse((status) => Option.some<Settled>(SETTLED[status])),
          );
        return (
          <header class="ak-head">
            <div class="ak-head-row">
              {props.title(record().title)}
              <Show when={Option.getOrUndefined(settled())}>
                {(chip: Accessor<Settled>) => (
                  <span class="sh-badge" data-state={chip().state} data-role="status">
                    {chip().text}
                  </span>
                )}
              </Show>
            </div>
            <p class="ak-why">{record().why}</p>
            <Show when={record().deadline}>
              {(d: Accessor<string>) => (
                <p class="ak-by">by {d().slice(0, 16).replace('T', ' ')}</p>
              )}
            </Show>
          </header>
        );
      }}
    </Show>
  );
};

/** The ask's head on a page of its own: its title the page's. */
export const Head = () => <HeadWith title={(text) => <h1>{text}</h1>} />;

/** The ask's head as one part of a page of asks: its title under the page's. */
export const PartHead = () => <HeadWith title={(text) => <h2 class="ak-part-h">{text}</h2>} />;

/** Ask `ask`'s part of the page: what its elements are found inside. */
const within = (ask: string): string => `.ak[data-ask="${CSS.escape(ask)}"]`;

/** The block a question of ask `ask` is answered in, by its answer's id. */
const fieldOf = (ask: string, id: string): Option.Option<HTMLElement> =>
  Option.fromNullishOr(
    document.querySelector<HTMLElement>(`${within(ask)} [data-answer="${CSS.escape(id)}"]`),
  );

/** What takes the focus in a question: its first control. */
const ANSWERS_IN = 'button, textarea, input';
/** What takes the focus in a section: its head, so its material is read from the top. */
const HEAD_IN = '.ak-section-h';

/**
 * Take the owner to `el` under the header (and its section's head), and give
 * the focus to the first of `focus` in it, as `input` asked (its ring iff a
 * key did).
 */
const goTo = (el: HTMLElement, focus: string, input: Input) => {
  // A question sits under its section's held head however many lines the head wraps to.
  if (!el.matches('.ak-step'))
    Option.map(
      Option.fromNullishOr(el.closest('.ak-step')?.querySelector<HTMLElement>(HEAD_IN)),
      (head) => {
        el.style.scrollMarginTop = `calc(var(--header-h) + ${head.offsetHeight}px + var(--s-2))`;
      },
    );
  el.scrollIntoView({ block: 'start' });
  Option.map(Option.fromNullishOr(el.querySelector<HTMLElement>(focus)), (target) =>
    focusFor(target, input, { preventScroll: true }),
  );
};

/** Section `name` of ask `ask`, by its step. */
const stepOf = (ask: string, name: string): Option.Option<HTMLElement> =>
  Option.fromNullishOr(
    document.querySelector<HTMLElement>(`${within(ask)} .ak-step[data-step="${CSS.escape(name)}"]`),
  );

/**
 * A section's title on the page: its place among two or more, quiet, so the
 * title carries, then its step's title when it has one. A page of one
 * section has no place to say (`headed`).
 */
const SectionTitle = (props: {
  readonly step: Section['step'];
  readonly n: number;
  readonly of: number;
}) => (
  <>
    <Show when={props.of > 1}>
      <span class="ak-count">
        {Option.match(titleOf(props.step), {
          onNone: () => `${props.n} of ${props.of}`,
          onSome: () => `${props.n} of ${props.of} · `,
        })}
      </span>
    </Show>
    {Option.getOrElse(titleOf(props.step), () => '')}
  </>
);

/** Whether a section of `of` has a head: a title, or a place among others to say. */
const headed = (step: Section['step'], of: number): boolean =>
  Option.isSome(titleOf(step)) || of > 1;

/** A section in the index: its place, and its title when it has one. */
const indexTitle = (step: Section['step'], n: number): string =>
  Option.match(titleOf(step), {
    onNone: () => `${n}`,
    onSome: (title) => `${n} · ${title}`,
  });

/**
 * Where the page is going: each section the owner's answers reach, by its
 * place and title, a jump to its head (its material read from the top),
 * ✓ once every question it asks is answered. Nothing while the page has
 * one section.
 */
export const Index = () => {
  const { state } = useAsk();
  const { meta } = useReview();
  // Each entry is drawn once by its section's name, as the sections are: a keystroke redraws none.
  const names = createMemo(() => state.sections().map((s) => s.name));
  const titleOfStep = (name: string, n: number) =>
    Option.match(
      Arr.findFirst(state.sections(), (s) => s.name === name),
      { onNone: () => `${n}`, onSome: (s) => indexTitle(s.step, n) },
    );
  const openIn = (name: string) => state.questions().filter((q) => q.step === name && !q.answered);
  const asks = (name: string) => state.questions().some((q) => q.step === name);
  return (
    <Show when={names().length > 1}>
      <nav class="ak-index" aria-label="This ask's sections">
        <ol>
          <For each={names()}>
            {(name, i) => {
              const done = () => asks(name) && openIn(name).length === 0;
              return (
                <li>
                  <button
                    type="button"
                    class="sh-btn ak-index-go"
                    data-act="go-section"
                    data-step={name}
                    data-done={pressed(done())}
                    onClick={() =>
                      Option.map(stepOf(state.id, name), (el) =>
                        goTo(el, HEAD_IN, meta.hub.input()),
                      )
                    }
                  >
                    <span class="ak-index-title">{titleOfStep(name, i() + 1)}</span>
                    <Show when={done()}>
                      <span class="ak-index-done" aria-label="answered">
                        ✓
                      </span>
                    </Show>
                  </button>
                </li>
              );
            }}
          </For>
        </ol>
      </nav>
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

/**
 * Choose one: each option a toggle, its picture over its label, the one the
 * agent recommends first and marked so; pressing one again takes it back.
 */
export const ChooseOne = (props: { readonly block: BlockOf<'choose'> }) => {
  const { state, actions } = useAsk();
  const pictured = () => props.block.options.some((o) => Predicate.isNotUndefined(o.image));
  const missing = () => state.missing() === props.block.id;
  return (
    <fieldset
      class="ak-field"
      data-answer={props.block.id}
      data-invalid={pressed(missing())}
      aria-describedby={Option.getOrUndefined(
        Option.liftPredicate(saidId(state.id, props.block.id), () => missing()),
      )}
    >
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
        <For each={optionsShown(props.block.options)}>
          {(option) => (
            <Toggle<string>
              class="sh-btn ak-option"
              value={option.value}
              data-value={option.value}
              data-recommended={pressed(option.recommended === true)}
            >
              {Option.match(Option.fromUndefinedOr(option.image), {
                onNone: () => '',
                onSome: (image) => <Img image={image} alt={option.label} />,
              })}
              <span class="ak-label">
                {option.label}
                <Show when={option.recommended === true}>
                  {' '}
                  <span class="sh-badge" data-state="agent">
                    recommended
                  </span>
                </Show>
              </span>
            </Toggle>
          )}
        </For>
      </ToggleGroup>
      <For each={props.block.options.filter((o) => o.recommended === true)}>
        {(option) => (
          <Show when={option.why}>
            {(why: Accessor<string>) => <p class="ak-rec-why">Recommended: {why()}</p>}
          </Show>
        )}
      </For>
      <Unanswered block={props.block} />
    </fieldset>
  );
};

/** The id of the words that say question `id` of ask `ask` is still open. */
const saidId = (ask: string, id: string): string => `ak-said-${ask}-${id}`;

/**
 * Under question `block`, once a Send was refused for it: what it needs,
 * its label in sight above it (the send's dock, far from it, names it).
 */
const Unanswered = (props: { readonly block: Asking }) => {
  const { state } = useAsk();
  return (
    <Show when={state.missing() === props.block.id}>
      <p class="ak-unanswered" id={saidId(state.id, props.block.id)}>
        {neededText(props.block)}
      </p>
    </Show>
  );
};

/** Free text: the owner's words, marked optional unless the agent requires them (`required`). */
export const FreeText = (props: { readonly block: BlockOf<'free_text'> }) => {
  const { state, actions } = useAsk();
  const missing = () => state.missing() === props.block.id;
  return (
    <label class="ak-field" data-answer={props.block.id} data-invalid={pressed(missing())}>
      <span class="ak-legend">
        {props.block.label}
        <Show when={!requiredOf(props.block)}>
          <span class="ak-optional"> (optional)</span>
        </Show>
      </span>
      <textarea
        class="sh-field ak-text"
        name={props.block.id}
        rows={4}
        placeholder={Option.getOrElse(Option.fromUndefinedOr(props.block.placeholder), () => '')}
        value={state.drafted(props.block.id)}
        aria-invalid={pressed(missing())}
        aria-describedby={Option.getOrUndefined(
          Option.liftPredicate(saidId(state.id, props.block.id), () => missing()),
        )}
        onInput={(e) => actions.set(props.block.id, e.currentTarget.value)}
      />
      <Unanswered block={props.block} />
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
      document: (b) => <DocumentPart block={b} />,
      script: (b) => <ScriptPart block={b} />,
      board: (b) => <BoardPart block={b} />,
      video: (b) => <VideoPart block={b} />,
      audio: (b) => <AudioPart block={b} />,
    }),
  );

/**
 * The ask's sections, on one page: each step the owner's answers reach,
 * headed with its place and its title when it has one, then its blocks. A
 * section is drawn once by its name: a draft's every keystroke leaves its
 * fields, and the focus, where they are, and a section a choice leads to
 * appears under it, or goes, as the choice changes.
 */
export const Sections = () => {
  const { state } = useAsk();
  const names = createMemo(() => state.sections().map((s) => s.name));
  const stepNamed = (name: string) =>
    Arr.findFirst(state.sections(), (s) => s.name === name).pipe(Option.map((s) => s.step));
  return (
    <For each={names()}>
      {(name, i) => (
        <section class="ak-step" data-step={name}>
          <Show
            when={Option.getOrUndefined(
              Option.filter(stepNamed(name), (step) => headed(step, names().length)),
            )}
          >
            {(step: Accessor<Section['step']>) => (
              <h2 class="ak-section-h" tabindex="-1">
                <SectionTitle step={step()} n={i() + 1} of={names().length} />
              </h2>
            )}
          </Show>
          <For
            each={Option.match(stepNamed(name), {
              onNone: (): ReadonlyArray<AskBlock> => [],
              onSome: blocksOf,
            })}
          >
            {(block) => <Block block={block} />}
          </For>
        </section>
      )}
    </For>
  );
};

/** How far the page is answered, as the send says it while nothing else is to be said. */
const answeredText = (questions: ReadonlyArray<{ readonly answered: boolean }>): string =>
  `${questions.filter((q) => q.answered).length} of ${questions.length} answered`;

/**
 * The send, held in reach at the foot of the page: how many of the page's
 * questions are answered, or what the last send said, over the one Send. A
 * Send with a question open takes the owner to it, its words saying what it
 * needs.
 */
export const Submit = () => {
  const { state, actions } = useAsk();
  const { meta } = useReview();
  const sending = () => state.phase() === 'Sending' || state.phase() === 'Rereading';
  // Only an open page sends: one send is out at a time, and a gone ask takes none.
  const shut = () => state.phase() !== 'Open';
  createEffect(
    () => state.missing(),
    (id) => {
      if (id !== '')
        Option.map(fieldOf(state.id, id), (el) => goTo(el, ANSWERS_IN, meta.hub.input()));
    },
  );
  return (
    <Show when={state.sections().length > 0}>
      <div class="sh-dock ak-send">
        <span class="rv-hint" data-role="answered" role="status" aria-live="polite">
          {Option.getOrElse(
            Option.liftPredicate(state.said(), (said) => said !== ''),
            () => answeredText(state.questions()),
          )}
        </span>
        <button
          type="button"
          class="sh-btn"
          data-primary
          data-act="send"
          disabled={shut()}
          aria-busy={pressed(sending())}
          onClick={() => actions.submit()}
        >
          Send
        </button>
      </div>
    </Show>
  );
};

/** An answer in words: a choice by its label, the words as they are, or that it was left empty. */
const answerText = (answer: AskAnswer): string =>
  Match.value(answer).pipe(
    Match.discriminatorsExhaustive('kind')({
      choose: (a) => a.label,
      free_text: (a) => a.text,
      skipped: () => 'Skipped',
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

/** While the ask is read, or why it cannot be, with a way to read it again. */
export const Status = () => {
  const { state, actions } = useAsk();
  return (
    <div class="ak-status">
      <p class="rv-hint" role="status" aria-live="polite">
        {Match.value(state.phase()).pipe(
          Match.when('Reading', () => 'Reading the ask…'),
          Match.when('Rereading', () => 'Reading the ask again…'),
          Match.when('Unreadable', () => `This ask cannot be read: ${state.said()}`),
          Match.when(
            'Gone',
            () => `This ask is gone from the lab: ${state.said()}. Your answers stay here to copy.`,
          ),
          Match.orElse(() => ''),
        )}
      </p>
      <Show when={state.phase() === 'Unreadable'}>
        <button type="button" class="sh-btn" data-act="retry" onClick={() => actions.retry()}>
          Read again
        </button>
      </Show>
    </div>
  );
};

/** Whether the ask is settled (answered or closed), once it is read. */
const settledRecord = (record: Option.Option<AskRecord>): Option.Option<AskRecord> =>
  Option.filter(record, (r) => r.state._tag !== 'Asking');

/** What a part of a page of asks shows while its ask still asks (or is not read yet): its head, its sections and its Send. */
export const WhileAsking = (props: { readonly children: JSX.Element }) => {
  const { state } = useAsk();
  return <Show when={Option.isNone(settledRecord(state.record()))}>{props.children}</Show>;
};

/**
 * A part of a page of asks once its ask is answered or closed: one line, its
 * title, its state and its answers in words, which opens to every answer
 * under the question that asked it (`Outcome`).
 */
export const Folded = () => {
  const { state } = useAsk();
  return (
    <Show when={Option.getOrUndefined(settledRecord(state.record()))}>
      {(record: Accessor<AskRecord>) => {
        const chip = () =>
          Match.value(askStatus(record().state)).pipe(
            Match.when('closed', () => SETTLED.closed),
            Match.orElse(() => SETTLED.answered),
          );
        return (
          <details class="ak-folded">
            <summary class="ak-folded-line">
              <span class="ak-folded-title">{record().title}</span>
              <span class="sh-badge" data-state={chip().state} data-role="status">
                {chip().text}
              </span>
              <span class="ak-folded-answers">
                {Record.values(record().state.answers).map(answerText).join(' · ')}
              </span>
            </summary>
            <Outcome />
          </details>
        );
      }}
    </Show>
  );
};

/** How far down the window a part's top may start and still be in view, so the page leaves it where it is. */
const IN_VIEW = 2 / 3;

/**
 * Whether `part` starts in view: below what covers the page's top (its
 * `scroll-margin-top`, the header's height) and in the window's top
 * two-thirds.
 */
const startsInView = (part: HTMLElement) => {
  const top = part.getBoundingClientRect().top;
  return (
    top >= (Number.parseFloat(getComputedStyle(part).scrollMarginTop) || 0) - 1 &&
    top <= innerHeight * IN_VIEW
  );
};

/**
 * Where the page takes the owner: drawn in the part he is to answer next,
 * it scrolls that part to the top under the header once it is drawn, unless
 * it already starts in view (the page's head and count stay on screen then).
 */
export const TakeTo = () => {
  const { state } = useAsk();
  onSettled(() => {
    Option.map(
      Option.filter(
        Option.fromNullishOr(document.querySelector<HTMLElement>(within(state.id))),
        (part) => !startsInView(part),
      ),
      (part) => part.scrollIntoView({ block: 'start' }),
    );
  });
  return <></>;
};
