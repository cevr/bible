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
 * stack frames: an error keeps its message, which is all a case reads.
 * React reads the console as its modules load, so `page.tsx` imports this
 * module before React.
 */

Reflect.deleteProperty(console, 'createTask');
Reflect.deleteProperty(console, 'timeStamp');
// React sets the limit to ten around each capture and puts it back after; the page keeps it at none.
Object.defineProperty(Error, 'stackTraceLimit', { get: () => 0, set() {} });
