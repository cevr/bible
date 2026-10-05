// The studio's frame around a page, one for every page in its shell (a
// film's Lab, Scenes and Play, `film-page.tsx`; the review, `review/page.tsx`):
// the context menu around the page, then ⌘K, the `?` sheet and the receipts
// over it, each reading the page's commands. `studioOn` makes those commands
// for a page over its host, with the app the browser mounts or hydrates and
// the server renders.

import type { JSX } from '@solidjs/web';
import { Effect } from 'effect';
import type { ParentProps } from 'solid-js';
import { type Host, addressOn } from '../browser/host.ts';
import { TabStore, ViewerStore } from '../browser/storage-browser.ts';
import type { PageName } from '../core/api.ts';
import { type Hub, makeHub } from '../command/hub.ts';
import { CommandMenu } from './command/command-menu.tsx';
import { TargetMenu } from './command/context-menu.tsx';
import { KeysSheet } from './command/keys-sheet.tsx';
import { Receipts } from './command/receipts.tsx';

interface StudioFrameProps extends ParentProps {
  readonly hub: Hub;
  /** The receipts' scope in the tab's store: the page's kind, and its film if it has one. */
  readonly scope: string;
}

/** `children` (the page's shell and body) in the studio's frame: the context menu, ⌘K, the `?` sheet, the receipts. */
export const StudioFrame = (props: StudioFrameProps) => (
  <TargetMenu hub={props.hub}>
    {props.children}
    <CommandMenu hub={props.hub} />
    <KeysSheet hub={props.hub} />
    <Receipts hub={props.hub} tab={TabStore} scope={props.scope} />
  </TargetMenu>
);

/**
 * Page `page`'s commands over `host` (`command/hub.ts`, their keys not yet
 * heard) and its app, made by `app` from them: for the browser to mount or
 * hydrate and the server to render.
 */
export const studioOn = (page: PageName, host: Host, app: (hub: Hub) => () => JSX.Element) =>
  Effect.map(makeHub(page, addressOn(host).href, ViewerStore), (hub) => ({
    hub,
    app: app(hub),
  })).pipe(Effect.provideContext(host));
