declare module 'virtual:hymnal' {
  const hymns: ReadonlyArray<import('./hymns/text').HymnText>;
  export default hymns;
}

declare module 'virtual:hymnal-chords' {
  /** Each hymn's number and its chords' string (`src/hymns/chords.ts`), in number order. */
  const chords: ReadonlyArray<readonly [number, string]>;
  export default chords;
}
