// Rotation logic V2: Individual start dates (no group-based scheduling)
// Each tester starts on their own D1 whenever they want.
// After completing round N, wait the specified gap before round N+1.

type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

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
