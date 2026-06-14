import Foundation
import AVFoundation
import UIKit

/// Available timer modes for the WOD timer.
enum TimerMode: String, CaseIterable, Identifiable {
    case stopwatch = "For Time"
    case countdown = "AMRAP"
    case emom      = "EMOM"
    case tabata    = "Tabata"

    var id: String { rawValue }

    var systemImage: String {
        switch self {
        case .stopwatch: return "stopwatch"
        case .countdown: return "timer"
        case .emom:      return "repeat"
        case .tabata:    return "bolt.heart"
        }
    }

    var blurb: String {
        switch self {
        case .stopwatch: return "Count up. Tap “Round” to record splits."
        case .countdown: return "Count down from a set duration."
        case .emom:      return "Every minute on the minute for N rounds."
        case .tabata:    return "Work / rest intervals repeated for N rounds."
        }
    }
}

/// Configuration values for the timer. Durations are in seconds.
struct TimerConfig {
    var mode: TimerMode = .stopwatch
    var countdownSeconds: Int = 12 * 60      // AMRAP length
    var emomInterval: Int = 60               // EMOM window
    var emomRounds: Int = 10
    var tabataWork: Int = 20
    var tabataRest: Int = 10
    var tabataRounds: Int = 8

    /// Total programmed length, used for progress + completion detection.
    var totalSeconds: Int {
        switch mode {
        case .stopwatch: return 0
        case .countdown: return countdownSeconds
        case .emom:      return emomInterval * emomRounds
        case .tabata:    return (tabataWork + tabataRest) * tabataRounds
        }
    }
}

/// The active phase shown to the user (drives color + label).
enum TimerPhase: Equatable {
    case idle
    case running          // generic running (stopwatch / countdown)
    case work
    case rest
    case finished
}

/// Drives all timer modes. ObservableObject for SwiftUI binding.
@MainActor
final class TimerEngine: ObservableObject {

    // Published UI state
    @Published var config = TimerConfig()
    @Published private(set) var phase: TimerPhase = .idle
    @Published private(set) var elapsed: Int = 0          // seconds since start
    @Published private(set) var displaySeconds: Int = 0   // what the big clock shows
    @Published private(set) var currentRound: Int = 0
    @Published private(set) var rounds: [Int] = []        // recorded splits (stopwatch)
    @Published private(set) var isRunning = false

    private var timer: Timer?
    private var lastBeepSecond: Int = -1

    // MARK: - Controls

    func start() {
        guard !isRunning else { return }
        if phase == .idle || phase == .finished { reset(keepConfig: true) }
        isRunning = true
        phase = initialPhase()
        currentRound = (config.mode == .stopwatch || config.mode == .countdown) ? 0 : 1
        tick0()                       // set initial display
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        Haptics.start()
    }

    func pause() {
        isRunning = false
        timer?.invalidate()
        timer = nil
    }

    func reset(keepConfig: Bool = true) {
        pause()
        elapsed = 0
        currentRound = 0
        rounds = []
        lastBeepSecond = -1
        phase = .idle
        displaySeconds = config.mode == .countdown ? config.countdownSeconds
                       : config.mode == .tabata ? config.tabataWork
                       : config.mode == .emom ? config.emomInterval
                       : 0
    }

    /// Record a round/split (stopwatch mode).
    func markRound() {
        guard config.mode == .stopwatch, isRunning else { return }
        rounds.append(elapsed)
        Haptics.tap()
    }

    // MARK: - Tick logic

    private func initialPhase() -> TimerPhase {
        switch config.mode {
        case .stopwatch, .countdown, .emom: return .running
        case .tabata: return .work
        }
    }

    private func tick0() {
        switch config.mode {
        case .stopwatch: displaySeconds = 0
        case .countdown: displaySeconds = config.countdownSeconds
        case .emom:      displaySeconds = config.emomInterval
        case .tabata:    displaySeconds = config.tabataWork; phase = .work
        }
    }

    private func tick() {
        elapsed += 1

        switch config.mode {
        case .stopwatch:
            displaySeconds = elapsed

        case .countdown:
            let remaining = max(0, config.countdownSeconds - elapsed)
            displaySeconds = remaining
            countdownBeeps(remaining)
            if remaining == 0 { finish() }

        case .emom:
            // Count down within the current minute window.
            let intoRound = (elapsed - 1) % config.emomInterval
            displaySeconds = config.emomInterval - intoRound
            currentRound = min(config.emomRounds, (elapsed - 1) / config.emomInterval + 1)
            if intoRound == 0 {            // crossed a minute boundary
                Haptics.roundBeep()
                SoundPlayer.shared.play(.beep)
            }
            if elapsed >= config.totalSeconds { finish() }

        case .tabata:
            tickTabata()
        }
    }

    private func tickTabata() {
        let cycle = config.tabataWork + config.tabataRest
        let intoCycle = (elapsed - 1) % cycle    // position within current work+rest
        currentRound = min(config.tabataRounds, (elapsed - 1) / cycle + 1)

        if intoCycle < config.tabataWork {
            phase = .work
            displaySeconds = config.tabataWork - intoCycle
        } else {
            phase = .rest
            displaySeconds = cycle - intoCycle
        }

        // Beep at each work<->rest transition.
        if intoCycle == 0 || intoCycle == config.tabataWork {
            Haptics.roundBeep()
            SoundPlayer.shared.play(.beep)
        }
        if elapsed >= config.totalSeconds { finish() }
    }

    private func countdownBeeps(_ remaining: Int) {
        if (1...3).contains(remaining), remaining != lastBeepSecond {
            lastBeepSecond = remaining
            SoundPlayer.shared.play(.beep)
            Haptics.tap()
        }
    }

    private func finish() {
        pause()
        phase = .finished
        SoundPlayer.shared.play(.finish)
        Haptics.finish()
    }

    // MARK: - Result helpers

    /// A human-readable result string suitable for logging.
    var resultString: String {
        switch config.mode {
        case .stopwatch:
            return TimeFormat.mmss(elapsed)
        case .countdown:
            return "\(TimeFormat.mmss(config.countdownSeconds)) AMRAP"
        case .emom:
            return "\(config.emomRounds) rounds EMOM"
        case .tabata:
            return "\(config.tabataRounds) x \(config.tabataWork)/\(config.tabataRest)s"
        }
    }

    var suggestedTitle: String {
        config.mode.rawValue
    }

    var suggestedWODType: WODType {
        switch config.mode {
        case .stopwatch: return .forTime
        case .countdown: return .amrap
        case .emom:      return .emom
        case .tabata:    return .other
        }
    }
}

/// Lightweight time formatting helpers.
enum TimeFormat {
    static func mmss(_ seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        return String(format: "%02d:%02d", m, s)
    }
}
