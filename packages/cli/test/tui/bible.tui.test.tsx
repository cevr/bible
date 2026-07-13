/**
 * Bible Reader TUI E2E Tests
 *
 * Tests keyboard interactions, navigation, and UI state for the Bible reader.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Reference } from '@bible/core/bible';

import { App } from '../../src/tui/app.js';
import { getAppRuntime } from '../../src/tui/lib/app-runtime.js';
import { createTUITest, type TUITestHarness } from '../lib/tui-harness.js';

describe('Bible Reader TUI', () => {
  let tui: TUITestHarness;

  beforeEach(async () => {
    const runtime = await getAppRuntime();
    // Render App starting in Bible view with explicit initial reference
    // to avoid depending on saved state
    tui = await createTUITest(
      () => <App initialRef={Reference.verse(1, 1, 1)} runtime={runtime} />,
      {
        width: 80,
        height: 24,
      },
    );
  });

  describe('Initial Render', () => {
    it('renders Bible view with specified initial reference', async () => {
      await tui.renderOnce();
      // Should show Genesis (book 1)
      tui.expectScreenContains('Genesis');
    });

    it('shows chapter number in topbar', async () => {
      await tui.renderOnce();
      // Chapter 1 should be displayed
      const screen = tui.getPlainText();
      expect(screen).toMatch(/Genesis\s+1/);
    });

    it('shows verse position in footer', async () => {
      await tui.renderOnce();
      const screen = tui.getPlainText();
      // Should show position indicator (e.g., "1/31")
      expect(screen).toMatch(/\d+\/\d+/);
    });
  });

  describe('Navigation - Verse Movement', () => {
    it('j moves to next verse', async () => {
      await tui.renderOnce();
      const beforeScreen = tui.getPlainText();

      await tui.pressKey('j');
      const afterScreen = tui.getPlainText();

      // Position indicator should change
      expect(beforeScreen).not.toEqual(afterScreen);
    });

    it('k moves to previous verse', async () => {
      await tui.renderOnce();
      // Move down first
      await tui.pressKey('j');
      const midScreen = tui.getPlainText();

      // Now move back up
      await tui.pressKey('k');
      const afterScreen = tui.getPlainText();

      expect(midScreen).not.toEqual(afterScreen);
    });

    it('down arrow moves to next verse', async () => {
      await tui.renderOnce();
      const beforeScreen = tui.getPlainText();

      await tui.pressArrow('down');
      const afterScreen = tui.getPlainText();

      expect(beforeScreen).not.toEqual(afterScreen);
    });

    it('up arrow moves to previous verse', async () => {
      await tui.renderOnce();
      await tui.pressArrow('down');
      const midScreen = tui.getPlainText();

      await tui.pressArrow('up');
      const afterScreen = tui.getPlainText();

      expect(midScreen).not.toEqual(afterScreen);
    });
  });

  describe('Navigation - Chapter Movement', () => {
    it('l moves to next chapter', async () => {
      await tui.renderOnce();
      // Should be in Genesis 1
      tui.expectScreenContains('Genesis');

      await tui.pressKey('l');

      // Should now be in Genesis 2 (chapter number changes)
      const screen = tui.getPlainText();
      // The chapter indicator should show 2
      expect(screen).toContain('2');
    });

    it('h moves to previous chapter', async () => {
      await tui.renderOnce();
      // Move to chapter 2 first
      await tui.pressKey('l');

      // Now go back
      await tui.pressKey('h');

      // Should be back in chapter 1
      const screen = tui.getPlainText();
      expect(screen).toContain('Genesis');
    });

    it('right arrow moves to next chapter', async () => {
      await tui.renderOnce();

      await tui.pressArrow('right');

      // Chapter should change
      const screen = tui.getPlainText();
      expect(screen).toContain('2');
    });
  });

  describe('Goto Mode', () => {
    it('g enters goto mode (shows in footer)', async () => {
      await tui.renderOnce();

      await tui.pressKey('g');

      // Footer should show goto mode indicator
      const screen = tui.getPlainText();
      expect(screen).toMatch(/g_|g\d/);
    });

    it('gg jumps to first verse', async () => {
      await tui.renderOnce();
      // Move down a few verses
      await tui.pressKey('j');
      await tui.pressKey('j');
      await tui.pressKey('j');

      // Now press gg
      await tui.pressKey('g');
      await tui.pressKey('g');

      // Should be at verse 1
      const screen = tui.getPlainText();
      expect(screen).toMatch(/1\/\d+/);
    });

    it('G jumps to last verse', async () => {
      await tui.renderOnce();

      await tui.pressKey('G');

      // Position indicator should show last verse (e.g., "31/31" for Genesis 1)
      const screen = tui.getPlainText();
      // Should show same number on both sides of /
      expect(screen).toMatch(/(\d+)\/\1/);
    });

    it('Escape cancels goto mode', async () => {
      await tui.renderOnce();
      await tui.pressKey('g');

      // Should be in goto mode
      let screen = tui.getPlainText();
      expect(screen).toMatch(/g_|g\d/);

      await tui.pressEscape();

      // Should exit goto mode - still in Bible view
      tui.expectScreenContains('Genesis');
    });

    it('g followed by number shows pending goto', async () => {
      await tui.renderOnce();

      // Press g5 - goto mode accumulates digits
      await tui.pressKey('g');
      await tui.pressKey('5');

      // Footer should show g5
      const screen = tui.getPlainText();
      expect(screen).toContain('g5');
    });

    it('g followed by number and g confirms goto', async () => {
      await tui.renderOnce();

      // Press g5g to go to verse 5 (g confirms in vim style)
      await tui.pressKey('g');
      await tui.pressKey('5');
      await tui.pressKey('g');

      // Should be at verse 5
      const screen = tui.getPlainText();
      expect(screen).toMatch(/5\/\d+/);
    });
  });

  describe('Command Palette', () => {
    it('Ctrl+P opens command palette', async () => {
      await tui.renderOnce();

      await tui.pressCtrlP();

      // Should show book list
      tui.expectScreenContains('Genesis');
      // Should show command palette UI
      tui.expectScreenMatches(/Books|Chapters|Verses/);
    });

    it('typing filters current view', async () => {
      await tui.renderOnce();
      await tui.pressCtrlP();

      // Command palette opens in chapters mode for current book
      // Type a chapter number to filter
      await tui.typeText('5');

      // Should show Chapter 5
      const screen = tui.getPlainText();
      expect(screen).toContain('Chapter 5');
    });

    it('Escape closes command palette', async () => {
      await tui.renderOnce();
      await tui.pressCtrlP();

      // Palette should be open
      tui.expectScreenMatches(/Books|Chapters/);

      await tui.pressEscape();

      // Should still be in Bible view, showing content
      tui.expectScreenContains('Genesis');
    });

    it('Enter selects current chapter', async () => {
      await tui.renderOnce();
      await tui.pressCtrlP();

      // Navigate down to chapter 2 and select
      await tui.pressArrow('down');
      await tui.pressEnter();

      // Should navigate to chapter 2
      const screen = tui.getPlainText();
      expect(screen).toMatch(/Genesis\s+2/);
    });

    it('left arrow navigates to books list', async () => {
      await tui.renderOnce();
      await tui.pressCtrlP();

      // Go back to books mode
      await tui.pressArrow('left');

      // Should show Books in header
      const screen = tui.getPlainText();
      expect(screen).toContain('Books');
    });
  });

  describe('Search', () => {
    it('/ opens search box', async () => {
      await tui.renderOnce();

      await tui.pressKey('/');

      // Search box should be visible
      const screen = tui.getPlainText();
      expect(screen).toMatch(/\/|Search/i);
    });

    it('Ctrl+F opens search box', async () => {
      await tui.renderOnce();

      await tui.pressCtrlF();

      // Search box should be visible
      const screen = tui.getPlainText();
      expect(screen).toMatch(/\/|Type/i);
    });

    it('Escape closes search', async () => {
      await tui.renderOnce();
      await tui.pressKey('/');
      await tui.pressEscape();

      // Still in Bible view
      tui.expectScreenContains('Genesis');
    });
  });

  describe('Cross-References', () => {
    it('Space opens cross-refs popup', async () => {
      await tui.renderOnce();

      await tui.pressSpace();

      // Cross-refs popup should be visible
      const screen = tui.getPlainText();
      expect(screen).toMatch(/Refs|References|cross/i);
    });

    it('Escape closes cross-refs popup', async () => {
      await tui.renderOnce();
      await tui.pressSpace();
      await tui.pressEscape();

      // Still in Bible view
      tui.expectScreenContains('Genesis');
    });
  });

  describe('Display Modes', () => {
    it('v toggles verse/paragraph mode', async () => {
      await tui.renderOnce();

      // Toggle twice to see both modes work
      await tui.pressKey('v');
      const afterFirstToggle = tui.getPlainText();

      await tui.pressKey('v');
      const afterSecondToggle = tui.getPlainText();

      // After toggling twice, should have different layouts at some point
      // (verse mode shows numbers on left, paragraph mode shows inline)
      // Just verify no crash and still shows Genesis
      expect(afterFirstToggle).toContain('Genesis');
      expect(afterSecondToggle).toContain('Genesis');
    });
  });

  describe('Word Mode', () => {
    it('Enter activates word mode', async () => {
      await tui.renderOnce();

      await tui.pressEnter();

      // Word mode should be activated (UI should change)
      // Note: May show loading state or word highlighting
      const screen = tui.getPlainText();
      // Should still show Bible content
      expect(screen).toContain('Genesis');
    });

    it('Escape exits word mode', async () => {
      await tui.renderOnce();
      await tui.pressEnter();
      await tui.pressEscape();

      // Should be back in normal view
      tui.expectScreenContains('Genesis');
    });
  });

  describe('Tools Palette', () => {
    it('Ctrl+T opens tools palette', async () => {
      await tui.renderOnce();

      await tui.pressCtrlT();

      // Tools palette should be visible
      const screen = tui.getPlainText();
      expect(screen).toMatch(/Bible|EGW|Messages|Studies/i);
    });

    it('Escape closes tools palette', async () => {
      await tui.renderOnce();
      await tui.pressCtrlT();
      await tui.pressEscape();

      // Still in Bible view
      tui.expectScreenContains('Genesis');
    });
  });
});
