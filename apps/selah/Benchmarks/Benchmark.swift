import Foundation
import SelahCore

@main struct Benchmark {
  static func main() throws {
    let clock = ContinuousClock()
    let start = clock.now
    let verses = try JSONDecoder().decode(
      [Verse].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
    let corpus = Corpus(verses: verses)
    print("Corpus decode + indexing: \(start.duration(to: clock.now))")
    var library = Library()
    library.goals = [Goal(title: "Whole Bible")]
    let date = Date(timeIntervalSince1970: 1_800_000_000)
    for n in 0..<50000 {
      try library.record(
        verses[n % verses.count], rating: .good, usedHint: false,
        now: date.addingTimeInterval(Double(n)))
    }
    let longestChapter = corpus.verses(book: 19, chapter: 119).map(\.practiceText).joined(
      separator: " ")
    let recallStart = clock.now
    let comparison = try RecallComparison(
      expected: longestChapter,
      recalled: longestChapter.replacingOccurrences(of: " thy ", with: " "))
    print(
      "Psalm 119 word alignment: \(recallStart.duration(to: clock.now)); \(comparison.missingCount) omissions"
    )
    let began = clock.now
    var checksum = 0
    for _ in 0..<50 {
      checksum += library.practiceQueue(in: corpus, now: date.addingTimeInterval(365 * 86400)).count
    }
    precondition(checksum == 500)
    print(
      "50 whole-Bible queues, 31,102 cards / 50,000 reviews: \(began.duration(to: clock.now)); checksum \(checksum)"
    )
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
      .appendingPathComponent("progress.json")
    defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
    let file = ProgressFile(url: url)
    let save = clock.now
    try file.save(library)
    print("Atomic save: \(save.duration(to: clock.now))")
  }
}
