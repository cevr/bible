// A film's own pages in the studio's shell, the Lab (`/films/<film>/lab…`)
// and the Scenes and Play pages (`/films/<film>/scenes`, `/films/<film>/play`),
// as the browser and the server both render them: the shell
// (`page-shell.tsx`: the header, the film switcher, the tab bar, Go to…),
// the context menu, ⌘K, the `?` sheet and the receipts, around the page's
// body, and on the Lab its panel (`panel.tsx`: the mode tray, each tool's
// section, the film's notes). The body is the film's and the browser's
// alone (`clientOnly`): the canvas, the scene code and the stills are drawn
// from the film's modules, which the server never imports (Fresh reads,
// `filmCode` in `tools/lab-page.ts`). The server, and the browser while it
// hydrates, render the body's place as a quiet line; the browser then stages
// the film and puts the body there, the Lab's tools in its panel
// (`mount.tsx`, `play-mount.tsx`). Neither side's own adapters are imported
// here: the page's reads go through the client it is given.

import { RegistryProvider, useAtomValue } from '@bible/atom-solid';
import * as UrlAtom from '@bible/url-state/atom';
import { type JSX, clientOnly } from '@solidjs/web';
import type { Component } from 'solid-js';
import { Effect, type Layer, Match, Option, Schema } from 'effect';
import { type PageName, type Part, filmOfPage } from '../core/api.ts';
import { type Host, addressOn, hostLayer } from '../browser/host.ts';
import type { Hub } from '../command/hub.ts';
import type { LabClient } from './api.ts';
import { COMMAND_CSS } from './command/style.ts';
import { PageShell } from './page-shell.tsx';
import { SHELL_CSS } from './page-shell-style.ts';
import { LabPage } from './panel.tsx';
import { labPlaceOf } from './place.ts';
import { scenesPlaceOf } from './scenes/place.ts';
import { COMMENTS_CSS } from './review/comments-style.ts';
import { SCENES_CSS } from './scenes/style.ts';
import { StudioFrame, studioOn } from './studio-frame.tsx';

/**
 * A film page's body, made once its film is staged, with the page's
 * commands: what the browser's entry loads (`clientOnly`). The server's
 * never runs.
 */
export type FilmBody = (hub: Hub) => Promise<{ readonly default: Component }>;

/** The body of a page the server renders: never loaded, as the server stages no film. */
export const SERVER_BODY: FilmBody = () =>
  Effect.runPromise(Effect.die('a page rendered on the server stages no film'));

/** A film page could not start: its film did not load, or the registry has no such film. */
class FilmStartFailed extends Schema.TaggedError<FilmStartFailed>()('FilmStartFailed', {
  reason: Schema.String,
}) {}

/** Nothing: the body of a page whose film did not start (the failure is the page's). */
const NoBody: Component = () => <></>;

/**
 * A film page's body over `host` (the browser's entries, `mount.tsx`,
 * `play-mount.tsx`): its film staged (`stage`), then `view` of it with the
 * page's commands. A film that does not start fails the page (`fail`: it
 * ends, and says why in its place), and the body is nothing.
 */
export const stagedBody =
  <S,>(
    host: Host,
    stage: () => Promise<S>,
    fail: (why: string) => Effect.Effect<void>,
    view: (staged: S, hub: Hub) => Effect.Effect<Component>,
  ): FilmBody =>
  (hub) =>
    Effect.runPromiseWith(host)(
      Effect.tryPromise({
        try: stage,
        catch: (cause) => FilmStartFailed.make({ reason: String(cause) }),
      }).pipe(
        Effect.flatMap((staged) => view(staged, hub)),
        Effect.map((body) => ({ default: body })),
        Effect.catchTag('FilmStartFailed', (e) => Effect.as(fail(e.reason), { default: NoBody })),
      ),
    );

/** The parts a film's page is: the Lab, or the Scenes or Play page (the player's). */
type FilmPart = Extract<Part, 'lab' | 'scenes' | 'play'>;

/** What a film's page puts around its body, made in its place when it is asked. */
type PageAround = (body: () => JSX.Element) => JSX.Element;

/** What a film's page is rendered with. */
interface FilmPageWith {
  readonly part: FilmPart;
  /** The film its path names: none on a path naming none. */
  readonly name: Option.Option<string>;
  /** The app's films, the switcher's: none on the server (its menu opens only in the browser). */
  readonly films: ReadonlyArray<string>;
  readonly host: Host;
  readonly hub: Hub;
  /** The receipts' scope in the tab's store: the page's kind and its film. */
  readonly scope: string;
  readonly body: FilmBody;
  /** What the page's part puts around its body: the Lab's panel; Scenes and Play, nothing. */
  readonly around: PageAround;
}

/** The body's place before the film is staged: the server's, and the browser's while it loads the film. */
const Await = (props: { readonly name: Option.Option<string> }) => (
  <p class="sh-await" role="status">
    {`Opening ${Option.getOrElse(props.name, () => 'the film')}…`}
  </p>
);

/**
 * A film's page: the shell around its body, with its context menu, ⌘K, the
 * `?` sheet and the receipts. The registry's URL atoms read and write
 * through the host's own Location and UrlState (its layer seeded, so
 * neither side builds the browser's own), so they and the time the player
 * writes share one address bar.
 */
const FilmPage = (props: FilmPageWith) => (
  <RegistryProvider initialValues={[[UrlAtom.layer, hostLayer(props.host)]]}>
    <StudioFrame hub={props.hub} scope={props.scope} legend>
      <FilmShell {...props} />
    </StudioFrame>
  </RegistryProvider>
);

/** The scene a film page's link selects, which its title names first: the Lab's and the Scenes'. */
const sceneOf = (part: FilmPart, href: string): Option.Option<string> =>
  Match.value(part).pipe(
    Match.when('lab', () => labPlaceOf(href).scene),
    Match.when('scenes', () => Option.flatMap(scenesPlaceOf(href), (place) => place.scene)),
    Match.orElse(() => Option.none<string>()),
  );

/** A film page's shell around its body, its title naming the scene its link selects. */
const FilmShell = (props: FilmPageWith) => {
  const Body = clientOnly(() => props.body(props.hub));
  const href = useAtomValue(() => UrlAtom.href);
  return (
    <PageShell
      part={(): Part => props.part}
      film={() => props.name}
      films={() => props.films}
      hub={props.hub}
      host={props.host}
      subject={() => sceneOf(props.part, href())}
    >
      {props.around(() => (
        <Body fallback={<Await name={props.name} />} />
      ))}
    </PageShell>
  );
};

/** A film's page as the browser and the server both render it (`page-server.tsx`, `page-client.tsx`). */
interface FilmPageSpec {
  readonly bodyClass: string;
  readonly rootClass: string;
  readonly style: string;
}

/** The Lab's page. */
export const LAB_PAGE: FilmPageSpec = {
  bodyClass: 'lab',
  rootClass: 'lab-root',
  style: `${SHELL_CSS}${COMMAND_CSS}`,
};

/** The Scenes and Play pages' page. */
export const PLAY_PAGE: FilmPageSpec = {
  bodyClass: 'play',
  rootClass: 'play-root',
  style: `${SHELL_CSS}${COMMAND_CSS}${SCENES_CSS}${COMMENTS_CSS}`,
};

/** The Scenes page on a Scenes link (`/films/<film>/scenes…`), else Play. */
export const playPartOf = (href: string): FilmPart =>
  Option.match(scenesPlaceOf(href), {
    onNone: (): FilmPart => 'play',
    onSome: (): FilmPart => 'scenes',
  });

/** What a page of film `name` puts around its body, given its host and commands. */
type AroundOf = (name: string, host: Host, hub: Hub) => PageAround;

/**
 * A film's page of `part` over `host`, as page `page`'s commands
 * (`command/hub.ts`, their keys not yet heard), with `body` in it once
 * staged and `around` it: its commands and its app, for the browser to
 * mount or hydrate and the server to render. Its receipts are kept under
 * `scope` and the film.
 */
const filmPageOn = (
  page: PageName,
  scope: string,
  part: (href: string) => FilmPart,
  host: Host,
  films: ReadonlyArray<string>,
  body: FilmBody,
  around: AroundOf,
) => {
  const href = addressOn(host).href;
  return studioOn(page, host, (hub) => {
    const name = filmOfPage(href());
    const film = Option.getOrElse(name, () => '');
    return () => (
      <FilmPage
        part={part(href())}
        name={name}
        films={films}
        host={host}
        hub={hub}
        scope={`${scope}:${film}`}
        body={body}
        around={around(film, host, hub)}
      />
    );
  });
};

/**
 * The Lab over `host`, its panel's reads through `client` (the page's one
 * client of the lab's API), its body `body` once the film is staged.
 */
export const labOn = (
  host: Host,
  films: ReadonlyArray<string>,
  client: Layer.Layer<LabClient>,
  body: FilmBody,
) =>
  filmPageOn(
    'lab',
    'lab',
    (): FilmPart => 'lab',
    host,
    films,
    body,
    (name, at, hub) => (made) => (
      <LabPage name={name} host={at} hub={hub} client={client}>
        {made()}
      </LabPage>
    ),
  );

/** The Scenes or Play page over `host`, as its link says, its body `body` once the film is staged. */
export const playOn = (host: Host, films: ReadonlyArray<string>, body: FilmBody) =>
  filmPageOn('player', 'player', playPartOf, host, films, body, () => (made) => made());
