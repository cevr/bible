// Upstream: packages/utils/src/useScrollLock.ts,
// packages/react/src/utils/useAnchoredPopupScrollLock.ts
//
// Locks the page's scroll while a modal popup is open. One lock is shared by
// every popup that asks (counted), taken and released on a timeout so a
// popup handing over to another does not flicker. With inset scrollbars the
// gutter is kept stable so the page does not shift; with overlay scrollbars
// (and on iOS) only `overflow: hidden` is set. A page some other code already
// locked is left alone until that lock clears.
//
// An anchored popup opened by touch locks only when it spans nearly the whole
// viewport width, so a swipe outside can still scroll and dismiss.
import { isOverflowElement } from '@floating-ui/utils/dom';
import { type Accessor, createEffect } from 'solid-js';

import { addEventListener, ownerDocument, ownerWindow } from './dom.ts';
import { platform } from './platform.ts';
import { AnimationFrame, Timeout } from './timers.ts';

type StyleSnapshot = Record<string, string>;

let originalHtmlStyles: StyleSnapshot = {};
let originalBodyStyles: StyleSnapshot = {};
let originalHtmlScrollBehavior = '';

function getViewportScroller(html: HTMLElement, body: HTMLElement) {
  return isOverflowElement(html) ? html : body;
}

function isPageScrollLocked(win: Window, html: HTMLElement, body: HTMLElement) {
  return /hidden|clip/.test(win.getComputedStyle(getViewportScroller(html, body)).overflowY);
}

function hasInsetScrollbars(referenceElement: Element | null) {
  const doc = ownerDocument(referenceElement);
  const win = ownerWindow(doc.documentElement);
  return win.innerWidth - doc.documentElement.clientWidth > 0;
}

function supportsStableScrollbarGutter(referenceElement: Element | null) {
  const supported =
    typeof CSS !== 'undefined' && CSS.supports && CSS.supports('scrollbar-gutter', 'stable');
  if (!supported) {
    return false;
  }
  const doc = ownerDocument(referenceElement);
  const html = doc.documentElement;
  const scrollContainer = getViewportScroller(html, doc.body);
  const originalOverflowY = scrollContainer.style.overflowY;
  const originalGutter = html.style.scrollbarGutter;

  html.style.scrollbarGutter = 'stable';
  scrollContainer.style.overflowY = 'scroll';
  const before = scrollContainer.offsetWidth;
  scrollContainer.style.overflowY = 'hidden';
  const after = scrollContainer.offsetWidth;

  scrollContainer.style.overflowY = originalOverflowY;
  html.style.scrollbarGutter = originalGutter;
  return before === after;
}

function preventScrollOverlayScrollbars(referenceElement: Element | null) {
  const doc = ownerDocument(referenceElement);
  // A lock on <body> does nothing when <html> scrolls, and the reverse shifts sticky elements.
  const elementToLock = getViewportScroller(doc.documentElement, doc.body);
  const original = {
    overflowY: elementToLock.style.overflowY,
    overflowX: elementToLock.style.overflowX,
  };
  Object.assign(elementToLock.style, { overflowY: 'hidden', overflowX: 'hidden' });
  return () => {
    Object.assign(elementToLock.style, original);
  };
}

function preventScrollInsetScrollbars(referenceElement: Element | null) {
  const doc = ownerDocument(referenceElement);
  const html = doc.documentElement;
  const body = doc.body;
  const win = ownerWindow(html);

  let scrollTop = 0;
  let scrollLeft = 0;
  let updateGutterOnly = false;
  const resizeFrame = new AnimationFrame();

  // Pinch-zoom in Safari shifts the page under a lock, so a zoomed page is left unlocked.
  if (platform.engine.webkit && (win.visualViewport?.scale ?? 1) !== 1) {
    return () => {};
  }

  function lockScroll() {
    // DOM reads first.
    const htmlStyles = win.getComputedStyle(html);
    const bodyStyles = win.getComputedStyle(body);
    const htmlGutter = htmlStyles.scrollbarGutter || '';
    const scrollbarGutterValue = htmlGutter.includes('both-edges') ? 'stable both-edges' : 'stable';

    scrollTop = html.scrollTop;
    scrollLeft = html.scrollLeft;

    originalHtmlStyles = {
      scrollbarGutter: html.style.scrollbarGutter,
      overflowY: html.style.overflowY,
      overflowX: html.style.overflowX,
    };
    originalHtmlScrollBehavior = html.style.scrollBehavior;
    originalBodyStyles = {
      position: body.style.position,
      height: body.style.height,
      width: body.style.width,
      boxSizing: body.style.boxSizing,
      overflowY: body.style.overflowY,
      overflowX: body.style.overflowX,
      scrollBehavior: body.style.scrollBehavior,
    };

    const isScrollableY = html.scrollHeight > html.clientHeight;
    const isScrollableX = html.scrollWidth > html.clientWidth;
    const hasConstantOverflowY =
      htmlStyles.overflowY === 'scroll' || bodyStyles.overflowY === 'scroll';
    const hasConstantOverflowX =
      htmlStyles.overflowX === 'scroll' || bodyStyles.overflowX === 'scroll';
    const scrollbarWidth = Math.max(0, win.innerWidth - body.clientWidth);
    const scrollbarHeight = Math.max(0, win.innerHeight - body.clientHeight);
    const marginY = parseFloat(bodyStyles.marginTop) + parseFloat(bodyStyles.marginBottom);
    const marginX = parseFloat(bodyStyles.marginLeft) + parseFloat(bodyStyles.marginRight);
    const elementToLock = getViewportScroller(html, body);

    updateGutterOnly = supportsStableScrollbarGutter(referenceElement);

    // DOM writes only from here.
    if (updateGutterOnly) {
      html.style.scrollbarGutter = scrollbarGutterValue;
      elementToLock.style.overflowY = 'hidden';
      elementToLock.style.overflowX = 'hidden';
      return;
    }

    Object.assign(html.style, {
      scrollbarGutter: scrollbarGutterValue,
      overflowY: 'hidden',
      overflowX: 'hidden',
    });
    if (isScrollableY || hasConstantOverflowY) {
      html.style.overflowY = 'scroll';
    }
    if (isScrollableX || hasConstantOverflowX) {
      html.style.overflowX = 'scroll';
    }
    Object.assign(body.style, {
      position: 'relative',
      height:
        marginY || scrollbarHeight ? `calc(100dvh - ${marginY + scrollbarHeight}px)` : '100dvh',
      width: marginX || scrollbarWidth ? `calc(100vw - ${marginX + scrollbarWidth}px)` : '100vw',
      boxSizing: 'border-box',
      overflowY: 'hidden',
      overflowX: 'hidden',
      scrollBehavior: 'unset',
    });
    body.scrollTop = scrollTop;
    body.scrollLeft = scrollLeft;
    html.setAttribute('data-base-ui-scroll-locked', '');
    html.style.scrollBehavior = 'unset';
  }

  function cleanup() {
    Object.assign(html.style, originalHtmlStyles);
    Object.assign(body.style, originalBodyStyles);
    if (!updateGutterOnly) {
      html.scrollTop = scrollTop;
      html.scrollLeft = scrollLeft;
      html.removeAttribute('data-base-ui-scroll-locked');
      html.style.scrollBehavior = originalHtmlScrollBehavior;
    }
  }

  function handleResize() {
    cleanup();
    resizeFrame.request(lockScroll);
  }

  lockScroll();
  const unsubscribeResize = addEventListener(win, 'resize', handleResize);

  return () => {
    resizeFrame.cancel();
    cleanup();
    unsubscribeResize();
  };
}

class ScrollLocker {
  lockCount = 0;
  restore: (() => void) | null = null;
  timeoutLock = new Timeout();
  timeoutUnlock = new Timeout();

  acquire(referenceElement: Element | null) {
    this.lockCount += 1;
    if (this.lockCount === 1 && this.restore === null) {
      this.timeoutLock.start(0, () => this.lock(referenceElement));
    }
    return this.release;
  }

  release = () => {
    this.lockCount -= 1;
    if (this.lockCount === 0 && this.restore) {
      this.timeoutUnlock.start(0, this.unlock);
    }
  };

  private unlock = () => {
    if (this.lockCount === 0 && this.restore) {
      this.restore();
      this.restore = null;
    }
  };

  private lock(referenceElement: Element | null) {
    if (this.lockCount === 0 || this.restore !== null) {
      return;
    }
    const doc = ownerDocument(referenceElement);
    const html = doc.documentElement;
    const body = doc.body;
    const win = ownerWindow(html);

    // Someone else locked the page: wait for that lock to clear rather than snapshot it.
    if (isPageScrollLocked(win, html, body)) {
      const observer = new win.MutationObserver(() => {
        if (isPageScrollLocked(win, html, body)) {
          return;
        }
        observer.disconnect();
        this.restore = null;
        this.lock(referenceElement);
      });
      observer.observe(html, { attributes: true });
      observer.observe(body, { attributes: true });
      this.restore = () => observer.disconnect();
      return;
    }

    const hasOverlayScrollbars = platform.os.ios || !hasInsetScrollbars(referenceElement);
    this.restore = hasOverlayScrollbars
      ? preventScrollOverlayScrollbars(referenceElement)
      : preventScrollInsetScrollbars(referenceElement);
  }
}

const SCROLL_LOCKER = new ScrollLocker();

/** Locks the page's scroll while `enabled()` is true. */
export function useScrollLock(
  enabled: Accessor<boolean>,
  referenceElement: Accessor<Element | null> = () => null,
): void {
  createEffect(
    () => [enabled(), referenceElement()] as const,
    ([isEnabled, reference]) => {
      if (!isEnabled) {
        return undefined;
      }
      return SCROLL_LOCKER.acquire(reference);
    },
  );
}

// Up to 20px of total horizontal gutter still counts as full width.
const VIEWPORT_WIDTH_TOLERANCE_PX = 20;

/**
 * The scroll lock of an anchored popup: always when opened by mouse or
 * keyboard; when opened by touch, only if the popup is nearly viewport-wide.
 */
export function useAnchoredPopupScrollLock(
  enabled: Accessor<boolean>,
  touchOpen: Accessor<boolean>,
  positionerElement: Accessor<HTMLElement | null>,
  referenceElement: Accessor<Element | null>,
): void {
  const touchOpenShouldLock = () => {
    const positioner = positionerElement();
    if (!enabled() || !touchOpen() || positioner == null) {
      return false;
    }
    const viewportWidth = ownerDocument(positioner).documentElement.clientWidth;
    const popupWidth = positioner.offsetWidth;
    return (
      viewportWidth > 0 &&
      popupWidth > 0 &&
      popupWidth >= viewportWidth - VIEWPORT_WIDTH_TOLERANCE_PX
    );
  };
  useScrollLock(() => enabled() && (!touchOpen() || touchOpenShouldLock()), referenceElement);
}
