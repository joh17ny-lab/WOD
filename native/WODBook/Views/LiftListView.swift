import SwiftUI
import SwiftData
import Charts

/// Lists each lift the user tracks with its current best 1RM.
struct LiftListView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \LiftPR.date, order: .reverse) private var prs: [LiftPR]

    @State private var showingAdd = false

    /// Group PRs by lift name, sorted alphabetically.
    private var liftNames: [String] {
        Array(Set(prs.map(\.liftName))).sorted()
    }

    private func bestE1RM(for lift: String) -> LiftPR? {
        prs.filter { $0.liftName == lift }
            .max { $0.estimatedOneRepMax < $1.estimatedOneRepMax }
    }

    var body: some View {
        NavigationStack {
            Group {
                if prs.isEmpty {
                    ContentUnavailableView {
                        Label("No Lifts Tracked", systemImage: "scalemass")
                    } description: {
                        Text("Tap + to log a max for any lift.")
                    }
                } else {
                    List {
                        ForEach(liftNames, id: \.self) { lift in
                            NavigationLink {
                                LiftDetailView(liftName: lift)
                            } label: {
                                HStack {
                                    Image(systemName: "scalemass.fill")
                                        .foregroundStyle(.tint)
                                        .frame(width: 24)
                                    Text(lift)
                                        .font(.headline)
                                    Spacer()
                                    if let best = bestE1RM(for: lift) {
                                        VStack(alignment: .trailing) {
                                            Text(best.displayWeight)
                                                .font(.headline)
                                            if best.reps > 1 {
                                                Text("est. 1RM \(Int(best.estimatedOneRepMax)) \(best.unit.rawValue)")
                                                    .font(.caption2)
                                                    .foregroundStyle(.secondary)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Lifts")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingAdd = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showingAdd) {
                NavigationStack { LiftEditView() }
            }
        }
    }
}

/// Detail showing all logged maxes for one lift + a progress chart.
struct LiftDetailView: View {
    @Environment(\.modelContext) private var context
    let liftName: String

    @Query private var prs: [LiftPR]
    @State private var showingAdd = false

    init(liftName: String) {
        self.liftName = liftName
        let name = liftName
        _prs = Query(
            filter: #Predicate<LiftPR> { $0.liftName == name },
            sort: \LiftPR.date, order: .forward
        )
    }

    var body: some View {
        List {
            if prs.count > 1 {
                Section("Estimated 1RM over time") {
                    Chart(prs) { pr in
                        LineMark(
                            x: .value("Date", pr.date),
                            y: .value("e1RM", pr.estimatedOneRepMax)
                        )
                        .symbol(.circle)
                        PointMark(
                            x: .value("Date", pr.date),
                            y: .value("e1RM", pr.estimatedOneRepMax)
                        )
                    }
                    .frame(height: 200)
                }
            }

            Section("Entries") {
                ForEach(prs.reversed()) { pr in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(pr.displayWeight) × \(pr.reps)")
                                .font(.headline)
                            if pr.reps > 1 {
                                Text("est. 1RM \(Int(pr.estimatedOneRepMax)) \(pr.unit.rawValue)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            if !pr.notes.isEmpty {
                                Text(pr.notes).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        Text(pr.date, format: .dateTime.month().day().year())
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .onDelete(perform: delete)
            }
        }
        .navigationTitle(liftName)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingAdd = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showingAdd) {
            NavigationStack { LiftEditView(presetLiftName: liftName) }
        }
    }

    private func delete(at offsets: IndexSet) {
        let reversed = Array(prs.reversed())
        for index in offsets { context.delete(reversed[index]) }
    }
}

#Preview {
    LiftListView()
        .modelContainer(for: [WODEntry.self, LiftPR.self], inMemory: true)
}
