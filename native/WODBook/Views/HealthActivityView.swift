import SwiftUI
import SwiftData

/// Connects to Apple Health, lists recent workouts (from Apple Watch, Garmin,
/// Fitbit, etc. that write to Health), and imports them into the WOD log.
struct HealthActivityView: View {
    @Environment(\.modelContext) private var context
    @StateObject private var health = HealthKitManager()

    /// Existing imported entries — used to skip duplicates.
    @Query private var entries: [WODEntry]

    @State private var importedIDs: Set<String> = []

    private var existingExternalIDs: Set<String> {
        Set(entries.compactMap { $0.externalID })
    }

    var body: some View {
        List {
            switch health.status {
            case .unavailable:
                Section {
                    ContentUnavailableView {
                        Label("Health Unavailable", systemImage: "heart.slash")
                    } description: {
                        Text("This device doesn't provide Apple Health data.")
                    }
                }

            case .denied:
                Section {
                    Text("Health access was denied. Enable it in Settings → Privacy → Health → WODBook, then return here.")
                        .foregroundStyle(.secondary)
                    Button("Try Again") {
                        Task { await health.requestAuthorization() }
                    }
                }

            case .unknown:
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Link Apple Health")
                            .font(.headline)
                        Text("Import workouts and bodyweight from Apple Health. Apple Watch writes here directly, and Garmin, Fitbit, and Whoop apps can sync into Health too.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Button {
                            Task { await health.requestAuthorization() }
                        } label: {
                            Label("Connect to Health", systemImage: "heart.fill")
                        }
                        .buttonStyle(.borderedProminent)
                        .padding(.top, 4)
                    }
                    .padding(.vertical, 4)
                }

            case .authorized:
                authorizedContent
            }
        }
        .navigationTitle("Apple Health")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if health.status == .authorized {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await health.refresh() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(health.isLoading)
                }
            }
        }
    }

    @ViewBuilder
    private var authorizedContent: some View {
        if let bw = health.latestBodyweight {
            Section {
                LabeledContent("Latest from Health") {
                    Text("\(bw.kilograms, specifier: "%.1f") kg")
                }
                LabeledContent("Recorded") {
                    Text(bw.date, format: .dateTime.month().day().year())
                }
                NavigationLink {
                    BodyweightView()
                } label: {
                    Label("Bodyweight Tracking", systemImage: "figure")
                }
            } header: {
                Text("Bodyweight")
            } footer: {
                Text("Open Bodyweight Tracking to import your full history from Apple Health.")
            }
        }

        Section {
            if health.isLoading {
                HStack { ProgressView(); Text("Loading…") }
            } else if health.workouts.isEmpty {
                Text("No workouts found in the last 90 days.")
                    .foregroundStyle(.secondary)
            } else {
                if pendingCount > 0 {
                    Button {
                        importAll()
                    } label: {
                        Label("Import All (\(pendingCount))", systemImage: "square.and.arrow.down.on.square")
                    }
                }
                ForEach(health.workouts) { wk in
                    HealthWorkoutRow(
                        workout: wk,
                        alreadyImported: isImported(wk),
                        onImport: { importWorkout(wk) }
                    )
                }
            }
        } header: {
            Text("Recent Workouts")
        } footer: {
            if let msg = health.errorMessage {
                Text(msg).foregroundStyle(.red)
            } else {
                Text("Imported workouts appear in your Log. Re-importing the same workout is skipped automatically.")
            }
        }
    }

    private func isImported(_ wk: HealthWorkout) -> Bool {
        let key = wk.id.uuidString
        return importedIDs.contains(key) || existingExternalIDs.contains(key)
    }

    private var pendingCount: Int {
        health.workouts.filter { !isImported($0) }.count
    }

    private func importAll() {
        for wk in health.workouts where !isImported(wk) {
            importWorkout(wk)
        }
    }

    private func importWorkout(_ wk: HealthWorkout) {
        let key = wk.id.uuidString
        guard !isImported(wk) else { return }

        var resultParts: [String] = [TimeFormat.mmss(Int(wk.duration))]
        if let kcal = wk.energyKcal { resultParts.append("\(Int(kcal)) kcal") }
        if let m = wk.distanceMeters, m > 0 { resultParts.append("\(Int(m)) m") }

        let entry = WODEntry(
            title: wk.activityName,
            details: "Imported from \(wk.sourceName) via Apple Health.",
            type: .other,
            result: resultParts.joined(separator: " · "),
            date: wk.start,
            source: "healthkit",
            externalID: key
        )
        context.insert(entry)
        importedIDs.insert(key)
    }
}

private struct HealthWorkoutRow: View {
    let workout: HealthWorkout
    let alreadyImported: Bool
    let onImport: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(workout.activityName)
                    .font(.headline)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(TimeFormat.mmss(Int(workout.duration)))
                    if let kcal = workout.energyKcal {
                        Text("•"); Text("\(Int(kcal)) kcal")
                    }
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
                Text(workout.start, format: .dateTime.month().day().hour().minute())
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if alreadyImported {
                Label("Added", systemImage: "checkmark.circle.fill")
                    .labelStyle(.iconOnly)
                    .foregroundStyle(.green)
            } else {
                Button("Import", action: onImport)
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
        }
        .padding(.vertical, 2)
    }
}
