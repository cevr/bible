/**
 * The site's pictures, by what they show. Each import is the built file's
 * URL (Vite fingerprints it under `/assets/`, which is cached for a year).
 * The field is brand round 5's repaint of round 4's field at 3072 px; the
 * night and the mark are round 4's paintings in palette 09; the emblems are
 * round 3's series marks in the same colours.
 */
import emblemLand from '../art/emblem-land.svg';
import emblemPath from '../art/emblem-path.svg';
import emblemRemedies from '../art/emblem-remedies.svg';
import emblemTaught from '../art/emblem-taught.svg';
import field768 from '../art/field-768.webp';
import field1536 from '../art/field-1536.webp';
import field3072 from '../art/field-3072.webp';
import mark112 from '../art/mark-112.webp';
import mark320 from '../art/mark-320.webp';
import night768 from '../art/night-768.webp';
import night1536 from '../art/night-1536.webp';
import type { SeriesId } from '../content.ts';

/** A painting at the widths a page may fetch; each file is 3:2. */
export interface Painting {
  /** The smallest file, for a browser that reads no `srcset`. */
  readonly src: string;
  readonly srcset: string;
}

type Width = readonly [url: string, width: number];

/** A painting from its files, smallest first. */
const painting = (smallest: Width, ...larger: ReadonlyArray<Width>): Painting => ({
  src: smallest[0],
  srcset: [smallest, ...larger].map(([url, width]) => `${url} ${width}w`).join(', '),
});

/** The field at morning, blade to full corn. */
export const FIELD = painting([field768, 768], [field1536, 1536], [field3072, 3072]);

/** The same field at night, under the moon. */
export const NIGHT = painting([night768, 768], [night1536, 1536]);

/** The mark: the shoot in its disc, small for the lockup and large on its own. */
export const MARK = { small: mark112, large: mark320 } as const;

/** Each series' emblem, a drawing in the brand's colours. */
export const EMBLEMS: Record<SeriesId, string> = {
  path: emblemPath,
  land: emblemLand,
  taught: emblemTaught,
  remedies: emblemRemedies,
};
