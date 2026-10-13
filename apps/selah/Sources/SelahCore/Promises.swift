import Foundation

/// A promise is one verse or a short passage within a chapter, named by its KJV book.
public struct PromiseReference: Hashable, Sendable {
  public let book: String
  public let chapter: Int
  public let first: Int
  public let last: Int
  public init(_ book: String, _ chapter: Int, _ first: Int, through last: Int? = nil) {
    self.book = book
    self.chapter = chapter
    self.first = first
    self.last = last ?? first
  }
}

public struct PromiseCategory: Identifiable, Sendable {
  public let id: String
  public let title: String
  /// An SF Symbol name for lists.
  public let symbol: String
  public let promises: [PromiseReference]
}

/// Hand-checked KJV promises sized for memorizing. A test resolves every reference against the corpus.
public enum Promises {
  public static func category(_ id: String?) -> PromiseCategory? {
    categories.first { $0.id == id }
  }
  public static let categories: [PromiseCategory] = [
    PromiseCategory(
      id: "forgiveness", title: "Forgiveness", symbol: "drop",
      promises: [
        .init("1 John", 1, 9),
        .init("Isaiah", 1, 18),
        .init("Psalms", 103, 12),
        .init("Micah", 7, 18, through: 19),
        .init("Isaiah", 43, 25),
        .init("Isaiah", 44, 22),
        .init("Ephesians", 1, 7),
        .init("Acts", 3, 19),
        .init("Psalms", 86, 5),
        .init("Isaiah", 55, 7),
        .init("Hebrews", 8, 12),
      ]),
    PromiseCategory(
      id: "peace", title: "Peace in Anxiety", symbol: "leaf",
      promises: [
        .init("Philippians", 4, 6, through: 7),
        .init("John", 14, 27),
        .init("Isaiah", 26, 3),
        .init("1 Peter", 5, 7),
        .init("Psalms", 55, 22),
        .init("John", 16, 33),
        .init("Psalms", 4, 8),
        .init("Psalms", 94, 19),
        .init("2 Thessalonians", 3, 16),
        .init("Psalms", 29, 11),
      ]),
    PromiseCategory(
      id: "strength", title: "Strength", symbol: "mountain.2",
      promises: [
        .init("Isaiah", 40, 29, through: 31),
        .init("Isaiah", 41, 10),
        .init("Philippians", 4, 13),
        .init("2 Corinthians", 12, 9),
        .init("Psalms", 73, 26),
        .init("Psalms", 28, 7),
        .init("Deuteronomy", 33, 25),
        .init("Psalms", 18, 32),
        .init("Isaiah", 12, 2),
        .init("Psalms", 138, 3),
      ]),
    PromiseCategory(
      id: "provision", title: "Provision", symbol: "basket",
      promises: [
        .init("Philippians", 4, 19),
        .init("Matthew", 6, 33),
        .init("Psalms", 37, 25),
        .init("Psalms", 84, 11),
        .init("Matthew", 7, 11),
        .init("2 Corinthians", 9, 8),
        .init("Psalms", 34, 10),
        .init("Hebrews", 13, 5),
        .init("Malachi", 3, 10),
        .init("Luke", 12, 32),
        .init("Psalms", 37, 4),
      ]),
    PromiseCategory(
      id: "guidance", title: "Guidance & Wisdom", symbol: "signpost.right",
      promises: [
        .init("Proverbs", 3, 5, through: 6),
        .init("James", 1, 5),
        .init("Psalms", 32, 8),
        .init("Isaiah", 30, 21),
        .init("Isaiah", 58, 11),
        .init("Psalms", 37, 23),
        .init("Isaiah", 48, 17),
        .init("Psalms", 25, 9),
        .init("Proverbs", 16, 3),
        .init("Psalms", 48, 14),
        .init("Psalms", 73, 24),
        .init("Isaiah", 42, 16),
      ]),
    PromiseCategory(
      id: "protection", title: "Protection & Fear", symbol: "shield",
      promises: [
        .init("Psalms", 91, 1, through: 2),
        .init("Psalms", 91, 4),
        .init("Psalms", 91, 11),
        .init("Isaiah", 43, 2),
        .init("2 Timothy", 1, 7),
        .init("Psalms", 34, 7),
        .init("Isaiah", 54, 17),
        .init("Psalms", 121, 7, through: 8),
        .init("Deuteronomy", 31, 6),
        .init("Proverbs", 18, 10),
        .init("Psalms", 56, 3),
        .init("Isaiah", 41, 13),
      ]),
    PromiseCategory(
      id: "victory", title: "Temptation & Victory", symbol: "flag",
      promises: [
        .init("1 Corinthians", 10, 13),
        .init("James", 4, 7),
        .init("Romans", 8, 37),
        .init("1 John", 5, 4),
        .init("1 Corinthians", 15, 57),
        .init("Jude", 1, 24),
        .init("Hebrews", 2, 18),
        .init("Hebrews", 4, 15, through: 16),
        .init("2 Peter", 2, 9),
        .init("Romans", 6, 14),
        .init("1 John", 4, 4),
        .init("James", 1, 12),
      ]),
    PromiseCategory(
      id: "spirit", title: "The Holy Spirit", symbol: "wind",
      promises: [
        .init("Luke", 11, 13),
        .init("John", 14, 16, through: 17),
        .init("John", 14, 26),
        .init("John", 16, 13),
        .init("Acts", 1, 8),
        .init("Acts", 2, 38, through: 39),
        .init("Ezekiel", 36, 26, through: 27),
        .init("Joel", 2, 28),
        .init("Romans", 8, 26),
        .init("Isaiah", 44, 3),
        .init("Romans", 5, 5),
      ]),
    PromiseCategory(
      id: "healing", title: "Healing", symbol: "bandage",
      promises: [
        .init("Exodus", 15, 26),
        .init("Psalms", 103, 2, through: 3),
        .init("Jeremiah", 17, 14),
        .init("Jeremiah", 30, 17),
        .init("James", 5, 15),
        .init("Isaiah", 53, 5),
        .init("Psalms", 147, 3),
        .init("Malachi", 4, 2),
        .init("Psalms", 41, 3),
        .init("Jeremiah", 33, 6),
        .init("Isaiah", 58, 8),
        .init("Psalms", 30, 2),
      ]),
    PromiseCategory(
      id: "comfort", title: "Comfort in Grief", symbol: "heart",
      promises: [
        .init("Matthew", 5, 4),
        .init("Psalms", 34, 18),
        .init("Revelation", 21, 4),
        .init("2 Corinthians", 1, 3, through: 4),
        .init("1 Thessalonians", 4, 13, through: 14),
        .init("Psalms", 30, 5),
        .init("Isaiah", 66, 13),
        .init("Psalms", 23, 4),
        .init("Isaiah", 25, 8),
        .init("Lamentations", 3, 22, through: 23),
        .init("John", 16, 22),
      ]),
    PromiseCategory(
      id: "salvation", title: "Salvation & Assurance", symbol: "checkmark.seal",
      promises: [
        .init("John", 3, 16),
        .init("Romans", 10, 9),
        .init("John", 10, 27, through: 28),
        .init("Romans", 8, 38, through: 39),
        .init("1 John", 5, 11, through: 12),
        .init("Ephesians", 2, 8, through: 9),
        .init("John", 5, 24),
        .init("Romans", 8, 1),
        .init("Acts", 16, 31),
        .init("John", 6, 37),
        .init("Philippians", 1, 6),
        .init("Titus", 3, 5),
      ]),
    PromiseCategory(
      id: "return", title: "Christ’s Return", symbol: "sunrise",
      promises: [
        .init("John", 14, 2, through: 3),
        .init("Acts", 1, 11),
        .init("1 Thessalonians", 4, 16, through: 17),
        .init("Titus", 2, 13),
        .init("Revelation", 22, 12),
        .init("Hebrews", 9, 28),
        .init("Matthew", 24, 30),
        .init("Revelation", 1, 7),
        .init("1 John", 3, 2),
        .init("Philippians", 3, 20, through: 21),
        .init("1 Corinthians", 15, 51, through: 52),
        .init("Revelation", 22, 20),
      ]),
    PromiseCategory(
      id: "prayer", title: "Prayer Answered", symbol: "hands.and.sparkles",
      promises: [
        .init("Matthew", 7, 7, through: 8),
        .init("Jeremiah", 33, 3),
        .init("John", 14, 13, through: 14),
        .init("1 John", 5, 14, through: 15),
        .init("Mark", 11, 24),
        .init("Matthew", 21, 22),
        .init("Psalms", 145, 18),
        .init("Isaiah", 65, 24),
        .init("John", 15, 7),
        .init("Psalms", 50, 15),
        .init("Jeremiah", 29, 12, through: 13),
        .init("Psalms", 91, 15),
      ]),
    PromiseCategory(
      id: "rest", title: "Rest", symbol: "moon.zzz",
      promises: [
        .init("Matthew", 11, 28, through: 30),
        .init("Psalms", 23, 2, through: 3),
        .init("Exodus", 33, 14),
        .init("Hebrews", 4, 9),
        .init("Psalms", 127, 2),
        .init("Psalms", 116, 7),
        .init("Isaiah", 32, 18),
        .init("Jeremiah", 31, 25),
        .init("Psalms", 3, 5),
        .init("Proverbs", 3, 24),
      ]),
  ]
}
