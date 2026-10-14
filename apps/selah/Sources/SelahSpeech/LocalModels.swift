import Foundation
import SelahCore

/// A speech model Selah downloads and keeps under its own data folder, in `Models`.
///
/// Apple's models are managed by macOS. A local engine is a separate package that this build
/// may or may not include; `LocalModels.engine` is nil when it does not, and Settings then
/// lists only Apple's models.
public protocol LocalSpeechEngine: Sendable {
  func state(of model: DictationModel, in directory: URL) async -> ModelState
  /// Bytes the model occupies in `directory`, when it is there.
  func size(of model: DictationModel, in directory: URL) -> Int64?
  func install(
    _ model: DictationModel, in directory: URL, progress: @escaping @Sendable (Double) -> Void
  ) async throws
  func delete(_ model: DictationModel, in directory: URL) throws
  /// Loads a downloaded model and starts a take. It transcribes when the take finishes.
  func start(_ model: DictationModel, in directory: URL) async throws -> any RecallTranscriber
}

public enum LocalModels {
  /// The local engine compiled into this build, if any. The Parakeet engine is compiled in
  /// when the FluidAudio package is a dependency of SelahSpeech.
  public static let engine: (any LocalSpeechEngine)? = {
    #if canImport(FluidAudio)
      return ParakeetEngine()
    #else
      return nil
    #endif
  }()

  /// The models this build can offer.
  public static var offered: [DictationModel] {
    DictationModel.allCases.filter { !$0.isLocal || engine != nil }
  }

  /// The total size of the regular files under a folder.
  public static func size(of folder: URL) -> Int64? {
    guard
      let files = FileManager.default.enumerator(
        at: folder, includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey])
    else { return nil }
    var total: Int64 = 0
    for case let file as URL in files {
      let values = try? file.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
      if values?.isRegularFile == true { total += Int64(values?.fileSize ?? 0) }
    }
    return total
  }
}
