/**
 * The films' private store: one Cloudflare R2 bucket, and the one key that
 * reaches it.
 *
 * The bucket holds everything the public repo may not: the sound library's
 * generated files (`files/…`), the films' composed scores (`scores/<film>/…`)
 * and review renders (`renders/…`). ElevenLabs' terms forbid publishing
 * generated audio as files, so it is **never public**: `publicAccess: false`
 * (no r2.dev URL) and no custom domain. One bucket rather than one per kind:
 * all three share an owner, a key and a lifetime, and the prefixes keep them
 * apart (`packages/film/src/tools/media-store.ts`).
 *
 * The key is an account API token allowed to read and write objects in this
 * bucket only (`Workers R2 Storage Bucket Item Read/Write` on the bucket's
 * resource). R2's S3 API takes a token as a key pair: the token's id is the
 * access key id and the sha256 of its value the secret
 * (developers.cloudflare.com/r2/api/tokens). `infra/keys.ts` derives the pair
 * from the stack's outputs into the app's git-ignored `.env`.
 *
 * On `prod` the bucket is retained: losing it loses audio that cannot be made
 * again, so `alchemy destroy` only forgets it, and R2 itself refuses to
 * delete a bucket that still holds objects. A throwaway stage's bucket is
 * emptied and deleted with the stage.
 */
import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';

/** The prod bucket's name, as `sounds/library.ts` names it in `store`. */
const PROD_BUCKET = 'film-store';

/** A bucket name for `stage`: the prod one, else one per stage (R2 takes `a-z 0-9 -`). */
const bucketName = (stage: string): string => {
  if (stage === 'prod') return PROD_BUCKET;
  return `${PROD_BUCKET}-${stage.toLowerCase().replaceAll(/[^a-z0-9-]/g, '-')}`.slice(0, 63);
};

/** The API token policy resource for one bucket (`<account>_<jurisdiction>_<bucket>`). */
const bucketResource = (accountId: string, bucket: string) =>
  `com.cloudflare.edge.r2.bucket.${accountId}_default_${bucket}`;

/** The bucket and its key, for `stage`. */
export const FilmStore = Effect.gen(function* () {
  const { stage } = yield* Alchemy.Stack;
  const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;
  const prod = stage === 'prod';
  const name = bucketName(stage);

  const bucket = yield* Cloudflare.R2.Bucket('FilmStore', {
    name,
    publicAccess: false,
    domains: [],
    // A throwaway stage's objects are test data; prod's never go with it.
    forceDestroy: !prod,
  }).pipe(Alchemy.RemovalPolicy.retain(prod));

  const key = yield* Cloudflare.ApiToken.AccountApiToken('FilmStoreKey', {
    name: `${name} objects`,
    policies: [
      {
        effect: 'allow',
        permissionGroups: [
          'Workers R2 Storage Bucket Item Read',
          'Workers R2 Storage Bucket Item Write',
        ],
        resources: { [bucketResource(accountId, name)]: '*' },
      },
    ],
  });

  return { bucket, key, accountId };
});
