// The fixtures a browser test file serves. The harness resolves this module to
// the fixture file the test names (`harness('menu.tsx')`), so each test file
// bundles its own fixtures only; this empty record is what the type checker sees.
import type { JSX } from '@solidjs/web';

export const fixtures: Record<string, () => JSX.Element> = {};
