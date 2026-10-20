/**
 * The list's routes, which the Worker's policy (`../worker/respond.ts`)
 * answers before it looks for a file:
 *
 * - `POST /subscribe`: the sign-up form, with no script. A sign-up from a
 *   place that has made too many this minute is refused (429). A filled
 *   honeypot, a new address, a pending one and a confirmed one all answer
 *   the same 303 to the check page, so the page never tells who is on the
 *   list; only a new or pending address (at most once an hour) is sent a
 *   confirm letter.
 * - `GET /subscribe/confirm?token=`: confirms, 303 to the confirmed page; a
 *   link that ran out or was replaced goes to a page that signs up again.
 * - `GET /unsubscribe?token=`: the one-button page; `POST` leaves, from that
 *   button (303 to the left page) or from a mail app's one click
 *   (`List-Unsubscribe=One-Click`, RFC 8058: 200). Leaving twice is leaving.
 * - `POST /mail/send`, with `Authorization: Bearer <MAIL_ADMIN_TOKEN>`: puts
 *   a film's send on the queue (`./deliver.ts`), or with `dryRun` counts it.
 *
 * Every answer is a redirect, a page or a short text, and the logs name
 * ids, counts and codes, never an address or a token.
 */
import { Clock, Context, Crypto, Duration, Effect, Option, Redacted, Schema } from 'effect';
import { Headers, type HttpServerRequest, HttpServerResponse, UrlParams } from 'effect/http';

import { Assets, pageRequest } from '../worker/assets.ts';
import { addressOf } from './address.ts';
import { Films } from './films.ts';
import { confirmLetter } from './letters.ts';
import { type ConfirmClaim, type FilmCounts, List } from './list.ts';
import { logMail, warnMail } from './log.ts';
import { Mailer } from './mailer.ts';
import { MAIL_PAGES, MAIL_ROUTES, SIGNUP_FIELDS } from './paths.ts';
import { BATCH, FilmQueue, type QueueError } from './queue.ts';
import type { SqlError } from './sql.ts';
import { Throttle } from './throttle.ts';
import { CONFIRM_FOR, type Token, Tokens } from './tokens.ts';

/** The secret `bun run mail:send` sends as its bearer token. */
export class AdminToken extends Context.Service<AdminToken, Redacted.Redacted<string>>()(
  'firsttheblade/AdminToken',
) {}

/** Everything the routes need from their host. */
export type MailServices =
  | Assets
  | List
  | Mailer
  | Tokens
  | Throttle
  | FilmQueue
  | AdminToken
  | Films
  | Crypto.Crypto;

/** The one-click body a mail app posts (RFC 8058). */
const ONE_CLICK = 'List-Unsubscribe=One-Click';

const see = (path: string) => HttpServerResponse.redirect(path, { status: 303 });

const text = (body: string, status: number) => HttpServerResponse.text(body, { status });

/** What the send route answers `bun run mail:send` with. */
type SendAnswer =
  | { readonly error: string }
  | (FilmCounts & { readonly film: string; readonly queued: number });

const json = (body: SendAnswer, status: number) => HttpServerResponse.jsonUnsafe(body, { status });

/** A page the prerender wrote, as this route's answer. */
const page = Effect.fn('Mail.page')(function* (
  request: HttpServerRequest.HttpServerRequest,
  path: string,
  status: number,
) {
  const assets = yield* Assets;
  const served = yield* assets.serve(pageRequest(request, path));
  return HttpServerResponse.setStatus(served, status);
});

const originOf = (request: HttpServerRequest.HttpServerRequest) =>
  new URL(request.originalUrl).origin;

const queryOf = (request: HttpServerRequest.HttpServerRequest, name: string) =>
  Option.fromNullishOr(new URL(request.originalUrl).searchParams.get(name));

/** The form's fields; a body that does not read is no fields. */
const formOf = (request: HttpServerRequest.HttpServerRequest) =>
  request.urlParamsBody.pipe(Effect.orElseSucceed(() => UrlParams.empty));

const field = (form: UrlParams.UrlParams, name: string) =>
  Option.getOrElse(UrlParams.getFirst(form, name), () => '');

/** The sender's address as Cloudflare names it; one place when it is missing. */
const placeOf = (request: HttpServerRequest.HttpServerRequest) =>
  Option.getOrElse(Headers.get(request.headers, 'cf-connecting-ip'), () => 'unknown');

const subscribe = Effect.fn('Mail.subscribe')(function* (
  request: HttpServerRequest.HttpServerRequest,
) {
  const throttle = yield* Throttle;
  if (!(yield* throttle.allow(placeOf(request)))) {
    yield* warnMail('subscribe.busy');
    return yield* page(request, MAIL_PAGES.busy, 429);
  }
  const form = yield* formOf(request);
  if (field(form, SIGNUP_FIELDS.honeypot) !== '') {
    yield* warnMail('subscribe.honeypot');
    return see(MAIL_PAGES.check);
  }
  const address = addressOf(field(form, SIGNUP_FIELDS.email));
  if (Option.isNone(address)) {
    yield* logMail('subscribe.invalid');
    return see(MAIL_PAGES.address);
  }
  const list = yield* List;
  const claim = yield* list.signUp(address.value, yield* Clock.currentTimeMillis);
  if (Option.isNone(claim)) {
    yield* logMail('subscribe.quiet');
    return see(MAIL_PAGES.check);
  }
  const tokens = yield* Tokens;
  const mailer = yield* Mailer;
  const token = yield* tokens.sign({ _tag: 'Confirm', ...claim.value });
  yield* mailer.send(confirmLetter(address.value, originOf(request), token)).pipe(
    Effect.andThen(logMail('subscribe.mailed', { subscriber: claim.value.subscriber })),
    // The answer stays the same, so a failure tells no one which addresses
    // were sent a letter; the claim is given back, so a second try sends one.
    Effect.catch((failure) =>
      warnMail('subscribe.unsent', { subscriber: claim.value.subscriber, code: failure.code }).pipe(
        Effect.andThen(list.release(claim.value)),
      ),
    ),
  );
  return see(MAIL_PAGES.check);
});

/** The claim a confirm link makes, while it is one and has not run out. */
const claimOf = (read: Token, now: number): Option.Option<ConfirmClaim> => {
  if (read._tag !== 'Confirm') return Option.none();
  if (now - read.issued >= Duration.toMillis(CONFIRM_FOR)) return Option.none();
  return Option.some({ subscriber: read.subscriber, issued: read.issued });
};

const confirm = Effect.fn('Mail.confirm')(function* (request: HttpServerRequest.HttpServerRequest) {
  const tokens = yield* Tokens;
  const now = yield* Clock.currentTimeMillis;
  const token = yield* Option.match(queryOf(request, 'token'), {
    onNone: () => Effect.succeedNone,
    onSome: tokens.read,
  });
  const claim = Option.flatMap(token, (read) => claimOf(read, now));
  if (Option.isNone(claim)) {
    yield* logMail('confirm.expired');
    return see(MAIL_PAGES.expired);
  }
  const list = yield* List;
  const outcome = yield* list.confirm(claim.value, now);
  yield* logMail(`confirm.${outcome}`, { subscriber: claim.value.subscriber });
  if (outcome === 'confirmed') return see(MAIL_PAGES.confirmed);
  return see(MAIL_PAGES.expired);
});

/** The subscriber an unsubscribe link names, when its token reads as one. */
const leaverOf = Effect.fn('Mail.leaverOf')(function* (
  request: HttpServerRequest.HttpServerRequest,
) {
  const tokens = yield* Tokens;
  const token = yield* Option.match(queryOf(request, 'token'), {
    onNone: () => Effect.succeedNone,
    onSome: tokens.read,
  });
  return Option.flatMap(token, (read) => {
    if (read._tag !== 'Unsubscribe') return Option.none();
    return Option.some(read.subscriber);
  });
});

const leavePage = Effect.fn('Mail.leavePage')(function* (
  request: HttpServerRequest.HttpServerRequest,
) {
  const leaver = yield* leaverOf(request);
  if (Option.isNone(leaver)) return yield* page(request, MAIL_PAGES.badLink, 400);
  return yield* page(request, MAIL_PAGES.leave, 200);
});

const leave = Effect.fn('Mail.leave')(function* (request: HttpServerRequest.HttpServerRequest) {
  const oneClick = (yield* request.text.pipe(Effect.orElseSucceed(() => ''))).trim() === ONE_CLICK;
  const leaver = yield* leaverOf(request);
  if (Option.isNone(leaver)) {
    yield* logMail('unsubscribe.invalid');
    if (oneClick) return text('This link is not valid.', 400);
    return yield* page(request, MAIL_PAGES.badLink, 400);
  }
  const list = yield* List;
  yield* list.unsubscribe(leaver.value, yield* Clock.currentTimeMillis);
  yield* logMail('unsubscribe.done', { subscriber: leaver.value, oneClick: Number(oneClick) });
  if (oneClick) return text('You have left the list.', 200);
  return see(MAIL_PAGES.left);
});

const SendRequest = Schema.Struct({
  film: Schema.String,
  dryRun: Schema.optionalKey(Schema.Boolean),
});

/**
 * Whether two secrets are equal, compared in time that does not depend on
 * where they differ: their digests are compared, every byte of them.
 */
const sameSecret = Effect.fn('Mail.sameSecret')(function* (given: string, held: string) {
  const crypto = yield* Crypto.Crypto;
  const digest = (value: string) =>
    crypto.digest('SHA-256', new TextEncoder().encode(value)).pipe(Effect.orDie);
  const a = yield* digest(given);
  const b = yield* digest(held);
  let difference = 0;
  for (const [index, byte] of a.entries()) difference |= byte ^ (b[index] ?? 0);
  return difference === 0;
});

const BEARER = /^Bearer (.+)$/;

const send = Effect.fn('Mail.send')(function* (request: HttpServerRequest.HttpServerRequest) {
  const held = yield* AdminToken;
  const given = Option.getOrElse(
    Option.flatMap(Headers.get(request.headers, 'authorization'), (header) =>
      Option.fromNullishOr(BEARER.exec(header)?.[1]),
    ),
    () => '',
  );
  if (!(yield* sameSecret(given, Redacted.value(held)))) {
    yield* warnMail('send.unauthorized');
    return json({ error: 'unauthorized' }, 401);
  }
  const body = yield* request.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(SendRequest)),
    Effect.option,
  );
  if (Option.isNone(body)) return json({ error: 'expected { film, dryRun? }' }, 400);
  const film = (yield* Films).find(body.value.film);
  if (Option.isNone(film)) return json({ error: `no film ${body.value.film} on the site` }, 404);
  const ref = film.value.ref;
  const list = yield* List;
  const counts = yield* list.counts(ref);
  if (body.value.dryRun === true) {
    yield* logMail('send.dry', { film: ref, ...counts });
    return json({ film: ref, ...counts, queued: 0 }, 200);
  }
  const queue = yield* FilmQueue;
  const origin = originOf(request);
  let after = 0;
  let queued = 0;
  for (;;) {
    const ids = yield* list.waiting(ref, after, BATCH);
    if (ids.length === 0) break;
    yield* queue.put(ids.map((subscriber) => ({ film: ref, subscriber, origin })));
    queued += ids.length;
    after = ids.at(-1) ?? after;
  }
  yield* logMail('send.queued', { film: ref, queued });
  return json({ film: ref, ...counts, queued }, 202);
});

type Handler = (
  request: HttpServerRequest.HttpServerRequest,
) => Effect.Effect<HttpServerResponse.HttpServerResponse, SqlError | QueueError, MailServices>;

/** Each route's handlers, by method. */
const ROUTES = new Map<string, ReadonlyMap<string, Handler>>([
  [MAIL_ROUTES.subscribe, new Map([['POST', subscribe]])],
  [MAIL_ROUTES.confirm, new Map([['GET', confirm]])],
  [
    MAIL_ROUTES.unsubscribe,
    new Map<string, Handler>([
      ['GET', leavePage],
      ['POST', leave],
    ]),
  ],
  [MAIL_ROUTES.send, new Map([['POST', send]])],
]);

/**
 * The answer of the route at `pathname`, or none when no route is there.
 * A method the route does not take is 405; a store or a queue that fails is
 * a 503 that names nothing.
 */
export const mailRoute = (
  request: HttpServerRequest.HttpServerRequest,
  pathname: string,
): Option.Option<Effect.Effect<HttpServerResponse.HttpServerResponse, never, MailServices>> =>
  Option.map(Option.fromNullishOr(ROUTES.get(pathname)), (methods) =>
    Option.match(Option.fromNullishOr(methods.get(request.method)), {
      onNone: () => {
        const allow = [...methods.keys()].join(', ');
        return Effect.succeed(
          HttpServerResponse.text('Method Not Allowed', { status: 405, headers: { allow } }),
        );
      },
      onSome: (handler) =>
        handler(request).pipe(
          Effect.catch((failure) =>
            warnMail('route.failed', { route: pathname, reason: failure._tag }).pipe(
              Effect.as(text('Something went wrong. Please try again later.', 503)),
            ),
          ),
        ),
    }),
  );
