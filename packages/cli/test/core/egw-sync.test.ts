import {
  EGWApiClient,
  type EGWApiClientService,
  type Schemas as EGWSchemas,
} from '@bible/core/egw';
import { EGWParagraphDatabase, type BookRow } from '@bible/core/egw-db';
import {
  CorpusActivation,
  CorpusSourceUnavailableError,
  CorpusSupply,
  CorpusSupplyReceipt,
  assetSourceId,
  corpusRevision,
  type WritingsTarget,
  syncEgwCorpus,
} from '@bible/core/corpus-supply';
import { publicationId } from '@bible/core/writings';
import { Effect, Layer, Option, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

const book = (bookId: number, code: string): EGWSchemas.Book => ({
  book_id: bookId,
  code,
  lang: 'en',
  type: 'book',
  title: `Book ${code}`,
  author: 'Test Author',
  npages: 1,
  pub_year: '1900',
  folder_id: 1,
  cover: {},
  files: {},
  permission_required: 'public',
  sort: bookId,
  is_audiobook: false,
  nelements: 1,
});

const wireNull = Option.getOrNull(Option.none<never>());

const api = (books: readonly EGWSchemas.Book[]): EGWApiClientService => ({
  getLanguages: Effect.succeed([]),
  getFoldersByLanguage: () => Effect.succeed([]),
  getBooksByFolder: () => Effect.succeed([]),
  getBooks: () => Stream.fromIterable(books),
  getBook: (bookId) =>
    Effect.succeed(
      Option.fromNullishOr(books.find((item) => item.book_id === bookId)).pipe(
        Option.getOrElse(() => book(99, 'X')),
      ),
    ),
  getBookToc: () => Effect.succeed([]),
  getChapterContent: () => Effect.succeed([]),
  downloadBook: () => Effect.succeed(new ArrayBuffer(0)),
  search: () =>
    Effect.succeed({
      next: wireNull,
      previous: wireNull,
      total: 0,
      count: 0,
      results: [],
    }),
  getSuggestions: () => Effect.succeed([]),
  getBookCoverUrl: () => Effect.succeed('https://example.test/cover'),
  getMirrors: Effect.succeed([]),
});

describe('EGW corpus sync', () => {
  // The whole fixture is built here rather than inside the generator: the run
  // is provided once, at the test's own boundary, so nothing it depends on can
  // come into existence only partway through the run.
  const local: BookRow[] = [
    {
      book_id: 1,
      book_code: 'ONE',
      book_title: 'Book ONE',
      book_author: 'Test Author',
      paragraph_count: 1,
      created_at: '2026-08-15T00:00:00.000Z',
    },
    {
      book_id: 90,
      book_code: 'LOCAL',
      book_title: 'Local only',
      book_author: 'Test Author',
      paragraph_count: 1,
      created_at: '2026-08-15T00:00:00.000Z',
    },
  ];
  const attempted: number[] = [];
  const remote = [
    book(1, 'ONE'),
    book(2, 'TWO'),
    book(3, 'THREE'),
    book(4, 'FOUR'),
    book(5, 'FIVE'),
  ];
  const database = EGWParagraphDatabase.Test({ books: local });
  const supply = Layer.succeed(
    CorpusSupply,
    CorpusSupply.of({
      ensure: (input) => {
        const id = Option.fromNullishOr(input).pipe(
          Option.flatMap((value) => Option.fromNullishOr(value.target)),
          Option.filter((target): target is WritingsTarget => target._tag === 'writings'),
          Option.flatMap((target) => Option.fromNullishOr(target.publications)),
          Option.flatMap((publications) => Option.fromNullishOr(publications[0])),
        );
        if (Option.isNone(id)) return Effect.die('Test expected one Writings publication');
        const targetId = id.value;
        attempted.push(targetId);
        if (targetId === 3) {
          return Effect.fail(
            CorpusSourceUnavailableError.make({ operation: 'test-download', cause: 'offline' }),
          );
        }
        if (targetId === 4) return Effect.die('Invalid provider data');
        const installed = Option.fromNullishOr(remote.find((item) => item.book_id === targetId));
        if (Option.isNone(installed)) return Effect.die('Test publication is missing');
        const installedBook = installed.value;
        local.push({
          book_id: installedBook.book_id,
          book_code: installedBook.code,
          book_title: installedBook.title,
          book_author: installedBook.author,
          paragraph_count: installedBook.nelements,
          created_at: '2026-08-15T00:00:00.000Z',
        });
        return Effect.succeed(
          CorpusSupplyReceipt.make({
            activated: [
              CorpusActivation.make({
                corpus: 'writings',
                identity: publicationId(targetId),
                source: assetSourceId('test'),
                revision: corpusRevision('1'),
                installed: installedBook.nelements,
              }),
            ],
            skipped: [],
          }),
        );
      },
      // Writings sync never asks what File Corpus generation is active —
      // it drives `ensure` per publication. A stub that answered would be
      // inventing a fact this suite does not have; one that dies makes a
      // reader of it fail here rather than pass against a fiction.
      installed: () => Effect.die('egw sync does not read the installed file corpus'),
      activeFile: () => Effect.die('egw sync does not read a file corpus path'),
      // Nor does it install from a runtime manifest entry — that is §3.6's
      // path, and writings sync predates it. Dying for the same reason.
      installFrom: () => Effect.die('egw sync does not install from a content manifest'),
    }),
  );
  const layer = Layer.mergeAll(
    Layer.succeed(EGWApiClient, EGWApiClient.of(api(remote))),
    database,
    supply,
  );

  it.effect('keeps local-only books and continues after one remote book fails', () =>
    Effect.gen(function* () {
      const report = yield* syncEgwCorpus({
        lang: 'en',
        concurrency: 2,
        refresh: false,
        onProgress: () => Effect.void,
      });

      expect(attempted.sort()).toEqual([2, 3, 4, 5]);
      expect(report).toMatchObject({
        remote: 5,
        installedBefore: 1,
        attempted: 4,
        installed: 2,
        failed: 2,
        present: 3,
        localOnly: 1,
      });
      expect(report.missing).toEqual([
        { id: 3, code: 'THREE', title: 'Book THREE' },
        { id: 4, code: 'FOUR', title: 'Book FOUR' },
      ]);
      expect(local.some((item) => item.book_id === 90)).toBe(true);
      expect(Option.fromNullishOr(report.failures[0]).pipe(Option.map((item) => item.id))).toEqual(
        Option.some(3),
      );
    }).pipe(Effect.provide(layer)),
  );
});
