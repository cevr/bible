@preconcurrency import AVFoundation
import SelahCore
import SelahSpeech
import SwiftUI

/// The microphone side of dictation: capture, hand buffers to the chosen model, and report
/// the running transcript. Every model hears the same audio through `RecallTranscriber`.
@MainActor @Observable
final class Dictation {
  enum Phase: Equatable {
    case idle, preparing, listening, finishing
  }
  private(set) var phase = Phase.idle
  private(set) var message: String?
  /// When listening began, for the elapsed time shown while a long take runs.
  private(set) var started: Date?
  var active: Bool { phase != .idle }
  private var generation = UUID()
  private var engine: AVAudioEngine?
  private var transcriber: (any RecallTranscriber)?
  private var preparing: Task<Void, Never>?
  private var update: (@MainActor (String) -> Void)?

  /// Starts a take. `context` lists words that help the model hear the passage as printed.
  func start(
    model: DictationModel, context: [String], models: URL,
    update: @escaping @MainActor (String) -> Void
  ) {
    stop()
    let token = generation
    self.update = update
    phase = .preparing
    message = "Preparing \(model.title)…"
    preparing = Task { [self] in
      guard await AVCaptureDevice.requestAccess(for: .audio) else {
        stop()
        message = "Allow Microphone access for Selah in System Settings → Privacy & Security."
        return
      }
      guard generation == token, !Task.isCancelled else { return }
      do {
        let (transcriber, used) = try await startTranscriber(
          model: model, context: context, models: models
        ) { text in
          Task { @MainActor [weak self] in
            guard let self, self.generation == token, self.phase == .listening else { return }
            self.update?(text)
          }
        }
        guard generation == token, !Task.isCancelled else {
          await transcriber.cancel()
          return
        }
        let engine = AVAudioEngine()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
          await transcriber.cancel()
          throw CocoaError(.featureUnsupported)
        }
        input.installTap(onBus: 0, bufferSize: 4096, format: format) { buffer, _ in
          transcriber.append(buffer)
        }
        engine.prepare()
        try engine.start()
        self.engine = engine
        self.transcriber = transcriber
        phase = .listening
        started = Date()
        message =
          switch used {
          case model: nil
          case .some(let other):
            model.isLocal
              ? "\(model.title) is not downloaded; \(other.title) is listening."
              : "\(model.title) is not offered on this Mac; \(other.title) is listening."
          case .none:
            "Apple’s models are not offered on this Mac; on-device dictation is listening."
          }
      } catch {
        guard generation == token else { return }
        stop()
        message = "Could not start dictation: \(error.localizedDescription)"
      }
    }
  }

  /// Ends the take and waits for the final transcript, which replaces the running one.
  func finish() async {
    guard phase == .listening, let transcriber else {
      stop()
      return
    }
    let token = generation
    phase = .finishing
    stopCapture()
    do {
      let text = try await transcriber.finish()
      guard generation == token else { return }
      update?(text)
      reset()
    } catch {
      guard generation == token else { return }
      reset()
      message = "Dictation stopped: \(error.localizedDescription)"
    }
  }

  /// Ends the take now and discards anything not yet transcribed.
  func stop() {
    let transcriber = self.transcriber
    stopCapture()
    reset()
    if let transcriber { Task { await transcriber.cancel() } }
  }

  private func stopCapture() {
    preparing?.cancel()
    preparing = nil
    engine?.stop()
    engine?.inputNode.removeTap(onBus: 0)
    engine = nil
  }

  private func reset() {
    generation = UUID()
    transcriber = nil
    update = nil
    phase = .idle
    started = nil
    message = nil
  }
}
