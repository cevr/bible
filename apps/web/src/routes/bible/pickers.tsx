import { useMemo, useState } from 'react';

import { PickerDropdown } from '@/components/shared/picker-dropdown';
import type { Book } from '@/data/bible';

const OT_GROUPS = [
  { label: 'Pentateuch', range: [1, 5] as const },
  { label: 'History', range: [6, 17] as const },
  { label: 'Poetry', range: [18, 22] as const },
  { label: 'Major Prophets', range: [23, 27] as const },
  { label: 'Minor Prophets', range: [28, 39] as const },
];

const NT_GROUPS = [
  { label: 'Gospels', range: [40, 43] as const },
  { label: 'History', range: [44, 44] as const },
  { label: 'Pauline Epistles', range: [45, 57] as const },
  { label: 'General Epistles', range: [58, 65] as const },
  { label: 'Prophecy', range: [66, 66] as const },
];

export interface BookPickerProps {
  readonly books: readonly Book[];
  readonly currentBook: Book | undefined;
  readonly onSelect: (book: Book) => void;
}

export function BookPicker({ books, currentBook, onSelect }: BookPickerProps) {
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const groups: { label: string; books: Book[] }[] = [];
    for (const g of [...OT_GROUPS, ...NT_GROUPS]) {
      const matched = books.filter((b) => b.number >= g.range[0] && b.number <= g.range[1]);
      if (matched.length > 0) groups.push({ label: g.label, books: matched });
    }
    return groups;
  }, [books]);

  return (
    <span className="relative">
      <button className="hover:text-primary transition-colors" onClick={() => setOpen((o) => !o)}>
        {currentBook?.name ?? 'Book'}
      </button>
      {open && (
        <PickerDropdown onClose={() => setOpen(false)}>
          {grouped.map((g) => (
            <div key={g.label}>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.label}
              </div>
              {g.books.map((b) => (
                <button
                  key={b.number}
                  className={`w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                    b.number === currentBook?.number
                      ? 'font-medium text-primary'
                      : 'text-foreground'
                  }`}
                  onClick={() => {
                    setOpen(false);
                    onSelect(b);
                  }}
                >
                  {b.name}
                </button>
              ))}
            </div>
          ))}
        </PickerDropdown>
      )}
    </span>
  );
}

export interface ChapterPickerProps {
  readonly book: Book | undefined;
  readonly currentChapter: number;
  readonly onSelect: (chapter: number) => void;
}

export function ChapterPicker({ book, currentChapter, onSelect }: ChapterPickerProps) {
  const [open, setOpen] = useState(false);
  const count = book?.chapters ?? 1;

  return (
    <span className="relative">
      <button className="hover:text-primary transition-colors" onClick={() => setOpen((o) => !o)}>
        {currentChapter}
      </button>
      {open && (
        <PickerDropdown onClose={() => setOpen(false)} className="left-0 w-48">
          <div className="grid grid-cols-5 gap-0.5 p-2">
            {Array.from({ length: count }, (_, i) => i + 1).map((ch) => (
              <button
                key={ch}
                className={`rounded px-2 py-1.5 text-sm text-center transition-colors hover:bg-accent ${
                  ch === currentChapter
                    ? 'font-medium text-primary bg-primary/10'
                    : 'text-foreground'
                }`}
                onClick={() => {
                  setOpen(false);
                  onSelect(ch);
                }}
              >
                {ch}
              </button>
            ))}
          </div>
        </PickerDropdown>
      )}
    </span>
  );
}
