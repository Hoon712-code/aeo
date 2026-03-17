/**
 * 📅 Calendar Notification Cron Job
 *
 * 아침 8시 (KST): 오늘의 일정 알림
 * 밤 11시 (KST): 내일 일정 + 미완료 일과 확인
 *
 * Vercel Cron으로 호출됨
 */

import { NextResponse } from "next/server";
import { getEventsForDate, formatEventList, CalendarEvent } from "@/lib/calendar";
import { createServerClient } from "@/lib/supabase/server";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = -830017199; // Calm 그룹방
const CRON_SECRET = process.env.CRON_SECRET;

async function sendTelegram(text: string) {
    if (!TELEGRAM_BOT_TOKEN) return;
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    });
}

function getKSTDate(offsetDays = 0): string {
    const now = new Date();
    now.setHours(now.getHours() + 9); // UTC → KST
    now.setDate(now.getDate() + offsetDays);
    return now.toISOString().split("T")[0];
}

function getKSTHour(): number {
    const now = new Date();
    now.setHours(now.getHours() + 9);
    return now.getHours();
}

export async function GET(request: Request) {
    // Verify cron secret
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");
    if (secret !== CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const hour = getKSTHour();
        const today = getKSTDate();
        const tomorrow = getKSTDate(1);

        if (hour >= 7 && hour <= 9) {
            // ☀️ 아침 알림: 오늘의 일정
            const events = await getEventsForDate(today);
            const dateStr = new Date(today).toLocaleDateString("ko-KR", {
                month: "long",
                day: "numeric",
                weekday: "long",
            });

            let message = `☀️ 좋은 아침이에요! ${dateStr}\n\n`;
            message += formatEventList(events, "오늘");
            message += "\n\n오늘도 화이팅! 💪✨";

            await sendTelegram(message);

            // Save today's events to calendar_tasks for tracking
            const supabase = createServerClient();
            for (let i = 0; i < events.length; i++) {
                const evt = events[i];
                // Upsert: only create if not exists for today
                await supabase
                    .from("calendar_tasks")
                    .upsert({
                        event_uid: evt.uid,
                        title: evt.title,
                        date: today,
                        event_number: i + 1,
                        is_completed: false,
                    }, { onConflict: "event_uid,date" });
            }

        } else if (hour >= 22 && hour <= 23) {
            // 🌙 밤 알림: 미완료 일과 + 내일 일정
            const supabase = createServerClient();

            // Check incomplete tasks for today
            const { data: incompleteTasks } = await supabase
                .from("calendar_tasks")
                .select("*")
                .eq("date", today)
                .eq("is_completed", false);

            // Get tomorrow's events
            const tomorrowEvents = await getEventsForDate(tomorrow);
            const tomorrowDateStr = new Date(tomorrow).toLocaleDateString("ko-KR", {
                month: "long",
                day: "numeric",
                weekday: "long",
            });

            let message = `🌙 수고했어요! 오늘 하루 정리\n\n`;

            // Incomplete tasks
            if (incompleteTasks && incompleteTasks.length > 0) {
                message += `⚠️ 오늘 미완료 일정 (${incompleteTasks.length}건)\n`;
                message += "━━━━━━━━━━━━━━━━━━━━\n";
                incompleteTasks.forEach((task, idx) => {
                    message += `${idx + 1}️⃣ ${task.title}\n`;
                });
                message += "\n내일로 옮길까요? 번호를 알려주세요!\n";
                message += '예: "1번 내일로 옮겨줘"\n\n';
            } else {
                message += "✅ 오늘 일정을 모두 완료했어요! 대단해요! 🎉\n\n";
            }

            // Tomorrow's schedule
            message += `📅 내일 (${tomorrowDateStr}) 일정\n`;
            message += formatEventList(tomorrowEvents, "내일");
            message += "\n\n편안한 밤 보내세요! 🌜💤";

            await sendTelegram(message);
        }

        return NextResponse.json({ ok: true, hour, today });
    } catch (error) {
        console.error("Calendar notify error:", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
