# Studies becomes a hybrid Astro 6 site on a custom bun adapter

The Study Guide voice-grading step needs a server-side endpoint (audio →
transcribe → grade). studies was a fully static Astro 5 site. We upgrade studies to
Astro 6 and run it as a hybrid app (pages prerendered, `/api/grade` on-demand) under
a small in-house bun SSR adapter, rather than a separate grading service or an
off-the-shelf adapter.

## Why

- One app / one deploy / one domain (studies.cvr.im) — no CORS, no second service.
- `@astrojs/node@latest` requires Astro 6, and the repo is bun-first; rather than run
  node or pin an old adapter, we go to Astro 6 and write a minimal bun adapter
  against Astro 6's adapter API (an integration + a `Bun.serve` fetch entrypoint —
  small surface, only what we use).

## Considered and rejected

- **Separate @effect/platform-bun grading server (gent-style).** Cleanest Effect
  ergonomics and CLI-reusable, but two deploys + CORS + a second domain.
- **@nurodev/astro-bun on Astro 5.** Version-clean and bun-native, but a community
  adapter on the critical path and keeps us on Astro 5.
- **Pin older @astrojs/node on Astro 5.** First-party but runs node (not the repo's
  bun) and sits on an adapter line that won't get Astro 6 fixes.

## Consequences

- An Astro 5 → 6 migration is in scope and sequenced FIRST, gated green (build +
  typecheck on the existing bohr-vs-millers-rules site) before the feature lands.
- We own a custom adapter — small, but ours to maintain against future Astro adapter
  API changes.
- The grading endpoint is the only stateful/networked server surface; the rest of
  the site stays prerendered. Server holds no DB (Grades persist client-side).
