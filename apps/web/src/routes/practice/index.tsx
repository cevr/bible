import { Suspense, useState, useTransition, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { Trash2, ChevronLeft, RotateCcw } from 'lucide-react';
import { useApp } from '@/providers/db-context';
import { formatBibleReference } from '@bible/core/bible-reader';
import type { MemoryVerse } from '@/data/practice/types';

export default function PracticeRoute() {
  const [searchParams] = useSearchParams();
  const verseId = searchParams.get('verse');

  return verseId ? (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <PracticeSession verseId={verseId} />
    </Suspense>
  ) : (
    <Suspense fallback={<p className="text-muted-foreground">Loading verses…</p>}>
      <VerseList />
    </Suspense>
  );
}

function VerseList() {
  const app = useApp();
  const navigate = useNavigate();
  const [, startTransition] = useTransition();

  const verses = app.memoryVerses();

  const handleRemove = (id: string, ref: string) => {
    if (!window.confirm(`Remove ${ref} from memory verses?`)) return;
    startTransition(async () => {
      await app.removeMemoryVerse(id);
      app.memoryVerses.invalidateAll();
    });
  };

  return (
    <div className="space-y-6">
      <header className="border-b border-border pb-4">
        <h1 className="font-sans text-2xl font-semibold text-foreground text-balance">
          Memory Verses
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Practice memorizing Bible verses with progressive reveal or type-to-recall.
        </p>
      </header>

      {verses.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No memory verses yet.</p>
          <p className="text-sm mt-2">
            Add verses from the study panel while{' '}
            <button className="text-primary hover:underline" onClick={() => navigate('/bible')}>
              reading the Bible
            </button>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {verses.map((mv) => {
            const ref = formatBibleReference({
              book: mv.book,
              chapter: mv.chapter,
              verse: mv.verseStart,
              verseEnd: mv.verseEnd ?? undefined,
            });
            return (
              <div
                key={mv.id}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
              >
                <button
                  className="flex-1 text-left"
                  onClick={() => navigate(`/practice?verse=${mv.id}`)}
                >
                  <span className="text-sm font-medium text-foreground">{ref}</span>
                </button>
                <button
                  className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                  onClick={() => handleRemove(mv.id, ref)}
                  aria-label="Remove memory verse"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PracticeSession({ verseId }: { verseId: string }) {
  const app = useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'choose' | 'reveal' | 'type'>('choose');

  const verses = app.memoryVerses();
  const mv = verses.find((v) => v.id === verseId);

  if (!mv) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Verse not found.</p>
        <button
          className="mt-4 text-sm text-primary hover:underline"
          onClick={() => navigate('/practice')}
        >
          Back to verses
        </button>
      </div>
    );
  }

  const ref = formatBibleReference({
    book: mv.book,
    chapter: mv.chapter,
    verse: mv.verseStart,
    verseEnd: mv.verseEnd ?? undefined,
  });

  return (
    <div className="space-y-6">
      <header className="border-b border-border pb-4">
        <button
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          onClick={() => navigate('/practice')}
        >
          <ChevronLeft className="size-4" />
          Back to verses
        </button>
        <h1 className="font-sans text-2xl font-semibold text-foreground text-balance">{ref}</h1>
      </header>

      {mode === 'choose' && (
        <div className="grid gap-3 sm:grid-cols-2 max-w-md">
          <button
            className="px-6 py-4 rounded-lg border border-border hover:bg-accent transition-colors text-left"
            onClick={() => setMode('reveal')}
          >
            <h3 className="font-semibold text-foreground">Progressive Reveal</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Words are gradually hidden. Fill in the blanks mentally.
            </p>
          </button>
          <button
            className="px-6 py-4 rounded-lg border border-border hover:bg-accent transition-colors text-left"
            onClick={() => setMode('type')}
          >
            <h3 className="font-semibold text-foreground">Type to Recall</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Type the verse from memory and compare.
            </p>
          </button>
        </div>
      )}

      {mode === 'reveal' && (
        <Suspense fallback={<p className="text-muted-foreground">Loading verse…</p>}>
          <RevealMode verse={mv} onBack={() => setMode('choose')} />
        </Suspense>
      )}

      {mode === 'type' && (
        <Suspense fallback={<p className="text-muted-foreground">Loading verse…</p>}>
          <TypeMode verse={mv} onBack={() => setMode('choose')} />
        </Suspense>
      )}
    </div>
  );
}

function useVerseText(mv: MemoryVerse): string {
  const app = useApp();
  const allVerses = app.verses(mv.book, mv.chapter);
  return allVerses
    .filter((v) => v.verse >= mv.verseStart && v.verse <= (mv.verseEnd ?? mv.verseStart))
    .map((v) => v.text)
    .join(' ');
}

function RevealMode({ verse, onBack }: { verse: MemoryVerse; onBack: () => void }) {
  const app = useApp();
  const [round, setRound] = useState(0);
  const [, startTransition] = useTransition();

  const fullText = useVerseText(verse);
  const words = fullText.split(/\s+/);

  // Each round hides more words. Round 0 = full, round N = N/total fraction hidden
  const totalRounds = 5;
  const fractionHidden = round / totalRounds;
  const hiddenCount = Math.floor(words.length * fractionHidden);

  // Deterministic "random" indices to hide
  const hiddenIndices = useMemo(() => {
    const indices: number[] = [];
    // Simple hash-based selection for reproducibility
    for (let i = 0; i < words.length; i++) {
      indices.push(i);
    }
    // Shuffle with seed based on verse id
    const seed = verse.id.charCodeAt(0) + verse.id.charCodeAt(1);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = ((seed * (i + 1) * 2654435761) >>> 0) % (i + 1);
      const a = indices[i] ?? 0;
      const b = indices[j] ?? 0;
      indices[i] = b;
      indices[j] = a;
    }
    return new Set(indices.slice(0, hiddenCount));
  }, [words.length, hiddenCount, verse.id]);

  const isDone = round >= totalRounds;

  const handleNext = () => {
    if (isDone) {
      startTransition(async () => {
        await app.recordPractice(verse.id, 'reveal', 1.0);
        app.practiceHistory.invalidate(verse.id);
      });
      onBack();
      return;
    }
    setRound((r) => r + 1);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="p-6 rounded-lg border border-border bg-accent/20">
        <p className="text-lg leading-relaxed">
          {words.map((word, i) => (
            <span key={i}>
              {hiddenIndices.has(i) ? (
                <span className="inline-block border-b-2 border-muted-foreground/50 min-w-[3ch] text-transparent select-none">
                  {word}
                </span>
              ) : (
                word
              )}
              {i < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
          onClick={onBack}
        >
          Back
        </button>
        <button
          className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded transition-colors"
          onClick={handleNext}
        >
          {isDone ? 'Done' : `Next (${round + 1}/${totalRounds})`}
        </button>
        <button
          className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setRound(0)}
          aria-label="Reset practice"
        >
          <RotateCcw className="size-4" />
        </button>
      </div>
    </div>
  );
}

function TypeMode({ verse, onBack }: { verse: MemoryVerse; onBack: () => void }) {
  const app = useApp();
  const [input, setInput] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const fullText = useVerseText(verse);

  const handleSubmit = () => {
    const computed = computeScore(input, fullText);
    setScore(computed);
    startTransition(async () => {
      await app.recordPractice(verse.id, 'type', computed);
      app.practiceHistory.invalidate(verse.id);
    });
  };

  const ref = formatBibleReference({
    book: verse.book,
    chapter: verse.chapter,
    verse: verse.verseStart,
    verseEnd: verse.verseEnd ?? undefined,
  });

  if (score != null) {
    const pct = Math.round(score * 100);
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="text-center">
          <p className="text-4xl font-bold text-foreground">{pct}%</p>
          <p className="text-sm text-muted-foreground mt-1">accuracy</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Your answer
            </label>
            <p className="mt-1 text-sm text-foreground bg-accent/30 p-3 rounded-lg">{input}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Actual text
            </label>
            <p className="mt-1 text-sm text-foreground bg-accent/30 p-3 rounded-lg">{fullText}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
            onClick={onBack}
          >
            Back
          </button>
          <button
            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded transition-colors"
            onClick={() => {
              setInput('');
              setScore(null);
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="text-center p-6 rounded-lg border border-border bg-accent/20">
        <p className="text-lg font-semibold text-foreground">{ref}</p>
        <p className="text-sm text-muted-foreground mt-1">Type the verse from memory</p>
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type the verse here…"
        className="w-full min-h-32 rounded-lg border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 resize-none"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.metaKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />

      <div className="flex items-center gap-3">
        <button
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
          onClick={onBack}
        >
          Back
        </button>
        <button
          className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded transition-colors disabled:opacity-50"
          onClick={handleSubmit}
          disabled={!input.trim()}
        >
          Check
        </button>
      </div>
    </div>
  );
}

/** Compute word-level accuracy score (0-1). Ignores punctuation and case. */
function computeScore(input: string, expected: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);

  const inputWords = normalize(input);
  const expectedWords = normalize(expected);

  if (expectedWords.length === 0) return input.trim() === '' ? 1 : 0;

  let matches = 0;
  for (let i = 0; i < expectedWords.length; i++) {
    if (inputWords[i] === expectedWords[i]) matches++;
  }

  return matches / expectedWords.length;
}
