import SwiftUI

@MainActor
final class WorkspaceStore: ObservableObject {
    @Published var workspace: Workspace { didSet { save() } }
    @Published var error: String?
    @Published var savedAt: Date?
    @Published private(set) var saveFailed = false
    @Published private(set) var lastDeleted: InspectionNote?
    private let file: URL
    private(set) var canSave = true

    init(file: URL? = nil) {
        self.file = file ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("InspectionHandoff/workspace.json")
        if FileManager.default.fileExists(atPath: self.file.path) {
            do {
                workspace = try JSONDecoder().decode(Workspace.self, from: Data(contentsOf: self.file))
            } catch {
                workspace = Workspace()
                canSave = false
                saveFailed = true
                self.error = "Could not load saved notes. The file is preserved at \(self.file.path). Editing is disabled to avoid overwriting it. \(error.localizedDescription)"
            }
        } else { workspace = Workspace() }
    }

    func save() {
        guard canSave else { return }
        do {
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try encoder.encode(workspace).write(to: file, options: .atomic)
            savedAt = Date()
            saveFailed = false
        } catch {
            saveFailed = true
            self.error = "Could not save notes: \(error.localizedDescription)"
        }
    }

    @discardableResult
    func addNote() -> UUID {
        let note = InspectionNote(body: "", createdAt: Date(), updatedAt: Date())
        workspace.notes.insert(note, at: 0)
        return note.id
    }

    func update(_ id: UUID, title: String? = nil, text: String? = nil) {
        guard let index = workspace.notes.firstIndex(where: { $0.id == id }) else { return }
        var note = workspace.notes[index]
        if let title { note.title = title }
        if let text { note.text = text }
        note.updatedAt = Date()
        workspace.notes[index] = note
    }

    func appendTranscript(_ text: String, to id: UUID) -> Bool {
        guard let index = workspace.notes.firstIndex(where: { $0.id == id }) else { return false }
        var note = workspace.notes[index]
        note.appendTranscript(text)
        workspace.notes[index] = note
        return true
    }

    func delete(_ id: UUID) {
        guard let note = workspace.notes.first(where: { $0.id == id }) else { return }
        lastDeleted = note
        workspace.notes.removeAll { $0.id == id }
    }

    func restoreDeleted() -> UUID? {
        guard let note = lastDeleted else { return nil }
        workspace.notes.insert(note, at: 0)
        lastDeleted = nil
        return note.id
    }
}
