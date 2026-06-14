import SwiftUI

/// The built-in WOD timer screen: stopwatch, AMRAP countdown, EMOM, Tabata.
struct TimerView: View {
    @StateObject private var engine = TimerEngine()
    @State private var showingLogPrompt = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                modePicker

                configCard

                Spacer()

                clock

                roundInfo

                Spacer()

                controls
            }
            .padding()
            .navigationTitle("Timer")
            .onChange(of: engine.phase) { _, newPhase in
                if newPhase == .finished {
                    showingLogPrompt = true
                }
            }
            .sheet(isPresented: $showingLogPrompt) {
                NavigationStack {
                    WODEditView(
                        entry: nil,
                        prefill: PrefillWOD(
                            title: engine.suggestedTitle,
                            type: engine.suggestedWODType,
                            result: engine.resultString
                        )
                    )
                }
            }
        }
    }

    // MARK: - Mode picker

    private var modePicker: some View {
        Picker("Mode", selection: $engine.config.mode) {
            ForEach(TimerMode.allCases) { mode in
                Text(mode.rawValue).tag(mode)
            }
        }
        .pickerStyle(.segmented)
        .disabled(engine.isRunning)
    }

    // MARK: - Config

    @ViewBuilder
    private var configCard: some View {
        VStack(spacing: 12) {
            Text(engine.config.mode.blurb)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

            switch engine.config.mode {
            case .stopwatch:
                EmptyView()

            case .countdown:
                MinuteSecondStepper(
                    label: "Duration",
                    seconds: $engine.config.countdownSeconds
                )

            case .emom:
                Stepper("Interval: \(engine.config.emomInterval)s",
                        value: $engine.config.emomInterval, in: 10...300, step: 5)
                Stepper("Rounds: \(engine.config.emomRounds)",
                        value: $engine.config.emomRounds, in: 1...60)

            case .tabata:
                Stepper("Work: \(engine.config.tabataWork)s",
                        value: $engine.config.tabataWork, in: 5...120, step: 5)
                Stepper("Rest: \(engine.config.tabataRest)s",
                        value: $engine.config.tabataRest, in: 5...120, step: 5)
                Stepper("Rounds: \(engine.config.tabataRounds)",
                        value: $engine.config.tabataRounds, in: 1...30)
            }
        }
        .padding()
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
        .disabled(engine.isRunning)
        .opacity(engine.config.mode == .stopwatch ? 0.6 : 1)
    }

    // MARK: - Clock

    private var clock: some View {
        VStack(spacing: 6) {
            Text(TimeFormat.mmss(engine.displaySeconds))
                .font(.system(size: 78, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(clockColor)
                .contentTransition(.numericText())
                .animation(.snappy, value: engine.displaySeconds)

            if engine.phase != .idle {
                Text(phaseLabel)
                    .font(.headline)
                    .foregroundStyle(clockColor)
            }
        }
    }

    private var clockColor: Color {
        switch engine.phase {
        case .work:     return .green
        case .rest:     return .orange
        case .finished: return .accentColor
        default:        return .primary
        }
    }

    private var phaseLabel: String {
        switch engine.phase {
        case .work:     return "WORK"
        case .rest:     return "REST"
        case .finished: return "DONE — \(engine.resultString)"
        case .running, .idle:
            return engine.config.mode == .stopwatch ? "GO" : ""
        }
    }

    // MARK: - Round info

    @ViewBuilder
    private var roundInfo: some View {
        switch engine.config.mode {
        case .emom:
            Text("Round \(engine.currentRound) / \(engine.config.emomRounds)")
                .font(.title3.bold())
        case .tabata:
            Text("Round \(engine.currentRound) / \(engine.config.tabataRounds)")
                .font(.title3.bold())
        case .stopwatch where !engine.rounds.isEmpty:
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(Array(engine.rounds.enumerated()), id: \.offset) { idx, t in
                        VStack {
                            Text("R\(idx + 1)").font(.caption2).foregroundStyle(.secondary)
                            Text(TimeFormat.mmss(t)).font(.caption.monospacedDigit())
                        }
                        .padding(8)
                        .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
            .frame(height: 56)
        default:
            EmptyView()
        }
    }

    // MARK: - Controls

    private var controls: some View {
        HStack(spacing: 16) {
            Button {
                engine.reset()
            } label: {
                Label("Reset", systemImage: "arrow.counterclockwise")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)

            if engine.config.mode == .stopwatch && engine.isRunning {
                Button {
                    engine.markRound()
                } label: {
                    Label("Round", systemImage: "flag.checkered")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }

            Button {
                engine.isRunning ? engine.pause() : engine.start()
            } label: {
                Label(engine.isRunning ? "Pause" : "Start",
                      systemImage: engine.isRunning ? "pause.fill" : "play.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
    }
}

/// A two-stepper minute/second editor.
struct MinuteSecondStepper: View {
    let label: String
    @Binding var seconds: Int

    var body: some View {
        HStack {
            Text(label)
            Spacer()
            Text(TimeFormat.mmss(seconds))
                .monospacedDigit()
                .foregroundStyle(.secondary)
            Stepper("", value: $seconds, in: 10...3600, step: 30)
                .labelsHidden()
        }
    }
}

#Preview {
    TimerView()
}
