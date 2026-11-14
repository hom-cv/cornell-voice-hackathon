import Foundation

struct InspectionNote: Codable, Identifiable, Equatable {
    var id = UUID()
    var title = "New note"
    var location = ""
    var observation = ""
    var completed = ""
    var nextAction = ""
    var owner = ""
    var timing = ""
    var status = "Open"
    var originalObservation = ""
    // Optional fields keep workspaces from the first prototype readable.
    var body: String?
    var createdAt: Date?
    var updatedAt: Date?

    var text: String {
        get {
            if let body { return body }
            return [("", observation), ("Location", location), ("Completed work", completed),
                    ("Next action", nextAction), ("Owner", owner), ("Timing", timing)]
                .filter { !$0.1.isEmpty }
                .map { $0.0.isEmpty ? $0.1 : "\($0.0): \($0.1)" }
                .joined(separator: "\n\n")
        }
        set { body = newValue }
    }

    var displayTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "New note" : title
    }

    mutating func appendTranscript(_ transcript: String) {
        let cleaned = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return }
        text = text.isEmpty ? cleaned : text + "\n\n" + cleaned
        updatedAt = Date()
    }

    func matches(_ query: String) -> Bool {
        let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return query.isEmpty || title.localizedCaseInsensitiveContains(query) || text.localizedCaseInsensitiveContains(query)
    }
}

struct ReferenceDocument: Codable, Identifiable {
    var id = UUID()
    var name: String
    var revision: String
    var applicability: String
    var body: String
}

struct Workspace: Codable {
    var aircraft = ""
    var shift = ""
    var author = ""
    var notes: [InspectionNote] = []
    var references: [ReferenceDocument] = []

}
