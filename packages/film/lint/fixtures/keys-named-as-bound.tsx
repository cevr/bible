// Fixture for film/keys-named-as-bound: each line marked RED fires the rule,
// and nothing else does.

declare const hub: { keysOf: (id: string) => ReadonlyArray<string> };
declare const button: HTMLButtonElement;
declare const named: (title: string, id: string) => string;
declare const key: string;

hub.keysOf('play.frame-next'); // RED film/keys-named-as-bound
button.title = 'Next frame (→)'; // RED film/keys-named-as-bound
button.title = `Undo (⌘Z)`; // RED film/keys-named-as-bound

export const Titled = () => (
  <div>
    <button title="Note frame (n)" /> {/* // RED film/keys-named-as-bound */}
    <button title={`Back (Esc), ${key}`} /> {/* // RED film/keys-named-as-bound */}
    <button title={'Loop (⇧L)'} /> {/* // RED film/keys-named-as-bound */}
    {/* A title that follows the keymap, and words in brackets that are no key, pass. */}
    <button title={named('Note frame', 'notes.frame')} />
    <button title="the selected cue (or this scene)" />
    <button title={`${key} (${key})`} />
  </div>
);

// Named again on every change of keys: no key written, none read here.
button.title = named('Next frame', 'play.frame-next');
// A label, not a title, is not judged.
button.ariaLabel = 'Next frame (→)';
