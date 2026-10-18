/**
 * Where the hymn recordings are served: the R2 bucket `cvr-hymns` behind its
 * custom domain (`infra/bucket.ts`). The app builds each recording's URL from
 * here, and the stack reads its domain from here, so the address is declared
 * once. It imports nothing, so Metro, Vite and the infra read it unchanged.
 *
 * Key layout in the bucket:
 * - `audio/sdah/<n>.mp3`: the 1985 SDA Hymnal's recording of hymn `n`, the
 *   number unpadded (as the S3 bucket named them).
 * - `data/`: reserved for the compiled hymn data.
 */

export const HYMNS_HOST = 'hymns.cvr.im';

export const HYMNS_ORIGIN = `https://${HYMNS_HOST}`;

/** The bucket key of a 1985 SDA Hymnal recording. */
export const audioKey = (hymn: number) => `audio/sdah/${hymn}.mp3`;

/** The public URL of a 1985 SDA Hymnal recording. */
export const audioUrl = (hymn: number) => `${HYMNS_ORIGIN}/${audioKey(hymn)}`;
