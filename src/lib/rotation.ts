// Group rotation: determines D1 (start day) for each group
// 월(Mon): A / 화(Tue): B / 수(Wed): C / 목(Thu): D / 금(Fri): E
// After D1, rounds unlock based on completion + required gap

type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Each group's active day of week (for starting D1)
const GROUP_START_DAY: Record<string, number> = {
    A: 1, // Monday
    B: 2, // Tuesday
    C: 3, // Wednesday
    D: 4, // Thursday
    E: 5, // Friday
};

const DAY_NAMES_KR: Record<number, string> = {
    0: "일요일",
    1: "월요일",
    2: "화요일",
    3: "수요일",
    4: "목요일",
    5: "금요일",
    6: "토요일",
};

// Gap in days after completing round N before round N+1 unlocks
// D1→D2: 1day, D2→D3: 1day, D3→D6: 3days, D6→D7: 1day
const ROUND_GAPS: Record<number, number> = {
    1: 1, // after round 1, wait 1 day for round 2
    2: 1, // after round 2, wait 1 day for round 3
    3: 3, // after round 3, wait 3 days for round 4
    4: 1, // after round 4, wait 1 day for round 5
};

const ROUND_NAMES: Record<number, string> = {
    1: "1라운드 — 첫인상",
    2: "2라운드 — 심화",
    3: "3라운드 — 확장",
    4: "4라운드 — 평판",
    5: "5라운드 — 정착",
};

export function getGroupStartDay(group: string): number {
    return GROUP_START_DAY[group.toUpperCase()] ?? 1;
}

export function isGroupActiveToday(group: string): boolean {
    const today = new Date().getDay();
    return today === getGroupStartDay(group);
}

export function getNextActiveDay(group: string): string {
    const today = new Date().getDay();
    const startDay = getGroupStartDay(group);
    if (today === startDay) return "오늘";
    const daysUntil = (startDay - today + 7) % 7;
    return `${DAY_NAMES_KR[startDay]} (${daysUntil}일 후)`;
}

export function getGroupSchedule(group: string): string[] {
    const day = getGroupStartDay(group);
    return [DAY_NAMES_KR[day]];
}

export function getRoundGap(completedRound: number): number {
    return ROUND_GAPS[completedRound] ?? 1;
}

export function getRoundName(round: number): string {
    return ROUND_NAMES[round] ?? `${round}라운드`;
}

// Calculate when the next round becomes available
export function getNextRoundAvailableDate(
    completedRound: number,
    completedAt: string
): Date {
    const gap = getRoundGap(completedRound);
    const baseDate = new Date(completedAt);
    // Set to start of next day + gap
    const available = new Date(baseDate);
    available.setDate(available.getDate() + gap);
    available.setHours(0, 0, 0, 0);
    return available;
}

export function getTodayString(): string {
    const today = new Date();
    return today.toISOString().split("T")[0];
}

export function formatDateKR(date: Date): string {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayName = DAY_NAMES_KR[date.getDay() as DayOfWeek];
    return `${month}월 ${day}일 (${dayName})`;
}

export { DAY_NAMES_KR };
