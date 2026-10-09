// What the page reaches of the host, and from whose code: the check that does
// in the browser what `film/host-events-through-adapter` and
// `film/history-through-host` read in the source, whatever the spelling.
//
// A script run before the page's own wraps the host's APIs a film page hears
// or moves its navigation, keys and drags through an adapter for: a listener
// for `popstate`, `hashchange`, a key or a drag's move and end on the window or
// the document, a listener for the end of a press on anything, a pointer
// capture taken or let go, a history move (`pushState`, `replaceState`, `go`,
// `back`, `forward`) and the Navigation API's moves. Each call tells the tab,
// by the console, the API and the page's script frames it was called from.
//
// The tab maps the first frame its bundle's inline source map reads back to
// the file that wrote it. A call from a file of the film's own source outside
// `src/browser/` (the adapters) fails the case, as `host reach: <api> from
// <file>`. A call from anywhere else (a library, `@bible/url-state`, `@bible/ui`,
// the fixtures' pages, or a script with no source map) is told and not
// refused: those are the owners, or no film code. A `Location` write is not
// wrapped (the browser makes its methods and `href` unforgeable): the lint
// reads it.

import { SourceMap } from 'node:module';
import { Array as Arr, Option, Predicate, Schema } from 'effect';

/** What a told call's console line starts with. */
const PREFIX = '[host-reach] ';

/** A page script's frame: its url, and the line and column (both from 1) of the call in it. */
const Frame = Schema.Struct({ url: Schema.String, line: Schema.Finite, col: Schema.Finite });
type Frame = typeof Frame.Type;

/** A call the page made: the API, and the script frames above it, the nearest first. */
const Told = Schema.Struct({ api: Schema.String, frames: Schema.Array(Frame) });
type Told = typeof Told.Type;

/** The call a console line tells, if it is one. */
export const toldOf = (text: string): Option.Option<Told> =>
  Option.flatMap(
    Option.liftPredicate(text, (line) => line.startsWith(PREFIX)),
    (line) => Schema.decodeOption(Schema.fromJsonString(Told))(line.slice(PREFIX.length)),
  );

/** A source map, as a bundle carries it inline. */
const Payload = Schema.Struct({
  version: Schema.Finite,
  sources: Schema.Array(Schema.String),
  names: Schema.Array(Schema.String),
  mappings: Schema.String,
});

/** The inline source map at the end of a bundle. */
const INLINE = /\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)\s*$/;

/** The source map a bundle carries inline: none for a script that has none. */
export const mapOf = (body: Uint8Array | string): Option.Option<SourceMap> => {
  const encoded = Option.flatMap(
    Option.flatMap(Option.liftPredicate(body, Predicate.isString), (text) =>
      Option.fromNullishOr(INLINE.exec(text)),
    ),
    (m) => Option.fromUndefinedOr(m[1]),
  );
  return Option.flatMap(encoded, (base64) =>
    Option.flatMap(
      Schema.decodeOption(Schema.fromJsonString(Payload))(
        Buffer.from(base64, 'base64').toString('utf8'),
      ),
      (payload) =>
        Option.liftThrowable(
          () =>
            new SourceMap({
              file: '',
              sourceRoot: '',
              sourcesContent: [],
              version: payload.version,
              mappings: payload.mappings,
              sources: [...payload.sources],
              names: [...payload.names],
            }),
        )(),
    ),
  );
};

/**
 * The film's own source, as a map names it (relative to the film package),
 * and the parts of it that may reach the host: its adapters, and the fixtures'
 * own pages.
 */
const FILM_SRC = 'src/';
const OWNERS: ReadonlyArray<string> = ['src/browser/', 'src/lab/fixtures/'];

/** The file that wrote the nearest frame `maps` reads back, if any. */
const sourceOf = (
  frames: ReadonlyArray<Frame>,
  maps: (url: string) => Option.Option<SourceMap>,
): Option.Option<string> =>
  Arr.findFirst(frames, (frame) =>
    Option.flatMap(maps(frame.url), (map) => {
      const entry: object = map.findEntry(frame.line - 1, frame.col - 1);
      return Option.filter(
        Option.fromUndefinedOr<unknown>(Reflect.get(entry, 'originalSource')),
        Predicate.isString,
      );
    }),
  );

/** Whether `source` is film code that may not reach the host: the film's own, outside its adapters. */
const refused = (source: string): boolean =>
  source.startsWith(FILM_SRC) && !OWNERS.some((owner) => source.startsWith(owner));

/** The failure a told call is, if it is one: `host reach: <api> from <file>`. */
export const failureOf = (
  told: Told,
  maps: (url: string) => Option.Option<SourceMap>,
): Option.Option<string> =>
  Option.flatMap(Option.filter(sourceOf(told.frames, maps), refused), (source) =>
    Option.some(`host reach: ${told.api} from ${source}`),
  );

/** The script, run before the page's own, that tells each reach. */
export const HOST_REACH = `(() => {
  const PREFIX = '${PREFIX}';
  const ON_HOST = new Set(['popstate', 'hashchange', 'keydown', 'keyup', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']);
  const PRESS_END = new Set(['pointerup', 'pointercancel', 'lostpointercapture']);
  const FRAME = /(https?:\\/\\/[^\\s()]+?):(\\d+):(\\d+)/;
  const tell = (api) => {
    const frames = [];
    for (const line of String(new Error().stack).split('\\n').slice(1)) {
      const m = FRAME.exec(line);
      if (m) frames.push({ url: m[1], line: Number(m[2]), col: Number(m[3]) });
      if (frames.length >= 6) break;
    }
    console.debug(PREFIX + JSON.stringify({ api, frames }));
  };
  const wrap = (proto, name, when) => {
    if (!proto) return;
    const d = Object.getOwnPropertyDescriptor(proto, name);
    if (!d || typeof d.value !== 'function') return;
    const original = d.value;
    Object.defineProperty(proto, name, {
      ...d,
      value: function (...args) {
        const api = when(this, args);
        if (api) tell(api);
        return original.apply(this, args);
      },
    });
  };
  const always = (api) => () => api;
  wrap(EventTarget.prototype, 'addEventListener', (self, [type]) => {
    if (PRESS_END.has(type)) return 'addEventListener(' + type + ')';
    if ((self === window || self === document) && ON_HOST.has(type)) return 'addEventListener(' + type + ') on the host';
    return '';
  });
  // The same reach by a handler property: \`window.onkeydown = h\` listens as addEventListener does.
  const wrapSetter = (target, type) => {
    const name = 'on' + type;
    const d = Object.getOwnPropertyDescriptor(target, name);
    if (!d || typeof d.set !== 'function') return;
    const set = d.set;
    Object.defineProperty(target, name, {
      ...d,
      set: function (handler) {
        if (PRESS_END.has(type)) tell(name);
        else if ((this === window || this === document) && ON_HOST.has(type)) tell(name + ' on the host');
        return set.call(this, handler);
      },
    });
  };
  for (const type of ON_HOST)
    for (const target of [window, Document.prototype, HTMLElement.prototype, SVGElement.prototype])
      wrapSetter(target, type);
  wrap(Element.prototype, 'setPointerCapture', always('setPointerCapture'));
  wrap(Element.prototype, 'releasePointerCapture', always('releasePointerCapture'));
  for (const name of ['pushState', 'replaceState', 'go', 'back', 'forward'])
    wrap(History.prototype, name, always('history.' + name));
  if (typeof Navigation === 'function')
    for (const name of ['navigate', 'back', 'forward', 'traverseTo', 'reload', 'updateCurrentEntry'])
      wrap(Navigation.prototype, name, always('navigation.' + name));
})();`;
