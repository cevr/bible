import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { ChevronLeft, Search } from 'lucide-react';
import { useApp, useRawApp } from '@/providers/db-context';
import { useBible } from '@/providers/bible-context';
import { toBookSlug } from '@/data/bible';
import type { Topic, TopicVerse } from '@/data/topics/types';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

type TopicsInitState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

export default function TopicsRoute() {
  const { db } = useRawApp();
  const [state, setState] = useState<TopicsInitState>({ status: 'loading' });

  const initTopics = useCallback(() => {
    setState({ status: 'loading' });
    db.initTopics()
      .then(() => setState({ status: 'ready' }))
      .catch((err) => setState({ status: 'error', message: err.message }));
  }, [db]);

  useEffect(() => {
    initTopics();
  }, [initTopics]);

  switch (state.status) {
    case 'error':
      return (
        <div className="text-center py-12">
          <p className="text-destructive font-medium">Failed to load topics database</p>
          <p className="text-sm text-muted-foreground mt-2">{state.message}</p>
          <button className="mt-4 text-sm text-primary hover:underline" onClick={initTopics}>
            Retry
          </button>
        </div>
      );
    case 'loading':
      return (
        <div className="text-center py-12">
          <p className="text-muted-foreground animate-pulse">Loading topics database…</p>
        </div>
      );
    case 'ready':
      return <TopicsContent />;
  }
}

function TopicsContent() {
  const [searchParams] = useSearchParams();
  const topicId = searchParams.get('topic');

  return topicId ? (
    <Suspense fallback={<p className="text-muted-foreground">Loading topic…</p>}>
      <TopicDetail topicId={Number(topicId)} />
    </Suspense>
  ) : (
    <TopicBrowser />
  );
}

function TopicBrowser() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeLetter, setActiveLetter] = useState('A');
  const navigate = useNavigate();

  const isSearching = searchQuery.trim().length >= 2;

  return (
    <div className="space-y-6">
      <header className="border-b border-border pb-4">
        <h1 className="font-sans text-2xl font-semibold text-foreground text-balance">
          Topical Index
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse Bible topics from Nave's Topical Bible.
        </p>
      </header>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search topics…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </div>

      {isSearching ? (
        <Suspense fallback={<p className="text-sm text-muted-foreground">Searching…</p>}>
          <SearchResults
            query={searchQuery.trim()}
            onSelect={(id) => navigate(`/topics?topic=${id}`)}
          />
        </Suspense>
      ) : (
        <>
          {/* Letter navigation */}
          <div className="flex flex-wrap gap-1">
            {LETTERS.map((letter) => (
              <button
                key={letter}
                className={`size-8 rounded text-sm font-medium transition-colors ${
                  activeLetter === letter
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
                onClick={() => setActiveLetter(letter)}
              >
                {letter}
              </button>
            ))}
          </div>

          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading topics…</p>}>
            <LetterTopics
              letter={activeLetter}
              onSelect={(id) => navigate(`/topics?topic=${id}`)}
            />
          </Suspense>
        </>
      )}
    </div>
  );
}

function SearchResults({ query, onSelect }: { query: string; onSelect: (id: number) => void }) {
  const app = useApp();
  const results = app.searchTopics(query);

  if (results.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No topics found for "{query}"
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {results.map((topic) => (
        <TopicListItem key={topic.id} topic={topic} onSelect={onSelect} />
      ))}
    </div>
  );
}

function LetterTopics({ letter, onSelect }: { letter: string; onSelect: (id: number) => void }) {
  const app = useApp();
  const topics = app.topicsByLetter(letter);

  if (topics.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No topics starting with "{letter}"
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {topics.map((topic) => (
        <TopicListItem key={topic.id} topic={topic} onSelect={onSelect} />
      ))}
    </div>
  );
}

function TopicListItem({ topic, onSelect }: { topic: Topic; onSelect: (id: number) => void }) {
  return (
    <button
      className="w-full text-left px-4 py-2.5 rounded-lg hover:bg-accent/50 transition-colors flex flex-col gap-0.5"
      onClick={() => onSelect(topic.id)}
    >
      <span className="text-sm font-medium text-foreground">{topic.name}</span>
      {topic.description && (
        <span className="text-xs text-muted-foreground line-clamp-1">{topic.description}</span>
      )}
    </button>
  );
}

function TopicDetail({ topicId }: { topicId: number }) {
  const app = useApp();
  const bible = useBible();
  const navigate = useNavigate();

  const topic = app.topic(topicId);
  const verses = app.topicVerses(topicId);

  if (!topic) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Topic not found.</p>
        <button
          className="mt-4 text-sm text-primary hover:underline"
          onClick={() => navigate('/topics')}
        >
          Back to topics
        </button>
      </div>
    );
  }

  // Group verses by book
  const byBook = new Map<number, TopicVerse[]>();
  for (const v of verses) {
    let arr = byBook.get(v.book);
    if (!arr) {
      arr = [];
      byBook.set(v.book, arr);
    }
    arr.push(v);
  }
  const bookGroups = Array.from(byBook.entries()).sort((a, b) => a[0] - b[0]);

  return (
    <div className="space-y-6">
      <header className="border-b border-border pb-4">
        <button
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          onClick={() => navigate('/topics')}
        >
          <ChevronLeft className="size-4" />
          Back to topics
        </button>
        <h1 className="font-sans text-2xl font-semibold text-foreground text-balance">
          {topic.name}
        </h1>
        {topic.description && (
          <p className="mt-1 text-sm text-muted-foreground">{topic.description}</p>
        )}
      </header>

      {/* Subtopics */}
      <Suspense fallback={null}>
        <SubtopicList topicId={topicId} />
      </Suspense>

      {/* Verses grouped by book */}
      {verses.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Verses ({verses.length})
          </h2>
          {bookGroups.map(([bookNum, bookVerses]) => {
            const book = bible.getBook(bookNum);
            return (
              <div key={bookNum} className="space-y-1">
                <h3 className="text-xs font-medium text-muted-foreground px-2">
                  {book?.name ?? `Book ${bookNum}`}
                </h3>
                {bookVerses.map((v, i) => {
                  const ref = v.verseEnd
                    ? `${v.chapter}:${v.verseStart}\u2013${v.verseEnd}`
                    : `${v.chapter}:${v.verseStart}`;
                  return (
                    <button
                      key={`${v.book}-${v.chapter}-${v.verseStart}-${i}`}
                      className="w-full text-left flex items-baseline gap-3 px-3 py-1.5 rounded hover:bg-accent transition-colors"
                      onClick={() => {
                        if (book) {
                          navigate(`/bible/${toBookSlug(book.name)}/${v.chapter}/${v.verseStart}`);
                        }
                      }}
                    >
                      <span className="text-sm font-medium text-foreground shrink-0">{ref}</span>
                      {v.note && (
                        <span className="text-xs text-muted-foreground truncate">{v.note}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-8">
          No verses listed for this topic.
        </p>
      )}
    </div>
  );
}

function SubtopicList({ topicId }: { topicId: number }) {
  const app = useApp();
  const navigate = useNavigate();
  const children = app.topicChildren(topicId);

  if (children.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Subtopics
      </h2>
      <div className="flex flex-wrap gap-2">
        {children.map((child) => (
          <button
            key={child.id}
            className="px-3 py-1.5 text-sm rounded-full border border-border hover:bg-accent transition-colors text-foreground"
            onClick={() => navigate(`/topics?topic=${child.id}`)}
          >
            {child.name}
          </button>
        ))}
      </div>
    </div>
  );
}
