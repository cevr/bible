import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { lazy, Suspense } from 'react';
import App from './App';
import './styles/app.css';

const BibleRoute = lazy(() => import('./routes/bible'));
const EgwRoute = lazy(() => import('./routes/egw'));
const SearchRoute = lazy(() => import('./routes/search'));
const PlansRoute = lazy(() => import('./routes/plans'));
const PracticeRoute = lazy(() => import('./routes/practice'));
const TopicsRoute = lazy(() => import('./routes/topics'));

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <BrowserRouter>
    <Routes>
      <Route element={<App />}>
        <Route path="/" element={<Navigate to="/bible" replace />} />
        <Route
          path="/bible/:book?/:chapter?/:verse?"
          element={
            <Suspense fallback={<FallbackScreen />}>
              <BibleRoute />
            </Suspense>
          }
        />
        <Route
          path="/egw/:bookCode?/:page?/:para?"
          element={
            <Suspense fallback={<FallbackScreen />}>
              <EgwRoute />
            </Suspense>
          }
        />
        <Route
          path="/search"
          element={
            <Suspense fallback={<FallbackScreen />}>
              <SearchRoute />
            </Suspense>
          }
        />
        <Route
          path="/plans"
          element={
            <Suspense fallback={<FallbackScreen />}>
              <PlansRoute />
            </Suspense>
          }
        />
        <Route
          path="/practice"
          element={
            <Suspense fallback={<FallbackScreen />}>
              <PracticeRoute />
            </Suspense>
          }
        />
        <Route
          path="/topics"
          element={
            <Suspense fallback={<FallbackScreen />}>
              <TopicsRoute />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  </BrowserRouter>,
);

function FallbackScreen() {
  return (
    <div className="flex h-dvh w-full items-center justify-center">
      <div className="text-muted-foreground animate-pulse">Loading…</div>
    </div>
  );
}
