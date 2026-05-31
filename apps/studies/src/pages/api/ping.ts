import type { APIRoute } from 'astro';

/*
 * Smoke route proving the in-house bun adapter renders on-demand routes while the
 * rest of the site stays prerendered. `prerender = false` opts this single route
 * out of static generation. This is the seam the grading endpoint will use.
 */
export const prerender = false;

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ ok: true, runtime: 'bun', adapter: '@bible/studies/adapter' }), {
    headers: { 'Content-Type': 'application/json' },
  });
