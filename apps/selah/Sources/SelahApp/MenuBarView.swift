import AppKit
import SelahCore
import SwiftUI

/// A compact launcher. The popover's own material is the surface; controls are glass.
struct MenuBarView: View {
  @Bindable var store: Store
  @Environment(\.openWindow) private var openWindow

  private func openApp() {
    openWindow(id: "practice")
    NSApp.activate()
  }
  private var passage: Goal? { store.library.goals.first { $0.promises == nil } }

  var body: some View {
    VStack(alignment: .leading, spacing: Space.m) {
      HStack {
        Text("Selah").font(.headline)
        Spacer()
        if store.isLoading || store.isSaving {
          ProgressView().controlSize(.small).accessibilityLabel("Working")
        }
      }
      if store.isLoading {
        Text("Opening your Bible…").font(.callout).foregroundStyle(.secondary)
      } else if !store.canSave {
        Text("Selah could not open your progress. Open Selah for details.").font(.callout)
          .foregroundStyle(.secondary)
      } else {
        HStack(alignment: .firstTextBaseline, spacing: Space.xs) {
          Text("\(store.available.count)").font(.metric)
          Text("ready").foregroundStyle(.secondary)
          Spacer()
          Text("\(store.reviewedToday) today").font(.callout).foregroundStyle(.secondary)
            .monospacedDigit()
        }
        GlassEffectContainer(spacing: Space.xs) {
          VStack(spacing: Space.xs) {
            Button {
              store.section = .today
              if !store.sessionActive { store.begin() }
              openApp()
            } label: {
              Text(store.sessionActive ? "Continue Practice" : "Begin Practice")
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.glassProminent)
            .disabled(!store.sessionActive && store.available.isEmpty)
            if let passage {
              Button {
                store.reader.present(store: store, goal: passage, onPractice: openApp)
              } label: {
                Text("Read \(passage.title)").frame(maxWidth: .infinity)
              }
              .buttonStyle(.glass)
            } else {
              Button {
                store.section = .passages
                openApp()
              } label: {
                Text("Choose a Passage").frame(maxWidth: .infinity)
              }
              .buttonStyle(.glass)
            }
          }
          .controlSize(.large)
        }
        .disabled(store.isSaving)
      }
      Divider()
      HStack {
        Button("Open Selah", action: openApp)
        Spacer()
        Button("Quit") { NSApp.terminate(nil) }
      }
      .buttonStyle(.borderless).font(.callout)
    }
    .padding(Space.m).frame(width: 280)
    .preferredColorScheme(store.library.preferences.appearance.colorScheme)
  }
}
