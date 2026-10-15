// An ask's page (`/asks/<id>`, the review's): an agent's guided review for
// the owner, composed from the lab's primitives and the material it is
// about, as the agent's machine says: its head, the index of its sections,
// every section the owner's answers reach on one scrolling page, and one
// Send held in reach under them. The page is only which parts show and
// where; the provider holds the ask (`context.tsx`), the parts draw it
// (`parts.tsx`, `material.tsx`).

import { PlaceStyle } from '../place-style.tsx';
import { WIDE } from '../viewport.ts';
import * as Ask from './parts.tsx';

/**
 * An ask's look, read only through the studio's tokens: its own place's, so
 * it rides with the page (`PlaceStyle`). Its rules name the ask's own parts
 * alone: the material it shows keeps the look it has everywhere, but for
 * what an ask's column asks of it (a quiet transport, a smaller title, no
 * spend line).
 */
const ASK_CSS = `
.ak{max-width:720px;margin:0 auto}
.ak-head{display:grid;gap:var(--s-1);padding:var(--s-4) 0 var(--s-3)}
.ak-head-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--s-1) var(--s-2)}
.ak-head h1{font-size:var(--fs-5);line-height:var(--lh-5);font-weight:var(--w-3);margin:0}
.ak-head p{margin:0}
.ak-why{color:var(--text-1)}
.ak-by{color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2)}
.ak-index ol{display:flex;flex-wrap:wrap;gap:var(--s-1);margin:0 0 var(--s-3);padding:0;list-style:none}
.ak-index-go{display:inline-flex;align-items:center;gap:var(--s-1);min-height:var(--hit);padding:0 var(--s-2);
  border:var(--border);background:var(--surface-1);color:var(--text-1);font:inherit;font-size:var(--fs-2);cursor:pointer}
.ak-index-go[data-done=true]{color:var(--text-2)}
.ak-index-done{color:var(--state-approved)}
.ak-status p{margin:0}
.ak-status:has(button){display:grid;justify-items:start;gap:var(--s-2);margin-bottom:var(--s-3)}
.ak-sections{display:grid;gap:var(--s-6)}
.ak-step,.ak-outcome{display:grid;gap:var(--s-3);min-width:0;scroll-margin-top:var(--header-h)}
.ak-section-h{position:sticky;top:var(--header-h);z-index:5;margin:0;padding:var(--s-2) 0;
  background:var(--surface-1);border-bottom:var(--border);
  font-size:var(--fs-5);line-height:var(--lh-5);font-weight:var(--w-3)}
.ak-h{font-size:var(--fs-3);line-height:var(--lh-3);font-weight:var(--w-2);margin:0}
.ak-prose{margin:0;white-space:pre-line}
.ak-img{margin:0;display:grid;gap:var(--s-1)}
.ak-img img{display:block;width:100%;height:auto;background:var(--surface-0)}
.ak-img figcaption{color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2)}
.ak-field{display:grid;gap:var(--s-2);border:0;margin:0;padding:0;min-width:0;
  scroll-margin-top:calc(var(--header-h) + var(--hit) + var(--s-4))}
.ak-field legend,.ak-legend{font-weight:var(--w-2);padding:0;margin-bottom:var(--s-2)}
.ak-field[data-invalid=true] legend,.ak-field[data-invalid=true] .ak-legend{color:var(--state-findings)}
.ak-field[data-invalid=true] .ak-text{border-color:var(--state-findings)}
.ak-unanswered{margin:0;color:var(--state-findings);font-size:var(--fs-2);line-height:var(--lh-2)}
.ak-rec-why{margin:0;color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2)}
.ak-optional{color:var(--text-2);font-weight:var(--w-1)}
.ak-options{display:flex;flex-wrap:wrap;gap:var(--s-2)}
.ak-options[data-pictured=true]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
.ak-option{display:grid;justify-content:stretch;gap:var(--s-1);min-height:var(--hit);padding:var(--s-1) var(--s-2);text-align:left}
.ak-text{width:100%;box-sizing:border-box;resize:vertical;font:inherit}
.ak-mat[data-material=script]{margin-inline:calc(-1 * var(--gutter))}
.ak-mat[data-material=script] .ak-mat-name{padding-inline:var(--gutter)}
.ak-mat .lab-script-cost{display:none}
.ak-mat .rv-note h1{font-size:var(--fs-4);line-height:var(--lh-4)}
.ak-mat .rv-transport .sh-btn[data-primary]{background:var(--surface-2);border-color:var(--line-strong);color:var(--text-1)}
.ak-send{justify-content:space-between;margin-top:var(--s-4)}
.ak-send [data-role=answered]{min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.ak-send [data-act=send]{flex:none;min-width:8rem;min-height:var(--hit)}
.ak-answers{display:grid;gap:var(--s-2);margin:0}
.ak-answers dt{color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2)}
.ak-answers dd{margin:0}
.ak-outcome p{margin:0}
@media ${WIDE}{
  .ak-options[data-pictured=true]{grid-template-columns:repeat(4,minmax(0,1fr))}
  .ak-send{position:sticky;top:auto;bottom:0;border-top:var(--border);border-bottom:0}
}
`;

/** The ask `ask`: its head and index, its sections on one page and its send, or what came of it. */
export const AskPage = (props: { readonly ask: string }) => (
  <>
    <PlaceStyle css={ASK_CSS} />
    <Ask.Provider ask={props.ask}>
      <article class="ak" data-ask={props.ask}>
        <Ask.Head />
        <Ask.Index />
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
