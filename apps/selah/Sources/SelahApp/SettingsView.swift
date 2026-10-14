import AppKit
import SelahCore
import SelahSpeech
import ServiceManagement
import SwiftUI

struct SettingsView: View {
  @Bindable var store: Store
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
          "\(store.library.preferences.newPerDay) new verses per day",
          value: Binding(
            get: { store.library.preferences.newPerDay },
            set: { value in
              Task { await store.change { $0.preferences.newPerDay = value } }
            }), in: 1...20)
        LabeledContent("Scheduler", value: "FSRS 6 · 90% retention")
        Text(
          "Whole chapters are one card each; a new one starts when the last stands without cues. Verse-by-verse chapters join review after every verse is recalled twice."
        ).font(.caption).foregroundStyle(.secondary)
      }
      Section {
        Toggle(
          "Dictate recall",
          isOn: Binding(
            get: { store.library.preferences.dictationEnabled },
            set: { value in
              store.dictation.stop()
              Task { await store.change { $0.preferences.dictationEnabled = value } }
            }))
        ForEach(DictationModel.allCases, id: \.self) { model in
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
            "Press Dictate during a recall and recite aloud; what the model hears fills your recall for comparison. Speech stays on this Mac. macOS stores Apple’s models and shares them with other apps."
          )
          if store.modelStates.values.contains(.installed) {
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
          "Show margin notes",
          isOn: Binding(
            get: { store.library.preferences.showMarginNotes },
            set: { value in
              Task { await store.change { $0.preferences.showMarginNotes = value } }
            }))
        Text(
          "Notes stay collapsed until you open them. Keep them off for uninterrupted reading and recall."
        ).font(.caption).foregroundStyle(.secondary)
      }
      Section("Reminders") {
        Toggle(
          "Practice reminders",
          isOn: Binding(
            get: { store.library.preferences.remindersEnabled },
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
        Text(store.notificationStatus).font(.caption).foregroundStyle(.secondary)
        Text(
          "Invitations wait until practice is ready and quiet hours have ended. Selah never opens a window automatically for a reminder."
        ).font(.caption).foregroundStyle(.secondary)
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
        Toggle(
          "Daily progress backups",
          isOn: Binding(
            get: { store.library.preferences.backupsEnabled },
            set: { value in
              Task {
                if await store.change({ $0.preferences.backupsEnabled = value }) {
                  await store.maintainBackup()
                }
              }
            }))
        Text(store.backupStatus).font(.caption).foregroundStyle(.secondary)
        Text("Keep the first snapshot each day for 30 days while Selah is running.").font(.caption)
          .foregroundStyle(.secondary)
        Button("Show Backups") { NSWorkspace.shared.open(store.file.backupDirectory) }
      }
      Section("Your data") {
        Button("Show Progress File") {
          NSWorkspace.shared.selectFile(store.file.url.path, inFileViewerRootedAtPath: "")
        }
        Button("Quit Selah") { NSApp.terminate(nil) }
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
  private var detail: String {
    switch model {
    case .appleSpeech: "Apple’s newest model, built for long recitations."
    case .appleDictation: "The model macOS dictation uses. Less accurate on the KJV’s older words."
    }
  }
  private var status: String {
    switch state {
    case .installed: "On this Mac"
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
      default:
        EmptyView()
      }
    }
  }
}
