// Copy link (AA-1): the link to what the viewer sees, on every page and in
// every context menu, so a pasted link opens it (Addressable). With nothing
// selected, or with the thing the URL already cites, it is the page's own
// URL: its place, its selection, its time. From a context menu opened on
// another thing, it is that thing's citation (`citeOf`). The link goes on
// the page's clipboard (`Clipboard`), whole.

import { Effect, Option } from 'effect';
import type { Context as Services } from 'effect';
import { Clipboard } from '../browser/clipboard.ts';
import { type Command, refused, said } from './command.ts';
import type { Context } from './context.ts';
import { citeOf, sameSelection, selectionOf, selectionText } from './selection.ts';
import { EVERYWHERE } from './target.ts';

/** The thing a link from `ctx` cites, when it is not what the URL already cites. */
const other = (ctx: Context) =>
  Option.filter(
    Option.fromUndefinedOr(ctx.selection[0]),
    (s) => !Option.exists(selectionOf(ctx.href), (cited) => sameSelection(cited, s)),
  );

/** The link from `ctx`: the page's URL, or the citation of the other thing it is about. */
export const linkOf = (ctx: Context): string =>
  Option.match(other(ctx), { onNone: () => ctx.href, onSome: (s) => citeOf(s, ctx.href) });

/** What the link from `ctx` is to, as a person reads it. */
const linkText = (ctx: Context): string =>
  Option.match(Option.fromUndefinedOr(ctx.selection[0]), {
    onNone: () => 'here',
    onSome: selectionText,
  });

/** Copy link, writing to the clipboard of `host`. */
export const linkCommands = (host: Services.Context<Clipboard>): ReadonlyArray<Command> => [
  {
    id: 'link.copy',
    label: 'Copy link',
    labelIn: (ctx) => `Copy link to ${linkText(ctx)}`,
    group: 'Share',
    keys: ['mod+shift+c'],
    about: EVERYWHERE,
    touch: 'long-press it, then Copy link',
    when: () => true,
    run: (ctx) =>
      Clipboard.use((clipboard) => clipboard.copyLink(linkOf(ctx))).pipe(
        Effect.as(said(`Copied the link to ${linkText(ctx)}`)),
        Effect.catchTag('ClipboardRefused', (e) =>
          Effect.succeed(refused(`The browser kept the link off the clipboard: ${e.reason}`)),
        ),
        Effect.provideContext(host),
      ),
  },
];
