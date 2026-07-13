import { Fragment, type ReactNode } from 'react';

export function HighlightMatch({ text, query }: { text: string; query: string }): ReactNode {
  const normalizedQuery = query.toLocaleLowerCase();
  if (normalizedQuery.length === 0) return text;

  const normalizedText = text.toLocaleLowerCase();
  const parts: ReactNode[] = [];
  let start = 0;
  let match = normalizedText.indexOf(normalizedQuery);

  while (match !== -1) {
    if (match > start) parts.push(text.slice(start, match));
    const end = match + query.length;
    parts.push(
      <mark key={match} className="bg-accent rounded px-0.5">
        {text.slice(match, end)}
      </mark>,
    );
    start = end;
    match = normalizedText.indexOf(normalizedQuery, start);
  }

  if (parts.length === 0) return text;
  if (start < text.length) parts.push(text.slice(start));
  return parts.map((part, index) => <Fragment key={index}>{part}</Fragment>);
}
