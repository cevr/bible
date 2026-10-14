import AppKit
import SelahCore
import SwiftUI

struct RootView: View {
  @Bindable var store: Store
  let delegate: AppDelegate
  @Environment(\.openWindow) private var openWindow
  private var selection: Binding<Pane?> {
    Binding(get: { store.section }, set: { store.section = $0 ?? .today })
  }
  var body: some View {
    NavigationSplitView {
      List(selection: selection) {
        ForEach(Pane.allCases, id: \.self) { section in
          NavigationLink(value: section) {
            Label(section.title, systemImage: section.symbol)
          }
          .badge(section == .today && !store.sessionActive ? store.available.count : 0)
        }
      }
      .navigationSplitViewColumnWidth(min: 170, ideal: 190, max: 240)
    } detail: {
      VStack(spacing: 0) {
        if let error = store.error { ErrorBanner(message: error, file: store.file) }
        Group {
          if store.isLoading {
            ProgressView("Opening your Bible…").frame(maxWidth: .infinity, maxHeight: .infinity)
          } else {
            switch store.section {
            case .today:
              if store.sessionActive { PracticeView(store: store) } else { TodayView(store: store) }
            case .passages: PassagesView(store: store)
            case .promises: PromisesView(store: store)
            case .settings: SettingsView(store: store)
            }
          }
        }
        .disabled(store.isSaving || !store.canSave)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Palette.page)
      .toolbar {
        if store.isSaving {
          ToolbarItem(placement: .status) {
            ProgressView().controlSize(.small).accessibilityLabel("Saving")
          }
        }
      }
    }
    .preferredColorScheme(store.library.preferences.appearance.colorScheme)
    .onAppear {
      delegate.openPractice = {
        store.section = .today
        store.begin()
        openWindow(id: "practice")
        NSApp.activate()
      }
    }
    .onChange(of: store.section) { store.dictation.stop() }
    .onReceive(
      NotificationCenter.default.publisher(for: NSApplication.willResignActiveNotification)
    ) { _ in store.dictation.stop() }
    .onReceive(
      NSWorkspace.shared.notificationCenter.publisher(for: NSWorkspace.didWakeNotification)
    ) { _ in
      Task {
        await store.maintainReminders()
        await store.refreshReminders()
      }
    }
    .onReceive(NotificationCenter.default.publisher(for: .NSSystemTimeZoneDidChange)) { _ in
      Task { await store.refreshReminders() }
    }
  }
}

/// What happened, that saved progress is safe, and a way to inspect it.
struct ErrorBanner: View {
  let message: String
  let file: ProgressFile
  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: Space.s) {
      Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Palette.slipped)
        .accessibilityHidden(true)
      Text(message).font(.callout).frame(maxWidth: .infinity, alignment: .leading)
      Button("Show Progress File") {
        NSWorkspace.shared.selectFile(file.url.path, inFileViewerRootedAtPath: "")
      }
      .buttonStyle(.glass)
    }
    .padding(Space.m).groupSurface().padding([.horizontal, .top], Space.m)
  }
}

/// A centered reading column on the page.
struct Column<Content: View>: View {
  @ViewBuilder var content: Content
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: Space.l) { content }
        .frame(maxWidth: Measure.column, alignment: .leading)
        .padding(.horizontal, Space.xl).padding(.vertical, Space.l)
        .frame(maxWidth: .infinity)
    }
    .background(Palette.page)
  }
}
