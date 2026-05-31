import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ChapterSource } from '../../scripts/study-guide-schema.ts';
import type { ChapterSource as ChapterSourceType } from '../../scripts/study-guide-schema.ts';

/*
 * Server-only accessor for a Study Guide chapter's PRIVATE tier (verbatim Source
 * Text + Key Points). This is the ground truth the grading endpoint feeds the
 * Grader. It reads from apps/studies/private/<series>/<chapter>.json via fs and
 * validates with the ChapterSource schema.
 *
 * It MUST only ever run server-side. The private dir is not an Astro content
 * collection (see src/content.config.ts), so this is the single, deliberate seam
 * through which the source text becomes available — and only on the server.
 *
 * Paths resolve against process.cwd(), which is the app root (apps/studies) both
 * for `bun run start` and for tests run from the package.
 */

/** Default location of the private tier: <appRoot>/private. At runtime the server
 * runs from the app root (`bun run start`), and turbo runs tests from the package
 * dir, so process.cwd() is the app root in both. Callers may override via the
 * `privateRoot` option (used by tests invoked from an arbitrary cwd). */
const DEFAULT_PRIVATE_ROOT = join(process.cwd(), 'private');

/** Distinguishes "no such chapter" from "file is malformed" so the endpoint can
 * map them to different HTTP responses. */
export class ChapterSourceNotFoundError extends Error {
  override readonly name = 'ChapterSourceNotFoundError';
  constructor(
    readonly series: string,
    readonly chapter: string,
  ) {
    super(`No source for chapter "${chapter}" in series "${series}"`);
  }
}

export class ChapterSourceInvalidError extends Error {
  override readonly name = 'ChapterSourceInvalidError';
  constructor(
    readonly series: string,
    readonly chapter: string,
    override readonly cause: unknown,
  ) {
    super(`Source for chapter "${chapter}" in series "${series}" is invalid`);
  }
}

function isErrnoException(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && 'code' in e;
}

/**
 * Read and validate one chapter's private source. Throws
 * ChapterSourceNotFoundError if the file is absent, ChapterSourceInvalidError if
 * it fails JSON parsing or schema validation.
 */
export async function readChapterSource(
  series: string,
  chapter: string,
  options: { readonly privateRoot?: string } = {},
): Promise<ChapterSourceType> {
  const path = join(options.privateRoot ?? DEFAULT_PRIVATE_ROOT, series, `${chapter}.json`);

  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (e) {
    if (isErrnoException(e) && e.code === 'ENOENT') {
      throw new ChapterSourceNotFoundError(series, chapter);
    }
    throw e;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new ChapterSourceInvalidError(series, chapter, e);
  }

  const result = ChapterSource.safeParse(parsed);
  if (!result.success) {
    throw new ChapterSourceInvalidError(series, chapter, result.error);
  }
  return result.data;
}
