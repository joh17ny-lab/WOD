import SwiftUI
import SwiftData

/// The main WOD history / log screen.
struct HistoryView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \WODEntry.date, order: .reverse) private var entries: [WODEntry]

    @State private var showingAdd = false
    @State private var searchText = ""

    private var filtered: [WODEntry] {
        guard !searchText.isEmpty else { return entries }
        return entries.filter {
            $0.title.localizedCaseInsensitiveContains(searchText) ||
            $0.details.localizedCaseInsensitiveContains(searchText) ||
            $0.notes.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if entries.isEmpty {
                    ContentUnavailableView {
                        Label("No Workouts Yet", systemImage: "list.bullet.rectangle")
                    } description: {
                        Text("Tap + to log your first WOD.")
                    }
                } else {
                    List {
                        ForEach(filtered) { entry in
                            NavigationLink {
                                WODEditView(entry: entry)
                            } label: {
                                WODRow(entry: entry)
                            }
                        }
                        .onDelete(perform: delete)
                    }
                    .searchable(text: $searchText, prompt: "Search workouts")
                }
            }
            .navigationTitle("Log")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingAdd = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingAdd) {
                NavigationStack {
                    WODEditView(entry: nil)
                }
            }
        }
    }

    private func delete(at offsets: IndexSet) {
        for index in offsets {
            context.delete(filtered[index])
        }
    }
}

/// A compact row summarizing a logged WOD.
struct WODRow: View {
    let entry: WODEntry

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: entry.type.systemImage)
                .font(.title3)
                .frame(width: 32)
                .foregroundStyle(.tint)

            VStack(alignment: .leading, spacing: 2) {
                Text(entry.title)
                    .font(.headline)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(entry.type.rawValue)
                    if !entry.result.isEmpty {
                        Text("•")
                        Text(entry.result)
                    }
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                if entry.rxd {
                    Text("RX")
                        .font(.caption2.bold())
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.tint, in: Capsule())
                        .foregroundStyle(.white)
                }
                Text(entry.date, format: .dateTime.month().day())
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

#Preview {
    HistoryView()
        .modelContainer(for: [WODEntry.self, LiftPR.self], inMemory: true)
}
