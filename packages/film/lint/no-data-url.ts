// `film/no-data-url`: a served module writes no data URL. The First the
// Blade site's stills rule holds every image the site serves to an approval
// the owner gave (apps/firsttheblade/kit/approval.ts), and the build walk
// (apps/firsttheblade/kit/build-walk.ts) finds those images as the files of
// the built site, read by their bytes. An image written into a script as a
// data URL ships inside another file, with no bytes of its own an approval
// can hold: the walk refuses each built file that holds one, and this rule
// refuses it in the source, before a build. An image ships as a file of its
// own.
//
// Refused: a string, or a template read with a value standing for each
// `${…}`, holding a data URL's opening: `data:` and then a media type
// (`data:image/png`), its parameters or data (`data:;base64`, `data:,`), or
// nothing (`'data:' + type`), in any case. Prose (`as data: a list`) and a
// word ending in data (`metadata:`) pass. A comment is no served text. The
// config turns the rule on over the site's sources and off over its tests.

import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';

/** A data URL's opening: the scheme, then a media type, `;` or `,`, or the string's end. */
const DATA_URL = /\bdata:(?:[\w.+-]+\/[\w.+-]+|[;,]|$)/iu;

const MESSAGE =
  'a data URL in a served module: an image written inside another file has no bytes of its own an approval can hold, and the build walk refuses each built file that holds one. Ship the image as a file of its own, which the walk reads by its bytes.';

/** A template's text, with a media type standing for each value (`` `data:${type};base64,` `` reads as a data URL). */
const templateText = (node: ESTree.TemplateLiteral) =>
  node.quasis
    .map((q) => Option.getOrElse(Option.fromNullishOr(q.value.cooked), () => q.value.raw))
    .join('x/x');

/** Whether a node writes a data URL's opening. */
const writesDataUrl = (node: ESTree.Node): boolean => {
  if (node.type === 'Literal') return Predicate.isString(node.value) && DATA_URL.test(node.value);
  if (node.type === 'TemplateLiteral') return DATA_URL.test(templateText(node));
  return false;
};

export const noDataUrl = Rule.define({
  name: 'no-data-url',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A served module writes no data URL: an image inside another file has no bytes of its own an approval can hold.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    const report = (node: ESTree.Node) =>
      Effect.asVoid(
        Effect.when(
          context.report(Diagnostic.make({ node, message: MESSAGE })),
          Effect.succeed(writesDataUrl(node)),
        ),
      );
    return Visitor.merge(Visitor.on('Literal', report), Visitor.on('TemplateLiteral', report));
  },
});
