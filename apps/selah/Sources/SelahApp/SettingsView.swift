import AppKit
import SelahCore
import SelahSpeech
import ServiceManagement
import SwiftUI

struct SettingsView: View {
  @Bindable var store: Store
  /// A status line as a sentence that another can follow.
  private func sentence(_ status: String) -> String {
    status.trimmingCharacters(in: CharacterSet(charactersIn: ". ")) + ". "
  }
  @State private var configuring = false
  @State private var readerSettings = false
  private func quietTime(start: Bool) -> Binding<Date> {
    Binding(
      get: {
        let minute =
          start
          ? store.library.preferences.quietStartMinutes : store.library.preferences.quietEndMinutes
        return Calendar.current.date(
          bySettingHour: minute / 60, minute: minute % 60, second: 0, of: Date())!
      },
      set: { date in
        let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
        let minute = parts.hour! * 60 + parts.minute!
        Task {
          await store.updateQuietHours {
            if start { $0.quietStartMinutes = minute } else { $0.quietEndMinutes = minute }
          }
        }
      })
  }
  var body: some View {
    Form {
      Section("Practice") {
        Stepper(
          "\(store.library.preferences.newPerDay) new verses and promises per day",
          value: Binding(
            get: { store.library.preferences.newPerDay },
            set: { value in
              Task { await store.change { $0.preferences.newPerDay = value } }
            }), in: 1...20)
      }
      Section {
        Toggle(
          isOn: Binding(
            get: { store.library.preferences.dictationEnabled },
            set: { value in
              store.dictation.stop()
              Task { await store.change { $0.preferences.dictationEnabled = value } }
            })
        ) {
          Text("Dictation")
          Text("Recite a recall aloud and compare what was heard.")
        }
        ForEach(LocalModels.offered, id: \.self) { model in
          ModelRow(store: store, model: model)
        }
        if let error = store.modelError {
          Text(error).font(.caption).foregroundStyle(.secondary)
        }
      } header: {
        Text("Dictation")
      } footer: {
        VStack(alignment: .leading, spacing: Space.xs) {
          Text(
            "Speech stays on this Mac. macOS stores Apple’s models and shares them with other apps."
          )
          if DictationModel.allCases.contains(where: {
            !$0.isLocal && store.modelStates[$0] == .installed
          }) {
            Button("Remove Apple Speech Models") { Task { await store.removeAppleModels() } }
              .buttonStyle(.link)
              .help(
                "Release Selah’s claim on the English models. macOS deletes them later unless another app uses them."
              )
          }
        }
        .font(.caption).foregroundStyle(.secondary)
      }
      Section("Reading") {
        Picker(
          "Appearance",
          selection: Binding(
            get: { store.library.preferences.appearance },
            set: { value in Task { await store.change { $0.preferences.appearance = value } } })
        ) {
          ForEach(Appearance.allCases, id: \.self) { Text($0.title) }
        }
        .pickerStyle(.segmented)
        LabeledContent("Typography") {
          HStack(spacing: Space.s) {
            Text(
              "\(store.library.preferences.reader.font.rawValue) · \(Int(store.library.preferences.reader.size)) pt"
            )
            .foregroundStyle(.secondary).monospacedDigit()
            Button("Reader Settings…") { readerSettings = true }
          }
        }
        Toggle(
          isOn: Binding(
            get: { store.library.preferences.showMarginNotes },
            set: { value in
              Task { await store.change { $0.preferences.showMarginNotes = value } }
            })
        ) {
          Text("Show margin notes")
          Text("Notes stay collapsed until you open them.")
        }
      }
      Section {
        Toggle(
          "Practice reminders",
          isOn: Binding(
            get: { store.library.preferences.remindersEnabled && !store.notificationsBlocked },
            set: { enabled in
              configuring = true
              Task {
                await store.configureReminders(
                  enabled: enabled, minutes: store.library.preferences.reminderMinutes)
                configuring = false
              }
            })
        ).disabled(configuring)
        Picker(
          "Remind me every",
          selection: Binding(
            get: { store.library.preferences.reminderMinutes },
            set: { minutes in
              Task {
                await store.configureReminders(
                  enabled: store.library.preferences.remindersEnabled, minutes: minutes)
              }
            })
        ) {
          Text("30 minutes").tag(30)
          Text("1 hour").tag(60)
          Text("2 hours").tag(120)
          Text("4 hours").tag(240)
        }
        Toggle(
          "Quiet hours",
          isOn: Binding(
            get: { store.library.preferences.quietHoursEnabled },
            set: { value in
              Task { await store.updateQuietHours { $0.quietHoursEnabled = value } }
            }))
        if store.library.preferences.quietHoursEnabled {
          DatePicker("From", selection: quietTime(start: true), displayedComponents: .hourAndMinute)
          DatePicker(
            "Until", selection: quietTime(start: false), displayedComponents: .hourAndMinute)
          if store.library.preferences.quietStartMinutes
            == store.library.preferences.quietEndMinutes
          {
            Text("Choose different start and end times to pause reminders.").font(.caption)
              .foregroundStyle(.secondary)
          }
        }
        if store.notificationsBlocked {
          LabeledContent("Notifications are off for Selah") {
            Button("Open Notification Settings…") {
              if let url = URL(
                string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension")
              {
                NSWorkspace.shared.open(url)
              }
            }
          }
        }
      } header: {
        Text("Reminders")
      } footer: {
        Text(
          (store.notificationsBlocked ? "" : sentence(store.notificationStatus))
            + "Reminders wait until practice is ready and quiet hours have ended."
        )
        .font(.caption).foregroundStyle(.secondary)
      }
      Section("Automation") {
        Toggle(
          "Launch at login",
          isOn: Binding(
            get: { store.loginEnabled || store.loginNeedsApproval },
            set: { store.configureLogin(enabled: $0) }))
        if store.loginNeedsApproval {
          Text("macOS needs approval for Selah in Login Items.").font(.caption).foregroundStyle(
            .secondary)
          Button("Open Login Items Settings") { SMAppService.openSystemSettingsLoginItems() }
        }
        if let message = store.loginMessage {
          Text(message).font(.caption).foregroundStyle(.secondary)
        }
      }
      Section("Your data") {
        Toggle(
          isOn: Binding(
            get: { store.library.preferences.backupsEnabled },
            set: { value in
              Task {
                if await store.change({ $0.preferences.backupsEnabled = value }) {
                  await store.maintainBackup()
                }
              }
            })
        ) {
          Text("Daily progress backups")
          Text(sentence(store.backupStatus) + "The first snapshot each day is kept for 30 days.")
        }
        LabeledContent("Files") {
          HStack(spacing: Space.s) {
            Button("Show Backups") { NSWorkspace.shared.open(store.file.backupDirectory) }
            Button("Show Progress File") {
              NSWorkspace.shared.selectFile(store.file.url.path, inFileViewerRootedAtPath: "")
            }
          }
        }
      }
    }
    .formStyle(.grouped)
    .task { await store.refreshModels() }
    .scrollContentBackground(.hidden)
    .navigationTitle("Settings")
    .onAppear { store.refreshLoginStatus() }
    .sheet(isPresented: $readerSettings) { ReaderSettings(store: store) }
  }
}

/// One speech model: choose it, see whether it is on this Mac, and download it.
struct ModelRow: View {
  @Bindable var store: Store
  let model: DictationModel
  private var selected: Bool { store.library.preferences.dictationModel == model }
  private var state: ModelState? { store.modelStates[model] }
  @State private var confirmingDelete = false
  private var detail: String {
    switch model {
    case .appleSpeech: "Apple’s newest model, built for long recitations."
    case .appleDictation: "The model macOS dictation uses. Less accurate on the KJV’s older words."
    case .parakeetSmall: "NVIDIA Parakeet, 110 million parameters. Fast; transcribes when you stop."
    case .parakeetLarge:
      "NVIDIA Parakeet, 600 million parameters. Most accurate; transcribes when you stop."
    }
  }
  private var status: String {
    switch state {
    case .installed:
      store.modelSizes[model].map {
        "On this Mac · \($0.formatted(.byteCount(style: .file)))"
      } ?? "On this Mac"
    case .available: "Not downloaded"
    case .downloading(let fraction):
      "Downloading \(fraction.formatted(.percent.precision(.fractionLength(0))))"
    case .unsupported: "Not offered on this Mac"
    case nil: "Checking…"
    }
  }
  var body: some View {
    HStack(spacing: Space.s) {
      Button {
        Task { await store.change { $0.preferences.dictationModel = model } }
      } label: {
        HStack(alignment: .firstTextBaseline, spacing: Space.s) {
          Image(systemName: selected ? "checkmark.circle.fill" : "circle")
            .foregroundStyle(selected ? Color.accentColor : .secondary)
            .accessibilityHidden(true)
          VStack(alignment: .leading, spacing: Space.xxs) {
            Text(model.title)
            Text("\(status) · \(detail)").font(.caption).foregroundStyle(.secondary)
          }
          Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(state == .unsupported)
      .accessibilityAddTraits(selected ? .isSelected : [])
      .accessibilityHint(status)
      switch state {
      case .available:
        Button("Download") { Task { await store.install(model) } }
      case .downloading(let fraction):
        ProgressView(value: fraction).frame(width: 72).accessibilityLabel(status)
      case .installed where model.isLocal:
        Button("Delete…") { confirmingDelete = true }
          .confirmationDialog(
            "Delete \(model.title) from this Mac?", isPresented: $confirmingDelete,
            titleVisibility: .visible
          ) {
            Button("Delete", role: .destructive) { Task { await store.delete(model) } }
          } message: {
            Text("You can download it again from Settings.")
          }
      default:
        EmptyView()
      }
    }
  }
}
