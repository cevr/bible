import { Suspense, useState, useTransition } from 'react';
import { useNavigate } from 'react-router';
import { Trash2Icon } from 'lucide-react';

import { ScrollArea } from '@/components/ui/scroll-area';
import type { MarginNote } from '@/data/concordance/types';
import { useApp } from '@/providers/db-context';

const formatRelativeTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

export function NotesTab({
  book,
  chapter,
  verse,
}: {
  book: number;
  chapter: number;
  verse: number;
}) {
  const app = useApp();
  const notes = app.annotations.verseNotes(book, chapter, verse);
  const marginNotes = app.concordance.marginNotes(book, chapter, verse);
  const [draft, setDraft] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleAdd = () => {
    const content = draft.trim();
    if (!content) return;
    startTransition(async () => {
      await app.annotations.addVerseNote(book, chapter, verse, content);
      app.annotations.verseNotes.invalidate(book, chapter, verse);
    });
    setDraft('');
  };

  const handleRemove = (id: string) => {
    startTransition(async () => {
      await app.annotations.removeVerseNote(id);
      app.annotations.verseNotes.invalidate(book, chapter, verse);
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2 border-b border-border shrink-0">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleAdd();
          }}
          className="flex flex-col gap-2"
        >
          <textarea
            placeholder="Add a note…"
            className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-transparent text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary resize-none"
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                handleAdd();
              }
            }}
          />
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-muted-foreground">⌘↵ to save</span>
            <button
              type="submit"
              className="px-3 py-1 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              disabled={!draft.trim() || isPending}
            >
              {isPending ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-2 px-4 py-3">
          {notes.length > 0 ? (
            notes.map((note) => (
              <div
                key={note.id}
                className="flex flex-col gap-1 p-2 rounded-lg hover:bg-accent/50 transition-colors group"
              >
                <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    {formatRelativeTime(note.createdAt)}
                  </span>
                  <button
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-red-500 transition-[opacity,color]"
                    onClick={() => handleRemove(note.id)}
                    aria-label="Delete note"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No notes yet. Add one above.
            </p>
          )}
        </div>

        {marginNotes.length > 0 && (
          <div className="px-4 pb-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Margin Notes
            </p>
            <div className="flex flex-col gap-1.5">
              {marginNotes.map((note) => (
                <MarginNoteItem key={note.noteIndex} note={note} />
              ))}
            </div>
          </div>
        )}

        <Suspense fallback={null}>
          <VerseTopicsSection book={book} chapter={chapter} verse={verse} />
        </Suspense>
      </ScrollArea>

      <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground shrink-0">
        {notes.length > 0 && (
          <span>
            {notes.length} note{notes.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}

function VerseTopicsSection({
  book,
  chapter,
  verse,
}: {
  book: number;
  chapter: number;
  verse: number;
}) {
  const app = useApp();
  const navigate = useNavigate();

  let topics: { id: number; name: string; parentId: number | null; description: string | null }[];
  try {
    topics = app.topics.verseTopics(book, chapter, verse);
  } catch {
    return null;
  }

  if (topics.length === 0) return null;

  return (
    <div className="px-4 pb-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
        Topics
      </p>
      <div className="flex flex-wrap gap-1">
        {topics.map((topic) => (
          <button
            key={topic.id}
            className="px-2 py-0.5 text-xs rounded-full bg-accent text-foreground hover:bg-accent/80 transition-colors"
            onClick={() => navigate(`/topics?topic=${topic.id}`)}
          >
            {topic.name}
          </button>
        ))}
      </div>
    </div>
  );
}

const NOTE_TYPE_LABELS: Record<string, string | undefined> = {
  hebrew: 'Heb. ',
  greek: 'Gr. ',
  alternate: 'Or, ',
};

function MarginNoteItem({ note }: { note: MarginNote }) {
  const typeLabel = NOTE_TYPE_LABELS[note.noteType];
  return (
    <div className="p-2 rounded-lg bg-accent/30 text-sm">
      <p>
        {typeLabel && <span className="text-muted-foreground">{typeLabel}</span>}
        <strong className="text-foreground">{note.phrase}</strong>
      </p>
      <p className="text-foreground/80">{note.noteText}</p>
    </div>
  );
}
