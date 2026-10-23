import { Option, Record, Schema } from 'effect';
import type { ReactNode } from 'react';
import type { ColorValue } from 'react-native';

import { color, useAccent } from './color';

/** A screen of the stack as the stack's options see it: its route's name and params. */
export interface StackRoute {
  readonly name: string;
  readonly params?: unknown;
}

/** A pushed screen's header as its route's params name it: its title, and its buttons. */
export interface Header {
  readonly title: string;
  readonly headerRight?: () => ReactNode;
}

/** A route's params as its path holds them: each a string, by name. */
export type RouteParams = Readonly<Record<string, string>>;

/** The headers of the screens whose header follows their route's params, by route name. */
export type Headers = Readonly<Record<string, (params: RouteParams) => Header>>;

/** The router hands a screen's params over untyped; a path's are strings. */
const decodeParams = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.String));

/**
 * The app's stack: each screen on the theme's ground, its native header on
 * the ground too (without it iOS draws the system's white or grey bar
 * there), and its titles in ink. The header's tint is the accent, but iOS
 * 26's glass back button draws its chevron and label in the system colour
 * regardless. One's web stacks are headless, so on the web only
 * `contentStyle` draws, and the web's header reads `headerRight`.
 *
 * A screen named in `headers` takes its title and buttons from its route's
 * params here, as the stack lays the screen out, so the header is right on
 * the first frame of its push and follows `setParams` at once: no effect of
 * the screen's own sets them, and the header never shows the route's name.
 */
export const stackOptions =
  (accent: ColorValue, headers: Headers) =>
  ({ route }: { readonly route: StackRoute }) => ({
    contentStyle: { backgroundColor: color.ground },
    headerStyle: { backgroundColor: color.ground },
    headerTintColor: accent,
    headerTitleStyle: { color: color.ink },
    headerLargeTitleStyle: { color: color.ink },
    ...Option.match(Record.get(headers, route.name), {
      onNone: () => ({}),
      onSome: (header) => header(Option.getOrElse(decodeParams(route.params), () => ({}))),
    }),
  });

/** The stack's options in the theme's accent now. */
export const useStackOptions = (headers: Headers) => stackOptions(useAccent(), headers);
