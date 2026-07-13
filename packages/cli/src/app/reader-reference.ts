import { ChapterReference, VerseReference } from '@bible/core/bible';
import { Schema } from 'effect';

/** Canonical Bible locations that the CLI reader can open directly. */
export const ReaderReference = Schema.Union([ChapterReference, VerseReference]);
export type ReaderReference = typeof ReaderReference.Type;
