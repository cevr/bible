// What the review's cards say of a file, and which copy of a video it
// plays: pure, so each reads the same in a test as on the page.

import { Array as Arr, Option } from 'effect';
import { type ReviewFile, type ReviewFolder, type ReviewVideo } from '../../core/schema.ts';
import { reviewFileUrl, reviewPhoneUrl } from '../../core/api.ts';

/** A size in bytes as a card says it: `812 KB`, `2.4 GB`. */
export const sizeText = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  for (const unit of units) {
    // A tenth only where it tells: 2.4 GB, 36 MB.
    if (n < 10 && unit !== 'B') return `${n.toFixed(1)} ${unit}`;
    if (n < 1024) return `${n.toFixed(0)} ${unit}`;
    n /= 1024;
  }
  return `${n.toFixed(1)} TB`;
};

/** How long ago `mtime` was, at `now` (both ms): `just now`, `12 min ago`, `3 h ago`, `2 d ago`. */
export const agoText = (mtime: number, now: number): string => {
  const seconds = (now - mtime) / 1000;
  if (seconds < 90) return 'just now';
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 129_600) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86_400)} d ago`;
};

/** Which copy a video plays: its 720p phone copy (when made) or the file itself. */
export type Quality = 'phone' | 'full';

/** The URL a video plays from at `quality`: the phone copy only once it is ready. */
export const videoUrl = (video: ReviewVideo, quality: Quality): string => {
  if (quality === 'phone' && video.phone === 'ready') return reviewPhoneUrl(video.ref);
  return reviewFileUrl(video.ref);
};

/** `n` things, named in the singular: `1 video`, `3 videos`, none for none. */
const counted = (n: number, thing: string): Option.Option<string> => {
  if (n === 0) return Option.none();
  if (n === 1) return Option.some(`1 ${thing}`);
  return Option.some(`${n} ${thing}s`);
};

/** What a folder holds: `2 comparisons · 3 videos · 1 doc`. */
export const countsText = (folder: ReviewFolder): string =>
  Arr.getSomes([
    counted(folder.sets.length, 'comparison'),
    counted(folder.videos.length, 'video'),
    counted(folder.images.length, 'image'),
    counted(folder.docs.length, 'doc'),
  ]).join(' · ');

/** The folder's name as its card shows it: its manifest's title, else its ref's last part. */
export const folderTitle = (folder: ReviewFolder): string =>
  Option.getOrElse(folder.title, () => folder.ref);

/** Whether `folder` matches what the filter holds (any case), by its ref or its title. */
export const folderMatches = (folder: ReviewFolder, filter: string): boolean => {
  const needle = filter.trim().toLowerCase();
  if (needle === '') return true;
  const title = Option.getOrElse(folder.title, () => '');
  return `${folder.ref} ${title}`.toLowerCase().includes(needle);
};

/** A folder's captions for a video (`<name>.vtt`, or its master's for a share copy). */
export const captionsFor = (
  video: ReviewFile,
  docs: ReadonlyArray<ReviewFile>,
): Option.Option<ReviewFile> => {
  const base = video.name.replace(/\.(mp4|webm|mov|m4v)$/, '');
  const names = [`${base}.vtt`, `${base.replace(/\.share$/, '')}.vtt`];
  return Option.fromUndefinedOr(docs.find((doc) => names.includes(doc.name)));
};

/** A state as an ARIA attribute says it (`aria-pressed`, `aria-busy`). */
export const pressed = (on: boolean) => `${on}` as const;

/** Whether a doc reads as markdown (shown inline); the rest are linked. */
export const isMarkdown = (doc: ReviewFile): boolean => doc.name.endsWith('.md');
