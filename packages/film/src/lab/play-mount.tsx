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
import { Array as Arr, Effect, type Layer, Match, Option } from 'effect';
import { type Component, onSettled } from 'solid-js';
import { Places, pageHref } from '../core/api.ts';
import type { Placed } from '../core/layout.ts';
import { type Host, addressOn } from '../browser/host.ts';
import { type Films, type Player, mountPreview, stageFilm } from '../player/main.ts';
import { onTheMs } from '../core/time.ts';
import { TIME_MOVE, type TimeInUrl } from '../player/t-in-url.ts';
import { LabClient } from './api.ts';
import { type FilmBody, PLAY_PAGE, playOn, playPartOf, stagedBody } from './film-page.tsx';
import { mountStudio } from './page-client.tsx';
import { usePlayerTime } from './page-shell.tsx';
import { scenesOpensAt, withTime } from './scenes/place.ts';
import { ScenesView } from './scenes/view.tsx';

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
  usePlayerTime(props.player);
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

/** A part's time in the URL, and its body around the preview once mounted. */
interface PartOf {
  readonly time: TimeInUrl;
  readonly view: (player: Player) => Component;
}

/**
 * The Scenes or Play page's body for `pages` over `host`: the film its path
 * names staged, its preview mounted on the page's commands, under the
 * Scenes' tape or on its own as the link says. A film that does not start,
 * or whose faces do not load, fails the page (`fail`: its keys end, and it
 * says why in its place). The Scenes read and say through `client`, the
 * page's one client of the lab's API.
 */
const playBody = (
  pages: Films,
  host: Host,
  client: Layer.Layer<LabClient>,
  fail: (why: string) => Effect.Effect<void>,
): FilmBody =>
  stagedBody(
    host,
    () => stageFilm(pages, addressOn(host).href()),
    fail,
    (staged, hub) => {
      const part = playPartOf(addressOn(host).href());
      const { time, view } = Match.value(part).pipe(
        Match.when('scenes', (): PartOf => ({
          time: scenesTime(host, staged.film.placed),
          view: (player) => () => (
            <ScenesView
              name={staged.name}
              player={player}
              stage={staged.stage}
              host={host}
              hub={hub}
              client={client}
            />
          ),
        })),
        Match.orElse((): PartOf => ({
          time: playTime(staged.name, host),
          view: (player) => () => <Preview player={player} stage={staged.stage} />,
        })),
      );
      const player = mountPreview(staged, host, time, hub, fail);
      return Effect.as(
        Effect.logInfo(`play.mounted film=${staged.name} part=${part}`),
        view(player),
      );
    },
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
    on: (host, fail) =>
      playOn(host, Object.keys(pages), playBody(pages, host, LabClient.layer, fail)),
  });
