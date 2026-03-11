// Group rotation schedule
// 월(Mon): A, C / 화(Tue): B, D / 수(Wed): C, E / 목(Thu): A, D / 금(Fri): B, E
// 주말(Sat, Sun): No groups active

type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const ROTATION_SCHEDULE: Record<number, string[]> = {
    1: ["A", "C"], // Monday
    2: ["B", "D"], // Tuesday
    3: ["C", "E"], // Wednesday
    4: ["A", "D"], // Thursday
    5: ["B", "E"], // Friday
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

export function getActiveGroups(dayOfWeek?: DayOfWeek): string[] {
    const day = dayOfWeek ?? new Date().getDay() as DayOfWeek;
    return ROTATION_SCHEDULE[day] || [];
}

export function isGroupActiveToday(group: string): boolean {
    const activeGroups = getActiveGroups();
    return activeGroups.includes(group.toUpperCase());
}

export function getNextActiveDay(group: string): string {
    const today = new Date().getDay();

    for (let i = 1; i <= 7; i++) {
        const checkDay = ((today + i) % 7) as DayOfWeek;
        const groups = ROTATION_SCHEDULE[checkDay] || [];
        if (groups.includes(group.toUpperCase())) {
            return DAY_NAMES_KR[checkDay];
        }
    }

    return "다음 평일";
}

export function getGroupSchedule(group: string): string[] {
    const days: string[] = [];
    for (const [day, groups] of Object.entries(ROTATION_SCHEDULE)) {
        if (groups.includes(group.toUpperCase())) {
            days.push(DAY_NAMES_KR[Number(day)]);
        }
    }
    return days;
}

export function getTodayString(): string {
    const today = new Date();
    return today.toISOString().split("T")[0];
}
