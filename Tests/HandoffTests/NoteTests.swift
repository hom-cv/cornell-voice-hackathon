import Foundation

func expect(_ value: @autoclosure () -> Bool, _ message: String) {
    precondition(value(), message)
}

@main
struct NoteTests {
    @MainActor
    static func main() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let file = folder.appendingPathComponent("workspace.json")
        let store = WorkspaceStore(file: file)
        expect(store.workspace.notes.isEmpty, "Fresh workspace should have no fabricated notes")
        let first = store.addNote()
        store.update(first, title: "Panel inspection", text: "Original observation")
        let second = store.addNote()
        store.update(second, text: "Other note")
        expect(store.appendTranscript("  Follow up tomorrow  ", to: first), "Original target should exist")
        expect(store.workspace.notes.first(where: { $0.id == first })?.text == "Original observation\n\nFollow up tomorrow", "Voice should append to original note")
        expect(store.workspace.notes.first(where: { $0.id == second })?.text == "Other note", "Other note must not change")
        let restored = WorkspaceStore(file: file)
        expect(restored.workspace.notes == store.workspace.notes, "Disk round-trip must preserve edits")
        expect(restored.workspace.notes.contains { $0.matches("PANEL") }, "Search should ignore case")
        expect(restored.workspace.notes.contains { $0.matches("tomorrow") }, "Search should include body")
        store.delete(first)
        expect(!store.workspace.notes.contains { $0.id == first }, "Delete should remove note")
        expect(store.restoreDeleted() == first, "Undo should restore original identity")
        expect(store.workspace.notes.first?.text == "Original observation\n\nFollow up tomorrow", "Undo should preserve text")
        expect(!store.appendTranscript("Lost", to: UUID()), "Missing target must not create misplaced text")
        print("Passed persistence, search, delete/undo, and transcript-routing checks.")

        let legacy = """
        {"aircraft":"DEMO","shift":"Night","author":"Test","references":[],"notes":[{"id":"00000000-0000-0000-0000-000000000001","title":"Legacy","location":"Panel A","observation":"Observed","completed":"Checked","nextAction":"Recheck","owner":"Next shift","timing":"Tomorrow","status":"Open","originalObservation":"Original"}]}
        """
        try Data(legacy.utf8).write(to: file)
        let migrated = WorkspaceStore(file: file)
        expect(migrated.canSave, "Legacy schema should still load")
        expect(migrated.workspace.notes[0].text.contains("Next action: Recheck"), "Legacy details must remain visible")
        migrated.update(migrated.workspace.notes[0].id, text: "Edited")
        let roundTrip = WorkspaceStore(file: file)
        expect(roundTrip.workspace.notes[0].originalObservation == "Original", "Legacy snapshot must survive")
        expect(roundTrip.workspace.notes[0].text == "Edited", "Migrated edits must persist")
        print("Passed legacy migration checks.")

        try Data("invalid json".utf8).write(to: file)
        let broken = WorkspaceStore(file: file)
        expect(!broken.canSave && broken.saveFailed, "Corrupt files must disable editing")
        broken.save()
        let unchanged = try String(contentsOf: file, encoding: .utf8)
        expect(unchanged == "invalid json", "Corrupt original must not be overwritten")
        let blocked = WorkspaceStore(file: folder)
        expect(!blocked.canSave, "Unreadable workspace must not be replaced")
        print("Passed corrupt-file preservation checks.")
    }
}
