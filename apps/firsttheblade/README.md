# First the Blade

The website for the First the Blade YouTube channel
([@firsttheblade](https://www.youtube.com/@firsttheblade)). Seven static pages:
home, about, one page per series, and the not-found page.

## How it is built

- **Pages** are Solid 2 components (`src/views.tsx`, `src/ui/`) drawn to whole
  HTML files at build time (`src/prerender.tsx`). Nothing hydrates.
- **The phone menu** is the one part that runs in the browser
  (`src/client.tsx`, `src/ui/phone-menu.tsx`): @bible/ui's Dialog, mounted in
  place of a link to the footer's links, so the menu works without script too.
  Its open state is a local signal; no state is shared or kept in the address,
  so @bible/atom-solid and @bible/url-state are not used.
- **The Worker** (`src/worker/Site.ts`) serves `dist/` from Cloudflare's static
  assets. Every request passes through `src/worker/respond.ts` first:
  GET and HEAD only, the not-found page as a 404, cache headers by kind of file,
  and the security headers (a strict content policy with no inline script or
  style).
- **Pages and words** are data: `src/pages.ts` (paths, titles, link cards),
  `src/content.ts` (the verse, the four series). A series lists its films once
  they are added to its `episodes`.

## Commands

```bash
bun run build      # vite build (browser) + vite build --ssr (pages) + prerender → dist/
bun run preview    # dist/ through the Worker's policy on http://localhost:8470 (PORT to change)
bun run test       # the Worker's policy, the pages' data, the sitemap
bun run typecheck
bun run plan       # build, then show what `prod` would change
bun run deploy     # build, then deploy `prod`
```

Alchemy asks before it changes anything. In a shell that can't prompt (Claude Code's `!`, CI), pass the approval through: `bun run deploy --yes`.

A throwaway copy goes to its own stage and never touches the domain:

```bash
bun run build && bunx alchemy deploy alchemy.run.ts --stage agent-<name> --yes
bunx alchemy destroy alchemy.run.ts --stage agent-<name> --yes
```

Deploying needs the Alchemy Cloudflare profile
(`bunx alchemy profile edit --profile default --reconfigure Cloudflare`, interactive).

## The domain

The site is served from its `workers.dev` URL until firsttheblade.com is
registered in this Cloudflare account. The switch is one line in `src/site.ts`:

```ts
export const SERVED_FROM: ServedFrom = 'custom-domain';
```

Then `bun run deploy`. The Worker takes `firsttheblade.com`, `www.firsttheblade.com`
redirects to it, the `workers.dev` URL is switched off, and the canonical URL,
the link cards, the sitemap and robots.txt all follow, since they read the
same value.

`WORKERS_DEV_SUBDOMAIN` in the same file is the account's `workers.dev`
subdomain; the canonical URL on the `workers.dev` host is built from it.

## The art and the fonts

The mark, the field, the torn strips, the series pictures and the link cards
(`src/art/`, `public/`) are drawn from the brand prototype
(`brand/prototypes/brand/src`, the boards the owner approved), the same
cut-paper world as the films.

Fraunces and Inter (`src/fonts/`) are under the SIL Open Font License 1.1,
subset to Latin and Latin Extended and served from this site.
