#!/usr/bin/env bun
// The judged lint: the rules a model decides, each a `judged/<id>` entry of
// the repo's `.oxlintrc.json` (`judged/rule.ts`), run over the items its
// selector reads that the working tree adds or changes against the merge base
// of `--base` (origin/main) and HEAD. Every item the cache (the config's
// `settings.judged.cache`) does not answer, of every rule, goes to TypeSafe's
// model in one request. oxlint reports the kept answers at their lines
// (`packages/scripts/lint/judged.ts`); this prints each finding too, Markdown's among them,
// as
//
//   <file>:<line> warning judged(<rule>): <message> p=<p>
//
// and each rule ends on one `[judged]` line: what it read
// (`[judged] rule=<rule> items=<n> cached=<n> asked=<n> findings=<n>`: the
// items read, those the cache answered and those the model was asked about;
// two items of one text go in the request once), or why it skipped
// (`[judged] skipped rule=<rule> reason=<reason> items=<n>`, the items it
// could not judge). The model's reasons are no-key, timeout, rate-limit, http
// and incomplete. Any other failure (git, the lint config, a defect) is one
// `[judged] skipped rule=* reason=error` line, its `detail=` the failure's tag
// and its words on one stderr line; answers the cache cannot keep are asked
// again next run. Every one passes: the lint never blocks a push on its model
// or its host. A finding passes too, unless its rule's severity is `error` or
// the run is `--strict` (no rule is at `error` until its labelled corpus
// shows the precision a gate needs); an interrupt stops it.
//
//   bun run lint:judged                  # against origin/main
//   bun run lint:judged --base <ref>     # against another base
//
// The model is the config's `settings.judged.model`; the key
// `TYPESAFE_API_KEY`, else the macOS keychain item `typesafe-api-key`
// (account `bible-tools`). The key goes to TypeSafe's own host and no other.
// `lint:judged` runs this with `bun --no-env-file`, so no `.env` file in the
// checkout sets the key or a proxy.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Layer, Stdio } from 'effect';
import { FetchHttpClient } from 'effect/http';

import { lintJudged } from './judged/cli.js';
import { judgedModel } from './judged/model.js';

Stdio.Stdio.use(({ args }) =>
  Effect.flatMap(args, (argv) =>
    lintJudged(argv, '.', (model) => judgedModel(model).pipe(Layer.provide(FetchHttpClient.layer))),
  ),
).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
