/* Re-export motion-dom's RAF-batched frameloop so callers don't pull from the
   underlying package directly. Lets us swap implementations later without
   churning import sites. */
export { frame, frameData, frameSteps, microtask, time } from 'motion-dom';
