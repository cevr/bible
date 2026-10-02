// A film's project page (`?project=<film>`): the film by its address tree
// (`core/catalogue.ts`'s Project, read in a fresh `film project --json` on
// the server), film → acts → scenes → layers, with the same card, the same
// say (approve, withdraw, comment) and the same words at every level. The
// film's own comments, an approve of its current scenes and a withdraw of
// its approvals; each act (its comments, the same approve and withdraw of
// its scenes); each scene's render as a
// render card (`choice.tsx`): the video this checkout's catalogue records
// for it (`ProjectView.videos`), its state (current, stale by its sources or
// by the film's sound alone, missing with the command that renders it), its
// approval and its comments. Each choice point sits once, at the narrowest
// part that holds every scene it plays in (a scene, an act, else the film),
// folded under that part; a scene lists the layers placed elsewhere that
// play in it as links to their cards. Every say answers the project as it
// leaves it; a source write reads it again (a pick changes the film's
// sound, a kept voice a scene's key), the film marked reading while it
// does. Answers land in any order: the page shows the newest asked. The page
// updates in place: a playing clip plays on and a half-typed comment stays.

import { useAtomSet, useAtomValue } from '@bible/atom-solid';
import { For, Show } from '@solidjs/web';
import { Array as Arr, Exit, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { type Accessor, createEffect, createMemo, createSignal } from 'solid-js';
import { type Address, type PartAddress, addressKey, sceneAddress } from '../../../core/address.ts';
import type { ProjectView } from '../../../core/api.ts';
import {
  type ProjectAct as Act,
  type ProjectScene,
  renderVersion,
} from '../../../core/catalogue.ts';
import { type ChoicePoint, type VariantMedia, pointHead } from '../../../core/choice.ts';
import type { LabFailure } from '../../api.ts';
import { type Ask, newestAsked } from '../asked.ts';
import { useReview } from '../context.tsx';
import { pressed } from '../format.ts';
import { Loaded, statusText, useWrite, writeStatus } from '../loaded.tsx';
import { ReviewPlace, searchOf } from '../place.ts';
import { OptionsApi, type ProjectSay } from './api.ts';
import { ChoiceCard, Comments, type Sayer, SayBox } from './choice.tsx';
import { FilmProvider, useFilm } from './context.tsx';
import { Player, WriteBar } from './section.tsx';

const FILM: PartAddress = { _tag: 'Film' };

/**
 * Where `point` sits on the page: the scene it plays in, the act that holds
 * every scene it plays in, else the film (a short's point too).
 */
const placeOf = (point: ChoicePoint, acts: ReadonlyArray<Act>): Address =>
  Option.match(point.address, {
    onNone: () => FILM,
    onSome: (at) =>
      Match.valueTags(at, {
        Film: (): Address => at,
        Act: (): Address => at,
        Short: (): Address => FILM,
        Scenes: ({ ids }): Address => {
          if (ids.length === 1) return at;
          return Option.match(
            Arr.findFirst(acts, (act) => ids.every((id) => act.scenes.includes(id))),
            { onNone: () => FILM, onSome: (act) => ({ _tag: 'Act', act: act.name }) },
          );
        },
      }),
  });

/** The points placed at `address`. */
const placedAt = (points: ReadonlyArray<ChoicePoint>, acts: ReadonlyArray<Act>, address: Address) =>
  points.filter((p) => addressKey(placeOf(p, acts)) === addressKey(address));

/** The points that play in `scene` but sit elsewhere (a layer across scenes). */
const playingIn = (points: ReadonlyArray<ChoicePoint>, acts: ReadonlyArray<Act>, scene: string) =>
  points.filter(
    (p) =>
      Option.exists(p.address, (at) => at._tag === 'Scenes' && at.ids.includes(scene)) &&
      addressKey(placeOf(p, acts)) !== addressKey(sceneAddress(scene)),
  );

/** What a scene's render card shows: the project's say on it, its state, and the video recorded for it. */
const renderPoint = (film: string, variant: string, scene: ProjectScene, view: ProjectView) => {
  const address = sceneAddress(scene.scene);
  const media = Option.match(Option.fromUndefinedOr(view.videos[scene.scene]), {
    onNone: (): VariantMedia => ({ _tag: 'Unseen' }),
    onSome: (video): VariantMedia => ({ _tag: 'Seen', video }),
  });
  const point: ChoicePoint = {
    ...pointHead({ _tag: 'Render', address }),
    address: Option.some(address),
    title: `scene ${scene.scene}`,
    lines: [],
    start: 0,
    moments: Option.none(),
    marks: [],
    knob: Option.none(),
    variants: [
      {
        id: variant,
        label: variant,
        lines: Arr.filter(
          [`not rendered yet: film project render ${film} --scene ${scene.scene}`],
          () => scene.state === 'missing',
        ),
        state: scene.state,
        staleBy: scene.staleBy,
        picked: false,
        verbs: [],
        media,
        key: Option.match(scene.render, { onNone: () => scene.key, onSome: renderVersion }),
        approval: scene.approval,
        comments: scene.comments,
        notes: Option.none(),
      },
    ],
  };
  return point;
};

/** One control's say of the project: whether its own is in flight, and the say, answering whether it was said. */
interface ProjectSayer {
  readonly waiting: Accessor<boolean>;
  readonly say: (said: ProjectSay) => Promise<boolean>;
}

interface ProjectValue {
  readonly film: string;
  readonly view: Accessor<ProjectView>;
  /** A control's own say of the project (`useWrite`): made once, as the control is made. */
  readonly useSay: () => ProjectSayer;
  /** Whether the project is being read again. */
  readonly reading: () => boolean;
}

/** The says of the project at `address`: a render card's, an act's, the film's. */
const sayerAt = (at: ProjectValue, address: () => PartAddress): Sayer => ({
  use: () => {
    const saying = at.useSay();
    return { waiting: saying.waiting, say: (_, say) => saying.say({ address: address(), say }) };
  },
});

/** `n` choices, said as a fold's summary says them. */
const choicesText = (n: number) =>
  Match.value(n).pipe(
    Match.when(1, () => '1 choice'),
    Match.orElse(() => `${n} choices`),
  );

/** Choice cards folded under a part: open at the film, closed below it. */
const Layers = (props: { readonly points: ReadonlyArray<ChoicePoint>; readonly open: boolean }) => (
  <Show when={props.points.length > 0}>
    <details class="rv-layers" open={props.open}>
      <summary class="rv-hint" data-layers={String(props.points.length)}>
        {choicesText(props.points.length)}
      </summary>
      <For each={props.points} keyed={(p) => p.id}>
        {(point) => <ChoiceCard point={point()} />}
      </For>
    </details>
  </Show>
);

/** Open the card of `point` where it sits, and bring it into view. */
const reveal = (point: string) =>
  Option.map(Option.fromNullishOr(document.getElementById(`point-${point}`)), (card) => {
    Option.map(Option.fromNullishOr(card.closest('details')), (d) => {
      d.open = true;
    });
    card.scrollIntoView({ block: 'center' });
  });

/** The layers that play in a scene but sit elsewhere, each a link to its card. */
const PlaysHere = (props: { readonly points: ReadonlyArray<ChoicePoint> }) => (
  <Show when={props.points.length > 0}>
    <div class="rv-row rv-plays">
      <span class="rv-hint">Also plays here:</span>
      <For each={props.points} keyed={(p) => p.id}>
        {(point) => (
          <a
            class="rv-chip"
            href={`#point-${point().id}`}
            data-plays={point().id}
            onClick={(e: MouseEvent) => {
              e.preventDefault();
              reveal(point().id);
            }}
          >
            {point().title}
          </a>
        )}
      </For>
    </div>
  </Show>
);

/** The link to a scene's Versions (its renders side by side), when the review's roots hold its project folder. */
const Compare = (props: { readonly folder: Option.Option<string>; readonly point: string }) => {
  const { actions } = useReview();
  return (
    <Show when={Option.getOrUndefined(props.folder)}>
      {(folder) => {
        const place = () => ReviewPlace.Set({ folder: folder(), point: props.point });
        return (
          <a
            class="rv-hint"
            data-compare={props.point}
            href={`${location.pathname}${searchOf(place())}`}
            onClick={(e: MouseEvent) => {
              e.preventDefault();
              actions.go(place());
            }}
          >
            Versions
          </a>
        );
      }}
    </Show>
  );
};

const SceneRow = (props: { readonly at: ProjectValue; readonly scene: ProjectScene }) => {
  const { choices } = useFilm();
  const address = (): PartAddress => ({ _tag: 'Scenes', ids: [props.scene.scene] });
  const acts = () => props.at.view().project.acts;
  const point = createMemo(() =>
    renderPoint(props.at.film, props.at.view().project.variant, props.scene, props.at.view()),
  );
  return (
    <div class="rv-scene" data-scene={props.scene.scene} data-state={props.scene.state}>
      <ChoiceCard point={point()} sayer={sayerAt(props.at, address)} />
      <Show when={Option.isSome(props.scene.render)}>
        <Compare folder={props.at.view().folder} point={point().id} />
      </Show>
      <PlaysHere points={playingIn(choices().points, acts(), props.scene.scene)} />
      <Layers points={placedAt(choices().points, acts(), address())} open={false} />
    </div>
  );
};

/** A part's counts: its scenes, how many are current, how many approved. */
const countsOf = (scenes: ReadonlyArray<ProjectScene>) =>
  `${scenes.length} scenes · ${scenes.filter((s) => s.state === 'current').length} current · ${
    scenes.filter((s) => s.approval === 'approved').length
  } approved`;

/** What a part's approval buttons say: an act's, or the whole film's. */
const PART_WORDS = {
  act: { approve: "Approve the act's current scenes", withdraw: "Withdraw the act's approvals" },
  all: { approve: 'Approve all current', withdraw: 'Withdraw every approval' },
} as const;

/** Whether approving `scenes` would change one: a current render not yet approved as it is. */
const leftToApprove = (scenes: ReadonlyArray<ProjectScene>): boolean =>
  scenes.some((s) => s.state === 'current' && s.approval !== 'approved');

/**
 * A part's approvals, each in one say: approve every scene of it whose
 * render is current, while one is left to approve; withdraw every approval
 * of its scenes (an earlier version's too), offered while one has one.
 */
const PartApproval = (props: {
  readonly at: ProjectValue;
  readonly address: PartAddress;
  readonly scenes: ReadonlyArray<ProjectScene>;
  readonly part: keyof typeof PART_WORDS;
}) => {
  const approving = props.at.useSay();
  return (
    <>
      <button
        type="button"
        class="rv-chip"
        data-act={`approve-${props.part}`}
        disabled={!leftToApprove(props.scenes) || approving.waiting()}
        onClick={() => approving.say({ address: props.address, say: { _tag: 'Approve' } })}
      >
        {PART_WORDS[props.part].approve}
      </button>
      <Show when={props.scenes.some((s) => s.approval !== 'none')}>
        <PartWithdraw at={props.at} address={props.address} part={props.part} />
      </Show>
    </>
  );
};

/** A part's withdraw of every approval of its scenes, waiting while its own is in flight. */
const PartWithdraw = (props: {
  readonly at: ProjectValue;
  readonly address: PartAddress;
  readonly part: keyof typeof PART_WORDS;
}) => {
  const withdrawing = props.at.useSay();
  return (
    <button
      type="button"
      class="rv-chip"
      data-act={`withdraw-${props.part}`}
      disabled={withdrawing.waiting()}
      onClick={() => withdrawing.say({ address: props.address, say: { _tag: 'Withdraw' } })}
    >
      {PART_WORDS[props.part].withdraw}
    </button>
  );
};

/** A part's comment box, waiting while its own say is in flight. */
const PartComment = (props: { readonly at: ProjectValue; readonly address: PartAddress }) => {
  const commenting = props.at.useSay();
  return (
    <SayBox
      disabled={commenting.waiting()}
      say={(text) => commenting.say({ address: props.address, say: { _tag: 'Comment', text } })}
    />
  );
};

const Scenes = (props: {
  readonly at: ProjectValue;
  readonly scenes: ReadonlyArray<ProjectScene>;
}) => (
  <div class="rv-grid rv-wide">
    <For each={props.scenes} keyed={(s) => s.scene}>
      {(scene) => <SceneRow at={props.at} scene={scene()} />}
    </For>
  </div>
);

const ActBlock = (props: { readonly at: ProjectValue; readonly act: Act }) => {
  const { choices } = useFilm();
  const address = (): PartAddress => ({ _tag: 'Act', act: props.act.name });
  const scenes = () =>
    props.at.view().project.scenes.filter((s) => props.act.scenes.includes(s.scene));
  return (
    <section class="rv-act" data-act-name={props.act.name}>
      <h2 class="rv-h">
        {props.act.name} <small>{countsOf(scenes())}</small>
      </h2>
      <div class="rv-row">
        <PartApproval at={props.at} address={address()} scenes={scenes()} part="act" />
      </div>
      <Comments comments={props.act.comments} />
      <PartComment at={props.at} address={address()} />
      <Layers
        points={placedAt(choices().points, props.at.view().project.acts, address())}
        open={false}
      />
      <Scenes at={props.at} scenes={scenes()} />
    </section>
  );
};

const ProjectBody = (props: { readonly at: ProjectValue }) => {
  const { choices } = useFilm();
  const project = () => props.at.view().project;
  const inActs = () => new Set(project().acts.flatMap((a) => a.scenes));
  const loose = () => project().scenes.filter((s) => !inActs().has(s.scene));
  return (
    <>
      <section class="rv-film" data-film={props.at.film} data-reading={pressed(props.at.reading())}>
        <div class="rv-row">
          <PartApproval at={props.at} address={FILM} scenes={project().scenes} part="all" />
          <span class="rv-hint" data-counts="">
            {countsOf(project().scenes)} · variant {project().variant}
          </span>
        </div>
        <Comments comments={project().comments} />
        <PartComment at={props.at} address={FILM} />
        <Layers points={placedAt(choices().points, project().acts, FILM)} open={true} />
      </section>
      <For each={project().acts} keyed={(a) => a.name}>
        {(act) => <ActBlock at={props.at} act={act()} />}
      </For>
      <Show when={loose().length > 0}>
        <Scenes at={props.at} scenes={loose()} />
      </Show>
    </>
  );
};

/** Whether a say was refused for the state its scenes are in now (one drawn again since the page read it). */
const staleSinceRead = (failure: Option.Option<LabFailure>): boolean =>
  Option.exists(failure, (e) => e._tag === 'VerbRefused');

/**
 * The project read, read again, and said: the page shows the answer to the
 * newest of them asked (`asked.ts`), kept in place. A say overtaken by a
 * read asked after it reads the project again: that read may not hold it.
 * So does a say refused for its scenes' state: the cards then say why.
 */
const ProjectReady = (props: { readonly film: string }) => {
  const { meta } = useReview();
  const { version } = useFilm();
  const film = props.film;
  // The page reads the `main` variant's project: no URL names another variant yet.
  const variant = Option.none<string>();
  const readAtom = meta.runtime.atom(OptionsApi.use((api) => api.project(film, variant)));
  const againAtom = meta.runtime.fn(() => OptionsApi.use((api) => api.project(film, variant)));
  const read = useAtomValue(() => readAtom);
  const again = useAtomValue(() => againAtom);
  const askAgain = useAtomSet(() => againAtom, { mode: 'promiseExit' });
  const status = writeStatus<ProjectView>();
  const said = status.status;
  const [shown, setShown] = createSignal(Option.none<ProjectView>());
  const asks = newestAsked();
  /** Show `exit`'s project when it answered and `ask` is still the newest: whether it answered. */
  const answered = (ask: Ask, exit: Exit.Exit<ProjectView, LabFailure>): boolean => {
    if (Exit.isFailure(exit)) return false;
    ask.answer(() => setShown(Option.some(exit.value)));
    return true;
  };
  const first = asks.ask();
  createEffect(read, (r) => {
    if (r.waiting) return;
    Option.map(AsyncResult.value(r), (v) => first.answer(() => setShown(Option.some(v))));
  });
  const readAgain = () => {
    const ask = asks.ask();
    void askAgain().then((exit) => answered(ask, exit));
  };
  const useSay = (): ProjectSayer => {
    const own = useWrite(
      (s: ProjectSay) => OptionsApi.use((api) => api.sayOfProject(film, variant, s)),
      status,
      { project: asks },
    );
    return {
      waiting: own.waiting,
      say: (s) =>
        own.write(s).then((landed) =>
          Option.match(landed, {
            onNone: () => false,
            onSome: (l) => {
              l.show('project', Option.some, (v) => setShown(Option.some(v)));
              if ((l.succeeded && l.overtaken('project')) || staleSinceRead(l.failure)) readAgain();
              return l.succeeded;
            },
          }),
        ),
    };
  };
  // A source write changes the film (a pick its sound, a kept voice a scene): its scenes are read again.
  createEffect(version, (v) => {
    if (v > 0) readAgain();
  });
  const at = (view: Accessor<ProjectView>): ProjectValue => ({
    film,
    view,
    useSay,
    reading: () => again().waiting,
  });
  return (
    <Loaded value={shown()} result={read()} reading={`Reading ${film}'s project…`}>
      {(view) => (
        <>
          <p
            class="rv-hint rv-status"
            data-said={pressed(AsyncResult.isSuccess(said()))}
            data-failed={pressed(AsyncResult.isFailure(said()))}
          >
            {statusText(said(), 'saying…', () => 'said')}
          </p>
          <ProjectBody at={at(view)} />
        </>
      )}
    </Loaded>
  );
};

/** A film's project by its address tree, with its choices placed where they belong. */
export const ProjectPage = (props: { readonly film: string }) => (
  <FilmProvider film={props.film}>
    <WriteBar />
    <Player />
    <ProjectReady film={props.film} />
  </FilmProvider>
);
