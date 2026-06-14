import SwiftUI
import SwiftData
import Charts

/// Tracks bodyweight over time, with manual entry and Apple Health import.
struct BodyweightView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \BodyMass.date, order: .reverse) private var entries: [BodyMass]
    @StateObject private var health = HealthKitManager()

    @State private var showingAdd = false
    @State private var importMessage: String?
    @State private var isImporting = false

    /// Chronological (oldest → newest) for the chart.
    private var chronological: [BodyMass] { entries.reversed() }

    /// Display unit follows the most recent entry (defaults to lb).
    private var displayUnit: WeightUnit { entries.first?.unit ?? .lb }

    var body: some View {
        List {
            if entries.count > 1 {
                Section("Trend") {
                    Chart(chronological) { e in
                        LineMark(
                            x: .value("Date", e.date),
                            y: .value("Weight", displayUnit.fromKilograms(e.kilograms))
                        )
                        .symbol(.circle)
                        PointMark(
                            x: .value("Date", e.date),
                            y: .value("Weight", displayUnit.fromKilograms(e.kilograms))
                        )
                    }
                    .frame(height: 200)
                    .padding(.vertical, 4)
                }
            }

            Section {
                Button {
                    Task { await importFromHealth() }
                } label: {
                    HStack {
                        Label("Import from Apple Health", systemImage: "heart.fill")
                        Spacer()
                        if isImporting { ProgressView() }
                    }
                }
                .disabled(isImporting)
            } footer: {
                if let importMessage {
                    Text(importMessage)
                } else {
                    Text("Pulls bodyweight history from Apple Health; already-imported readings are skipped.")
                }
            }

            if entries.isEmpty {
                Section {
                    ContentUnavailableView {
                        Label("No Readings", systemImage: "figure")
                    } description: {
                        Text("Tap + to log your bodyweight, or import from Apple Health.")
                    }
                }
            } else {
                Section("Entries") {
                    ForEach(entries) { e in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.displayWeight).font(.headline)
                                if !e.notes.isEmpty {
                                    Text(e.notes).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 2) {
                                Text(e.date, format: .dateTime.month().day().year())
                                    .font(.caption).foregroundStyle(.secondary)
                                if e.source == "healthkit" {
                                    Text("from Health")
                                        .font(.caption2)
                                        .foregroundStyle(.tint)
                                } else if isExported(e) {
                                    Text("→ Health")
                                        .font(.caption2)
                                        .foregroundStyle(.green)
                                }
                            }
                        }
                        .swipeActions(edge: .leading) {
                            if e.source == "manual", !isExported(e) {
                                Button {
                                    Task { await exportToHealth(e) }
                                } label: {
                                    Label("To Health", systemImage: "heart.fill")
                                }
                                .tint(.pink)
                            }
                        }
                    }
                    .onDelete(perform: delete)
                }
            }
        }
        .navigationTitle("Bodyweight")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingAdd = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showingAdd) {
            NavigationStack { BodyweightEditView(defaultUnit: displayUnit) }
        }
    }

    private func delete(at offsets: IndexSet) {
        for index in offsets { context.delete(entries[index]) }
    }

    private func isExported(_ e: BodyMass) -> Bool {
        e.externalID?.hasPrefix("hk-out:") == true
    }

    private func exportToHealth(_ e: BodyMass) async {
        importMessage = nil
        if health.status != .authorized {
            await health.requestAuthorization()
        }
        do {
            let uuid = try await health.saveBodyMass(kilograms: e.kilograms, date: e.date)
            e.externalID = "hk-out:\(uuid.uuidString)"
            importMessage = "Saved \(e.displayWeight) to Apple Health."
        } catch {
            importMessage = (error as? HealthKitManager.SaveError)?.errorDescription
                ?? error.localizedDescription
        }
    }

    private func importFromHealth() async {
        isImporting = true
        importMessage = nil
        if health.status != .authorized {
            await health.requestAuthorization()
        }
        guard health.status == .authorized else {
            importMessage = "Health access is required. Enable it in Settings → Privacy → Health → WODBook."
            isImporting = false
            return
        }

        let samples = await health.fetchBodyweightHistory()
        let existing = Set(entries.compactMap { $0.externalID })
        var added = 0
        for s in samples {
            let key = s.id.uuidString
            guard !existing.contains(key) else { continue }
            let entry = BodyMass(
                weight: displayUnit.fromKilograms(s.kilograms),
                unit: displayUnit,
                date: s.date,
                source: "healthkit",
                externalID: key
            )
            context.insert(entry)
            added += 1
        }
        importMessage = added == 0
            ? "No new readings to import."
            : "Imported \(added) reading\(added == 1 ? "" : "s") from Apple Health."
        isImporting = false
    }
}

/// Add a bodyweight reading manually.
struct BodyweightEditView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    var defaultUnit: WeightUnit = .lb

    @State private var weightText = ""
    @State private var unit: WeightUnit = .lb
    @State private var date: Date = .now
    @State private var notes = ""

    private var canSave: Bool { Double(weightText) != nil }

    var body: some View {
        Form {
            Section("Reading") {
                HStack {
                    TextField("Weight", text: $weightText)
                        .keyboardType(.decimalPad)
                    Picker("Unit", selection: $unit) {
                        ForEach(WeightUnit.allCases) { u in
                            Text(u.rawValue).tag(u)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 110)
                }
                DatePicker("Date", selection: $date, displayedComponents: .date)
            }
            Section("Notes") {
                TextField("Optional notes", text: $notes, axis: .vertical)
                    .lineLimit(1...4)
            }
        }
        .navigationTitle("Log Bodyweight")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { unit = defaultUnit }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { save() }.disabled(!canSave)
            }
        }
    }

    private func save() {
        guard let weight = Double(weightText) else { return }
        context.insert(BodyMass(weight: weight, unit: unit, date: date, notes: notes))
        dismiss()
    }
}

#Preview {
    NavigationStack { BodyweightView() }
        .modelContainer(for: [WODEntry.self, LiftPR.self, FoodEntry.self,
                              MacroTargets.self, BodyMass.self],
                        inMemory: true)
}
