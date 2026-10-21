/**
 * The page's React is the development build, so hydration reports every
 * mismatch it finds, by message: an attribute mismatch on the console, a
 * text or tree mismatch as a recoverable error (`page.tsx` keeps both).
 * That build also traces for DevTools, which no case reads:
 * - it tags each element with a DevTools task (`console.createTask`);
 * - it marks each render on DevTools' timeline (`console.timeStamp`);
 * - it captures a stack of up to ten frames for each element it creates,
 *   for the component stacks DevTools shows.
 * A run of the file measured about 11 of its 60 CPU seconds in these, so
 * the page's console has neither function, and its errors capture no
 * stack: V8 reads `Error.stackTraceLimit` as a data property, finds none,
 * and leaves every error's `stack` undefined. An error keeps its message,
 * which is all a case reads. React's component and owner stacks then read
 * "Error generating stack: …": React builds them inside its own try/catch,
 * so it still delivers every report, with that text where the stack was.
 * Page code that reads `error.stack` must not assume a string.
 * React reads the console as its modules load, so `page.tsx` imports this
 * module before React.
 */

Reflect.deleteProperty(console, 'createTask');
Reflect.deleteProperty(console, 'timeStamp');
// React writes the limit around each capture, so the setter ignores it: a read-only value would make that write throw.
Object.defineProperty(Error, 'stackTraceLimit', { get: () => 0, set() {} });
