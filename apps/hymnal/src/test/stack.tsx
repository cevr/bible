/**
 * The hymn route's header as the app's stack draws it: from the stack's
 * options at the route's params now (`useStackOptions` in the app's
 * layout), drawn by the `one` stand-in's `Stack.Screen`. A test draws it
 * beside the screen it mounts, as the stack draws its header above the
 * screen; a screen that drew a header of its own would show a second one.
 */

import { params, Stack } from './one';

import { stackHeaders } from '~/reader/screen';
import { stackOptions } from '~/stack';

export function StackHeader() {
  return (
    <Stack.Screen
      options={stackOptions(
        'accent',
        stackHeaders,
      )({
        route: { name: 'hymns/[number]', params: { ...params } },
      })}
    />
  );
}
