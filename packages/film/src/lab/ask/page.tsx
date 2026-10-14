// An ask's page (`/asks/<id>`, the review's): an agent's decision for the
// owner, composed from the lab's primitives as the agent's machine says, on
// the step its run is on. The page is only which parts show and where; the
// provider holds the ask (`context.tsx`), the parts draw it (`parts.tsx`).

import { PlaceStyle } from '../place-style.tsx';
import { WIDE } from '../viewport.ts';
import * as Ask from './parts.tsx';

/** An ask's look, read only through the studio's tokens: its own place's, so it rides with the page (`PlaceStyle`). */
const ASK_CSS = `
.ak{max-width:960px;margin:0 auto}
.ak h1{font-size:var(--fs-5);line-height:var(--lh-5);font-weight:var(--w-3);margin:var(--s-4) 0 var(--s-1)}
.ak p{margin:0 0 var(--s-3)}
.ak-why{color:var(--text-1)}
.ak-step,.ak-outcome{display:grid;gap:var(--s-3);padding:var(--s-3);background:var(--surface-1)}
.ak-h{font-size:var(--fs-3);line-height:var(--lh-3);font-weight:var(--w-2);margin:0}
.ak-prose{white-space:pre-line}
.ak-img{margin:0;display:grid;gap:var(--s-1)}
.ak-img img{display:block;width:100%;height:auto;background:var(--surface-0)}
.ak-img figcaption{color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2)}
.ak-field{display:grid;gap:var(--s-2);border:0;margin:0;padding:0;min-width:0}
.ak-field legend,.ak-legend{font-weight:var(--w-2);padding:0;margin-bottom:var(--s-2)}
.ak-options{display:flex;flex-wrap:wrap;gap:var(--s-2)}
.ak-options[data-pictured=true]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
.ak-option{display:grid;gap:var(--s-1);min-height:var(--hit);padding:var(--s-1) var(--s-2);background:var(--surface-2);color:var(--text-1);border:2px solid transparent;font:inherit;text-align:left;cursor:pointer}
.ak-option[aria-pressed=true]{border-color:var(--accent)}
.ak-option:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ak-text{width:100%;resize:vertical;font:inherit}
.ak-send{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s-2)}
.ak-answers{display:grid;gap:var(--s-2);margin:0}
.ak-answers dt{color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2)}
.ak-answers dd{margin:0}
@media ${WIDE}{.ak-options[data-pictured=true]{grid-template-columns:repeat(4,minmax(0,1fr))}}
`;

/** The ask `ask`: its head, the step it is on and its send, or what came of it. */
export const AskPage = (props: { readonly ask: string }) => (
  <>
    <PlaceStyle css={ASK_CSS} />
    <Ask.Provider ask={props.ask}>
      <article class="ak" data-ask={props.ask}>
        <Ask.Head />
        <Ask.Status />
        <Ask.Step>
          <Ask.Submit />
        </Ask.Step>
        <Ask.Outcome />
      </article>
    </Ask.Provider>
  </>
);
