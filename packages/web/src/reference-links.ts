import { Database } from 'bun:sqlite';
import { BIBLE_BOOK_ALIASES } from '@bible/core/bible';
import { Config, Context, Effect, Layer, Option, Schema } from 'effect';
import { homedir } from 'node:os';

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const BIBLE_BOOK_PATTERN = Object.keys(BIBLE_BOOK_ALIASES)
  .sort((left, right) => right.length - left.length)
  .map(escapeRegex)
  .join('|');

const VERSE = `\\d+(?:[-–—]\\d+(?::\\d+)?)?`;
const CHAPTER_VERSES = `\\d+:${VERSE}(?:, ?${VERSE})*`;
const BIBLE_REFERENCE = new RegExp(
  `\\b(?:${BIBLE_BOOK_PATTERN})\\.? ${CHAPTER_VERSES}(?:; ?${CHAPTER_VERSES})*`,
  'gi',
);

// Publication codes in the EGW corpus are case-sensitive and include shapes
// such as CTr, 14MR, and LOF_ATJ. The database lookup is the authority that
// distinguishes a citation from ordinary word-and-decimal prose.
const EGW_REFERENCE =
  /\b([1-9]\d?[A-Za-z][A-Za-z0-9_]{0,30}|[A-Za-z][A-Za-z0-9_]{1,31}) (\d+\.\d+)(?:[-–—](?:\d+\.)?\d+)?\b/g;
const SUPPRESSED_TAGS = new Set(['a', 'code', 'pre', 'script', 'style']);

type EgwPanelMap = ReadonlyMap<string, string>;

interface EgwPanelRow {
  readonly refcode: string;
  readonly panelId: string;
}

/** Read the canonical EGW paragraph IDs used by egwwritings.org deep links. */
const loadEgwPanelMap = (databasePath: string): Effect.Effect<EgwPanelMap, unknown> =>
  Effect.acquireUseRelease(
    Effect.try({
      try: () => new Database(databasePath, { readonly: true, strict: true }),
      catch: (cause) => cause,
    }),
    (database) =>
      Effect.try({
        try: () => {
          const rows = database
            .query<EgwPanelRow, []>(
              `select refcode_short as refcode, para_id as panelId
         from paragraphs
         where refcode_short is not null and para_id is not null`,
            )
            .all();
          return new Map(rows.map((row) => [row.refcode, row.panelId]));
        },
        catch: (cause) => cause,
      }),
    (database) => Effect.sync(() => database.close()),
  );

const externalLink = (href: string, label: string): string =>
  `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;

const linkTextReferences = (text: string, egwPanels: EgwPanelMap): string => {
  const withEgw = text.replace(EGW_REFERENCE, (reference, bookCode: string, paragraph: string) => {
    const panelId = egwPanels.get(`${bookCode} ${paragraph}`);
    if (panelId === undefined) return reference;
    const href = `https://egwwritings.org/read?panels=p${encodeURIComponent(panelId)}&index=0`;
    return externalLink(href, reference);
  });

  return withEgw.replace(BIBLE_REFERENCE, (reference) => {
    const href = `https://www.biblegateway.com/passage/?search=${encodeURIComponent(reference)}&version=KJV`;
    return externalLink(href, reference);
  });
};

/**
 * Link references in rendered prose while leaving tags, existing anchors,
 * inline/fenced code, scripts, and styles untouched.
 */
const linkReferences = (html: string, egwPanels: EgwPanelMap): string => {
  const suppressed: string[] = [];
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (!part.startsWith('<')) {
        if (suppressed.length === 0) return linkTextReferences(part, egwPanels);
        return part;
      }

      const closing = part.match(/^<\/([a-z0-9]+)/i)?.[1]?.toLowerCase();
      if (closing !== undefined && SUPPRESSED_TAGS.has(closing)) {
        const index = suppressed.lastIndexOf(closing);
        if (index !== -1) suppressed.splice(index, 1);
        return part;
      }

      const opening = part.match(/^<([a-z0-9]+)/i)?.[1]?.toLowerCase();
      if (opening !== undefined && SUPPRESSED_TAGS.has(opening) && !part.endsWith('/>')) {
        suppressed.push(opening);
      }
      return part;
    })
    .join('');
};

export class ReferenceDatabaseError extends Schema.TaggedErrorClass<ReferenceDatabaseError>()(
  'ReferenceLinks.ReferenceDatabaseError',
  {
    path: Schema.String,
    message: Schema.String,
  },
) {}

export interface Interface {
  readonly link: (html: string) => string;
}

export class Service extends Context.Service<Service, Interface>()('@bible/site/ReferenceLinks') {
  static Test = (panels: EgwPanelMap): Layer.Layer<Service> =>
    Layer.succeed(Service, Service.of({ link: (html) => linkReferences(html, panels) }));
}

const CauseMessage = Schema.Struct({ message: Schema.String });

const causeMessage = (cause: unknown): string => {
  const decoded = Schema.decodeUnknownOption(CauseMessage)(cause);
  if (Option.isSome(decoded)) return decoded.value.message;
  return String(cause);
};

/** Load the canonical EGW corpus once, then hide it behind the linking interface. */
export const layer: Layer.Layer<Service, ReferenceDatabaseError | Config.ConfigError> =
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const databasePath = yield* Config.string('EGW_PARAGRAPH_DB').pipe(
        Config.withDefault(`${homedir()}/.bible/egw-paragraphs.db`),
      );
      const panels = yield* loadEgwPanelMap(databasePath).pipe(
        Effect.mapError(
          (cause) =>
            new ReferenceDatabaseError({
              path: databasePath,
              message: causeMessage(cause),
            }),
        ),
      );
      return Service.of({ link: (html) => linkReferences(html, panels) });
    }),
  );
