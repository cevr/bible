declare module 'virtual:hymnal' {
  const hymns: ReadonlyArray<import('./hymns/text').HymnText>;
  export default hymns;
}
