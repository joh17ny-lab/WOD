import SwiftUI
import SwiftData
import UniformTypeIdentifiers

/// Imports a workout from a `.tcx` or `.gpx` file exported by a watch / Garmin
/// when Apple Health isn't available or the device isn't synced to Health.
struct ActivityImportView: View {
    @Environment(\.modelContext) private var context

    @State private var showingPicker = false
    @State private var parsed: ParsedActivity?
    @State private var fileName = ""
    @State private var errorMessage: String?
    @State private var imported = false

    /// `.tcx` / `.gpx` aren't registered system UTTypes, so accept XML + data.
    private var allowedTypes: [UTType] {
        [.xml, .data]
    }

    var body: some View {
        List {
            Section {
                Text("Import a workout from a .tcx or .gpx file exported by your watch or Garmin Connect. Use this when the activity isn't already in Apple Health.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Button {
                    showingPicker = true
                } label: {
                    Label("Choose File", systemImage: "doc.badge.plus")
                }
            }

            if let parsed {
                Section("Preview") {
                    LabeledContent("Activity", value: parsed.title)
                    if let start = parsed.start {
                        LabeledContent("Date") {
                            Text(start, format: .dateTime.month().day().year().hour().minute())
                        }
                    }
                    if parsed.totalSeconds > 0 {
                        LabeledContent("Duration", value: TimeFormat.mmss(Int(parsed.totalSeconds)))
                    }
                    if parsed.distanceMeters > 0 {
                        LabeledContent("Distance", value: "\(Int(parsed.distanceMeters)) m")
                    }
                    if parsed.calories > 0 {
                        LabeledContent("Calories", value: "\(Int(parsed.calories)) kcal")
                    }
                }

                Section {
                    Button {
                        importParsed(parsed)
                    } label: {
                        Label(imported ? "Imported ✓" : "Add to Log",
                              systemImage: imported ? "checkmark.circle.fill" : "plus.circle")
                    }
                    .disabled(imported)
                }
            }

            if let errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("Import File")
        .navigationBarTitleDisplayMode(.inline)
        .fileImporter(
            isPresented: $showingPicker,
            allowedContentTypes: allowedTypes,
            allowsMultipleSelection: false
        ) { result in
            handlePicked(result)
        }
    }

    private func handlePicked(_ result: Result<[URL], Error>) {
        errorMessage = nil
        imported = false
        parsed = nil
        do {
            guard let url = try result.get().first else { return }
            let needsStop = url.startAccessingSecurityScopedResource()
            defer { if needsStop { url.stopAccessingSecurityScopedResource() } }
            let data = try Data(contentsOf: url)
            fileName = url.lastPathComponent
            parsed = try ActivityFileParser.parse(data: data, fileName: fileName)
        } catch let e as ActivityFileError {
            errorMessage = e.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func importParsed(_ activity: ParsedActivity) {
        let entry = WODEntry(
            title: activity.title,
            details: "Imported from \(fileName).",
            type: activity.distanceMeters > 0 ? .distance : .other,
            result: activity.resultSummary,
            date: activity.start ?? .now,
            source: "file",
            externalID: "file:\(fileName):\(activity.start?.timeIntervalSince1970 ?? 0)"
        )
        context.insert(entry)
        imported = true
    }
}

#Preview {
    NavigationStack { ActivityImportView() }
        .modelContainer(for: [WODEntry.self, LiftPR.self,
                              FoodEntry.self, MacroTargets.self],
                        inMemory: true)
}
