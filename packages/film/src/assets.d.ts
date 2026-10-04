// A font file a browser module imports: the bundler answers its URL (`player/face.ts`).
declare module '*.woff2' {
  const url: string;
  export default url;
}
