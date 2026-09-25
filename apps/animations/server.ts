// Serves the player and each film's recorded narration. The export script
// starts this in-process; `bun run dev` runs it with hot reload.

import { join, normalize } from 'node:path';
import index from './index.html';

const FILMS = join(import.meta.dir, 'src/films');

export const serve = (port: number, development: boolean) =>
  Bun.serve({
    port,
    development,
    routes: {
      '/': index,
      // Narration takes: /films/<film>/narration/<file>
      '/films/*': (req) => {
        const rel = normalize(
          decodeURIComponent(new URL(req.url).pathname.slice('/films/'.length)),
        );
        if (rel.startsWith('..') || !rel.includes('/narration/'))
          return new Response('not found', { status: 404 });
        const file = Bun.file(join(FILMS, rel));
        return file
          .exists()
          .then((ok) => (ok ? new Response(file) : new Response('not found', { status: 404 })));
      },
    },
  });

if (import.meta.main) {
  const server = serve(Number(Bun.env['PORT'] ?? 4400), true);
  console.log(`[animations] serving url=${server.url}`);
}
