// The browser tests' review page for a server render to hydrate: the review
// page's own entry (`review-page.ts`: the real `mountReview`), bundled with
// Solid's development build (`bundles.ts`), so a mismatch between the
// server's markup and the browser's components is said, as a warning the
// test reads.

import { mountReview } from '../review/mount.tsx';

mountReview();
