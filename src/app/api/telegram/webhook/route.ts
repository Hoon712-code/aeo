import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getEventsForDate, getEvents, createEvent, deleteEvent, formatEventList, CalendarEvent } from "@/lib/calendar";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ─── Types ───────────────────────────────────────────
interface TelegramMessage {
    message_id: number;
    from: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string; title?: string };
    text?: string;
    date: number;
    reply_to_message?: {
        from?: { id: number; username?: string; is_bot?: boolean };
        text?: string;
    };
}

interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
}

// ─── Telegram Helpers ────────────────────────────────
async function sendTelegramMessage(chatId: number, text: string, replyToMessageId?: number) {
    // Telegram max message length is 4096
    const chunks = splitMessage(text, 4000);
    for (const chunk of chunks) {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text: chunk,
                reply_to_message_id: replyToMessageId,
            }),
        });
    }
}

function splitMessage(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            chunks.push(remaining);
            break;
        }
        let splitAt = remaining.lastIndexOf("\n", maxLen);
        if (splitAt === -1 || splitAt < maxLen / 2) splitAt = maxLen;
        chunks.push(remaining.substring(0, splitAt));
        remaining = remaining.substring(splitAt).trim();
    }
    return chunks;
}

// ─── 1. Conversation Memory (Supabase) ───────────────
async function saveMessage(chatId: number, userId: number, userName: string, role: "user" | "assistant", text: string) {
    try {
        const supabase = createServerClient();
        await supabase.from("chat_history").insert({
            chat_id: chatId,
            user_id: userId,
            user_name: userName,
            role,
            message: text.substring(0, 4000), // limit storage
            created_at: new Date().toISOString(),
        });
    } catch (e) {
        console.error("Failed to save message:", e);
    }
}

async function getChatHistory(chatId: number, limit: number = 50): Promise<{ role: string; message: string; user_name: string }[]> {
    try {
        const supabase = createServerClient();
        const { data } = await supabase
            .from("chat_history")
            .select("role, message, user_name")
            .eq("chat_id", chatId)
            .order("created_at", { ascending: false })
            .limit(limit);
        return (data || []).reverse();
    } catch (e) {
        console.error("Failed to get chat history:", e);
        return [];
    }
}

// ─── 2. Mission Status Query ─────────────────────────
async function getMissionStatus(): Promise<string> {
    try {
        const supabase = createServerClient();

        // Get all users
        const { data: users } = await supabase.from("users").select("id, name, label").order("label");

        // Get all logs
        const { data: logs } = await supabase.from("logs").select("user_id, mission_id, completed_at");

        // Get total mission count
        const { data: missions } = await supabase.from("missions").select("id, round, step");

        if (!users || !missions) return "미션 데이터를 불러올 수 없습니다.";

        const totalMissions = missions.length; // 15 total (5 rounds × 3 steps)
        const logsByUser = new Map<string, number>();

        (logs || []).forEach((log) => {
            const count = logsByUser.get(log.user_id) || 0;
            logsByUser.set(log.user_id, count + 1);
        });

        let completedAll = 0;
        let inProgress = 0;
        let notStarted = 0;
        const details: string[] = [];

        for (const user of users) {
            const completed = logsByUser.get(user.id) || 0;
            const percent = Math.round((completed / totalMissions) * 100);

            if (completed >= totalMissions) {
                completedAll++;
                details.push(`✅ ${user.name} - 완료! (${completed}/${totalMissions})`);
            } else if (completed > 0) {
                inProgress++;
                const currentRound = Math.floor(completed / 3) + 1;
                details.push(`🔄 ${user.name} - ${currentRound}단계 진행중 (${percent}%)`);
            } else {
                notStarted++;
                details.push(`⬜ ${user.name} - 미시작`);
            }
        }

        // Today's activity
        const today = new Date().toISOString().split("T")[0];
        const todayLogs = (logs || []).filter((l) =>
            l.completed_at && l.completed_at.startsWith(today)
        );

        return [
            `📊 설야갈비 AI 서포터즈 미션 현황`,
            `━━━━━━━━━━━━━━━━━━━━`,
            `👥 총 서포터즈: ${users.length}명`,
            `✅ 전체 완료: ${completedAll}명`,
            `🔄 진행 중: ${inProgress}명`,
            `⬜ 미시작: ${notStarted}명`,
            `📅 오늘 완료한 미션: ${todayLogs.length}건`,
            ``,
            `── 개인별 현황 ──`,
            ...details,
        ].join("\n");
    } catch (e) {
        console.error("Mission status error:", e);
        return "미션 현황을 조회하는 중 오류가 발생했습니다.";
    }
}

// ─── 2-1. Work Status Query (from work_log) ──────────
async function getWorkStatus(): Promise<string> {
    try {
        const supabase = createServerClient();

        // Get recent work_log entries (last 20)
        const { data: workLogs, error } = await supabase
            .from("work_log")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(20);

        if (error) {
            console.error("Work log query error:", error);
            return "작업 로그를 조회하는 중 오류가 발생했습니다.";
        }

        if (!workLogs || workLogs.length === 0) {
            return "📋 최근 작업 기록이 없습니다.\n\n아직 자동 미션 시스템이 실행된 적이 없어요.";
        }

        // Determine if a batch is currently running
        const latestBatchStart = workLogs.find((l) => l.event_type === "batch_start");
        const latestBatchComplete = workLogs.find((l) => l.event_type === "batch_complete");
        const latestError = workLogs.find((l) => l.event_type === "error");

        let isRunning = false;
        if (latestBatchStart) {
            const startTime = new Date(latestBatchStart.created_at).getTime();
            const completeTime = latestBatchComplete ? new Date(latestBatchComplete.created_at).getTime() : 0;
            const errorTime = latestError ? new Date(latestError.created_at).getTime() : 0;
            // Running if batch_start is newer than both complete and error
            isRunning = startTime > completeTime && startTime > errorTime;
        }

        // Build status string
        const lines: string[] = [];

        if (isRunning) {
            lines.push("🟢 현재 상태: 작업 실행 중!");
            lines.push(`━━━━━━━━━━━━━━━━━━━━`);

            // Find the latest progress update
            const latestProgress = workLogs.find((l) => l.event_type === "user_progress");
            if (latestProgress && new Date(latestProgress.created_at).getTime() > new Date(latestBatchStart!.created_at).getTime()) {
                lines.push(`📊 ${latestProgress.message}`);
            } else {
                lines.push(`🚀 ${latestBatchStart!.message}`);
            }

            const startedAt = new Date(latestBatchStart!.created_at);
            const elapsed = Math.round((Date.now() - startedAt.getTime()) / 60000);
            lines.push(`⏱️ 경과 시간: ${elapsed}분`);
        } else {
            lines.push("⚪ 현재 상태: 대기 중 (작업 없음)");
            lines.push(`━━━━━━━━━━━━━━━━━━━━`);
        }

        // Show recent activity (latest 5 events)
        lines.push("");
        lines.push("📜 최근 활동 기록:");
        const recentLogs = workLogs.slice(0, 5);
        for (const entry of recentLogs) {
            const time = new Date(entry.created_at).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });
            lines.push(`  [${time}] ${entry.message}`);
        }

        return lines.join("\n");
    } catch (e) {
        console.error("Work status error:", e);
        return "작업 상태를 조회하는 중 오류가 발생했습니다.";
    }
}

// ─── 3. Reminder System ──────────────────────────────
async function saveReminder(chatId: number, userId: number, userName: string, reminderText: string, remindAt: string) {
    try {
        const supabase = createServerClient();
        await supabase.from("reminders").insert({
            chat_id: chatId,
            user_id: userId,
            user_name: userName,
            reminder_text: reminderText,
            remind_at: remindAt,
            is_sent: false,
        });
        return true;
    } catch (e) {
        console.error("Failed to save reminder:", e);
        return false;
    }
}

function parseReminderTime(text: string): { reminderText: string; remindAt: string } | null {
    const now = new Date();
    // KST offset
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);

    // Pattern: "N분 후 알려줘 XXX" or "N시간 후 알려줘 XXX"
    const minuteMatch = text.match(/(\d+)\s*분\s*(후|뒤)?\s*(에)?\s*알려줘\s*(.*)/);
    if (minuteMatch) {
        const minutes = parseInt(minuteMatch[1]);
        const remindAt = new Date(kstNow.getTime() + minutes * 60 * 1000);
        return {
            reminderText: minuteMatch[4] || `${minutes}분 후 알림`,
            remindAt: remindAt.toISOString(),
        };
    }

    const hourMatch = text.match(/(\d+)\s*시간\s*(후|뒤)?\s*(에)?\s*알려줘\s*(.*)/);
    if (hourMatch) {
        const hours = parseInt(hourMatch[1]);
        const remindAt = new Date(kstNow.getTime() + hours * 60 * 60 * 1000);
        return {
            reminderText: hourMatch[4] || `${hours}시간 후 알림`,
            remindAt: remindAt.toISOString(),
        };
    }

    // Pattern: "내일 N시에 알려줘 XXX"
    const tomorrowMatch = text.match(/내일\s*(\d{1,2})\s*시\s*(에)?\s*알려줘\s*(.*)/);
    if (tomorrowMatch) {
        const hour = parseInt(tomorrowMatch[1]);
        const remindAt = new Date(kstNow);
        remindAt.setDate(remindAt.getDate() + 1);
        remindAt.setHours(hour, 0, 0, 0);
        return {
            reminderText: tomorrowMatch[3] || `내일 ${hour}시 알림`,
            remindAt: remindAt.toISOString(),
        };
    }

    // Pattern: "오늘 N시에 알려줘 XXX"
    const todayMatch = text.match(/오늘\s*(\d{1,2})\s*시\s*(에)?\s*알려줘\s*(.*)/);
    if (todayMatch) {
        const hour = parseInt(todayMatch[1]);
        const remindAt = new Date(kstNow);
        remindAt.setHours(hour, 0, 0, 0);
        return {
            reminderText: todayMatch[3] || `오늘 ${hour}시 알림`,
            remindAt: remindAt.toISOString(),
        };
    }

    return null;
}

// ─── 4. Mission Command Parsing ──────────────────────
interface MissionCommand {
    command: "run" | "dryrun" | "stop" | "auto-cycle" | "auto-cycle-stop";
    args: { round?: number; maxUsers?: number; concurrency?: number; startRound?: number };
}

function parseMissionCommand(text: string): MissionCommand | null {
    const lower = text.toLowerCase().replace(/\s+/g, " ").trim();

    // Stop command
    if (/미션\s*(중지|중단|스탑|멈춰|꺼)/.test(lower)) {
        return { command: "stop", args: {} };
    }

    // Auto-cycle stop (graceful)
    if (/자동\s*미션\s*(중지|중단|멈춰|꺼|스탑)|자동\s*순환\s*(중지|중단)/.test(lower)) {
        return { command: "auto-cycle-stop", args: {} };
    }

    // Auto-cycle start
    if (/자동\s*미션\s*(시작|실행|돌려|돌리|런)|자동\s*순환\s*(시작|실행)/.test(lower)) {
        const roundMatch = lower.match(/(?:라운드|round)[\s=]*(\d+)/)
            || lower.match(/(\d+)\s*라운드/);
        const startRound = roundMatch ? parseInt(roundMatch[1], 10) : 1;
        return { command: "auto-cycle", args: { startRound } };
    }

    // Run or dry-run command
    const isDryRun = /드라이런|dry[\s-]?run|시뮬|테스트\s*실행/.test(lower);
    const isRun = isDryRun || /미션\s*(실행|돌려|돌리|시작|런|run)|미션을?\s*(돌려|실행)/.test(lower);

    if (!isRun) return null;

    const args: MissionCommand["args"] = {};

    // Extract round number: "라운드=3", "라운드3", "round3", "round=3", "라운드 3", "3라운드", "4라운드"
    const roundMatch = lower.match(/(?:라운드|round)[\s=]*(\d+)/)
        || lower.match(/(?:라운드|round)\s*(\d+)/)
        || lower.match(/(\d+)\s*라운드/)
        || lower.match(/r(\d+)(?:\s|$)/i);
    if (roundMatch) args.round = parseInt(roundMatch[1], 10);

    // Extract max users: "유저=50", "유저50", "50명"
    const userMatch = lower.match(/(?:유저|사람|인원|max[\s-]?users?)[\s=]*(\d+)/)
        || lower.match(/(\d+)\s*명/);
    if (userMatch) args.maxUsers = parseInt(userMatch[1], 10);

    // Extract concurrency: "동시=3", "동시3"
    const concMatch = lower.match(/(?:동시|concurrency)[\s=]*(\d+)/);
    if (concMatch) args.concurrency = parseInt(concMatch[1], 10);

    return { command: isDryRun ? "dryrun" : "run", args };
}

async function handleMissionCommand(chatId: number, userName: string, text: string): Promise<string> {
    const parsed = parseMissionCommand(text);
    if (!parsed) return "";

    const supabase = createServerClient();

    // Check for existing running command
    if (parsed.command !== "stop") {
        const { data: running } = await supabase
            .from("command_queue")
            .select("id")
            .in("status", ["pending", "running"])
            .limit(1);

        if (running && running.length > 0) {
            return "⚠️ 이미 실행 중이거나 대기 중인 명령이 있습니다.\n중지하려면 '미션 중지'를 입력하세요.";
        }
    }

    // Insert command into queue
    const { error } = await supabase.from("command_queue").insert({
        command: parsed.command,
        args: parsed.args,
        status: "pending",
        requested_by: userName,
        chat_id: chatId,
    });

    if (error) {
        console.error("command_queue insert error:", error);
        return "❌ 명령 등록에 실패했습니다. 다시 시도해 주세요.";
    }

    const { command, args } = parsed;
    const roundLabel = args.round ? `라운드 ${args.round}` : "전체 라운드";
    const maxUsers = args.maxUsers || 100;
    const concurrency = args.concurrency || 1;

    if (command === "stop") {
        return "🛑 미션 중지 명령이 전달되었습니다.";
    }

    const label = command === "dryrun" ? "DRY-RUN" : "실행";
    return [
        `📋 미션 ${label} 명령 접수!`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `🎯 ${roundLabel}`,
        `👥 최대 ${maxUsers}명 | 동시 ${concurrency}명`,
        `👤 요청자: ${userName}`,
        ``,
        `⏳ 로컬 시스템에서 곧 실행됩니다...`,
        `💡 진행 상태 확인: '작업 상태'`,
    ].join("\n");
}

// ─── 5. Intent Detection & Gemini Call ───────────────
type Intent = "mission_command" | "mission_status" | "work_status" | "calendar" | "reminder" | "web_search" | "general";

function detectIntent(text: string): Intent {
    const lower = text.toLowerCase();

    // Mission command keywords (미션 실행/중지 명령)
    if (/미션\s*(실행|돌려|돌리|시작|런|run|중지|중단|스탑|멈춰|꺼)/.test(lower) ||
        /미션을?\s*(돌려|실행)/.test(lower) ||
        /드라이런|dry[\s-]?run/.test(lower) ||
        /미션\s*테스트\s*실행/.test(lower) ||
        /자동\s*미션|자동\s*순환/.test(lower)) {
        return "mission_command";
    }

    // Work status keywords (작업 상태 조회 — auto-mission 진행 현황)
    if (/작업\s*(상태|현황|진행|로그)/.test(lower) ||
        /뭐\s*(하고|하는)\s*(있|중|거)/.test(lower) ||
        /무슨\s*(일|작업)/.test(lower) ||
        /현재\s*(작업|상태|상황)/.test(lower) ||
        /자동\s*미션\s*(상태|현황|진행)/.test(lower) ||
        /시스템\s*(상태|현황)/.test(lower)) {
        return "work_status";
    }

    // Mission status keywords
    if (/미션\s*(현황|진행|상태|진척|조회)/.test(lower) ||
        /현황\s*(알려|보여|확인)/.test(lower) ||
        /진행\s*(상황|률|율)/.test(lower)) {
        return "mission_status";
    }

    // Calendar keywords (MUST be before reminder to avoid "내일 스케줄 알려줘" → reminder)
    if (/일정|스케줄|캘린더|calendar/.test(lower) ||
        /오늘\s*(일정|할\s*일|스케줄)|내일\s*(일정|할\s*일|스케줄)/.test(lower) ||
        /일정\s*(추가|등록|만들|잡아|넣어|삭제|지워|수정|변경|완료|끝|옮겨)/.test(lower) ||
        /\d+번\s*(삭제|지워|수정|변경|완료|끝|옮겨|내일)/.test(lower) ||
        /\d+월\s*\d+일\s*(일정|스케줄)/.test(lower) ||
        /내일\s*뭐/.test(lower)) {
        return "calendar";
    }

    // Reminder keywords (after calendar check)
    if (/알려줘|리마인더|알림\s*(설정|등록)/.test(lower) &&
        /(\d+\s*(분|시간)|내일|오늘)/.test(lower) &&
        !/일정|스케줄|캘린더/.test(lower)) {
        return "reminder";
    }

    // Web search keywords
    if (/검색|찾아줘|찾아봐|알아봐|최신|뉴스|오늘\s*(날씨|기온)|현재\s*(시간|날짜)/.test(lower)) {
        return "web_search";
    }

    return "general";
}

// ─── 5-1. Calendar Command Handler ────────────────────
function getKSTToday(): string {
    const now = new Date();
    now.setHours(now.getHours() + 9);
    return now.toISOString().split("T")[0];
}

function getKSTTomorrow(): string {
    const now = new Date();
    now.setHours(now.getHours() + 9);
    now.setDate(now.getDate() + 1);
    return now.toISOString().split("T")[0];
}

function parseDateFromText(text: string): string | null {
    const lower = text.toLowerCase();
    if (/오늘/.test(lower)) return getKSTToday();
    if (/내일/.test(lower)) return getKSTTomorrow();
    if (/모레/.test(lower)) {
        const d = new Date(); d.setHours(d.getHours() + 9); d.setDate(d.getDate() + 2);
        return d.toISOString().split("T")[0];
    }
    const mMatch = lower.match(/(\d{1,2})월\s*(\d{1,2})일/);
    if (mMatch) {
        const now = new Date(); now.setHours(now.getHours() + 9);
        return `${now.getFullYear()}-${mMatch[1].padStart(2, "0")}-${mMatch[2].padStart(2, "0")}`;
    }
    const slashMatch = lower.match(/(\d{1,2})\/(\d{1,2})/);
    if (slashMatch) {
        const now = new Date(); now.setHours(now.getHours() + 9);
        return `${now.getFullYear()}-${slashMatch[1].padStart(2, "0")}-${slashMatch[2].padStart(2, "0")}`;
    }
    return null;
}

async function handleCalendarCommand(chatId: number, text: string): Promise<string> {
    const lower = text.toLowerCase();
    try {
        // 1. View today's schedule
        if (/오늘\s*(일정|할\s*일|스케줄)|일정\s*(조회|확인|알려|보여)/.test(lower) && !/내일/.test(lower)) {
            const today = getKSTToday();
            const events = await getEventsForDate(today);
            const dateStr = new Date(today + "T00:00:00+09:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
            return formatEventList(events, `오늘 (${dateStr})`);
        }
        // 2. View tomorrow's schedule
        if (/내일\s*(일정|할\s*일|스케줄)/.test(lower)) {
            const tomorrow = getKSTTomorrow();
            const events = await getEventsForDate(tomorrow);
            const dateStr = new Date(tomorrow + "T00:00:00+09:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
            return formatEventList(events, `내일 (${dateStr})`);
        }
        // 3. View specific date
        const dateFromText = parseDateFromText(text);
        if (dateFromText && /일정|스케줄/.test(lower) && !/추가|등록|만들|잡아|넣어/.test(lower)) {
            const events = await getEventsForDate(dateFromText);
            const dateStr = new Date(dateFromText + "T00:00:00+09:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
            return formatEventList(events, dateStr);
        }
        // 4. Add event
        if (/일정\s*(추가|등록|만들|잡아|넣어)/.test(lower)) {
            const startDate = parseDateFromText(text);
            if (!startDate) return "📅 날짜를 알려주세요!\n예: \"4월 5일 미팅 일정 추가\"";
            let endDate = startDate;
            const rangeMatch = text.match(/(\d{1,2})월\s*(\d{1,2})일\s*[~\-부터]\s*(\d{1,2})월\s*(\d{1,2})일/);
            if (rangeMatch) {
                const now = new Date(); now.setHours(now.getHours() + 9);
                endDate = `${now.getFullYear()}-${rangeMatch[3].padStart(2, "0")}-${rangeMatch[4].padStart(2, "0")}`;
            }
            let title = text.replace(/일정\s*(추가|등록|만들어?|잡아|넣어)/g, "").replace(/\d{1,2}월\s*\d{1,2}일/g, "").replace(/(오늘|내일|모레)/g, "").replace(/[~\-부터까지]/g, "").trim();
            if (!title) title = "일정";
            const event = await createEvent(title, startDate, endDate);
            const dateInfo = startDate === endDate ? startDate : `${startDate} ~ ${endDate}`;
            return `✅ 일정이 추가되었어요! 🎉\n\n📌 ${event.title}\n📆 ${dateInfo}\n\n다른 일정도 추가하실래요? 💕`;
        }
        // 5. Delete event by number
        const deleteMatch = lower.match(/(\d+)\s*번\s*(삭제|지워|취소|제거)/);
        if (deleteMatch) {
            const eventNum = parseInt(deleteMatch[1], 10);
            const today = getKSTToday();
            const events = await getEventsForDate(today);
            if (eventNum < 1 || eventNum > events.length) return `⚠️ ${eventNum}번 일정이 없어요. 오늘 일정은 ${events.length}건이에요.`;
            const target = events[eventNum - 1];
            if (target.url) { await deleteEvent(target.url, target.etag); return `🗑️ ${eventNum}번 "${target.title}" 일정이 삭제되었어요!`; }
            return "⚠️ 이 일정은 삭제할 수 없어요.";
        }
        // 6. Mark as complete
        const completeMatch = lower.match(/(\d+)\s*번\s*(완료|끝|끝남|했어|다했어)/);
        if (completeMatch) {
            const eventNum = parseInt(completeMatch[1], 10);
            const today = getKSTToday();
            const events = await getEventsForDate(today);
            if (eventNum < 1 || eventNum > events.length) return `⚠️ ${eventNum}번 일정이 없어요.`;
            const target = events[eventNum - 1];
            const supabase = createServerClient();
            await supabase.from("calendar_tasks").upsert({ event_uid: target.uid, title: target.title, date: today, event_number: eventNum, is_completed: true, updated_at: new Date().toISOString() }, { onConflict: "event_uid,date" });
            return `✅ ${eventNum}번 "${target.title}" 완료 처리했어요! 수고했어요~ 👏🎉`;
        }
        // 7. Move to tomorrow
        const moveMatch = lower.match(/(\d+)\s*번\s*(내일|다음날|옮겨|이동)/);
        if (moveMatch) {
            const eventNum = parseInt(moveMatch[1], 10);
            const today = getKSTToday();
            const tomorrow = getKSTTomorrow();
            const events = await getEventsForDate(today);
            if (eventNum < 1 || eventNum > events.length) return `⚠️ ${eventNum}번 일정이 없어요.`;
            const target = events[eventNum - 1];
            await createEvent(target.title, tomorrow, tomorrow, target.description);
            if (target.url) await deleteEvent(target.url, target.etag);
            return `📅 ${eventNum}번 "${target.title}"을 내일(${tomorrow})로 옮겼어요! ✨`;
        }
        // Default: show today
        const today = getKSTToday();
        const events = await getEventsForDate(today);
        const dateStr = new Date(today + "T00:00:00+09:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
        return formatEventList(events, `오늘 (${dateStr})`);
    } catch (error) {
        console.error("Calendar command error:", error);
        return `❌ 캘린더 처리 중 오류가 발생했어요.\n${String(error)}\n\n다시 시도해 주세요! 🙏`;
    }
}

// ─── 6. Auto Project Context ────────────────────────
async function getProjectContext(message: string): Promise<string> {
    const lower = message.toLowerCase();
    const contextParts: string[] = [];

    // Check if question is related to the project
    const isProjectRelated = /미션|라운드|유저|사용자|서포터|설야|갈비|진행|현황|상태|데이터|통계|결과|성공|실패|완료|마지막|어디까지|몇/.test(lower);

    if (!isProjectRelated) return "";

    const supabase = createServerClient();

    try {
        // 1. Get mission execution stats per round
        if (/미션|라운드|진행|현황|상태|통계|결과|성공|실패|완료|마지막|어디까지/.test(lower)) {
            // Get missions (to know round/step structure)
            const { data: missions, error: mErr } = await supabase
                .from("missions")
                .select("id, round, step");

            // Get logs (completed missions)
            const { data: logs, error: lErr } = await supabase
                .from("logs")
                .select("user_id, mission_id, completed_at");

            // Get users
            const { data: users, error: uErr } = await supabase
                .from("users")
                .select("id, name");

            if (mErr) console.error("missions query error:", mErr.message);
            if (lErr) console.error("logs query error:", lErr.message);
            if (uErr) console.error("users query error:", uErr.message);

            if (missions && logs && users) {
                // Build mission ID → round mapping
                const missionRound: Record<number, number> = {};
                for (const m of missions) {
                    missionRound[m.id] = m.round;
                }

                // Count per round
                const roundStats: Record<number, { total: number; userIds: Set<string> }> = {};
                for (const log of logs) {
                    const round = missionRound[log.mission_id];
                    if (!round) continue;
                    if (!roundStats[round]) {
                        roundStats[round] = { total: 0, userIds: new Set() };
                    }
                    roundStats[round].total++;
                    roundStats[round].userIds.add(log.user_id);
                }

                // Find last completed round
                const completedRounds = Object.keys(roundStats).map(Number).sort((a, b) => a - b);
                const lastCompletedRound = completedRounds.length > 0 ? completedRounds[completedRounds.length - 1] : 0;

                let summary = `📊 [사실 기반 데이터] 미션 실행 현황:\n`;
                summary += `👥 총 등록 유저: ${users.length}명\n`;
                summary += `⚡ 마지막으로 실행 완료된 라운드: 라운드${lastCompletedRound}\n`;
                summary += `📌 다음 실행해야 할 라운드: 라운드${lastCompletedRound + 1}\n`;
                summary += `📝 총 완료된 미션: ${logs.length}건\n\n`;

                for (let r = 1; r <= 5; r++) {
                    if (roundStats[r]) {
                        const s = roundStats[r];
                        summary += `  라운드${r}: ✅ 실행 완료 — ${s.userIds.size}명 참여, ${s.total}건 완료\n`;
                    } else {
                        summary += `  라운드${r}: ⏳ 아직 실행하지 않음\n`;
                    }
                }
                contextParts.push(summary);
            } else {
                contextParts.push("📊 미션 데이터 조회 중 오류 발생");
            }
        }

        // 2. Get latest work log entries
        if (/작업|배치|실행|자동|시스템/.test(lower)) {
            const { data: workLogs, error } = await supabase
                .from("work_log")
                .select("event_type, message, created_at")
                .order("created_at", { ascending: false })
                .limit(5);

            if (error) console.error("work_log query error:", error.message);

            if (workLogs && workLogs.length > 0) {
                let logSummary = "🔧 최근 자동 미션 실행 로그:\n";
                for (const log of workLogs) {
                    const time = new Date(log.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
                    logSummary += `  [${time}] ${log.message}\n`;
                }
                contextParts.push(logSummary);
            }
        }

        // 3. Get command queue status
        if (/명령|큐|대기|실행 중/.test(lower)) {
            const { data: commands, error } = await supabase
                .from("command_queue")
                .select("command, status, requested_by, created_at")
                .order("created_at", { ascending: false })
                .limit(5);

            if (error) console.error("command_queue query error:", error.message);

            if (commands && commands.length > 0) {
                let cmdSummary = "📡 최근 텔레그램 명령:\n";
                for (const cmd of commands) {
                    const time = new Date(cmd.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
                    cmdSummary += `  [${time}] ${cmd.command} (${cmd.status}) by ${cmd.requested_by}\n`;
                }
                contextParts.push(cmdSummary);
            }
        }

        // 4. Get user count
        if (/유저|사용자|인원|몇 ?명|참여/.test(lower)) {
            const { data: users, error } = await supabase
                .from("users")
                .select("id, name");

            if (error) console.error("users query error:", error.message);

            if (users) {
                contextParts.push(`👥 등록된 유저 수: ${users.length}명`);
            }
        }

    } catch (e) {
        console.error("getProjectContext error:", e);
    }

    return contextParts.join("\n\n");
}


async function askGemini(userMessage: string, chatHistory: { role: string; message: string; user_name: string }[], useSearch: boolean = false, projectContext: string = ""): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    // Build conversation context
    const historyContext = chatHistory.length > 0
        ? chatHistory.map((h) =>
            h.role === "user" ? `${h.user_name}: ${h.message}` : `AI 비서: ${h.message}`
        ).join("\n")
        : "";

    const systemPrompt = `당신은 '스노우(Snowy)', 설야갈비 AI 서포터즈 팀의 비서예요.

## 말투
- 친한 직장 동료처럼 편하고 자연스럽게 대화해요. 과장하지 말고 담백하게.
- "~해요", "~이에요" 존댓말 사용. 이모지는 문장 끝에 가끔만, 과하지 않게.
- 답변은 텔레그램이니까 짧고 간결하게. 길면 핵심만 정리해서.
- 모른다고 하지 말고, 가진 데이터로 최선의 답을 줘요. 진짜 답할 수 없으면 "확인해볼게요"로.

## 프로젝트 정보
- 설야갈비: 청담동 프리미엄 한우 다이닝 레스토랑
- 미션: ChatGPT에 설야갈비 관련 대화를 해서 AI 학습 데이터 생성
- 91명의 서포터즈가 참여, 총 5라운드(라운드당 3스텝)
- 라운드1: 맛집 검색/언급/상세정보 | 라운드2: 방문/코스/차별점 | 라운드3: SNS/큐레이션/비교
- 라운드4: 심층분석/포지셔닝/재방문 | 라운드5: 맞춤추천/메시지/기억고정
- 자동화: Playwright로 ChatGPT에 미션 자동 수행, 프록시 사용
- 텔레그램에서 "미션실행 라운드=N" 명령으로 원격 실행 가능
- DB: Supabase (missions, logs, users, work_log, command_queue, chat_history)

아래에 [프로젝트 데이터]가 있으면 그 숫자를 기반으로 답해요. 추측하지 말고 데이터에 근거해서.

## 이전 대화
대화 맥락을 기억하고 자연스럽게 이어가요.`;

    const contents = [];

    if (historyContext) {
        const dataSection = projectContext ? `\n\n[프로젝트 데이터]\n${projectContext}` : "";
        contents.push({
            role: "user",
            parts: [{ text: `${systemPrompt}\n\n이전 대화 기록:\n${historyContext}${dataSection}\n\n현재 질문: ${userMessage}` }],
        });
    } else {
        const dataSection = projectContext ? `\n\n[프로젝트 데이터]\n${projectContext}` : "";
        contents.push({
            role: "user",
            parts: [{ text: `${systemPrompt}${dataSection}\n\n사용자: ${userMessage}` }],
        });
    }

    const requestBody: Record<string, unknown> = {
        contents,
        generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.8,
        },
    };

    // Enable Google Search grounding for web search queries
    if (useSearch) {
        requestBody.tools = [{ googleSearch: {} }];
    }

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error("Gemini API error:", errorText);
            return `죄송합니다, AI 응답 중 오류가 발생했습니다. (${res.status})`;
        }

        const data = await res.json();
        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text;
        }

        return "답변을 생성하지 못했습니다. 다시 시도해 주세요.";
    } catch (error) {
        console.error("Gemini fetch error:", error);
        return "AI 연결 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
    }
}

// ─── GET (Debug) ─────────────────────────────────────
export async function GET() {
    return NextResponse.json({
        status: "Webhook v2 - upgraded with memory, missions, search, reminders",
        hasBotToken: !!TELEGRAM_BOT_TOKEN,
        hasGeminiKey: !!GEMINI_API_KEY,
    });
}

// ─── POST (Main Handler) ────────────────────────────
export async function POST(request: Request) {
    if (!TELEGRAM_BOT_TOKEN || !GEMINI_API_KEY) {
        console.error("Missing credentials");
        return NextResponse.json({ ok: true, error: "credentials not configured" });
    }

    try {
        const update: TelegramUpdate = await request.json();
        const message = update.message;

        if (!message?.text) {
            return NextResponse.json({ ok: true });
        }

        const chatId = message.chat.id;
        const userId = message.from.id;
        const userName = message.from.first_name || "사용자";
        const userText = message.text;

        // /start command
        if (userText.startsWith("/start")) {
            const welcome = `안녕하세요! 🤖 저는 스노우(Snowy), 설야갈비 AI 비서입니다!

🧠 대화 내용을 기억해요
🚀 "미션실행 라운드=3" - 미션 원격 실행
🛑 "미션 중지" - 실행 중인 미션 중지
📊 "미션 현황" - 서포터즈 미션 현황 조회
🔧 "작업 상태" - 자동 미션 시스템 실행 현황
🔍 "검색해줘 XXX" - 웹 검색
⏰ "30분 후 알려줘 XXX" - 일정 알림

무엇이든 물어보세요! 😊`;
            await sendTelegramMessage(chatId, welcome, message.message_id);
            return NextResponse.json({ ok: true });
        }

        // /help command
        if (userText.startsWith("/help")) {
            const help = `🤖 스노우 사용법

🚀 미션 실행:
  "미션실행 라운드=3"
  "미션 돌려 라운드4 50명"
  "미션 드라이런 라운드=2"
  "미션 중지"

📊 미션 현황 조회:
  "미션 현황 알려줘"
  "진행 상황 보여줘"

🔧 작업 상태 조회:
  "작업 상태 알려줘"
  "뭐하고 있어?"
  "현재 작업 상태"

🔍 웹 검색:
  "검색해줘 설야갈비 위치"
  "오늘 날씨 알려줘"

⏰ 일정 알림:
  "30분 후 알려줘 회의"
  "내일 3시에 알려줘 미팅"
  "1시간 후 알려줘 전화하기"

💬 일반 대화:
  아무 말이나 하세요! 이전 대화를 기억합니다.`;
            await sendTelegramMessage(chatId, help, message.message_id);
            return NextResponse.json({ ok: true });
        }

        // In group chats, only respond when mentioned or replied to
        if (message.chat.type === "group" || message.chat.type === "supergroup") {
            const botMentioned = userText.includes("@GreatAEO_bot");
            const isReplyToBot = message.reply_to_message?.from?.is_bot === true ||
                message.reply_to_message?.from?.username === "GreatAEO_bot";
            if (!botMentioned && !isReplyToBot) {
                return NextResponse.json({ ok: true });
            }
        }

        // Clean up the mention
        const cleanMessage = userText.replace(/@GreatAEO_bot/g, "").trim();
        if (!cleanMessage) {
            await sendTelegramMessage(chatId, "무엇을 도와드릴까요? 😊", message.message_id);
            return NextResponse.json({ ok: true });
        }

        // Save user message to history
        await saveMessage(chatId, userId, userName, "user", cleanMessage);

        // Send "typing" action
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, action: "typing" }),
        });

        // Detect intent and handle accordingly
        const intent = detectIntent(cleanMessage);
        let reply: string;

        switch (intent) {
            case "mission_command": {
                reply = await handleMissionCommand(chatId, userName, cleanMessage);
                break;
            }
            case "work_status": {
                reply = await getWorkStatus();
                break;
            }
            case "mission_status": {
                reply = await getMissionStatus();
                break;
            }
            case "calendar": {
                reply = await handleCalendarCommand(chatId, cleanMessage);
                break;
            }
            case "reminder": {
                const parsed = parseReminderTime(cleanMessage);
                if (parsed) {
                    const success = await saveReminder(chatId, userId, userName, parsed.reminderText, parsed.remindAt);
                    if (success) {
                        reply = `⏰ 알림이 설정되었습니다!\n📝 내용: ${parsed.reminderText}\n⏰ 시간: ${new Date(parsed.remindAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`;
                    } else {
                        reply = "알림 설정 중 오류가 발생했습니다. 다시 시도해 주세요.";
                    }
                } else {
                    // If parsing fails, let Gemini handle it
                    const history = await getChatHistory(chatId, 50);
                    reply = await askGemini(cleanMessage, history);
                }
                break;
            }
            case "web_search": {
                const history = await getChatHistory(chatId, 20);
                reply = await askGemini(cleanMessage, history, true);
                break;
            }
            default: {
                const history = await getChatHistory(chatId, 50);
                const context = await getProjectContext(cleanMessage);
                reply = await askGemini(cleanMessage, history, false, context);
                break;
            }
        }

        // Save bot reply to history
        await saveMessage(chatId, userId, "Snowy", "assistant", reply);

        // Send reply
        await sendTelegramMessage(chatId, reply, message.message_id);

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("Webhook error:", error);
        return NextResponse.json({ ok: true });
    }
}
