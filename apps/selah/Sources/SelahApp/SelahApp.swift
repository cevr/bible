import AppKit
import SwiftUI

@main
struct SelahApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
  @State private var store = Store()
  var body: some Scene {
    Window("Selah", id: "practice") {
      RootView(store: store, delegate: delegate)
        .frame(minWidth: 640, idealWidth: 900, maxWidth: .infinity, minHeight: 560)
    }
    .defaultSize(width: 900, height: 780)
    .windowResizability(.contentMinSize)
    .windowToolbarStyle(.unified)
    .commands {
      CommandGroup(replacing: .appSettings) {
        Button("Settings…") { store.section = .settings }.keyboardShortcut(",")
      }
      CommandMenu("Go") {
        ForEach(Array([Pane.today, .passages, .promises].enumerated()), id: \.element) {
          index, pane in
          Button(pane.title) { store.section = pane }
            .keyboardShortcut(KeyEquivalent(Character("\(index + 1)")))
        }
      }
    }
    MenuBarExtra {
      MenuBarView(store: store)
    } label: {
      Image(systemName: "book.closed").accessibilityLabel("Selah Bible memory")
    }
    .menuBarExtraStyle(.window)
  }
}
