// A film's project page (`/films/<film>/project`, the card in focus in its
// `?point=`): the film by its address tree (`core/catalogue.ts`'s Project,
// read in a fresh `film project --json` on the server), film → acts →
// scenes → layers, with the same card, the same say (approve, unapprove,
// comment) and the same words at every level. The film's own comments, an
// approve of its current scenes and an unapprove of them; each act (its
// comments, the same approve and unapprove of its scenes), both in the
// part's inspector, menu and ⌘K, its name and a comment dot at rest; each
// scene as the scene card a film's Scenes shows (`scenes/card.tsx`, One
// surface): its render (the video this checkout's catalogue records for it,
// `ProjectView.videos`, or the command that renders it), its length, its marks
// (out of date by its sources or the film's sound alone, not rendered, its
// approval, its findings) and Approve, the full card with its comments in its
// inspector. Each choice point sits once, at the narrowest
// part that holds every scene it plays in (a scene, an act, else the film),
// folded under that part; a scene's inspector lists the choices that play
// in it (its own and the layers placed elsewhere) as links to their cards. Every say answers the project as it
// leaves it; a source write reads it again (a pick changes the film's
// sound, a kept voice a scene's key), the film marked reading while it
// does. Answers land in any order: the page shows the newest asked. The page
// updates in place: a playing clip plays on and a half-typed comment stays.

import { useAtomSet, useAtomValue } from '@bible/atom-solid';
import { For, type JSX, Show } from '@solidjs/web';
import { Array as Arr, Exit, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { type Accessor, createEffect, createMemo, createSignal, untrack } from 'solid-js';
import { type Address, type PartAddress, addressKey, sceneAddress } from '../../../core/address.ts';
import { Place } from '@bible/url-state';
import * as UrlAtom from '@bible/url-state/atom';
import { Places, type ProjectView, pageHref, reviewFrameUrl } from '../../../core/api.ts';
import {
  type ProjectAct as Act,
  type ProjectScene,
  type SaidComment,
  renderVersion,
} from '../../../core/catalogue.ts';
import {
  type ChoicePoint,
  type ChoiceVariant,
  VariantMedia,
  pointHead,
  shownIn,
} from '../../../core/choice.ts';
import type { ReviewVideo } from '../../../core/review.ts';
import { FILM_FPS } from '../../../core/time.ts';
import { SceneCard } from '../../scenes/card.tsx';
import { marksOf } from '../../scenes/marks.ts';
import type { LabFailure } from '../../api.ts';
import { type Ask, newestAsked } from '../asked.ts';
import { Go, OPEN_ON_CHOICES, plainClick, useReview } from '../context.tsx';
import { POSTER_W, pressed, sayText } from '../format.ts';
import { Loaded, useWrite, writeStatus } from '../loaded.tsx';
import { ReviewPlace } from '../place.ts';
import { OptionsApi, type ProjectSay } from './api.ts';
import {
  Approval,
  Approve,
  ChoiceCard,
  CommentBox,
  Comments,
  type Sayer,
  SayBox,
  Seen,
  revealPoint,
  useVariantThing,
} from './choice.tsx';
import { FilmProvider, useFilm } from './context.tsx';
import { partText } from './receipt.ts';
import { Selection } from '../../../command/selection.ts';
import { BY_BUTTON } from '../../../command/command.ts';
import { withSelection } from '../../../command/context.ts';
import { onChoicesTab } from '../../../core/point.ts';
import { Target, type TargetElementProps } from '../../command/context-menu.tsx';
import {
  CommentCount,
  InspectName,
  Inspector,
  type InspectorBox,
  useInspected,
  useThing,
} from '../inspector.tsx';
import type { ThingVerb } from '../things.ts';
import { OnlyShown, Player, WriteBar } from './section.tsx';

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

/** The film's points the page shows: every one, or only those in `?only=`'s state (AA-14). */
const useShownPoints = (): Accessor<ReadonlyArray<ChoicePoint>> => {
  const { choices, only } = useFilm();
  return () => choices().points.filter(shownIn(only()));
};

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

/** A scene's render as its card shows it: the project's say on it, its state, and the video recorded for it. */
const renderVariantOf = (
  film: string,
  variant: string,
  scene: ProjectScene,
  view: ProjectView,
): ChoiceVariant => ({
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
  media: Option.match(Option.fromUndefinedOr(view.videos[scene.scene]), {
    onNone: (): VariantMedia => ({ _tag: 'Unseen' }),
    onSome: (video): VariantMedia => ({ _tag: 'Seen', video }),
  }),
  key: Option.match(scene.render, { onNone: () => scene.key, onSome: renderVersion }),
  approval: scene.approval,
  comments: scene.comments,
  notes: Option.none(),
});

/** A scene's render as a point of the film (its say goes to its address), holding its one variant. */
const renderPoint = (scene: ProjectScene, variant: ChoiceVariant): ChoicePoint => {
  const address = sceneAddress(scene.scene);
  return {
    ...pointHead({ _tag: 'Render', address }),
    address: Option.some(address),
    title: `scene ${scene.scene}`,
    lines: [],
    start: 0,
    moments: Option.none(),
    marks: [],
    knob: Option.none(),
    variants: [variant],
  };
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

/** Choice cards folded under a part, closed at rest (UR-65): the scene inspector and Choices hold them too. */
const Layers = (props: { readonly points: ReadonlyArray<ChoicePoint> }) => (
  <Show when={props.points.length > 0}>
    <details class="rv-layers">
      <summary class="rv-hint" data-layers={String(props.points.length)}>
        {choicesText(props.points.length)}
      </summary>
      <For each={props.points} keyed={(p) => p.id}>
        {(point) => <ChoiceCard point={point()} />}
      </For>
    </details>
  </Show>
);

/** The project's place: the card in focus is its `?point=`. */
const projectPlace = UrlAtom.place(Places.project);

/**
 * The scene inspector's Choices in this scene (UR-65/69): the choices that
 * play in the scene (placed in it, or elsewhere: a layer across scenes), a
 * row each. Its name is a link to its card here: a plain click brings the
 * card into view and puts it in the URL's `?point=` (Back returns to the card
 * before); a modified one opens the project there in a tab. Its Choices
 * button runs Open on Choices for it, landing on the Choices tab at its card.
 */
const SceneChoices = (props: {
  readonly film: string;
  readonly points: ReadonlyArray<ChoicePoint>;
}) => {
  const { meta } = useReview();
  const at = useAtomValue(() => projectPlace);
  const focus = useAtomSet(() => projectPlace);
  const focused = (point: string) =>
    Option.map(at(), (v) => ({ ...v, query: { ...v.query, point } }));
  const onChoices = (point: string) =>
    Option.map(meta.hub.commands.byId(OPEN_ON_CHOICES), (command) =>
      meta.hub.invoke(
        command,
        BY_BUTTON,
        withSelection(meta.hub.context('page'), [
          Selection.cases.Point.make({ film: props.film, point }),
        ]),
      ),
    );
  return (
    <Show when={props.points.length > 0}>
      <section class="rv-group rv-plays">
        <h3>
          Choices in this scene <span class="lab-count">{props.points.length}</span>
        </h3>
        <For each={props.points} keyed={(p) => p.id}>
          {(point) => (
            <div class="rv-row">
              <a
                class="rv-inline-link"
                href={Option.getOrElse(
                  Option.map(focused(point().id), (v) => Place.href(Places.project, v)),
                  () => '',
                )}
                data-plays={point().id}
                onClick={(e: MouseEvent) => {
                  if (!plainClick(e)) return;
                  e.preventDefault();
                  revealPoint(point().id);
                  Option.map(focused(point().id), focus);
                }}
              >
                {point().title}
              </a>
              <Show when={onChoicesTab(point().id)}>
                <button
                  type="button"
                  class="rv-chip"
                  data-act="on-choices"
                  data-point={point().id}
                  onClick={() => onChoices(point().id)}
                >
                  Open on Choices
                </button>
              </Show>
            </div>
          )}
        </For>
      </section>
    </Show>
  );
};

/** The link to a scene's Versions (its renders side by side), when the review's roots hold its project folder. */
const Compare = (props: { readonly folder: Option.Option<string>; readonly point: string }) => (
  <Show when={Option.getOrUndefined(props.folder)}>
    {(folder) => (
      <Go
        class="rv-chip"
        data-compare={props.point}
        place={ReviewPlace.Set({ folder: folder(), point: props.point })}
      >
        Versions
      </Go>
    )}
  </Show>
);

/** The video this checkout records for a scene's render, when it records one. */
const videoOf = (variant: ChoiceVariant): Option.Option<ReviewVideo> =>
  VariantMedia.match(variant.media, {
    Seen: ({ video }) => Option.some(video),
    Heard: () => Option.none(),
    Unseen: () => Option.none(),
  });

/** What a scene's card shows where no render is recorded: the command that renders it, when it is missing. */
const NoRender = (props: { readonly variant: ChoiceVariant }) => (
  <span class="rv-meta sc-card-blank">
    {Option.getOrElse(Arr.head(props.variant.lines), () => 'no render yet')}
  </span>
);

/** A scene's render as its card's picture in the grid: its video, a still of itself until it plays. */
const RenderPicture = (props: { readonly variant: ChoiceVariant }) => (
  <Show
    when={Option.getOrUndefined(videoOf(props.variant))}
    fallback={<NoRender variant={props.variant} />}
  >
    {(video) => <Seen video={video()} />}
  </Show>
);

/** A scene's render as its inspector's picture: a still of it (the grid's card plays it). */
const RenderStill = (props: { readonly variant: ChoiceVariant }) => (
  <Show
    when={Option.getOrUndefined(videoOf(props.variant))}
    fallback={<NoRender variant={props.variant} />}
  >
    {(video) => <img src={reviewFrameUrl(video().ref, Option.none(), POSTER_W)} alt="" />}
  </Show>
);

/**
 * A scene of the project as its card (`scenes/card.tsx`, the card a film's
 * Scenes shows): in the grid its render (a tap on the video plays it), its
 * name (a tap inspects it), its length, its marks and Approve; in its
 * inspector the same card at full size, with its in, out and length, its
 * approve and unapprove, its findings, every line of what it is, what was
 * said of it and the comment box, Open in Lab, its Versions and the choices
 * that play in it. Its menu and keys are its render's (`useVariantThing`).
 */
const SceneRow = (props: {
  readonly at: ProjectValue;
  readonly scene: ProjectScene;
  readonly index: number;
}) => {
  const shownPoints = useShownPoints();
  const { findings } = useFilm();
  const address = (): PartAddress => ({ _tag: 'Scenes', ids: [props.scene.scene] });
  const acts = () => props.at.view().project.acts;
  const variant = createMemo(() =>
    renderVariantOf(props.at.film, props.at.view().project.variant, props.scene, props.at.view()),
  );
  const point = createMemo(() => renderPoint(props.scene, variant()));
  const sayer = sayerAt(props.at, address);
  const thing = useVariantThing({
    get point() {
      return point();
    },
    get variant() {
      return variant();
    },
    sayer,
  });
  const inspected = useInspected(thing.selection);
  const marks = () =>
    marksOf(
      Option.some(props.at.view()),
      Option.getOrElse(findings(), () => []),
    )(props.scene.scene);
  const card = (size: 'tile' | 'focus', picture: JSX.Element, verb: JSX.Element) => (
    <SceneCard
      film={props.at.film}
      scene={props.scene.scene}
      of={thing.selection}
      index={props.index}
      span={props.scene.span}
      fps={FILM_FPS}
      marks={marks()}
      size={size}
      picture={picture}
      name={<InspectName of={thing.selection}>{props.scene.scene}</InspectName>}
      verb={verb}
      selected={size === 'tile' && inspected()}
    />
  );
  return (
    <div class="rv-scene" data-scene={props.scene.scene} data-state={props.scene.state}>
      {card(
        'tile',
        <RenderPicture variant={variant()} />,
        <Approve variant={variant()} sayer={sayer} />,
      )}
      <Inspector of={thing.selection} title={thing.title()}>
        {(box) => (
          <>
            {card(
              'focus',
              <RenderStill variant={variant()} />,
              <Approval variant={variant()} sayer={sayer} />,
            )}
            <Show when={marks().findings.length > 0}>
              <section class="rv-group" data-section="findings">
                <h3>
                  Findings <span class="lab-count">{marks().findings.length}</span>
                </h3>
                <For each={marks().findings}>
                  {(line) => (
                    <p class="sc-finding" data-level={line.level}>
                      <b>{line.tag}</b> {line.message}
                    </p>
                  )}
                </For>
              </section>
            </Show>
            <Comments comments={variant().comments} />
            <CommentBox variant={variant()} sayer={sayer} box={box} />
            <div class="rv-row">
              <a
                class="rv-chip"
                data-act="open-lab"
                href={pageHref.labScene(props.at.film, props.scene.scene)}
              >
                Open in Lab
              </a>
              <Show when={Option.isSome(props.scene.render)}>
                <Compare folder={props.at.view().folder} point={point().id} />
              </Show>
            </div>
            <SceneChoices
              film={props.at.film}
              points={[
                ...placedAt(shownPoints(), acts(), address()),
                ...playingIn(shownPoints(), acts(), props.scene.scene),
              ]}
            />
          </>
        )}
      </Inspector>
      <Layers points={placedAt(shownPoints(), acts(), address())} />
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
  act: { approve: "Approve the act's current scenes", unapprove: "Unapprove the act's scenes" },
  all: { approve: 'Approve all current', unapprove: 'Unapprove every scene' },
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
        <PartUnapprove at={props.at} address={props.address} part={props.part} />
      </Show>
    </>
  );
};

/** A part's unapprove (it withdraws every approval of its scenes), waiting while its own is in flight. */
const PartUnapprove = (props: {
  readonly at: ProjectValue;
  readonly address: PartAddress;
  readonly part: keyof typeof PART_WORDS;
}) => {
  const withdrawing = props.at.useSay();
  return (
    <button
      type="button"
      class="rv-chip"
      data-act={`unapprove-${props.part}`}
      disabled={withdrawing.waiting()}
      onClick={() => withdrawing.say({ address: props.address, say: { _tag: 'Withdraw' } })}
    >
      {PART_WORDS[props.part].unapprove}
    </button>
  );
};

/** A part's comment box, waiting while its own say is in flight. */
const PartComment = (props: {
  readonly at: ProjectValue;
  readonly address: PartAddress;
  readonly box: InspectorBox;
}) => {
  const commenting = props.at.useSay();
  return (
    <SayBox
      disabled={commenting.waiting()}
      box={props.box}
      say={(text) => commenting.say({ address: props.address, say: { _tag: 'Comment', text } })}
    />
  );
};

/** A part (an act, the film) as the page's commands and its inspector read it. */
interface PartProps {
  readonly at: ProjectValue;
  readonly of: Selection;
  readonly title: string;
  readonly address: PartAddress;
  readonly scenes: ReadonlyArray<ProjectScene>;
  readonly comments: ReadonlyArray<SaidComment>;
  readonly part: keyof typeof PART_WORDS;
}

/** The verbs a part allows now: approve its current scenes while one is left, unapprove them while one is approved. */
const partVerbs = (props: PartProps, saying: ProjectSayer): ReadonlyArray<ThingVerb> => {
  const free = !saying.waiting();
  const approve: ThingVerb = {
    id: 'approve-part',
    label: PART_WORDS[props.part].approve,
    run: () => saying.say({ address: props.address, say: { _tag: 'Approve' } }),
  };
  const unapprove: ThingVerb = {
    id: 'unapprove',
    label: PART_WORDS[props.part].unapprove,
    run: () => saying.say({ address: props.address, say: { _tag: 'Withdraw' } }),
  };
  return [
    ...[approve].filter(() => free && leftToApprove(props.scenes)),
    ...[unapprove].filter(() => free && props.scenes.some((s) => s.approval !== 'none')),
  ];
};

/**
 * A part's say, out of sight at rest: its approve and unapprove in its menu,
 * ⌘K and its inspector; its inspector holds its counts, what was said of it
 * and its comment box.
 */
const PartInspector = (props: PartProps) => {
  const saying = props.at.useSay();
  useThing({
    // A part's inspector lives with its block, whose selection is fixed.
    selection: untrack(() => props.of),
    title: () => props.title,
    commentable: () => true,
    verbs: () => partVerbs(props, saying),
  });
  return (
    <Inspector of={props.of} title={props.title}>
      {(box) => (
        <>
          <p class="rv-hint">{countsOf(props.scenes)}</p>
          <div class="rv-row">
            <PartApproval
              at={props.at}
              address={props.address}
              scenes={props.scenes}
              part={props.part}
            />
          </div>
          <Comments comments={props.comments} />
          <PartComment at={props.at} address={props.address} box={box} />
        </>
      )}
    </Inspector>
  );
};

const Scenes = (props: {
  readonly at: ProjectValue;
  readonly scenes: ReadonlyArray<ProjectScene>;
}) => (
  <div class="rv-grid rv-scenes">
    <For each={props.scenes} keyed={(s) => s.scene}>
      {(scene) => (
        <SceneRow
          at={props.at}
          scene={scene()}
          index={props.at.view().project.scenes.findIndex((s) => s.scene === scene().scene)}
        />
      )}
    </For>
  </div>
);

const ActBlock = (props: { readonly at: ProjectValue; readonly act: Act }) => {
  const shownPoints = useShownPoints();
  const address = (): PartAddress => ({ _tag: 'Act', act: props.act.name });
  const scenes = () =>
    props.at.view().project.scenes.filter((s) => props.act.scenes.includes(s.scene));
  // An act's block is keyed by its name: its selection is fixed for as long as it lives.
  const selection = untrack(() =>
    Selection.cases.Act.make({ film: props.at.film, act: props.act.name }),
  );
  return (
    <Target
      of={selection}
      render={(p: TargetElementProps) => <section {...p} />}
      class="rv-act"
      data-act-name={props.act.name}
    >
      <h2 class="rv-h">
        <InspectName of={selection}>{props.act.name}</InspectName>{' '}
        <small>{countsOf(scenes())}</small>{' '}
        <CommentCount of={selection} count={props.act.comments.length} />
      </h2>
      <PartInspector
        at={props.at}
        of={selection}
        title={`act ${props.act.name}`}
        address={address()}
        scenes={scenes()}
        comments={props.act.comments}
        part="act"
      />
      <Layers points={placedAt(shownPoints(), props.at.view().project.acts, address())} />
      <Scenes at={props.at} scenes={scenes()} />
    </Target>
  );
};

const ProjectBody = (props: { readonly at: ProjectValue }) => {
  const shownPoints = useShownPoints();
  const project = () => props.at.view().project;
  const inActs = () => new Set(project().acts.flatMap((a) => a.scenes));
  const loose = () => project().scenes.filter((s) => !inActs().has(s.scene));
  // The card the URL's `?point=` names is brought into view: on a link's
  // first render, and each time Back or Forward lands on another.
  const at = useAtomValue(() => projectPlace);
  createEffect(
    () =>
      Option.filter(
        Option.map(at(), (v) => v.query.point),
        (point) => point !== '',
      ),
    (point) => {
      Option.map(point, revealPoint);
    },
  );
  const film = untrack(() => Selection.cases.Film.make({ film: props.at.film }));
  return (
    <>
      <Target
        of={film}
        render={(p: TargetElementProps) => <section {...p} />}
        class="rv-film"
        data-film={props.at.film}
        data-reading={pressed(props.at.reading())}
      >
        <div class="rv-row">
          <InspectName of={film}>
            <span class="rv-hint" data-counts="">
              {countsOf(project().scenes)} · variant {project().variant}
            </span>
          </InspectName>
          <CommentCount of={film} count={project().comments.length} />
        </div>
        <PartInspector
          at={props.at}
          of={film}
          title={`the film ${props.at.film}`}
          address={FILM}
          scenes={project().scenes}
          comments={project().comments}
          part="all"
        />
        <Layers points={placedAt(shownPoints(), project().acts, FILM)} />
      </Target>
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
  // The page reads the `main` variant's project; another variant's is the CLI's (`--variant`).
  const readAtom = meta.runtime.atom(OptionsApi.use((api) => api.project(film)));
  const againAtom = meta.runtime.fn(() => OptionsApi.use((api) => api.project(film)));
  const read = useAtomValue(() => readAtom);
  const again = useAtomValue(() => againAtom);
  const askAgain = useAtomSet(() => againAtom, { mode: 'promiseExit' });
  const status = writeStatus<ProjectView>('project');
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
      (s: ProjectSay) => OptionsApi.use((api) => api.sayOfProject(film, s)),
      status,
      { project: asks },
      (s) => ({
        doing: 'saying…',
        done: () => sayText(s.say, partText(s.address)),
      }),
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
      {(view) => <ProjectBody at={at(view)} />}
    </Loaded>
  );
};

/** A film's project by its address tree, with its choices placed where they belong. */
export const ProjectPage = (props: { readonly film: string }) => (
  <FilmProvider film={props.film}>
    <WriteBar />
    <Player />
    <OnlyShown />
    <ProjectReady film={props.film} />
  </FilmProvider>
);
