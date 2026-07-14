import {
  Match,
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  Show,
  Suspense,
  Switch,
  type Component,
} from 'solid-js';
import { ipc } from '../../runtime.js';
import type { BibleDrawerState } from '../../services/bible-drawer-state.js';

const STRONGS_CODE_RE = /^[HG]\d+$/i;

type SearchMode =
  | { readonly _tag: 'hint' }
  | { readonly _tag: 'strongs'; readonly code: string }
  | { readonly _tag: 'lexicon'; readonly query: string };

export const WordsTab: Component<{ readonly state: BibleDrawerState }> = (props) => {
  const [rawQuery, setRawQuery] = createSignal('');

  createEffect(
    on(props.state.studyFocus, (focus) => {
      if (focus._tag === 'strongs') setRawQuery(focus.code);
    }),
  );

  const searchMode = createMemo<SearchMode>(() => {
    const query = rawQuery().trim();
    if (query.length < 2) return { _tag: 'hint' };
    if (STRONGS_CODE_RE.test(query)) return { _tag: 'strongs', code: query.toUpperCase() };
    return { _tag: 'lexicon', query };
  });
  const strongsMode = createMemo(() => {
    const mode = searchMode();
    return mode._tag === 'strongs' ? mode : null;
  });
  const lexiconMode = createMemo(() => {
    const mode = searchMode();
    return mode._tag === 'lexicon' ? mode : null;
  });

  return (
    <div class="flex flex-col gap-3">
      <input
        type="text"
        value={rawQuery()}
        onInput={(event) => setRawQuery(event.currentTarget.value)}
        placeholder="H1234, G5678, or English word…"
        spellcheck={false}
        autocapitalize="off"
        autocorrect="off"
        class="w-full bg-transparent border border-subtle rounded px-2 py-1 text-ui-sm text-fg placeholder:text-muted focus:outline-none focus:border-accent"
      />
      <Switch>
        <Match when={searchMode()._tag === 'hint'}>
          <p class="text-ui-sm text-muted">
            Type a Strong's number (H1234 / G5678) to list every verse it tags, or any English word
            to search the lexicon by definition.
          </p>
        </Match>
        <Match when={strongsMode()}>
          {(mode) => <WordsVerseResults state={props.state} code={mode().code} />}
        </Match>
        <Match when={lexiconMode()}>
          {(mode) => (
            <WordsLexiconResults query={mode().query} onPickCode={(code) => setRawQuery(code)} />
          )}
        </Match>
      </Switch>
    </div>
  );
};

const WordsVerseResults: Component<{
  readonly state: BibleDrawerState;
  readonly code: string;
}> = (props) => {
  const entry = ipc.bible.strongsLookup.query(() => ({ code: props.code }));
  const hits = ipc.bible.searchVersesByStrongs.query(() => ({ code: props.code }));
  const count = ipc.bible.countStrongsHits.query(() => ({ code: props.code }));

  return (
    <div class="flex flex-col gap-3">
      <Suspense fallback={<p class="text-ui-sm text-muted">Loading lexicon…</p>}>
        <Show
          when={entry()}
          keyed
          fallback={
            <p class="text-ui-sm text-muted">
              No lexicon entry for{' '}
              <span class="[font-variant-numeric:tabular-nums]">{props.code}</span>.
            </p>
          }
        >
          {(item) => (
            <div class="flex flex-col gap-1">
              <div class="flex flex-wrap items-baseline gap-x-2">
                <span class="text-ui-base font-medium text-fg [font-variant-numeric:tabular-nums]">
                  {props.code}
                </span>
                <span class="text-ui-base text-fg" lang={item.language === 'hebrew' ? 'he' : 'el'}>
                  {item.lemma}
                </span>
                <span class="text-ui-sm text-muted italic">{item.transliteration}</span>
              </div>
              <p class="text-ui-sm text-fg whitespace-pre-wrap m-0">{item.definition}</p>
            </div>
          )}
        </Show>
      </Suspense>
      <Suspense fallback={<p class="text-ui-sm text-muted">Counting occurrences…</p>}>
        <WordsHitCount hits={hits() ?? []} total={count() ?? 0} />
      </Suspense>
      <Suspense fallback={<p class="text-ui-sm text-muted">Loading verses…</p>}>
        <WordsHitList
          hits={hits() ?? []}
          onNavigate={(book, chapter, verse) =>
            props.state.open(book, chapter, verse, 'words', {
              _tag: 'strongs',
              verse,
              code: props.code,
            })
          }
        />
      </Suspense>
    </div>
  );
};

const WordsHitCount: Component<{
  readonly hits: readonly { readonly book: number }[];
  readonly total: number;
}> = (props) => (
  <Show when={props.total > 0}>
    <p class="text-ui-xs text-muted [font-variant-numeric:tabular-nums]">
      {props.hits.length < props.total
        ? `Showing ${String(props.hits.length)} of ${String(props.total)} occurrences`
        : `${String(props.total)} occurrence${props.total === 1 ? '' : 's'}`}
    </p>
  </Show>
);

const WordsHitList: Component<{
  readonly hits: readonly {
    readonly book: number;
    readonly bookName: string;
    readonly chapter: number;
    readonly verse: number;
    readonly text: string;
    readonly word: string;
  }[];
  readonly onNavigate: (book: number, chapter: number, verse: number) => void;
}> = (props) => (
  <Show
    when={props.hits.length > 0}
    fallback={<p class="text-ui-sm text-muted">No verses tag this code.</p>}
  >
    <ul class="flex flex-col gap-2 list-none p-0 m-0">
      <For each={props.hits}>
        {(hit) => (
          <li class="flex flex-col gap-0.5">
            <div class="flex items-baseline gap-2">
              <button
                type="button"
                class="cursor-pointer bg-transparent border-0 p-0 text-ui-sm font-medium text-accent hover:underline text-left [font-variant-numeric:tabular-nums]"
                title={`Open ${hit.bookName} ${String(hit.chapter)}:${String(hit.verse)}`}
                onClick={() => props.onNavigate(hit.book, hit.chapter, hit.verse)}
              >
                {hit.bookName} {hit.chapter}:{hit.verse}
              </button>
              <span class="text-[0.62em] text-muted uppercase tracking-wide">{hit.word}</span>
            </div>
            <p class="text-ui-sm text-muted m-0 leading-snug line-clamp-2">{hit.text}</p>
          </li>
        )}
      </For>
    </ul>
  </Show>
);

const WordsLexiconResults: Component<{
  readonly query: string;
  readonly onPickCode: (code: string) => void;
}> = (props) => {
  const entries = ipc.bible.searchLexicon.query(() => ({ query: props.query }));
  return (
    <Suspense fallback={<p class="text-ui-sm text-muted">Searching lexicon…</p>}>
      <Show
        when={(entries() ?? []).length > 0}
        fallback={<p class="text-ui-sm text-muted">No lexicon entries match "{props.query}".</p>}
      >
        <ul class="flex flex-col gap-2 list-none p-0 m-0">
          <For each={entries() ?? []}>
            {(entry) => (
              <li class="flex flex-col gap-0.5">
                <div class="flex items-baseline gap-2">
                  <button
                    type="button"
                    class="cursor-pointer bg-transparent border-0 p-0 text-ui-sm font-medium text-accent hover:underline text-left [font-variant-numeric:tabular-nums]"
                    title={`Show verses tagged ${entry.code}`}
                    onClick={() => props.onPickCode(entry.code)}
                  >
                    {entry.code}
                  </button>
                  <span class="text-ui-sm text-fg" lang={entry.language === 'hebrew' ? 'he' : 'el'}>
                    {entry.lemma}
                  </span>
                  <span class="text-ui-xs text-muted italic">{entry.transliteration}</span>
                </div>
                <p class="text-ui-sm text-muted m-0 leading-snug line-clamp-2">
                  {entry.definition}
                </p>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </Suspense>
  );
};
