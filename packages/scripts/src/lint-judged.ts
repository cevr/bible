#!/usr/bin/env bun
// The judged lint: rules a model decides (`judged/rule.ts`), run over the
// comment blocks the working tree adds or changes against the merge base of
// `--base` (origin/main) and HEAD. Every item the cache
// (`tmp/judged/cache.json`) does not answer goes to TypeSafe's model in one
// request. A finding prints as
//
//   <file>:<line> warning judged(<rule>): <message> p=<p>
//
// and each rule ends on one `[judged]` line: what it read
// (`[judged] rule=<rule> items=<n> cached=<n> asked=<n> findings=<n>`: the
// comment blocks read, those the cache answered and those the model was
// asked about; two blocks of one text go in the request once), or why it
// skipped (`[judged] skipped rule=<rule> reason=<reason> items=<n>`, the
// items it could not judge). The model's reasons are no-key, timeout,
// rate-limit, http and incomplete. Any other failure (git, the lint config,
// a defect) is `reason=error`, its `detail=` the failure's tag and its words
// on one stderr line; answers the cache cannot keep are asked again next run.
// Every one passes: the lint never blocks a push on its model or its host.
// A finding passes too, unless `--strict` (off: no rule gates until its
// labelled corpus shows the precision a gate needs); an interrupt stops it.
//
//   bun run lint:judged                  # against origin/main
//   bun run lint:judged --base <ref>     # against another base
//
// The model is `JUDGED_MODEL` (jev-latest); the key `TYPESAFE_API_KEY`, else
// the macOS keychain item `typesafe-api-key` (account `bible-tools`). The
// key goes to TypeSafe's own host and no other. `lint:judged` runs this with
// `bun --no-env-file`, so no `.env` file in the checkout sets the key, the
// model or a proxy.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Layer, Stdio } from 'effect';
import { FetchHttpClient } from 'effect/http';

import { lintJudged } from './judged/cli.js';
import { judgedModel } from './judged/model.js';

Stdio.Stdio.use(({ args }) =>
  Effect.flatMap(args, (argv) =>
    lintJudged(argv, '.', judgedModel.pipe(Layer.provide(FetchHttpClient.layer))),
  ),
).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
