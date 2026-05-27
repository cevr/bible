/**
 * Stable context object and hooks for the overlay provider.
 *
 * Separated from overlay-provider.tsx so that hook consumers don't cause
 * HMR invalidation of the component (or vice versa).
 */
import { createContext, useContext } from 'react';

// ---------------------------------------------------------------------------
// Overlay type map — typed data per overlay
// ---------------------------------------------------------------------------

export interface SearchOverlayData {
  query?: string;
  onSearch?: (q: string) => void;
}

export interface BookmarksOverlayData {
  book: number;
  chapter: number;
  verse: number;
}

interface OverlayDataMap {
  search: SearchOverlayData;
  bookmarks: BookmarksOverlayData;
}

type OverlayWithData = keyof OverlayDataMap;
type OverlayWithoutData = 'command-palette' | 'goto-dialog' | 'history' | 'settings' | 'export';

export type OverlayType = 'none' | OverlayWithData | OverlayWithoutData;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface OverlayContextValue {
  overlay: OverlayType;
  overlayData: unknown;
  openOverlay: {
    <T extends OverlayWithData>(type: T, data: OverlayDataMap[T]): void;
    (type: OverlayWithoutData | OverlayWithData): void;
  };
  closeOverlay: () => void;
}

export const OverlayContext = createContext<OverlayContextValue | null>(null);

export function useOverlay() {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error('useOverlay must be used within an OverlayProvider');
  return ctx;
}

export function useOverlayData<T extends OverlayWithData>(type: T): OverlayDataMap[T] | null {
  const { overlay, overlayData } = useOverlay();
  if (overlay !== type) return null;
  return overlayData as OverlayDataMap[T];
}
