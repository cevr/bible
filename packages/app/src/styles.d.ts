/** A stylesheet imported as text.
 *
 *  Bun's `with { type: 'text' }` hands the file over as a string, which is what
 *  lets `reading/study-pane-state.test.ts` assert that the JS breakpoint and the
 *  CSS breakpoint state the same rule instead of trusting two copies of a number
 *  to stay equal. Declared the same way `apps/desktop/src/sql.d.ts` declares
 *  `*.sql`: tsc has no opinion about import attributes, so the module's shape has
 *  to be stated once, here.
 *
 *  The app never imports CSS for its side effect — `styles.css` is linked by each
 *  host's HTML — so the text form is the only one this package needs. */
declare module '*.css' {
  const stylesheet: string;
  export default stylesheet;
}
