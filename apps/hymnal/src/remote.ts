/**
 * Where the hymn recordings are served: the R2 bucket `cvr-hymns` behind its
 * custom domain (`infra/bucket.ts`). The app builds each recording's URL from
 * here, and the stack reads its domain from here, so the address is declared
 * once. It imports only `@bible/hymnal/recordings`, which imports nothing, so
 * Metro, Vite and the infra read it unchanged.
 *
 * Key layout in the bucket:
 * - `audio/<set>/sdah/<n>.mp3`: a rendered set's recording of hymn `n` of
 *   the 1985 SDA Hymnal, the number unpadded. The app plays the set
 *   `RECORDING_SET` (`warm-1`); a set is never replaced, only joined by the
 *   next (`packages/hymnal/scripts/render/`, uploaded by `infra/audio/upload.ts`).
 * - `audio/sdah/<n>.mp3`: the recordings first copied from the S3 bucket
 *   (`infra/audio/copy.ts`), kept beside the sets.
 * - `data/`: reserved for the compiled hymn data.
 */

import { RECORDING_SET, recordingKey } from '@bible/hymnal/recordings';

export const HYMNS_HOST = 'hymns.cvr.im';

export const HYMNS_ORIGIN = `https://${HYMNS_HOST}`;

/** The bucket key of the recording the app plays for a 1985 SDA Hymnal number. */
export const audioKey = (hymn: number) => `audio/${RECORDING_SET}/${recordingKey(hymn)}`;

/** The bucket key of a recording copied from the S3 bucket. */
export const sourcedKey = (hymn: number) => `audio/sdah/${hymn}.mp3`;

/** The public URL of the recording the app plays for a 1985 SDA Hymnal number. */
export const audioUrl = (hymn: number) => `${HYMNS_ORIGIN}/${audioKey(hymn)}`;
