// Footage, as the page and the server both name it: a source is a derived
// file set of the footage library (`<name>/<sha12>`: a take or a clip, by
// the content of its original), and each source has two copies the pages
// read: the mezzanine the render conforms from (full size, H.264), and the
// proxy the lab and the phone play (720 px wide, short key-frame gaps). One
// URL per copy, `/footage/<name>/<sha12>/<copy>.mp4`, answered by range.

/** The copy of a source a page reads: the render the mezzanine, the lab the proxy. */
export type FootageCopy = 'mezzanine' | 'proxy';

/** The URL of `source`'s `copy`. */
export const footageHref = (source: string, copy: FootageCopy): string =>
  `/footage/${source}/${copy}.mp4`;
