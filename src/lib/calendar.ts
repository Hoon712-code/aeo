/**
 * 📅 Apple Calendar CalDAV Integration
 *
 * CalDAV를 통해 Apple 캘린더의 일정을 조회/추가/수정/삭제
 * - 반복 일정 (RRULE) 지원
 * - 시간 지정 일정 지원
 */

import { createDAVClient, DAVCalendar, DAVObject } from "tsdav";

const APPLE_ID = process.env.APPLE_ID || "";
const APPLE_APP_PASSWORD = process.env.APPLE_APP_PASSWORD || "";

export interface CalendarEvent {
    uid: string;
    title: string;
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
    startTime?: string; // HH:MM (KST) — undefined for all-day
    endTime?: string;   // HH:MM (KST)
    allDay: boolean;
    description?: string;
    url?: string;      // CalDAV URL for update/delete
    etag?: string;     // For update/delete
    isRecurring?: boolean;
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

    // Prefer "Home/집" or first non-reminder calendar
    const defaultCal = calendars.find(c => {
        const name = (c.displayName as string || "").toLowerCase();
        return name.includes("home") || name.includes("개인") || name.includes("홈") || name.includes("집");
    }) || calendars.find(c => {
        const name = (c.displayName as string || "").toLowerCase();
        return !name.includes("미리 알림") && !name.includes("reminder");
    }) || calendars[0];

    console.log(`[Calendar] Using calendar: "${defaultCal.displayName}" from ${calendars.length} calendars`);
    return { client, calendar: defaultCal };
}

// ─── Parse iCalendar Data ───────────────────────────
// Convert various DTSTART/DTEND formats to { date: YYYY-MM-DD, time?: HH:MM }
function parseDT(icsData: string, prefix: "DTSTART" | "DTEND"): { date: string; time?: string } | null {
    // Match patterns:
    // DTSTART;VALUE=DATE:20260318
    // DTSTART:20260318T090000Z
    // DTSTART;TZID=Asia/Seoul:20260318T090000
    // DTSTART;TZID=US/Pacific:20260318T090000
    const regex = new RegExp(`${prefix}(?:[^:]*)?:(\\d{8})(?:T(\\d{6})(Z)?)?`);
    const match = icsData.match(regex);
    if (!match) return null;

    const dateRaw = match[1]; // "20260318"
    const timeRaw = match[2]; // "090000" or undefined
    const isUTC = match[3] === "Z";

    const date = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;

    if (!timeRaw) return { date };

    // Parse time
    let hours = parseInt(timeRaw.slice(0, 2), 10);
    const minutes = timeRaw.slice(2, 4);

    // Check if TZID is specified
    const tzidMatch = icsData.match(new RegExp(`${prefix};TZID=([^:]+):`));
    const tzid = tzidMatch ? tzidMatch[1] : null;

    if (isUTC) {
        // Convert UTC to KST (+9)
        hours += 9;
        if (hours >= 24) {
            hours -= 24;
            // Date would shift but we keep original date for simplicity
        }
    } else if (tzid && !tzid.includes("Seoul") && !tzid.includes("Korea") && !tzid.includes("KST")) {
        // Non-KST timezone — approximate by keeping as-is for now
        // Full timezone conversion is complex; Apple Calendar typically stores in local tz
    }

    const time = `${String(hours).padStart(2, "0")}:${minutes}`;
    return { date, time };
}

function parseICS(icsData: string): CalendarEvent | null {
    try {
        const uidMatch = icsData.match(/UID:(.+?)[\r\n]/);
        const summaryMatch = icsData.match(/SUMMARY:(.+?)[\r\n]/);
        const descMatch = icsData.match(/DESCRIPTION:(.+?)[\r\n]/);
        const hasRRule = /RRULE:/.test(icsData);

        if (!summaryMatch) return null;

        const start = parseDT(icsData, "DTSTART");
        if (!start) return null;

        const end = parseDT(icsData, "DTEND");
        const allDay = !start.time;

        let endDate = start.date;
        if (end) {
            endDate = end.date;
            if (allDay) {
                // All-day events: DTEND is exclusive, so subtract 1 day
                const [y, m, d] = endDate.split("-").map(Number);
                const dt = new Date(Date.UTC(y, m - 1, d - 1));
                endDate = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
            }
        }

        return {
            uid: uidMatch?.[1]?.trim() || "",
            title: summaryMatch[1].trim(),
            startDate: start.date,
            endDate,
            startTime: start.time,
            endTime: end?.time,
            allDay,
            description: descMatch?.[1]?.trim(),
            isRecurring: hasRRule,
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
    const [ey, em, ed] = event.endDate.split("-").map(Number);
    const endDt = new Date(Date.UTC(ey, em - 1, ed + 1));
    const end = `${endDt.getUTCFullYear()}${String(endDt.getUTCMonth() + 1).padStart(2, "0")}${String(endDt.getUTCDate()).padStart(2, "0")}`;

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

    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth()+1).padStart(2,"0")}${String(now.getUTCDate()).padStart(2,"0")}T${String(now.getUTCHours()).padStart(2,"0")}${String(now.getUTCMinutes()).padStart(2,"0")}${String(now.getUTCSeconds()).padStart(2,"0")}Z`;

    ics += `
DTSTAMP:${stamp}
END:VEVENT
END:VCALENDAR`;

    return ics;
}

// ─── Public API ─────────────────────────────────────

/**
 * 특정 날짜 범위의 일정 조회 (반복 일정 포함)
 */
export async function getEvents(startDate: string, endDate: string): Promise<CalendarEvent[]> {
    const { client, calendar } = await getDefaultCalendar();

    // Use expand to get recurring event instances
    const objects = await client.fetchCalendarObjects({
        calendar,
        timeRange: {
            start: `${startDate}T00:00:00Z`,
            end: `${endDate}T23:59:59Z`,
        },
        expand: true,
    });

    console.log(`[Calendar] Fetched ${objects.length} calendar objects for ${startDate} ~ ${endDate}`);

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

    // Sort: timed events first (by time), then all-day events
    events.sort((a, b) => {
        if (a.allDay && !b.allDay) return 1;
        if (!a.allDay && b.allDay) return -1;
        if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
        return a.startDate.localeCompare(b.startDate);
    });
    return events;
}

/**
 * 오늘 또는 특정 날짜의 일정 조회
 */
export async function getEventsForDate(date: string): Promise<CalendarEvent[]> {
    // Search exact date range
    const [y, m, d] = date.split("-").map(Number);
    const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
    const nextDayStr = `${nextDay.getUTCFullYear()}-${String(nextDay.getUTCMonth() + 1).padStart(2, "0")}-${String(nextDay.getUTCDate()).padStart(2, "0")}`;

    const events = await getEvents(date, nextDayStr);

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
 * 일정 목록 포맷팅 (번호 + 시간 포함)
 */
export function formatEventList(events: CalendarEvent[], dateLabel: string): string {
    if (events.length === 0) {
        return `📅 ${dateLabel} 일정이 없어요! 여유로운 하루네요~ ✨`;
    }

    const lines = [`📅 ${dateLabel} 일정 (${events.length}건)`];
    lines.push("━━━━━━━━━━━━━━━━━━━━");

    events.forEach((event, idx) => {
        const num = idx + 1;
        // Time display
        let timeStr = "📆 종일";
        if (event.startTime) {
            const startH = parseInt(event.startTime.split(":")[0], 10);
            const startM = event.startTime.split(":")[1];
            const ampm = startH < 12 ? "오전" : "오후";
            const h12 = startH === 0 ? 12 : startH > 12 ? startH - 12 : startH;
            timeStr = `🕐 ${ampm} ${h12}:${startM}`;
            if (event.endTime) {
                const endH = parseInt(event.endTime.split(":")[0], 10);
                const endM = event.endTime.split(":")[1];
                const endAmpm = endH < 12 ? "오전" : "오후";
                const endH12 = endH === 0 ? 12 : endH > 12 ? endH - 12 : endH;
                timeStr += ` ~ ${endAmpm} ${endH12}:${endM}`;
            }
        }

        const recurring = event.isRecurring ? " 🔄" : "";
        lines.push(`${num}️⃣ ${event.title}${recurring}`);
        lines.push(`   ${timeStr}`);
        if (event.description) {
            lines.push(`   📝 ${event.description}`);
        }
    });

    lines.push("");
    lines.push("💡 수정/삭제는 번호로 말씀해 주세요!");
    lines.push('   예: "3번 삭제해줘", "2번 제목 변경해줘"');
    return lines.join("\n");
}
