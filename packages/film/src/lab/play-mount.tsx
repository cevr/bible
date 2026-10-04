// A film's Scenes and Play pages (`/films/<film>/scenes`, `/films/<film>/play`)
// in the studio's shell (`page-shell.tsx`): the preview (`mountPreview`)
// inside the shell's body, under the Scenes' tape (`scenes/view.tsx`: the
// preview's track is its tape bar and its picture the selected scene's) or
// on its own, the shell's header over it, and the page's commands with ⌘K,
// the context menu, the receipts and the `?` sheet. The render page
// (`mountRender`, `player/main.ts`) loads none of this, so it never loads
// Solid.

import { render } from '@solidjs/web';
import { Place } from '@bible/url-state';
import { Effect, Match, Option, Schema } from 'effect';
import { createSignal, onCleanup } from 'solid-js';
import { type Part, Places, legacyPlace, pageHref } from '../core/api.ts';
import { type Host, addressOn, hostOf } from '../browser/host.ts';
import { BrowserHost } from '../browser/host-browser.ts';
import { TabStore, ViewerStore } from '../browser/storage-browser.ts';
import { type Hub, makeHub } from '../command/hub.ts';
import { registerFace } from '../player/face.ts';
import { type Films, type Player, mountPreview, showFailure, stageFilm } from '../player/main.ts';
import { onTheMs, type TimeInUrl } from '../player/t-in-url.ts';
import { CommandMenu } from './command/command-menu.tsx';
import { TargetMenu } from './command/context-menu.tsx';
import { KeysSheet } from './command/keys-sheet.tsx';
import { Receipts } from './command/receipts.tsx';
import { COMMAND_CSS } from './command/style.ts';
import { PageShell, useShellTime } from './page-shell.tsx';
import { SHELL_CSS } from './page-shell-style.ts';
import { scenesPlaceOf, withTime } from './scenes/place.ts';
import { SCENES_CSS } from './scenes/style.ts';
import { ScenesView } from './scenes/view.tsx';

/** The page could not start: the film did not load, or the registry has no such film. */
class PlayStartFailed extends Schema.TaggedError<PlayStartFailed>()('PlayStartFailed', {
  reason: Schema.String,
}) {}

/** The play page's time: `#t=`, in film seconds. */
const playTime = (name: string, host: Host): TimeInUrl => {
  const address = addressOn(host);
  return {
    at: (href) =>
      Option.getOrElse(
        Option.flatMap(Place.decode(Places.play, href), (v) => v.hash.t),
        () => 0,
      ),
    write: (T) => address.replace(pageHref.play(name, Option.some(onTheMs(T)))),
  };
};

/** The Scenes' time: `#t=`, in film seconds, written with the path's scene kept. */
const scenesTime = (host: Host): TimeInUrl => {
  const address = addressOn(host);
  return {
    at: (href) =>
      Option.getOrElse(
        Option.flatMap(scenesPlaceOf(href), (p) => p.t),
        () => 0,
      ),
    write: (T) => {
      Option.map(withTime(address.href(), T), address.replace);
    },
  };
};

/** The preview's stage and transport in the shell's body; its time is the header's timecode. */
const Preview = (props: { readonly player: Player; readonly stage: HTMLElement }) => {
  const [at, setAt] = createSignal(props.player.now(), { ownedWrite: true });
  onCleanup(
    props.player.onDraw((T) => {
      setAt(T);
    }),
  );
  useShellTime(at, props.player.film.fps);
  return (
    <div
      class="play-body"
      ref={(el: HTMLDivElement) => {
        el.append(props.stage, props.player.bar);
      }}
    />
  );
};

/** What the page shows in the shell: the Scenes' tape over the preview, or the preview alone. */
interface Shown {
  readonly part: 'scenes' | 'play';
  readonly player: Player;
  readonly stage: HTMLElement;
}

const PlayPage = (props: {
  readonly name: string;
  readonly films: ReadonlyArray<string>;
  readonly shown: Shown;
  readonly host: Host;
  readonly hub: Hub;
}) => {
  const shown = props.shown;
  return (
    <>
      <PageShell
        part={(): Part => shown.part}
        film={() => Option.some(props.name)}
        films={() => props.films}
        hub={props.hub}
        host={props.host}
      >
        <TargetMenu hub={props.hub}>
          {Match.value(shown.part).pipe(
            Match.when('scenes', () => (
              <ScenesView
                name={props.name}
                player={shown.player}
                stage={shown.stage}
                host={props.host}
                hub={props.hub}
              />
            )),
            Match.orElse(() => <Preview player={shown.player} stage={shown.stage} />),
          )}
        </TargetMenu>
      </PageShell>
      <CommandMenu hub={props.hub} />
      <KeysSheet hub={props.hub} />
      <Receipts hub={props.hub} tab={TabStore} scope={`player:${props.name}`} />
    </>
  );
};

const start = Effect.fn('play.start')(
  function* (pages: Films, host: Host) {
    const address = addressOn(host);
    // An old link the server could not see all of (a bare `#<seconds>`) goes on to its place.
    Option.map(legacyPlace(address.href()), address.replace);
    // The UI face first, so the fonts the film waits on include it.
    registerFace(document.fonts);
    const style = document.createElement('style');
    style.textContent = `${SHELL_CSS}${COMMAND_CSS}${SCENES_CSS}`;
    document.head.append(style);
    const staged = yield* Effect.tryPromise({
      try: () => stageFilm(pages, address.href()),
      catch: (cause) => PlayStartFailed.make({ reason: String(cause) }),
    });
    const stage = staged.canvas.parentElement;
    if (!(stage instanceof HTMLElement))
      return yield* PlayStartFailed.make({ reason: 'the film has no stage' });
    // The page's commands and its one key listener: the shell's page keys, and the transport's.
    const hub = yield* makeHub('player', address.href, ViewerStore);
    yield* Effect.forkDetach(hub.listen);
    const scenes = Option.isSome(scenesPlaceOf(address.href()));
    const shown: Shown = {
      part: Match.value(scenes).pipe(
        Match.when(true, (): Shown['part'] => 'scenes'),
        Match.orElse((): Shown['part'] => 'play'),
      ),
      player: mountPreview(
        staged,
        host,
        Match.value(scenes).pipe(
          Match.when(true, () => scenesTime(host)),
          Match.orElse(() => playTime(staged.name, host)),
        ),
        hub,
      ),
      stage,
    };
    const root = document.createElement('div');
    root.className = 'play-root';
    document.body.append(root);
    render(
      () => (
        <PlayPage
          name={staged.name}
          films={Object.keys(pages)}
          shown={shown}
          host={host}
          hub={hub}
        />
      ),
      root,
    );
    yield* Effect.logInfo(`play.mounted film=${staged.name} part=${shown.part}`);
  },
  Effect.catchTag('PlayStartFailed', (e) => Effect.sync(() => showFailure(e.reason))),
);

/**
 * Mount a film's Scenes or Play page for `pages` (its films and their
 * shorts) into the page, on the film and the part its path names.
 */
export const mountPlay = (pages: Films): void => {
  const host = hostOf(BrowserHost.layer);
  Effect.runForkWith(host)(start(pages, host));
};
