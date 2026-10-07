// A film's Scenes and Play pages' browser entry (`/films/<film>/scenes`,
// `/films/<film>/play`): the studio's shell (`film-page.tsx`), mounted as
// every studio page is (`mountStudio`), hydrated over the markup the lab
// rendered it with on the server (`film-server.tsx`) or rendered anew, then
// the preview (`mountPreview`) in the shell's body, under the Scenes' tape
// (`scenes/view.tsx`: the preview's track is its tape bar and its picture the
// selected scene's) or on its own. The render page (`mountRender`,
// `player/render.ts`) loads none of this, so it never loads Solid
// (`player/render.test.ts`).

import { Place } from '@bible/url-state';
import { Array as Arr, Effect, Match, Option, Schema } from 'effect';
import { createSignal, onCleanup, onSettled } from 'solid-js';
import { Places, pageHref } from '../core/api.ts';
import type { Placed } from '../core/layout.ts';
import { type Host, addressOn } from '../browser/host.ts';
import type { Hub } from '../command/hub.ts';
import { type Films, type Player, mountPreview, stageFilm } from '../player/main.ts';
import { TIME_MOVE, onTheMs, type TimeInUrl } from '../player/t-in-url.ts';
import { type FilmBody, PLAY_PAGE, playOn, playPartOf } from './film-page.tsx';
import { mountStudio } from './page-client.tsx';
import { useShellTime } from './page-shell.tsx';
import { scenesOpensAt, withTime } from './scenes/place.ts';
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
    write: (T, cause) => address[TIME_MOVE[cause]](pageHref.play(name, Option.some(onTheMs(T)))),
  };
};

/**
 * The Scenes' time: `#t=`, in film seconds (a scene's path with none opens
 * at the scene's start, `scenesOpensAt`), written with the path's scene kept.
 */
const scenesTime = (host: Host, placed: ReadonlyArray<Placed>): TimeInUrl => {
  const address = addressOn(host);
  return {
    at: (href) =>
      scenesOpensAt(href, (scene) =>
        Option.map(
          Arr.findFirst(placed, (p) => p.spec.id === scene),
          (p) => p.start,
        ),
      ),
    write: (T, cause) => {
      Option.map(withTime(address.href(), T), address[TIME_MOVE[cause]]);
    },
  };
};

/**
 * Play's body: the preview's stage and transport in the shell's body, its
 * HUD hearing the viewer over the shell's Play part; its time is the
 * header's timecode.
 */
const Preview = (props: { readonly player: Player; readonly stage: HTMLElement }) => {
  const [at, setAt] = createSignal(props.player.now(), { ownedWrite: true });
  onCleanup(
    props.player.onDraw((T) => {
      setAt(T);
    }),
  );
  useShellTime(at, props.player.film.fps);
  let body = Option.none<HTMLElement>();
  onSettled(() =>
    Option.getOrUndefined(
      Option.map(
        Option.flatMap(body, (el) =>
          Option.fromNullishOr(el.closest<HTMLElement>('[data-part="play"]')),
        ),
        props.player.playOn,
      ),
    ),
  );
  return (
    <div
      class="play-body"
      ref={(el: HTMLDivElement) => {
        el.append(props.stage, props.player.bar);
        body = Option.some(el);
      }}
    />
  );
};

/** Nothing: the body of a page whose film did not start (the failure is the page's). */
const NoBody = () => <></>;

/**
 * The Scenes or Play page's body for `pages` over `host`: the film its path
 * names staged, its preview mounted on the page's commands, under the
 * Scenes' tape or on its own as the link says. A film that does not start,
 * or whose faces do not load, fails the page (`fail`: its keys end, and it
 * says why in its place).
 */
const playBody =
  (pages: Films, host: Host, fail: (why: string) => Effect.Effect<void>): FilmBody =>
  (hub: Hub) =>
    Effect.runPromiseWith(host)(
      Effect.gen(function* () {
        const address = addressOn(host);
        const staged = yield* Effect.tryPromise({
          try: () => stageFilm(pages, address.href()),
          catch: (cause) => PlayStartFailed.make({ reason: String(cause) }),
        });
        const stage = staged.canvas.parentElement;
        if (!(stage instanceof HTMLElement))
          return yield* PlayStartFailed.make({ reason: 'the film has no stage' });
        const part = playPartOf(address.href());
        const player = mountPreview(
          staged,
          host,
          Match.value(part).pipe(
            Match.when('scenes', () => scenesTime(host, staged.film.placed)),
            Match.orElse(() => playTime(staged.name, host)),
          ),
          hub,
          fail,
        );
        yield* Effect.logInfo(`play.mounted film=${staged.name} part=${part}`);
        return {
          default: () =>
            Match.value(part).pipe(
              Match.when('scenes', () => (
                <ScenesView
                  name={staged.name}
                  player={player}
                  stage={stage}
                  host={host}
                  hub={hub}
                />
              )),
              Match.orElse(() => <Preview player={player} stage={stage} />),
            ),
        };
      }).pipe(
        Effect.catchTag('PlayStartFailed', (e) => Effect.as(fail(e.reason), { default: NoBody })),
      ),
    );

/**
 * Mount a film's Scenes or Play page for `pages` (its films and their
 * shorts) into the page, on the film and the part its path names: the
 * shell at once, hydrated over the server's markup or rendered anew, and
 * the preview in its body once the film is staged.
 */
export const mountPlay = (pages: Films): void =>
  // The page's commands: the shell's page keys, and the transport's.
  mountStudio({
    page: PLAY_PAGE,
    event: 'play.shell',
    on: (host, fail) => playOn(host, Object.keys(pages), playBody(pages, host, fail)),
  });
