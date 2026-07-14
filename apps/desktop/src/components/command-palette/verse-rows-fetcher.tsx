import { type Component, createEffect } from 'solid-js';

import { ipc } from '../../runtime.js';

export const VerseRowsFetcher: Component<{
  readonly book: number;
  readonly chapter: number;
  readonly onVerses: (verses: readonly number[]) => void;
}> = (props) => {
  const chapterRes = ipc.bible.getChapter.query(() => ({
    book: props.book,
    chapter: props.chapter,
  }));
  createEffect(() => {
    const c = chapterRes();
    if (c === undefined || c === null) {
      props.onVerses([]);
      return;
    }
    props.onVerses(c.verses.map((v) => v.verse));
  });
  return null;
};
