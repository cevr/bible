// A film's project page (`/films/<film>/project`): the film by its address
// tree (`core/catalogue.ts`'s Project, read in a fresh `film project --json`
// on the server) in the studio's shell, as design language §7 lays it out,
// a DAW's arrangement: the film's panel (its name, its length, its state
// band of a segment a scene, `n/N approved · n out of date` (`filmCounts`,
// as a Films card says it) and the check's findings), then each act a panel (its name, scenes, length and approvals)
// holding its scenes (on a phone a row each; on a laptop one row of cards),
// then the scenes in no act. Each scene is the card a film's Scenes shows
// (`scenes/card.tsx`, One surface): a still of the scene drawn from the
// film's code (`stills.tsx`, the tape's one source), its length, its name in
// its hue, its marks (out of date, not rendered, approved, findings), a
// comment dot when something was said of it, and on a laptop its Approve
// (`render first` while out of date). A tap on a scene opens its sheet (the
// inspector: a bottom sheet over the docked transport on a phone), named in
// the URL (`?point=`, its render point) so a link opens it and Back closes
// it: its render
// or its still, its Approve and Unapprove, its findings, what was said of it
// and the comment box, Info, Open in Lab and Versions, and the choices that
// play in it, each a link to its card on Choices. An act's and the film's
// approvals and comments are in their inspectors, their context menus (a
// long press or a right-click on the panel) and ⌘K. The film's transport is
// docked: over the tab bar on a phone, under the header on a laptop. Every
// say answers the project as it leaves it, its receipt saying what it moved
// (`0/2 → 1/2 approved`), an approve's offering Undo (a withdraw of just the
// approvals it gave); a source write reads it again, the film marked
// reading while it does. Answers land in any order: the page shows the
// newest asked, kept in place: a playing clip plays on and a half-typed
// comment stays.

import { useAtomSet, useAtomValue } from '@bible/atom-solid';
import { For, type JSX, Show } from '@solidjs/web';
import { Array as Arr, Effect, Exit, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
} from 'solid-js';
import { type Address, type PartAddress, addressKey, sceneAddress } from '../../../core/address.ts';
import { Places, ProjectView, pageHref, withdrawSay } from '../../../core/api.ts';
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
import { FILM_FPS, timecode } from '../../../core/time.ts';
import { counted } from '../../../core/words.ts';
import { SceneCard, SceneFindings, StateBand } from '../../scenes/card.tsx';
import { filmCounts, filmSpan, marksOf, projectPlaced } from '../../scenes/marks.ts';
import { type LabFailure, served } from '../../api.ts';
import { type Ask, newestAsked } from '../asked.ts';
import { plainClick } from '../../../browser/pointer.ts';
import { Go, OPEN_ON_CHOICES, useReview } from '../context.tsx';
import { pressed } from '../../pressed.ts';
import { APPROVAL_TEXT, stateText } from '../format.ts';
import { Loaded, useWrite, writeStatus } from '../loaded.tsx';
import { ReviewPlace } from '../place.ts';
import { OptionsApi, type ProjectSay } from './api.ts';
import {
  Approval,
  Approve,
  CommentBox,
  Comments,
  type Sayer,
  SayBox,
  Seen,
  useVariantThing,
} from './choice.tsx';
import { FilmProvider, useFilm } from './context.tsx';
import { Findings, useFindingsPlace } from './findings.tsx';
import { approveUndo, approvedOf, partSaid, undoApprove } from './receipt.ts';
import { Still, type SceneStills, useSceneStills } from './stills.tsx';
import { Selection, projectPartOf, projectPointOf } from '../../../command/selection.ts';
import { BY_BUTTON, type Undoing, quiet } from '../../../command/command.ts';
import { withSelection } from '../../../command/context.ts';
import { Target, type TargetElementProps } from '../../command/context-menu.tsx';
import {
  InspectName,
  Inspector,
  type InspectorBox,
  useInspect,
  useInspected,
  useInspectorPlace,
  useThing,
} from '../inspector.tsx';
import type { ThingVerb } from '../things.ts';
import { FilmPicture, FilmTransport, NoCut, OnlyShown, StepCommands } from './section.tsx';

const FILM: PartAddress = { _tag: 'Film' };

/**
 * Where `point` sits in the film: the scene it plays in, the act that holds
 * every scene it plays in, else the film (a short's point too). Its part's
 * inspector lists it.
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

/** The film's points the page lists: every one, or only those in `?only=`'s state (AA-14). */
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
  /** The scenes' stills, drawn from the film's code. */
  readonly stills: SceneStills;
}

/** The says of the project at `address`: a render card's, an act's, the film's. */
const sayerAt = (at: ProjectValue, address: () => PartAddress): Sayer => ({
  use: () => {
    const saying = at.useSay();
    return { waiting: saying.waiting, say: (_, say) => saying.say({ address: address(), say }) };
  },
});

/**
 * The thing whose sheet the project's URL names (`?point=`, read as the hub
 * reads it: `projectPartOf`): a scene's sheet is its render's, of the page's
 * `variant`; an act's and the film's their own.
 */
const inspectedAt = (film: string, variant: string, point: string): Option.Option<Selection> =>
  Option.map(projectPartOf(film, point), (part) =>
    Match.value(part).pipe(
      Match.tag('Point', (p): Selection =>
        Selection.cases.Variant.make({ film: p.film, point: p.point, variant }),
      ),
      Match.orElse((other) => other),
    ),
  );

/** What each part's list of choices is headed. */
const CHOICES_HEAD = {
  Scenes: 'Choices in this scene',
  Act: 'Choices in this act',
  Film: 'Choices of the film',
} as const satisfies Record<PartAddress['_tag'], string>;

/**
 * A part's choices, in its inspector (UR-65/69): the choices that play in it
 * (a scene's: placed in it, or a layer placed elsewhere; an act's or the
 * film's: placed in it), a link each to its card on Choices. A plain click
 * runs Open on Choices (a step Back returns here); a modified one is the
 * browser's (a new tab).
 */
const PartChoices = (props: {
  readonly film: string;
  readonly part: PartAddress['_tag'];
  readonly points: ReadonlyArray<ChoicePoint>;
}) => {
  const { meta } = useReview();
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
      <section class="rv-group rv-plays" data-section="choices">
        <h3>
          {CHOICES_HEAD[props.part]} <span class="lab-count">{props.points.length}</span>
        </h3>
        <For each={props.points} keyed={(p) => p.id}>
          {(point) => (
            <div class="rv-row">
              <a
                class="rv-inline-link"
                href={pageHref.choices(props.film, point().id)}
                data-plays={point().id}
                onClick={(e: MouseEvent) => {
                  if (!plainClick(e)) return;
                  e.preventDefault();
                  onChoices(point().id);
                }}
              >
                {point().title}
              </a>
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
        class="sh-btn"
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

/** What a scene waits on before it is approved: its render. */
const RENDER_FIRST = 'render first';

/**
 * A scene's Info in its sheet: its render's state (why it is out of date),
 * its approval, and every line of what it is (the command that renders a
 * missing one).
 */
const SceneInfo = (props: { readonly scene: ProjectScene; readonly variant: ChoiceVariant }) => (
  <section class="rv-group" data-section="info">
    <h3>Info</h3>
    <p class="rv-hint">{stateText(props.scene.state, props.scene.staleBy)}</p>
    <p class="rv-hint">{APPROVAL_TEXT[props.scene.approval]}</p>
    <For each={props.variant.lines}>{(line) => <p class="rv-hint">{line}</p>}</For>
  </section>
);

/** Whether a tap at `target` was on a control of its own (a button, a link, a field, a video's bar). */
const onControl = (event: MouseEvent): boolean =>
  Option.exists(
    Option.filter(Option.fromNullishOr(event.target), (t) => t instanceof Element),
    (t) =>
      t instanceof Element &&
      Option.isSome(
        Option.fromNullishOr(t.closest('button, a, input, textarea, select, video, label')),
      ),
  );

/**
 * A scene of the project as its card (`scenes/card.tsx`, the card a film's
 * Scenes shows): at rest its still and length, its name in its hue (a tap
 * inspects it), its marks, its comment dot and, on a laptop, its Approve; a
 * tap anywhere on it that is not a control opens its sheet: the same card
 * at full size (its render's video, else its still), its approve and
 * unapprove, its findings, what was said of it and the comment box, Info,
 * Open in Lab and Versions, and the choices that play in it. Its menu and
 * keys are its render's (`useVariantThing`).
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
  const inspect = useInspect(() => thing.selection);
  // Its sheet's title: the scene and the act it is in.
  const title = () =>
    [
      `scene ${props.scene.scene}`,
      ...Option.toArray(
        Option.map(
          Arr.findFirst(acts(), (a) => a.scenes.includes(props.scene.scene)),
          (a) => a.name,
        ),
      ),
    ].join(' · ');
  const marks = () =>
    marksOf(
      Option.some(props.at.view()),
      Option.getOrElse(AsyncResult.value(findings()), () => []),
      projectPlaced(props.at.view()),
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
      name={
        <InspectName of={thing.selection} comments={variant().comments.length}>
          {props.scene.scene}
        </InspectName>
      }
      verb={verb}
      selected={size === 'tile' && inspected()}
    />
  );
  return (
    <div
      class="rv-scene"
      data-scene={props.scene.scene}
      data-state={props.scene.state}
      onClick={(e: MouseEvent) => {
        if (!onControl(e)) inspect();
      }}
    >
      {card(
        'tile',
        <Still stills={props.at.stills} scene={props.scene.scene} />,
        <Approve variant={variant()} sayer={sayer} first={RENDER_FIRST} brief />,
      )}
      <Inspector of={thing.selection} title={title()}>
        {(box) => (
          <>
            {card(
              'focus',
              <Show
                when={Option.getOrUndefined(videoOf(variant()))}
                fallback={<Still stills={props.at.stills} scene={props.scene.scene} copy />}
              >
                {(video) => <Seen video={video()} />}
              </Show>,
              <Approval variant={variant()} sayer={sayer} first={RENDER_FIRST} />,
            )}
            <SceneFindings marks={marks()} />
            <Comments comments={variant().comments} />
            <CommentBox variant={variant()} sayer={sayer} box={box} />
            <SceneInfo scene={props.scene} variant={variant()} />
            <div class="rv-row">
              <a
                class="sh-btn"
                data-act="open-lab"
                href={pageHref.labScene(props.at.film, props.scene.scene)}
              >
                Open in Lab
              </a>
              <Show when={Option.isSome(props.scene.render)}>
                <Compare folder={props.at.view().folder} point={point().id} />
              </Show>
            </div>
            <PartChoices
              film={props.at.film}
              part="Scenes"
              points={[
                ...placedAt(shownPoints(), acts(), address()),
                ...playingIn(shownPoints(), acts(), props.scene.scene),
              ]}
            />
          </>
        )}
      </Inspector>
    </div>
  );
};

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
        class="sh-btn"
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
      class="sh-btn"
      data-act={`unapprove-${props.part}`}
      disabled={withdrawing.waiting()}
      onClick={() => withdrawing.say({ address: props.address, say: withdrawSay() })}
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
    run: () => saying.say({ address: props.address, say: withdrawSay() }),
  };
  return [
    ...[approve].filter(() => free && leftToApprove(props.scenes)),
    ...[unapprove].filter(() => free && props.scenes.some((s) => s.approval !== 'none')),
  ];
};

/**
 * A part's say, out of sight at rest: its approve and unapprove in its menu
 * (a long press or a right-click on its panel), ⌘K and its inspector; its
 * inspector holds its counts, what was said of it, its comment box and the
 * choices placed in it.
 */
const PartInspector = (props: PartProps) => {
  const saying = props.at.useSay();
  const shownPoints = useShownPoints();
  useThing({
    // A part's inspector lives with its panel, whose selection is fixed.
    selection: untrack(() => props.of),
    title: () => props.title,
    commentable: () => true,
    verbs: () => partVerbs(props, saying),
  });
  return (
    <Inspector of={props.of} title={props.title}>
      {(box) => (
        <>
          <p class="rv-hint" data-role="counts">
            {filmCounts(props.scenes)}
          </p>
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
          <PartChoices
            film={props.at.film}
            part={props.address._tag}
            points={placedAt(shownPoints(), props.at.view().project.acts, props.address)}
          />
        </>
      )}
    </Inspector>
  );
};

/** A run of scenes: a row each on a phone, one row of cards on a laptop. */
const Scenes = (props: {
  readonly at: ProjectValue;
  readonly scenes: ReadonlyArray<ProjectScene>;
}) => (
  <div class="pj-scenes">
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

/**
 * An act's panel: its head (its name, a tap inspects it; how many scenes,
 * how long, how many approved) over its scenes. A long press or a
 * right-click on it opens its menu: its approvals.
 */
const ActPanel = (props: { readonly at: ProjectValue; readonly act: Act }) => {
  const address = (): PartAddress => ({ _tag: 'Act', act: props.act.name });
  const scenes = () =>
    props.at.view().project.scenes.filter((s) => props.act.scenes.includes(s.scene));
  // An act's panel is keyed by its name: its selection is fixed for as long as it lives.
  const selection = untrack(() =>
    Selection.cases.Act.make({ film: props.at.film, act: props.act.name }),
  );
  const meta = () =>
    [
      counted(scenes().length, 'scene'),
      ...Option.toArray(Option.map(filmSpan(scenes()), (t) => timecode(t, FILM_FPS))),
      `${approvedOf(scenes())} approved`,
    ].join(' · ');
  return (
    <Target
      of={selection}
      render={(p: TargetElementProps) => <section {...p} />}
      class="rv-act pj-act"
      data-act-name={props.act.name}
    >
      <header class="pj-act-head">
        <InspectName of={selection} comments={props.act.comments.length}>
          {props.act.name}
        </InspectName>
        <span class="pj-act-meta">{meta()}</span>
      </header>
      <PartInspector
        at={props.at}
        of={selection}
        title={`act ${props.act.name}`}
        address={address()}
        scenes={scenes()}
        comments={props.act.comments}
        part="act"
      />
      <Scenes at={props.at} scenes={scenes()} />
    </Target>
  );
};

/** The film's state band (`StateBand`), its scenes marked by the project and the check's findings. */
const FilmBand = (props: { readonly at: ProjectValue }) => {
  const { findings } = useFilm();
  const marks = () =>
    marksOf(
      Option.some(props.at.view()),
      Option.getOrElse(AsyncResult.value(findings()), () => []),
      projectPlaced(props.at.view()),
    );
  return <StateBand scenes={props.at.view().project.scenes} marks={(scene) => marks()(scene)} />;
};

/** The film's panel: its name (a tap inspects it), its length, its counts, its findings, its state band, its render. */
const FilmPanel = (props: { readonly at: ProjectValue }) => {
  const project = () => props.at.view().project;
  const film = untrack(() => Selection.cases.Film.make({ film: props.at.film }));
  const findings = useFindingsPlace(Places.project);
  return (
    <Target
      of={film}
      render={(p: TargetElementProps) => <section {...p} />}
      class="pj-film"
      data-film={props.at.film}
      data-reading={pressed(props.at.reading())}
    >
      <div class="pj-film-head">
        <InspectName of={film} comments={project().comments.length}>
          {props.at.film}
        </InspectName>
        <Show when={Option.getOrUndefined(filmSpan(project().scenes))}>
          {(t) => <span class="pj-film-length">{timecode(t(), FILM_FPS)}</span>}
        </Show>
        <span class="pj-film-counts" data-role="counts">
          {filmCounts(project().scenes)}
        </span>
        <Findings chips sheet={findings} />
      </div>
      <FilmBand at={props.at} />
      <PartInspector
        at={props.at}
        of={film}
        title={`the film ${props.at.film}`}
        address={FILM}
        scenes={project().scenes}
        comments={project().comments}
        part="all"
      />
      <FilmPicture />
    </Target>
  );
};

const ProjectBody = (props: { readonly at: ProjectValue }) => {
  const project = () => props.at.view().project;
  const inActs = () => new Set(project().acts.flatMap((a) => a.scenes));
  const loose = () => project().scenes.filter((s) => !inActs().has(s.scene));
  return (
    <>
      <FilmPanel at={props.at} />
      <For each={project().acts} keyed={(a) => a.name}>
        {(act) => <ActPanel at={props.at} act={act()} />}
      </For>
      <Show when={loose().length > 0}>
        <section class="pj-loose">
          <Scenes at={props.at} scenes={loose()} />
        </section>
      </Show>
    </>
  );
};

/** Whether a say was refused for the state its scenes are in now (one drawn again since the page read it). */
const staleSinceRead = (failure: Option.Option<LabFailure>): boolean =>
  Option.exists(failure, (e) => e._tag === 'VerbRefused');

/**
 * What a say of the project did, as its receipt says it (`Words`,
 * `partSaid`). An approve's Undo takes back exactly what the catalogue says
 * it gave (`approveUndo`).
 */
const sayWords = (film: string, before: Option.Option<ProjectView>) => (s: ProjectSay) => {
  const undo = (after: ProjectView): Option.Option<Undoing> =>
    Option.filter(approveUndo(film, after), () => s.say._tag === 'Approve');
  return { doing: 'saying…', done: partSaid(s, before), undo };
};

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
  // Read by the server and sent with the page; the page adopts it and reads it no more.
  const readAtom = meta.runtime
    .atom(OptionsApi.use((api) => api.project(film)))
    .pipe(served(`review.project:${film}`, ProjectView));
  const againAtom = meta.runtime.fn(() => OptionsApi.use((api) => api.project(film)));
  const read = useAtomValue(() => readAtom);
  const again = useAtomValue(() => againAtom);
  const askAgain = useAtomSet(() => againAtom, { mode: 'promiseExit' });
  const status = writeStatus<ProjectView>('project');
  // The project as the newest ask answered it (a read again, a say's answer); until one
  // has, the first read's: it was asked first, so any later answer stands over it.
  const [answeredLater, setShown] = createSignal(Option.none<ProjectView>());
  const shown = createMemo(() => Option.orElse(answeredLater(), () => AsyncResult.value(read())));
  const asks = newestAsked();
  const stills = useSceneStills(film);
  /** Show `exit`'s project when it answered and `ask` is still the newest: whether it answered. */
  const answered = (ask: Ask, exit: Exit.Exit<ProjectView, LabFailure>): boolean => {
    if (Exit.isFailure(exit)) return false;
    ask.answer(() => setShown(Option.some(exit.value)));
    return true;
  };
  const readAgain = () => {
    const ask = asks.ask();
    void askAgain().then((exit) => answered(ask, exit));
  };
  const useSay = (): ProjectSayer => {
    const own = useWrite(
      (s: ProjectSay) => OptionsApi.use((api) => api.sayOfProject(film, s)),
      status,
      { project: asks },
      // The words are given as the say is sent: the part as the page shows it then.
      (s) => sayWords(film, untrack(shown))(s),
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
  // An approve's Undo (`undoApprove`), its receipt this page's say's. An approval a new
  // render made stale since is still the approve's own, and goes.
  const undoing = useSay();
  onCleanup(
    meta.hub.commands.register(
      undoApprove(film, {
        waiting: undoing.waiting,
        withdraw: (ids, say) =>
          Effect.sync(() => {
            void undoing.say({ address: { _tag: 'Scenes', ids }, say });
            return quiet;
          }),
      }),
    ),
  );
  // The open sheet is the URL's (`?point=`): a tap names its part (Back closes it), Close,
  // Escape and a swipe name none, and a link, Back and Forward open what they name.
  const variantNow = () =>
    Option.getOrElse(
      Option.map(shown(), (v) => v.project.variant),
      () => 'main',
    );
  useInspectorPlace({
    place: Places.project,
    named: (v) => inspectedAt(film, variantNow(), v.query.point),
    naming: (v, s) =>
      Option.map(projectPointOf(s), (point) => ({ ...v, query: { ...v.query, point } })),
    cleared: (v) => ({ ...v, query: { ...v.query, point: '' } }),
  });
  // A source write changes the film (a pick its sound, a kept voice a scene): its scenes are read again.
  createEffect(version, (v) => {
    if (v > 0) readAgain();
  });
  const at = (view: Accessor<ProjectView>): ProjectValue => ({
    film,
    view,
    useSay,
    reading: () => again().waiting,
    stills,
  });
  return (
    <Loaded value={shown()} result={read()} reading={`Reading ${film}'s project…`}>
      {(view) => <ProjectBody at={at(view)} />}
    </Loaded>
  );
};

/**
 * The film's transport, docked (design language §7): over the tab bar on a
 * phone, held under the header on a laptop; while the film has no render, a
 * line that says so where it would be.
 */
const Dock = () => (
  <section class="sh-dock pj-dock">
    <FilmTransport fallback={<NoCut />} />
  </section>
);

/** A film's project by its address tree, in the studio's shell. */
export const ProjectPage = (props: { readonly film: string }) => (
  <FilmProvider film={props.film}>
    <StepCommands />
    <Dock />
    <OnlyShown />
    <ProjectReady film={props.film} />
  </FilmProvider>
);
