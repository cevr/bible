import Foundation

public enum ReaderFont: String, Codable, CaseIterable, Sendable {
  case georgia = "Georgia"
  case palatino = "Palatino"
  case baskerville = "Baskerville"
  case system = "System"
}

public struct ReaderPreferences: Codable, Equatable, Sendable {
  public var font = ReaderFont.georgia
  public var size = 22.0
  public var lineHeight = 1.55
  public var characterSpacing = 0.0
  public var paragraphSpacing = 16.0
  public var verseSpacing = 8.0
  public var showVerseNumbers = true
  public var redLetters = true
  public init() {}
  private enum CodingKeys: String, CodingKey {
    case font, size, lineHeight, characterSpacing, paragraphSpacing, verseSpacing, showVerseNumbers,
      redLetters
  }
  public init(from decoder: any Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    font = try values.decodeIfPresent(ReaderFont.self, forKey: .font) ?? .georgia
    size = max(16, min(36, try values.decodeIfPresent(Double.self, forKey: .size) ?? 22))
    lineHeight = max(
      1.2, min(2.2, try values.decodeIfPresent(Double.self, forKey: .lineHeight) ?? 1.55))
    characterSpacing = max(
      -0.3, min(2, try values.decodeIfPresent(Double.self, forKey: .characterSpacing) ?? 0))
    paragraphSpacing = max(
      0, min(40, try values.decodeIfPresent(Double.self, forKey: .paragraphSpacing) ?? 16))
    verseSpacing = max(
      0, min(24, try values.decodeIfPresent(Double.self, forKey: .verseSpacing) ?? 8))
    showVerseNumbers = try values.decodeIfPresent(Bool.self, forKey: .showVerseNumbers) ?? true
    redLetters = try values.decodeIfPresent(Bool.self, forKey: .redLetters) ?? true
  }
}
