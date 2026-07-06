export * as Builder from './builder.js';

import { Context, Effect, FileSystem, Layer, Option, Path, Result, Schema } from 'effect';
import type { PlatformError } from 'effect/PlatformError';

import type { Comparison } from './comparison.js';
import { COMPARISONS, STUDIES_DIR } from './content.js';
import {
  anchorHeadings,
  comparisonsIndexPage,
  indexPage,
  prepareArticle,
  renderMarkdown,
  splitFrontmatter,
  studyPage,
  STYLES,
} from './render.js';
import { Study } from './study.js';

export class InvalidFrontmatter extends Schema.TaggedErrorClass<InvalidFrontmatter>()(
  'Builder.InvalidFrontmatter',
  {
    file: Schema.String,
    message: Schema.String,
  },
) {}

export class DuplicateSlug extends Schema.TaggedErrorClass<DuplicateSlug>()(
  'Builder.DuplicateSlug',
  {
    slug: Schema.String,
    message: Schema.String,
  },
) {}

class UnparseableYaml extends Schema.TaggedErrorClass<UnparseableYaml>()(
  'Builder.UnparseableYaml',
  {
    message: Schema.String,
  },
) {}

export type BuildError = InvalidFrontmatter | DuplicateSlug | PlatformError;

export interface Summary {
  readonly studies: number;
  readonly comparisons: number;
}

export interface Interface {
  /** Render the whole site into dist/ and return what was emitted. */
  readonly build: () => Effect.Effect<Summary, BuildError>;
}

export class Service extends Context.Service<Service, Interface>()('@bible/site/Builder') {}

/** A discovered study: its validated site copy plus the markdown body to render. */
interface Discovered {
  readonly file: string;
  readonly meta: Study.Meta;
  readonly body: string;
}

export const layer: Layer.Layer<Service, PlatformError, FileSystem.FileSystem | Path.Path> =
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const here = yield* path.fromFileUrl(new URL('.', import.meta.url)).pipe(Effect.orDie);
      const repoRoot = path.join(here, '..', '..', '..');
      const dist = path.join(here, '..', 'dist');
      const studiesDir = path.join(repoRoot, STUDIES_DIR);

      const readCandidate = Effect.fnUntraced(function* (file: string) {
        const raw = yield* fs.readFileString(path.join(studiesDir, file));
        const { fm, body } = splitFrontmatter(raw);
        if (fm === '') return Option.none<Discovered>();
        // A top-level `site:` line is the opt-in marker. Any failure to read the
        // block after that — unparseable YAML, wrong shape, bad card copy — is a
        // hard build error; without the marker the file is simply unpublished.
        const optedIn = /^site\s*:/m.test(fm);
        const fail = (message: string) => new InvalidFrontmatter({ file, message });

        const parsed = yield* Effect.result(parseYaml(fm));
        if (Result.isFailure(parsed)) {
          if (optedIn) {
            return yield* fail(
              `frontmatter has a site: block but is not valid YAML — ${parsed.failure.message}`,
            );
          }
          yield* Effect.logWarning('skipping study with unparseable frontmatter', {
            file,
            error: parsed.failure.message,
          });
          return Option.none<Discovered>();
        }

        const decoded = yield* Effect.result(
          Schema.decodeUnknownEffect(Study.Frontmatter)(parsed.success),
        );
        if (Result.isFailure(decoded)) {
          // Frontmatter that isn't an object (comment-only, a scalar, a list)
          // can't carry a site: block, so it's just unpublished — unless the
          // marker is there, in which case the block is genuinely malformed.
          if (optedIn) return yield* fail(decoded.failure.message);
          return Option.none<Discovered>();
        }
        return Option.map(Option.fromNullishOr(decoded.success.site), (meta) => ({
          file,
          meta,
          body,
        }));
      });

      const discoverStudies = Effect.fn('Builder.discoverStudies')(function* () {
        const entries = yield* fs.readDirectory(studiesDir);
        const files = entries.filter((f) => f.endsWith('.md')).sort();
        const candidates = yield* Effect.forEach(files, readCandidate, { concurrency: 8 });
        const found = candidates.filter(Option.isSome).map((c) => c.value);
        const bySlug = new Map<string, Discovered>();
        for (const study of found) {
          const existing = bySlug.get(study.meta.slug);
          if (existing !== undefined) {
            return yield* new DuplicateSlug({
              slug: study.meta.slug,
              message: `slug "${study.meta.slug}" is claimed by both ${existing.file} and ${study.file}`,
            });
          }
          bySlug.set(study.meta.slug, study);
        }
        yield* Effect.logInfo('discovered studies', {
          published: found.length,
          skipped: files.length - found.length,
        });
        // newest first on the index; filename breaks date ties deterministically
        return [...found].sort(
          (a, b) => b.meta.date.localeCompare(a.meta.date) || a.file.localeCompare(b.file),
        );
      });

      const buildStudy = Effect.fn('Builder.buildStudy')(function* (study: Discovered) {
        const words = countWords(study.body);
        const { html, toc } = anchorHeadings(prepareArticle(renderMarkdown(study.body)));
        yield* fs.makeDirectory(path.join(dist, study.meta.slug), { recursive: true });
        yield* fs.writeFileString(
          path.join(dist, study.meta.slug, 'index.html'),
          studyPage({ meta: study.meta, articleHtml: html, toc, words }),
        );
        yield* Effect.logInfo('built study', {
          slug: study.meta.slug,
          sections: toc.length,
          words,
        });
        return { ...study.meta, words, sections: toc.length };
      });

      const copyComparison = Effect.fn('Builder.copyComparison')(function* (
        comp: Comparison.Source,
      ) {
        const srcDir = path.join(repoRoot, comp.srcDir);
        const outDir = path.join(dist, 'comparisons', comp.outDir);
        yield* fs.makeDirectory(outDir, { recursive: true });
        const pages = (yield* fs.readDirectory(srcDir)).filter((f) => f.endsWith('.html'));
        yield* Effect.forEach(
          pages,
          (f) => fs.copyFile(path.join(srcDir, f), path.join(outDir, f)),
          { concurrency: 8, discard: true },
        );
        yield* Effect.logInfo('copied comparison', { outDir: comp.outDir, pages: pages.length });
      });

      const build = Effect.fn('Builder.build')(function* () {
        yield* Effect.logInfo('building The Sure Word', { dist });
        // dist is committed and served verbatim; wipe it first so a slug rename
        // or an unpublished study can't leave a stale, orphaned page behind.
        yield* fs.remove(dist, { recursive: true, force: true });
        yield* fs.makeDirectory(path.join(dist, 'comparisons'), { recursive: true });
        yield* fs.writeFileString(path.join(dist, 'styles.css'), STYLES);
        const studies = yield* discoverStudies();
        const [built] = yield* Effect.all(
          [
            Effect.forEach(studies, buildStudy, { concurrency: 8 }),
            Effect.forEach(COMPARISONS, copyComparison, { concurrency: 4, discard: true }),
          ],
          { concurrency: 2 },
        );
        yield* fs.writeFileString(
          path.join(dist, 'comparisons', 'index.html'),
          comparisonsIndexPage(COMPARISONS),
        );
        yield* fs.writeFileString(
          path.join(dist, 'index.html'),
          indexPage({ studies: built, comparisons: COMPARISONS }),
        );
        yield* fs.writeFileString(path.join(dist, '404.html'), NOT_FOUND_HTML);
        return { studies: built.length, comparisons: COMPARISONS.length };
      });

      return Service.of({ build });
    }),
  );

const NOT_FOUND_HTML =
  '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/" /><title>Not found</title><p>Not found — <a href="/">The Sure Word</a></p>';

const parseYaml = (fm: string) =>
  Effect.try({
    try: () => Bun.YAML.parse(fm),
    catch: (cause) =>
      new UnparseableYaml({
        message: cause instanceof globalThis.Error ? cause.message : String(cause),
      }),
  });

function countWords(s: string): number {
  return s.split(/\s+/).filter((w) => w.length > 0).length;
}
