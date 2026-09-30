// One film's choices on the review page. `<FilmProvider>` holds the film's
// choice points and its check (read once from the film's routes, then as
// each write answers them: a source write answers the choices it leaves and
// the check after it, a say the choices; only an undo or a redo reads the
// choices again, and each source write the steps Undo and Redo offer), the
// write itself (a verb on a variant, a knob, a say on a variant, an undo or
// a redo), the sound check run after each write that changes what the film
// plays (`film check --sound`: dead air, balance against the picked score),
// and the synced player: the film's newest render
// (its own sound muted) on the clock, and the sound heard over it, one
// `<audio>` of the film's whole mix with a variant in place (a score option,
// a take). Choosing what is heard swaps that one `<audio>`; it joins the
// clock where it stands.

import { useAtomRefresh, useAtomSet, useAtomSuspense, useAtomValue } from '@bible/atom-solid';
import { Loading, Show } from '@solidjs/web';
import { Data, Exit, Match, Option } from 'effect';
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
  untrack,
  useContext,
} from 'solid-js';
import { type Steps, choiceMixUrl } from '../../../core/api.ts';
import type { FilmChoices, SoundCheck } from '../../../core/choice.ts';
import type { ReviewVideo } from '../../../core/review.ts';
import type { CheckLine, CheckReport } from '../../../core/schema.ts';
import type { LabFailure } from '../../api.ts';
import { ARROWS, typing, useReview } from '../context.tsx';
import { Loaded } from '../loaded.tsx';
import { STEP_S, type SyncActor, SyncEvent, type SyncState, spawnSync } from '../machine.ts';
import { type SyncDriver, makeSync } from '../sync.ts';
import { type ChoiceAct, OptionsApi, type Wrote, changesSound, writesSource } from './api.ts';

/** The player's clock: the film's render, its own sound muted unless it is the one heard. */
export const PICTURE = 'picture';

/** What is heard over the picture: its own sound, or the mix with one variant of a point in place. */
export type Heard = Data.TaggedEnum<{
  Own: {};
  InPlace: { readonly point: string; readonly variant: string };
}>;
export const Heard = Data.taggedEnum<Heard>();

/** The URL of the mix `heard` plays, at the film's `version` (none for the picture's own sound). */
export const mixOf = (film: string, heard: Heard, version: number): Option.Option<string> =>
  Match.value(heard).pipe(
    Match.tagsExhaustive({
      Own: () => Option.none<string>(),
      InPlace: (h) => Option.some(`${choiceMixUrl(film, h.point, h.variant)}&v=${version}`),
    }),
  );

/** The player's id for what is heard: the picture, or the mix's URL. */
const trackOf = (film: string, heard: Heard, version: number): string =>
  Option.getOrElse(mixOf(film, heard, version), () => PICTURE);

/** Whether a variant is heard in the film's mix. */
const inPlace = (media: FilmChoices['points'][number]['variants'][number]['media']) =>
  media._tag === 'Heard' && media.inPlace;

/** What is heard first: the score option the film plays, when it is heard; else the first that is. */
const firstHeard = (choices: FilmChoices): Heard =>
  Option.getOrElse(
    Option.flatMap(
      Option.fromUndefinedOr(choices.points.find((p) => p.kind === 'score')),
      (score) => {
        const heard = score.variants.filter((v) => inPlace(v.media));
        return Option.map(
          Option.orElse(Option.fromUndefinedOr(heard.find((v) => v.picked)), () =>
            Option.fromUndefinedOr(heard[0]),
          ),
          (v): Heard => Heard.InPlace({ point: score.id, variant: v.id }),
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
  /** The film's static check: as first read, then as the last source write answered it. */
  readonly findings: Accessor<Option.Option<ReadonlyArray<CheckLine>>>;
  /** What Undo and Redo would do now. */
  readonly steps: Accessor<Option.Option<Steps>>;
  /** The last write, as it went. */
  readonly wrote: Accessor<AsyncResult.AsyncResult<Wrote, LabFailure>>;
  /** Write `act`: whether it was answered (a say's box empties only then). */
  readonly write: (act: ChoiceAct) => Promise<boolean>;
  /** The sound check after the last pick or knob (initial until one). */
  readonly soundCheck: Accessor<AsyncResult.AsyncResult<SoundCheck, LabFailure>>;
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

type Read<A> = Atom.Atom<AsyncResult.AsyncResult<A, LabFailure>>;

interface FilmAtoms {
  readonly film: string;
  readonly choices: Read<FilmChoices>;
  readonly check: Read<CheckReport>;
  readonly steps: Atom.Writable<AsyncResult.AsyncResult<Steps, LabFailure>, void>;
  readonly write: Atom.Writable<AsyncResult.AsyncResult<Wrote, LabFailure>, ChoiceAct>;
  readonly soundCheck: Atom.Writable<AsyncResult.AsyncResult<SoundCheck, LabFailure>, void>;
}

const FilmBody = (
  props: ParentProps<{
    readonly atoms: FilmAtoms;
    readonly first: FilmChoices;
    readonly actor: SyncActor;
  }>,
) => {
  const film = props.atoms.film;
  // The choices as first read seed the body once; each later answer updates `choices`.
  const first = untrack(() => props.first);
  const syncAtom = ActorAtom.make(props.actor);
  const sync = useAtomValue(() => syncAtom);
  const send = useAtomSet(() => syncAtom);
  const choicesResult = useAtomValue(() => props.atoms.choices);
  const refreshChoices = useAtomRefresh(() => props.atoms.choices);
  const check = useAtomValue(() => props.atoms.check);
  const stepsResult = useAtomValue(() => props.atoms.steps);
  const readSteps = useAtomSet(() => props.atoms.steps);
  const wrote = useAtomValue(() => props.atoms.write);
  const write = useAtomSet(() => props.atoms.write, { mode: 'promiseExit' });
  const soundCheck = useAtomValue(() => props.atoms.soundCheck);
  const runSoundCheck = useAtomSet(() => props.atoms.soundCheck);

  // The choices as last answered: the first read, a read again after an undo or a redo, or a write's answer.
  const [choices, setChoices] = createSignal(first);
  createEffect(choicesResult, (result) => {
    if (result.waiting) return;
    Option.map(AsyncResult.value(result), setChoices);
  });
  const [answered, setAnswered] = createSignal(Option.none<ReadonlyArray<CheckLine>>());
  const findings = createMemo(() =>
    Option.orElse(answered(), () =>
      Option.map(AsyncResult.value(check()), (report) => report.findings),
    ),
  );
  const steps = createMemo(() =>
    Option.orElse(AsyncResult.value(stepsResult()), () => AsyncResult.value(check())),
  );
  // Each source write bumps the version: every mix is asked for again, mixed from the source as it now stands.
  const [version, setVersion] = createSignal(0);
  createEffect(wrote, (result) => {
    if (!AsyncResult.isSuccess(result) || result.waiting) return;
    const done = result.value;
    Option.map(done.choices, setChoices);
    Option.map(done.findings, (f) => setAnswered(Option.some(f)));
    if (!writesSource(done.act)) return;
    setVersion((v) => v + 1);
    readSteps();
    // An undo or a redo answers no choices: they are read again.
    if (Option.isNone(done.choices)) refreshChoices();
    // A pick or a knob changes the mix: the sound check hears it again.
    if (changesSound(done.act)) runSoundCheck();
  });

  const [pictureRef, setPictureRef] = createSignal(
    Option.map(Option.fromUndefinedOr(first.pictures[0]), (p) => p.ref),
  );
  const picture = createMemo(() =>
    Option.flatMap(pictureRef(), (ref) =>
      Option.fromUndefinedOr(choices().pictures.find((p) => p.ref === ref)),
    ),
  );
  const [heard, setHeard] = createSignal<Heard>(firstHeard(first));
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
    findings,
    steps,
    wrote,
    write: (act) => write(act).then(Exit.isSuccess),
    soundCheck,
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

/** A film's choices, its check, its writes and its player, around `children`, once its choices are read. */
export const FilmProvider = (props: ParentProps<{ readonly film: string }>) => {
  const { meta } = useReview();
  const film = props.film;
  const atoms: FilmAtoms = {
    film,
    choices: meta.runtime.atom(OptionsApi.use((api) => api.choices(film))),
    check: meta.runtime.atom(OptionsApi.use((api) => api.check(film))),
    steps: meta.runtime.fn(() => OptionsApi.use((api) => api.steps(film))),
    write: meta.runtime.fn((act: ChoiceAct) => OptionsApi.use((api) => api.write(film, act))),
    soundCheck: meta.runtime.fn(() => OptionsApi.use((api) => api.soundCheck(film))),
  };
  const actor = meta.runtime.atom(Machine.scoped(spawnSync(PICTURE, 0)));
  const first = useAtomValue(() => atoms.choices);
  // The page opens on the choices as first read; a later read (after a write) updates them in place.
  const [opened, setOpened] = createSignal(Option.none<FilmChoices>());
  createEffect(first, (result) => {
    if (Option.isSome(untrack(opened))) return;
    setOpened(AsyncResult.value(result));
  });
  return (
    <Loaded value={opened()} result={first()} reading={`Reading ${film}'s choices…`}>
      {(choices) => (
        <Loading>
          <FilmReady atoms={atoms} first={choices()} actor={actor}>
            {props.children}
          </FilmReady>
        </Loading>
      )}
    </Loaded>
  );
};
