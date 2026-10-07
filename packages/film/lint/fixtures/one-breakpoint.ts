// Fixture for film/one-breakpoint: each line marked RED fires the rule, and
// nothing else does.

declare const PHONE: string;
declare const WIDE: string;
declare const PHONE_WIDEST: number;

export const wide = '@media (min-width: 900px) { .x { padding: 0; } }'; // RED film/one-breakpoint
export const phone = `@media (max-width:899px) { .x { margin: 0; } }`; // RED film/one-breakpoint
export const asked = matchMedia('(max-width: 600px)'); // RED film/one-breakpoint

// Asked through the owner, or built from its one number, passes.
export const through = `@media ${PHONE} { .x { margin: 0; } } @media ${WIDE} { .x { padding: 0; } }`;
export const built = `(max-width: ${PHONE_WIDEST}px)`;
// A width that is no media query passes.
export const sized = '.x { max-width: 900px; }';
