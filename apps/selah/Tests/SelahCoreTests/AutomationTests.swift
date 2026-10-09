import Foundation
import Testing

@testable import SelahCore

private var utc: Calendar {
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = TimeZone(secondsFromGMT: 0)!
  return calendar
}
private func date(_ hour: Int, _ minute: Int = 0) -> Date {
  utc.date(from: DateComponents(year: 2026, month: 10, day: 9, hour: hour, minute: minute))!
}
@Test func overnightQuietHoursRespectReadinessAndEndBoundary() {
  var preferences = Preferences()
  preferences.reminderMinutes = 30
  #expect(
    ReminderSchedule.invitation(
      now: date(21, 45), readyAt: date(21, 45), preferences: preferences, calendar: utc)
      == date(8).addingTimeInterval(86400))
  #expect(
    ReminderSchedule.invitation(
      now: date(7, 30), readyAt: date(7, 30), preferences: preferences, calendar: utc) == date(8))
  #expect(
    ReminderSchedule.invitation(
      now: date(8), readyAt: date(12), preferences: preferences, calendar: utc) == date(12))
  preferences.quietStartMinutes = 12 * 60
  preferences.quietEndMinutes = 14 * 60
  #expect(
    ReminderSchedule.invitation(
      now: date(11, 45), readyAt: date(11, 45), preferences: preferences, calendar: utc) == date(14)
  )
  preferences.quietHoursEnabled = false
  #expect(
    ReminderSchedule.invitation(
      now: date(11, 45), readyAt: date(11, 45), preferences: preferences, calendar: utc)
      == date(12, 15))
}
@Test func quietHourEndInDSTGapMovesToNextValidTime() {
  var calendar = utc
  calendar.timeZone = TimeZone(identifier: "America/Montreal")!
  let before = calendar.date(from: DateComponents(year: 2026, month: 3, day: 8, hour: 0))!
  var preferences = Preferences()
  preferences.quietEndMinutes = 150
  let invitation = ReminderSchedule.invitation(
    now: before, readyAt: before, preferences: preferences, calendar: calendar)
  #expect(calendar.component(.hour, from: invitation) == 3)
  #expect(!ReminderSchedule.isQuiet(at: invitation, preferences: preferences, calendar: calendar))
}
@Test func dailyBackupsAreImmutableAndKeepOnlyThirtySnapshots() throws {
  let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    .appendingPathComponent("progress.json")
  defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
  let file = ProgressFile(url: url)
  var library = Library()
  try file.save(library)
  let original = try Data(contentsOf: url)
  try file.backup(now: date(12), calendar: utc)
  library.preferences.newPerDay = 9
  try file.save(library)
  try file.backup(now: date(13), calendar: utc)
  let first = file.backupDirectory.appendingPathComponent("2026-10-09.json")
  #expect(try Data(contentsOf: first) == original)
  for day in 1...30 {
    try file.backup(now: date(12).addingTimeInterval(Double(day) * 86400), calendar: utc)
  }
  let snapshots = try FileManager.default.contentsOfDirectory(
    at: file.backupDirectory, includingPropertiesForKeys: nil)
  #expect(snapshots.count == 30)
  #expect(!FileManager.default.fileExists(atPath: first.path))
  #expect(try file.load().preferences.newPerDay == 9)
}

@Test func failedBackupDoesNotDiscardARecordedProgressChange() async throws {
  let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    .appendingPathComponent("progress.json")
  defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
  let file = ProgressFile(url: url)
  try file.save(Library())
  // A real filesystem collision makes the backup location unavailable, while progress remains writable.
  try Data("occupied".utf8).write(to: file.backupDirectory)
  let repository = ProgressRepository(file: file)
  #expect(throws: (any Error).self) { try file.backup(now: date(12), calendar: utc) }
  _ = try await repository.update {
    $0.goals.append(Goal(title: "Psalms 23", book: 19, chapter: 23))
  }
  #expect(try file.load().goals.first?.title == "Psalms 23")
}
