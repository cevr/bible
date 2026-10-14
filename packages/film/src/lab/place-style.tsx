// A place's own styles, carried by the place: drawn with it, on the server
// and on every way in (a link, a reload, the page's own navigation), and gone
// when the reader leaves it. The page's head holds what every place of the
// page shows; a rule only one place draws rides here instead, so it weighs on
// that place's first paint alone (`page-css-budget.test.ts` weighs both).

/** `css`, while the place that draws it shows. */
export const PlaceStyle = (props: { readonly css: string }) => (
  <style data-place-style innerHTML={props.css} />
);
