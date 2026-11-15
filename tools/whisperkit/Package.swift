// swift-tools-version: 6.0
import Foundation
import PackageDescription

let home = FileManager.default.homeDirectoryForCurrentUser.path
let source = ProcessInfo.processInfo.environment["WHISPERKIT_SOURCE_PATH"]
    ?? "\(home)/Desktop/local-ai-hackathon/native-application/.build/checkouts/argmax-oss-swift"
let cache = URL(fileURLWithPath: source).deletingLastPathComponent().path
let dependencies = ["swift-transformers", "swift-argument-parser", "swift-jinja",
                    "swift-collections", "swift-crypto", "swift-asn1", "yyjson"]

let package = Package(
    name: "NimbusWhisperKit",
    platforms: [.macOS(.v13)],
    products: [.executable(name: "nimbus-whisperkit", targets: ["NimbusWhisperKit"])],
    dependencies: [.package(path: source)] + dependencies.map { .package(path: "\(cache)/\($0)") },
    targets: [.executableTarget(
        name: "NimbusWhisperKit",
        dependencies: [.product(name: "WhisperKit", package: "argmax-oss-swift")]
    )],
    swiftLanguageModes: [.v5]
)
