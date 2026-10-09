// Fixture for film/host-events-through-adapter in JSX: a handler for an event
// that ends a press fires the rule on any element; each line marked RED
// fires it, and nothing else does.

declare const end: () => void;

export const Ended = () => (
  <div>
    <div onPointerUp={end} /> {/* // RED film/host-events-through-adapter */}
    <div onPointerCancel={end} /> {/* // RED film/host-events-through-adapter */}
    <div onLostPointerCapture={end} /> {/* // RED film/host-events-through-adapter */}
    <div onpointerup={end} /> {/* // RED film/host-events-through-adapter */}
    <div on:pointercancel={end} /> {/* // RED film/host-events-through-adapter */}
    {/* A press, a move and a click are the element's own. */}
    <div onPointerDown={end} onPointerMove={end} onClick={end} on:pointerdown={end} />
  </div>
);
