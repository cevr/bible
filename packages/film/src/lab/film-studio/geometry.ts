// The studio's sizes, in CSS pixels: the rows of its timeline, the header,
// the transport and the inspector beside the viewer. The stylesheet
// (`style.ts`) is written from these, and the page sums the timeline's
// rows from the same numbers (`timelineHeight`), so the grid's timeline row
// is as tall as what it holds.

import { Boolean as Bool } from 'effect';
import type { Lane } from '../../core/timeline-schema.ts';

/** A size for the laptop and the phone. */
interface Sized {
  readonly wide: number;
  readonly phone: number;
}

/** `size` at the window's size: the phone's on a phone, else the laptop's. */
const sized = (size: Sized, phone: boolean): number =>
  Bool.match(phone, { onTrue: () => size.phone, onFalse: () => size.wide });

export const HEADER_H = 44;
/** The room round the laptop's panels (`--s-4`). */
const GUTTER = 16;
export const TRANSPORT_H: Sized = { wide: 56, phone: 60 };
/** The flag strip above the ruler. */
export const FLAGS_H: Sized = { wide: 16, phone: 18 };
export const RULER_H = 22;
/** The act bands' strip. */
export const BAND_H = 22;
/** A lane of text clips (the script, the voice, the sound, the renders). */
export const TEXT_LANE_H: Sized = { wide: 40, phone: 44 };
/** A lane of pictures (the Board, the scenes). */
export const PICTURE_LANE_H: Sized = { wide: 52, phone: 54 };
export const NEXT_H = 30;
/** The line that stands in the timeline's row while it is read, or why it could not be. */
export const STATUS_H = 56;
/** The lane heads' column, on the laptop only. */
export const HEAD_W = 112;
/** The inspector beside the viewer (layout C). */
export const INSPECTOR_W = 460;
/** The phone's opening zoom: film seconds this many pixels wide, so a beat reads. */
export const PHONE_PX_PER_SECOND = 2.4;

/** Whether a lane draws pictures: its clips are taller. */
export const pictureLane = (lane: Lane): boolean =>
  lane.track === 'board' || lane.track === 'scenes';

/** A lane's height at the window's size. */
export const laneHeight = (lane: Lane, phone: boolean): number =>
  sized(
    Bool.match(pictureLane(lane), { onTrue: () => PICTURE_LANE_H, onFalse: () => TEXT_LANE_H }),
    phone,
  );

/**
 * The timeline's row: its flag strip, ruler and bands, each lane shown and
 * the Next row (each line drawn inside its own height), the panel's two
 * edges, and the room under the panel (`under`: the laptop's gutter, none
 * on a phone).
 */
export const timelineHeight = (lanes: ReadonlyArray<Lane>, next: boolean, phone: boolean): number =>
  sized(FLAGS_H, phone) +
  RULER_H +
  BAND_H +
  lanes.reduce((sum, lane) => sum + laneHeight(lane, phone), 0) +
  Bool.match(next, { onTrue: () => NEXT_H, onFalse: () => 0 }) +
  2 +
  sized({ wide: GUTTER, phone: 0 }, phone);
