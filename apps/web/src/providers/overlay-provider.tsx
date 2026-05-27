import { useState, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { OverlayContext, type OverlayType } from '@/providers/overlay-context';

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [overlay, setOverlay] = useState<OverlayType>('none');
  const [overlayData, setOverlayData] = useState<unknown>(null);
  const [returnFocusRef, setReturnFocusRef] = useState<HTMLElement | null>(null);
  // Keep a ref copy so closeOverlay can read the latest value synchronously
  const returnFocusRefLatest = useRef<HTMLElement | null>(null);
  returnFocusRefLatest.current = returnFocusRef;

  const openOverlay = useCallback((type: OverlayType, data?: unknown) => {
    const currentFocus = document.activeElement as HTMLElement | null;
    if (currentFocus) {
      setReturnFocusRef(currentFocus);
    }
    setOverlayData(data ?? null);
    setOverlay(type);
  }, []);

  const closeOverlay = useCallback(() => {
    const ref = returnFocusRefLatest.current;
    setOverlay('none');
    setOverlayData(null);
    if (ref && typeof ref.focus === 'function') {
      requestAnimationFrame(() => ref.focus());
    }
    setReturnFocusRef(null);
  }, []);

  const value = useMemo(
    () => ({ overlay, overlayData, openOverlay, closeOverlay }),
    [overlay, overlayData, openOverlay, closeOverlay],
  );

  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}
