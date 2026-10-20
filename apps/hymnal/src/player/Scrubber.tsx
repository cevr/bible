/**
 * The web's position bar: the browser's own range input, in the accent. A
 * drag shows as it goes and seeks when the reader lets go (pointer up, or
 * a key's release).
 */

import { useAccent } from '~/color';

import { type ScrubberProps, useScrub } from './scrub';

export function Scrubber(props: ScrubberProps) {
  const accent = useAccent();
  const scrub = useScrub(props);
  return (
    <input
      type="range"
      aria-label="Position"
      aria-valuetext={scrub.said}
      min={0}
      max={scrub.max}
      step={1}
      value={scrub.value}
      disabled={scrub.still}
      onChange={(event) => scrub.change(Number(event.currentTarget.value))}
      onPointerUp={scrub.commit}
      onKeyUp={scrub.commit}
      style={{ width: '100%', margin: 0, accentColor: String(accent) }}
    />
  );
}
