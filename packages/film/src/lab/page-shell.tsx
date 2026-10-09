// The studio's one shell (design language §4), on every page from Films to
// the Lab: the header (Films, the film switcher, the page bar, the
// drill-down crumb, the page's own tools, the timecode, Go to… ⌘K, the
// view menu ⋯) over
// the page. The page bar is Films · Scenes · Lab · Choices · Project ·
// Play, each a link printed by its place (`partHref`) and each on its key
// (⇧1-⇧6, `partCommands`); from Scenes, the Lab or Play the others of
// those three open at the header's playhead (`filmTimeOn`); on a phone its five film tabs are a tab bar along
// the bottom (56 px over the safe area) and Films is the header's leading
// square. Every move between parts is here, the switcher or a command that
// lands on a part's tab: no page links to another part in its text. The
// film the tabs lead into is the page's, or on Films the one last opened
// (a per-viewer convenience kept in this browser, safe to lose). A page
// with a playhead shows its time in the header as a timecode
// (`useShellTime`), and a page below a part names its depth in one crumb
// (`crumb`); a tap on the timecode copies the link to here (AA-1). The
// tab's title names what the page has selected (`subject`) before the rest.

import { Menu } from '@bible/ui/menu';
import { useAtomSet, useAtomValue } from '@bible/atom-solid';
import { For, type JSX, Portal, Show, isServer, useHead } from '@solidjs/web';
import { Effect, Option } from 'effect';
import {
  type Accessor,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  onSettled,
  type ParentProps,
  useContext,
} from 'solid-js';
import { PARTS, PART_TITLE, type Part, filmTimeOn, hasPart, partHref } from '../core/api.ts';
import { FILM_FPS, timecodeParts } from '../core/time.ts';
import type { Host } from '../browser/host.ts';
import { PageLoad } from '../browser/page-load.ts';
import { plainClick } from '../browser/pointer.ts';
import { keptText } from '../browser/storage.ts';
import { ViewerStore } from '../browser/storage-browser.ts';
import type { Hub } from '../command/hub.ts';
import { BY_BUTTON } from '../command/command.ts';
import type { Player } from '../player/main.ts';
import { filmCommands, partCommandId, partCommands } from '../command/go.ts';
import { hubKeys } from './command/changes.ts';
import { COMMAND_MENU, GO_TO_COMMAND } from './command/command-menu.tsx';
import { ViewMenu } from './command/view-menu.tsx';
import { pageTitle } from './page-title.ts';
import { pressed } from './pressed.ts';

/** The film last opened in this browser: where the tabs lead from Films. */
const lastFilm = keptText(ViewerStore, 'film-studio.film');

/** A playhead the header shows: its time, in seconds, and its frame rate. */
interface ShellTime {
  readonly t: number;
  readonly fps: number;
}

/** Where a page writes the playhead the header shows. */
const ShellContext = createContext<Option.Option<(time: Option.Option<ShellTime>) => void>>(
  Option.none(),
);

/**
 * Show `at` (seconds, at `fps`) as the header's timecode for as long as the
 * calling component is mounted: its values are written to the shell as they
 * change (the shell holds no accessor of the component's, which would read
 * stale once the component is gone). The server's render writes none, not
 * even as it lets the component go: nothing it renders runs again.
 */
export const useShellTime = (at: Accessor<number>, fps: number = FILM_FPS): void => {
  Option.map(useContext(ShellContext), (write) => {
    createEffect(at, (t) => {
      write(Option.some({ t, fps }));
    });
    if (!isServer) onCleanup(() => write(Option.none()));
  });
};

/**
 * Show `player`'s playhead as the header's timecode for as long as the
 * calling component is mounted: every time it moves, drawn or not (a frame
 * waits on the film's faces; the time does not).
 */
export const usePlayerTime = (player: Pick<Player, 'now' | 'onMove' | 'film'>): void => {
  const [at, setAt] = createSignal(player.now(), { ownedWrite: true });
  onCleanup(
    player.onMove((T) => {
      setAt(T);
    }),
  );
  useShellTime(at, player.film.fps);
};

/** The header's slot for a page's own tools, before the timecode: none until the page is the client's. */
const ToolsContext = createContext<Accessor<Option.Option<HTMLElement>>>(() => Option.none());

/**
 * Put `children` in the header, before the timecode, for as long as this is
 * mounted: a page's own tools (the Lab's Undo and Redo), wherever in the
 * page they are made, so they read the context they are made in. They are
 * the client's: a server render, and the client's hydration of it, leave
 * the slot empty, and the tools land in it once the page is mounted.
 */
export const ShellTools = (props: ParentProps) => {
  const slot = useContext(ToolsContext);
  return (
    <Show when={Option.getOrUndefined(slot())}>
      {(at) => <Portal mount={at()}>{props.children}</Portal>}
    </Show>
  );
};

/** The shell's icons, by name. */
type IconName = Part | 'search' | 'chevron' | 'undo' | 'redo' | 'hear';

/**
 * Each icon's strokes, drawn only for the icon shown: an element made is a
 * hydration key taken, so the browser making every icon's strokes to show
 * one would look for strokes the server never wrote.
 */
const ICON_STROKES: Readonly<Record<IconName, () => JSX.Element>> = {
  films: () => (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" />
      <rect x="13.5" y="3.5" width="7" height="7" />
      <rect x="3.5" y="13.5" width="7" height="7" />
      <rect x="13.5" y="13.5" width="7" height="7" />
    </>
  ),
  scenes: () => (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" />
      <path d="M8.5 5.5v13M15.5 5.5v13" />
    </>
  ),
  lab: () => (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  choices: () => <path d="M4 6h16M4 12h16M4 18h8M15 17.5l2 2 3.5-4" />,
  project: () => (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" />
      <path d="M8 12.5l3 3 5-6" />
    </>
  ),
  play: () => <path d="M7 4.5l12 7.5-12 7.5z" />,
  search: () => (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </>
  ),
  chevron: () => <path d="M7 10l5 5 5-5" />,
  undo: () => <path d="M9 6l-5 5 5 5M4 11h10a6 6 0 0 1 6 6v1" />,
  redo: () => <path d="M15 6l5 5-5 5M20 11H10a6 6 0 0 0-6 6v1" />,
  hear: () => (
    <path d="M4 9.5h3.5l4.5-4v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  ),
};

/** A line icon of the shell's, 20 px in the tab bar and 16 px in the header. */
const Icon = (props: { readonly of: IconName }) => (
  <svg class="sh-icon" viewBox="0 0 24 24" aria-hidden="true">
    {ICON_STROKES[props.of]()}
  </svg>
);

/** The speaker a hear button holds: the shell's line icon, so the kit's pressed colour reaches it. */
export const HearIcon = () => <Icon of="hear" />;

/**
 * One of a page's own tools in the header (`ShellTools`, the Lab's Undo and
 * Redo): a square icon button, its name for a reader and its keys in its
 * title; a step with nothing to take is disabled.
 */
export const HeaderTool = (props: {
  readonly act: 'undo' | 'redo';
  readonly label: string;
  readonly title: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
}) => (
  <button
    type="button"
    class="sh-tool"
    data-act={props.act}
    aria-label={props.label}
    title={props.title}
    disabled={props.disabled}
    onClick={() => props.onClick()}
  >
    <Icon of={props.act} />
  </button>
);

/** A timecode, `HH:MM:SS:FF`: separators dim, the frames field secondary. */
const Timecode = (props: {
  readonly seconds: number;
  readonly fps?: number;
  readonly class?: string;
}) => {
  const parts = () => timecodeParts(props.seconds, props.fps);
  return (
    <span class={['sh-timecode', props.class]}>
      <Show when={parts().negative}>−</Show>
      {parts().hh}
      <i>:</i>
      {parts().mm}
      <i>:</i>
      {parts().ss}
      <i>:</i>
      <span class="sh-ff">{parts().ff}</span>
    </span>
  );
};

interface PageShellProps {
  /** The part the page is (Films for a folder or a set not of a film). */
  readonly part: Accessor<Part>;
  /** The film the page is of, if any. */
  readonly film: Accessor<Option.Option<string>>;
  /** Every film the switcher offers. */
  readonly films: Accessor<ReadonlyArray<string>>;
  readonly hub: Hub;
  readonly host: Host;
  /** Move to `href` within this page, answering whether it did; otherwise the link loads its page. */
  readonly follow?: (href: string) => boolean;
  /** The page's depth below its part, after the page bar (`cold · versions`). */
  readonly crumb?: Accessor<Option.Option<string>>;
  /** What the page has selected (a scene), first in the tab's title; the page's body shows it, so the header does not. */
  readonly subject?: Accessor<Option.Option<string>>;
  readonly children: JSX.Element;
}

/** An ARIA `aria-current` by whether the tab is the page's. */
const CURRENT = { true: 'page', false: 'false' } as const;

/** The part a film switch lands on: the same part of the other film; Scenes from Films. */
const filmPart = (part: Part): Part =>
  Option.getOrElse(
    Option.liftPredicate(part, (p) => p !== 'films'),
    (): Part => 'scenes',
  );

/** A name the page may give (its crumb, its subject): none where it gives none. */
const given = (at: PageShellProps['crumb']): Option.Option<string> =>
  Option.flatMap(Option.fromUndefinedOr(at), (read) => read());

/** The studio's shell around a page. */
export const PageShell = (props: PageShellProps) => {
  const kept = useAtomValue(() => lastFilm);
  const keep = useAtomSet(() => lastFilm);
  createEffect(props.film, (film) => {
    Option.map(film, keep);
  });
  /** The film the tabs lead into: the page's, else the one last opened. */
  const film = () => Option.orElse(props.film(), kept);
  // The tab's title is the shell's, printed once for the server's head and the browser's
  // (`useHead`): the served page is titled before it hydrates.
  useHead(() => ({
    tag: 'title',
    props: {
      children: pageTitle([given(props.subject), given(props.crumb)], props.part(), props.film()),
    },
  }));
  const [time, setTime] = createSignal(Option.none<ShellTime>(), { ownedWrite: true });
  // The page's own tools land here (`ShellTools`), laid out as the header's
  // own controls, once the page is mounted (its element is the client's).
  let toolsAt = Option.none<HTMLElement>();
  const [tools, setTools] = createSignal(Option.none<HTMLElement>(), { ownedWrite: true });
  onSettled(() => {
    setTools(toolsAt);
  });
  const go = (href: string) => {
    if (props.follow?.(href) === true) return;
    Effect.runForkWith(props.host)(PageLoad.use((load) => load.open(href)));
  };
  /** A page bar link's click: within the page when it can, else the link's own load. */
  const onLink = (href: string) => (e: MouseEvent) => {
    if (!plainClick(e) || props.follow?.(href) !== true) return;
    e.preventDefault();
  };
  /** The playhead the header shows, as the time a move to another part keeps. */
  const at = () => Option.map(time(), (shown) => shown.t);
  onCleanup(
    props.hub.commands.register(...partCommands(film, props.part, go, at), ...filmCommands(go)),
  );
  // Each names its key as bound now: a rebound key reads as rebound.
  const keys = hubKeys(props.hub);
  const tab = (part: Part) => (
    <Show
      when={Option.getOrUndefined(
        Option.map(
          Option.filter(film(), (f) => hasPart(f, part)),
          (f) => partHref(part, f, filmTimeOn(props.part(), at())),
        ),
      )}
      fallback={
        <span class="sh-tab" data-page={part} data-disabled="">
          <Icon of={part} />
          <span>{PART_TITLE[part]}</span>
        </span>
      }
    >
      {(href) => (
        <a
          class="sh-tab"
          data-page={part}
          href={href()}
          data-active={pressed(props.part() === part)}
          aria-current={CURRENT[pressed(props.part() === part)]}
          title={keys.titled(PART_TITLE[part], partCommandId(part))}
          onClick={(e: MouseEvent) => onLink(href())(e)}
        >
          <Icon of={part} />
          <span>{PART_TITLE[part]}</span>
        </a>
      )}
    </Show>
  );
  return (
    <ShellContext value={Option.some(setTime)}>
      <ToolsContext value={tools}>
        <div class="sh" data-part={props.part()} data-film={pressed(Option.isSome(film()))}>
          <header class="sh-header">
            <a
              class="sh-films"
              data-page="films"
              href={partHref('films', '')}
              data-active={pressed(props.part() === 'films')}
              aria-current={CURRENT[pressed(props.part() === 'films')]}
              aria-label="Films"
              title={keys.titled('Films', partCommandId('films'))}
              onClick={onLink(partHref('films', ''))}
            >
              <Icon of="films" />
              <span>Films</span>
            </a>
            <span class="sh-vsep" />
            <Menu.Root>
              <Menu.Trigger class="sh-switcher" data-act="switch-film" title="Switch film">
                <span>{Option.getOrElse(film(), () => 'Choose a film')}</span>
                <Icon of="chevron" />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner class="lab-context-positioner" sideOffset={4} align="start">
                  <Menu.Popup class="lab-context-menu" data-role="film-menu">
                    <For each={props.films()}>
                      {(name) => (
                        <Menu.Item
                          class="lab-context-item"
                          data-film={name}
                          label={name}
                          onClick={() => {
                            go(partHref(filmPart(props.part()), name));
                          }}
                        >
                          <span>{name}</span>
                          <Show when={Option.contains(film(), name)}>
                            <kbd>✓</kbd>
                          </Show>
                        </Menu.Item>
                      )}
                    </For>
                    <Menu.Separator class="lab-context-separator" />
                    <Menu.Item
                      class="lab-context-item"
                      label="Copy link"
                      onClick={() => props.hub.invokeId('link.copy', BY_BUTTON)}
                    >
                      <span>Copy link</span>
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
            <nav class="sh-pagebar" aria-label="Pages">
              <For each={PARTS.filter((p) => p !== 'films')}>{(part) => tab(part)}</For>
            </nav>
            <Show when={Option.getOrUndefined(given(props.crumb))}>
              {(text) => (
                <span class="sh-crumb" data-role="crumb">
                  <i>›</i>
                  {text()}
                </span>
              )}
            </Show>
            <span class="sh-spacer" />
            <span
              class="sh-tools"
              ref={(el) => {
                toolsAt = Option.some(el);
              }}
            />
            <Show when={Option.getOrUndefined(time())}>
              {(shown) => (
                <button
                  type="button"
                  class="sh-tc"
                  data-act="timecode"
                  title="Copy the link to here"
                  onClick={() => props.hub.invokeId('link.copy', BY_BUTTON)}
                >
                  <Timecode seconds={shown().t} fps={shown().fps} />
                </button>
              )}
            </Show>
            <button
              type="button"
              class="sh-goto"
              data-act="search"
              aria-label="Go to…"
              title={`Go to a film, a part or a thing by name, or run a command (${[
                GO_TO_COMMAND,
                COMMAND_MENU,
              ]
                .map(keys.first)
                .filter((k) => k !== '')
                .join(' or ')})`}
              onClick={() => props.hub.invokeId(GO_TO_COMMAND, BY_BUTTON)}
            >
              <Icon of="search" />
              <span>Go to…</span>
              <kbd>{keys.first(COMMAND_MENU)}</kbd>
            </button>
            <ViewMenu hub={props.hub} />
          </header>
          <div class="sh-body">{props.children}</div>
        </div>
      </ToolsContext>
    </ShellContext>
  );
};
