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

import { RegistryProvider } from '@bible/atom-solid';
import * as UrlAtom from '@bible/url-state/atom';
import { type JSX, clientOnly } from '@solidjs/web';
import type { Component } from 'solid-js';
import { Effect, type Layer, Option } from 'effect';
import { type PageName, type Part, filmOfPage } from '../core/api.ts';
import { type Host, addressOn, hostLayer } from '../browser/host.ts';
import { TabStore, ViewerStore } from '../browser/storage-browser.ts';
import { type Hub, makeHub } from '../command/hub.ts';
import type { LabClient } from './api.ts';
import { CommandMenu } from './command/command-menu.tsx';
import { TargetMenu } from './command/context-menu.tsx';
import { KeysSheet } from './command/keys-sheet.tsx';
import { Receipts } from './command/receipts.tsx';
import { PageShell } from './page-shell.tsx';
import { PAGE_STYLES } from './page-styles.ts';
import { LabPage } from './panel.tsx';
import { scenesPlaceOf } from './scenes/place.ts';

/**
 * A film page's body, made once its film is staged, with the page's
 * commands: what the browser's entry loads (`clientOnly`). The server's
 * never runs.
 */
export type FilmBody = (hub: Hub) => Promise<{ readonly default: Component }>;

/** The body of a page the server renders: never loaded, as the server stages no film. */
export const SERVER_BODY: FilmBody = () =>
  Effect.runPromise(Effect.die('a page rendered on the server stages no film'));

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
 * through the host's own Location (seeded, so neither side builds the
 * browser's own), so they and the time the player writes share one address
 * bar.
 */
const FilmPage = (props: FilmPageWith) => {
  const Body = clientOnly(() => props.body(props.hub));
  return (
    <RegistryProvider
      initialValues={[
        [UrlAtom.layer, hostLayer(props.host)],
        [UrlAtom.services, props.host],
      ]}
    >
      <TargetMenu hub={props.hub}>
        <PageShell
          part={(): Part => props.part}
          film={() => props.name}
          films={() => props.films}
          hub={props.hub}
          host={props.host}
        >
          {props.around(() => (
            <Body fallback={<Await name={props.name} />} />
          ))}
        </PageShell>
        <CommandMenu hub={props.hub} />
        <KeysSheet hub={props.hub} />
        <Receipts hub={props.hub} tab={TabStore} scope={props.scope} />
      </TargetMenu>
    </RegistryProvider>
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
  style: PAGE_STYLES.lab,
};

/** The Scenes and Play pages' page. */
export const PLAY_PAGE: FilmPageSpec = {
  bodyClass: 'play',
  rootClass: 'play-root',
  style: PAGE_STYLES.play,
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
  return Effect.map(makeHub(page, href, ViewerStore), (hub) => {
    const name = filmOfPage(href());
    const film = Option.getOrElse(name, () => '');
    return {
      hub,
      app: () => (
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
      ),
    };
  }).pipe(Effect.provideContext(host));
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
