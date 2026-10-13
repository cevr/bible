import AppKit
import SwiftUI

@main
struct SelahApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
  @State private var store = Store()
  var body: some Scene {
    Window("Selah", id: "practice") {
      RootView(store: store, delegate: delegate)
        .frame(minWidth: 480, idealWidth: 620, maxWidth: .infinity, minHeight: 620)
    }
    .defaultSize(width: 620, height: 760)
    .windowResizability(.contentMinSize)
    MenuBarExtra {
      MenuBarView(store: store)
    } label: {
      Image(systemName: "book.closed").accessibilityLabel("Selah Bible memory")
    }
    .menuBarExtraStyle(.window)
  }
}
