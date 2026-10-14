@preconcurrency import AVFoundation
import Foundation
import SelahCore
@preconcurrency import Speech

/// Where an Apple model stands on this Mac. macOS downloads, stores, and updates these
/// assets itself and shares them with other apps, so Selah never sees their size on disk.
public enum ModelState: Sendable, Equatable {
  case unsupported
  case available
  case downloading(Double)
  case installed
}

public enum SpeechError: LocalizedError {
  case unsupported(DictationModel)
  case noAudioFormat
  public var errorDescription: String? {
    switch self {
    case .unsupported(let model): "\(model.title) is not available for English on this Mac."
    case .noAudioFormat: "The speech model offered no audio format to record in."
    }
  }
}

/// Apple's on-device models through SpeechAnalyzer: install, remove, and transcribe.
public enum AppleModels {
  public static let english = Locale(identifier: "en-US")

  static func module(_ model: DictationModel, locale: Locale, live: Bool) -> any SpeechModule {
    switch model {
    case .appleSpeech:
      SpeechTranscriber(
        locale: locale, transcriptionOptions: [],
        reportingOptions: live ? [.volatileResults] : [], attributeOptions: [])
    case .appleDictation:
      DictationTranscriber(
        locale: locale, contentHints: [], transcriptionOptions: [.punctuation],
        reportingOptions: live ? [.volatileResults] : [], attributeOptions: [])
    case .parakeetSmall, .parakeetLarge:
      preconditionFailure("\(model.title) does not run through SpeechAnalyzer")
    }
  }

  /// The supported locale equivalent to US English for a model, if the model runs here.
  static func locale(for model: DictationModel) async -> Locale? {
    switch model {
    case .appleSpeech:
      guard SpeechTranscriber.isAvailable else { return nil }
      return await SpeechTranscriber.supportedLocale(equivalentTo: english)
    case .appleDictation:
      return await DictationTranscriber.supportedLocale(equivalentTo: english)
    case .parakeetSmall, .parakeetLarge:
      return nil
    }
  }

  public static func state(of model: DictationModel) async -> ModelState {
    guard let locale = await locale(for: model) else { return .unsupported }
    switch await AssetInventory.status(forModules: [module(model, locale: locale, live: false)]) {
    case .unsupported: return .unsupported
    case .supported: return .available
    case .downloading: return .downloading(0)
    case .installed: return .installed
    @unknown default: return .available
    }
  }

  /// Downloads and installs a model's assets, reporting the fraction complete.
  public static func install(
    _ model: DictationModel, progress: @escaping @Sendable (Double) -> Void
  ) async throws {
    guard let locale = await locale(for: model) else { throw SpeechError.unsupported(model) }
    let module = module(model, locale: locale, live: false)
    guard let request = try await AssetInventory.assetInstallationRequest(supporting: [module])
    else { return }
    let observation = request.progress.observe(\.fractionCompleted, options: [.initial, .new]) {
      value, _ in progress(value.fractionCompleted)
    }
    defer { observation.invalidate() }
    try await request.downloadAndInstall()
  }

  /// Gives up Selah's claim on the English assets. macOS removes them later unless another
  /// app still uses them. Both Apple models share the one English reservation.
  public static func remove() async {
    for locale in await AssetInventory.reservedLocales
    where locale.language.languageCode == english.language.languageCode {
      _ = await AssetInventory.release(reservedLocale: locale)
    }
  }
}

/// A recall heard by one of Apple's models, streaming a live transcript as it goes.
public final class AppleTranscriber: RecallTranscriber, @unchecked Sendable {
  private let analyzer: SpeechAnalyzer
  private let input: AsyncStream<AnalyzerInput>.Continuation
  private let converter: StreamConverter
  private let results: Task<String, any Error>

  /// Installs assets if needed, then starts listening. `update` receives the running
  /// transcript, volatile words included, on an arbitrary thread.
  public static func start(
    model: DictationModel, context: [String], live: Bool = true,
    update: @escaping @Sendable (String) -> Void = { _ in }
  ) async throws -> AppleTranscriber {
    guard let locale = await AppleModels.locale(for: model) else {
      throw SpeechError.unsupported(model)
    }
    try await AppleModels.install(model) { _ in }
    let module = AppleModels.module(model, locale: locale, live: live)
    guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [module])
    else { throw SpeechError.noAudioFormat }
    let analyzer = SpeechAnalyzer(modules: [module])
    if !context.isEmpty {
      let analysis = AnalysisContext()
      analysis.contextualStrings[.general] = context
      try await analyzer.setContext(analysis)
    }
    try await analyzer.prepareToAnalyze(in: format)
    let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
    let results = Task<String, any Error> {
      var transcript = Transcript()
      func receive(_ text: AttributedString, final: Bool) {
        let words = String(text.characters)
        if final { transcript.finalize(words) } else { transcript.volatile = words }
        update(transcript.text)
      }
      if let transcriber = module as? SpeechTranscriber {
        for try await result in transcriber.results {
          receive(result.text, final: result.isFinal)
        }
      } else if let transcriber = module as? DictationTranscriber {
        for try await result in transcriber.results {
          receive(result.text, final: result.isFinal)
        }
      }
      return transcript.text
    }
    try await analyzer.start(inputSequence: stream)
    return AppleTranscriber(
      analyzer: analyzer, input: continuation, converter: StreamConverter(to: format),
      results: results)
  }

  private init(
    analyzer: SpeechAnalyzer, input: AsyncStream<AnalyzerInput>.Continuation,
    converter: StreamConverter, results: Task<String, any Error>
  ) {
    self.analyzer = analyzer
    self.input = input
    self.converter = converter
    self.results = results
  }

  public func append(_ buffer: AVAudioPCMBuffer) {
    guard let converted = converter.convert(buffer) else { return }
    input.yield(AnalyzerInput(buffer: converted))
  }

  public func finish() async throws -> String {
    input.finish()
    try await analyzer.finalizeAndFinishThroughEndOfInput()
    return try await results.value
  }

  public func cancel() async {
    input.finish()
    await analyzer.cancelAndFinishNow()
    results.cancel()
  }
}
