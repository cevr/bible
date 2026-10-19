/**
 * The site's pictures, by what they show. Each import is the built file's
 * URL (Vite fingerprints it under `/assets/`, which is cached for a year).
 * The field, the night and the mark are brand round 4's paintings in palette
 * 09; the emblems are round 3's series marks in the same colours.
 */
import emblemLand from '../art/emblem-land.svg';
import emblemMilk from '../art/emblem-milk.svg';
import emblemRemedies from '../art/emblem-remedies.svg';
import emblemTaught from '../art/emblem-taught.svg';
import field768 from '../art/field-768.webp';
import field1536 from '../art/field-1536.webp';
import mark112 from '../art/mark-112.webp';
import mark320 from '../art/mark-320.webp';
import night768 from '../art/night-768.webp';
import night1536 from '../art/night-1536.webp';
import type { SeriesId } from '../content.ts';

/** A painting at two widths, for `srcset`; both are 3:2. */
export interface Painting {
  readonly small: string;
  readonly large: string;
}

export const srcset = (painting: Painting) => `${painting.small} 768w, ${painting.large} 1536w`;

/** The field at morning, blade to full corn. */
export const FIELD: Painting = { small: field768, large: field1536 };

/** The same field at night, under the moon. */
export const NIGHT: Painting = { small: night768, large: night1536 };

/** The mark: the shoot in its disc, small for the lockup and large on its own. */
export const MARK = { small: mark112, large: mark320 } as const;

/** Each series' emblem, a drawing in the brand's colours. */
export const EMBLEMS: Record<SeriesId, string> = {
  milk: emblemMilk,
  land: emblemLand,
  taught: emblemTaught,
  remedies: emblemRemedies,
};
