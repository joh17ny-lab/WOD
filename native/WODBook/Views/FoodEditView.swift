import SwiftUI
import SwiftData

/// Add or edit a food / drink entry. Pass `nil` to create a new one.
struct FoodEditView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    /// nil = creating; non-nil = editing.
    var entry: FoodEntry?
    /// Default date for new entries (e.g. the day being viewed).
    var defaultDate: Date = .now
    /// Default meal slot for new entries.
    var defaultMeal: MealSlot = .breakfast

    @State private var name = ""
    @State private var quantityText = "1"
    @State private var category: MeasureCategory = .solid
    @State private var unit: FoodUnit = .gram
    @State private var meal: MealSlot = .breakfast
    @State private var caloriesText = ""
    @State private var proteinText = ""
    @State private var carbsText = ""
    @State private var fatText = ""
    @State private var fiberText = ""
    @State private var notes = ""
    @State private var date: Date = .now

    private var isEditing: Bool { entry != nil }

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty &&
        Double(quantityText) != nil
    }

    var body: some View {
        Form {
            Section("Item") {
                TextField("Name (e.g. Chicken breast)", text: $name)

                Picker("Meal", selection: $meal) {
                    ForEach(MealSlot.allCases) { m in
                        Label(m.rawValue, systemImage: m.systemImage).tag(m)
                    }
                }

                DatePicker("Date", selection: $date, displayedComponents: .date)
            }

            Section("Amount") {
                Picker("Measure", selection: $category) {
                    ForEach(MeasureCategory.allCases) { c in
                        Text(c.displayName).tag(c)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: category) { _, newCategory in
                    // Keep the selected unit valid for the chosen category.
                    if unit.category != newCategory {
                        unit = FoodUnit.units(in: newCategory).first ?? .gram
                    }
                }

                HStack {
                    TextField("Quantity", text: $quantityText)
                        .keyboardType(.decimalPad)
                    Picker("Unit", selection: $unit) {
                        ForEach(FoodUnit.units(in: category)) { u in
                            Text(u.displayName).tag(u)
                        }
                    }
                    .frame(maxWidth: 130)
                }
            }

            Section {
                nutrientField("Calories", unit: "kcal", text: $caloriesText)
                nutrientField("Protein", unit: "g", text: $proteinText)
                nutrientField("Carbs", unit: "g", text: $carbsText)
                nutrientField("Fat", unit: "g", text: $fatText)
                nutrientField("Fiber", unit: "g", text: $fiberText)
            } header: {
                Text("Nutrition")
            } footer: {
                Text("All nutrition fields are optional. Leave blank if unknown.")
            }

            Section("Notes") {
                TextField("Optional notes", text: $notes, axis: .vertical)
                    .lineLimit(1...4)
            }
        }
        .navigationTitle(isEditing ? "Edit Food" : "Add Food")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { save() }.disabled(!canSave)
            }
        }
        .onAppear(perform: load)
    }

    @ViewBuilder
    private func nutrientField(_ label: String, unit: String,
                              text: Binding<String>) -> some View {
        HStack {
            Text(label)
            Spacer()
            TextField("0", text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 90)
            Text(unit)
                .foregroundStyle(.secondary)
                .frame(width: 36, alignment: .leading)
        }
    }

    private func load() {
        if let entry {
            name = entry.name
            quantityText = trimmed(entry.quantity)
            unit = entry.unit
            category = entry.unit.category
            meal = entry.meal
            caloriesText = optionalText(entry.calories)
            proteinText = optionalText(entry.proteinG)
            carbsText = optionalText(entry.carbsG)
            fatText = optionalText(entry.fatG)
            fiberText = optionalText(entry.fiberG)
            notes = entry.notes
            date = entry.date
        } else {
            date = defaultDate
            meal = defaultMeal
        }
    }

    private func save() {
        guard let quantity = Double(quantityText) else { return }
        if let entry {
            entry.name = name
            entry.quantity = quantity
            entry.unit = unit
            entry.meal = meal
            entry.calories = Double(caloriesText) ?? 0
            entry.proteinG = Double(proteinText) ?? 0
            entry.carbsG = Double(carbsText) ?? 0
            entry.fatG = Double(fatText) ?? 0
            entry.fiberG = Double(fiberText) ?? 0
            entry.notes = notes
            entry.date = date
        } else {
            let new = FoodEntry(
                name: name,
                quantity: quantity,
                unit: unit,
                meal: meal,
                calories: Double(caloriesText) ?? 0,
                proteinG: Double(proteinText) ?? 0,
                carbsG: Double(carbsText) ?? 0,
                fatG: Double(fatText) ?? 0,
                fiberG: Double(fiberText) ?? 0,
                notes: notes,
                date: date
            )
            context.insert(new)
        }
        dismiss()
    }

    private func trimmed(_ value: Double) -> String {
        value.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(value))
            : String(format: "%.2f", value)
    }

    private func optionalText(_ value: Double) -> String {
        value == 0 ? "" : trimmed(value)
    }
}

#Preview {
    NavigationStack { FoodEditView(entry: nil) }
        .modelContainer(for: [WODEntry.self, LiftPR.self,
                              FoodEntry.self, MacroTargets.self],
                        inMemory: true)
}
