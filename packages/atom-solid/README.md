# @bible/atom-solid

Effect atoms (`effect/reactivity/Atom`) in Solid 2 components: the hooks this
repo uses from `@effect/atom-solid` (MIT), ported to Solid 2. Delete the
package when upstream supports Solid 2. The film's lab and egw-search use it,
among other atoms for `@bible/url-state/atom`'s places.

```ts
import { RegistryProvider, useAtomSet, useAtomValue } from '@bible/atom-solid';
```

## The registry

Every hook reads and writes atoms through the current `AtomRegistry`
(`useRegistry()`):

- `RegistryProvider` makes one registry for its subtree and disposes it when
  the subtree is cleaned up. Its props are `AtomRegistry.make`'s options:
  `initialValues` seeds atoms before any read (a host's layer, a request's
  `Location`), and `defaultIdleTTL` is 400 ms unless given. The options are
  read once, when the registry is made.
- With no provider, a page in the browser shares one standalone registry.
- On the server there is no standalone registry: a hook outside a
  `RegistryProvider` throws, so two requests never share atoms. Wrap each
  render in its own provider.

## The hooks

- `useAtomValue(() => atom)`: an accessor of the atom's value, subscribed for
  the owner's life. `useAtomValue(() => atom, f)`: an accessor of `f` over it.
- `useAtomSet(() => atom)`: a setter that takes a value or an updater, without
  subscribing. With `{ mode: 'promiseExit' }`, for an `AsyncResult` atom, the
  setter resolves with the write's `Exit` and never rejects.
- `useAtomMount(() => atom)`: keeps the atom mounted for the owner's life.
- `useAtomRefresh(() => atom)`: a callback that refreshes the atom.
- `useAtomSuspense(() => atom, { suspendOnWaiting? })`: for an `AsyncResult`
  atom, an accessor that suspends the nearest `<Loading>` while the result is
  initial (or waiting, if asked) and throws the squashed failure to the
  nearest `<Errored>`.

Each hook takes the atom as a thunk: when the thunk selects another atom, the
subscription or mount moves to it. A value-carrying accessor holds the atom's
current value as soon as the hook returns, before any flush. Outside
hydration a write through the registry is readable at once; a component
mounted during hydration reads an atom with a server value through a memo,
which shows a write after Solid's next flush.

## Server rendering

An atom is read on the server in one of three ways, by what it is:

- A served atom (`Atom.serializable`): the server waits for its first answer
  and sends it, encoded, with the page. The client's hydration adopts that
  value and requests nothing.
- An atom with a server value (`Atom.withServerValue`), a viewer's own value
  such as a kept setting or the URL's hash: the server render and the
  client's hydration pass show the server value, so their markup matches, and
  the live value follows. The server never runs the atom's own read.
- Any other atom is read live on both sides.

## Testing

`bun run test` runs the hook tests under Solid's development build
(`--conditions=browser --conditions=development`) and server-renders the
fixture pages in `test/ssr`. The hook tests mount under a real
`RegistryProvider` through `createComponent`, with no JSX. `bun run test:ssr`
hydrates the server's markup in Playwright's Chromium and checks for no
mismatch; CI runs it in the gate workflow's browser job.
