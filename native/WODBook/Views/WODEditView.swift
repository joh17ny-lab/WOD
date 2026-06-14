import SwiftUI
import SwiftData
import HealthKit

/// Add or edit a WOD entry. Pass `nil` to create a new one.
struct WODEditView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @StateObject private var health = HealthKitManager()
    @State private var healthDurationMin = ""
    @State private var healthCaloriesText = ""
    @State private var healthDistanceText = ""   // meters
    @State private var isSavingToHealth = false
    @State private var healthMessage: String?

    /// nil = creating a new entry; non-nil = editing existing.
    var entry: WODEntry?

    /// Optional benchmark used to pre-fill a new entry.
    var prefillBenchmark: Benchmark?

    /// Optional generic prefill (e.g. coming from the timer).
    var prefill: PrefillWOD?

    @State private var title = ""
    @State private var details = ""
    @State private var type: WODType = .forTime
    @State private var result = ""
    @State private var rxd = false
    @State private var notes = ""
    @State private var date: Date = .now
    @State private var benchmarkName: String?

    private var isEditing: Bool { entry != nil }

    var body: some View {
        Form {
            Section("Workout") {
                TextField("Title (e.g. Fran)", text: $title)

                Picker("Type", selection: $type) {
                    ForEach(WODType.allCases) { t in
                        Label(t.rawValue, systemImage: t.systemImage).tag(t)
                    }
                }

                TextField("Description / movements", text: $details, axis: .vertical)
                    .lineLimit(3...8)
            }

            Section("Result") {
                TextField(type.resultPlaceholder, text: $result)
                Toggle("Performed as prescribed (RX)", isOn: $rxd)
                DatePicker("Date", selection: $date, displayedComponents: .date)
            }

            Section("Notes") {
                TextField("How did it feel?", text: $notes, axis: .vertical)
                    .lineLimit(2...6)
            }

            if isEditing, entry?.source == "manual" {
                healthSection
            }
        }
        .navigationTitle(isEditing ? "Edit WOD" : "New WOD")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { save() }
                    .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .onAppear(perform: load)
    }

    // MARK: - Apple Health write-back

    @ViewBuilder
    private var healthSection: some View {
        Section {
            HStack {
                TextField("Duration (min)", text: $healthDurationMin)
                    .keyboardType(.decimalPad)
                TextField("Calories (optional)", text: $healthCaloriesText)
                    .keyboardType(.decimalPad)
            }
            TextField("Distance in meters (optional)", text: $healthDistanceText)
                .keyboardType(.decimalPad)
            Button {
                Task { await saveToHealth() }
            } label: {
                HStack {
                    Label(savedToHealth ? "Saved to Apple Health" : "Save to Apple Health",
                          systemImage: savedToHealth ? "checkmark.circle.fill" : "heart.fill")
                    Spacer()
                    if isSavingToHealth { ProgressView() }
                }
            }
            .disabled(isSavingToHealth || savedToHealth || (Double(healthDurationMin) ?? 0) <= 0)
        } header: {
            Text("Apple Health")
        } footer: {
            if let healthMessage {
                Text(healthMessage)
            } else {
                Text("Save this workout to Apple Health. Set a duration (auto-filled from your time when available).")
            }
        }
    }

    /// True once this entry has been written to Health (externalID carries the
    /// saved sample UUID with an "hk-out:" prefix).
    private var savedToHealth: Bool {
        entry?.externalID?.hasPrefix("hk-out:") == true
    }

    private func saveToHealth() async {
        guard let entry else { return }
        guard let minutes = Double(healthDurationMin), minutes > 0 else {
            healthMessage = "Enter a duration in minutes first."
            return
        }
        isSavingToHealth = true
        healthMessage = nil
        do {
            let uuid = try await health.saveWorkout(
                activityType: .from(title: title),
                start: date,
                durationSeconds: minutes * 60,
                energyKcal: Double(healthCaloriesText),
                distanceMeters: Double(healthDistanceText)
            )
            // Persist the current edits and mark as synced.
            save(markHealthUUID: uuid)
            healthMessage = "Saved to Apple Health."
        } catch {
            healthMessage = (error as? HealthKitManager.SaveError)?.errorDescription
                ?? error.localizedDescription
        }
        isSavingToHealth = false
    }

    /// Parse `mm:ss` (or `h:mm:ss`) at the start of a result string → minutes.
    private func minutesFromResult(_ s: String) -> Double? {
        let token = s.split(separator: " ").first.map(String.init) ?? s
        let parts = token.split(separator: ":").compactMap { Int($0) }
        switch parts.count {
        case 2: return Double(parts[0] * 60 + parts[1]) / 60.0
        case 3: return Double(parts[0] * 3600 + parts[1] * 60 + parts[2]) / 60.0
        default: return nil
        }
    }

    /// Parse a distance like "5 km", "1000 m", or "3.1 mi" → meters.
    private func metersFromResult(_ s: String) -> Double? {
        let lower = s.lowercased()
        // Match a number immediately followed by a unit token anywhere in the string.
        let patterns: [(suffix: String, factor: Double)] = [
            ("km", 1000), ("mi", 1609.34), ("m", 1)
        ]
        for (suffix, factor) in patterns {
            // word-boundary-ish: "<num><opt space>suffix"
            let regex = try? NSRegularExpression(
                pattern: "([0-9]+(?:\\.[0-9]+)?)\\s*\(suffix)\\b")
            if let regex,
               let match = regex.firstMatch(in: lower, range: NSRange(lower.startIndex..., in: lower)),
               let r = Range(match.range(at: 1), in: lower),
               let value = Double(lower[r]) {
                return value * factor
            }
        }
        return nil
    }

    private func load() {
        if let entry {
            title = entry.title
            details = entry.details
            type = entry.type
            result = entry.result
            rxd = entry.rxd
            notes = entry.notes
            date = entry.date
            benchmarkName = entry.benchmarkName
            // Auto-fill the Health duration from a timed result when possible.
            if let mins = minutesFromResult(entry.result) {
                healthDurationMin = String(format: "%.0f", mins.rounded())
            }
            // Auto-fill distance (meters) from a distance result when possible.
            if let meters = metersFromResult(entry.result) {
                healthDistanceText = String(format: "%.0f", meters.rounded())
            }
        } else if let b = prefillBenchmark {
            title = b.name
            details = b.description
            type = b.type
            benchmarkName = b.name
        } else if let p = prefill {
            title = p.title
            type = p.type
            result = p.result
            details = p.details
        }
    }

    private func save() {
        applyEdits()
        dismiss()
    }

    /// Save edits and tag the entry with the Health sample UUID. Does not dismiss
    /// (the user may want to keep editing after writing to Health).
    private func save(markHealthUUID uuid: UUID) {
        applyEdits()
        entry?.externalID = "hk-out:\(uuid.uuidString)"
    }

    private func applyEdits() {
        if let entry {
            entry.title = title
            entry.details = details
            entry.type = type
            entry.result = result
            entry.rxd = rxd
            entry.notes = notes
            entry.date = date
        } else {
            let new = WODEntry(
                title: title,
                details: details,
                type: type,
                result: result,
                rxd: rxd,
                notes: notes,
                date: date,
                benchmarkName: benchmarkName
            )
            context.insert(new)
        }
    }
}

/// Lightweight prefill payload used when opening the editor from the timer.
struct PrefillWOD {
    var title: String
    var type: WODType
    var result: String
    var details: String = ""
}

#Preview {
    NavigationStack {
        WODEditView(entry: nil)
    }
    .modelContainer(for: [WODEntry.self, LiftPR.self], inMemory: true)
}
