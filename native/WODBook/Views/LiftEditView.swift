import SwiftUI
import SwiftData

/// Add a new lift PR entry.
struct LiftEditView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    var presetLiftName: String?

    @State private var liftName = ""
    @State private var useCustomName = false
    @State private var selectedCommon: CommonLift = .backSquat
    @State private var weightText = ""
    @State private var unit: WeightUnit = .lb
    @State private var reps = 1
    @State private var date: Date = .now
    @State private var notes = ""

    private var resolvedName: String {
        if let presetLiftName { return presetLiftName }
        return useCustomName ? liftName : selectedCommon.rawValue
    }

    private var canSave: Bool {
        !resolvedName.trimmingCharacters(in: .whitespaces).isEmpty &&
        Double(weightText) != nil
    }

    var body: some View {
        Form {
            Section("Lift") {
                if presetLiftName == nil {
                    Toggle("Custom lift name", isOn: $useCustomName)
                    if useCustomName {
                        TextField("Lift name", text: $liftName)
                    } else {
                        Picker("Lift", selection: $selectedCommon) {
                            ForEach(CommonLift.allCases) { lift in
                                Text(lift.rawValue).tag(lift)
                            }
                        }
                    }
                } else {
                    LabeledContent("Lift", value: presetLiftName ?? "")
                }
            }

            Section("Result") {
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
                Stepper("Reps: \(reps)", value: $reps, in: 1...20)
                DatePicker("Date", selection: $date, displayedComponents: .date)

                if reps > 1, let w = Double(weightText) {
                    let e1rm = w * (1.0 + Double(reps) / 30.0)
                    LabeledContent("Estimated 1RM",
                                   value: "\(Int(e1rm)) \(unit.rawValue)")
                        .foregroundStyle(.secondary)
                }
            }

            Section("Notes") {
                TextField("Optional notes", text: $notes, axis: .vertical)
                    .lineLimit(1...4)
            }
        }
        .navigationTitle("Log Max")
        .navigationBarTitleDisplayMode(.inline)
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
        let pr = LiftPR(
            liftName: resolvedName,
            weight: weight,
            unit: unit,
            reps: reps,
            date: date,
            notes: notes
        )
        context.insert(pr)
        dismiss()
    }
}

#Preview {
    NavigationStack { LiftEditView() }
        .modelContainer(for: [WODEntry.self, LiftPR.self], inMemory: true)
}
