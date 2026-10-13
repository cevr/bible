/**
 * The site's pictures, by what they show. Each import is the built file's
 * URL (Vite fingerprints it under `/assets/`, which is cached for a year).
 * The pictures are drawn from the brand prototype (`brand/prototypes/brand`),
 * the same cut-paper world as the films.
 */
import coverLand640 from '../art/cover-land-640.webp';
import coverLand1280 from '../art/cover-land-1280.webp';
import coverMilk640 from '../art/cover-milk-640.webp';
import coverMilk1280 from '../art/cover-milk-1280.webp';
import coverRemedies640 from '../art/cover-remedies-640.webp';
import coverRemedies1280 from '../art/cover-remedies-1280.webp';
import coverTaught640 from '../art/cover-taught-640.webp';
import coverTaught1280 from '../art/cover-taught-1280.webp';
import fieldPhone from '../art/field-phone.svg';
import field from '../art/field.svg';
import growth640 from '../art/growth-640.webp';
import growth1280 from '../art/growth-1280.webp';
import markUrl from '../art/mark.svg';
import type { SeriesId } from '../content.ts';

/** A 16:9 picture at two widths, for `srcset`. */
export interface Picture {
  readonly small: string;
  readonly large: string;
}

export const srcset = (picture: Picture) => `${picture.small} 640w, ${picture.large} 1280w`;

export const COVERS: Record<SeriesId, Picture> = {
  milk: { small: coverMilk640, large: coverMilk1280 },
  land: { small: coverLand640, large: coverLand1280 },
  taught: { small: coverTaught640, large: coverTaught1280 },
  remedies: { small: coverRemedies640, large: coverRemedies1280 },
};

/** The three stages of Mark 4:28, each in its disc, named in the verse's words. */
export const GROWTH: Picture = { small: growth640, large: growth1280 };

/** The field, blade to full corn: the whole of it, and its middle for a phone. */
export const FIELD = { wide: field, narrow: fieldPhone } as const;

export const MARK = markUrl;
