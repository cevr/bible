// One film's choices on the review page. `<FilmProvider>` holds the film's
// choice points and its check (read once from the film's routes, then as
// each write answers them: a source write answers the choices it leaves and
// the check after it, a say the choices; only an undo or a redo reads the
// choices again, and each source write the steps Undo and Redo offer; the
// answers land in any order, and the choices shown are the newest asked's), the
// writes (a verb on a variant, a knob, a say on a variant, an undo or a
// redo: each control's its own, `useAct`, so one sent while another is in
// flight cancels nothing), the sound check run after each write that changes what the film
// plays (`film check --sound`: dead air, balance against the picked score),
// and the synced player: the film's newest render
// (its own sound muted) on the clock, and the sound heard over it, one
// `<audio>` of the film's whole mix with a variant in place (a score option,
// a take). Choosing what is heard swaps that one `<audio>`; it joins the
// clock where it stands.

import { useAtomSet, useAtomSuspense, useAtomValue } from '@bible/atom-solid';
import { Loading, Show } from '@solidjs/web';
import { Data, Effect, Exit, Match, Option } from 'effect';
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
import { Place, UrlState } from '@bible/url-state';
import * as UrlAtom from '@bible/url-state/atom';
import { OWN_SOUND, Places, type Steps, choiceMixUrl } from '../../../core/api.ts';
import { type Host, addressOn, onTraverse } from '../../../browser/host.ts';
import { keptTime } from '../place.ts';
import type { FilmChoices, SoundCheck } from '../../../core/choice.ts';
import type { ReviewVideo } from '../../../core/review.ts';
import type { CheckLine, CheckReport } from '../../../core/schema.ts';
import type { LabFailure } from '../../api.ts';
import { type Asks, type Landed, newestAsked } from '../asked.ts';
import { useReview } from '../context.tsx';
import { Loaded, type WriteStatus, useWrite, writeStatus } from '../loaded.tsx';
import { type SyncActor, SyncEvent, type SyncState, spawnSync } from '../machine.ts';
import { type SyncDriver, playerKeys, makeSync, playerEvent } from '../sync.ts';
import { type ChoiceAct, OptionsApi, type Wrote, changesSound, writesSource } from './api.ts';

/** The player's clock: the film's render, its own sound muted unless it is the one heard. */
export const PICTURE = 'picture';

/** What plays over the picture: its own sound, or the mix with one variant of a point in place. */
export type Playing = Data.TaggedEnum<{
  Own: {};
  InPlace: { readonly point: string; readonly variant: string };
}>;
export const Playing = Data.taggedEnum<Playing>();

/** The URL of the mix `playing` names, at the film's `version` (none for the picture's own sound). */
const mixOf = (film: string, playing: Playing, version: number): Option.Option<string> =>
  Match.value(playing).pipe(
    Match.tagsExhaustive({
      Own: () => Option.none<string>(),
      InPlace: (h) => Option.some(`${choiceMixUrl(film, h.point, h.variant)}&v=${version}`),
    }),
  );

/** The player's id for what is heard: the picture, or the mix's URL. */
const trackOf = (film: string, playing: Playing, version: number): string =>
  Option.getOrElse(mixOf(film, playing, version), () => PICTURE);

/** Whether a variant is heard in the film's mix. */
const inPlace = (media: FilmChoices['points'][number]['variants'][number]['media']) =>
  media._tag === 'Heard' && media.inPlace;

/** What plays first: the score option the film plays, when it is heard; else the first that is. */
const firstPlaying = (choices: FilmChoices): Playing =>
  Option.getOrElse(
    Option.flatMap(
      Option.fromUndefinedOr(choices.points.find((p) => p.kind === 'score')),
      (score) => {
        const heard = score.variants.filter((v) => inPlace(v.media));
        return Option.map(
          Option.orElse(Option.fromUndefinedOr(heard.find((v) => v.picked)), () =>
            Option.fromUndefinedOr(heard[0]),
          ),
          (v): Playing => Playing.InPlace({ point: score.id, variant: v.id }),
        );
      },
    ),
    (): Playing => Playing.Own(),
  );

/** The film player's keys in the URL of its choices or its project. */
interface Heard {
  readonly heard: string;
  readonly variant: string;
  readonly picture: string;
}

const NOTHING_HEARD: Heard = { heard: '', variant: '', picture: '' };

const choicesPlace = UrlAtom.place(Places.choices);
const projectPlace = UrlAtom.place(Places.project);

/** What `heard` names playing over the picture; `fallback` when it names nothing. */
const playingOf = (heard: Heard, fallback: Playing): Playing =>
  Match.value(heard.heard).pipe(
    Match.when('', () => fallback),
    Match.when(OWN_SOUND, () => Playing.Own()),
    Match.orElse((point) => Playing.InPlace({ point, variant: heard.variant })),
  );

/** The `?heard= &variant=` that name `playing`. */
const heardOf = (playing: Playing): Pick<Heard, 'heard' | 'variant'> =>
  Playing.$match(playing, {
    Own: () => ({ heard: OWN_SOUND, variant: '' }),
    InPlace: (p) => ({ heard: p.point, variant: p.variant }),
  });

/** The value of the choices' or the project's place, as the film's player keeps it. */
interface PlayerValue {
  readonly query: Heard;
  readonly hash: { readonly t: Option.Option<number> };
}

/**
 * Change the URL of the page the film's player is on (its choices or its
 * project) by `f`: the sound and the picture replace this entry, and the
 * time follows the playhead at most every quarter second.
 */
const keepOn =
  (host: Host) =>
  (f: <V extends PlayerValue>(value: V) => V): void =>
    Effect.runSyncWith(host)(
      Effect.andThen(UrlState.update(Places.choices, f), UrlState.update(Places.project, f)),
    );

/** Whether two `Playing`s are the same sound. */
export const samePlaying = (a: Playing, b: Playing): boolean =>
  trackOf('', a, 0) === trackOf('', b, 0);

/** What a film's write answers that the page shows, each in the order asked. */
type FilmOrder = 'choices' | 'findings';

interface FilmContextValue {
  readonly film: string;
  readonly choices: Accessor<FilmChoices>;
  /** Whether the choices are being read again (after an undo or a redo). */
  readonly reading: Accessor<boolean>;
  /** The film's static check: as first read, then as the last source write answered it. */
  readonly findings: Accessor<Option.Option<ReadonlyArray<CheckLine>>>;
  /** What Undo and Redo would do now. */
  readonly steps: Accessor<Option.Option<Steps>>;
  /** The film's writes as the status line says them: writing while any is in flight, else the last. */
  readonly wrote: Accessor<AsyncResult.AsyncResult<Wrote, LabFailure>>;
  /** How many source writes have been answered: a mix, or a project, is read again on each. */
  readonly version: Accessor<number>;
  /** Show what a control's write of `act` answers, in the order asked: whether it was answered. */
  readonly written: (act: ChoiceAct, landed: Landed<Wrote, LabFailure, FilmOrder>) => boolean;
  readonly status: WriteStatus<Wrote>;
  /** What the film's writes answer, each in the order asked: the choices and the check. */
  readonly orders: Readonly<Record<FilmOrder, Asks>>;
  /** The sound check after the last pick or knob (initial until one). */
  readonly soundCheck: Accessor<AsyncResult.AsyncResult<SoundCheck, LabFailure>>;
  /** The render the sound plays over, when the film has one. */
  readonly picture: Accessor<Option.Option<ReviewVideo>>;
  readonly choosePicture: (ref: string) => void;
  readonly playing: Accessor<Playing>;
  readonly hear: (playing: Playing) => void;
  /** The mix heard now, when it is not the picture's own. */
  readonly mix: Accessor<Option.Option<string>>;
  readonly sync: Accessor<SyncState>;
  readonly send: (event: SyncEvent) => void;
  readonly driver: SyncDriver;
}

const FilmContext = createContext<FilmContextValue>();

/** A film's context: only inside `<FilmProvider>`. */
export const useFilm = (): FilmContextValue => useContext(FilmContext);

/** A control's write of the film's acts: whether its own is in flight, and the write. */
interface ActWrite {
  readonly waiting: Accessor<boolean>;
  /** Write `act`: whether it was answered (a say's box empties only then); refused while its own is in flight. */
  readonly write: (act: ChoiceAct) => Promise<boolean>;
}

/** A control's own write of the film's acts (`useWrite`): made once, as the control is made. */
export const useAct = (): ActWrite => {
  const { film, written, status, orders } = useFilm();
  const own = useWrite(
    (act: ChoiceAct) => OptionsApi.use((api) => api.write(film, act)),
    status,
    orders,
  );
  return {
    waiting: own.waiting,
    write: (act) =>
      own
        .write(act)
        .then((landed) =>
          Option.match(landed, { onNone: () => false, onSome: (l) => written(act, l) }),
        ),
  };
};

type Read<A> = Atom.Atom<AsyncResult.AsyncResult<A, LabFailure>>;

interface FilmAtoms {
  readonly film: string;
  readonly choices: Read<FilmChoices>;
  /** The choices read again (after an undo or a redo). */
  readonly again: Atom.Writable<AsyncResult.AsyncResult<FilmChoices, LabFailure>, void>;
  readonly check: Read<CheckReport>;
  readonly steps: Atom.Writable<AsyncResult.AsyncResult<Steps, LabFailure>, void>;
  readonly soundCheck: Atom.Writable<AsyncResult.AsyncResult<SoundCheck, LabFailure>, void>;
}

const FilmBody = (
  props: ParentProps<{
    readonly atoms: FilmAtoms;
    readonly first: FilmChoices;
    readonly actor: SyncActor;
  }>,
) => {
  const { meta } = useReview();
  const film = props.atoms.film;
  // The choices as first read seed the body once; each later answer updates `choices`.
  const first = untrack(() => props.first);
  const syncAtom = ActorAtom.make(props.actor);
  const sync = useAtomValue(() => syncAtom);
  const send = useAtomSet(() => syncAtom);
  const again = useAtomValue(() => props.atoms.again);
  const askAgain = useAtomSet(() => props.atoms.again, { mode: 'promiseExit' });
  const check = useAtomValue(() => props.atoms.check);
  const stepsResult = useAtomValue(() => props.atoms.steps);
  const readSteps = useAtomSet(() => props.atoms.steps);
  const status = writeStatus<Wrote>();
  const soundCheck = useAtomValue(() => props.atoms.soundCheck);
  const runSoundCheck = useAtomSet(() => props.atoms.soundCheck);

  // The choices as the newest asked answered them (`asked.ts`): the first read, a
  // read again after an undo or a redo, or a write's answer.
  const [choices, setChoices] = createSignal(first);
  const asks = newestAsked();
  const readAgain = () => {
    const ask = asks.ask();
    void askAgain().then((exit) => {
      if (Exit.isSuccess(exit)) ask.answer(() => setChoices(exit.value));
    });
  };
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
  // The check as the newest write asked that answers one (a source write, an undo, a redo).
  const orders = { choices: asks, findings: newestAsked() };
  /**
   * A write of `act` landed: show the choices it answers unless a newer
   * ask's are shown, and the check after it unless a newer write's check is;
   * one that answers no choices (an undo, a redo) or was overtaken reads them
   * again. Every successful source write bumps the version and reads the
   * steps, and a pick or a knob runs the sound check.
   */
  const written = (act: ChoiceAct, landed: Landed<Wrote, LabFailure, FilmOrder>) => {
    if (!landed.succeeded) return false;
    const shown = landed.show('choices', (done) => done.choices, setChoices);
    if (!shown || landed.overtaken('choices')) readAgain();
    landed.show(
      'findings',
      (done) => done.findings,
      (f) => setAnswered(Option.some(f)),
    );
    if (writesSource(act)) {
      setVersion((v) => v + 1);
      readSteps();
      if (changesSound(act)) runSoundCheck();
    }
    return true;
  };

  // What plays is the URL's (`?heard= &variant= &picture= #t=`), so a link
  // opens the player as it was; none named is the film's first picture and
  // its first score in place.
  const onChoices = useAtomValue(() => choicesPlace);
  const onProject = useAtomValue(() => projectPlace);
  const heard = createMemo((): Heard =>
    Option.getOrElse(
      Option.orElse(
        Option.map(onChoices(), (v) => v.query),
        () => Option.map(onProject(), (v) => v.query),
      ),
      () => NOTHING_HEARD,
    ),
  );
  const picture = createMemo(() =>
    Option.fromUndefinedOr(
      Match.value(heard().picture).pipe(
        Match.when('', () => choices().pictures[0]),
        Match.orElse((ref) => choices().pictures.find((p) => p.ref === ref)),
      ),
    ),
  );
  const playing = createMemo(() => playingOf(heard(), firstPlaying(first)));
  const keep = keepOn(meta.host);
  createEffect(
    () => keptTime(sync().t, 0),
    (t) => keep((v) => ({ ...v, hash: { t } })),
  );
  // Back or Forward landing on this film's entry moves the player to the time it keeps.
  onCleanup(
    onTraverse(meta.host, (href) =>
      Option.map(keptAt(film, href), (t) =>
        send(SyncEvent.Landed({ t: Option.getOrElse(t, () => 0) })),
      ),
    ),
  );
  const mix = createMemo(() => mixOf(film, playing(), version()));
  createEffect(
    () => trackOf(film, playing(), version()),
    (id) => send(SyncEvent.HeardChosen({ id })),
  );

  const driver = makeSync(PICTURE, send, meta.host);
  onCleanup(driver.stop);
  createEffect(sync, (s) => driver.apply(s));

  // The player's keys, once there is a picture to play.
  onCleanup(
    Effect.runCallbackWith(meta.host)(
      playerKeys((key) => {
        if (Option.isNone(picture())) return false;
        send(playerEvent(key));
        return true;
      }),
    ),
  );

  const value: FilmContextValue = {
    film,
    choices,
    reading: () => again().waiting,
    findings,
    steps,
    wrote: status.status,
    version,
    written,
    orders,
    status,
    soundCheck,
    picture,
    choosePicture: (ref) => {
      send(SyncEvent.PausePressed);
      keep((v) => ({ ...v, query: { ...v.query, picture: ref } }));
    },
    playing,
    hear: (next) => keep((v) => ({ ...v, query: { ...v.query, ...heardOf(next) } })),
    mix,
    sync,
    send,
    driver,
  };
  return <FilmContext value={value}>{props.children}</FilmContext>;
};

/** The time `film`'s choices or project entry at `href` keeps (`#t=`); none off them. */
const keptAt = (film: string, href: string): Option.Option<Option.Option<number>> =>
  Option.map(
    Option.filter(
      Option.orElse(Place.decode(Places.choices, href), () => Place.decode(Places.project, href)),
      (v) => v.path.film === film,
    ),
    (v) => v.hash.t,
  );

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
    again: meta.runtime.fn(() => OptionsApi.use((api) => api.choices(film))),
    check: meta.runtime.atom(OptionsApi.use((api) => api.check(film))),
    steps: meta.runtime.fn(() => OptionsApi.use((api) => api.steps(film))),
    soundCheck: meta.runtime.fn(() => OptionsApi.use((api) => api.soundCheck(film))),
  };
  // The player opens where the URL's `#t=` says, else at the start.
  const at = Option.getOrElse(Option.flatten(keptAt(film, addressOn(meta.host).href())), () => 0);
  const actor = meta.runtime.atom(Machine.scoped(spawnSync(PICTURE, 0, at)));
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
