# Grade Voice Reflections with @effect/ai v4 (not @bible/core's AiService)

The pioneer-book Study Guides grade a Voice Reflection with an LLM. We build the
Grader on Effect v4 + `@effect/ai-anthropic` (the stack used in the sibling `gent`
repo) rather than reusing `@bible/core`'s existing `AiService`, which wraps the
Vercel `ai` SDK on Effect v3.

## Why

- `gent` is the reference the work was modeled on; its v4 `LanguageModel` +
  Schema-constrained structured output is the idiom we want for the Grade shape.
- The Grader lives in `apps/studies`, not `@bible/core`, so it need not inherit
  core's v3 conventions; coupling it to core's `AiService` would drag the whole
  package's AI surface into the studies server.

## Considered and rejected

- **Reuse `@bible/core` AiService (Vercel `ai` SDK, Effect v3).** Same-repo, but it
  introduces a v3/v4 split inside one app and a heavier dependency than the grader
  needs.

## Consequences

- bible-tools now hosts two AI conventions (core's v3 `ai`-SDK `AiService`; studies'
  v4 `@effect/ai`). Acceptable because they live in separate packages and serve
  different surfaces. Revisit if a third surface needs grading.
- The grader does NOT adopt gent's driver-registry/model-resolver machinery — it is
  a self-contained `Grader` service over a single Anthropic `LanguageModel` layer.
