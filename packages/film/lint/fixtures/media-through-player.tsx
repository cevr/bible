// Fixture for film/media-through-player: each line marked RED fires the rule,
// and nothing else does.

declare const src: string;
declare const doc: { readonly createElement: (tag: string) => unknown };

export const heard = <audio controls src={src} />; // RED film/media-through-player
export const seen = <video muted src={src} />; // RED film/media-through-player
export const made = document.createElement('audio'); // RED film/media-through-player
export const madeOff = doc.createElement('video'); // RED film/media-through-player
export const voiced = new Audio(src); // RED film/media-through-player

// Another element, and a canvas made by hand, are no media element.
export const picture = <canvas />;
export const drawn = document.createElement('canvas');
