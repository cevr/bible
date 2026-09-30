// A film's project page (`?project=<film>`): the film by its address tree
// (`core/catalogue.ts`'s Project, read in a fresh `film project --json` on
// the server). The film's own comments, then each act (its comments, an
// approve for its current scenes) and its scenes; each scene with its render
// (from the review's index, the render set at its address), its state
// (current, stale, missing), its approval and its comments, an approve and a
// line to comment. "Approve all current" approves every scene whose render
// is current. The film's choice points (`choice.tsx`) sit at the address they
// belong to: the score and looks with the film, a take or a level with the
// scenes it plays in, a voice with its beat. Every say answers the project as
// it leaves it; a pick reads it again (a kept voice makes its scene stale).

import { useAtomRefresh, useAtomSet, useAtomValue } from '@bible/atom-solid';
import { For, Show } from '@solidjs/web';
import { Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { createEffect, createMemo, createSignal } from 'solid-js';
import { type Address, sceneAddress } from '../../../core/address.ts';
import {
  type Project,
  type ProjectAct as Act,
  type ProjectScene,
  renderPointId,
} from '../../../core/catalogue.ts';
import { type ChoicePoint, isAt, seenVariants } from '../../../core/choice.ts';
import type { ReviewIndex, ReviewVideo } from '../../../core/review.ts';
import { useReview } from '../context.tsx';
import { pressed, videoUrl } from '../format.ts';
import { ProjectAct, OptionsApi } from './api.ts';
import { ApproveButton, ChoiceCard, Comments, SayBox } from './choice.tsx';
import { FilmProvider, failedText, useFilm } from './context.tsx';
import { Player, WriteBar } from './section.tsx';

/** What a scene's state badge says of it. */
const SCENE_STATE = {
  current: 'current',
  stale: 'stale: its sources changed since it was rendered',
  missing: 'not rendered',
} as const;

/** A scene's render as the review serves it: the render set at its address in the film's folder. */
export const sceneVideo = (
  index: ReviewIndex,
  film: string,
  scene: string,
  variant: string,
): Option.Option<ReviewVideo> => {
  const point = renderPointId(sceneAddress(scene));
  return Option.firstSomeOf(
    index.folders
      .filter((f) => Option.contains(f.title, film))
      .flatMap((f) => f.sets.filter((s) => s.id === point))
      .map((set) =>
        Option.map(
          Option.fromUndefinedOr(seenVariants(set).find((v) => v.id === variant)),
          (v) => v.video,
        ),
      ),
  );
};

/** The points at `address`: a scene's include those of the layers playing in it. */
const pointsAt = (points: ReadonlyArray<ChoicePoint>, address: Address) =>
  points.filter((p) => isAt(p, address));

interface ProjectValue {
  readonly film: string;
  readonly project: Project;
  readonly say: (act: ProjectAct) => void;
  readonly saying: () => boolean;
}

const SceneRow = (props: { readonly at: ProjectValue; readonly scene: ProjectScene }) => {
  const { state } = useReview();
  const { choices } = useFilm();
  const scene = props.scene;
  const address = sceneAddress(scene.scene);
  const video = () =>
    Option.flatMap(AsyncResult.value(state.index()), (index) =>
      sceneVideo(index, props.at.film, scene.scene, props.at.project.variant),
    );
  const points = () => pointsAt(choices().points, address);
  return (
    <div class="rv-card rv-scene" data-scene={scene.scene} data-state={scene.state}>
      <div class="rv-cap">
        <span class="rv-name">{scene.scene}</span>
        <span class="rv-tag" data-state={scene.state}>
          {SCENE_STATE[scene.state]}
        </span>
        <span class="rv-badge" data-approval={scene.approval}>
          {Match.value(scene.approval).pipe(
            Match.when('approved', () => 'approved'),
            Match.when('stale', () => 'approved an earlier render'),
            Match.orElse(() => 'not approved'),
          )}
        </span>
      </div>
      <div class="rv-body">
        <Show when={Option.getOrUndefined(video())} keyed>
          {(v: ReviewVideo) => (
            <video controls preload="none" playsinline src={videoUrl(v, state.quality())} />
          )}
        </Show>
        <div class="rv-row">
          <ApproveButton
            approval={scene.approval}
            disabled={scene.state !== 'current' || props.at.saying()}
            approve={() => props.at.say(ProjectAct.Approve({ address }))}
          />
        </div>
        <Comments comments={scene.comments} />
        <Show when={scene.state !== 'missing'}>
          <SayBox say={(text) => props.at.say(ProjectAct.Comment({ address, text }))} />
        </Show>
        <For each={points()}>{(point) => <ChoiceCard point={point} />}</For>
      </div>
    </div>
  );
};

const ActBlock = (props: { readonly at: ProjectValue; readonly act: Act }) => {
  const { choices } = useFilm();
  const address: Address = { _tag: 'Act', act: props.act.name };
  const scenes = () => props.at.project.scenes.filter((s) => props.act.scenes.includes(s.scene));
  const current = () => scenes().filter((s) => s.state === 'current').length;
  return (
    <section class="rv-act" data-act-name={props.act.name}>
      <h2 class="rv-h">
        {props.act.name}{' '}
        <small>
          {scenes().length} scenes · {current()} current ·{' '}
          {scenes().filter((s) => s.approval === 'approved').length} approved
        </small>
      </h2>
      <div class="rv-row">
        <button
          type="button"
          class="rv-chip"
          data-act="approve-act"
          disabled={current() === 0 || props.at.saying()}
          onClick={() => props.at.say(ProjectAct.Approve({ address }))}
        >
          Approve the act's current scenes
        </button>
      </div>
      <Comments comments={props.act.comments} />
      <SayBox say={(text) => props.at.say(ProjectAct.Comment({ address, text }))} />
      <For each={pointsAt(choices().points, address)}>
        {(point) => <ChoiceCard point={point} />}
      </For>
      <div class="rv-grid rv-wide">
        <For each={scenes()}>{(scene) => <SceneRow at={props.at} scene={scene} />}</For>
      </div>
    </section>
  );
};

const ProjectBody = (props: { readonly at: ProjectValue }) => {
  const { choices } = useFilm();
  const project = () => props.at.project;
  const film: Address = { _tag: 'Film' };
  const inActs = () => new Set(project().acts.flatMap((a) => a.scenes));
  const loose = () => project().scenes.filter((s) => !inActs().has(s.scene));
  const current = () => project().scenes.filter((s) => s.state === 'current').length;
  return (
    <>
      <section class="rv-film" data-film={props.at.film}>
        <div class="rv-row">
          <button
            type="button"
            class="rv-chip"
            data-act="approve-all"
            disabled={current() === 0 || props.at.saying()}
            onClick={() => props.at.say(ProjectAct.ApproveAll())}
          >
            Approve all current
          </button>
          <span class="rv-hint" data-counts="">
            {project().scenes.length} scenes · {current()} current ·{' '}
            {project().scenes.filter((s) => s.approval === 'approved').length} approved · variant{' '}
            {project().variant}
          </span>
        </div>
        <Comments comments={project().comments} />
        <SayBox say={(text) => props.at.say(ProjectAct.Comment({ address: film, text }))} />
        <For each={pointsAt(choices().points, film)}>{(point) => <ChoiceCard point={point} />}</For>
      </section>
      <For each={project().acts}>{(act) => <ActBlock at={props.at} act={act} />}</For>
      <Show when={loose().length > 0}>
        <div class="rv-grid rv-wide">
          <For each={loose()}>{(scene) => <SceneRow at={props.at} scene={scene} />}</For>
        </div>
      </Show>
    </>
  );
};

/** The project read, the last say, and what the page shows: the newest of them. */
const ProjectReady = (props: { readonly film: string }) => {
  const { meta } = useReview();
  const { wrote } = useFilm();
  const film = props.film;
  const variant = Option.none<string>();
  const readAtom = meta.runtime.atom(OptionsApi.use((api) => api.project(film, variant)));
  const sayAtom = meta.runtime.fn((act: ProjectAct) =>
    OptionsApi.use((api) => api.sayOfProject(film, variant, act)),
  );
  const read = useAtomValue(() => readAtom);
  const refresh = useAtomRefresh(() => readAtom);
  const said = useAtomValue(() => sayAtom);
  const say = useAtomSet(() => sayAtom);
  const [shown, setShown] = createSignal(Option.none<Project>());
  createEffect(read, (r) => {
    Option.map(AsyncResult.value(r), (p) => setShown(Option.some(p)));
  });
  createEffect(said, (r) => {
    if (r.waiting) return;
    Option.map(AsyncResult.value(r), (p) => setShown(Option.some(p)));
  });
  // A pick or a kept voice changes the film: its scenes' states are read again.
  createEffect(wrote, (r) => {
    if (AsyncResult.isSuccess(r) && !r.waiting) refresh();
  });
  const status = createMemo(() =>
    Match.value(said()).pipe(
      Match.when(
        (r) => r.waiting,
        () => 'saying…',
      ),
      Match.orElse((r) =>
        AsyncResult.match(r, {
          onInitial: () => '',
          onSuccess: () => 'said',
          onFailure: () => failedText(r),
        }),
      ),
    ),
  );
  return (
    <Show
      when={Option.getOrUndefined(shown())}
      keyed
      fallback={
        <p class="empty">
          {Match.value(AsyncResult.isFailure(read())).pipe(
            Match.when(true, () => failedText(read())),
            Match.orElse(() => `Reading ${film}'s project…`),
          )}
        </p>
      }
    >
      {(project: Project) => (
        <>
          <p
            class="rv-hint rv-status"
            data-said={pressed(AsyncResult.isSuccess(said()))}
            data-failed={pressed(AsyncResult.isFailure(said()))}
          >
            {status()}
          </p>
          <ProjectBody
            at={{
              film,
              project,
              say: (act) => say(act),
              saying: () => said().waiting,
            }}
          />
        </>
      )}
    </Show>
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
