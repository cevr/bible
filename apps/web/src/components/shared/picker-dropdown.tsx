import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Generic dropdown panel with click-outside and Escape to close.
 * Used by book/chapter pickers in both Bible and EGW routes.
 */
export function PickerDropdown({
  children,
  onClose,
  className,
}: {
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKey, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`absolute top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-background shadow-xl ${className ?? 'left-0 w-56'}`}
    >
      {children}
    </div>
  );
}
