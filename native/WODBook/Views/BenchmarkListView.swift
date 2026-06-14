import SwiftUI
import SwiftData

/// Browse the built-in benchmark WODs (Girls / Heroes).
struct BenchmarkListView: View {
    var body: some View {
        NavigationStack {
            List {
                ForEach(BenchmarkCategory.allCases) { category in
                    Section {
                        ForEach(SeedData.benchmarks(in: category)) { benchmark in
                            NavigationLink {
                                BenchmarkDetailView(benchmark: benchmark)
                            } label: {
                                HStack {
                                    Image(systemName: category.systemImage)
                                        .foregroundStyle(.tint)
                                        .frame(width: 24)
                                    Text(benchmark.name)
                                        .font(.headline)
                                    Spacer()
                                    Text(benchmark.type.rawValue)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    } header: {
                        Label(category.rawValue, systemImage: category.systemImage)
                    }
                }
            }
            .navigationTitle("Benchmarks")
        }
    }
}

/// Detail of a benchmark with the user's attempt history and best result.
struct BenchmarkDetailView: View {
    @Environment(\.modelContext) private var context
    let benchmark: Benchmark

    @Query private var allEntries: [WODEntry]
    @State private var showingLog = false

    init(benchmark: Benchmark) {
        self.benchmark = benchmark
        let name = benchmark.name
        _allEntries = Query(
            filter: #Predicate<WODEntry> { $0.benchmarkName == name },
            sort: \WODEntry.date, order: .reverse
        )
    }

    var body: some View {
        List {
            Section("Workout") {
                Text(benchmark.description)
                    .font(.body)
                LabeledContent("Type", value: benchmark.type.rawValue)
            }

            if let best = bestEntry {
                Section("Personal Best") {
                    HStack {
                        Image(systemName: "trophy.fill")
                            .foregroundStyle(.yellow)
                        VStack(alignment: .leading) {
                            Text(best.result.isEmpty ? "—" : best.result)
                                .font(.title3.bold())
                            Text(best.date, format: .dateTime.month().day().year())
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        if best.rxd {
                            Spacer()
                            Text("RX").font(.caption.bold())
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(.tint, in: Capsule())
                                .foregroundStyle(.white)
                        }
                    }
                }
            }

            Section("History (\(allEntries.count))") {
                if allEntries.isEmpty {
                    Text("No attempts logged yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(allEntries) { entry in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(entry.result.isEmpty ? "—" : entry.result)
                                    .font(.headline)
                                Text(entry.date, format: .dateTime.month().day().year())
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if entry.rxd {
                                Text("RX").font(.caption2.bold())
                                    .foregroundStyle(.tint)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(benchmark.name)
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingLog = true
                } label: {
                    Label("Log Attempt", systemImage: "plus")
                }
            }
        }
        .sheet(isPresented: $showingLog) {
            NavigationStack {
                WODEditView(entry: nil, prefillBenchmark: benchmark)
            }
        }
    }

    /// "Best" = for timed WODs the fastest; otherwise most recent with a result.
    private var bestEntry: WODEntry? {
        let scored = allEntries.filter { !$0.result.isEmpty }
        guard !scored.isEmpty else { return nil }

        if benchmark.type == .forTime {
            return scored.min { lhs, rhs in
                (parseTime(lhs.result) ?? .greatestFiniteMagnitude) <
                (parseTime(rhs.result) ?? .greatestFiniteMagnitude)
            }
        }
        return scored.first
    }

    /// Parse "mm:ss" or "m:ss" into seconds for comparison.
    private func parseTime(_ s: String) -> Double? {
        let parts = s.split(separator: ":")
        if parts.count == 2,
           let m = Double(parts[0]), let sec = Double(parts[1]) {
            return m * 60 + sec
        }
        return Double(s)
    }
}

#Preview {
    BenchmarkListView()
        .modelContainer(for: [WODEntry.self, LiftPR.self], inMemory: true)
}
