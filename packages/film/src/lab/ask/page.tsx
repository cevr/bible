// An ask's page (`/asks/<id>`, the review's): an agent's guided review for
// the owner, composed from the lab's primitives and the material it is
// about, as the agent's machine says: every section the owner's answers
// reach on one scrolling page, one Send under them. The page is only which
// parts show and where; the provider holds the ask (`context.tsx`), the
// parts draw it (`parts.tsx`, `material.tsx`).

import { PlaceStyle } from '../place-style.tsx';
import { WIDE } from '../viewport.ts';
import * as Ask from './parts.tsx';

/** An ask's look, read only through the studio's tokens: its own place's, so it rides with the page (`PlaceStyle`). */
const ASK_CSS = `
.ak{max-width:960px;margin:0 auto}
.ak h1{font-size:var(--fs-5);line-height:var(--lh-5);font-weight:var(--w-3);margin:var(--s-4) 0 var(--s-1)}
.ak p{margin:0 0 var(--s-3)}
.ak-why{color:var(--text-1)}
.ak-sections{display:grid;gap:var(--s-3)}
.ak-step,.ak-outcome{display:grid;gap:var(--s-3);padding:var(--s-3);background:var(--surface-1);min-width:0}
.ak-section-h{font-size:var(--fs-4);line-height:var(--lh-4);font-weight:var(--w-3);margin:0}
.ak-h{font-size:var(--fs-3);line-height:var(--lh-3);font-weight:var(--w-2);margin:0}
.ak-prose{white-space:pre-line}
.ak-img{margin:0;display:grid;gap:var(--s-1)}
.ak-img img{display:block;width:100%;height:auto;background:var(--surface-0)}
.ak-img figcaption{color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2)}
.ak-field{display:grid;gap:var(--s-2);border:0;margin:0;padding:0;min-width:0}
.ak-field legend,.ak-legend{font-weight:var(--w-2);padding:0;margin-bottom:var(--s-2)}
.ak-optional{color:var(--text-2);font-weight:var(--w-1)}
.ak-options{display:flex;flex-wrap:wrap;gap:var(--s-2)}
.ak-options[data-pictured=true]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
.ak-option{display:grid;justify-content:stretch;gap:var(--s-1);min-height:var(--hit);padding:var(--s-1) var(--s-2);text-align:left}
.ak-text{width:100%;resize:vertical;font:inherit}
.ak-send{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s-2);padding:var(--s-3) 0}
.ak-answers{display:grid;gap:var(--s-2);margin:0}
.ak-answers dt{color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2)}
.ak-answers dd{margin:0}
@media ${WIDE}{.ak-options[data-pictured=true]{grid-template-columns:repeat(4,minmax(0,1fr))}}
`;

/** The ask `ask`: its head, its sections on one page and its send, or what came of it. */
export const AskPage = (props: { readonly ask: string }) => (
  <>
    <PlaceStyle css={ASK_CSS} />
    <Ask.Provider ask={props.ask}>
      <article class="ak" data-ask={props.ask}>
        <Ask.Head />
        <Ask.Status />
        <div class="ak-sections">
          <Ask.Sections />
        </div>
        <Ask.Submit />
        <Ask.Outcome />
      </article>
    </Ask.Provider>
  </>
);
