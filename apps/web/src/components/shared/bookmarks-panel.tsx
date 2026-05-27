import { useState, useEffect, Suspense } from 'react';
import { useNavigate } from 'react-router';
import { useBible } from '@/providers/bible-context';
import { toBookSlug } from '@/data/bible';
import { useOverlay, useOverlayData } from '@/providers/overlay-context';
import { useBookmarks, type Bookmark } from '@/providers/state-provider';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

function BookmarksPanelInner() {
  const { overlay, closeOverlay } = useOverlay();
  const currentRef = useOverlayData('bookmarks');
  const navigate = useNavigate();
  const bible = useBible();
  const { bookmarks, add, remove } = useBookmarks();

  const isOpen = overlay === 'bookmarks';
  const [noteInput, setNoteInput] = useState('');

  useEffect(() => {
    if (!isOpen) setNoteInput('');
  }, [isOpen]);

  const formatRef = (ref: { book: number; chapter: number; verse?: number }) => {
    const b = bible.getBook(ref.book);
    if (!b) return `${ref.book}:${ref.chapter}:${ref.verse ?? ''}`;
    return ref.verse ? `${b.name} ${ref.chapter}:${ref.verse}` : `${b.name} ${ref.chapter}`;
  };

  const navigateToBookmark = (ref: { book: number; chapter: number; verse?: number }) => {
    const b = bible.getBook(ref.book);
    if (b) {
      const versePart = ref.verse ? `/${ref.verse}` : '';
      navigate(`/bible/${toBookSlug(b.name)}/${ref.chapter}${versePart}`);
      closeOverlay();
    }
  };

  const handleAdd = async () => {
    if (!currentRef) return;
    await add(currentRef, noteInput || undefined);
    setNoteInput('');
  };

  const formatDate = (ts: number) =>
    new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(
      new Date(ts),
    );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeOverlay();
          setNoteInput('');
        }
      }}
    >
      <DialogContent
        className="top-1/4 translate-y-0 p-0 gap-0 w-full max-w-lg rounded-xl bg-background border border-border overflow-hidden max-h-[70vh] flex flex-col"
        showCloseButton={false}
      >
        <div className="px-4 pt-4 pb-2 border-b border-border shrink-0">
          <h2 className="font-sans text-lg font-semibold text-foreground">Bookmarks</h2>
        </div>

        {/* Quick-add */}
        {currentRef && (
          <div className="px-4 py-3 bg-accent/50 shrink-0">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void handleAdd();
              }}
            >
              <span className="text-sm text-foreground shrink-0 py-1.5">
                {formatRef(currentRef)}
              </span>
              <input
                type="text"
                placeholder="Note (optional)"
                className="flex-1 px-2 py-1.5 text-sm rounded-lg border border-border bg-transparent text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Add
              </button>
            </form>
          </div>
        )}

        {/* List */}
        <ScrollArea className="min-h-0 flex-1 p-2">
          {bookmarks.length > 0 ? (
            <div className="space-y-1">
              {bookmarks.map((bm: Bookmark) => (
                <div
                  key={bm.id}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent transition-colors group"
                >
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() => navigateToBookmark(bm.reference)}
                  >
                    <span className="text-sm font-medium text-foreground">
                      {formatRef(bm.reference)}
                    </span>
                    {bm.note && <p className="text-xs text-muted-foreground mt-0.5">{bm.note}</p>}
                    <time
                      className="text-[10px] text-muted-foreground"
                      dateTime={new Date(bm.createdAt).toISOString()}
                    >
                      {formatDate(bm.createdAt)}
                    </time>
                  </button>
                  <button
                    className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-red-500 hover:text-red-700 dark:hover:text-red-300 transition-opacity text-xs px-1"
                    onClick={() => void remove(bm.id)}
                    aria-label="Remove bookmark"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No bookmarks yet.</p>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border px-4 py-3 flex justify-end shrink-0">
          <button
            className="px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent rounded transition-colors"
            onClick={closeOverlay}
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BookmarksPanel() {
  const { overlay } = useOverlay();
  if (overlay !== 'bookmarks') return null;
  return (
    <Suspense fallback={null}>
      <BookmarksPanelInner />
    </Suspense>
  );
}
