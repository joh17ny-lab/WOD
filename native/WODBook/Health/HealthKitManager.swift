import Foundation
import HealthKit

/// A workout summary read from Apple Health (which can originate from the
/// Apple Watch, Garmin/Fitbit/Whoop apps that write to Health, etc.).
struct HealthWorkout: Identifiable {
    let id: UUID                 // HKWorkout.uuid — used for dedup
    let activityName: String
    let start: Date
    let duration: TimeInterval   // seconds
    let energyKcal: Double?
    let distanceMeters: Double?
    let sourceName: String       // e.g. "Apple Watch", "Garmin Connect"
}

/// A bodyweight sample read from Apple Health. `id` is the HealthKit sample
/// UUID so imports can be de-duplicated.
struct HealthBodyweight: Identifiable {
    var id = UUID()
    let kilograms: Double
    let date: Date
}

/// Wraps HealthKit reads. Apple Health is the on-device hub: an Apple Watch
/// writes directly, and Garmin / Fitbit / Whoop write into Health via their
/// own apps — so reading Health covers all of them without a server.
@MainActor
final class HealthKitManager: ObservableObject {
    enum Status: Equatable {
        case unknown
        case unavailable          // device has no HealthKit (e.g. iPad without it)
        case denied
        case authorized
    }

    @Published var status: Status = .unknown
    @Published var workouts: [HealthWorkout] = []
    @Published var latestBodyweight: HealthBodyweight?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let store = HKHealthStore()

    /// Types we request read access to.
    private var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = [HKObjectType.workoutType()]
        if let energy = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) {
            types.insert(energy)
        }
        if let hr = HKQuantityType.quantityType(forIdentifier: .heartRate) {
            types.insert(hr)
        }
        if let weight = HKQuantityType.quantityType(forIdentifier: .bodyMass) {
            types.insert(weight)
        }
        return types
    }

    /// Types we request write (share) access to — needed to save workouts and
    /// bodyweight back to Health.
    private var shareTypes: Set<HKSampleType> {
        var types: Set<HKSampleType> = [HKObjectType.workoutType()]
        if let energy = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) {
            types.insert(energy)
        }
        if let weight = HKQuantityType.quantityType(forIdentifier: .bodyMass) {
            types.insert(weight)
        }
        return types
    }

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    /// Request authorization (read + write), then load recent data on success.
    func requestAuthorization() async {
        guard isAvailable else { status = .unavailable; return }
        do {
            try await store.requestAuthorization(toShare: shareTypes, read: readTypes)
            status = .authorized
            await refresh()
        } catch {
            status = .denied
            errorMessage = error.localizedDescription
        }
    }

    /// Reload recent workouts + latest bodyweight.
    func refresh(daysBack: Int = 90) async {
        guard isAvailable else { return }
        isLoading = true
        errorMessage = nil
        async let w = fetchWorkouts(daysBack: daysBack)
        async let bw = fetchLatestBodyweight()
        workouts = await w
        latestBodyweight = await bw
        isLoading = false
        if status == .unknown { status = .authorized }
    }

    /// Errors surfaced when writing a workout back to Health.
    enum SaveError: LocalizedError {
        case notAuthorized
        case unavailable
        var errorDescription: String? {
            switch self {
            case .notAuthorized: return "Allow WODBook to write to Apple Health first."
            case .unavailable:   return "Apple Health isn't available on this device."
            }
        }
    }

    /// Write a workout to Apple Health using the modern `HKWorkoutBuilder`.
    /// Returns the saved sample's UUID so the caller can store it for dedup.
    func saveWorkout(
        activityType: HKWorkoutActivityType,
        start: Date,
        durationSeconds: TimeInterval,
        energyKcal: Double?,
        distanceMeters: Double?
    ) async throws -> UUID {
        guard isAvailable else { throw SaveError.unavailable }

        // Ensure we can share workouts; prompt if not yet determined.
        let workoutType = HKObjectType.workoutType()
        if store.authorizationStatus(for: workoutType) != .sharingAuthorized {
            try await store.requestAuthorization(toShare: shareTypes, read: readTypes)
            guard store.authorizationStatus(for: workoutType) == .sharingAuthorized else {
                throw SaveError.notAuthorized
            }
        }

        let end = start.addingTimeInterval(max(1, durationSeconds))
        let config = HKWorkoutConfiguration()
        config.activityType = activityType

        let builder = HKWorkoutBuilder(healthStore: store, configuration: config, device: .local())
        try await builder.beginCollection(at: start)

        var samples: [HKSample] = []
        if let kcal = energyKcal, kcal > 0,
           let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) {
            let q = HKQuantity(unit: .kilocalorie(), doubleValue: kcal)
            samples.append(HKCumulativeQuantitySample(
                type: energyType, quantity: q, start: start, end: end))
        }
        if let meters = distanceMeters, meters > 0,
           let distType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning) {
            let q = HKQuantity(unit: .meter(), doubleValue: meters)
            samples.append(HKCumulativeQuantitySample(
                type: distType, quantity: q, start: start, end: end))
        }
        if !samples.isEmpty {
            try await builder.addSamples(samples)
        }

        try await builder.endCollection(at: end)
        guard let workout = try await builder.finishWorkout() else {
            throw SaveError.unavailable
        }
        return workout.uuid
    }

    /// Write a bodyweight reading to Apple Health. Returns the sample UUID.
    func saveBodyMass(kilograms: Double, date: Date) async throws -> UUID {
        guard isAvailable,
              let type = HKQuantityType.quantityType(forIdentifier: .bodyMass) else {
            throw SaveError.unavailable
        }
        if store.authorizationStatus(for: type) != .sharingAuthorized {
            try await store.requestAuthorization(toShare: shareTypes, read: readTypes)
            guard store.authorizationStatus(for: type) == .sharingAuthorized else {
                throw SaveError.notAuthorized
            }
        }
        let quantity = HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: kilograms)
        let sample = HKQuantitySample(type: type, quantity: quantity, start: date, end: date)
        try await store.save(sample)
        return sample.uuid
    }

    private func fetchWorkouts(daysBack: Int) async -> [HealthWorkout] {
        let start = Calendar.current.date(byAdding: .day, value: -daysBack, to: .now)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: .now)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        return await withCheckedContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: .workoutType(),
                predicate: predicate,
                limit: 200,
                sortDescriptors: [sort]
            ) { _, samples, _ in
                let workouts = (samples as? [HKWorkout] ?? []).map { wk -> HealthWorkout in
                    let energy = wk.statistics(for: HKQuantityType(.activeEnergyBurned))?
                        .sumQuantity()?.doubleValue(for: .kilocalorie())
                    let distance = wk.statistics(for: HKQuantityType(.distanceWalkingRunning))?
                        .sumQuantity()?.doubleValue(for: .meter())
                    return HealthWorkout(
                        id: wk.uuid,
                        activityName: wk.workoutActivityType.displayName,
                        start: wk.startDate,
                        duration: wk.duration,
                        energyKcal: energy,
                        distanceMeters: distance,
                        sourceName: wk.sourceRevision.source.name
                    )
                }
                continuation.resume(returning: workouts)
            }
            store.execute(query)
        }
    }

    /// Fetch all bodyweight samples within `daysBack` for importing history.
    func fetchBodyweightHistory(daysBack: Int = 365) async -> [HealthBodyweight] {
        guard isAvailable,
              let type = HKQuantityType.quantityType(forIdentifier: .bodyMass) else {
            return []
        }
        let start = Calendar.current.date(byAdding: .day, value: -daysBack, to: .now)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: .now)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        return await withCheckedContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: type, predicate: predicate, limit: 500, sortDescriptors: [sort]
            ) { _, samples, _ in
                let out = (samples as? [HKQuantitySample] ?? []).map { s in
                    HealthBodyweight(
                        id: s.uuid,
                        kilograms: s.quantity.doubleValue(for: .gramUnit(with: .kilo)),
                        date: s.endDate
                    )
                }
                continuation.resume(returning: out)
            }
            store.execute(query)
        }
    }

    private func fetchLatestBodyweight() async -> HealthBodyweight? {
        guard let type = HKQuantityType.quantityType(forIdentifier: .bodyMass) else {
            return nil
        }
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        return await withCheckedContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: type, predicate: nil, limit: 1, sortDescriptors: [sort]
            ) { _, samples, _ in
                guard let sample = samples?.first as? HKQuantitySample else {
                    continuation.resume(returning: nil); return
                }
                let kg = sample.quantity.doubleValue(for: .gramUnit(with: .kilo))
                continuation.resume(returning:
                    HealthBodyweight(kilograms: kg, date: sample.endDate))
            }
            store.execute(query)
        }
    }
}

extension HKWorkoutActivityType {
    /// Best-guess activity type from a free-text WOD title / type. Defaults to
    /// functional strength training, which suits most CrossFit-style WODs.
    static func from(title: String) -> HKWorkoutActivityType {
        let t = title.lowercased()
        if t.contains("run") { return .running }
        if t.contains("bike") || t.contains("cycl") || t.contains("ride") { return .cycling }
        if t.contains("row") { return .rowing }
        if t.contains("swim") { return .swimming }
        if t.contains("walk") || t.contains("ruck") { return .walking }
        if t.contains("hiit") || t.contains("interval") { return .highIntensityIntervalTraining }
        if t.contains("yoga") { return .yoga }
        if t.contains("jump") && t.contains("rope") { return .jumpRope }
        return .functionalStrengthTraining
    }

    /// A human-readable name for the common activity types.
    var displayName: String {
        switch self {
        case .functionalStrengthTraining: return "Functional Strength"
        case .traditionalStrengthTraining: return "Strength Training"
        case .highIntensityIntervalTraining: return "HIIT"
        case .running: return "Running"
        case .cycling: return "Cycling"
        case .walking: return "Walking"
        case .rowing: return "Rowing"
        case .swimming: return "Swimming"
        case .crossTraining: return "Cross Training"
        case .coreTraining: return "Core Training"
        case .elliptical: return "Elliptical"
        case .stairClimbing: return "Stair Climbing"
        case .jumpRope: return "Jump Rope"
        case .mixedCardio: return "Mixed Cardio"
        case .hiking: return "Hiking"
        case .yoga: return "Yoga"
        default: return "Workout"
        }
    }
}
