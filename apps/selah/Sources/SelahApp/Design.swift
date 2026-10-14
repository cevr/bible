import AppKit
import SelahCore
import SwiftUI

/// Selah's design tokens. Use sites name a role; literal values live only here.
/// Liquid Glass belongs to controls and chrome. Scripture sits on the calm page surface.
enum Space {
  static let xxs: CGFloat = 4
  static let xs: CGFloat = 8
  static let s: CGFloat = 12
  static let m: CGFloat = 16
  static let l: CGFloat = 24
  static let xl: CGFloat = 32
}

enum Radius {
  /// Fields and rows set inside the page.
  static let field: CGFloat = 12
  /// Grouped containers; concentric with a field inset by `Space.xxs`.
  static let group: CGFloat = 16
}

enum Measure {
  /// A readable column for Scripture and the controls that serve it.
  static let column: CGFloat = 640
  /// The column verse numbers sit in, reserved even when a verse is hidden.
  static let verseGutter: CGFloat = 24
  /// The trailing column for a verse's slipped mark.
  static let markColumn: CGFloat = 28
  /// The recall field's resting height for a verse or passage, and for a whole chapter.
  static let verseRecall: CGFloat = 64
  static let chapterRecall: CGFloat = 160
}

enum Palette {
  /// The reading surface behind Scripture: a quiet paper tone, never glass.
  static let page = adaptive(light: (0.984, 0.980, 0.969), dark: (0.086, 0.086, 0.090))
  /// Recessed fields and grouped rows on the page.
  static let field = adaptive(light: (0.945, 0.938, 0.922), dark: (0.141, 0.141, 0.149))
  /// Words of Christ, when red letters are on.
  static let redLetter = adaptive(light: (0.655, 0.169, 0.122), dark: (0.961, 0.569, 0.482))
  /// Verses and words that slipped in a recall; 4.9:1 on the light page.
  static let slipped = adaptive(light: (0.659, 0.349, 0.020), dark: (0.976, 0.682, 0.322))
  /// Cue text (first letters, faded verses) and unmarked controls on the page: about 6:1 in
  /// both modes, where the system's secondary label drops to 3:1 on the light page.
  static let cue = adaptive(light: (0.376, 0.373, 0.357), dark: (0.620, 0.620, 0.639))
  /// Verse numbers in Scripture set on the page.
  static let verseNumber = cue
  /// Recalled words that are not in the text.
  static let extra = adaptive(light: (0.749, 0.137, 0.149), dark: (1.0, 0.478, 0.478))

  private static func adaptive(
    light: (Double, Double, Double), dark: (Double, Double, Double)
  ) -> Color {
    Color(
      nsColor: NSColor(name: nil) { appearance in
        let value =
          appearance.bestMatch(from: [.darkAqua, .vibrantDark, .accessibilityHighContrastDarkAqua])
            == nil ? light : dark
        return NSColor(srgbRed: value.0, green: value.1, blue: value.2, alpha: 1)
      })
  }
}

extension Font {
  /// A large count, such as reviews ready.
  static let metric = Font.system(size: 44, weight: .light, design: .rounded).monospacedDigit()
  /// The reader's chosen face at a given size.
  static func scripture(_ reader: ReaderPreferences, size: Double? = nil) -> Font {
    let size = size ?? reader.size
    return reader.font == .system ? .system(size: size) : .custom(reader.font.rawValue, size: size)
  }
  /// Recall typed beneath the passage: the reader's face, a step below the text.
  static func recall(_ reader: ReaderPreferences) -> Font {
    scripture(reader, size: max(15, reader.size - 4))
  }
  /// Verse numbers raised in the gutter.
  static let verseNumber = Font.system(size: 11, weight: .medium)
  /// A passage reference set in the reader's face, a step above the text.
  static func reference(_ reader: ReaderPreferences) -> Font {
    scripture(reader, size: reader.size + 6).weight(.medium)
  }
}

extension Appearance {
  var colorScheme: ColorScheme? {
    switch self {
    case .system: nil
    case .light: .light
    case .dark: .dark
    }
  }
}

extension View {
  /// A grouped container on the page, matching the grouped form style.
  func groupSurface() -> some View {
    background(Palette.field, in: RoundedRectangle(cornerRadius: Radius.group, style: .continuous))
  }
}
