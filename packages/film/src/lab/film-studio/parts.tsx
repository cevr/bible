// The studio's parts (design §1, §8), each reading the studio's context
// (`context.tsx`) and nothing else: the header, the viewer, the transport,
// the timeline with its explicit tracks, the inspector's shell and the
// phone's reading block, laid out by `Layout`, the one grid that places the
// inspector (layout C: beside the viewer, the timeline full width).

import { Menu } from '@bible/ui/menu';
import { Place } from '@bible/url-state';
import type { JSX } from '@solidjs/web';
import { Array as Arr, Boolean as Bool, Effect, Match, Option, Result } from 'effect';
import { BOARD_PAPER, paintText } from '../../canvas/board.ts';
import {
  type Accessor,
  For,
  Show,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onSettled,
  untrack,
  useContext,
} from 'solid-js';
import { PageLoad } from '../../browser/page-load.ts';
import { Pointer, Surface } from '../../browser/pointer.ts';
import { BY_BUTTON } from '../../command/command.ts';
import { Places, selectedBeat, studioPlace } from '../../core/api.ts';
import type {
  BoardClip,
  FilmTimeline,
  FilmVersion,
  Lane,
  Marker,
  RenderClip,
  SceneClip,
  ScriptClip,
  SoundClip,
  Track,
  VoiceClip,
  Waiting,
} from '../../core/timeline-schema.ts';
import { hubKeys } from '../command/changes.ts';
import { pressed } from '../pressed.ts';
import { PHONE, useMatches } from '../viewport.ts';
import { useStudio } from './context.tsx';
import {
  NEXT_H,
  PHONE_PX_PER_SECOND,
  STATUS_H,
  laneHeight,
  pictureLane,
  timelineHeight,
} from './geometry.ts';
import { StudioIcon, TransitionGlyph } from './icons.tsx';
import {
  STAGE_TITLE,
  TRACK_TITLE,
  clipFit,
  lanesShown,
  marksFit,
  nextText,
  pictureTag,
  pxPerSecond,
  rulerTicks,
  timecode,
  waitsText,
  scrollForZoom,
  sentenceAt,
  zoomFor,
  type BeatPage,
  type CardPicture,
  beatPageHref,
  verseParts,
} from './view-state.ts';

/** Whether the window is a phone's: its lanes, its keys and its reading block. */
const usePhone = (): Accessor<boolean> => useMatches(useStudio().meta.host, PHONE);

/**
 * Open `href`, a lab page, as a link would; a page the studio replaced, on
 * this film, selects its beat here instead (`studioPlace`).
 */
const useOpen = () => {
  const { meta, actions } = useStudio();
  return (href: string) =>
    Option.match(
      Option.filter(
        Option.flatMap(studioPlace(href), (to) => Place.decode(Places.studio, to)),
        (to) => to.path.film === meta.film,
      ),
      {
        onSome: (to) => actions.select(selectedBeat(to.query.sel)),
        onNone: () => Effect.runForkWith(meta.host)(PageLoad.use((load) => load.open(href))),
      },
    );
};

/** The timeline the studio shows: its parts render only once it is read. */
const Shown = (props: { readonly children: (timeline: Accessor<FilmTimeline>) => JSX.Element }) => {
  const { state } = useStudio();
  return (
    <Show when={Option.getOrUndefined(state.timeline())}>
      {(timeline) => props.children(timeline)}
    </Show>
  );
};

// ---------------------------------------------------------------- Header

/** `where`, marked `open ·` for the version open now. */
const opened = (version: FilmVersion, where: string): string =>
  Bool.match(version.open, { onTrue: () => `open · ${where}`, onFalse: () => where });

/** How the version menu describes a version: its title and where its files are. */
const versionNote = (version: FilmVersion): string =>
  Match.value(version.files).pipe(
    Match.when('film', () => opened(version, 'the film’s files')),
    Match.when('folder', () => opened(version, 'its own folder')),
    Match.when('none', () => 'replaced in place: nothing kept to show'),
    Match.exhaustive,
  );

/** The version chip (`v2 ▾`): a menu of the film's versions, each with its title. */
const VersionMenu = (props: { readonly timeline: FilmTimeline }) => {
  const { actions } = useStudio();
  return (
    <Menu.Root>
      <Menu.Trigger
        class="st-ver"
        data-act="version"
        aria-label={`Version ${props.timeline.version.n}`}
      >
        <span>v{props.timeline.version.n}</span>
        <StudioIcon of="caret" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner class="lab-context-positioner" sideOffset={4} align="start">
          <Menu.Popup class="lab-context-menu st-versions" data-role="versions">
            <Menu.RadioGroup
              aria-label="Versions"
              value={`${props.timeline.version.n}`}
              onValueChange={(v: string) => actions.version(Number(v))}
            >
              <For each={props.timeline.versions}>
                {(version) => (
                  <Menu.RadioItem
                    class="lab-context-item st-version"
                    data-version={version.n}
                    value={`${version.n}`}
                    label={`v${version.n}`}
                    closeOnClick
                  >
                    <span class="st-version-n">v{version.n}</span>
                    <span class="st-version-text">
                      <span class="st-version-title">{version.title}</span>
                      <span class="st-version-note">{versionNote(version)}</span>
                    </span>
                    <Menu.RadioItemIndicator class="lab-context-check">✓</Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                )}
              </For>
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};

/** One thing waiting on the owner, as the waits menu lists it. */
const waitingText = (waiting: Waiting): string =>
  Match.value(waiting).pipe(
    Match.discriminatorsExhaustive('kind')({
      ask: (w) => `Ask: ${w.title}`,
      note: (w) => `Note: ${w.text}`,
      approve: (w) => `Approve ${w.beat}’s Board`,
    }),
  );

/** "N wait on you": a menu of what waits, each opening its page. */
const Waits = (props: { readonly timeline: FilmTimeline; readonly words: string }) => {
  const open = useOpen();
  return (
    <Menu.Root>
      <Menu.Trigger class="st-waits" data-act="waits">
        {props.words}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner class="lab-context-positioner" sideOffset={4} align="end">
          <Menu.Popup class="lab-context-menu st-wait-list" data-role="waits">
            <For each={props.timeline.header.waits?.items ?? []}>
              {(waiting) => (
                <Menu.Item
                  class="lab-context-item"
                  label={waitingText(waiting)}
                  onClick={() => open(waiting.href)}
                >
                  <span>{waitingText(waiting)}</span>
                </Menu.Item>
              )}
            </For>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};

/** The header (44 px): the film, the version chip, the stage word; right, what waits and what the agents do now. */
const Header = () => {
  const { meta } = useStudio();
  return (
    <header class="st-header">
      <b class="st-film">{meta.film}</b>
      <Shown>
        {(timeline) => (
          <>
            <VersionMenu timeline={timeline()} />
            <span class="st-stage" data-stage={timeline().header.stage}>
              {STAGE_TITLE[timeline().header.stage]}
            </span>
            <span class="st-spacer" />
            <span class="st-status">
              <For each={timeline().header.working}>
                {(line) => (
                  <span class="st-doing" title={`${line.by}: ${line.text}`}>
                    {line.text}
                  </span>
                )}
              </For>
              <Show when={Option.getOrUndefined(waitsText(timeline()))}>
                {(words) => <Waits timeline={timeline()} words={words()} />}
              </Show>
            </span>
          </>
        )}
      </Shown>
    </header>
  );
};

// ---------------------------------------------------------------- Viewer

/** The kind colour of the picture's tag. */
const TAG_KIND = { Scene: 'scene', Board: 'board', Card: 'board', Empty: 'script' } as const;

/** A Board card's words as its paper shows them: a card's, its payoff large; a verse's page, its phrase lit. */
const CardWords = (props: { readonly card: CardPicture }) => (
  <>
    {Match.value(props.card.text).pipe(
      Match.tag('Card', (text) => (
        <p class="st-card-words">
          <Show when={Option.getOrUndefined(props.card.words)} fallback={<b>{text.payoff}</b>}>
            {(words) => (
              <For each={words()}>
                {(word, i) => (
                  <>
                    <Show when={i() > 0}> </Show>
                    <Show when={word.payoff} fallback={<span>{word.text}</span>}>
                      <b>{word.text}</b>
                    </Show>
                  </>
                )}
              </For>
            )}
          </Show>
        </p>
      )),
      Match.tag('Verse', (text) => {
        const parts = verseParts(text.text, text.phrase);
        return (
          <>
            <p class="st-card-verse">
              {parts.before}
              <mark>{parts.phrase}</mark>
              {parts.after}
            </p>
            <p class="st-card-ref">{text.ref}</p>
          </>
        );
      }),
      Match.exhaustive,
    )}
  </>
);

/**
 * The Board card at the playhead, never an empty frame: set by the engine on
 * the staged film's canvas, as the Board sets it (`paintText` on the board's
 * paper), when the version shown is the film registry's; else, or when the
 * engine cannot set it, its words on the card's paper. `why` hears why the
 * engine could not set it, for the tag.
 */
const CardFrame = (props: {
  readonly card: CardPicture;
  readonly why: (why: Option.Option<string>) => void;
}) => {
  const { state, meta } = useStudio();
  const engine = createMemo(() =>
    Option.flatMap(meta.drawn(), (film) =>
      Option.map(
        Arr.findFirst(film.placed, (p) => p.spec.id === props.card.beat),
        (placed) => ({ film, placed }),
      ),
    ),
  );
  const [set, setSet] = createSignal(false, { ownedWrite: true });
  let canvas = Option.none<HTMLCanvasElement>();
  createEffect(
    () => ({ T: state.T(), card: props.card, engine: engine() }),
    ({ T, card, engine: on }) => {
      const painted = Option.flatMap(on, ({ film, placed }) =>
        Option.flatMap(canvas, (el) =>
          Option.map(Option.fromNullishOr(el.getContext('2d')), (ctx) => {
            el.width = film.width;
            el.height = film.height;
            ctx.fillStyle = BOARD_PAPER;
            ctx.fillRect(0, 0, film.width, film.height);
            return paintText(ctx, film, placed, card.text, card.mark, card.markAt, T);
          }),
        ),
      );
      const why = Option.flatMap(painted, (r) => Result.getFailure(r));
      setSet(Option.isSome(painted) && Option.isNone(why));
      props.why(why);
    },
  );
  onCleanup(() => props.why(Option.none()));
  return (
    <>
      <canvas
        class="st-card-canvas"
        hidden={!set()}
        aria-hidden="true"
        ref={(el: HTMLCanvasElement) => {
          canvas = Option.some(el);
        }}
      />
      <Show when={!set()}>
        <div class="st-card" data-card={props.card.text._tag}>
          <CardWords card={props.card} />
        </div>
      </Show>
    </>
  );
};

/** The frame at the playhead, 16:9: the drawn scene, else the Board panel or card, else the beat's empty frame. */
const Viewer = () => {
  const { state, meta } = useStudio();
  const picture = state.picture;
  let scene = Option.none<HTMLElement>();
  createEffect(
    () => meta.stage(),
    (stage) => {
      Option.map(stage, (el) =>
        Option.map(scene, (box) => {
          if (el.parentElement !== box) box.append(el);
        }),
      );
    },
  );
  const board = createMemo(() =>
    Match.value(picture()).pipe(
      Match.tag('Board', (p) => Option.some(p)),
      Match.orElse(() => Option.none<{ readonly file: string; readonly panel: string }>()),
    ),
  );
  const card = createMemo(() =>
    Match.value(picture()).pipe(
      Match.tag('Card', (p) => Option.some(p)),
      Match.orElse(() => Option.none<CardPicture>()),
    ),
  );
  // Why the engine could not set the card shown: said on the tag, never a blank paper.
  const [unset, setUnset] = createSignal(Option.none<string>(), { ownedWrite: true });
  const tag = () =>
    Option.match(
      Option.filter(unset(), () => picture()._tag === 'Card'),
      {
        onNone: () => pictureTag(picture()),
        onSome: (why) => `${pictureTag(picture())} · not set: ${why}`,
      },
    );
  return (
    <section class="st-viewer" aria-label="Viewer">
      <div class="st-frame" data-picture={picture()._tag}>
        <div
          class="st-scene"
          hidden={picture()._tag !== 'Scene'}
          ref={(el: HTMLDivElement) => {
            scene = Option.some(el);
            Option.map(untrack(meta.stage), (stage) => el.append(stage));
          }}
        />
        <Show when={Option.getOrUndefined(board())}>
          {(shown) => (
            <img
              class="st-pic"
              src={meta.boardUrl(shown().file)}
              alt={`Board panel ${shown().panel}`}
            />
          )}
        </Show>
        <Show when={Option.getOrUndefined(card())}>
          {(shown) => <CardFrame card={shown()} why={setUnset} />}
        </Show>
        <Show when={picture()._tag === 'Empty'}>
          <div class="st-empty">
            <b>No picture yet</b>
            <p>Its Board panel or scene shows here once it is made.</p>
          </div>
        </Show>
        <span class="st-tag" data-kind={TAG_KIND[picture()._tag]}>
          <i aria-hidden="true" />
          {tag()}
        </span>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------- Transport

/** One transport key: its command run as a button runs it, its keys in its title. */
const Key = (props: {
  readonly id: string;
  readonly label: string;
  readonly icon: 'start' | 'back' | 'play' | 'pause' | 'on' | 'end';
  /** Its look: an end key (quieter), a beat key, or the play key. */
  readonly look: 'edge' | 'step' | 'play';
  /** Whether it is pressed, for a key that toggles. */
  readonly pressed: Option.Option<boolean>;
}) => {
  const { meta } = useStudio();
  const keys = hubKeys(meta.hub);
  return (
    <button
      type="button"
      class="st-key"
      data-look={props.look}
      data-act={props.id}
      aria-label={props.label}
      aria-pressed={Option.getOrUndefined(Option.map(props.pressed, pressed))}
      title={keys.titled(props.label, props.id)}
      onClick={() => meta.hub.invokeId(props.id, BY_BUTTON)}
    >
      <StudioIcon of={props.icon} />
    </button>
  );
};

/** The transport row: the timecode, the five keys in one pill, the sentence spoken at the playhead. */
const Transport = () => {
  const { state } = useStudio();
  const duration = () =>
    Option.getOrElse(
      Option.map(state.timeline(), (t) => t.duration),
      () => 0,
    );
  const spoken = () =>
    Option.getOrElse(
      Option.flatMap(state.current(), (beat) =>
        Option.map(
          Option.flatMap(state.words(beat.beat), (words) => Option.fromUndefinedOr(words.say)),
          (say) => sentenceAt(say, state.T(), Option.fromUndefinedOr(beat.speech)),
        ),
      ),
      () => '',
    );
  return (
    <section class="st-transport" aria-label="Transport">
      <span
        class="st-tc"
        role="timer"
        aria-label={`At ${timecode(state.T())} of ${timecode(duration())}`}
      >
        {timecode(state.T())}
        <small>/ {timecode(duration())}</small>
      </span>
      <span class="st-keys" role="group" aria-label="Transport keys">
        <Key
          id="studio.start"
          label="To the start"
          icon="start"
          look="edge"
          pressed={Option.none()}
        />
        <Key
          id="studio.back"
          label="Previous beat"
          icon="back"
          look="step"
          pressed={Option.none()}
        />
        <Key
          id="play.toggle"
          label="Play"
          icon={Bool.match(state.playing(), { onTrue: () => 'pause', onFalse: () => 'play' })}
          look="play"
          pressed={Option.some(state.playing())}
        />
        <Key id="studio.on" label="Next beat" icon="on" look="step" pressed={Option.none()} />
        <Key id="studio.end" label="To the end" icon="end" look="edge" pressed={Option.none()} />
      </span>
      <p class="st-caption">{spoken()}</p>
    </section>
  );
};

// ---------------------------------------------------------------- Timeline

/** The timeline's scale: pixels a film second takes, at the zoom and the scroller's width. */
interface Scale {
  readonly perSecond: Accessor<number>;
  /** Film second `T`'s x, in the canvas's pixels. */
  readonly x: (T: number) => number;
  /** The film second at canvas x `px`. */
  readonly at: (px: number) => number;
}

const ScaleContext = createContext<Scale>();
const useScale = (): Scale => useContext(ScaleContext);

/** One clip on its lane: placed by its span, drawn as its width allows, outlined when its beat is selected. */
const Clip = (props: {
  readonly kind: Track;
  readonly start: number;
  readonly dur: number;
  readonly beat: Option.Option<string>;
  readonly label: string;
  readonly estimated: boolean;
  /** The picture it shows, for a Board panel with an image. */
  readonly picture: Option.Option<string>;
  readonly children?: JSX.Element;
}) => {
  const { state, actions } = useStudio();
  const scale = useScale();
  const width = () => props.dur * scale.perSecond();
  const fit = () => clipFit(width());
  const linked = () =>
    Option.isSome(props.beat) &&
    Option.exists(state.selected(), (sel) => Option.contains(props.beat, sel.beat));
  return (
    <button
      type="button"
      class="st-clip"
      tabindex={Bool.match(props.kind === 'script', { onTrue: () => 0, onFalse: () => -1 })}
      data-kind={props.kind}
      data-fit={fit()}
      data-linked={pressed(linked())}
      data-est={pressed(props.estimated)}
      data-picture={pressed(Option.isSome(props.picture))}
      data-beat={Option.getOrUndefined(props.beat)}
      aria-label={props.label}
      aria-pressed={Option.getOrUndefined(
        Option.map(
          Option.liftPredicate(props.kind, (k) => k === 'script'),
          () => pressed(linked()),
        ),
      )}
      title={`${props.label} · ${timecode(props.start)}–${timecode(props.start + props.dur)}`}
      style={{
        left: `${scale.x(props.start)}px`,
        width: `${Math.max(Bool.match(fit() === 'tick', { onTrue: () => 4, onFalse: () => 0 }), width())}px`,
        'background-image': Option.getOrUndefined(
          Option.map(props.picture, (url) => `url("${url}")`),
        ),
      }}
      onClick={() =>
        actions.select(
          Option.orElse(props.beat, () =>
            Option.map(
              Option.flatMap(state.timeline(), () => state.current()),
              (b) => b.beat,
            ),
          ),
        )
      }
    >
      <Show when={fit() === 'labelled'}>
        <span class="st-lbl">{props.label}</span>
      </Show>
      {props.children}
    </button>
  );
};

/** A lane: a track's clips on the film's clock. */
const LaneBox = (props: { readonly lane: Lane; readonly children: JSX.Element }) => (
  <div
    class="st-lane"
    data-track={props.lane.track}
    data-picture={pressed(pictureLane(props.lane))}
  >
    {props.children}
  </div>
);

/** The script's beats, the selected one's marks as diamonds in its bottom strip. */
const ScriptTrack = (props: { readonly clips: ReadonlyArray<ScriptClip> }) => {
  const { state } = useStudio();
  const scale = useScale();
  return (
    <For each={props.clips}>
      {(clip) => (
        <Clip
          kind="script"
          start={clip.start}
          dur={clip.dur}
          beat={Option.some(clip.beat)}
          label={clip.beat}
          estimated={clip.clock === 'estimated'}
          picture={Option.none()}
        >
          <Show
            when={
              Option.exists(state.selected(), (sel) => sel.beat === clip.beat) &&
              marksFit(clip.dur * scale.perSecond(), clip.marks.length)
            }
          >
            <span class="st-marks" aria-hidden="true">
              <span class="st-marks-line" />
              <For each={clip.marks}>
                {(mark) => (
                  <i
                    style={{ left: `${(mark.at - clip.start) * scale.perSecond()}px` }}
                    title={mark.name}
                  />
                )}
              </For>
            </span>
          </Show>
        </Clip>
      )}
    </For>
  );
};

/** The Board's panels where the animatic shows them: each its kept try, or a card. */
const BoardTrack = (props: { readonly clips: ReadonlyArray<BoardClip> }) => {
  const { meta } = useStudio();
  return (
    <For each={props.clips}>
      {(clip) => (
        <Clip
          kind="board"
          start={clip.start}
          dur={clip.dur}
          beat={Option.some(clip.beat)}
          label={Bool.match(clip.card, {
            onTrue: () => 'Card',
            onFalse: () => `Board ${clip.panel}`,
          })}
          estimated={clip.clock === 'estimated'}
          picture={Option.map(Option.fromUndefinedOr(clip.file), meta.boardUrl)}
        />
      )}
    </For>
  );
};

/** The voice: each beat's take over its speech, staging or the owner's. */
const VoiceTrack = (props: { readonly clips: ReadonlyArray<VoiceClip> }) => (
  <For each={props.clips}>
    {(clip) => (
      <Clip
        kind="voice"
        start={clip.start}
        dur={clip.dur}
        beat={Option.some(clip.beat)}
        label={`${clip.beat} · ${Match.value(clip.source).pipe(
          Match.when('owner', () => 'your take'),
          Match.orElse(() => 'staging'),
        )}`}
        estimated={clip.clock === 'estimated'}
        picture={Option.none()}
      />
    )}
  </For>
);

/** The scenes drawn, each over its beat. */
const SceneTrack = (props: { readonly clips: ReadonlyArray<SceneClip> }) => (
  <For each={props.clips}>
    {(clip) => (
      <Clip
        kind="scenes"
        start={clip.start}
        dur={clip.dur}
        beat={Option.some(clip.beat)}
        label={clip.beat}
        estimated={clip.clock === 'estimated'}
        picture={Option.none()}
      />
    )}
  </For>
);

/** The score's movements. */
const SoundTrack = (props: { readonly clips: ReadonlyArray<SoundClip> }) => (
  <For each={props.clips}>
    {(clip) => (
      <Clip
        kind="sound"
        start={clip.start}
        dur={clip.dur}
        beat={Option.none()}
        label={clip.movement}
        estimated={clip.clock === 'estimated'}
        picture={Option.none()}
      />
    )}
  </For>
);

/** The renders in the catalogue, each over its address's span. */
const RenderTrack = (props: { readonly clips: ReadonlyArray<RenderClip> }) => (
  <For each={props.clips}>
    {(clip) => (
      <Clip
        kind="render"
        start={clip.start}
        dur={clip.dur}
        beat={Option.none()}
        label={`${clip.address} · ${clip.variant}`}
        estimated={clip.clock === 'estimated'}
        picture={Option.none()}
      />
    )}
  </For>
);

/** A lane's track, by its kind. */
const LaneTrack = (props: { readonly lane: Lane }) => (
  <LaneBox lane={props.lane}>
    {Match.value(props.lane).pipe(
      Match.discriminatorsExhaustive('track')({
        script: (lane) => <ScriptTrack clips={lane.clips} />,
        board: (lane) => <BoardTrack clips={lane.clips} />,
        voice: (lane) => <VoiceTrack clips={lane.clips} />,
        scenes: (lane) => <SceneTrack clips={lane.clips} />,
        sound: (lane) => <SoundTrack clips={lane.clips} />,
        render: (lane) => <RenderTrack clips={lane.clips} />,
      }),
    )}
  </LaneBox>
);

/** A flag's one word and its full title, for touch and screen readers. */
const flagWords = (marker: Marker): { readonly word: string; readonly title: string } =>
  Match.value(marker).pipe(
    Match.discriminatorsExhaustive('kind')({
      ask: (m) => ({ word: 'Ask', title: `Ask: ${m.title}` }),
      note: (m) => ({ word: 'Note', title: `Note on ${m.beat}: ${m.text}` }),
    }),
  );

/** The flag strip: open asks (white) and open notes (green), each opening its page. */
const Flags = (props: { readonly markers: ReadonlyArray<Marker> }) => {
  const scale = useScale();
  return (
    <div class="st-flags">
      <For each={props.markers}>
        {(marker) => (
          <a
            class="st-flag"
            data-kind={marker.kind}
            data-id={marker.id}
            href={marker.href}
            aria-label={flagWords(marker).title}
            title={flagWords(marker).title}
            style={{ left: `${scale.x(marker.at)}px` }}
          >
            <i class="st-pin" aria-hidden="true" />
            <span class="st-flag-word">{flagWords(marker).word}</span>
          </a>
        )}
      </For>
    </div>
  );
};

/** The ruler: a labelled tick every few seconds, as the zoom allows. */
const Ruler = (props: { readonly duration: number }) => {
  const scale = useScale();
  return (
    <For each={rulerTicks(props.duration, scale.perSecond())} keyed={false}>
      {(tick) => (
        <span class="st-tick" style={{ left: `${scale.x(tick())}px` }}>
          <span>{timecode(tick()).replace(/\.\d$/, '')}</span>
        </span>
      )}
    </For>
  );
};

/** The act bands, a transition glyph where one act gives way to the next. */
const Bands = (props: { readonly timeline: FilmTimeline }) => {
  const scale = useScale();
  return (
    <div class="st-bands" aria-label="Acts">
      <For each={props.timeline.bands}>
        {(band, i) => (
          <>
            <span
              class="st-band"
              data-band={(i() % 3) + 1}
              style={{
                left: `${scale.x(band.start)}px`,
                width: `${(band.end - band.start) * scale.perSecond()}px`,
              }}
            >
              {band.name}
            </span>
            <Show when={i() > 0}>
              <span
                class="st-tr"
                style={{ left: `${scale.x(band.start)}px` }}
                title={`${band.name} begins`}
              >
                <TransitionGlyph />
              </span>
            </Show>
          </>
        )}
      </For>
    </div>
  );
};

/** The Next row: the first stage ahead and what starts it, then the later ones, held at the view's left as one line. */
const NextRow = (props: { readonly timeline: FilmTimeline }) => (
  <Show when={Option.getOrUndefined(nextText(props.timeline))}>
    {(next) => (
      <div class="st-lane st-next" data-track="next">
        <span class="st-next-words">
          <span>{next().first}</span>
          <Show when={next().later !== ''}>
            <em>Then {next().later}</em>
          </Show>
        </span>
      </div>
    )}
  </Show>
);

/** The playhead: a red line, its pentagon head a handle that scrubs. */
const Playhead = (props: { readonly scrub: (e: PointerEvent) => void }) => {
  const { state } = useStudio();
  const scale = useScale();
  return (
    <div class="st-playhead" style={{ left: `${scale.x(state.T())}px` }} aria-hidden="true">
      <span class="st-head" onPointerDown={props.scrub} />
    </div>
  );
};

/** The zoom's corner: out, Fit (⇧Z), in. */
const ZoomCorner = () => {
  const { actions, state, meta } = useStudio();
  const keys = hubKeys(meta.hub);
  return (
    <div class="st-corner" role="group" aria-label="Zoom">
      <button
        type="button"
        class="st-tbtn"
        data-act="zoom-out"
        aria-label="Zoom out"
        onClick={actions.zoomOut}
      >
        −
      </button>
      <button
        type="button"
        class="st-tbtn"
        data-act="fit"
        aria-pressed={pressed(state.zoom() === 1)}
        title={keys.titled('Fit the film', 'studio.fit')}
        onClick={() => meta.hub.invokeId('studio.fit', BY_BUTTON)}
      >
        Fit
      </button>
      <button
        type="button"
        class="st-tbtn"
        data-act="zoom-in"
        aria-label="Zoom in"
        onClick={actions.zoomIn}
      >
        +
      </button>
    </div>
  );
};

/** The scrub surface: one press at a time, on the ruler or the playhead's head. */
const ruler = new Surface('the ruler');

/**
 * The timeline: the zoom's corner and the lane heads (laptop), the flag
 * strip, the ruler, the act bands, each lane shown and the Next row, the
 * playhead over them. A press on the ruler or the head scrubs; a clip's
 * click selects its beat.
 */
const Timeline = (props: { readonly timeline: FilmTimeline }) => {
  const { state, actions, meta } = useStudio();
  const phone = usePhone();
  const [width, setWidth] = createSignal(0, { ownedWrite: true });
  const lanes = createMemo(() => lanesShown(props.timeline, phone()));
  const perSecond = () => pxPerSecond(width(), props.timeline.duration, state.zoom());
  const scale: Scale = {
    perSecond,
    x: (T) => T * perSecond(),
    at: (px) => Bool.match(perSecond() > 0, { onTrue: () => px / perSecond(), onFalse: () => 0 }),
  };
  let scroller = Option.none<HTMLElement>();
  const sized = new ResizeObserver((entries) => {
    for (const entry of entries) setWidth(entry.contentRect.width);
  });
  onCleanup(() => sized.disconnect());
  // Measured once mounted as well: a tab in the background runs no rendering step, so its
  // ResizeObserver says nothing until it is shown, and the clips would wait at no width.
  onSettled(() => {
    Option.map(scroller, (el) => setWidth(el.clientWidth));
  });
  // A phone opens at a zoom a beat reads at; a laptop at the whole film.
  let opened = false;
  createEffect(
    () => ({ w: width(), phone: phone() }),
    ({ w, phone: onPhone }) => {
      if (opened || w <= 0) return;
      opened = true;
      if (onPhone)
        actions.zoomTo(
          zoomFor(
            PHONE_PX_PER_SECOND,
            w,
            untrack(() => props.timeline.duration),
          ),
        );
    },
  );
  // A zoom step keeps the playhead where it was on screen. Then the playhead stays in view:
  // while it plays, the view pages on past the right edge; at rest, a playhead out of view is
  // brought to the view's first third. The scroll a step starts from is the one last seen
  // (`viewLeft`, kept by the scroller's scroll events): by the time the step runs, a canvas
  // narrowed by a step out has already clamped the scroller's own.
  let shownAt = { zoom: 0, perSecond: 0 };
  let viewLeft = 0;
  createEffect(
    () => ({
      T: state.T(),
      x: scale.x(state.T()),
      playing: state.playing(),
      w: width(),
      zoom: state.zoom(),
      ps: perSecond(),
    }),
    ({ T, x, playing, w, zoom, ps }) => {
      const before = shownAt;
      shownAt = { zoom, perSecond: ps };
      Option.map(scroller, (el) => {
        if (before.perSecond > 0 && before.zoom !== zoom)
          el.scrollLeft = scrollForZoom({
            T,
            from: before.perSecond,
            to: ps,
            left: viewLeft,
            width: w,
            duration: untrack(() => props.timeline.duration),
          });
        const left = el.scrollLeft;
        viewLeft = left;
        const edge = 24;
        if (x >= left + edge && x <= left + w - edge) return;
        el.scrollLeft = Math.max(
          0,
          Bool.match(playing && x > left, { onTrue: () => x - edge, onFalse: () => x - w / 3 }),
        );
        viewLeft = el.scrollLeft;
      });
    },
  );
  const canvasAt = (e: PointerEvent): number =>
    Option.getOrElse(
      Option.map(scroller, (el) =>
        scale.at(e.clientX - el.getBoundingClientRect().left + el.scrollLeft),
      ),
      () => 0,
    );
  const scrub = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    Effect.runForkWith(meta.host)(
      Pointer.use((pointer) =>
        pointer.press(e, ruler, () => {
          actions.grab();
          actions.scrub(canvasAt(e));
          return Option.some({
            move: (ev: PointerEvent) => actions.scrub(canvasAt(ev)),
            end: () => actions.release(),
          });
        }),
      ),
    );
  };
  const next = () => Option.isSome(nextText(props.timeline));
  return (
    <section class="st-timeline" aria-label="Timeline">
      <ZoomCorner />
      <div class="st-heads" aria-hidden="true">
        <For each={lanes()}>
          {(lane) => (
            <div
              class="st-lane-head"
              data-track={lane.track}
              style={{ height: `${laneHeight(lane, phone())}px` }}
            >
              <i class="st-sw" />
              {TRACK_TITLE[lane.track]}
            </div>
          )}
        </For>
        <Show when={next()}>
          <div class="st-lane-head st-next-head" style={{ height: `${NEXT_H}px` }}>
            Next
          </div>
        </Show>
      </div>
      <div
        class="st-scroller"
        ref={(el: HTMLDivElement) => {
          scroller = Option.some(el);
          sized.observe(el);
        }}
        onScroll={(e) => {
          viewLeft = e.currentTarget.scrollLeft;
        }}
      >
        <ScaleContext value={scale}>
          <div
            class="st-canvas"
            style={{ width: `${Math.max(width(), scale.x(props.timeline.duration))}px` }}
          >
            <Flags markers={props.timeline.markers} />
            <div class="st-ruler" data-act="ruler" onPointerDown={scrub}>
              <Ruler duration={props.timeline.duration} />
            </div>
            <Bands timeline={props.timeline} />
            <div class="st-lanes">
              <For each={lanes()}>{(lane) => <LaneTrack lane={lane} />}</For>
              <NextRow timeline={props.timeline} />
            </div>
            <Playhead scrub={scrub} />
          </div>
        </ScaleContext>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------- Inspector

/**
 * The inspector's sections, in flow order, each with the track its material
 * comes from and the page the beat's material is still worked on
 * (`BeatPage`), which its row links to until the section's body holds it.
 */
const SECTIONS: ReadonlyArray<{
  readonly title: string;
  readonly track: Option.Option<Track>;
  readonly page: Option.Option<BeatPage>;
}> = [
  { title: 'Words', track: Option.some('script'), page: Option.some('Script') },
  { title: 'Concept', track: Option.some('concept'), page: Option.none() },
  { title: 'Board', track: Option.some('board'), page: Option.some('Board') },
  { title: 'Voice', track: Option.some('voice'), page: Option.none() },
  { title: 'Scene', track: Option.some('scenes'), page: Option.none() },
  { title: 'Notes and asks', track: Option.none(), page: Option.some('Lab') },
];

/** A section row's swatch, by the track its material comes from. */
const RowSwatch = (props: { readonly track: Option.Option<Track> }) => (
  <i class="st-sw" data-kind={Option.getOrElse(props.track, () => 'note')} aria-hidden="true" />
);

/** A beat's span as the inspector heads it: `2:27.6 – 3:06.1 · 38.5 s`. */
const spanText = (beat: ScriptClip) =>
  `${timecode(beat.start)} – ${timecode(beat.start + beat.dur)} · ${beat.dur.toFixed(1)} s`;

/**
 * The inspector's shell: the selected beat's head (its name, its span,
 * Approve, close) and a row for each section whose stage has material in
 * this version. The sections' bodies come with the inspector's own unit;
 * until then the Words, Board and Notes rows link to the beat on the page
 * that still holds it, at the playhead.
 */
const Inspector = () => {
  const { state, actions, meta } = useStudio();
  const keys = hubKeys(meta.hub);
  return (
    <aside class="st-insp" aria-label="Inspector">
      <Show when={Option.getOrUndefined(state.selected())}>
        {(beat) => (
          <div class="st-pane" data-beat={beat().beat}>
            <div class="st-pane-head">
              <i class="st-sw" data-kind="script" aria-hidden="true" />
              <div class="st-ttl">
                <h2>{beat().beat}</h2>
                <div class="st-sub">{spanText(beat())}</div>
              </div>
              <button type="button" class="st-btn primary" data-act="approve" disabled>
                Approve
              </button>
              <button
                type="button"
                class="st-close"
                data-act="close"
                aria-label="Close the inspector"
                title={keys.titled('Close the inspector', 'studio.close')}
                onClick={() => actions.select(Option.none())}
              >
                <StudioIcon of="close" />
              </button>
            </div>
            <For
              each={SECTIONS.filter((section) =>
                Option.match(section.track, {
                  onNone: () => true,
                  onSome: (track) =>
                    Option.exists(state.timeline(), (t) =>
                      t.lanes.some((lane) => lane.track === track),
                    ),
                }),
              )}
            >
              {(section) => (
                <Show
                  when={Option.getOrUndefined(
                    Option.flatMap(section.page, (page) =>
                      Option.flatMap(state.timeline(), (timeline) =>
                        Option.map(
                          beatPageHref(page, timeline, meta.film, beat(), state.T()),
                          (href) => ({ page, href }),
                        ),
                      ),
                    ),
                  )}
                  fallback={
                    <div class="st-row" data-section={section.title}>
                      <RowSwatch track={section.track} />
                      <span>{section.title}</span>
                      <span class="st-n">–</span>
                    </div>
                  }
                >
                  {(link) => (
                    <a
                      class="st-row"
                      data-section={section.title}
                      href={link().href}
                      title={`Open ${beat().beat} on the ${link().page} page`}
                    >
                      <RowSwatch track={section.track} />
                      <span>{section.title}</span>
                      <span class="st-n">{link().page} page</span>
                    </a>
                  )}
                </Show>
              )}
            </For>
          </div>
        )}
      </Show>
    </aside>
  );
};

// ---------------------------------------------------------------- Phone reading

/** The phone's reading block: the beat at the playhead, its words and what waits; the inspector takes its place. */
const Reading = () => {
  const { state } = useStudio();
  return (
    <section class="st-reading" aria-label="Words" aria-live="off">
      <Show when={Option.getOrUndefined(state.timeline())}>
        {(timeline) => (
          <Show when={Option.getOrUndefined(waitsText(timeline()))}>
            {(words) => <p class="st-reading-waits">{words()}</p>}
          </Show>
        )}
      </Show>
      <Show when={Option.getOrUndefined(state.current())}>
        {(beat) => (
          <>
            <div class="st-r-head">
              <b>{beat().beat}</b>
              <span>{`${timecode(beat().start)} – ${timecode(beat().start + beat().dur)}`}</span>
            </div>
            <Show when={Option.getOrUndefined(state.words(beat().beat))}>
              {(words) => (
                <>
                  <Show when={words().say}>{(say) => <p class="st-r-words">{say()}</p>}</Show>
                  <Show when={words().cite.length > 0}>
                    <p class="st-r-cite">{words().cite.join(' · ')}</p>
                  </Show>
                </>
              )}
            </Show>
          </>
        )}
      </Show>
    </section>
  );
};

// ---------------------------------------------------------------- Layout

/** Where the read stands before the timeline shows: reading, or why it could not be read. */
const Status = () => {
  const { state, actions } = useStudio();
  return (
    <Show when={state.phase() !== 'Shown'}>
      <div class="st-status-line" role="status">
        <Show when={state.phase() === 'Unreadable'} fallback={<p>Reading the timeline…</p>}>
          <p>The timeline could not be read: {state.why()}</p>
          <button type="button" class="st-btn" data-act="retry" onClick={actions.retry}>
            Try again
          </button>
        </Show>
      </div>
    </Show>
  );
};

/**
 * The studio's one grid (layout C, provisional until the owner answers the layout ask): the
 * viewer with the inspector beside it, the transport and the timeline full
 * width under them; on a phone the viewer, the transport, the timeline and
 * the reading block, the inspector in the reading block's place.
 */
const Layout = () => {
  const { state } = useStudio();
  const phone = usePhone();
  // The timeline's row is as tall as its lanes; the line that stands in for it before, one row.
  const timelineRow = () =>
    Option.match(state.timeline(), {
      onNone: () => STATUS_H,
      onSome: (t) =>
        timelineHeight(lanesShown(t, phone()), Option.isSome(nextText(t)) && !phone(), phone()),
    });
  return (
    <div
      class="st-studio"
      data-open={pressed(Option.isSome(state.selected()))}
      style={{ '--st-tl-h': `${timelineRow()}px` }}
    >
      <Viewer />
      <Transport />
      <Shown>{(timeline) => <Timeline timeline={timeline()} />}</Shown>
      <Status />
      <Inspector />
      <Reading />
    </div>
  );
};

/** The studio's page: the header over the grid. */
const Page = () => (
  <div class="st-app">
    <Header />
    <Layout />
  </div>
);

export const Studio = {
  Page,
  Header,
  Layout,
  Viewer,
  Transport,
  Timeline,
  Inspector,
  Reading,
};
