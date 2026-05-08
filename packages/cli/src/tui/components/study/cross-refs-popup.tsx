/**
 * Cross-References Popup
 *
 * Shows cross-references, margin notes, EGW commentary, and structural analysis
 * for the currently selected verse.
 * Navigate with j/k or up/down, select with Enter, close with Escape.
 * Switch between pages with h/l or left/right arrows.
 *
 * Cross-ref features:
 * - Type badges [QUO] [TYP] etc. when classified
 * - `c` to classify via AI
 * - `a` to add user cross-reference
 * - `d` to delete user cross-reference
 *
 * Pages:
 * 1. Cross-references & Margin Notes
 * 2. EGW Commentary (from Bible Commentary volumes)
 * 3. Structural Analysis (word frequency, Strong's data)
 */

import { BibleDatabase } from '@bible/core/bible-db';
import { EGWCommentaryService, type CommentaryEntry } from '@bible/core/egw-commentary';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import {
  StructuralAnalysis,
  type WordFrequencyEntry,
  type PassageContext,
} from '@bible/core/structural-analysis';
import { BunServices } from '@effect/platform-bun';
import type { ScrollBoxRenderable } from '@opentui/core';
import { useModalKeyboard } from '../../hooks/use-modal-keyboard.js';
import { Effect, Layer } from 'effect';
import { createMemo, createSignal, For, Show } from 'solid-js';

import { CROSS_REF_TYPES, type CrossRefType } from '../../../data/bible/state.js';
import type { Reference } from '../../../data/bible/types.js';
import { formatReference, getBook } from '../../../data/bible/types.js';
import { useBibleData } from '../../context/bible.js';
import { useModel } from '../../context/model.js';
import { useStudyData, type ClassifiedCrossReference } from '../../context/study-data.js';
import { useTheme } from '../../context/theme.js';
import { useScrollSync } from '../../hooks/use-scroll-sync.js';
import { formatNoteType } from '../bible/verse.js';

/** Convert ClassifiedCrossReference (null) to Reference (undefined) */
function toReference(ref: ClassifiedCrossReference): Reference {
  return {
    book: ref.book,
    chapter: ref.chapter,
    verse: ref.verse ?? undefined,
    verseEnd: ref.verseEnd ?? undefined,
  };
}

/** Type badge abbreviations and colors */
const TYPE_BADGES: Record<CrossRefType, { label: string; color: string }> = {
  quotation: { label: 'QUO', color: '#e06c75' },
  allusion: { label: 'ALL', color: '#c678dd' },
  parallel: { label: 'PAR', color: '#61afef' },
  typological: { label: 'TYP', color: '#e5c07b' },
  prophecy: { label: 'PRO', color: '#d19a66' },
  sanctuary: { label: 'SAN', color: '#56b6c2' },
  recapitulation: { label: 'REC', color: '#98c379' },
  thematic: { label: 'THM', color: '#abb2bf' },
};

/** Page type for the popup */
type PopupPage = 'crossrefs' | 'commentary' | 'structure';

const PAGES: PopupPage[] = ['crossrefs', 'commentary', 'structure'];

interface CrossRefsPopupProps {
  verseRef: Reference;
  onClose: () => void;
  onNavigate: (ref: Reference) => void;
}

export function CrossRefsPopup(props: CrossRefsPopupProps) {
  const { theme } = useTheme();
  const data = useBibleData();
  const studyData = useStudyData();
  const model = useModel();
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [currentPage, setCurrentPage] = createSignal<PopupPage>('crossrefs');
  const [commentary, setCommentary] = createSignal<readonly CommentaryEntry[]>([]);
  const [commentaryLoading, setCommentaryLoading] = createSignal(false);
  const [selectedCommentaryIndex, setSelectedCommentaryIndex] = createSignal(0);
  const [structureData, setStructureData] = createSignal<PassageContext | null>(null);
  const [structureLoading, setStructureLoading] = createSignal(false);
  const [selectedStructureIndex, setSelectedStructureIndex] = createSignal(0);
  const [classifying, setClassifying] = createSignal(false);
  const [addingRef, setAddingRef] = createSignal(false);
  const [addRefInput, setAddRefInput] = createSignal('');
  const [typingMode, setTypingMode] = createSignal(false);
  const [typePickerIndex, setTypePickerIndex] = createSignal(0);
  // Increment to force crossRefs re-evaluation
  const [refreshKey, setRefreshKey] = createSignal(0);
  let scrollRef: ScrollBoxRenderable | undefined = undefined;
  let commentaryScrollRef: ScrollBoxRenderable | undefined = undefined;
  let structureScrollRef: ScrollBoxRenderable | undefined = undefined;

  // Get cross-references for this verse
  const crossRefs = createMemo(() => {
    // Track refreshKey to re-evaluate after classify/add/delete
    refreshKey();
    const verse = props.verseRef.verse ?? 1;
    return studyData.getCrossRefs(props.verseRef.book, props.verseRef.chapter, verse);
  });

  // Get margin notes for this verse
  const marginNotes = createMemo(() => {
    const verse = props.verseRef.verse ?? 1;
    return studyData.getMarginNotes(props.verseRef.book, props.verseRef.chapter, verse);
  });

  // Get preview text for each reference
  const refsWithPreviews = createMemo(() =>
    crossRefs().map((ref) => {
      let preview = ref.previewText ?? '';
      if (preview === '') {
        const verse = data.getVerse(ref.book, ref.chapter, ref.verse ?? 1);
        if (verse) {
          preview = verse.text
            .replace(/\u00b6\s*/, '')
            .replace(/\[.*?\]/g, '')
            .slice(0, 50);
          if (verse.text.length > 50) preview += '...';
        }
      }
      return { ref, preview };
    }),
  );

  // Derived structure data for rendering
  const structureWords = createMemo((): readonly WordFrequencyEntry[] => {
    const ctx = structureData();
    if (!ctx) return [];
    // Show top 20 words + all symbolic entries
    const top = ctx.wordFrequency.entries.slice(0, 20);
    const symbolic = ctx.wordFrequency.symbolicEntries;
    // Merge, deduplicating
    const seen = new Set(top.map((e) => e.word));
    const extra = symbolic.filter((e) => !seen.has(e.word));
    return [...top, ...extra];
  });

  const structureStrongs = createMemo(() => {
    const ctx = structureData();
    if (!ctx) return [];
    // Get Strong's entries for current verse's words
    const verse = props.verseRef.verse ?? 1;
    const words = ctx.words.get(verse) ?? [];
    const strongsNums = new Set<string>();
    for (const w of words) {
      if (w.strongsNumbers) {
        for (const sn of w.strongsNumbers) strongsNums.add(sn);
      }
    }
    return [...strongsNums]
      .map((sn) => ctx.strongsEntries.get(sn))
      .filter((e): e is NonNullable<typeof e> => e != null);
  });

  const moveSelection = (delta: number) => {
    const page = currentPage();
    if (page === 'crossrefs') {
      setSelectedIndex((i) => {
        const maxIndex = refsWithPreviews().length - 1;
        return Math.max(0, Math.min(maxIndex, i + delta));
      });
    } else if (page === 'commentary') {
      setSelectedCommentaryIndex((i) => {
        const maxIndex = commentary().length - 1;
        return Math.max(0, Math.min(maxIndex, i + delta));
      });
    } else {
      setSelectedStructureIndex((i) => {
        const maxIndex = structureWords().length + structureStrongs().length - 1;
        return Math.max(0, Math.min(maxIndex, i + delta));
      });
    }
  };

  // Scroll to keep selected item visible
  useScrollSync(() => `crossref-${selectedIndex()}`, {
    getRef: () => scrollRef,
  });

  useScrollSync(() => `commentary-${selectedCommentaryIndex()}`, {
    getRef: () => commentaryScrollRef,
  });

  useScrollSync(() => `structure-${selectedStructureIndex()}`, {
    getRef: () => structureScrollRef,
  });

  const selectCurrent = () => {
    if (currentPage() === 'crossrefs') {
      const refs = refsWithPreviews();
      const selected = refs[selectedIndex()];
      if (selected) {
        props.onNavigate(toReference(selected.ref));
      }
    }
    // Commentary and structure don't navigate
  };

  // Switch between pages (cycle through 3 pages)
  const switchPage = (direction: 'left' | 'right') => {
    const idx = PAGES.indexOf(currentPage());
    const nextIdx =
      direction === 'right' ? (idx + 1) % PAGES.length : (idx - 1 + PAGES.length) % PAGES.length;
    const nextPage = PAGES[nextIdx] ?? 'crossrefs';
    setCurrentPage(nextPage);

    if (nextPage === 'commentary' && commentary().length === 0 && !commentaryLoading()) {
      loadCommentary();
    }
    if (nextPage === 'structure' && structureData() === null && !structureLoading()) {
      loadStructure();
    }
  };

  // Load commentary from EGW Commentary service
  const loadCommentary = () => {
    setCommentaryLoading(true);

    const CommentaryLayer = EGWCommentaryService.Default.pipe(
      Layer.provideMerge(EGWParagraphDatabase.Default),
      Layer.provideMerge(BunServices.layer),
    );

    const verse = props.verseRef.verse ?? 1;

    Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* EGWCommentaryService;
        return yield* service.getCommentary({
          book: props.verseRef.book,
          chapter: props.verseRef.chapter,
          verse,
        });
      }).pipe(Effect.provide(CommentaryLayer), Effect.scoped),
    )
      .then((result) => {
        setCommentary(result.entries);
        setCommentaryLoading(false);
      })
      .catch(() => {
        setCommentary([]);
        setCommentaryLoading(false);
      });
  };

  // Load structural analysis data
  const loadStructure = () => {
    setStructureLoading(true);

    const StructuralLayer = StructuralAnalysis.Live.pipe(
      Layer.provideMerge(BibleDatabase.Default),
      Layer.provideMerge(BunServices.layer),
    );

    const verse = props.verseRef.verse ?? 1;

    Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* StructuralAnalysis;
        return yield* service.getPassageContext(
          props.verseRef.book,
          props.verseRef.chapter,
          verse,
          verse,
        );
      }).pipe(Effect.provide(StructuralLayer), Effect.scoped),
    )
      .then((result) => {
        setStructureData(result);
        setStructureLoading(false);
      })
      .catch(() => {
        setStructureData(null);
        setStructureLoading(false);
      });
  };

  // Classify a single selected cross-ref via AI
  const handleClassify = () => {
    if (classifying() || model === null) return;
    const refs = refsWithPreviews();
    const selected = refs[selectedIndex()];
    if (!selected) return;
    setClassifying(true);
    const verse = props.verseRef.verse ?? 1;
    studyData
      .classifyRef(
        { book: props.verseRef.book, chapter: props.verseRef.chapter, verse },
        selected.ref,
        model.models,
      )
      .then(() => {
        setRefreshKey((k) => k + 1);
        setClassifying(false);
      })
      .catch(() => {
        setClassifying(false);
      });
  };

  // Classify all unclassified cross-refs via AI (batch)
  const handleClassifyAll = () => {
    if (classifying() || model === null) return;
    setClassifying(true);
    const verse = props.verseRef.verse ?? 1;
    studyData
      .classifyVerse(props.verseRef.book, props.verseRef.chapter, verse, model.models)
      .then(() => {
        setRefreshKey((k) => k + 1);
        setClassifying(false);
      })
      .catch(() => {
        setClassifying(false);
      });
  };

  // Manually set type on selected cross-ref
  const handleSetType = (type: CrossRefType) => {
    const refs = refsWithPreviews();
    const selected = refs[selectedIndex()];
    if (!selected) return;
    const verse = props.verseRef.verse ?? 1;
    studyData.setRefType(
      { book: props.verseRef.book, chapter: props.verseRef.chapter, verse },
      selected.ref,
      type,
    );
    setTypingMode(false);
    setRefreshKey((k) => k + 1);
  };

  // Add user cross-reference
  const handleAddRef = () => {
    const input = addRefInput().trim();
    if (input === '') return;

    const parsed = data.parseReference(input);
    if (parsed === undefined) return;

    const verse = props.verseRef.verse ?? 1;
    studyData.addUserCrossRef(
      { book: props.verseRef.book, chapter: props.verseRef.chapter, verse },
      { book: parsed.book, chapter: parsed.chapter, verse: parsed.verse },
    );
    setAddingRef(false);
    setAddRefInput('');
    setRefreshKey((k) => k + 1);
  };

  // Delete selected user cross-reference
  const handleDeleteRef = () => {
    const refs = refsWithPreviews();
    const selected = refs[selectedIndex()];
    if (!selected || !selected.ref.isUserAdded || selected.ref.userRefId === null) return;

    studyData.removeUserCrossRef(selected.ref.userRefId);
    setRefreshKey((k) => k + 1);

    // Adjust selection if needed
    const newLength = refsWithPreviews().length - 1;
    if (selectedIndex() >= newLength && newLength > 0) {
      setSelectedIndex(newLength - 1);
    }
  };

  useModalKeyboard((key) => {
    // Type picker mode
    if (typingMode()) {
      if (key.name === 'escape') {
        setTypingMode(false);
        return;
      }
      if (key.name === 'return') {
        const type = CROSS_REF_TYPES[typePickerIndex()];
        if (type !== undefined) handleSetType(type);
        return;
      }
      if (key.name === 'left' || key.sequence === 'h') {
        setTypePickerIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.name === 'right' || key.sequence === 'l') {
        setTypePickerIndex((i) => Math.min(CROSS_REF_TYPES.length - 1, i + 1));
        return;
      }
      return;
    }

    // Add-ref input mode
    if (addingRef()) {
      if (key.name === 'escape') {
        setAddingRef(false);
        setAddRefInput('');
        return;
      }
      if (key.name === 'return') {
        handleAddRef();
        return;
      }
      if (key.name === 'backspace') {
        setAddRefInput((q) => q.slice(0, -1));
        return;
      }
      // Character input
      if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
        setAddRefInput((q) => q + key.sequence);
        return;
      }
      return;
    }

    // Normal mode
    if (key.name === 'escape') {
      props.onClose();
      return;
    }

    if (key.name === 'return') {
      selectCurrent();
      return;
    }

    if (key.name === 'up' || key.sequence === 'k') {
      moveSelection(-1);
      return;
    }

    if (key.name === 'down' || key.sequence === 'j') {
      moveSelection(1);
      return;
    }

    // Page navigation with h/l or left/right
    if (key.name === 'left' || key.sequence === 'h') {
      switchPage('left');
      return;
    }

    if (key.name === 'right' || key.sequence === 'l') {
      switchPage('right');
      return;
    }

    // Cross-refs page keybindings
    if (currentPage() === 'crossrefs') {
      // c = classify selected ref, C = classify all
      if (key.sequence === 'c' && !key.shift && !classifying()) {
        handleClassify();
        return;
      }

      if (key.sequence === 'C' && !classifying()) {
        handleClassifyAll();
        return;
      }

      // t = manual type picker
      if (key.sequence === 't') {
        const refs = refsWithPreviews();
        if (refs.length > 0) {
          // Pre-select current type if ref is already classified
          const selected = refs[selectedIndex()];
          if (selected?.ref.classification) {
            const idx = CROSS_REF_TYPES.indexOf(selected.ref.classification);
            setTypePickerIndex(idx >= 0 ? idx : 0);
          } else {
            setTypePickerIndex(0);
          }
          setTypingMode(true);
        }
        return;
      }

      if (key.sequence === 'a') {
        setAddingRef(true);
        setAddRefInput('');
        return;
      }

      if (key.sequence === 'd') {
        handleDeleteRef();
        return;
      }
    }
  });

  const sourceBook = getBook(props.verseRef.book);
  const sourceLabel = sourceBook
    ? `${sourceBook.name} ${props.verseRef.chapter}:${props.verseRef.verse ?? 1}`
    : 'Unknown';

  const hasMarginNotes = () => marginNotes().length > 0;
  const hasCrossRefs = () => refsWithPreviews().length > 0;
  const hasContent = () => hasMarginNotes() || hasCrossRefs();
  const hasCommentary = () => commentary().length > 0;
  const hasStructure = () => structureData() !== null;

  return (
    <box
      flexDirection="column"
      border
      borderColor={theme().border}
      backgroundColor={theme().backgroundPanel}
      width={65}
      maxHeight={22}
      padding={1}
    >
      {/* Header with tabs */}
      <box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <text fg={theme().text}>
          <strong>{sourceLabel}</strong>
        </text>
        <box flexDirection="row" gap={1}>
          <text fg={currentPage() === 'crossrefs' ? theme().accent : theme().textMuted}>
            {currentPage() === 'crossrefs' ? <strong>[Refs]</strong> : 'Refs'}
          </text>
          <text fg={theme().textMuted}>|</text>
          <text fg={currentPage() === 'commentary' ? theme().accent : theme().textMuted}>
            {currentPage() === 'commentary' ? <strong>[EGW]</strong> : 'EGW'}
          </text>
          <text fg={theme().textMuted}>|</text>
          <text fg={currentPage() === 'structure' ? theme().accent : theme().textMuted}>
            {currentPage() === 'structure' ? <strong>[Struct]</strong> : 'Struct'}
          </text>
        </box>
      </box>

      {/* Classifying indicator */}
      <Show when={classifying()}>
        <text fg={theme().accent}>Classifying cross-references...</text>
      </Show>

      {/* Cross-References Page */}
      <Show when={currentPage() === 'crossrefs'}>
        <Show
          when={hasContent()}
          fallback={<text fg={theme().textMuted}>No cross-references or margin notes</text>}
        >
          {/* Margin Notes Section */}
          <Show when={hasMarginNotes()}>
            <box flexDirection="column" marginBottom={1}>
              <text fg={theme().textMuted} marginBottom={0}>
                <strong>Margin Notes</strong>
              </text>
              <For each={marginNotes()}>
                {(note, index) => (
                  <text fg={theme().text} wrapMode="word">
                    <span style={{ fg: theme().accent }}>{index() + 1}.</span>{' '}
                    <span style={{ fg: theme().accentMuted }}>{formatNoteType(note.type)}</span>
                    {formatNoteType(note.type) ? ' ' : ''}
                    {note.text}
                  </text>
                )}
              </For>
            </box>
          </Show>

          {/* Cross-References Section */}
          <Show when={hasCrossRefs()}>
            <box flexDirection="column">
              <text fg={theme().textMuted} marginBottom={0}>
                <strong>Cross-References</strong>
              </text>
              <scrollbox
                ref={(el) => (scrollRef = el)}
                focused={false}
                style={{
                  height: hasMarginNotes() ? 6 : 10,
                  rootOptions: {
                    backgroundColor: theme().backgroundPanel,
                  },
                  wrapperOptions: {
                    backgroundColor: theme().backgroundPanel,
                  },
                  viewportOptions: {
                    backgroundColor: theme().backgroundPanel,
                  },
                  contentOptions: {
                    backgroundColor: theme().backgroundPanel,
                  },
                  scrollbarOptions: {
                    showArrows: false,
                    trackOptions: {
                      foregroundColor: theme().accent,
                      backgroundColor: theme().border,
                    },
                  },
                }}
              >
                <For each={refsWithPreviews()}>
                  {(item, index) => {
                    const isSelected = () => index() === selectedIndex();
                    const refText = formatReference(toReference(item.ref));
                    const paddedRef = refText.padEnd(18, ' ');
                    const badge = item.ref.classification
                      ? TYPE_BADGES[item.ref.classification]
                      : null;
                    const prefix = item.ref.isUserAdded ? ' * ' : badge ? '' : '   ';
                    const badgeStr = badge ? `[${badge.label}]` : '';
                    return (
                      <text
                        id={`crossref-${index()}`}
                        fg={isSelected() ? theme().accent : theme().textMuted}
                      >
                        {isSelected() ? '▶ ' : '  '}
                        {badge ? <span style={{ fg: badge.color }}>{badgeStr}</span> : prefix}
                        {badge ? ' ' : ''}
                        <span
                          style={{
                            fg: isSelected() ? theme().accent : theme().text,
                          }}
                        >
                          {isSelected() ? <strong>{paddedRef}</strong> : paddedRef}
                        </span>
                        {item.preview}
                      </text>
                    );
                  }}
                </For>
              </scrollbox>
            </box>
          </Show>
        </Show>

        {/* Add reference input */}
        <Show when={addingRef()}>
          <box
            border
            borderColor={theme().borderFocused}
            paddingLeft={1}
            paddingRight={1}
            marginTop={1}
          >
            <text fg={theme().text}>
              Add ref:{' '}
              {addRefInput() || (
                <span style={{ fg: theme().textMuted }}>Type reference (e.g. John 3:16)...</span>
              )}
              <span style={{ fg: theme().accent }}>_</span>
            </text>
          </box>
        </Show>

        {/* Type picker */}
        <Show when={typingMode()}>
          <box
            border
            borderColor={theme().borderFocused}
            paddingLeft={1}
            paddingRight={1}
            marginTop={1}
            flexDirection="row"
            gap={1}
          >
            <For each={[...CROSS_REF_TYPES]}>
              {(type, index) => {
                const badge = TYPE_BADGES[type];
                const isSelected = () => index() === typePickerIndex();
                return (
                  <text fg={isSelected() ? badge.color : theme().textMuted}>
                    {isSelected() ? <strong>[{badge.label}]</strong> : ` ${badge.label} `}
                  </text>
                );
              }}
            </For>
          </box>
        </Show>
      </Show>

      {/* Commentary Page */}
      <Show when={currentPage() === 'commentary'}>
        <Show
          when={!commentaryLoading()}
          fallback={<text fg={theme().textMuted}>Loading EGW Commentary...</text>}
        >
          <Show
            when={hasCommentary()}
            fallback={<text fg={theme().textMuted}>No EGW commentary found for this verse</text>}
          >
            <scrollbox
              ref={(el) => (commentaryScrollRef = el)}
              focused={false}
              style={{
                height: 12,
                rootOptions: {
                  backgroundColor: theme().backgroundPanel,
                },
                wrapperOptions: {
                  backgroundColor: theme().backgroundPanel,
                },
                viewportOptions: {
                  backgroundColor: theme().backgroundPanel,
                },
                contentOptions: {
                  backgroundColor: theme().backgroundPanel,
                },
                scrollbarOptions: {
                  showArrows: false,
                  trackOptions: {
                    foregroundColor: theme().accent,
                    backgroundColor: theme().border,
                  },
                },
              }}
            >
              <For each={commentary()}>
                {(entry, index) => {
                  const isSelected = () => index() === selectedCommentaryIndex();
                  return (
                    <box
                      id={`commentary-${index()}`}
                      flexDirection="column"
                      marginBottom={1}
                      backgroundColor={isSelected() ? theme().verseHighlight : undefined}
                      paddingLeft={1}
                      paddingRight={1}
                    >
                      <text fg={isSelected() ? theme().accent : theme().textMuted}>
                        {isSelected() ? <strong>{entry.refcode}</strong> : entry.refcode}
                      </text>
                      <text fg={theme().text} wrapMode="word">
                        {entry.content.slice(0, 200)}
                        {entry.content.length > 200 ? '...' : ''}
                      </text>
                    </box>
                  );
                }}
              </For>
            </scrollbox>
          </Show>
        </Show>
      </Show>

      {/* Structure Page */}
      <Show when={currentPage() === 'structure'}>
        <Show
          when={!structureLoading()}
          fallback={<text fg={theme().textMuted}>Loading structural data...</text>}
        >
          <Show
            when={hasStructure()}
            fallback={<text fg={theme().textMuted}>No structural data available</text>}
          >
            <scrollbox
              ref={(el) => (structureScrollRef = el)}
              focused={false}
              style={{
                height: 12,
                rootOptions: {
                  backgroundColor: theme().backgroundPanel,
                },
                wrapperOptions: {
                  backgroundColor: theme().backgroundPanel,
                },
                viewportOptions: {
                  backgroundColor: theme().backgroundPanel,
                },
                contentOptions: {
                  backgroundColor: theme().backgroundPanel,
                },
                scrollbarOptions: {
                  showArrows: false,
                  trackOptions: {
                    foregroundColor: theme().accent,
                    backgroundColor: theme().border,
                  },
                },
              }}
            >
              {/* Word Frequency */}
              <Show when={structureWords().length > 0}>
                <text fg={theme().textMuted} marginBottom={0}>
                  <strong>Word Frequency</strong>
                </text>
                <For each={structureWords()}>
                  {(entry, index) => {
                    const isSelected = () => index() === selectedStructureIndex();
                    const symbolic = entry.symbolicCount !== null;
                    return (
                      <text
                        id={`structure-${index()}`}
                        fg={
                          symbolic
                            ? theme().accent
                            : isSelected()
                              ? theme().text
                              : theme().textMuted
                        }
                      >
                        {isSelected() ? '▶ ' : '  '}
                        {entry.word.padEnd(20, ' ')} {String(entry.count).padStart(3, ' ')}x
                        {symbolic ? ` (${entry.symbolicCount})` : ''}
                      </text>
                    );
                  }}
                </For>
              </Show>

              {/* Strong's Entries for current verse */}
              <Show when={structureStrongs().length > 0}>
                <text fg={theme().textMuted} marginTop={1} marginBottom={0}>
                  <strong>Strong's (this verse)</strong>
                </text>
                <For each={structureStrongs()}>
                  {(entry, index) => {
                    const globalIdx = () => structureWords().length + index();
                    const isSelected = () => globalIdx() === selectedStructureIndex();
                    const lang = entry.number.startsWith('H') ? 'Heb' : 'Grk';
                    return (
                      <box
                        id={`structure-${globalIdx()}`}
                        flexDirection="column"
                        marginBottom={0}
                        backgroundColor={isSelected() ? theme().verseHighlight : undefined}
                        paddingLeft={1}
                      >
                        <text fg={isSelected() ? theme().accent : theme().textMuted}>
                          {entry.number} [{lang}] {entry.lemma} (
                          {entry.transliteration ?? entry.lemma})
                        </text>
                        <text fg={theme().text} wrapMode="word">
                          {entry.definition.slice(0, 120)}
                          {entry.definition.length > 120 ? '...' : ''}
                        </text>
                      </box>
                    );
                  }}
                </For>
              </Show>
            </scrollbox>
          </Show>
        </Show>
      </Show>

      {/* Footer */}
      <box marginTop={1}>
        <text fg={theme().textMuted}>
          <Show when={typingMode()}>
            <span style={{ fg: theme().accent }}>←→</span> select •{' '}
            <span style={{ fg: theme().accent }}>Enter</span> set •{' '}
            <span style={{ fg: theme().accent }}>Esc</span> cancel
          </Show>
          <Show when={addingRef()}>
            <span style={{ fg: theme().accent }}>Enter</span> add •{' '}
            <span style={{ fg: theme().accent }}>Esc</span> cancel
          </Show>
          <Show when={!addingRef() && !typingMode()}>
            <span style={{ fg: theme().accent }}>←→</span> pages
            {'  '}
            <Show when={currentPage() === 'crossrefs' && hasCrossRefs()}>
              <span style={{ fg: theme().accent }}>↑↓</span> nav •{' '}
              <span style={{ fg: theme().accent }}>Enter</span> go •{' '}
              <span style={{ fg: theme().accent }}>c</span> classify •{' '}
              <span style={{ fg: theme().accent }}>C</span> all •{' '}
              <span style={{ fg: theme().accent }}>t</span> type •{' '}
              <span style={{ fg: theme().accent }}>a</span> add
              {'  '}
            </Show>
            <Show when={currentPage() === 'commentary' && hasCommentary()}>
              <span style={{ fg: theme().accent }}>↑↓</span> scroll
              {'  '}
            </Show>
            <Show when={currentPage() === 'structure' && hasStructure()}>
              <span style={{ fg: theme().accent }}>↑↓</span> scroll
              {'  '}
            </Show>
            <span style={{ fg: theme().accent }}>Esc</span> close
          </Show>
        </text>
      </box>
    </box>
  );
}
