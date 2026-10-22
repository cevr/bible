/**
 * The film lab's asks, read: the record of an ask (its steps' blocks, its
 * state, the owner's answers by question, and when he answered each step) as
 * the lab answers `GET /api/asks/<id>`, and the SHA-256 of a file an image
 * block shows, from the bytes the lab serves at the block's `src`. The live
 * layer asks the lab at `FILM_LAB_URL` (the always-on lab,
 * http://127.0.0.1:8229/, unless set), and only reads; the tests give a
 * stand-in.
 */
import { createHash } from 'node:crypto';

import { Config, Context, Effect, Layer, Schema } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';

/** An answer, typed by the question that asked it: a choice's option, the words, or `skipped`. */
export const AskAnswer = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('choose'), value: Schema.String, label: Schema.String }),
  Schema.Struct({ kind: Schema.Literal('free_text'), text: Schema.String }),
  Schema.Struct({ kind: Schema.Literal('skipped') }),
]);
export type AskAnswer = typeof AskAnswer.Type;

/** The owner's answers, by the id of the question each answers. */
export const AskAnswers = Schema.Record(Schema.String, AskAnswer);
export type AskAnswers = typeof AskAnswers.Type;

/**
 * A block of an ask's step, as far as the approval reads it: its kind, and an
 * image block's picture (a file the lab serves at `src`, or a board panel,
 * which has none).
 */
export const AskBlock = Schema.Struct({
  kind: Schema.String,
  image: Schema.optionalKey(Schema.Struct({ src: Schema.optionalKey(Schema.String) })),
});
export type AskBlock = typeof AskBlock.Type;

/**
 * An ask as the lab keeps it: its steps (each with the blocks it shows),
 * where it is (asking, answered at its end, or closed by an agent), his
 * answers, and each step he answered with when.
 */
export const LabAsk = Schema.Struct({
  id: Schema.String,
  ask: Schema.Struct({
    steps: Schema.Record(
      Schema.String,
      Schema.Struct({ blocks: Schema.optionalKey(Schema.Array(AskBlock)) }),
    ),
  }),
  state: Schema.Struct({
    _tag: Schema.Literals(['Asking', 'Answered', 'Closed']),
    answers: AskAnswers,
  }),
  answered: Schema.Array(
    Schema.Struct({
      step: Schema.String,
      values: Schema.Record(Schema.String, Schema.String),
      at: Schema.String,
    }),
  ),
});
export type LabAsk = typeof LabAsk.Type;

/** The lab has no ask by this id. */
export class AskUnknown extends Schema.TaggedError<AskUnknown>()('AskUnknown', {
  ask: Schema.String,
}) {
  override get message() {
    return `the lab has no ask ${this.ask}`;
  }
}

/** No lab answered, or it answered with no ask or shown file this checkout reads. */
export class LabUnread extends Schema.TaggedError<LabUnread>()('LabUnread', {
  url: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the lab at ${this.url} gave no ask or shown file this checkout reads (${this.reason}): start it (from apps/animations: bun run lab) or point FILM_LAB_URL at the one that holds the ask`;
  }
}

export interface LabAsksService {
  /** The lab read, as `FILM_LAB_URL` names it. */
  readonly url: string;
  readonly read: (ask: string) => Effect.Effect<LabAsk, AskUnknown | LabUnread>;
  /** The SHA-256 (hex) of the bytes the lab serves at an image block's `src`. */
  readonly shownHash: (src: string) => Effect.Effect<string, LabUnread>;
}

export class LabAsks extends Context.Service<LabAsks, LabAsksService>()('firsttheblade/LabAsks') {}

/** The lab the asks are read from: the always-on one unless `FILM_LAB_URL` names another. */
const labUrl = Config.String('FILM_LAB_URL').pipe(Config.withDefault('http://127.0.0.1:8229/'));

const readAsk = Schema.decodeUnknownEffect(LabAsk);

/** The asks of the lab at `FILM_LAB_URL`, and the files they show, read over HTTP. */
export const layerLab = Layer.effect(
  LabAsks,
  Effect.gen(function* () {
    const url = yield* labUrl;
    const client = yield* HttpClient.HttpClient;
    const read = Effect.fn('LabAsks.read')(function* (ask: string) {
      const unread = (reason: string) => LabUnread.make({ url, reason });
      const response = yield* client
        .get(new URL(`api/asks/${encodeURIComponent(ask)}`, url))
        .pipe(Effect.mapError((error) => unread(error.message)));
      if (response.status === 404) return yield* AskUnknown.make({ ask });
      if (response.status !== 200) return yield* unread(`status ${response.status}`);
      const body = yield* response.json.pipe(Effect.mapError((error) => unread(error.message)));
      return yield* readAsk(body).pipe(Effect.mapError((error) => unread(error.message)));
    });
    const shownHash = Effect.fn('LabAsks.shownHash')(function* (src: string) {
      const unread = (reason: string) => LabUnread.make({ url, reason: `${src}: ${reason}` });
      const response = yield* client
        .get(new URL(src, url))
        .pipe(Effect.mapError((error) => unread(error.message)));
      if (response.status !== 200) return yield* unread(`status ${response.status}`);
      const bytes = yield* response.arrayBuffer.pipe(
        Effect.mapError((error) => unread(error.message)),
      );
      return createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
    });
    return LabAsks.of({ url, read, shownHash });
  }),
).pipe(Layer.provide(FetchHttpClient.layer));
