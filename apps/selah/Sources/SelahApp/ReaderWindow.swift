import AppKit
import SelahCore
import SwiftUI

/// The reader is independent of the menu-bar popover and the practice window.
@MainActor
final class ReaderWindow: NSObject, NSWindowDelegate {
  private var window: NSWindow?

  func present(store: Store, goal: Goal, onPractice: @escaping () -> Void) {
    let screen = NSApp.keyWindow?.screen ?? NSScreen.main
    let reader: NSWindow
    if let window {
      reader = window
    } else {
      reader = NSWindow(
        contentRect: NSRect(x: 0, y: 0, width: 620, height: 760),
        styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered,
        defer: false)
      reader.isReleasedWhenClosed = false
      reader.delegate = self
      reader.minSize = NSSize(width: 480, height: 620)
      window = reader
    }
    reader.deminiaturize(nil)
    let desiredSize = reader.frame.size
    reader.title = "\(goal.title) · Selah"
    let hosting = NSHostingController(
      rootView: ReadingView(
        store: store, chapters: store.corpus.chapters(for: goal), title: goal.title,
        close: { [weak self] in self?.window?.close() }, onPractice: onPractice))
    hosting.sizingOptions = []
    reader.contentViewController = hosting
    if let screen {
      let visible = screen.visibleFrame
      let size = NSSize(
        width: min(desiredSize.width, visible.width),
        height: min(desiredSize.height, visible.height))
      reader.setFrame(
        NSRect(
          x: visible.midX - size.width / 2, y: visible.midY - size.height / 2,
          width: size.width, height: size.height), display: true)
    } else {
      reader.center()
    }
    reader.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  func windowWillClose(_ notification: Notification) {
    window?.contentViewController = nil
    window = nil
  }
}
