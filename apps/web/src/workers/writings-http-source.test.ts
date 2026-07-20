import { CorpusSupply, Target } from '@bible/core/corpus-supply';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import {
  ArchivedParagraph,
  Paragraph,
  Publication,
  PublicationArchive,
  PublicationArchiveJson,
  Reference,
  publicationCode,
  publicationId,
  publicationOrder,
} from '@bible/core/writings';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Result, Schema } from 'effect';

import { layerHttpWritingsAssetSource } from './writings-http-source.js';

const id = publicationId(127);
const code = publicationCode('PP');
const archive = new PublicationArchive({
  publication: new Publication({
    id,
    code,
    title: 'Patriarchs and Prophets',
    author: 'Ellen G. White',
    paragraphCount: Option.some(1),
  }),
  paragraphs: [
    new ArchivedParagraph({
      refcode: 'PP 1.1',
      paragraph: new Paragraph({
        reference: Reference.paragraph(id, 'pp-1-1'),
        publicationCode: code,
        order: publicationOrder(1),
        page: Option.none(),
        number: Option.none(),
        refcode: Option.some('PP 1.1'),
        nodes: [{ _tag: 'Text', text: 'The opening paragraph' }],
        elementType: Option.none(),
        elementSubtype: Option.none(),
      }),
      isHeading: false,
    }),
  ],
  bibleReferences: [],
});
const remoteCatalog = [
  {
    bookId: id,
    bookCode: code,
    title: archive.publication.title,
    author: archive.publication.author,
    paragraphCount: 1,
  },
];

const makeFetch =
  (dump: unknown) =>
  (url: string): Promise<Response> =>
    Effect.runPromise(
      Effect.sync(() => {
        if (url === '/api/egw/books') return Response.json(remoteCatalog);
        return Response.json(dump);
      }),
    );

describe('HTTP Writings asset source', () => {
  it.effect('coerces the catalog and archive before CorpusSupply installs it', () =>
    Effect.gen(function* () {
      const installed: PublicationArchive[] = [];
      const database = EGWParagraphDatabase.Test({
        needsSync: () => true,
        installPublicationArchive: (value) => {
          installed.push(value);
          return value.paragraphs.length;
        },
      });
      const source = layerHttpWritingsAssetSource(
        makeFetch(Schema.encodeSync(PublicationArchiveJson)(archive)),
      );
      const layer = CorpusSupply.layer.pipe(Layer.provide(database), Layer.provide(source));

      const receipt = yield* Effect.flatMap(CorpusSupply, (supply) =>
        supply.ensure({ target: Target.writings([id]), refresh: true }),
      ).pipe(Effect.provide(layer));

      expect(receipt.activated).toHaveLength(1);
      expect(installed).toEqual([archive]);
    }),
  );

  it.effect('rejects malformed archive JSON without touching the destination', () =>
    Effect.gen(function* () {
      let installs = 0;
      const database = EGWParagraphDatabase.Test({
        needsSync: () => true,
        installPublicationArchive: () => ++installs,
      });
      const source = layerHttpWritingsAssetSource(makeFetch({ formatVersion: 1 }));
      const layer = CorpusSupply.layer.pipe(Layer.provide(database), Layer.provide(source));
      const result = yield* Effect.flatMap(CorpusSupply, (supply) =>
        Effect.result(supply.ensure({ target: Target.writings([id]), refresh: true })),
      ).pipe(Effect.provide(layer));

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result))
        expect(result.failure._tag).toBe('CorpusContributionRejectedError');
      expect(installs).toBe(0);
    }),
  );
});
