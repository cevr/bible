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

import { Reference, type VerseReference } from '@bible/core/bible';
import { CROSS_REF_TYPES, type CrossRefType } from '@bible/core/bible-cross-refs';
import { EGWCommentaryService, type CommentaryEntry } from '@bible/core/egw-commentary';
import {
  StructuralAnalysis,
  type WordFrequencyEntry,
  type PassageContext,
} from '@bible/core/structural-analysis';
import type { ScrollBoxRenderable } from '@opentui/core';
import { useModalKeyboard } from '../../hooks/use-modal-keyboard.js';
import { createMemo, createSignal, Show } from 'solid-js';

import type { ReaderReference } from '../../../app/reader-reference.js';
import { parseReaderReference } from '../../../lib/parse-reader-reference.js';
import { useBibleReader } from '../../context/bible.js';
import { useModel } from '../../context/model.js';
import { useStudyData } from '../../context/study-data.js';
import { useTheme } from '../../context/theme.js';
import { useScrollSync } from '../../hooks/use-scroll-sync.js';
import { useAppRuntime } from '../../lib/index.js';
import { CommentaryPage } from './cross-refs-popup/commentary-page.js';
import { CrossRefsPage } from './cross-refs-popup/cross-refs-page.js';
import { POPUP_PAGES, type CrossRefPreview, type PopupPage } from './cross-refs-popup/model.js';
import { StructurePage } from './cross-refs-popup/structure-page.js';

interface CrossRefsPopupProps {
  verseRef: VerseReference;
  onClose: () => void;
  onNavigate: (ref: ReaderReference) => void;
}

export function CrossRefsPopup(props: CrossRefsPopupProps) {
  const { theme } = useTheme();
  const reader = useBibleReader();
  const studyData = useStudyData();
  const model = useModel();
  const runtime = useAppRuntime();
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [currentPage, setCurrentPage] = createSignal<PopupPage>('crossrefs');
  const [commentary, setCommentary] = createSignal<readonly CommentaryEntry[]>([]);
  const [commentaryLoading, setCommentaryLoading] = createSignal(false);
  const [selectedCommentaryIndex, setSelectedCommentaryIndex] = createSignal(0);
  const [structureData, setStructureData] = createSignal<PassageContext | null>(null);
  const [structureLoading, setStructureLoading] = createSignal(false);
  const [selectedStructureIndex, setSelectedStructureIndex] = createSignal(0);
  const [classifying, setClassifying] = createSignal(false);
  const [classificationError, setClassificationError] = createSignal<string | null>(null);
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
    return studyData.crossReferences.forVerse(props.verseRef);
  });

  // Get margin notes for this verse
  const marginNotes = createMemo(() => studyData.marginNotes.forVerse(props.verseRef));

  // Get preview text for each reference
  const refsWithPreviews = createMemo((): readonly CrossRefPreview[] =>
    crossRefs().map((ref) => {
      let preview = ref.previewText ?? '';
      if (preview === '') {
        const verse = reader.verse(Reference.verse(ref.book, ref.chapter, ref.verse ?? 1));
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
      if (w.strongsNumbers.length > 0) {
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
        props.onNavigate(
          selected.ref.verse === null
            ? Reference.chapter(selected.ref.book, selected.ref.chapter)
            : Reference.verse(selected.ref.book, selected.ref.chapter, selected.ref.verse),
        );
      }
    }
    // Commentary and structure don't navigate
  };

  // Switch between pages (cycle through 3 pages)
  const switchPage = (direction: 'left' | 'right') => {
    const idx = POPUP_PAGES.indexOf(currentPage());
    const nextIdx =
      direction === 'right'
        ? (idx + 1) % POPUP_PAGES.length
        : (idx - 1 + POPUP_PAGES.length) % POPUP_PAGES.length;
    const nextPage = POPUP_PAGES[nextIdx] ?? 'crossrefs';
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

    const verse = props.verseRef.verse ?? 1;

    runtime
      .runPromise(
        EGWCommentaryService.use((service) =>
          service.getCommentary(
            Reference.verse(props.verseRef.book, props.verseRef.chapter, verse),
          ),
        ),
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

    const verse = props.verseRef.verse ?? 1;

    runtime
      .runPromise(
        StructuralAnalysis.use((service) =>
          service.getPassageContext(props.verseRef.book, props.verseRef.chapter, verse, verse),
        ),
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
    setClassificationError(null);
    studyData.crossReferences
      .classify(props.verseRef, selected.ref)
      .then(() => {
        setRefreshKey((k) => k + 1);
        setClassifying(false);
      })
      .catch(() => {
        setClassificationError('Unable to classify this reference');
        setClassifying(false);
      });
  };

  // Classify all unclassified cross-refs via AI (batch)
  const handleClassifyAll = () => {
    if (classifying() || model === null) return;
    setClassifying(true);
    setClassificationError(null);
    studyData.crossReferences
      .classifyVerse(props.verseRef)
      .then(() => {
        setRefreshKey((k) => k + 1);
        setClassifying(false);
      })
      .catch(() => {
        setClassificationError('Unable to classify these references');
        setClassifying(false);
      });
  };

  // Manually set type on selected cross-ref
  const handleSetType = (type: CrossRefType) => {
    const refs = refsWithPreviews();
    const selected = refs[selectedIndex()];
    if (!selected) return;
    studyData.crossReferences.setType(props.verseRef, selected.ref, type);
    setTypingMode(false);
    setRefreshKey((k) => k + 1);
  };

  // Add user cross-reference
  const handleAddRef = () => {
    const input = addRefInput().trim();
    if (input === '') return;

    const parsed = parseReaderReference(input);
    if (parsed === undefined) return;

    studyData.crossReferences.add(props.verseRef, parsed);
    setAddingRef(false);
    setAddRefInput('');
    setRefreshKey((k) => k + 1);
  };

  // Delete selected user cross-reference
  const handleDeleteRef = () => {
    const refs = refsWithPreviews();
    const selected = refs[selectedIndex()];
    if (!selected || selected.ref.source !== 'user') return;

    studyData.crossReferences.remove(selected.ref.userRefId);
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

  const sourceBook = reader.book(Reference.book(props.verseRef.book));
  const sourceLabel = sourceBook
    ? `${sourceBook.name} ${props.verseRef.chapter}:${props.verseRef.verse ?? 1}`
    : 'Unknown';

  const hasCrossRefs = () => refsWithPreviews().length > 0;
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
      <Show when={classificationError()}>
        {(message) => <text fg={theme().error}>{message()}</text>}
      </Show>

      {/* Cross-References Page */}
      <Show when={currentPage() === 'crossrefs'}>
        <CrossRefsPage
          marginNotes={marginNotes()}
          refs={refsWithPreviews()}
          selectedIndex={selectedIndex()}
          addingRef={addingRef()}
          addRefInput={addRefInput()}
          typingMode={typingMode()}
          typePickerIndex={typePickerIndex()}
          setScrollRef={(element) => (scrollRef = element)}
        />
      </Show>

      {/* Commentary Page */}
      <Show when={currentPage() === 'commentary'}>
        <CommentaryPage
          entries={commentary()}
          loading={commentaryLoading()}
          selectedIndex={selectedCommentaryIndex()}
          setScrollRef={(element) => (commentaryScrollRef = element)}
        />
      </Show>

      {/* Structure Page */}
      <Show when={currentPage() === 'structure'}>
        <StructurePage
          words={structureWords()}
          strongs={structureStrongs()}
          hasStructure={hasStructure()}
          loading={structureLoading()}
          selectedIndex={selectedStructureIndex()}
          setScrollRef={(element) => (structureScrollRef = element)}
        />
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
