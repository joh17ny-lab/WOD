import SwiftUI
import SwiftData

/// A month calendar that highlights days with logged workouts and shows
/// the selected day's entries below.
struct CalendarView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \WODEntry.date, order: .reverse) private var entries: [WODEntry]

    @State private var displayedMonth: Date = .now
    @State private var selectedDate: Date = .now

    private let calendar = Calendar.current

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                monthHeader
                weekdayHeader
                monthGrid
                Divider().padding(.top, 8)
                selectedDayList
            }
            .navigationTitle("Calendar")
        }
    }

    // MARK: - Header

    private var monthHeader: some View {
        HStack {
            Button { changeMonth(by: -1) } label: {
                Image(systemName: "chevron.left")
            }
            Spacer()
            Text(displayedMonth, format: .dateTime.month(.wide).year())
                .font(.headline)
            Spacer()
            Button { changeMonth(by: 1) } label: {
                Image(systemName: "chevron.right")
            }
        }
        .padding(.horizontal)
        .padding(.top, 8)
    }

    private var weekdayHeader: some View {
        HStack {
            ForEach(calendar.shortWeekdaySymbols, id: \.self) { day in
                Text(day)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 8)
    }

    // MARK: - Grid

    private var monthGrid: some View {
        let days = makeDays()
        let columns = Array(repeating: GridItem(.flexible()), count: 7)

        return LazyVGrid(columns: columns, spacing: 6) {
            ForEach(Array(days.enumerated()), id: \.offset) { _, date in
                if let date {
                    dayCell(date)
                } else {
                    Color.clear.frame(height: 38)
                }
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 6)
    }

    private func dayCell(_ date: Date) -> some View {
        let isSelected = calendar.isDate(date, inSameDayAs: selectedDate)
        let isToday = calendar.isDateInToday(date)
        let hasWorkout = entries.contains { calendar.isDate($0.date, inSameDayAs: date) }

        return Button {
            selectedDate = date
        } label: {
            VStack(spacing: 3) {
                Text("\(calendar.component(.day, from: date))")
                    .font(.callout)
                    .fontWeight(isToday ? .bold : .regular)
                Circle()
                    .fill(hasWorkout ? Color.accentColor : .clear)
                    .frame(width: 6, height: 6)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 38)
            .background(
                isSelected ? Color.accentColor.opacity(0.18) : .clear,
                in: RoundedRectangle(cornerRadius: 8)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isToday ? Color.accentColor : .clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Selected day entries

    private var selectedDayList: some View {
        let dayEntries = entries.filter {
            calendar.isDate($0.date, inSameDayAs: selectedDate)
        }
        return Group {
            if dayEntries.isEmpty {
                ContentUnavailableView(
                    "No workouts",
                    systemImage: "calendar.badge.exclamationmark",
                    description: Text(selectedDate, format: .dateTime.month().day().year())
                )
            } else {
                List {
                    Section(selectedDate.formatted(.dateTime.weekday(.wide).month().day())) {
                        ForEach(dayEntries) { entry in
                            NavigationLink {
                                WODEditView(entry: entry)
                            } label: {
                                WODRow(entry: entry)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Date helpers

    /// Returns an array of optional dates aligned to a 7-column grid (nil = padding).
    private func makeDays() -> [Date?] {
        guard
            let monthInterval = calendar.dateInterval(of: .month, for: displayedMonth),
            let firstWeekday = calendar.dateComponents([.weekday], from: monthInterval.start).weekday
        else { return [] }

        let daysInMonth = calendar.range(of: .day, in: .month, for: displayedMonth)?.count ?? 30
        let leadingBlanks = firstWeekday - calendar.firstWeekday
        let padCount = (leadingBlanks + 7) % 7

        var result: [Date?] = Array(repeating: nil, count: padCount)
        for day in 0..<daysInMonth {
            if let date = calendar.date(byAdding: .day, value: day, to: monthInterval.start) {
                result.append(date)
            }
        }
        return result
    }

    private func changeMonth(by value: Int) {
        if let newMonth = calendar.date(byAdding: .month, value: value, to: displayedMonth) {
            displayedMonth = newMonth
        }
    }
}

#Preview {
    CalendarView()
        .modelContainer(for: [WODEntry.self, LiftPR.self], inMemory: true)
}
