import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Deferred, Duration, Effect, Fiber, Layer, Logger, Option, Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { Headers, HttpServerRequest, HttpServerResponse } from 'effect/http';

import { SERIES, type Series } from '../content.ts';
import { Assets } from '../worker/assets.ts';
import { CACHE, respond } from '../worker/respond.ts';
import { Address } from './address.ts';
import { Background, Held } from './background.ts';
import { deliver } from './deliver.ts';
import { layerOf } from './films.ts';
import { List } from './list.ts';
import { layerTest, TEST_ADMIN_TOKEN } from './local.ts';
import { Mailbox, Mailer, MailRefused, MailUnavailable } from './mailer.ts';
import { MAIL_PAGES, SIGNUP_FIELDS } from './paths.ts';
import { Queued } from './queue.ts';
import { SqlError } from './sql.ts';
import { SIGNUPS } from './throttle.ts';
import { Tokens } from './tokens.ts';

const ORIGIN = 'https://firsttheblade.test';
const ANN = 'Ann@Example.com';
const FILM = 'path/01';

/** A series with one film out, as the site will list it once one is. */
const WITH_A_FILM: ReadonlyArray<Series> = SERIES.map((series) => {
  if (series.id !== 'path') return series;
  return {
    ...series,
    episodes: [
      {
        no: '01',
        title: 'A test film',
        youtubeId: 'test-video',
        published: '2026-11-01',
        summary: 'A summary for the test.',
      },
    ],
  };
});

/** Each page a route answers with, as the prerender writes it. */
const PAGES = new Map<string, string>(
  Object.values(MAIL_PAGES).map((path) => [path, `<h1>${path}</h1>`]),
);

const AssetsTest = Layer.succeed(
  Assets,
  Assets.of({
    serve: (request) => {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      return Effect.succeed(
        Option.match(Option.fromNullishOr(PAGES.get(pathname)), {
          onNone: () => HttpServerResponse.text('Not Found', { status: 404 }),
          onSome: (body) =>
            HttpServerResponse.text(body, { contentType: 'text/html; charset=utf-8' }),
        }),
      );
    },
  }),
);

/** Every line the routes log, as written. */
class Heard extends Context.Service<Heard, { readonly lines: () => ReadonlyArray<string> }>()(
  'test/Heard',
) {}

const layerHeard = Layer.unwrap(
  Effect.sync(() => {
    const lines: Array<string> = [];
    const logger = Logger.make(({ message }) => {
      lines.push([message].flat().map(String).join(' '));
    });
    return Layer.merge(
      Logger.layer([logger]),
      Layer.succeed(Heard, Heard.of({ lines: () => lines })),
    );
  }),
);

const test = it.effect.layer(
  Layer.mergeAll(AssetsTest, layerTest(layerOf(WITH_A_FILM)), layerHeard).pipe(
    Layer.provide(BunServices.layer),
  ),
);

const call = (path: string, init: RequestInit = {}) =>
  respond(HttpServerRequest.fromWeb(new Request(`${ORIGIN}${path}`, init)));

/** The sign-up form's post, answered; its work after the answer not yet run. */
const postSignUp = (fields: Readonly<Record<string, string>>, place = '192.0.2.1') =>
  call('/subscribe', {
    method: 'POST',
    body: new URLSearchParams(fields),
    headers: { 'cf-connecting-ip': place },
  });

/** The sign-up form's post, answered, and its work after the answer run. */
const signUp = Effect.fn('Test.signUp')(function* (
  fields: Readonly<Record<string, string>>,
  place?: string,
) {
  const response = yield* postSignUp(fields, place);
  yield* (yield* Held).settle;
  return response;
});

const header = (response: HttpServerResponse.HttpServerResponse, name: string) =>
  Option.getOrElse(Headers.get(response.headers, name), () => '');

const TOKEN = /token=([^\s&"<>]+)/;

/** The token in a letter's link. */
const tokenIn = (text: string) =>
  decodeURIComponent(Option.getOrThrow(Option.fromNullishOr(TOKEN.exec(text)?.[1])));

const letters = Effect.gen(function* () {
  return yield* (yield* Mailbox).letters;
});

/** Signs `address` up and confirms it from its letter. */
const joined = Effect.fn('Test.joined')(function* (address: string) {
  yield* signUp({ email: address });
  const sent = yield* letters;
  const letter = Option.getOrThrow(Option.fromNullishOr(sent.at(-1)));
  const confirmed = yield* call(
    `/subscribe/confirm?token=${encodeURIComponent(tokenIn(letter.text))}`,
  );
  expect(header(confirmed, 'location')).toBe(MAIL_PAGES.confirmed);
});

/** What `bun run mail:send` posts: its JSON, as text. */
const admin = (body: string, token = TEST_ADMIN_TOKEN) =>
  call('/mail/send', {
    method: 'POST',
    body,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });

const answerOf = (response: HttpServerResponse.HttpServerResponse) =>
  HttpServerResponse.toWeb(response).json();

describe('signing up', () => {
  test('a new address is sent one confirm letter and sent to the check page', () =>
    Effect.gen(function* () {
      const response = yield* signUp({ email: ANN });
      expect(response.status).toBe(303);
      expect(header(response, 'location')).toBe(MAIL_PAGES.check);
      expect(header(response, 'cache-control')).toBe(CACHE.never);
      const sent = yield* letters;
      expect(sent).toHaveLength(1);
      expect(sent[0]?.to).toBe(Address.make('ann@example.com'));
      expect(sent[0]?.text).toContain(`${ORIGIN}/subscribe/confirm?token=`);
      expect(sent[0]?.html).toContain(`${ORIGIN}/subscribe/confirm?token=`);
    }));

  test('the answer comes before the list or the mailer is touched, the same for every address', () =>
    Effect.gen(function* () {
      yield* joined(ANN);
      yield* TestClock.adjust(Duration.hours(2));
      const known = yield* postSignUp({ email: ANN });
      const fresh = yield* postSignUp({ email: 'ben@example.com' });
      expect(yield* letters).toHaveLength(1);
      for (const response of [known, fresh]) {
        expect(response.status).toBe(303);
        expect(header(response, 'location')).toBe(MAIL_PAGES.check);
      }
      expect(known.headers).toEqual(fresh.headers);
      yield* (yield* Held).settle;
      const sent = yield* letters;
      expect(sent).toHaveLength(2);
      expect(sent[1]?.to).toBe(Address.make('ben@example.com'));
    }));

  test('a sign-up is answered while its letter is still being sent', () =>
    Effect.gen(function* () {
      // As on Cloudflare, the work starts at once, and the answer does not wait for it.
      const scope = yield* Scope.Scope;
      const eager = Background.of({ run: (work) => Effect.asVoid(Effect.forkIn(work, scope)) });
      const asked = yield* Deferred.make<boolean>();
      const stuck = Mailer.of({
        send: () => Deferred.succeed(asked, true).pipe(Effect.andThen(Effect.never)),
      });
      const response = yield* postSignUp({ email: ANN }).pipe(
        Effect.provideService(Background, eager),
        Effect.provideService(Mailer, stuck),
      );
      expect(header(response, 'location')).toBe(MAIL_PAGES.check);
      expect(yield* Deferred.await(asked)).toBe(true);
    }).pipe(Effect.scoped));

  test('a confirm letter that cannot be made is logged, and the next try sends it', () =>
    Effect.gen(function* () {
      const tokens = yield* Tokens;
      const broken = Tokens.of({ ...tokens, sign: () => Effect.die('no signature') });
      const response = yield* signUp({ email: ANN }).pipe(Effect.provideService(Tokens, broken));
      expect(header(response, 'location')).toBe(MAIL_PAGES.check);
      expect(yield* letters).toHaveLength(0);
      const unsent = (yield* Heard).lines().filter((line) => line.includes('subscribe.unsent'));
      expect(unsent).toHaveLength(1);
      expect(unsent[0]).toContain('reason=defect');
      yield* signUp({ email: ANN });
      expect(yield* letters).toHaveLength(1);
    }));

  test('a sign-up whose work runs after the address leaves sends a link that confirms', () =>
    Effect.gen(function* () {
      yield* joined(ANN);
      yield* admin(`{"film":"${FILM}"}`);
      yield* deliver(yield* (yield* Queued).deliveries);
      const film = (yield* letters).find((letter) => letter.subject.startsWith('A new'));
      const leave = `/unsubscribe?token=${encodeURIComponent(tokenIn(film?.text ?? ''))}`;
      yield* TestClock.adjust(Duration.hours(1));
      yield* postSignUp({ email: ANN });
      yield* TestClock.adjust(Duration.millis(1));
      yield* call(leave, { method: 'POST' });
      yield* TestClock.adjust(Duration.millis(1));
      yield* (yield* Held).settle;
      const letter = (yield* letters).at(-1);
      expect(letter?.subject).toStartWith('Confirm');
      const confirmed = yield* call(
        `/subscribe/confirm?token=${encodeURIComponent(tokenIn(letter?.text ?? ''))}`,
      );
      expect(header(confirmed, 'location')).toBe(MAIL_PAGES.confirmed);
    }));

  test('a second sign-up within the hour sends nothing more, and one after it sends again', () =>
    Effect.gen(function* () {
      yield* signUp({ email: ANN });
      const again = yield* signUp({ email: ANN });
      expect(header(again, 'location')).toBe(MAIL_PAGES.check);
      expect(yield* letters).toHaveLength(1);
      yield* TestClock.adjust(Duration.hours(1));
      yield* signUp({ email: ANN });
      expect(yield* letters).toHaveLength(2);
    }));

  test('an address already on the list is sent nothing, and answered the same', () =>
    Effect.gen(function* () {
      yield* joined(ANN);
      yield* TestClock.adjust(Duration.hours(2));
      const response = yield* signUp({ email: ANN });
      expect(response.status).toBe(303);
      expect(header(response, 'location')).toBe(MAIL_PAGES.check);
      expect(yield* letters).toHaveLength(1);
    }));

  test('a filled honeypot is answered the same and nothing is kept or sent', () =>
    Effect.gen(function* () {
      const response = yield* signUp({
        email: ANN,
        [SIGNUP_FIELDS.honeypot]: 'https://spam.example',
      });
      expect(header(response, 'location')).toBe(MAIL_PAGES.check);
      expect(yield* letters).toHaveLength(0);
      const list = yield* List;
      expect(yield* list.signUp(Address.make('ann@example.com'), 0)).toSatisfy(Option.isSome);
    }));

  test('an address that does not read is sent to the page that asks again', () =>
    Effect.gen(function* () {
      const typos = ['', 'ann', 'ann@', '@example.com', 'ann@example', 'a b@example.com'];
      for (const [n, typed] of typos.entries()) {
        // Each from a place of its own, under the minute's limit.
        const response = yield* signUp({ email: typed }, `198.51.100.${n}`);
        expect(header(response, 'location')).toBe(MAIL_PAGES.address);
      }
      expect(yield* letters).toHaveLength(0);
    }));

  test('a place that signs up too often in a minute is refused, and others are not', () =>
    Effect.gen(function* () {
      for (let n = 0; n < SIGNUPS.limit; n += 1) {
        const response = yield* signUp({ email: `n${n}@example.com` });
        expect(response.status).toBe(303);
      }
      const refused = yield* signUp({ email: 'late@example.com' });
      expect(refused.status).toBe(429);
      expect(header(refused, 'cache-control')).toBe(CACHE.never);
      const other = yield* signUp({ email: 'other@example.com' }, '198.51.100.7');
      expect(other.status).toBe(303);
      yield* TestClock.adjust(Duration.seconds(SIGNUPS.period));
      expect((yield* signUp({ email: 'later@example.com' })).status).toBe(303);
    }));

  test('a confirm letter that cannot be sent is answered the same, and the next try sends it', () =>
    Effect.gen(function* () {
      const mailbox = yield* Mailbox;
      yield* mailbox.failNext(MailUnavailable.make({ code: 'E_INTERNAL_SERVER_ERROR' }));
      const response = yield* signUp({ email: ANN });
      expect(header(response, 'location')).toBe(MAIL_PAGES.check);
      expect(yield* letters).toHaveLength(0);
      yield* signUp({ email: ANN });
      expect(yield* letters).toHaveLength(1);
    }));
});

describe('confirming', () => {
  test('the link confirms, and opening it twice confirms once', () =>
    Effect.gen(function* () {
      yield* signUp({ email: ANN });
      const [letter] = yield* letters;
      const link = `/subscribe/confirm?token=${encodeURIComponent(tokenIn(letter?.text ?? ''))}`;
      const first = yield* call(link);
      expect(first.status).toBe(303);
      expect(header(first, 'location')).toBe(MAIL_PAGES.confirmed);
      const second = yield* call(link);
      expect(header(second, 'location')).toBe(MAIL_PAGES.confirmed);
      const list = yield* List;
      expect((yield* list.counts(FILM)).confirmed).toBe(1);
    }));

  test('a link seven days old, or changed, or missing, leads to the page that signs up again', () =>
    Effect.gen(function* () {
      yield* signUp({ email: ANN });
      const [letter] = yield* letters;
      const token = tokenIn(letter?.text ?? '');
      // Another subscriber's id under this one's signature, and a cut signature.
      const others = [token.replace(/^c\.\d+\./, 'c.99.'), token.slice(0, -4)];
      expect(others.every((other) => other !== token)).toBe(true);
      const links = [
        ...others.map((other) => `/subscribe/confirm?token=${encodeURIComponent(other)}`),
        '/subscribe/confirm',
      ];
      for (const link of links) {
        expect(header(yield* call(link), 'location')).toBe(MAIL_PAGES.expired);
      }
      yield* TestClock.adjust(Duration.days(7));
      const late = yield* call(`/subscribe/confirm?token=${encodeURIComponent(token)}`);
      expect(header(late, 'location')).toBe(MAIL_PAGES.expired);
      const list = yield* List;
      expect((yield* list.counts(FILM)).confirmed).toBe(0);
    }));
});

describe('sending a film', () => {
  test('refuses a caller without the admin token', () =>
    Effect.gen(function* () {
      expect((yield* admin(`{"film":"${FILM}"}`, 'wrong')).status).toBe(401);
      const bare = yield* call('/mail/send', { method: 'POST', body: '{}' });
      expect(bare.status).toBe(401);
    }));

  test('refuses a body that does not read, and a film the site does not list', () =>
    Effect.gen(function* () {
      expect((yield* admin('nonsense')).status).toBe(400);
      expect((yield* admin('{"film":"path/99"}')).status).toBe(404);
    }));

  test('a dry run counts and sends nothing; a send queues each confirmed subscriber once', () =>
    Effect.gen(function* () {
      yield* joined(ANN);
      yield* joined('ben@example.com');
      yield* signUp({ email: 'cal@example.com' });
      const dry = yield* admin(`{"film":"${FILM}","dryRun":true}`);
      expect(dry.status).toBe(200);
      expect(yield* Effect.promise(() => answerOf(dry))).toEqual({
        film: FILM,
        confirmed: 2,
        sent: 0,
        refused: 0,
        waiting: 2,
        unsure: 0,
        queued: 0,
      });
      const queued = yield* Queued;
      expect(yield* queued.deliveries).toHaveLength(0);
      const sent = yield* admin(`{"film":"${FILM}"}`);
      expect(sent.status).toBe(202);
      const deliveries = yield* queued.deliveries;
      expect(deliveries).toHaveLength(2);
      expect(
        deliveries.every((delivery) => delivery.film === FILM && delivery.origin === ORIGIN),
      ).toBe(true);
    }));

  test('a film reaches each subscriber once, with a one-click leave link, however often it is delivered', () =>
    Effect.gen(function* () {
      yield* joined(ANN);
      yield* joined('ben@example.com');
      yield* admin(`{"film":"${FILM}"}`);
      const deliveries = yield* (yield* Queued).deliveries;
      yield* deliver(deliveries);
      yield* deliver(deliveries);
      const films = (yield* letters).filter((letter) => letter.subject.startsWith('A new'));
      expect(films).toHaveLength(2);
      const [letter] = films;
      expect(letter?.subject).toBe('A new film: A test film');
      expect(letter?.text).toContain('https://www.youtube.com/watch?v=test-video');
      const leave = `${ORIGIN}/unsubscribe?token=`;
      expect(letter?.headers['List-Unsubscribe']).toStartWith(`<${leave}`);
      expect(letter?.headers['List-Unsubscribe']).toEndWith('>');
      expect(letter?.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
      expect(letter?.text).toContain(leave);
      expect(letter?.html).toContain(leave);
      expect(letter?.html).not.toContain('<img');
      const list = yield* List;
      expect(yield* list.counts(FILM)).toEqual({
        confirmed: 2,
        sent: 2,
        refused: 0,
        waiting: 0,
        unsure: 0,
      });
      yield* admin(`{"film":"${FILM}"}`);
      expect(yield* (yield* Queued).deliveries).toHaveLength(2);
    }));

  test('a refused letter is recorded; one the sender cannot take now fails the batch, which resumes', () =>
    Effect.gen(function* () {
      yield* joined(ANN);
      yield* joined('ben@example.com');
      yield* joined('cal@example.com');
      yield* admin(`{"film":"${FILM}"}`);
      const deliveries = yield* (yield* Queued).deliveries;
      const mailbox = yield* Mailbox;
      yield* mailbox.failNext(
        MailRefused.make({ code: 'E_RECIPIENT_SUPPRESSED' }),
        MailUnavailable.make({ code: 'E_RATE_LIMIT_EXCEEDED' }),
      );
      const failed = yield* Effect.flip(deliver(deliveries));
      expect(failed._tag).toBe('MailUnavailable');
      const list = yield* List;
      expect(yield* list.counts(FILM)).toEqual({
        confirmed: 3,
        sent: 0,
        refused: 1,
        waiting: 2,
        unsure: 0,
      });
      yield* deliver(deliveries);
      expect(yield* list.counts(FILM)).toEqual({
        confirmed: 3,
        sent: 2,
        refused: 1,
        waiting: 0,
        unsure: 0,
      });
    }));

  test('a film letter that cannot be made claims nothing, and the next try sends it', () =>
    Effect.gen(function* () {
      yield* joined(ANN);
      yield* admin(`{"film":"${FILM}"}`);
      const deliveries = yield* (yield* Queued).deliveries;
      const tokens = yield* Tokens;
      const broken = Tokens.of({ ...tokens, sign: () => Effect.die('no signature') });
      const failed = yield* Effect.exit(
        deliver(deliveries).pipe(Effect.provideService(Tokens, broken)),
      );
      expect(failed._tag).toBe('Failure');
      const list = yield* List;
      expect(yield* list.counts(FILM)).toMatchObject({ waiting: 1, unsure: 0 });
      yield* deliver(deliveries);
      const films = (yield* letters).filter((letter) => letter.subject.startsWith('A new'));
      expect(films).toHaveLength(1);
      expect(yield* list.counts(FILM)).toMatchObject({ sent: 1, unsure: 0 });
    }));

  test('a subscriber who leaves while their letter is made is not sent it', () =>
    Effect.gen(function* () {
      yield* joined(ANN);
      yield* admin(`{"film":"${FILM}"}`);
      const deliveries = yield* (yield* Queued).deliveries;
      const tokens = yield* Tokens;
      const paused = yield* Deferred.make<boolean>();
      const go = yield* Deferred.make<boolean>();
      const slow = Tokens.of({
        ...tokens,
        sign: (token) =>
          Deferred.succeed(paused, true).pipe(
            Effect.andThen(Deferred.await(go)),
            Effect.andThen(tokens.sign(token)),
          ),
      });
      const delivering = yield* Effect.forkChild(
        deliver(deliveries).pipe(Effect.provideService(Tokens, slow)),
      );
      yield* Deferred.await(paused);
      const { subscriber } = Option.getOrThrow(Option.fromNullishOr(deliveries[0]));
      const leave = yield* tokens.sign({ _tag: 'Unsubscribe', subscriber });
      const left = yield* call(`/unsubscribe?token=${encodeURIComponent(leave)}`, {
        method: 'POST',
      });
      expect(left.status).toBe(200);
      yield* Deferred.succeed(go, true);
      yield* Fiber.join(delivering);
      expect((yield* letters).filter((letter) => letter.subject.startsWith('A new'))).toHaveLength(
        0,
      );
      expect(yield* (yield* List).counts(FILM)).toMatchObject({ sent: 0, refused: 0, unsure: 0 });
    }));

  test('a letter sent whose outcome could not be kept is never sent again', () =>
    Effect.gen(function* () {
      yield* joined(ANN);
      yield* admin(`{"film":"${FILM}"}`);
      const deliveries = yield* (yield* Queued).deliveries;
      const list = yield* List;
      const forgetful = List.of({
        ...list,
        recordSend: () => SqlError.make({ statement: 'list.recordSend', reason: 'test' }),
      });
      const failed = yield* Effect.flip(
        deliver(deliveries).pipe(Effect.provideService(List, forgetful)),
      );
      expect(failed._tag).toBe('SqlError');
      yield* deliver(deliveries);
      const films = (yield* letters).filter((letter) => letter.subject.startsWith('A new'));
      expect(films).toHaveLength(1);
      expect(yield* list.counts(FILM)).toMatchObject({ sent: 0, waiting: 0, unsure: 1 });
      yield* admin(`{"film":"${FILM}"}`);
      expect(yield* (yield* Queued).deliveries).toHaveLength(1);
    }));
});

describe('leaving', () => {
  /** The leave link of the film letter sent to the list's one subscriber. */
  const leaveLink = Effect.gen(function* () {
    yield* joined(ANN);
    yield* admin(`{"film":"${FILM}"}`);
    yield* deliver(yield* (yield* Queued).deliveries);
    const film = (yield* letters).find((letter) => letter.subject.startsWith('A new'));
    return `/unsubscribe?token=${encodeURIComponent(tokenIn(film?.text ?? ''))}`;
  });

  test('the link shows the one-button page, and a link that does not read is refused', () =>
    Effect.gen(function* () {
      const link = yield* leaveLink;
      const page = yield* call(link);
      expect(page.status).toBe(200);
      expect(header(page, 'cache-control')).toBe(CACHE.never);
      expect((yield* call('/unsubscribe?token=u.1.forged')).status).toBe(400);
      expect((yield* call('/unsubscribe')).status).toBe(400);
    }));

  /** The left page, answered 200 and never as a redirect. */
  const expectLeft = Effect.fn('Test.expectLeft')(function* (
    left: HttpServerResponse.HttpServerResponse,
  ) {
    expect(left.status).toBe(200);
    expect(header(left, 'location')).toBe('');
    expect(header(left, 'cache-control')).toBe(CACHE.never);
    const body = yield* Effect.promise(() => HttpServerResponse.toWeb(left).text());
    expect(body).toContain(MAIL_PAGES.left);
  });

  test('the button leaves, and leaving twice is leaving', () =>
    Effect.gen(function* () {
      const link = yield* leaveLink;
      for (let n = 0; n < 2; n += 1) yield* expectLeft(yield* call(link, { method: 'POST' }));
      const list = yield* List;
      expect((yield* list.counts(FILM)).confirmed).toBe(0);
    }));

  test("a mail app's one click leaves in either form encoding, never redirected (RFC 8058)", () =>
    Effect.gen(function* () {
      const link = yield* leaveLink;
      const multipart = new FormData();
      multipart.set('List-Unsubscribe', 'One-Click');
      const bodies = [new URLSearchParams({ 'List-Unsubscribe': 'One-Click' }), multipart];
      for (const body of bodies) yield* expectLeft(yield* call(link, { method: 'POST', body }));
      const list = yield* List;
      expect((yield* list.counts(FILM)).confirmed).toBe(0);
    }));

  test('a confirm link does not leave', () =>
    Effect.gen(function* () {
      yield* signUp({ email: ANN });
      const [letter] = yield* letters;
      const confirmToken = encodeURIComponent(tokenIn(letter?.text ?? ''));
      expect((yield* call(`/unsubscribe?token=${confirmToken}`, { method: 'POST' })).status).toBe(
        400,
      );
    }));
});

describe('the routes', () => {
  test('answer a method they do not take with 405 and what they take', () =>
    Effect.gen(function* () {
      const response = yield* call('/subscribe');
      expect(response.status).toBe(405);
      expect(header(response, 'allow')).toBe('POST');
    }));

  test('log ids and counts, never an address or a token', () =>
    Effect.gen(function* () {
      yield* joined(ANN);
      yield* signUp({ email: 'nope' });
      yield* signUp({ email: ANN, [SIGNUP_FIELDS.honeypot]: 'x' });
      yield* admin(`{"film":"${FILM}"}`);
      yield* deliver(yield* (yield* Queued).deliveries);
      const sent = yield* letters;
      const tokens = sent.map((letter) => tokenIn(letter.text));
      const lines = (yield* Heard).lines();
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).toStartWith('[mail] ');
        expect(line.toLowerCase()).not.toContain('ann@example.com');
        expect(line).not.toContain(TEST_ADMIN_TOKEN);
        for (const token of tokens) expect(line).not.toContain(token);
      }
    }));
});
