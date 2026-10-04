// Fixture for film/keys-through-keymap: each line marked RED fires the rule,
// and nothing else does.

declare const el: HTMLElement;
declare const hear: () => void;
declare const kind: string;

export const Keyed = () => (
  <div>
    <input onKeyDown={hear} /> {/* // RED film/keys-through-keymap */}
    <div onkeyup={hear} /> {/* // RED film/keys-through-keymap */}
    <div onContextMenu={hear} /> {/* // RED film/keys-through-keymap */}
    <b onClick={hear} onKeyPress={hear} /> {/* // RED film/keys-through-keymap */}
  </div>
);

el.addEventListener('keydown', hear); // RED film/keys-through-keymap
el.addEventListener('contextmenu', hear); // RED film/keys-through-keymap
document.addEventListener('contextmenu', hear); // RED film/keys-through-keymap

// A click, a pointer and an input are not keys.
el.addEventListener('click', hear);
el.addEventListener('input', hear);
// The host's key events are film/host-events-through-adapter's, not this rule's.
window.addEventListener('resize', hear);
// A name the rule cannot read is not judged.
el.addEventListener(kind, hear);
