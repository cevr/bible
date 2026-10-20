/**
 * Confirming in place: the confirm page's form posted from the page, and the
 * page its answer leads to (confirmed, or the expired notice) drawn over the
 * confirm page's words, keeping the mark both pages show, so nothing reloads
 * between the two. The address bar takes the drawn page's canonical path, so
 * a reload shows that page and never posts the used token again. Loaded only
 * on the confirm page (`./client.tsx`); a post that fails or an answer it
 * cannot draw is left to the form, submitted as a browser would.
 */
import { Effect, Option } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';

const LOST = '.lost';

const drawnOf = (html: string) =>
  Effect.sync(() => new DOMParser().parseFromString(html, 'text/html'));

const draw = (shown: Element, next: Document) =>
  Effect.gen(function* () {
    const drawn = yield* Effect.fromNullishOr(next.querySelector(LOST));
    const canonical = yield* Effect.fromNullishOr(next.querySelector('link[rel="canonical"]'));
    const path = new URL(canonical.getAttribute('href') ?? '', location.origin).pathname;
    Option.match(
      Option.all([
        Option.fromNullishOr(shown.querySelector('img')),
        Option.fromNullishOr(drawn.querySelector('img')),
      ]),
      {
        onNone: () => {},
        onSome: ([mark, nextMark]) => nextMark.replaceWith(mark),
      },
    );
    shown.replaceChildren(...drawn.childNodes);
    document.title = next.title;
    history.replaceState(history.state, '', path);
  });

export const confirmInPlace = (form: HTMLFormElement) =>
  Effect.gen(function* () {
    const shown = yield* Effect.fromNullishOr(document.querySelector(LOST));
    const client = yield* HttpClient.HttpClient;
    const answer = yield* client.execute(
      HttpClientRequest.post(location.href).pipe(
        HttpClientRequest.bodyFormData(new FormData(form)),
      ),
    );
    const next = yield* drawnOf(yield* answer.text);
    yield* draw(shown, next);
  }).pipe(
    Effect.catch(() => Effect.sync(() => form.requestSubmit())),
    Effect.provide(FetchHttpClient.layer),
  );
