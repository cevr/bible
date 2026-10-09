import AppKit
import SwiftUI

@main
struct SelahApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
  @State private var store = Store()
  var body: some Scene {
    Window("Selah", id: "practice") {
      RootView(store: store, delegate: delegate, compact: false)
        .frame(minWidth: 480, idealWidth: 560, maxWidth: .infinity, minHeight: 650)
    }
    .defaultSize(width: 560, height: 720)
    .windowStyle(.hiddenTitleBar)
    .windowResizability(.contentMinSize)
    MenuBarExtra {
      RootView(store: store, delegate: delegate, compact: true)
        .frame(width: 400, height: 580)
    } label: {
      Image(systemName: "book.closed").accessibilityLabel("Selah Bible memory")
    }
    .menuBarExtraStyle(.window)
  }
}
