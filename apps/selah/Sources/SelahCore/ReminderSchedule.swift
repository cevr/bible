import Foundation

public enum ReminderSchedule {
  public static func isQuiet(at date: Date, preferences: Preferences, calendar: Calendar = .current)
    -> Bool
  {
    guard preferences.quietHoursEnabled else { return false }
    let start = preferences.quietStartMinutes
    let end = preferences.quietEndMinutes
    guard start != end else { return false }
    let parts = calendar.dateComponents([.hour, .minute], from: date)
    let minute = parts.hour! * 60 + parts.minute!
    return start < end ? minute >= start && minute < end : minute >= start || minute < end
  }
  public static func invitation(
    now: Date, readyAt: Date, preferences: Preferences, calendar: Calendar = .current
  ) -> Date {
    let earliest = max(
      now.addingTimeInterval(Double(max(1, preferences.reminderMinutes)) * 60), readyAt)
    guard isQuiet(at: earliest, preferences: preferences, calendar: calendar) else {
      return earliest
    }
    // Calendar matching handles midnight, DST gaps and repeated hours in the user's current zone.
    return calendar.nextDate(
      after: earliest.addingTimeInterval(-1),
      matching: DateComponents(
        hour: preferences.quietEndMinutes / 60, minute: preferences.quietEndMinutes % 60),
      matchingPolicy: .nextTime, repeatedTimePolicy: .first) ?? earliest
  }
}
