import { Suspense } from 'react';
import { Outlet } from 'react-router';
import { DbProvider } from './providers/db-provider';
import { BibleProvider } from './providers/bible-provider';
import { KeyboardProvider } from './providers/keyboard-provider';
import { OverlayProvider } from './providers/overlay-provider';
import { AppShell } from './components/layout/app-shell';
import { CommandPalette } from './components/shared/command-palette';
import { GotoDialog } from './components/shared/goto-dialog';
import { SearchOverlay } from './components/shared/search-overlay';
import { BookmarksPanel } from './components/shared/bookmarks-panel';
import { HistoryPanel } from './components/shared/history-panel';
import { SettingsPanel } from './components/shared/settings-panel';
import { ExportPanel } from './components/shared/export-panel';
import { ReadingStyleProvider } from './components/shared/reading-style-provider';

export default function App() {
  return (
    <DbProvider>
      <BibleProvider>
        <KeyboardProvider>
          <OverlayProvider>
            <AppShell>
              <Suspense>
                <ReadingStyleProvider />
              </Suspense>
              <Outlet />
              <CommandPalette />
              <GotoDialog />
              <SearchOverlay />
              <BookmarksPanel />
              <HistoryPanel />
              <SettingsPanel />
              <ExportPanel />
            </AppShell>
          </OverlayProvider>
        </KeyboardProvider>
      </BibleProvider>
    </DbProvider>
  );
}
