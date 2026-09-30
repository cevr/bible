// A film's project page (`?project=<film>`): the film by its address tree
// (`core/catalogue.ts`'s Project, read in a fresh `film project --json` on
// the server), film → acts → scenes → layers, with the same card, the same
// say (approve, withdraw, comment) and the same words at every level. The
// film's own comments and an approve of its current scenes; each act (its
// comments, an approve of its current scenes); each scene's render as a
// render card (`choice.tsx`): the video this checkout's catalogue records
// for it (`ProjectView.videos`), its state (current, stale by its sources or
// by the film's sound alone, missing with the command that renders it), its
// approval and its comments. Each choice point sits once, at the narrowest
// part that holds every scene it plays in (a scene, an act, else the film),
// folded under that part; a scene lists the layers placed elsewhere that
// play in it as links to their cards. Every say answers the project as it
// leaves it; a source write reads it again (a pick changes the film's
// sound, a kept voice a scene's key). The page updates in place: a playing
// clip plays on and a half-typed comment stays.

import { useAtomRefresh, useAtomSet, useAtomValue } from '@bible/atom-solid';
import { For, Show } from '@solidjs/web';
import { Array as Arr, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { type Accessor, createEffect, createMemo, createSignal } from 'solid-js';
import { type Address, type PartAddress, addressKey, sceneAddress } from '../../../core/address.ts';
import type { ProjectView } from '../../../core/api.ts';
import {
  type ProjectAct as Act,
  type ProjectScene,
  renderPointId,
  renderVersion,
} from '../../../core/catalogue.ts';
import type { ChoicePoint, VariantMedia } from '../../../core/choice.ts';
import { useReview } from '../context.tsx';
import { pressed } from '../format.ts';
import { Loaded, statusText } from '../loaded.tsx';
import { ReviewPlace, searchOf } from '../place.ts';
import { OptionsApi, type ProjectSay, writesSource } from './api.ts';
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
    id: renderPointId(address),
    kind: 'render',
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

interface ProjectValue {
  readonly film: string;
  readonly view: Accessor<ProjectView>;
  readonly say: (said: ProjectSay) => void;
  readonly saying: () => boolean;
}

/** The says of the project at `address`: a render card's, an act's, the film's. */
const sayerAt = (at: ProjectValue, address: () => PartAddress): Sayer => ({
  say: (_, say) => at.say({ address: address(), say }),
  busy: at.saying,
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

/** The link to compare a scene's renders, when the review's roots hold its project folder. */
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
            compare its renders
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
      <ChoiceCard
        point={point()}
        sayer={sayerAt(props.at, address)}
        staleBy={() => props.scene.staleBy}
      />
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

/** A part's bulk approve: every scene of it whose render is current. */
const ApproveCurrent = (props: {
  readonly at: ProjectValue;
  readonly address: PartAddress;
  readonly scenes: ReadonlyArray<ProjectScene>;
  readonly act: string;
  readonly children: string;
}) => (
  <button
    type="button"
    class="rv-chip"
    data-act={props.act}
    disabled={props.scenes.every((s) => s.state !== 'current') || props.at.saying()}
    onClick={() => props.at.say({ address: props.address, say: { _tag: 'Approve' } })}
  >
    {props.children}
  </button>
);

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
        <ApproveCurrent at={props.at} address={address()} scenes={scenes()} act="approve-act">
          Approve the act's current scenes
        </ApproveCurrent>
      </div>
      <Comments comments={props.act.comments} />
      <SayBox
        disabled={props.at.saying()}
        say={(text) => props.at.say({ address: address(), say: { _tag: 'Comment', text } })}
      />
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
      <section class="rv-film" data-film={props.at.film}>
        <div class="rv-row">
          <ApproveCurrent at={props.at} address={FILM} scenes={project().scenes} act="approve-all">
            Approve all current
          </ApproveCurrent>
          <span class="rv-hint" data-counts="">
            {countsOf(project().scenes)} · variant {project().variant}
          </span>
        </div>
        <Comments comments={project().comments} />
        <SayBox
          disabled={props.at.saying()}
          say={(text) => props.at.say({ address: FILM, say: { _tag: 'Comment', text } })}
        />
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

/** The project read, the last say, and what the page shows: the newest of them, kept in place. */
const ProjectReady = (props: { readonly film: string }) => {
  const { meta } = useReview();
  const { wrote } = useFilm();
  const film = props.film;
  const variant = Option.none<string>();
  const readAtom = meta.runtime.atom(OptionsApi.use((api) => api.project(film, variant)));
  const sayAtom = meta.runtime.fn((said: ProjectSay) =>
    OptionsApi.use((api) => api.sayOfProject(film, variant, said)),
  );
  const read = useAtomValue(() => readAtom);
  const refresh = useAtomRefresh(() => readAtom);
  const said = useAtomValue(() => sayAtom);
  const say = useAtomSet(() => sayAtom);
  const [shown, setShown] = createSignal(Option.none<ProjectView>());
  createEffect(read, (r) => {
    if (r.waiting) return;
    Option.map(AsyncResult.value(r), (v) => setShown(Option.some(v)));
  });
  createEffect(said, (r) => {
    if (r.waiting) return;
    Option.map(AsyncResult.value(r), (v) => setShown(Option.some(v)));
  });
  // A source write changes the film (a pick its sound, a kept voice a scene): its scenes are read again.
  createEffect(wrote, (r) => {
    if (AsyncResult.isSuccess(r) && !r.waiting && writesSource(r.value.act)) refresh();
  });
  const at = (view: Accessor<ProjectView>): ProjectValue => ({
    film,
    view,
    say: (s) => say(s),
    saying: () => said().waiting,
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
