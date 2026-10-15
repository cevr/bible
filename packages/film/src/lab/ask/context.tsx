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
import type { AskRecord, Section } from '../../core/ask.ts';
import { Actor } from '../actor.tsx';
import { useReview } from '../review/context.tsx';
import {
  type AskPageActor,
  AskPageEvent,
  type AskPageState,
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
  /** What the last send or read said: why it was refused, or why the ask cannot be read. */
  readonly said: Accessor<string>;
}

interface AskActions {
  /** Set the owner's answer `id` to `value`. */
  readonly set: (id: string, value: string) => void;
  /** Send the page's answers. */
  readonly submit: () => void;
}

interface AskContextValue {
  readonly state: AskStateValue;
  readonly actions: AskActions;
}

const AskContext = createContext<AskContextValue>();

/** The ask's context: only inside `<Ask.Provider>`. */
export const useAsk = (): AskContextValue => useContext(AskContext);

const recordOf = (s: AskPageState): Option.Option<AskRecord> =>
  Match.value(s).pipe(
    Match.tag('Open', 'Sending', (o) => Option.some(o.record)),
    Match.orElse(() => Option.none<AskRecord>()),
  );

const draftOf = (s: AskPageState): Readonly<Record<string, string>> =>
  Match.value(s).pipe(
    Match.tag('Open', 'Sending', (o) => o.draft),
    Match.orElse(() => ({})),
  );

const saidOf = (s: AskPageState): string =>
  Match.value(s).pipe(
    Match.tag('Open', 'Reading', (o) => o.said),
    Match.tag('Unreadable', (u) => u.why),
    Match.orElse(() => ''),
  );

const Body = (props: ParentProps<{ readonly actor: AskPageActor }>) => {
  const stateAtom = ActorAtom.make(props.actor);
  const page = useAtomValue(() => stateAtom);
  const send = useAtomSet(() => stateAtom);
  const record = createMemo(() => recordOf(page()));
  const value: AskContextValue = {
    state: {
      phase: () => page()._tag,
      record,
      sections: createMemo(() =>
        Option.match(record(), {
          onNone: () => [],
          onSome: (r) => pageSections(r, draftOf(page())),
        }),
      ),
      drafted: (id) => Option.getOrElse(Record.get(draftOf(page()), id), () => ''),
      said: () => saidOf(page()),
    },
    actions: {
      set: (id, v) => send(AskPageEvent.Set({ id, value: v })),
      submit: () => send(AskPageEvent.Submit),
    },
  };
  return <AskContext value={value}>{props.children}</AskContext>;
};

/** Ask `ask`'s state and actions, for its page's parts. */
export const Provider = (props: ParentProps<{ readonly ask: string }>) => {
  const { meta } = useReview();
  return (
    <Actor runtime={meta.runtime} spawn={spawnAskPage(props.ask)}>
      {(actor) => <Body actor={actor}>{props.children}</Body>}
    </Actor>
  );
};
