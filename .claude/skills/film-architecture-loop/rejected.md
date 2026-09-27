# Rejected candidates

A sweep re-proposes one of these only with a new receipt. The full reasons are the ledger rows in `apps/animations/plans/architecture-loop-*.md`.

| Candidate                                                            | Why it stays                                                                                                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| An Effect runtime inside the per-frame draw path                     | **Cheap iteration**: the draw path runs about 10,000 times per film render; it stays synchronous plain code.                                                                         |
| Changing a committed asset's hash scheme without a migration         | Re-keying takes or the score orphans paid, non-reproducible audio. It needs a migration that re-keys the existing files.                                                             |
| Regenerating paid assets to test a refactor                          | Voice takes, the score and effects cost credits and never come back identical. A refactor proves itself with `mix` and stills.                                                       |
| Rive (or another retained editor runtime) as the film stack          | Tried 2026-09-26/27 and reverted: no narration timing, no mix, no CLI video render, and a second stack. Films are canvas scenes; the owner annotates in the lab and the agent draws. |
| A cache that carries state from one frame to the next                | **Pure frames**: it breaks scrubbing and parallel render chunks. Speed comes from less work per frame, measured on the bench.                                                        |
| Raising a complexity cap or adding a lint exemption to pass the gate | Split into named operations instead (2026-09-27); an exemption needs an owner decision.                                                                                              |
| Publishing (npm release, pushing, a deploy) inside the loop          | Owner ask each time; the loop commits to main locally.                                                                                                                               |
