// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "Selah", platforms: [.macOS(.v26)],
  products: [.executable(name: "Selah", targets: ["SelahApp"])],
  dependencies: [
    .package(
      url: "https://github.com/open-spaced-repetition/swift-fsrs.git",
      revision: "4fbaf20184d62f82a9f44f343337c61a2c5483e9")
  ],
  targets: [
    .target(name: "SelahCore", dependencies: [.product(name: "FSRS", package: "swift-fsrs")]),
    .target(name: "SelahSpeech", dependencies: ["SelahCore"]),
    .executableTarget(
      name: "SelahApp", dependencies: ["SelahCore", "SelahSpeech"],
      resources: [.process("Resources")]),
    .executableTarget(
      name: "SelahTranscribe", dependencies: ["SelahCore", "SelahSpeech"], path: "Tools/Transcribe"),
    .executableTarget(name: "SelahBenchmark", dependencies: ["SelahCore"], path: "Benchmarks"),
    .testTarget(name: "SelahCoreTests", dependencies: ["SelahCore"], exclude: ["Fixtures"]),
  ]
)
