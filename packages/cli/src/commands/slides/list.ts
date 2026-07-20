import { Console, Effect, Path, Schema, SchemaGetter } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { AppleScript } from '../../services/apple-script.js';
import { CliProcess } from '../../services/process.js';
import { basename, isPathDeck, jxaStr } from './apple-script.js';

const SlideRow = Schema.Struct({
  index: Schema.Number,
  caption: Schema.String,
  image: Schema.NullOr(Schema.String),
  notes: Schema.String,
});

const ListResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    deck: Schema.String,
    slides: Schema.Array(SlideRow),
  }),
  Schema.Struct({ error: Schema.String }),
]);

const decodeListResult = Schema.decodeUnknownEffect(Schema.fromJsonString(ListResult));
const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);
const encodeJson = Schema.encodeUnknownEffect(JsonString);

const listDeck = Argument.string('deck').pipe(
  Argument.withDescription('Open document name substring OR a .key path'),
);
const listJson = Flag.boolean('json').pipe(
  Flag.withDescription('Emit raw JSON instead of a table'),
  Flag.withDefault(false),
);

export const slidesList = Command.make('list', { deck: listDeck, json: listJson }, (args) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const svc = yield* AppleScript;
    const cliProcess = yield* CliProcess;

    const deckIsPath = isPathDeck(args.deck);
    let target = args.deck;
    if (deckIsPath) target = path.resolve(args.deck);
    let targetBase = '';
    if (deckIsPath) targetBase = basename(target);

    let findDoc = `
  var ds = kn.documents.whose({ name: { _contains: ${jxaStr(target)} } })();
  if (ds.length === 0) { return JSON.stringify({ error: 'deck not found' }); }
  doc = ds[0];
  `;
    if (deckIsPath) {
      findDoc = `
  var existing = kn.documents.whose({ name: { _equals: ${jxaStr(targetBase)} } })();
  if (existing.length > 0) { doc = existing[0]; }
  else { doc = kn.open(Path(${jxaStr(target)})); openedByUs = true; if (!doc) { var after = kn.documents.whose({ name: { _equals: ${jxaStr(targetBase)} } })(); doc = after.length>0?after[0]:null; } }
  if (!doc) { return JSON.stringify({ error: 'could not open deck' }); }
  `;
    }

    const script = `(function(){
  var kn = Application('Keynote');
  var openedByUs = false;
  var doc;
  ${findDoc}
  var out = [];
  var slides = doc.slides();
  for (var i = 0; i < slides.length; i++) {
    var s = slides[i];
    var tis = s.textItems();
    var capParts = []; var marker = null;
    for (var j = 0; j < tis.length; j++) {
      var t = tis[j].objectText();
      if (t === null || t === undefined || t === '') continue;
      if (t.indexOf('[MISSING IMAGE:') === 0) { marker = t; continue; }
      capParts.push(t);
    }
    var imgs = s.images();
    var image = null;
    if (imgs.length > 0) { try { image = imgs[0].fileName(); } catch (e) { image = '(image)'; } }
    else if (marker) { image = marker; }
    var notes = '';
    try { notes = s.presenterNotes(); } catch (e) { notes = ''; }
    out.push({ index: i + 1, caption: capParts.join(' / '), image: image, notes: notes });
  }
  var deckName = doc.name();
  if (openedByUs) { try { doc.close({ saving: 'no' }); } catch (e) {} }
  return JSON.stringify({ ok: true, deck: deckName, slides: out });
})();`;

    const stdout = yield* svc.execJxa(script);

    const parsed = yield* decodeListResult(stdout.trim()).pipe(
      Effect.catch(() =>
        Effect.gen(function* () {
          yield* Console.error('Could not parse Keynote output.');
          return yield* cliProcess.exitFailure;
        }),
      ),
    );
    if (!('ok' in parsed)) {
      yield* Console.error(`ERROR: ${parsed.error}`);
      return yield* cliProcess.exitFailure;
    }
    if (args.json) {
      yield* Console.log(yield* encodeJson(parsed.slides));
      return;
    }
    const trunc = (str: string, n: number): string => {
      const first = str.split('\n')[0] ?? '';
      if (first.length > n) return first.slice(0, n - 1) + '…';
      return first;
    };
    yield* Console.log(`idx  caption                                                       image`);
    for (const r of parsed.slides) {
      let image = '∅';
      if (r.image !== null) image = basename(r.image);
      yield* Console.log(
        `${String(r.index).padStart(3)}  ${trunc(r.caption, 58).padEnd(58)}  ${image}`,
      );
    }
    yield* Console.log(`\n${parsed.slides.length} slide(s) in ${parsed.deck}`);
  }),
);
