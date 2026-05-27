import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useBible } from '@/providers/bible-context';
import { toBookSlug } from '@/data/bible';
import { useOverlay } from '@/providers/overlay-context';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export function GotoDialog() {
  const { overlay, closeOverlay } = useOverlay();
  const navigate = useNavigate();
  const bible = useBible();

  const isOpen = overlay === 'goto-dialog';

  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ref = bible.parseReference(query);
    if (!ref) {
      setError('Invalid reference. Try "John 3:16" or "Genesis 1"');
      return;
    }
    const book = bible.getBook(ref.book);
    if (!book) {
      setError('Book not found');
      return;
    }
    const path = ref.verse
      ? `/bible/${toBookSlug(book.name)}/${ref.chapter}/${ref.verse}`
      : `/bible/${toBookSlug(book.name)}/${ref.chapter}`;
    navigate(path);
    closeOverlay();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeOverlay()}>
      <DialogContent
        className="top-1/4 translate-y-0 p-0 gap-0 w-full max-w-md rounded-xl bg-background border border-border overflow-hidden"
        showCloseButton={false}
        initialFocus={false}
      >
        <form onSubmit={handleSubmit}>
          <div className="px-4 pt-4 pb-2">
            <span className="text-sm font-medium text-muted-foreground">Go to reference</span>
          </div>
          <div className="px-4 pb-3">
            <input
              id="goto-input"
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setError(null);
              }}
              autoFocus
              placeholder="John 3:16, Genesis 1, Ps 23…"
              className="w-full bg-transparent text-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
            />
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </div>
          <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground flex items-center gap-4">
            <span>
              <kbd className="rounded bg-border px-1">↵</kbd> go
            </span>
            <span>
              <kbd className="rounded bg-border px-1">esc</kbd> close
            </span>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
