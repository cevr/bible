// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "Selah", platforms: [.macOS(.v14)],
  products: [.executable(name: "Selah", targets: ["SelahApp"])],
  targets: [
    .target(name: "SelahCore"),
    .executableTarget(
      name: "SelahApp", dependencies: ["SelahCore"], resources: [.process("Resources")]),
    .testTarget(name: "SelahCoreTests", dependencies: ["SelahCore"]),
  ]
)
