import SwiftUI
import SwiftData

/// Settings form for the user's daily macro / nutrition goals.
struct MacroTargetsView: View {
    @Environment(\.modelContext) private var context
    @Query private var allTargets: [MacroTargets]

    var body: some View {
        Group {
            if let targets = allTargets.first {
                form(for: targets)
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Macro Goals")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if allTargets.isEmpty { context.insert(MacroTargets()) }
        }
    }

    @ViewBuilder
    private func form(for targets: MacroTargets) -> some View {
        Form {
            Section {
                Toggle("Calculate calories from macros",
                       isOn: Binding(
                        get: { targets.deriveCaloriesFromMacros },
                        set: { targets.deriveCaloriesFromMacros = $0; targets.updatedAt = .now }
                       ))
            } footer: {
                Text("When on, your calorie goal is computed from protein, carbs, and fat (4 / 4 / 9 kcal per gram).")
            }

            Section("Calories") {
                if targets.deriveCaloriesFromMacros {
                    LabeledContent("Daily calories",
                                   value: "\(Int(targets.caloriesFromMacros)) kcal")
                        .foregroundStyle(.secondary)
                } else {
                    macroField("Daily calories", unit: "kcal",
                               value: Binding(
                                get: { targets.calories },
                                set: { targets.calories = $0; targets.updatedAt = .now }))
                }
            }

            Section("Macros") {
                macroField("Protein", unit: "g",
                           value: Binding(
                            get: { targets.proteinG },
                            set: { targets.proteinG = $0; targets.updatedAt = .now }))
                macroField("Carbs", unit: "g",
                           value: Binding(
                            get: { targets.carbsG },
                            set: { targets.carbsG = $0; targets.updatedAt = .now }))
                macroField("Fat", unit: "g",
                           value: Binding(
                            get: { targets.fatG },
                            set: { targets.fatG = $0; targets.updatedAt = .now }))
                macroField("Fiber", unit: "g",
                           value: Binding(
                            get: { targets.fiberG },
                            set: { targets.fiberG = $0; targets.updatedAt = .now }))
            }

            Section("Hydration") {
                macroField("Water", unit: "mL",
                           value: Binding(
                            get: { targets.waterML },
                            set: { targets.waterML = $0; targets.updatedAt = .now }))
            }
        }
    }

    @ViewBuilder
    private func macroField(_ label: String, unit: String,
                            value: Binding<Double>) -> some View {
        HStack {
            Text(label)
            Spacer()
            TextField(label, value: value, format: .number)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 90)
            Text(unit)
                .foregroundStyle(.secondary)
                .frame(width: 36, alignment: .leading)
        }
    }
}

#Preview {
    NavigationStack { MacroTargetsView() }
        .modelContainer(for: [WODEntry.self, LiftPR.self,
                              FoodEntry.self, MacroTargets.self],
                        inMemory: true)
}
