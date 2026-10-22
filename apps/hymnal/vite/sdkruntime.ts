/* oxlint-disable effect/noNullish, effect/noTernary -- a rolldown plugin, the bundler's host boundary: its hook answers `undefined` for a module that is not its own, as the plugin API defines. */

/**
 * Keeps One's iOS SDK set-up in the Release native bundle. One's
 * `ios-runtime.native.js` connects the SDK bindings (`setSDKNative`) as a side
 * effect, but One's `package.json` lists no side effect for it, so the
 * tree-shaken Release bundle drops the call and the app throws "iOS SDK
 * bindings need a native iOS build" at launch. The Debug bundle is not
 * tree-shaken and keeps it.
 */

const runtime = /\/one\/dist\/esm\/ios-runtime\.native\.js$/;

/** A rolldown plugin that marks One's iOS runtime entry as having side effects. */
export const sdkRuntime = () => ({
  name: 'hymnal-sdk-runtime',
  transform: (code: string, module: string) =>
    runtime.test(module) ? { code, moduleSideEffects: true } : undefined,
});
