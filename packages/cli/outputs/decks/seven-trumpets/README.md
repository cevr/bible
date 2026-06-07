# The Seven Trumpets — Slidev Deck

A native [Slidev](https://sli.dev) presentation of the study _The Seven Trumpets, the Eastern Question, and the Day of Slaughter_. Every Scripture and pioneer quote on a slide is verbatim from the CLI-verified study in `packages/cli/outputs/studies/`.

## How to run

From the repo root, start the live presentation with `bunx @slidev/cli packages/cli/outputs/decks/seven-trumpets/slides.md` (then open the printed `http://localhost:3030` URL; press `o` for overview, arrow keys to navigate, and the speaker-note panel shows the per-slide `[IMG]` / `[DYK]` / `[SN]` cues). To export a PDF, run `bunx @slidev/cli export packages/cli/outputs/decks/seven-trumpets/slides.md` (add `--with-clicks` to expand every `v-click` step; this requires Playwright Chromium, which Slidev will offer to install).
