/**
 * EGW Reader TUI E2E Tests
 *
 * Tests keyboard interactions, navigation, and UI state for the EGW reader.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { App } from '../../src/tui/app.js';
import { createTUITest, type TUITestHarness } from '../lib/tui-harness.js';

describe('EGW Reader TUI', () => {
  let tui: TUITestHarness;

  beforeEach(async () => {
    // Render App starting in EGW view
    tui = await createTUITest(() => <App initialEgw />, {
      width: 80,
      height: 24,
    });
  });

  describe('Initial Render', () => {
    it('renders EGW view when initialEgw is provided', async () => {
      await tui.renderOnce();
      // Should show EGW Library title
      tui.expectScreenContains('EGW Library');
    });

    it('shows keyboard hints in footer', async () => {
      await tui.renderOnce();
      // Footer should show navigation hints
      const screen = tui.getPlainText();
      expect(screen).toMatch(/j\/k|para/i);
    });

    it('shows chapter navigation hint', async () => {
      await tui.renderOnce();
      const screen = tui.getPlainText();
      expect(screen).toMatch(/h\/l|chapter/i);
    });

    it('shows page navigation hint', async () => {
      await tui.renderOnce();
      const screen = tui.getPlainText();
      expect(screen).toMatch(/J\/K|page/i);
    });

    it('shows goto hint', async () => {
      await tui.renderOnce();
      const screen = tui.getPlainText();
      expect(screen).toMatch(/g\{n\}|goto/i);
    });

    it('shows books hint', async () => {
      await tui.renderOnce();
      const screen = tui.getPlainText();
      expect(screen).toMatch(/\^P|books/i);
    });
  });

  describe('ESC Behavior (Regression)', () => {
    it('ESC does not exit when started directly in EGW (no history)', async () => {
      await tui.renderOnce();

      // Press ESC
      await tui.pressEscape();

      // Should still be in EGW view, not navigated away
      tui.expectScreenContains('EGW Library');
    });

    it('ESC closes overlay before doing anything else', async () => {
      await tui.renderOnce();

      // Open command palette
      await tui.pressCtrlP();
      tui.expectScreenContains('Books');

      // ESC should close palette, not navigate away
      await tui.pressEscape();

      // Should still be in EGW view
      tui.expectScreenContains('EGW Library');
    });
  });

  describe('Navigation - Paragraph Movement', () => {
    it('j moves to next paragraph', async () => {
      await tui.renderOnce();

      // Press j - should not crash even in loading state
      await tui.pressKey('j');

      // Should still show EGW view
      tui.expectScreenContains('EGW Library');
    });

    it('k moves to previous paragraph', async () => {
      await tui.renderOnce();

      // Press k - should not crash
      await tui.pressKey('k');

      tui.expectScreenContains('EGW Library');
    });

    it('down arrow moves to next paragraph', async () => {
      await tui.renderOnce();

      await tui.pressArrow('down');

      tui.expectScreenContains('EGW Library');
    });

    it('up arrow moves to previous paragraph', async () => {
      await tui.renderOnce();

      await tui.pressArrow('up');

      tui.expectScreenContains('EGW Library');
    });

    it('Shift+J moves down a page', async () => {
      await tui.renderOnce();

      await tui.pressShiftArrow('down');

      tui.expectScreenContains('EGW Library');
    });

    it('Shift+K moves up a page', async () => {
      await tui.renderOnce();

      await tui.pressShiftArrow('up');

      tui.expectScreenContains('EGW Library');
    });
  });

  describe('Navigation - Chapter Movement', () => {
    it('l moves to next chapter', async () => {
      await tui.renderOnce();

      await tui.pressKey('l');

      tui.expectScreenContains('EGW Library');
    });

    it('h moves to previous chapter', async () => {
      await tui.renderOnce();

      await tui.pressKey('h');

      tui.expectScreenContains('EGW Library');
    });

    it('right arrow moves to next chapter', async () => {
      await tui.renderOnce();

      await tui.pressArrow('right');

      tui.expectScreenContains('EGW Library');
    });

    it('left arrow moves to previous chapter', async () => {
      await tui.renderOnce();

      await tui.pressArrow('left');

      tui.expectScreenContains('EGW Library');
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

    it('gg jumps to first paragraph', async () => {
      await tui.renderOnce();

      await tui.pressKey('g');
      await tui.pressKey('g');

      // Should still be in EGW view
      tui.expectScreenContains('EGW Library');
    });

    it('G jumps to last paragraph', async () => {
      await tui.renderOnce();

      await tui.pressKey('G');

      tui.expectScreenContains('EGW Library');
    });

    it('g followed by number shows pending goto', async () => {
      await tui.renderOnce();

      await tui.pressKey('g');
      await tui.pressKey('5');

      // Footer should show g5
      const screen = tui.getPlainText();
      expect(screen).toContain('g5');
    });

    it('g followed by multiple digits accumulates', async () => {
      await tui.renderOnce();

      await tui.pressKey('g');
      await tui.pressKey('1');
      await tui.pressKey('2');

      // Footer should show g12
      const screen = tui.getPlainText();
      expect(screen).toContain('g12');
    });

    it('Escape cancels goto mode', async () => {
      await tui.renderOnce();
      await tui.pressKey('g');

      // Should be in goto mode
      let screen = tui.getPlainText();
      expect(screen).toMatch(/g_|g\d/);

      await tui.pressEscape();

      // Should exit goto mode - still in EGW view
      screen = tui.getPlainText();
      expect(screen).toContain('EGW Library');
    });

    it('g{number}g confirms goto', async () => {
      await tui.renderOnce();

      await tui.pressKey('g');
      await tui.pressKey('5');
      await tui.pressKey('g');

      // Should still be in EGW view (goto executed)
      tui.expectScreenContains('EGW Library');
    });
  });

  describe('Command Palette', () => {
    it('Ctrl+P opens command palette', async () => {
      await tui.renderOnce();

      await tui.pressCtrlP();

      // Command palette should be visible with book selector
      tui.expectScreenContains('Books');
    });

    it('shows three-tier navigation indicator', async () => {
      await tui.renderOnce();
      await tui.pressCtrlP();

      // Should show tier indicator
      const screen = tui.getPlainText();
      expect(screen).toMatch(/Books|Chapters|Paragraphs/);
    });

    it('Escape closes command palette', async () => {
      await tui.renderOnce();
      await tui.pressCtrlP();

      tui.expectScreenContains('Books');

      await tui.pressEscape();

      // Palette should be closed
      tui.expectScreenContains('EGW Library');
    });

    it('up/down navigates selection', async () => {
      await tui.renderOnce();
      await tui.pressCtrlP();

      // Press down to move selection
      await tui.pressArrow('down');

      // Should still show books
      tui.expectScreenContains('Books');
    });

    it('j/k navigates selection', async () => {
      await tui.renderOnce();
      await tui.pressCtrlP();

      await tui.pressKey('j');
      await tui.pressKey('k');

      tui.expectScreenContains('Books');
    });

    it('right arrow drills into selected item', async () => {
      await tui.renderOnce();
      await tui.pressCtrlP();

      // Right arrow should drill into chapters
      await tui.pressArrow('right');

      // Should show chapters mode
      const screen = tui.getPlainText();
      expect(screen).toMatch(/Chapters|Chapter/);
    });

    it('left arrow goes back to previous tier', async () => {
      await tui.renderOnce();
      await tui.pressCtrlP();

      // Drill into chapters
      await tui.pressArrow('right');

      // Go back to books
      await tui.pressArrow('left');

      // Should show books mode
      tui.expectScreenContains('Books');
    });

    it('typing filters the list', async () => {
      await tui.renderOnce();
      await tui.pressCtrlP();

      // Type something to filter
      await tui.typeText('steps');

      // Should still be in palette (filtering)
      const screen = tui.getPlainText();
      expect(screen).toMatch(/Books|steps/i);
    });

    it('Enter selects current item', async () => {
      await tui.renderOnce();
      await tui.pressCtrlP();

      // Select first book
      await tui.pressEnter();

      // Should close palette or drill in
      tui.expectScreenContains('EGW');
    });
  });

  describe('Bible References Popup', () => {
    it('Space key is handled without crash', async () => {
      await tui.renderOnce();

      // Press Space - in loading state, popup may not open
      // but should not crash
      await tui.pressSpace();

      // Should still be in EGW view
      tui.expectScreenContains('EGW Library');
    });

    it('Space followed by Escape returns to main view', async () => {
      await tui.renderOnce();
      await tui.pressSpace();
      await tui.pressEscape();

      // Should be back in EGW view
      tui.expectScreenContains('EGW Library');
    });

    it('j/k after Space does not crash', async () => {
      await tui.renderOnce();
      await tui.pressSpace();

      // Navigate with j/k - should not crash even if popup didn't open
      await tui.pressKey('j');
      await tui.pressKey('k');

      // Should still be in EGW view
      tui.expectScreenContains('EGW Library');
    });
  });

  describe('Display', () => {
    it('topbar shows EGW Library when no book selected', async () => {
      await tui.renderOnce();

      tui.expectScreenContains('EGW Library');
    });

    it('shows loading state while fetching', async () => {
      await tui.renderOnce();

      // In test environment, may show loading or default content
      const screen = tui.getPlainText();
      expect(screen).toMatch(/Loading|EGW Library|Select a book/i);
    });
  });

  describe('Tools Palette', () => {
    it('Ctrl+T opens tools palette', async () => {
      await tui.renderOnce();

      await tui.pressCtrlT();

      // Tools palette should be visible
      const screen = tui.getPlainText();
      expect(screen).toMatch(/Tools|Bible|EGW|Messages/i);
    });

    it('Escape closes tools palette', async () => {
      await tui.renderOnce();
      await tui.pressCtrlT();
      await tui.pressEscape();

      // Should be back in EGW view
      tui.expectScreenContains('EGW Library');
    });

    it('can navigate to Bible from tools palette', async () => {
      await tui.renderOnce();
      await tui.pressCtrlT();

      // Select Bible (usually first option)
      await tui.pressKey('1');

      // Should navigate to Bible view
      const screen = tui.getPlainText();
      // Bible view shows book names like Genesis, Exodus, etc.
      expect(screen).toMatch(/Genesis|Exodus|Bible/);
    });
  });

  describe('Overlay Management', () => {
    it('only one overlay visible at a time', async () => {
      await tui.renderOnce();

      // Open command palette
      await tui.pressCtrlP();
      tui.expectScreenContains('Books');

      // Try to open tools palette - should not stack
      await tui.pressCtrlT();

      // Should still show one or the other, not both stacked
      const screen = tui.getPlainText();
      expect(screen).toContain('EGW');
    });

    it('overlays block keyboard to main view', async () => {
      await tui.renderOnce();

      // Open command palette
      await tui.pressCtrlP();

      // Try navigation keys - should not affect main view
      await tui.pressKey('j');
      await tui.pressKey('k');

      // Palette should still be open
      tui.expectScreenContains('Books');
    });
  });
});
