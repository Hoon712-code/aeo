/**
 * 📅 Apple Calendar CalDAV Integration
 *
 * CalDAV를 통해 Apple 캘린더의 일정을 조회/추가/수정/삭제
 * - 반복 일정 (RRULE) 지원
 * - 시간 지정 일정 지원 (KST)
 */

import { createDAVClient, DAVCalendar, DAVObject } from "tsdav";

const APPLE_ID = process.env.APPLE_ID || "";
const APPLE_APP_PASSWORD = process.env.APPLE_APP_PASSWORD || "";

export interface CalendarEvent {
    uid: string;
    title: string;
    startDate: string; // YYYY-MM-DD (KST)
    endDate: string;   // YYYY-MM-DD (KST)
    startTime?: string; // HH:MM (KST) — undefined for all-day
    endTime?: string;   // HH:MM (KST)
    allDay: boolean;
    description?: string;
    url?: string;
    etag?: string;
    isRecurring?: boolean;
}

// ─── DAV Client ─────────────────────────────────────
async function getClient() {
    return await createDAVClient({
        serverUrl: "https://caldav.icloud.com",
        credentials: { username: APPLE_ID, password: APPLE_APP_PASSWORD },
        authMethod: "Basic",
        defaultAccountType: "caldav",
    });
}

async function getDefaultCalendar(): Promise<{ client: ReturnType<typeof createDAVClient> extends Promise<infer T> ? T : never; calendar: DAVCalendar }> {
    const client = await getClient();
    const calendars = await client.fetchCalendars();
    if (!calendars || calendars.length === 0) throw new Error("캘린더를 찾을 수 없습니다.");

    const defaultCal = calendars.find(c => {
        const name = (c.displayName as string || "").toLowerCase();
        return name.includes("home") || name.includes("개인") || name.includes("홈") || name.includes("집");
    }) || calendars.find(c => {
        const name = (c.displayName as string || "").toLowerCase();
        return !name.includes("미리 알림") && !name.includes("reminder");
    }) || calendars[0];

    console.log(`[Calendar] Using: "${defaultCal.displayName}"`);
    return { client, calendar: defaultCal };
}

// ─── Parse iCalendar datetime ───────────────────────
// Returns { date: "YYYY-MM-DD", time?: "HH:MM" } in KST
function parseDT(icsData: string, prefix: "DTSTART" | "DTEND"): { date: string; time?: string } | null {
    // Patterns:
    //   DTSTART;VALUE=DATE:20260318                      → all-day
    //   DTSTART;TZID=Asia/Seoul:20260318T090000          → timed, KST
    //   DTSTART:20260318T090000Z                         → timed, UTC
    //   DTSTART:20260318T180000                          → timed, floating (treat as KST)
    const regex = new RegExp(`${prefix}[^:]*:(\\d{8})(?:T(\\d{4,6})(Z)?)?`);
    const match = icsData.match(regex);
    if (!match) return null;

    const dateRaw = match[1];
    const timeRaw = match[2]; // "090000" or "0900" or undefined
    const isUTC = match[3] === "Z";

    if (!timeRaw) {
        // All-day event
        return { date: `${dateRaw.slice(0,4)}-${dateRaw.slice(4,6)}-${dateRaw.slice(6,8)}` };
    }

    // Parse hours/minutes
    let h = parseInt(timeRaw.slice(0, 2), 10);
    const m = timeRaw.slice(2, 4);

    // Check if TZID is specified
    const tzMatch = icsData.match(new RegExp(`${prefix};TZID=([^:;]+)`));
    const tzid = tzMatch?.[1] || "";
    const isKST = tzid.includes("Seoul") || tzid.includes("Korea") || tzid.includes("KST");

    let dateStr = `${dateRaw.slice(0,4)}-${dateRaw.slice(4,6)}-${dateRaw.slice(6,8)}`;

    if (isUTC) {
        // UTC → KST: add 9 hours
        h += 9;
        if (h >= 24) {
            h -= 24;
            // Date shifts: compute next day
            const [y, mo, d] = [parseInt(dateRaw.slice(0,4)), parseInt(dateRaw.slice(4,6)), parseInt(dateRaw.slice(6,8))];
            const next = new Date(Date.UTC(y, mo - 1, d + 1));
            dateStr = `${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,"0")}-${String(next.getUTCDate()).padStart(2,"0")}`;
        }
    } else if (!isKST && !tzid) {
        // Floating time — treat as KST (common in Apple Calendar)
    }
    // If TZID is Asia/Seoul or KST, time is already KST — no conversion needed

    return { date: dateStr, time: `${String(h).padStart(2,"0")}:${m}` };
}

// Check if a recurring event occurs on a given KST date
function rruleMatchesDate(icsData: string, targetDate: string): boolean {
    const rruleMatch = icsData.match(/RRULE:(.+?)[\r\n]/);
    if (!rruleMatch) return false;

    const rrule = rruleMatch[1];
    const [tY, tM, tD] = targetDate.split("-").map(Number);
    const target = new Date(Date.UTC(tY, tM - 1, tD));
    const targetDow = target.getUTCDay(); // 0=Sun...6=Sat

    // Check UNTIL (end date of recurrence)
    const untilMatch = rrule.match(/UNTIL=(\d{8})/);
    if (untilMatch) {
        const until = untilMatch[1];
        const untilDate = `${until.slice(0,4)}-${until.slice(4,6)}-${until.slice(6,8)}`;
        if (targetDate > untilDate) return false;
    }

    // Check FREQ
    if (/FREQ=DAILY/.test(rrule)) return true;

    if (/FREQ=WEEKLY/.test(rrule)) {
        const byDayMatch = rrule.match(/BYDAY=([A-Z,]+)/);
        if (!byDayMatch) return true; // Weekly without BYDAY → same day as DTSTART
        const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
        const days = byDayMatch[1].split(",").map(d => dayMap[d.trim()]);
        return days.includes(targetDow);
    }

    if (/FREQ=MONTHLY/.test(rrule)) {
        const byMDMatch = rrule.match(/BYMONTHDAY=(\d+)/);
        if (byMDMatch) return tD === parseInt(byMDMatch[1], 10);
        // Monthly by day of week (e.g., 3rd Wednesday)
        return true; // Approximate: include it
    }

    if (/FREQ=YEARLY/.test(rrule)) {
        // Check if same month/day
        const start = parseDT(icsData, "DTSTART");
        if (start) {
            const [, sM, sD] = start.date.split("-").map(Number);
            return tM === sM && tD === sD;
        }
    }

    return true; // Default: include unknown patterns
}

function parseICS(icsData: string, targetDate?: string): CalendarEvent | null {
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
                // All-day DTEND is exclusive → subtract 1 day
                const [y, m, d] = endDate.split("-").map(Number);
                const prev = new Date(Date.UTC(y, m - 1, d - 1));
                endDate = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth()+1).padStart(2,"0")}-${String(prev.getUTCDate()).padStart(2,"0")}`;
            }
        }

        // For recurring events, check if this occurrence matches target date
        if (hasRRule && targetDate) {
            // Check DTSTART is on or before target
            if (start.date > targetDate) return null;
            if (!rruleMatchesDate(icsData, targetDate)) return null;
            // Override date to target for display
            return {
                uid: uidMatch?.[1]?.trim() || "",
                title: summaryMatch[1].trim(),
                startDate: targetDate,
                endDate: targetDate,
                startTime: start.time,
                endTime: end?.time,
                allDay,
                description: descMatch?.[1]?.trim(),
                isRecurring: true,
            };
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
    const [ey, em, ed] = event.endDate.split("-").map(Number);
    const endDt = new Date(Date.UTC(ey, em - 1, ed + 1));
    const end = `${endDt.getUTCFullYear()}${String(endDt.getUTCMonth()+1).padStart(2,"0")}${String(endDt.getUTCDate()).padStart(2,"0")}`;

    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth()+1).padStart(2,"0")}${String(now.getUTCDate()).padStart(2,"0")}T${String(now.getUTCHours()).padStart(2,"0")}${String(now.getUTCMinutes()).padStart(2,"0")}${String(now.getUTCSeconds()).padStart(2,"0")}Z`;

    let ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Snowy//Calendar//KO\nBEGIN:VEVENT\nUID:${uid}\nDTSTART;VALUE=DATE:${start}\nDTEND;VALUE=DATE:${end}\nSUMMARY:${event.title}`;
    if (event.description) ics += `\nDESCRIPTION:${event.description}`;
    ics += `\nDTSTAMP:${stamp}\nEND:VEVENT\nEND:VCALENDAR`;
    return ics;
}

// ─── Public API ─────────────────────────────────────

/**
 * 특정 KST 날짜의 일정 조회 (반복 일정 포함)
 */
export async function getEventsForDate(date: string): Promise<CalendarEvent[]> {
    const { client, calendar } = await getDefaultCalendar();

    // Convert KST date boundaries to UTC for CalDAV query
    // KST 2026-03-18 00:00:00 = UTC 2026-03-17 15:00:00
    // KST 2026-03-18 23:59:59 = UTC 2026-03-18 14:59:59
    const [y, m, d] = date.split("-").map(Number);
    const kstStart = new Date(Date.UTC(y, m - 1, d, -9, 0, 0));  // KST midnight = UTC -9h
    const kstEnd   = new Date(Date.UTC(y, m - 1, d, -9 + 23, 59, 59));

    console.log(`[Calendar] Query: KST ${date} → UTC ${kstStart.toISOString()} ~ ${kstEnd.toISOString()}`);

    const objects = await client.fetchCalendarObjects({
        calendar,
        timeRange: {
            start: kstStart.toISOString(),
            end: kstEnd.toISOString(),
        },
        // No expand — we handle RRULE ourselves
    });

    console.log(`[Calendar] Got ${objects.length} objects`);

    const events: CalendarEvent[] = [];
    const seenUids = new Set<string>();

    for (const obj of objects) {
        if (!obj.data) continue;
        // Log raw DTSTART/DTEND for debugging
        const dtLines = obj.data.split(/[\r\n]+/).filter((l: string) => /^(DTSTART|DTEND|RRULE|SUMMARY)/.test(l));
        console.log(`[Calendar] RAW: ${dtLines.join(' | ')}`);
        const event = parseICS(obj.data, date);
        if (!event) continue;

        // Deduplicate by UID
        if (seenUids.has(event.uid)) continue;
        seenUids.add(event.uid);


        // For non-recurring: check date overlap
        if (!event.isRecurring) {
            if (event.startDate > date || event.endDate < date) {
                console.log(`[Calendar] SKIP "${event.title}" start=${event.startDate} end=${event.endDate} allDay=${event.allDay} recurring=${event.isRecurring} (target=${date})`);
                continue;
            }
        }

        console.log(`[Calendar] KEEP "${event.title}" start=${event.startDate} end=${event.endDate} time=${event.startTime || 'allday'} recurring=${event.isRecurring}`);
        event.url = obj.url;
        event.etag = obj.etag || undefined;
        events.push(event);
    }

    // Sort: timed events by time first, then all-day events
    events.sort((a, b) => {
        if (a.allDay && !b.allDay) return 1;
        if (!a.allDay && b.allDay) return -1;
        if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
        return 0;
    });

    console.log(`[Calendar] Returning ${events.length} events for ${date}`);
    return events;
}

/**
 * 특정 날짜 범위의 일정 조회
 */
export async function getEvents(startDate: string, endDate: string): Promise<CalendarEvent[]> {
    // For range queries, collect events for each day
    const events: CalendarEvent[] = [];
    const [sy, sm, sd] = startDate.split("-").map(Number);
    const [ey, em, ed] = endDate.split("-").map(Number);
    const start = new Date(Date.UTC(sy, sm - 1, sd));
    const end = new Date(Date.UTC(ey, em - 1, ed));

    for (let dt = new Date(start); dt <= end; dt.setUTCDate(dt.getUTCDate() + 1)) {
        const dateStr = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,"0")}-${String(dt.getUTCDate()).padStart(2,"0")}`;
        const dayEvents = await getEventsForDate(dateStr);
        events.push(...dayEvents);
    }
    return events;
}

/**
 * 일정 추가
 */
export async function createEvent(title: string, startDate: string, endDate: string, description?: string): Promise<CalendarEvent> {
    const { client, calendar } = await getDefaultCalendar();
    const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@snowy`;
    const icsData = generateICS({ title, startDate, endDate, description, uid });
    await client.createCalendarObject({ calendar, filename: `${uid}.ics`, iCalString: icsData });
    return { uid, title, startDate, endDate, allDay: true, description };
}

/**
 * 일정 수정
 */
export async function updateEvent(url: string, etag: string | undefined, title: string, startDate: string, endDate: string, description?: string): Promise<void> {
    const { client } = await getDefaultCalendar();
    const uidMatch = url.match(/([^/]+)\.ics$/);
    const uid = uidMatch ? uidMatch[1] : `${Date.now()}@snowy`;
    const icsData = generateICS({ title, startDate, endDate, description, uid });
    await client.updateCalendarObject({ calendarObject: { url, data: icsData, etag: etag || "" } });
}

/**
 * 일정 삭제
 */
export async function deleteEvent(url: string, etag: string | undefined): Promise<void> {
    const { client } = await getDefaultCalendar();
    await client.deleteCalendarObject({ calendarObject: { url, etag: etag || "" } });
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
        let timeStr = "종일";
        if (event.startTime) {
            const [sh, sm] = event.startTime.split(":").map(Number);
            const ampm = sh < 12 ? "오전" : "오후";
            const h12 = sh === 0 ? 12 : sh > 12 ? sh - 12 : sh;
            timeStr = `${ampm} ${h12}:${String(sm).padStart(2, "0")}`;
            if (event.endTime) {
                const [eh, em2] = event.endTime.split(":").map(Number);
                const eAmpm = eh < 12 ? "오전" : "오후";
                const eH12 = eh === 0 ? 12 : eh > 12 ? eh - 12 : eh;
                timeStr += ` ~ ${eAmpm} ${eH12}:${String(em2).padStart(2, "0")}`;
            }
        }

        const recurring = event.isRecurring ? " 🔄" : "";
        lines.push(`${getNumEmoji(num)} ${event.title}${recurring}`);
        lines.push(`   🕐 ${timeStr}`);
        if (event.description) {
            lines.push(`   📝 ${event.description}`);
        }
    });

    lines.push("");
    lines.push("💡 수정/삭제는 번호로 말씀해 주세요!");
    lines.push('   예: "3번 삭제해줘", "2번 제목 변경해줘"');
    return lines.join("\n");
}

function getNumEmoji(n: number): string {
    const emojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];
    return n <= 10 ? emojis[n-1] : `${n}.`;
}
