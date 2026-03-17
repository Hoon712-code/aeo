import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ─── Types ───────────────────────────────────────────
interface TelegramMessage {
    message_id: number;
    from: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string; title?: string };
    text?: string;
    date: number;
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
            message: text.substring(0, 2000), // limit storage
            created_at: new Date().toISOString(),
        });
    } catch (e) {
        console.error("Failed to save message:", e);
    }
}

async function getChatHistory(chatId: number, limit: number = 10): Promise<{ role: string; message: string; user_name: string }[]> {
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
    command: "run" | "dryrun" | "stop";
    args: { round?: number; maxUsers?: number; concurrency?: number };
}

function parseMissionCommand(text: string): MissionCommand | null {
    const lower = text.toLowerCase().replace(/\s+/g, " ").trim();

    // Stop command
    if (/미션\s*(중지|중단|스탑|멈춰|꺼)/.test(lower)) {
        return { command: "stop", args: {} };
    }

    // Run or dry-run command
    const isDryRun = /드라이런|dry[\s-]?run|시뮬|테스트\s*실행/.test(lower);
    const isRun = isDryRun || /미션\s*(실행|돌려|돌리|시작|런|run)|미션을?\s*(돌려|실행)/.test(lower);

    if (!isRun) return null;

    const args: MissionCommand["args"] = {};

    // Extract round number: "라운드=3", "라운드3", "round3", "round=3", "라운드 3"
    const roundMatch = lower.match(/(?:라운드|round)[\s=]*(\d+)/)
        || lower.match(/(?:라운드|round)\s*(\d+)/)
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
type Intent = "mission_command" | "mission_status" | "work_status" | "reminder" | "web_search" | "general";

function detectIntent(text: string): Intent {
    const lower = text.toLowerCase();

    // Mission command keywords (미션 실행/중지 명령)
    if (/미션\s*(실행|돌려|돌리|시작|런|run|중지|중단|스탑|멈춰|꺼)/.test(lower) ||
        /미션을?\s*(돌려|실행)/.test(lower) ||
        /드라이런|dry[\s-]?run/.test(lower) ||
        /미션\s*테스트\s*실행/.test(lower)) {
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

    // Reminder keywords
    if (/알려줘|리마인더|알림\s*(설정|등록)/.test(lower) &&
        /(\d+\s*(분|시간)|내일|오늘)/.test(lower)) {
        return "reminder";
    }

    // Web search keywords
    if (/검색|찾아줘|찾아봐|알아봐|최신|뉴스|오늘\s*(날씨|기온)|현재\s*(시간|날짜)/.test(lower)) {
        return "web_search";
    }

    return "general";
}

async function askGemini(userMessage: string, chatHistory: { role: string; message: string; user_name: string }[], useSearch: boolean = false): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    // Build conversation context
    const historyContext = chatHistory.length > 0
        ? chatHistory.map((h) =>
            h.role === "user" ? `${h.user_name}: ${h.message}` : `AI 비서: ${h.message}`
        ).join("\n")
        : "";

    const systemPrompt = `당신은 '스노우(Snowy)'라는 이름의 친절하고 유능한 AI 비서입니다.
- 설야갈비 AI 서포터즈 그룹의 비서 역할을 합니다.
- 한국어로 답변하며, 텔레그램에서 대화하므로 간결하게 답변합니다.
- 이모지를 적절히 사용하여 친근한 분위기를 만듭니다.
- 이전 대화 맥락을 기억하고 참고하여 답변합니다.
- 모르는 것은 솔직하게 모른다고 합니다.`;

    const contents = [];

    if (historyContext) {
        contents.push({
            role: "user",
            parts: [{ text: `${systemPrompt}\n\n이전 대화 기록:\n${historyContext}\n\n현재 질문: ${userMessage}` }],
        });
    } else {
        contents.push({
            role: "user",
            parts: [{ text: `${systemPrompt}\n\n사용자: ${userMessage}` }],
        });
    }

    const requestBody: Record<string, unknown> = {
        contents,
        generationConfig: {
            maxOutputTokens: 1024,
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

        // In group chats, only respond when mentioned
        if (message.chat.type === "group" || message.chat.type === "supergroup") {
            const botMentioned = userText.includes("@GreatAEO_bot");
            if (!botMentioned) {
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
                    const history = await getChatHistory(chatId, 10);
                    reply = await askGemini(cleanMessage, history);
                }
                break;
            }
            case "web_search": {
                const history = await getChatHistory(chatId, 5);
                reply = await askGemini(cleanMessage, history, true);
                break;
            }
            default: {
                const history = await getChatHistory(chatId, 10);
                reply = await askGemini(cleanMessage, history);
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
