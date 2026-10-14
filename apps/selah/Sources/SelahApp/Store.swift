import AppKit
import CoreServices
import SelahCore
import SelahSpeech
import ServiceManagement
import SwiftUI
import UserNotifications

enum Pane: String, Hashable, CaseIterable {
  case today, passages, promises, settings
  var title: String {
    switch self {
    case .today: "Today"
    case .passages: "Passages"
    case .promises: "Promises"
    case .settings: "Settings"
    }
  }
  var symbol: String {
    switch self {
    case .today: "sun.horizon"
    case .passages: "books.vertical"
    case .promises: "text.book.closed"
    case .settings: "gearshape"
    }
  }
}

@MainActor @Observable
final class Store {
  var library = Library()
  var corpus = Corpus(verses: [])
  var readiness: Readiness?
  var error: String?
  var backupStatus = "Daily backups are enabled"
  var loginEnabled = SMAppService.mainApp.status == .enabled
  var loginNeedsApproval = SMAppService.mainApp.status == .requiresApproval
  var loginMessage: String?
  var notificationStatus = "Reminders are off"
  var canSave = true
  var isLoading = true
  var isSaving = false
  let dictation = Dictation()
  let reader = ReaderWindow()
  var rehearsalBook: String?
  var queue: [PracticeUnit] = []
  var sessionActive = false
  var completed = 0
  var sessionTotal = 0
  var revealed = false
  var studying = false
  var hinted = false
  var typedRecall = ""
  var section = Pane.today
  /// The open promise category, if any, within the Promises pane.
  var promisePath: [String] = []
  /// Cues for the current chapter's verses as the recall began.
  var cues: [Cue] = []
  /// Verse numbers whose first letters were shown during this recall.
  var peeked: Set<Int> = []
  /// Verse numbers that slipped: from the comparison, peeks, and the reciter's own marks.
  var slipped: Set<Int> = []
  var comparison: RecallComparison?
  var feedbackError: String?
  var isComparing = false
  private var feedbackTask: Task<Void, Never>?
  let file: ProgressFile
  private let repository: ProgressRepository
  private var revision = 0
  private var refreshingReminders = false
  private var remindersDirty = false

  init() {
    // SELAH_DATA_ROOT points a development build at a separate folder, away from real progress.
    let root =
      ProcessInfo.processInfo.environment["SELAH_DATA_ROOT"].map {
        URL(fileURLWithPath: $0, isDirectory: true)
      }
      ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("Selah")
    file = ProgressFile(url: root.appendingPathComponent("progress.json"))
    repository = ProgressRepository(file: file)
    Task { await load() }
    Task { [weak self] in
      while !Task.isCancelled {
        guard let self else { return }
        await self.maintainReminders()
        try? await Task.sleep(for: .seconds(30))
      }
    }
  }

  private func load() async {
    do {
      let loadedCorpus = try await Task.detached(priority: .userInitiated) {
        let packagedBundle = Bundle.main.url(forResource: "Selah_SelahApp", withExtension: "bundle")
          .flatMap { Bundle(url: $0) }
        guard
          let url = (packagedBundle ?? Bundle.module).url(forResource: "kjv", withExtension: "json")
        else {
          throw CocoaError(.fileNoSuchFile)
        }
        return Corpus(verses: try JSONDecoder().decode([Verse].self, from: Data(contentsOf: url)))
      }.value
      let loadedLibrary = try await repository.load()
      let snapshot = await Task.detached(priority: .userInitiated) {
        Readiness(library: loadedLibrary, corpus: loadedCorpus, now: Date())
      }.value
      corpus = loadedCorpus
      library = loadedLibrary
      readiness = snapshot
      isLoading = false
      await maintainBackup()
      refreshLoginStatus()
      await refreshReminders()
    } catch {
      self.error =
        "Could not load Selah: \(error.localizedDescription). Your saved file has been preserved."
      canSave = false
      isLoading = false
    }
  }

  var current: PracticeUnit? { queue.first }
  var available: [PracticeUnit] { readiness?.queue ?? [] }
  var dueCount: Int { readiness?.dueCount ?? 0 }
  var reviewedToday: Int { readiness?.reviewedToday ?? 0 }

  @discardableResult
  func change(_ operation: @Sendable (inout Library) throws -> Void) async -> Bool {
    guard canSave, !isLoading, !isSaving else { return false }
    isSaving = true
    defer { isSaving = false }
    do {
      let updated = try await repository.update(operation)
      let corpus = corpus
      let snapshot = await Task.detached(priority: .userInitiated) {
        Readiness(library: updated, corpus: corpus, now: Date())
      }.value
      library = updated
      readiness = snapshot
      revision += 1
      error = nil
      await maintainBackup()
      return true
    } catch {
      self.error =
        "Could not save progress: \(error.localizedDescription). Try again; this action has not been recorded."
      return false
    }
  }

  @discardableResult
  func add(_ goal: Goal) async -> Bool {
    guard await change({ $0.goals.append(goal) }) else { return false }
    await refreshReminders()
    return true
  }
  func begin() {
    guard !isLoading, !isSaving else { return }
    rehearsalBook = nil
    queue = available
    completed = 0
    sessionTotal = queue.count
    sessionActive = true
    resetRecall()
  }
  /// Where each speech model stands on this Mac, for Settings.
  private(set) var modelStates: [DictationModel: ModelState] = [:]
  func refreshModels() async {
    for model in DictationModel.allCases {
      if case .downloading = modelStates[model] { continue }
      modelStates[model] = await AppleModels.state(of: model)
    }
  }
  func install(_ model: DictationModel) async {
    modelStates[model] = .downloading(0)
    do {
      try await AppleModels.install(model) { [weak self] fraction in
        Task { @MainActor in
          if case .downloading = self?.modelStates[model] {
            self?.modelStates[model] = .downloading(fraction)
          }
        }
      }
      modelStates[model] = .installed
    } catch {
      modelStates[model] = await AppleModels.state(of: model)
      modelError = "Could not download \(model.title): \(error.localizedDescription)"
    }
    await refreshModels()
  }
  func removeAppleModels() async {
    dictation.stop()
    await AppleModels.remove()
    await refreshModels()
  }
  /// The last model download failure, shown under the models in Settings.
  var modelError: String?
  func addPromises(_ category: PromiseCategory) async {
    guard !library.goals.contains(where: { $0.promises == category.id }) else { return }
    await add(Goal(title: category.title, promises: category.id))
  }
  func setMethod(_ method: LearningMethod, for goal: Goal) async {
    let id = goal.id
    if await change({ library in
      guard let index = library.goals.firstIndex(where: { $0.id == id }) else { return }
      library.goals[index].method = method
    }) {
      await refreshReminders()
    }
  }
  func beginChapter(_ verses: [Verse]) {
    guard !isLoading, !isSaving, let first = verses.first,
      verses.count == corpus.verses(book: first.book, chapter: first.chapter).count
    else { return }
    rehearsalBook = nil
    queue = [PracticeUnit(verses: verses, isChapter: true)]
    completed = 0
    sessionTotal = 1
    sessionActive = true
    section = .today
    resetRecall()
  }
  func beginBook(_ book: Int) {
    guard !isLoading, !isSaving else { return }
    let rehearsal = corpus.bookRehearsal(book: book)
    guard !rehearsal.isEmpty else { return }
    queue = rehearsal
    rehearsalBook = queue.first?.verses.first?.bookName
    completed = 0
    sessionTotal = queue.count
    sessionActive = true
    section = .today
    resetRecall()
  }
  func endSession() {
    dictation.stop()
    feedbackTask?.cancel()
    sessionActive = false
  }
  func startDictation() {
    guard sessionActive, !revealed, library.preferences.dictationEnabled, let current else {
      return
    }
    let prefix = typedRecall.trimmingCharacters(in: .whitespacesAndNewlines)
    dictation.start(
      model: library.preferences.dictationModel,
      context: contextualWords(for: current.verses.map(\.practiceText))
    ) { [weak self] text in
      self?.typedRecall = prefix.isEmpty ? text : prefix + " " + text
    }
  }
  /// Reveals the passage. A running take finishes first so its last words count.
  func reveal() {
    guard dictation.phase != .finishing else { return }
    if dictation.active {
      Task {
        await dictation.finish()
        revealNow()
      }
    } else {
      revealNow()
    }
  }
  private func revealNow() {
    guard sessionActive, !revealed else { return }
    dictation.stop()
    revealed = true
    comparison = nil
    feedbackError = nil
    guard let current, !typedRecall.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return
    }
    let expected = current.verses.map(\.practiceText)
    let numbers = current.verses.map(\.number)
    let answer = typedRecall
    feedbackTask?.cancel()
    isComparing = true
    feedbackTask = Task {
      let result = await Task.detached(priority: .userInitiated) {
        Result { try RecallComparison(segments: expected, recalled: answer) }
      }.value
      guard !Task.isCancelled else { return }
      switch result {
      case .success(let feedback):
        comparison = feedback
        slipped.formUnion(feedback.slippedSegments.map { numbers[$0] })
      case .failure(let error): feedbackError = error.localizedDescription
      }
      isComparing = false
    }
  }
  func resetRecall() {
    dictation.stop()
    feedbackTask?.cancel()
    comparison = nil
    feedbackError = nil
    isComparing = false
    peeked = []
    slipped = []
    cues = current.map { library.cues(for: $0) } ?? []
    studying = current.map { library.cards[$0.id] == nil } ?? false
    revealed = studying
    hinted = false
    typedRecall = ""
  }
  /// Show a hidden verse's first letters during a chapter recall; the verse counts as slipped.
  func peek(_ verse: Verse) {
    peeked.insert(verse.number)
    slipped.insert(verse.number)
  }
  func toggleSlipped(_ verse: Verse) {
    if slipped.contains(verse.number) {
      slipped.remove(verse.number)
    } else {
      slipped.insert(verse.number)
    }
  }
  var allowedRatings: [RecallRating] {
    guard let current else { return [] }
    return library.allowedRatings(for: current, usedHint: hinted, peeked: peeked)
  }
  func rate(_ rating: RecallRating) async {
    guard let unit = current, revealed, !studying, !isSaving else { return }
    let usedHint = hinted
    let weak = slipped
    let peeked = peeked
    let now = Date()
    guard
      await change({
        try $0.record(
          unit, rating: rating, usedHint: usedHint, weakVerses: weak, peeked: peeked, now: now)
      })
    else {
      return
    }
    queue.removeFirst()
    completed += 1
    resetRecall()
    await refreshReminders()
  }
  func preview(_ rating: RecallRating) -> String {
    guard let verse = current else { return "" }
    return
      (try? Scheduler.intervalLabel(
        Scheduler.review(
          library.cards[verse.id] ?? MemoryCard(now: Date()), rating: rating, now: Date()
        )
        .interval)) ?? "—"
  }
  func configureReminders(enabled: Bool, minutes: Int) async {
    if enabled {
      do {
        let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [
          .alert, .sound,
        ])
        guard granted else {
          notificationStatus =
            "Allow Selah in System Settings → Notifications, then enable reminders again."
          _ = await change { $0.preferences.remindersEnabled = false }
          await refreshReminders()
          return
        }
      } catch {
        notificationStatus = error.localizedDescription
        return
      }
    }
    if await change({
      $0.preferences.remindersEnabled = enabled
      $0.preferences.reminderMinutes = minutes
    }) {
      await refreshReminders()
    }
  }
  func maintainReminders() async {
    guard !isLoading, !isSaving, canSave else { return }
    let library = library
    let corpus = corpus
    let before = revision
    let snapshot = await Task.detached(priority: .utility) {
      Readiness(library: library, corpus: corpus, now: Date())
    }.value
    guard revision == before, !isSaving else { return }
    readiness = snapshot
    await maintainBackup()
    guard library.preferences.remindersEnabled else { return }
    let pending = await UNUserNotificationCenter.current().pendingNotificationRequests()
    if !pending.contains(where: { $0.identifier == "selah.practice" }) { await refreshReminders() }
  }
  func maintainBackup() async {
    do {
      if let day = try await repository.dailyBackup() {
        backupStatus = "Daily snapshot saved · \(day.formatted(date: .abbreviated, time: .omitted))"
      } else {
        backupStatus = "Daily backups are off"
      }
    } catch { backupStatus = "Backup could not be saved: \(error.localizedDescription)" }
  }
  func updateQuietHours(_ operation: @Sendable (inout Preferences) -> Void) async {
    if await change({ operation(&$0.preferences) }) { await refreshReminders() }
  }
  func refreshLoginStatus() {
    loginEnabled = SMAppService.mainApp.status == .enabled
    loginNeedsApproval = SMAppService.mainApp.status == .requiresApproval
  }
  func configureLogin(enabled: Bool) {
    do {
      if enabled {
        try SMAppService.mainApp.register()
      } else {
        try SMAppService.mainApp.unregister()
      }
      loginMessage = nil
    } catch { loginMessage = error.localizedDescription }
    refreshLoginStatus()
  }
  func refreshReminders() async {
    guard !isLoading else { return }
    remindersDirty = true
    guard !refreshingReminders else { return }
    refreshingReminders = true
    defer { refreshingReminders = false }
    while remindersDirty {
      remindersDirty = false
      await scheduleReminder()
    }
  }
  private func scheduleReminder() async {
    let center = UNUserNotificationCenter.current()
    center.removePendingNotificationRequests(withIdentifiers: ["selah.practice"])
    guard library.preferences.remindersEnabled else {
      notificationStatus = "Reminders are off"
      return
    }
    let settings = await center.notificationSettings()
    guard
      settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
    else {
      notificationStatus = "Notifications are blocked in System Settings."
      return
    }
    guard readiness?.hasGoals ?? false else {
      notificationStatus = "Add a goal to begin reminders"
      return
    }
    // One pending invitation. Maintenance renews it after delivery; practice and wake recalculate it.
    let now = Date()
    let nextCard = readiness?.nextReview
    let tomorrow = Calendar.current.date(
      byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: now))!
    let hasNew = readiness?.hasNew ?? false
    let nextReady =
      !available.isEmpty ? now : min(nextCard ?? .distantFuture, hasNew ? tomorrow : .distantFuture)
    guard nextReady != .distantFuture else {
      notificationStatus = "No practice is scheduled"
      return
    }
    let invitation = ReminderSchedule.invitation(
      now: now, readyAt: nextReady, preferences: library.preferences)
    let seconds = max(1, invitation.timeIntervalSince(now))
    let content = UNMutableNotificationContent()
    content.title = "A moment for the Word"
    content.body = "Your next Selah practice is ready. Take a few minutes to recall it."
    content.sound = .default
    do {
      try await center.add(
        UNNotificationRequest(
          identifier: "selah.practice", content: content,
          trigger: UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)))
      notificationStatus =
        "Next invitation \(now.addingTimeInterval(seconds).formatted(date: .abbreviated, time: .shortened))"
    } catch { notificationStatus = "Could not schedule reminder: \(error.localizedDescription)" }
  }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
  var openPractice: (() -> Void)?
  private var loginLaunch = false
  func applicationWillFinishLaunching(_ notification: Notification) {
    let event = NSAppleEventManager.shared().currentAppleEvent
    loginLaunch =
      event?.eventID == kAEOpenApplication
      && event?.paramDescriptor(forKeyword: keyAEPropData)?.enumCodeValue
        == keyAELaunchedAsLogInItem
  }
  func applicationDidFinishLaunching(_ notification: Notification) {
    UNUserNotificationCenter.current().delegate = self
    if loginLaunch {
      Task { @MainActor in
        await Task.yield()
        for window in NSApp.windows where window.title == "Selah" { window.orderOut(nil) }
      }
    }
  }
  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification
  ) async -> UNNotificationPresentationOptions { [.banner, .sound] }
  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse
  ) async {
    await MainActor.run { self.openPractice?() }
  }
}
