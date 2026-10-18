# @bible/hymnal-app

The hymnal app (One). This section covers where its hymn recordings live and
how they got there.

## Recordings: R2 at hymns.cvr.im

The 1985 SDA Hymnal's recordings are in the Cloudflare R2 bucket `cvr-hymns`,
served publicly at `https://hymns.cvr.im`. The app builds each URL from
`src/remote.ts` (`audioUrl(n)` is `https://hymns.cvr.im/audio/sdah/<n>.mp3`).
That module imports nothing, so the app, Vite and the infra all read it.

Key layout:

- `audio/sdah/<n>.mp3`: hymn `n` of the 1985 hymnal, with the number unpadded.
- `data/`: reserved for the compiled hymn data.

### The stack

`alchemy.run.ts` declares one resource, the bucket (`infra/bucket.ts`):

- The custom domain is `hymns.cvr.im`. The `r2.dev` host stays off, because it
  is rate-limited and meant only for development.
- CORS allows `GET` and `HEAD` from any origin, with `range` allowed for seeking.
  It exposes `content-length`, `content-range`, `etag` and `accept-ranges`.
- The bucket is adopted when it exists and retained on destroy, and
  `forceDestroy` is off. A deploy therefore never deletes the recordings.
- Only the stage `prod` exists. The stack refuses any other stage, because a
  second stage would take the same bucket and domain.

State lives in the Cloudflare state store. No CI workflow deploys this stack.

### The copy job

`bun run audio:copy` copies the recordings from the old S3 bucket
(`https://cvr-hymns.s3.amazonaws.com/<n>.mp3`, which the old Expo app still
plays) into R2. The code is in `infra/audio/`.

- It reads hymns 1 to 695 with S3 HEAD requests, because S3 refuses to list.
  On a single key, 403 means absent. Any other status except 200 is retried
  and then fails the key. It never counts as absent.
- S3 has no `388.mp3`. A key absent from S3 is filled from the owner's
  `cevr/sda-hymns` repo, pinned at commit `4645e76c`. The job uses a fill only
  after its size and git blob SHA-1 match the tree. Each fill prints its own
  `fill <n> github <bytes>` line. More than 10 fills prints a warning, because
  S3 may be refusing reads.
- It checks each upload: S3's bytes must match their ETag's MD5 (for a
  multipart ETag, their size), and R2's reply must carry that MD5 and size.
  At the end, the job lists R2 again and checks all 695 keys.
- It is idempotent and resumable. A key that R2 already holds with the same
  size and MD5 is kept. A failed key does not stop the other keys. The run
  exits non-zero when any key failed or is missing, and a rerun copies only
  what is still missing.
- Both R2 calls go through distilled's Cloudflare protocol, so they fail and
  retry as distilled's own calls do: up to 8 retries with capped backoff, and
  a transient auth blip (a 403 with code 10000 or 10001) is retried. A final
  failure keeps Cloudflare's code and message. Each download and each upload
  fails after 3 minutes without an answer, retries included.
- `x-amz-meta-title` is not copied, because the REST upload has no custom
  metadata. Titles come from the hymnal's own data.

`bun run audio:copy --dry-run` reads only the public sources: the S3 HEADs,
the GitHub tree, and the fill's bytes. It does not touch R2 or the Cloudflare
profile. It prints what would move and ends with:

```
audio-copy dry-run s3=694/1574581124 github=1/2991377 missing=0 total=695/1577572501 target=unread
```

A real run ends with
`audio-copy run … target=kept K uploaded U failed F verified V/695`.

`bun run test` runs the copy job's tests against fake stores, and the adapters'
tests over a recording HTTP client. Neither uses the network.

### Deploy and copy

The orchestrator of the run that made this app runs these steps from the main
checkout after the change merges. It stops at the first result that differs
from the expected one:

1. `cd ~/Developer/personal/bible-tools/apps/hymnal && bun run plan`. Expected
   result: one create, a `Cloudflare.R2.Bucket` named `cvr-hymns` with the
   domain `hymns.cvr.im` and the CORS rule. Nothing else.
2. `cd ~/Developer/personal/bible-tools/apps/hymnal && bun run deploy`.
3. `cd ~/Developer/personal/bible-tools/apps/hymnal && bun run audio:copy`.
   Expected last line: `… uploaded 695 failed 0 verified 695/695`. Run it
   again. Expected: `kept 695 uploaded 0`.
4. `cf r2 objects list --bucket-name cvr-hymns --prefix audio/sdah/ --per-page 1000`
   (read-only). Expected: the keys `audio/sdah/1.mp3` to `audio/sdah/695.mp3`.
5. Probe (read-only, anyone can run it after step 3):
   `curl -sI https://hymns.cvr.im/audio/sdah/1.mp3` returns 200,
   `content-length: 2313865` and `content-type: audio/mpeg`.
   `curl -sI -H 'Origin: https://example.com' https://hymns.cvr.im/audio/sdah/388.mp3`
   returns `access-control-allow-origin`.

If a key fails in step 3, run `bun run audio:copy` again first: it copies only
what is still missing. If one key keeps failing, upload it by hand. Download
its source to a file (`https://cvr-hymns.s3.amazonaws.com/<n>.mp3`, or the
fill's raw URL for 388), then run
`cf r2 objects put audio/sdah/<n>.mp3 --bucket-name cvr-hymns --content-type audio/mpeg --file <file>`.
Type the key's slashes as they are, never as `%2F`. That upload sets no
`cache-control`. Run `bun run audio:copy` once more to check every key.

The owner's Alchemy Cloudflare profile must allow these writes:

- R2 bucket write and R2 object write.
- Zone and DNS write on `cvr.im`, for the custom domain.
- The account listing (`memberships.read`), so that Alchemy can find the
  account.

Every stack in this repo shares the profile, and Cloudflare is already
connected to it. If a step fails on scopes, the owner runs
`! bunx alchemy profile edit --reconfigure Cloudflare` and chooses All Scopes
(recommended). With Custom, he chooses at least `memberships.read`,
`zone.read`, `dns.read`, `dns.write`, `workers-r2.write` and
`workers-r2-bucket-item.write`, plus the scopes that the other stacks
(`apps/egw-search`, `apps/triedgold`, `apps/animations`) already use.
`--add Cloudflare` is only for a profile that has no Cloudflare yet: on a
connected profile, Alchemy refuses it ("already connected").

The S3 bucket stays. The old Expo app still reads it, so its deletion is the
owner's decision.
