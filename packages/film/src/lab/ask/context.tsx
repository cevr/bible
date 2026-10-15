// An ask's provider: its page machine (one actor per ask page, on the
// review's runtime), and what the page's parts read and do through it. The
// parts (`parts.tsx`) never see the machine: they read the record, the
// sections its page shows, the draft and what the last send said, and they
// set an answer or send the page. The provider is the one place that knows how.

import { useAtomSet, useAtomValue } from '@bible/atom-solid';
import { Match, Option, Record } from 'effect';
import * as ActorAtom from 'effect-machine/atom';
import type { Accessor, ParentProps } from 'solid-js';
import { createContext, createMemo, useContext } from 'solid-js';
import { type AskRecord, type Question, questionsOf, type Section } from '../../core/ask.ts';
import { Actor } from '../actor.tsx';
import { useReview } from '../review/context.tsx';
import {
  type AskPageActor,
  AskPageEvent,
  type AskPageState,
  type Page,
  pageSections,
  spawnAskPage,
} from './machine.ts';

/** Where the page is: reading the ask, open on it, sending its answers, or unable to read it. */
type AskPhase = AskPageState['_tag'];

interface AskStateValue {
  readonly phase: Accessor<AskPhase>;
  /** The ask as last read. */
  readonly record: Accessor<Option.Option<AskRecord>>;
  /** The page's sections, from where the run is as far as the draft reaches; none once it is not asking. */
  readonly sections: Accessor<ReadonlyArray<Section>>;
  /** The owner's answer `id` as drafted ('' when not). */
  readonly drafted: (id: string) => string;
  /** The questions the page waits on, in page order, and whether each is answered. */
  readonly questions: Accessor<ReadonlyArray<Question>>;
  /** What the last send or read said: why it was refused, or why the ask cannot be read. */
  readonly said: Accessor<string>;
  /** The question the last Send was refused for: the first left open ('' when none). */
  readonly missing: Accessor<string>;
}

interface AskActions {
  /** Set the owner's answer `id` to `value`. */
  readonly set: (id: string, value: string) => void;
  /** Send the page's answers. */
  readonly submit: () => void;
  /** Read the ask again, once it could not be read. */
  readonly retry: () => void;
}

interface AskContextValue {
  readonly state: AskStateValue;
  readonly actions: AskActions;
}

const AskContext = createContext<AskContextValue>();

/** The ask's context: only inside `<Ask.Provider>`. */
export const useAsk = (): AskContextValue => useContext(AskContext);

/** The page, once the ask is read: every state past the first read holds it. */
const pageOf = (s: AskPageState): Option.Option<Page> =>
  Match.value(s).pipe(
    Match.tag('Open', 'Sending', 'Rereading', 'Gone', (o) => Option.some(o.page)),
    Match.orElse(() => Option.none<Page>()),
  );

const draftOf = (s: AskPageState): Readonly<Record<string, string>> =>
  Option.match(pageOf(s), { onNone: () => ({}), onSome: (p) => p.draft });

const saidOf = (s: AskPageState): string =>
  Match.value(s).pipe(
    Match.tag('Open', 'Reading', 'Rereading', (o) => o.said),
    Match.tag('Unreadable', 'Gone', (u) => u.why),
    Match.orElse(() => ''),
  );

const Body = (props: ParentProps<{ readonly actor: AskPageActor }>) => {
  const stateAtom = ActorAtom.make(props.actor);
  const page = useAtomValue(() => stateAtom);
  const send = useAtomSet(() => stateAtom);
  const record = createMemo(() => Option.map(pageOf(page()), (p) => p.record));
  const sections = createMemo(() =>
    Option.match(record(), {
      onNone: () => [],
      onSome: (r) => pageSections(r, draftOf(page())),
    }),
  );
  const value: AskContextValue = {
    state: {
      phase: () => page()._tag,
      record,
      sections,
      drafted: (id) => Option.getOrElse(Record.get(draftOf(page()), id), () => ''),
      questions: createMemo(() => questionsOf(sections())),
      said: () => saidOf(page()),
      missing: () =>
        Match.value(page()).pipe(
          Match.tag('Open', (o) => o.missing),
          Match.orElse(() => ''),
        ),
    },
    actions: {
      set: (id, v) => send(AskPageEvent.Set({ id, value: v })),
      submit: () => send(AskPageEvent.Submit),
      retry: () => send(AskPageEvent.Retry),
    },
  };
  return <AskContext value={value}>{props.children}</AskContext>;
};

/**
 * Ask `ask`'s state and actions, for its page's parts. The page opens on the
 * review's first read of the ask, the one the shell names it by (`askRead`).
 */
export const Provider = (props: ParentProps<{ readonly ask: string }>) => {
  const { meta } = useReview();
  return (
    <Actor runtime={meta.runtime} spawn={spawnAskPage(props.ask, meta.askRead(props.ask))}>
      {(actor) => <Body actor={actor}>{props.children}</Body>}
    </Actor>
  );
};
