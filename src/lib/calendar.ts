/**
 * 📅 Apple Calendar CalDAV Integration
 *
 * CalDAV를 통해 Apple 캘린더의 일정을 조회/추가/수정/삭제
 */

import { createDAVClient, DAVCalendar, DAVObject } from "tsdav";

const APPLE_ID = process.env.APPLE_ID || "";
const APPLE_APP_PASSWORD = process.env.APPLE_APP_PASSWORD || "";

export interface CalendarEvent {
    uid: string;
    title: string;
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
    allDay: boolean;
    description?: string;
    url?: string;      // CalDAV URL for update/delete
    etag?: string;     // For update/delete
}

// ─── DAV Client ─────────────────────────────────────
async function getClient() {
    const client = await createDAVClient({
        serverUrl: "https://caldav.icloud.com",
        credentials: {
            username: APPLE_ID,
            password: APPLE_APP_PASSWORD,
        },
        authMethod: "Basic",
        defaultAccountType: "caldav",
    });
    return client;
}

async function getDefaultCalendar(): Promise<{ client: ReturnType<typeof createDAVClient> extends Promise<infer T> ? T : never; calendar: DAVCalendar }> {
    const client = await getClient();
    const calendars = await client.fetchCalendars();

    if (!calendars || calendars.length === 0) {
        throw new Error("캘린더를 찾을 수 없습니다.");
    }

    // Prefer "Home" or first calendar
    const defaultCal = calendars.find(c => {
        const name = (c.displayName as string || "").toLowerCase();
        return name.includes("home") || name.includes("개인") || name.includes("홈") || name.includes("집");
    }) || calendars[0];

    return { client, calendar: defaultCal };
}

// ─── Parse iCalendar Data ───────────────────────────
function parseICS(icsData: string): CalendarEvent | null {
    try {
        const uidMatch = icsData.match(/UID:(.+?)[\r\n]/);
        const summaryMatch = icsData.match(/SUMMARY:(.+?)[\r\n]/);
        const dtStartMatch = icsData.match(/DTSTART(?:;VALUE=DATE)?:(\d{8})/);
        const dtEndMatch = icsData.match(/DTEND(?:;VALUE=DATE)?:(\d{8})/);
        const descMatch = icsData.match(/DESCRIPTION:(.+?)[\r\n]/);

        if (!summaryMatch || !dtStartMatch) return null;

        const startRaw = dtStartMatch[1]; // "20260318"
        const startDate = `${startRaw.slice(0, 4)}-${startRaw.slice(4, 6)}-${startRaw.slice(6, 8)}`;

        let endDate = startDate;
        if (dtEndMatch) {
            const endRaw = dtEndMatch[1];
            endDate = `${endRaw.slice(0, 4)}-${endRaw.slice(4, 6)}-${endRaw.slice(6, 8)}`;
            // All-day events: DTEND is exclusive, so subtract 1 day
            const endDt = new Date(endDate);
            endDt.setDate(endDt.getDate() - 1);
            endDate = endDt.toISOString().split("T")[0];
        }

        return {
            uid: uidMatch?.[1]?.trim() || "",
            title: summaryMatch[1].trim(),
            startDate,
            endDate,
            allDay: true, // We're only handling all-day events
            description: descMatch?.[1]?.trim(),
        };
    } catch {
        return null;
    }
}

// ─── Generate iCalendar Data ────────────────────────
function generateICS(event: { title: string; startDate: string; endDate: string; description?: string; uid?: string }): string {
    const uid = event.uid || `${Date.now()}-${Math.random().toString(36).slice(2)}@snowy`;
    const start = event.startDate.replace(/-/g, "");
    // All-day DTEND is exclusive, so add 1 day
    const endDt = new Date(event.endDate);
    endDt.setDate(endDt.getDate() + 1);
    const end = endDt.toISOString().split("T")[0].replace(/-/g, "");

    let ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Snowy//Calendar//KO
BEGIN:VEVENT
UID:${uid}
DTSTART;VALUE=DATE:${start}
DTEND;VALUE=DATE:${end}
SUMMARY:${event.title}`;

    if (event.description) {
        ics += `\nDESCRIPTION:${event.description}`;
    }

    ics += `
DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z
END:VEVENT
END:VCALENDAR`;

    return ics;
}

// ─── Public API ─────────────────────────────────────

/**
 * 특정 날짜 범위의 일정 조회
 */
export async function getEvents(startDate: string, endDate: string): Promise<CalendarEvent[]> {
    const { client, calendar } = await getDefaultCalendar();

    const objects = await client.fetchCalendarObjects({
        calendar,
        timeRange: {
            start: `${startDate}T00:00:00Z`,
            end: `${endDate}T23:59:59Z`,
        },
    });

    const events: CalendarEvent[] = [];
    for (const obj of objects) {
        if (!obj.data) continue;
        const event = parseICS(obj.data);
        if (event) {
            event.url = obj.url;
            event.etag = obj.etag || undefined;
            events.push(event);
        }
    }

    // Sort by start date
    events.sort((a, b) => a.startDate.localeCompare(b.startDate));
    return events;
}

/**
 * 오늘 또는 특정 날짜의 일정 조회
 */
export async function getEventsForDate(date: string): Promise<CalendarEvent[]> {
    // For all-day events, we need to search a wider range
    const targetDate = new Date(date);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const events = await getEvents(date, nextDay.toISOString().split("T")[0]);

    // Filter to only include events that overlap with the target date
    return events.filter(e => {
        return e.startDate <= date && e.endDate >= date;
    });
}

/**
 * 일정 추가
 */
export async function createEvent(title: string, startDate: string, endDate: string, description?: string): Promise<CalendarEvent> {
    const { client, calendar } = await getDefaultCalendar();

    const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@snowy`;
    const icsData = generateICS({ title, startDate, endDate, description, uid });

    await client.createCalendarObject({
        calendar,
        filename: `${uid}.ics`,
        iCalString: icsData,
    });

    return {
        uid,
        title,
        startDate,
        endDate,
        allDay: true,
        description,
    };
}

/**
 * 일정 수정
 */
export async function updateEvent(url: string, etag: string | undefined, title: string, startDate: string, endDate: string, description?: string): Promise<void> {
    const { client } = await getDefaultCalendar();

    // First fetch the original to get the UID
    const uidMatch = url.match(/([^/]+)\.ics$/);
    const uid = uidMatch ? uidMatch[1] : `${Date.now()}@snowy`;

    const icsData = generateICS({ title, startDate, endDate, description, uid });

    await client.updateCalendarObject({
        calendarObject: {
            url,
            data: icsData,
            etag: etag || "",
        },
    });
}

/**
 * 일정 삭제
 */
export async function deleteEvent(url: string, etag: string | undefined): Promise<void> {
    const { client } = await getDefaultCalendar();

    await client.deleteCalendarObject({
        calendarObject: {
            url,
            etag: etag || "",
        },
    });
}

/**
 * 일정 목록 포맷팅 (번호 포함)
 */
export function formatEventList(events: CalendarEvent[], dateLabel: string): string {
    if (events.length === 0) {
        return `📅 ${dateLabel} 일정이 없어요! 여유로운 하루네요~ ✨`;
    }

    const lines = [`📅 ${dateLabel} 일정 (${events.length}건)`];
    lines.push("━━━━━━━━━━━━━━━━━━━━");

    events.forEach((event, idx) => {
        const num = idx + 1;
        const dateInfo = event.startDate === event.endDate
            ? event.startDate
            : `${event.startDate} ~ ${event.endDate}`;
        lines.push(`${num}️⃣ ${event.title}`);
        lines.push(`   📆 ${dateInfo}`);
        if (event.description) {
            lines.push(`   📝 ${event.description}`);
        }
    });

    lines.push("");
    lines.push("💡 수정/삭제는 번호로 말씀해 주세요!");
    lines.push('   예: "3번 삭제해줘", "2번 제목 변경해줘"');
    return lines.join("\n");
}
