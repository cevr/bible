import { Effect, Option, Schema, SchemaGetter } from 'effect';

/** Every way one `content/topics/<slug>.md` can be rejected. The compiler fails
 *  the build on any of them (§3.4): a bad source must never reach the artifact,
 *  and a compile that silently dropped a page would be worse than one that
 *  stopped. */
export class TopicSourceError extends Schema.TaggedError<TopicSourceError>()('TopicSourceError', {
  file: Schema.String,
  message: Schema.String,
}) {}

/** A slug or alias that YAML resolved to a bare scalar. `144000` and `1844` are
 *  real slugs in the v1 content set, and YAML types an unquoted `144000` as a
 *  number — so the compiler accepts the scalar and renders it back to the text
 *  the author wrote, rather than demanding every numeric slug be quoted. */
const ScalarString = Schema.Union([Schema.String, Schema.Finite]).pipe(
  Schema.decodeTo(Schema.NonEmptyString, {
    decode: SchemaGetter.String(),
    encode: SchemaGetter.passthrough(),
  }),
);

/** Authored frontmatter, exactly as ticket 010 fixed it. */
export const TopicFrontmatter = Schema.Struct({
  slug: ScalarString,
  title: ScalarString,
  status: Schema.Literals(['draft', 'approved']),
  aliases: Schema.optional(Schema.Array(ScalarString)),
  related: Schema.optional(Schema.Array(ScalarString)),
  /** Overlay-key override: a catalog topic *name*, matched case-insensitively
   *  against `bible.db` `topics.name`. */
  catalog: Schema.optional(ScalarString),
});
export type TopicFrontmatter = typeof TopicFrontmatter.Type;

export interface TopicSource {
  readonly file: string;
  readonly frontmatter: TopicFrontmatter;
  readonly body: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u;

const decodeFrontmatter = Schema.decodeUnknownEffect(TopicFrontmatter);

/** Splits and decodes one authored source. YAML comes from `Bun.YAML`, which is
 *  native to the runtime the compiler already requires — no parser dependency
 *  enters the tree for a build step that reads forty small files. */
export const parseTopicSource = Effect.fn('TopicsCompiler.parseTopicSource')(function* (
  file: string,
  contents: string,
) {
  const match = Option.fromNullOr(FRONTMATTER.exec(contents));
  if (Option.isNone(match)) {
    return yield* TopicSourceError.make({ file, message: 'missing YAML frontmatter' });
  }
  const [, yaml = '', body = ''] = match.value;
  const raw = yield* Effect.try({
    try: () => Bun.YAML.parse(yaml),
    catch: (cause) => TopicSourceError.make({ file, message: `invalid YAML: ${String(cause)}` }),
  });
  const frontmatter = yield* decodeFrontmatter(raw).pipe(
    Effect.mapError((cause) =>
      TopicSourceError.make({ file, message: `invalid frontmatter: ${cause.message}` }),
    ),
  );
  return { file, frontmatter, body } satisfies TopicSource;
});
