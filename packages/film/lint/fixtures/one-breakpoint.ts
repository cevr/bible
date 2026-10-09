// Fixture for film/one-breakpoint: each line marked RED fires the rule, and
// nothing else does.

declare const PHONE: string;
declare const WIDE: string;
declare const PHONE_WIDEST: number;

export const wide = '@media (min-width: 900px) { .x { padding: 0; } }'; // RED film/one-breakpoint
export const phone = `@media (max-width:899px) { .x { margin: 0; } }`; // RED film/one-breakpoint
export const asked = matchMedia('(max-width: 600px)'); // RED film/one-breakpoint
export const spaced = '@media ( min-width : 900px ) { .x { padding: 0; } }'; // RED film/one-breakpoint
export const spacedEnd = `@media (min-width: 900px ) { .x { padding: 0; } }`; // RED film/one-breakpoint
export const ranged = '@media (width >= 900px) { .x { padding: 0; } }'; // RED film/one-breakpoint
export const rangedTemplate = `@media (width < 900px) and ${PHONE} { .x { margin: 0; } }`; // RED film/one-breakpoint
export const rangedFirst = matchMedia('(900px <= width)'); // RED film/one-breakpoint
export const between = `(400px < width <= 899px)`; // RED film/one-breakpoint
export const exact = '(width: 56.25em)'; // RED film/one-breakpoint

// Asked through the owner, or built from its one number, passes.
export const through = `@media ${PHONE} { .x { margin: 0; } } @media ${WIDE} { .x { padding: 0; } }`;
export const built = `(max-width: ${PHONE_WIDEST}px)`;
// A width that is no media query passes.
export const sized = '.x { max-width: 900px; }';
// A feature query asks whether a declaration parses, not how wide the window is.
export const supported = '@supports (width: 900px) { .x { padding: 0; } }';
export const supportedTemplate = `@supports ( max-width : 899px ) and (display: grid) { .x { margin: 0; } }`;
// A media query after a feature query's block is still a breakpoint.
export const after =
  '@supports (width: 1px) { .x { margin: 0; } } @media (min-width: 900px) { .x { padding: 0; } }'; // RED film/one-breakpoint
