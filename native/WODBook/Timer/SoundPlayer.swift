import Foundation
import AVFoundation
import AudioToolbox
import UIKit

/// Plays short timer cues using system sounds (no audio assets required).
final class SoundPlayer {
    static let shared = SoundPlayer()

    enum Cue {
        case beep
        case finish

        /// System sound IDs (built into iOS).
        var systemSoundID: SystemSoundID {
            switch self {
            case .beep:   return 1057   // short "Tink"-style tone
            case .finish: return 1005   // alarm-like alert
            }
        }
    }

    private init() {
        configureSession()
    }

    private func configureSession() {
        // Allow cues to play even when the ringer is on silent, mixing with music.
        try? AVAudioSession.sharedInstance().setCategory(
            .playback, options: [.mixWithOthers, .duckOthers]
        )
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    func play(_ cue: Cue) {
        AudioServicesPlaySystemSound(cue.systemSoundID)
    }
}

/// Centralized haptic feedback for the timer.
enum Haptics {
    static func start() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    static func tap() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    static func roundBeep() {
        UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
    }

    static func finish() {
        let gen = UINotificationFeedbackGenerator()
        gen.notificationOccurred(.success)
    }
}
