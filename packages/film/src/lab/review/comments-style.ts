// The kit's comment section's look (`Comments` and `SayBox`,
// `options/choice.tsx`), carried by every page that shows one: the review's
// pages and Scenes' sheet. What was said, an earlier version's marked, and the
// line to say more.

export const COMMENTS_CSS = `
.rv-comments { margin: var(--s-1) 0; padding-left: var(--s-4); font-size: var(--fs-2); overflow-wrap: anywhere; }
.rv-comments .rv-hint { color: var(--text-2); }
.rv-say { display: flex; flex-wrap: nowrap; gap: var(--s-2); align-items: center; }
.rv-say .rv-comment-input {
  flex: 1; min-width: 0; background: var(--surface-2); color: var(--text-1); min-height: var(--control-h);
  border: 1px solid var(--line-strong); border-radius: var(--r-1); padding: 0 var(--s-2); font: inherit;
}
.rv-say .rv-comment-input::placeholder { color: var(--text-3); }
`;
