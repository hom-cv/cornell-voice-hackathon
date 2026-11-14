// swift-tools-version: 6.0
import PackageDescription
import Foundation

let textOnly = ProcessInfo.processInfo.environment["HANDOFF_TEXT_ONLY"] == "1"

let package = Package(
    name: "Handoff",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "Handoff", targets: ["Handoff"])],
    dependencies: textOnly ? [] : [
        .package(url: "https://github.com/argmaxinc/argmax-oss-swift.git", exact: "0.18.0")
    ],
    targets: [
        .executableTarget(name: "Handoff", dependencies: textOnly ? [] : [
            .product(name: "WhisperKit", package: "argmax-oss-swift")
        ])
    ]
)
