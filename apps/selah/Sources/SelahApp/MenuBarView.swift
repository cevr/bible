import AppKit
import SwiftUI

struct MenuBarView: View {
  @Bindable var store: Store
  @Environment(\.openWindow) private var openWindow

  private func openApp() {
    openWindow(id: "practice")
    NSApp.activate(ignoringOtherApps: true)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Label("Selah", systemImage: "book.closed").font(.headline)
        Spacer()
        if store.isLoading || store.isSaving { ProgressView().controlSize(.small) }
      }
      if store.isLoading {
        Text("Opening your Bible…").font(.callout).foregroundStyle(.secondary)
      } else if !store.canSave {
        Text("Selah needs attention. Open the app to view the details.").font(.callout)
          .foregroundStyle(.secondary)
      } else {
        Text("\(store.available.count) ready · \(store.reviewedToday) reviewed today")
          .font(.callout).foregroundStyle(.secondary)
        VStack(spacing: 8) {
          Button(store.sessionActive ? "Continue Practice" : "Begin Practice") {
            store.section = "Today"
            if !store.sessionActive { store.begin() }
            openApp()
          }.buttonStyle(QuietButton(primary: true))
            .disabled(!store.sessionActive && store.available.isEmpty)
          if let goal = store.library.goals.first {
            Button("Read \(goal.title)") {
              store.reader.present(store: store, goal: goal, onPractice: openApp)
            }.buttonStyle(QuietButton())
          } else {
            Button("Choose a Passage") {
              store.section = "Library"
              openApp()
            }.buttonStyle(QuietButton())
          }
        }.disabled(store.isSaving)
      }
      Divider()
      HStack {
        Button("Open Selah", action: openApp)
        Spacer()
        Button("Quit") { NSApp.terminate(nil) }
      }.buttonStyle(.borderless).font(.caption)
    }.padding(18).frame(width: 280).background(Color(nsColor: .windowBackgroundColor))
      .preferredColorScheme(.dark)
  }
}
