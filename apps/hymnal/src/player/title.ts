/**
 * Where a press on the full player's title goes: to its hymn's page. The
 * sheet only closes when that page is the screen right under it; else the
 * sheet closes and the hymn's page is pushed where it was, so Back from the
 * page goes where Back from the sheet went. The sheet is closed, then the
 * page pushed, not the sheet replaced: on iOS a page put in a form sheet's
 * place by a replace shows no back button and takes no back pan. Only a
 * sheet with no screen under it (a link straight to it) is replaced. The
 * player is not told: the track plays on.
 */

import { Data, Option, Schema } from 'effect';

import type { StackRoute } from '~/stack';

/** The stack the sheet is in: its screens, and the one shown (the sheet). */
export interface StackState {
  readonly routes: ReadonlyArray<StackRoute>;
  readonly index: number;
}

export type TitleGo = Data.TaggedEnum<{
  /** The hymn's page is right under the sheet: the sheet closes. */
  Close: {};
  /** The sheet closes, and the page of hymn `number` is pushed in its place. */
  Open: { readonly number: number };
  /** No screen is under the sheet: the page of hymn `number` replaces it. */
  Replace: { readonly number: number };
}>;

export const TitleGo = Data.taggedEnum<TitleGo>();

/** The hymn route's file name, as the stack names its screens. */
const hymnRoute = 'hymns/[number]';

/** The router hands a screen's params over untyped; a hymn's page names its hymn by `number`. */
const decodeHymn = Schema.decodeUnknownOption(Schema.Struct({ number: Schema.String }));

/** The hymn a screen of the stack shows, if it is a hymn's page. */
const hymnOf = (route: StackRoute): Option.Option<string> =>
  Option.liftPredicate(route, (r) => r.name === hymnRoute).pipe(
    Option.flatMap((r) => decodeHymn(r.params)),
    Option.map(({ number }) => number),
  );

/** Where a press on the title of hymn `hymn` goes, from the sheet shown in `state`. */
export const titleGoes = (state: StackState, hymn: number): TitleGo =>
  Option.fromNullishOr(state.routes[state.index - 1]).pipe(
    Option.match({
      onNone: () => TitleGo.Replace({ number: hymn }),
      onSome: (under) =>
        hymnOf(under).pipe(
          Option.filter((shown) => shown === String(hymn)),
          Option.match({
            onNone: () => TitleGo.Open({ number: hymn }),
            onSome: () => TitleGo.Close(),
          }),
        ),
    }),
  );
