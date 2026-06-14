import SwiftUI
import SwiftData

/// Daily food & drink log with totals measured against the user's macro goals.
struct NutritionView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \FoodEntry.createdAt, order: .reverse) private var allEntries: [FoodEntry]

    @Query private var allTargets: [MacroTargets]
    @State private var selectedDate: Date = .now
    @State private var showingAdd = false

    /// Read-only view of the user's targets; falls back to defaults until the
    /// settings record is created (via `ensureTargets()` on appear).
    private var targets: MacroTargets { allTargets.first ?? MacroTargets() }

    /// Entries logged on the selected calendar day.
    private var dayEntries: [FoodEntry] {
        allEntries.filter {
            Calendar.current.isDate($0.date, inSameDayAs: selectedDate)
        }
    }

    private var totalCalories: Double { dayEntries.reduce(0) { $0 + $1.calories } }
    private var totalProtein: Double  { dayEntries.reduce(0) { $0 + $1.proteinG } }
    private var totalCarbs: Double    { dayEntries.reduce(0) { $0 + $1.carbsG } }
    private var totalFat: Double      { dayEntries.reduce(0) { $0 + $1.fatG } }
    private var totalFiber: Double    { dayEntries.reduce(0) { $0 + $1.fiberG } }

    var body: some View {
        List {
                Section {
                    DatePicker("Day", selection: $selectedDate,
                               displayedComponents: .date)
                }

                Section("Daily Totals") {
                    MacroProgressRow(label: "Calories", consumed: totalCalories,
                                     target: targets.effectiveCalories,
                                     unit: "kcal", tint: .orange)
                    MacroProgressRow(label: "Protein", consumed: totalProtein,
                                     target: targets.proteinG, unit: "g", tint: .red)
                    MacroProgressRow(label: "Carbs", consumed: totalCarbs,
                                     target: targets.carbsG, unit: "g", tint: .blue)
                    MacroProgressRow(label: "Fat", consumed: totalFat,
                                     target: targets.fatG, unit: "g", tint: .yellow)
                    if targets.fiberG > 0 {
                        MacroProgressRow(label: "Fiber", consumed: totalFiber,
                                         target: targets.fiberG, unit: "g", tint: .green)
                    }
                }

                if dayEntries.isEmpty {
                    Section {
                        ContentUnavailableView {
                            Label("Nothing logged", systemImage: "fork.knife")
                        } description: {
                            Text("Tap + to add food or a drink for this day.")
                        }
                    }
                } else {
                    ForEach(MealSlot.allCases.sorted { $0.sortIndex < $1.sortIndex }) { meal in
                        let items = dayEntries.filter { $0.meal == meal }
                        if !items.isEmpty {
                            Section {
                                ForEach(items) { item in
                                    NavigationLink {
                                        FoodEditView(entry: item)
                                    } label: {
                                        FoodRow(entry: item)
                                    }
                                }
                                .onDelete { offsets in delete(items, at: offsets) }
                            } header: {
                                Label(meal.rawValue, systemImage: meal.systemImage)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Nutrition")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink {
                        MacroTargetsView()
                    } label: {
                        Image(systemName: "target")
                    }
                }
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
                    FoodEditView(entry: nil, defaultDate: selectedDate)
                }
            }
            .onAppear { ensureTargets() }
    }

    /// Creates the singleton macro-targets record if it doesn't exist yet.
    private func ensureTargets() {
        if allTargets.isEmpty {
            context.insert(MacroTargets())
        }
    }

    private func delete(_ items: [FoodEntry], at offsets: IndexSet) {
        for index in offsets {
            context.delete(items[index])
        }
    }
}

/// One macro's consumed-vs-target progress bar.
struct MacroProgressRow: View {
    let label: String
    let consumed: Double
    let target: Double
    let unit: String
    let tint: Color

    private var fraction: Double {
        guard target > 0 else { return 0 }
        return min(consumed / target, 1)
    }

    private var remaining: Double { max(target - consumed, 0) }
    private var over: Bool { target > 0 && consumed > target }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).font(.subheadline.weight(.medium))
                Spacer()
                Text("\(Int(consumed)) / \(Int(target)) \(unit)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            ProgressView(value: fraction)
                .tint(over ? .red : tint)
            Text(over
                 ? "Over by \(Int(consumed - target)) \(unit)"
                 : "\(Int(remaining)) \(unit) left")
                .font(.caption)
                .foregroundStyle(over ? .red : .secondary)
        }
        .padding(.vertical, 2)
    }
}

/// A compact row for a single food/drink entry.
struct FoodRow: View {
    let entry: FoodEntry

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.name)
                    .font(.headline)
                    .lineLimit(1)
                Text(entry.displayAmount)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if entry.calories > 0 {
                Text("\(Int(entry.calories)) kcal")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

#Preview {
    NavigationStack { NutritionView() }
        .modelContainer(for: [WODEntry.self, LiftPR.self,
                              FoodEntry.self, MacroTargets.self],
                        inMemory: true)
}
