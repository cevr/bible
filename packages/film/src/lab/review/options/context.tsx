// One film's options on the review page. `<FilmProvider>` holds the film's
// choices and its check (read from the film's routes, read again after each
// write), the write itself (a pick, a take kept or rejected, an undo or a
// redo), and the synced player: the film's newest render (its own sound
// muted) on the clock, and the sound heard over it, one `<audio>` of the
// film's whole mix with a score option playing or a take in place. Choosing
// what is heard swaps that one `<audio>`; it joins the clock where it stands.

import { useAtomRefresh, useAtomSet, useAtomSuspense, useAtomValue } from '@bible/atom-solid';
import { Loading, Show } from '@solidjs/web';
import { Data, Match, Option } from 'effect';
import { Machine } from 'effect-machine';
import * as ActorAtom from 'effect-machine/atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type * as Atom from 'effect/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
} from 'solid-js';
import {
  type CheckReport,
  type FilmChoices,
  type ReviewVideo,
  scoreMixUrl,
  takeMixUrl,
} from '../../../core/schema.ts';
import type { LabFailure } from '../../api.ts';
import { ARROWS, typing, useReview } from '../context.tsx';
import { STEP_S, type SyncActor, SyncEvent, type SyncState, spawnSync } from '../machine.ts';
import { type SyncDriver, makeSync } from '../sync.ts';
import { type ChoiceAct, OptionsApi, type Wrote } from './api.ts';

/** The player's clock: the film's render, its own sound muted unless it is the one heard. */
export const PICTURE = 'picture';

/** What is heard over the picture: its own sound, the mix with a score option, or a take in place. */
export type Heard = Data.TaggedEnum<{
  Own: {};
  Score: { readonly option: string };
  Take: { readonly sound: string; readonly take: string };
}>;
export const Heard = Data.taggedEnum<Heard>();

/** The URL of the mix `heard` plays, at the film's `version` (none for the picture's own sound). */
export const mixOf = (film: string, heard: Heard, version: number): Option.Option<string> =>
  Match.value(heard).pipe(
    Match.tagsExhaustive({
      Own: () => Option.none<string>(),
      Score: (h) => Option.some(`${scoreMixUrl(film, h.option)}?v=${version}`),
      Take: (h) => Option.some(`${takeMixUrl(film, h.sound, h.take)}?v=${version}`),
    }),
  );

/** The player's id for what is heard: the picture, or the mix's URL. */
export const trackOf = (film: string, heard: Heard, version: number): string =>
  Option.getOrElse(mixOf(film, heard, version), () => PICTURE);

/** What is heard first: the score option the film plays, when it has been composed; else the first that has. */
export const firstHeard = (choices: FilmChoices): Heard =>
  Option.getOrElse(
    Option.flatMap(
      Option.fromUndefinedOr(choices.choices.find((c) => c._tag === 'ScoreChoice')),
      (score) => {
        const heard = score.variants.filter((v) => v.state !== 'missing');
        return Option.map(
          Option.orElse(Option.fromUndefinedOr(heard.find((v) => v.id === score.picked)), () =>
            Option.fromUndefinedOr(heard[0]),
          ),
          (v): Heard => Heard.Score({ option: v.id }),
        );
      },
    ),
    (): Heard => Heard.Own(),
  );

/** Whether two `Heard`s are the same sound. */
export const sameHeard = (a: Heard, b: Heard): boolean => trackOf('', a, 0) === trackOf('', b, 0);

export interface FilmContextValue {
  readonly film: string;
  readonly choices: Accessor<FilmChoices>;
  readonly check: Accessor<AsyncResult.AsyncResult<CheckReport, LabFailure>>;
  /** The last write, as it went. */
  readonly wrote: Accessor<AsyncResult.AsyncResult<Wrote, LabFailure>>;
  readonly write: (act: ChoiceAct) => void;
  /** The render the sound plays over, when the film has one. */
  readonly picture: Accessor<Option.Option<ReviewVideo>>;
  readonly choosePicture: (ref: string) => void;
  readonly heard: Accessor<Heard>;
  readonly hear: (heard: Heard) => void;
  /** The mix heard now, when it is not the picture's own. */
  readonly mix: Accessor<Option.Option<string>>;
  readonly sync: Accessor<SyncState>;
  readonly send: (event: SyncEvent) => void;
  readonly driver: SyncDriver;
}

const FilmContext = createContext<FilmContextValue>();

/** A film's context: only inside `<FilmProvider>`. */
export const useFilm = (): FilmContextValue => useContext(FilmContext);

type Loaded<A> = Atom.Atom<AsyncResult.AsyncResult<A, LabFailure>>;

interface FilmAtoms {
  readonly film: string;
  readonly choices: Loaded<FilmChoices>;
  readonly check: Loaded<CheckReport>;
  readonly write: Atom.Writable<AsyncResult.AsyncResult<Wrote, LabFailure>, ChoiceAct>;
}

const FilmBody = (
  props: ParentProps<{
    readonly atoms: FilmAtoms;
    readonly first: FilmChoices;
    readonly actor: SyncActor;
  }>,
) => {
  const film = props.atoms.film;
  const syncAtom = ActorAtom.make(props.actor);
  const sync = useAtomValue(() => syncAtom);
  const send = useAtomSet(() => syncAtom);
  const choicesResult = useAtomValue(() => props.atoms.choices);
  const refreshChoices = useAtomRefresh(() => props.atoms.choices);
  const check = useAtomValue(() => props.atoms.check);
  const refreshCheck = useAtomRefresh(() => props.atoms.check);
  const wrote = useAtomValue(() => props.atoms.write);
  const write = useAtomSet(() => props.atoms.write);

  const choices = createMemo(() =>
    Option.getOrElse(AsyncResult.value(choicesResult()), () => props.first),
  );
  // Each write bumps the version: every mix is asked for again, mixed from the source as it now stands.
  const [version, setVersion] = createSignal(0);
  createEffect(wrote, (result) => {
    if (!AsyncResult.isSuccess(result) || result.waiting) return;
    setVersion((v) => v + 1);
    refreshChoices();
    refreshCheck();
  });

  const [pictureRef, setPictureRef] = createSignal(
    Option.map(Option.fromUndefinedOr(props.first.pictures[0]), (p) => p.ref),
  );
  const picture = createMemo(() =>
    Option.flatMap(pictureRef(), (ref) =>
      Option.fromUndefinedOr(choices().pictures.find((p) => p.ref === ref)),
    ),
  );
  const [heard, setHeard] = createSignal<Heard>(firstHeard(props.first));
  const mix = createMemo(() => mixOf(film, heard(), version()));
  createEffect(
    () => trackOf(film, heard(), version()),
    (id) => send(SyncEvent.HeardChosen({ id })),
  );

  const driver = makeSync(PICTURE, send);
  onCleanup(driver.stop);
  createEffect(sync, (s) => driver.apply(s));

  const onKey = (e: KeyboardEvent) => {
    if (Option.exists(Option.fromNullishOr(e.target), typing) || e.metaKey || e.ctrlKey || e.altKey)
      return;
    if (Option.isNone(picture())) return;
    if (e.key === ' ') {
      e.preventDefault();
      send(SyncEvent.Toggled);
      return;
    }
    Option.map(Option.fromUndefinedOr(ARROWS.get(e.key)), (by) => {
      e.preventDefault();
      send(SyncEvent.Stepped({ by: by * STEP_S }));
    });
  };
  document.addEventListener('keydown', onKey);
  onCleanup(() => document.removeEventListener('keydown', onKey));

  const value: FilmContextValue = {
    film,
    choices,
    check,
    wrote,
    write: (act) => write(act),
    picture,
    choosePicture: (ref) => {
      send(SyncEvent.PausePressed);
      setPictureRef(Option.some(ref));
    },
    heard,
    hear: setHeard,
    mix,
    sync,
    send,
    driver,
  };
  return <FilmContext value={value}>{props.children}</FilmContext>;
};

const FilmReady = (
  props: ParentProps<{
    readonly atoms: FilmAtoms;
    readonly first: FilmChoices;
    readonly actor: Atom.Atom<AsyncResult.AsyncResult<SyncActor, never>>;
  }>,
) => {
  const actor = useAtomSuspense(() => props.actor);
  return (
    <Show when={actor()} keyed>
      {(a: SyncActor) => (
        <FilmBody atoms={props.atoms} first={props.first} actor={a}>
          {props.children}
        </FilmBody>
      )}
    </Show>
  );
};

/** What a failed read says. */
export const failedText = (result: AsyncResult.AsyncResult<unknown, LabFailure>): string =>
  Option.getOrElse(
    Option.map(AsyncResult.error(result), (e) => e.message.replace(/^\w+: /, '')),
    () => '',
  );

/** A film's choices, its check, its writes and its player, around `children`, once its choices are read. */
export const FilmProvider = (props: ParentProps<{ readonly film: string }>) => {
  const { meta } = useReview();
  const film = props.film;
  const atoms: FilmAtoms = {
    film,
    choices: meta.runtime.atom(OptionsApi.use((api) => api.options(film))),
    check: meta.runtime.atom(OptionsApi.use((api) => api.check(film))),
    write: meta.runtime.fn((act: ChoiceAct) => OptionsApi.use((api) => api.write(film, act))),
  };
  const actor = meta.runtime.atom(Machine.scoped(spawnSync(PICTURE, 0)));
  const first = useAtomValue(() => atoms.choices);
  // The page opens on the choices as first read; a later read (after a write) updates them in place.
  const [opened, setOpened] = createSignal(Option.none<FilmChoices>());
  createEffect(first, (result) => {
    if (Option.isSome(opened())) return;
    setOpened(AsyncResult.value(result));
  });
  return (
    <Show
      when={Option.getOrUndefined(opened())}
      keyed
      fallback={
        <p class="empty">
          {Match.value(AsyncResult.isFailure(first())).pipe(
            Match.when(true, () => failedText(first())),
            Match.orElse(() => `Reading ${film}'s options…`),
          )}
        </p>
      }
    >
      {(choices: FilmChoices) => (
        <Loading>
          <FilmReady atoms={atoms} first={choices} actor={actor}>
            {props.children}
          </FilmReady>
        </Loading>
      )}
    </Show>
  );
};
