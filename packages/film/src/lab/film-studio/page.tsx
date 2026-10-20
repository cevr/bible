// A film's studio page (`/films/<film>/studio`), as the browser and the
// server both render it: the studio's frame (`studio-frame.tsx`: the
// context menu, ⌘K, the `?` sheet, the receipts) around the studio. The
// studio itself is the browser's alone (`clientOnly`): its viewer draws the
// film from the film's modules, which the server never imports. The server,
// and the browser while it hydrates, render the header's film name and a
// quiet line; the browser then stages the film (`mount.tsx`) and the
// studio takes their place.

import { RegistryProvider } from '@bible/atom-solid';
import * as UrlAtom from '@bible/url-state/atom';
import { clientOnly } from '@solidjs/web';
import type { Component } from 'solid-js';
import { Option } from 'effect';
import { type Host, addressOn, hostLayer } from '../../browser/host.ts';
import { filmOfPage, pageHref } from '../../core/api.ts';
import type { Hub } from '../../command/hub.ts';
import { COMMAND_CSS } from '../command/style.ts';
import { StudioFrame, studioOn } from '../studio-frame.tsx';
import { StudioIcon } from './icons.tsx';
import { STUDIO_CSS } from './style.ts';

/**
 * The studio's body, made once its film is staged, with the page's
 * commands: what the browser's entry loads (`clientOnly`). The server's
 * never runs.
 */
export type FilmBody = (hub: Hub) => Promise<{ readonly default: Component }>;

/** The studio's page as both sides render it: its body class, its root's class and its styles. */
export const STUDIO_PAGE = {
  bodyClass: 'film-studio',
  rootClass: 'studio-root',
  style: `${COMMAND_CSS}${STUDIO_CSS}`,
};

/** The way home, first in the studio's header: Films (⇧1, `FILMS_COMMAND`), titled with its key once the keys are read. */
export const FilmsLink = (props: { readonly title: string }) => (
  <a
    class="st-home"
    data-page="films"
    href={pageHref.home()}
    aria-label="Films"
    title={props.title}
  >
    <StudioIcon of="films" />
  </a>
);

/** The studio's place before the film is staged: Films and the film's name in the header, and a quiet line. */
const Opening = (props: { readonly name: string }) => (
  <div class="st-app">
    <header class="st-header">
      <FilmsLink title="Films" />
      <b class="st-film">{props.name}</b>
    </header>
    <p class="st-await" role="status">{`Opening ${props.name}…`}</p>
  </div>
);

/**
 * The studio page over `host`, with `body` (the studio, once its film is
 * staged): its commands and its app, for the browser to mount or hydrate
 * and the server to render. The registry's URL atoms read and write
 * through the host's own Location and UrlState, so the studio's address
 * (its version, its selection and its playhead) is the one address bar.
 */
export const studioPageOn = (host: Host, body: FilmBody) =>
  studioOn('player', host, (hub) => {
    const name = Option.getOrElse(filmOfPage(addressOn(host).href()), () => '');
    const Body = clientOnly(() => body(hub));
    return () => (
      <RegistryProvider initialValues={[[UrlAtom.layer, hostLayer(host)]]}>
        <StudioFrame hub={hub} scope={`studio:${name}`}>
          <Body fallback={<Opening name={name} />} />
        </StudioFrame>
      </RegistryProvider>
    );
  });
