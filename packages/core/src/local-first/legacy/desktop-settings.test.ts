import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';

import { MigrationDiagnosticId } from '../legacy-migration.js';
import { projectDesktopSettings } from './desktop-settings.js';

const nextDiagnosticId = (path: string) =>
  Schema.decodeSync(MigrationDiagnosticId)(`desktop-settings:${path}`);

describe('desktop settings legacy projection', () => {
  test('separates portable reading preferences from device presentation and stale keys', () => {
    const result = projectDesktopSettings(
      {
        theme: 'sepia',
        fontFamily: 'sans',
        fontSize: '2xl',
        lineHeight: 52,
        letterSpacing: 0.02,
        lineWidth: 72,
        inlineStrongs: false,
        inlineMarginNotes: true,
        inlineCrossRefs: false,
        uiScale: 'lg',
        recentDocuments: [{ path: '/tmp/study.md', title: 'Study' }],
        progressByPath: { '/tmp/study.md': 0.5 },
        debugDumpSegments: true,
        bibleDrawerWidth: 420,
        bibleStudyTab: 'words',
        readerMode: 'egw',
      },
      { nextDiagnosticId },
    );

    expect(result.commands).toEqual([
      {
        _tag: 'SetReadingPreferences',
        preferences: expect.objectContaining({
          colorMode: 'sepia',
          readerTypeface: 'system-sans',
          fontSizePx: 26,
          lineHeightRatio: 2,
          letterSpacingEm: 0.02,
          measureCh: 72,
          showStrongs: false,
          showMarginNotes: true,
          showCrossReferences: false,
        }),
      },
    ]);
    expect(result.deviceState).toMatchObject({ uiScale: 'lg', bibleDrawerWidth: 420 });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ path: 'readerMode', category: 'discarded' }),
    );
  });

  test('keeps valid fields when sibling fields are malformed or out of range', () => {
    const result = projectDesktopSettings(
      {
        theme: 'dark',
        fontFamily: 42,
        lineHeight: 0.5,
        letterSpacing: 9,
        lineWidth: 20,
        inlineStrongs: false,
      },
      { nextDiagnosticId },
    );
    const command = result.commands[0];

    expect(command?._tag).toBe('SetReadingPreferences');
    if (command?._tag !== 'SetReadingPreferences') return;
    expect(command.preferences.colorMode).toBe('dark');
    expect(command.preferences.showStrongs).toBe(false);
    expect(command.preferences.readerTypeface).toBe('crimson-pro');
    expect(result.diagnostics.map((entry) => entry.path)).toEqual(
      expect.arrayContaining(['fontFamily', 'lineHeight', 'letterSpacing', 'lineWidth']),
    );
  });

  test('quarantines a malformed root without inventing a preference mutation', () => {
    const result = projectDesktopSettings('not-an-object', { nextDiagnosticId });
    expect(result.commands).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ path: '$', category: 'malformed' }),
    ]);
  });
});
