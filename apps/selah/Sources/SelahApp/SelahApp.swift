import AppKit
import SwiftUI

@main
struct SelahApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
  @State private var store = Store()
  var body: some Scene {
    Window("Selah", id: "practice") {
      RootView(store: store, delegate: delegate, compact: false)
        .frame(minWidth: 480, idealWidth: 620, maxWidth: .infinity, minHeight: 620)
    }
    .defaultSize(width: 620, height: 760)
    .windowResizability(.contentMinSize)
    MenuBarExtra {
      RootView(store: store, delegate: delegate, compact: true)
        .frame(width: 420, height: 620)
    } label: {
      Image(systemName: "book.closed").accessibilityLabel("Selah Bible memory")
    }
    .menuBarExtraStyle(.window)
  }
}
