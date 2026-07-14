import { useMemo, useState, useTransition } from 'react';
import { useNavigate } from 'react-router';
import { ExternalLinkIcon, ChevronDownIcon } from 'lucide-react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { EGW_CATEGORIES } from '@/components/shared/egw-categories';
import type { EGWCommentaryEntry, EGWContextParagraph } from '@/data/commentary/types';
import { useApp } from '@/providers/db-context';

const BC_CODES = EGW_CATEGORIES[1]?.codes ?? new Set<string>(); // Bible Commentary codes

function EgwEntryCard({
  entry,
  onNavigate,
}: {
  entry: EGWCommentaryEntry;
  onNavigate: (bookCode: string, puborder: number) => void;
}) {
  const app = useApp();
  const [contextOpen, setContextOpen] = useState(false);
  const [context, setContext] = useState<EGWContextParagraph[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleToggleContext = () => {
    if (contextOpen) {
      setContextOpen(false);
      return;
    }
    if (context) {
      setContextOpen(true);
      return;
    }
    startTransition(async () => {
      const paragraphs = await app.commentary.getEgwParagraphContext(
        entry.bookCode,
        entry.puborder,
        2,
      );
      setContext(paragraphs);
      setContextOpen(true);
    });
  };

  return (
    <div className="flex flex-col gap-1 p-2 rounded-lg hover:bg-accent/30 transition-colors group">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono text-muted-foreground">{entry.refcode}</span>
        <button
          className="shrink-0 p-1 -m-1 text-muted-foreground hover:text-primary transition-colors max-md:opacity-100 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => onNavigate(entry.bookCode, entry.puborder)}
          aria-label="Open in EGW reader"
          title="Open in EGW reader"
        >
          <ExternalLinkIcon className="size-3.5" />
        </button>
      </div>

      {contextOpen && context ? (
        <div className="flex flex-col gap-1.5">
          {context.map((p) => (
            <p
              key={p.puborder}
              className="text-sm leading-relaxed text-muted-foreground data-[matched]:text-foreground data-[matched]:bg-primary/10 data-[matched]:rounded data-[matched]:px-1 data-[matched]:-mx-1"
              data-matched={p.puborder === entry.puborder ? '' : undefined}
            >
              {p.content}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-sm text-foreground leading-relaxed">{entry.content}</p>
      )}

      <button
        className="self-start py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
        onClick={handleToggleContext}
        disabled={isPending}
      >
        <ChevronDownIcon
          className={`size-3 transition-transform ${contextOpen ? 'rotate-180' : ''}`}
        />
        {isPending ? 'Loading\u2026' : contextOpen ? 'Hide context' : 'Show context'}
      </button>
    </div>
  );
}

function EgwEntryGroup({
  label,
  entries,
  onNavigate,
}: {
  label: string;
  entries: EGWCommentaryEntry[];
  onNavigate: (bookCode: string, puborder: number) => void;
}) {
  // Group by bookCode within this group
  const grouped = useMemo(() => {
    const map = new Map<string, EGWCommentaryEntry[]>();
    for (const entry of entries) {
      let arr = map.get(entry.bookCode);
      if (!arr) {
        arr = [];
        map.set(entry.bookCode, arr);
      }
      arr.push(entry);
    }
    return [...map];
  }, [entries]);

  return (
    <div className="flex flex-col gap-3">
      {label && (
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </h3>
      )}
      {grouped.map(([bookCode, groupEntries]) => (
        <div key={bookCode} className="flex flex-col gap-1.5">
          <h4 className="text-xs font-mono font-semibold text-primary uppercase tracking-wider">
            {bookCode}
          </h4>
          {groupEntries.map((entry) => (
            <EgwEntryCard
              key={`${entry.bookCode}-${entry.puborder}`}
              entry={entry}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EgwTab({ book, chapter, verse }: { book: number; chapter: number; verse: number }) {
  const app = useApp();
  const navigate = useNavigate();
  const entries = app.commentary.egwCommentary(book, chapter, verse);

  const { bcEntries, otherEntries } = useMemo(() => {
    const bcIndexed: EGWCommentaryEntry[] = [];
    const bcSearch: EGWCommentaryEntry[] = [];
    const otherIndexed: EGWCommentaryEntry[] = [];
    const otherSearch: EGWCommentaryEntry[] = [];
    for (const e of entries) {
      const isBC = BC_CODES.has(e.bookCode);
      if (e.source === 'indexed') {
        (isBC ? bcIndexed : otherIndexed).push(e);
      } else {
        (isBC ? bcSearch : otherSearch).push(e);
      }
    }
    return {
      bcEntries: [...bcIndexed, ...bcSearch],
      otherEntries: [...otherIndexed, ...otherSearch],
    };
  }, [entries]);

  const handleNavigate = async (bookCode: string, puborder: number) => {
    const chapterIndex = await app.commentary.getEgwChapterIndex(bookCode, puborder);
    navigate(`/egw/${bookCode}/${chapterIndex}/${puborder}`);
  };

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full px-4">
        <p className="text-sm text-muted-foreground text-center">
          No EGW commentary found for this verse.
        </p>
      </div>
    );
  }

  const totalBC = bcEntries.length;
  const totalOther = otherEntries.length;

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-4 px-4 py-3">
          {bcEntries.length > 0 && (
            <EgwEntryGroup
              label="Bible Commentary"
              entries={bcEntries}
              onNavigate={handleNavigate}
            />
          )}

          {bcEntries.length > 0 && otherEntries.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex-1 border-t border-border" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground shrink-0">
                Other Writings
              </span>
              <div className="flex-1 border-t border-border" />
            </div>
          )}

          {otherEntries.length > 0 && (
            <EgwEntryGroup
              label={bcEntries.length > 0 ? '' : 'EGW Writings'}
              entries={otherEntries}
              onNavigate={handleNavigate}
            />
          )}
        </div>
      </ScrollArea>

      <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground shrink-0">
        {totalBC > 0 && (
          <span>
            {totalBC} BC {totalBC === 1 ? 'entry' : 'entries'}
          </span>
        )}
        {totalBC > 0 && totalOther > 0 && <span> · </span>}
        {totalOther > 0 && (
          <span>
            {totalOther} other {totalOther === 1 ? 'entry' : 'entries'}
          </span>
        )}
      </div>
    </div>
  );
}
