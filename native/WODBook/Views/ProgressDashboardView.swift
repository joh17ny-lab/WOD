import SwiftUI
import SwiftData
import Charts

/// Overview of training volume and lift progress.
struct ProgressDashboardView: View {
    @Query(sort: \WODEntry.date) private var entries: [WODEntry]
    @Query(sort: \LiftPR.date) private var prs: [LiftPR]
    @Query(sort: \BodyMass.date) private var bodyweights: [BodyMass]

    var body: some View {
        List {
            statsSection
            volumeSection
            bodyweightSection
            liftSection
        }
        .navigationTitle("Progress")
    }

    // MARK: - Summary stats

    private var statsSection: some View {
        Section {
            HStack {
                statTile(title: "Workouts", value: "\(entries.count)", icon: "flame.fill")
                statTile(title: "This Month", value: "\(workoutsThisMonth)", icon: "calendar")
                statTile(title: "Lifts", value: "\(uniqueLifts)", icon: "scalemass.fill")
            }
            .listRowInsets(EdgeInsets())
            .padding(.vertical, 4)

            if importedWorkouts > 0 {
                HStack {
                    Image(systemName: "heart.fill").foregroundStyle(.tint)
                    Text("\(importedWorkouts) workout\(importedWorkouts == 1 ? "" : "s") imported from devices")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func statTile(title: String, value: String, icon: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon).foregroundStyle(.tint)
            Text(value).font(.title2.bold())
            Text(title).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }

    // MARK: - Workout volume by month

    private var volumeSection: some View {
        Section("Workouts per Month") {
            if monthlyVolume.isEmpty {
                Text("Log workouts to see your training volume.")
                    .foregroundStyle(.secondary)
            } else {
                Chart(monthlyVolume) { bucket in
                    BarMark(
                        x: .value("Month", bucket.month, unit: .month),
                        y: .value("Workouts", bucket.count)
                    )
                    .foregroundStyle(.tint)
                }
                .frame(height: 200)
                .padding(.vertical, 4)
            }
        }
    }

    // MARK: - Bodyweight trend

    private var bodyweightSection: some View {
        Section("Bodyweight") {
            if bodyweights.count < 2 {
                Text("Log bodyweight (or import from Apple Health) to see your trend.")
                    .foregroundStyle(.secondary)
            } else {
                let unit = bodyweights.last?.unit ?? .lb
                Chart(bodyweights) { bw in
                    LineMark(
                        x: .value("Date", bw.date),
                        y: .value("Weight", unit.fromKilograms(bw.kilograms))
                    )
                    .symbol(.circle)
                }
                .frame(height: 180)
                .padding(.vertical, 4)
            }
        }
    }

    // MARK: - Lift progress

    private var liftSection: some View {
        Section("Lift Maxes") {
            if topLifts.isEmpty {
                Text("Log lift maxes to track strength gains.")
                    .foregroundStyle(.secondary)
            } else {
                Chart {
                    ForEach(topLifts, id: \.self) { lift in
                        let best = prs.filter { $0.liftName == lift }
                            .max { $0.estimatedOneRepMax < $1.estimatedOneRepMax }
                        if let best {
                            BarMark(
                                x: .value("e1RM", best.estimatedOneRepMax),
                                y: .value("Lift", lift)
                            )
                            .annotation(position: .trailing) {
                                Text("\(Int(best.estimatedOneRepMax))")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                .frame(height: CGFloat(topLifts.count * 44 + 20))
                .padding(.vertical, 4)
            }
        }
    }

    // MARK: - Derived data

    private var workoutsThisMonth: Int {
        let cal = Calendar.current
        return entries.filter {
            cal.isDate($0.date, equalTo: .now, toGranularity: .month)
        }.count
    }

    private var uniqueLifts: Int { Set(prs.map(\.liftName)).count }

    private var importedWorkouts: Int {
        entries.filter { $0.source != "manual" }.count
    }

    private var topLifts: [String] {
        Array(Set(prs.map(\.liftName))).sorted().prefix(6).map { $0 }
    }

    private struct MonthBucket: Identifiable {
        let id = UUID()
        let month: Date
        let count: Int
    }

    private var monthlyVolume: [MonthBucket] {
        let cal = Calendar.current
        let groups = Dictionary(grouping: entries) { entry -> Date in
            let comps = cal.dateComponents([.year, .month], from: entry.date)
            return cal.date(from: comps) ?? entry.date
        }
        return groups
            .map { MonthBucket(month: $0.key, count: $0.value.count) }
            .sorted { $0.month < $1.month }
    }
}

#Preview {
    NavigationStack { ProgressDashboardView() }
        .modelContainer(for: [WODEntry.self, LiftPR.self, FoodEntry.self,
                              MacroTargets.self, BodyMass.self],
                        inMemory: true)
}
