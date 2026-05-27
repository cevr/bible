/**
 * Constants shared between the study panel and the Bible route.
 *
 * Separated from verse-study-sheet.tsx so that constant consumers don't cause
 * HMR invalidation of the component (or vice versa).
 */
import type { MarkerColor } from '@/data/study/service';

/** Width of the study panel for layout coordination. */
export const STUDY_PANEL_WIDTH = 'sm:w-[28rem]';

export const MARKER_DOT_COLORS: Record<MarkerColor, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-400',
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
};
