/**
 * EGW reader route.
 *
 * Three states based on URL params:
 * 1. No bookCode -> Book list
 * 2. bookCode, no chapter -> Redirect to chapter 0
 * 3. bookCode + chapter -> Chapter reader view
 */
import { Suspense, useEffect, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';

import { BookListView } from './book-list';
import { ChapterReaderView } from './chapter-reader';
import { EgwErrorBoundary, EgwErrorFallback } from './error-boundary';

function EgwRoute() {
  const params = useParams<'bookCode' | 'page'>();

  const errorBoundary = (children: ReactNode) => (
    <EgwErrorBoundary fallback={(error, reset) => <EgwErrorFallback error={error} reset={reset} />}>
      {children}
    </EgwErrorBoundary>
  );

  if (params.bookCode && params.page) {
    return errorBoundary(
      <Suspense fallback={<p className="text-muted-foreground italic">Loading chapter…</p>}>
        <ChapterReaderView />
      </Suspense>,
    );
  }

  if (params.bookCode) {
    // bookCode present but no chapter — redirect to chapter 0
    return errorBoundary(
      <Suspense fallback={<p className="text-muted-foreground italic">Loading…</p>}>
        <RedirectToFirstChapter bookCode={params.bookCode} />
      </Suspense>,
    );
  }

  return (
    <Suspense fallback={<p className="text-muted-foreground italic">Loading books…</p>}>
      <BookListView />
    </Suspense>
  );
}

/** Redirects to chapter 0. */
function RedirectToFirstChapter({ bookCode }: { bookCode: string }) {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(`/egw/${bookCode}/0`, { replace: true });
  }, [bookCode, navigate]);

  return null;
}

export default EgwRoute;
