import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const MESSAGE = `🥩 설야갈비 AI 서포터즈 미션 알림! 오늘의 미션을 잊지 마세요! 👉 https://aeo-vbqj.vercel.app/`;

export async function GET(request: Request) {
    // Verify cron secret (Vercel sends this header)
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        return NextResponse.json(
            { error: "Telegram credentials not configured" },
            { status: 500 }
        );
    }

    try {
        // 1. Send daily mission reminder
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: MESSAGE,
            }),
        });

        // 2. Check and send pending reminders
        const supabase = createServerClient();
        const now = new Date().toISOString();

        const { data: pendingReminders } = await supabase
            .from("reminders")
            .select("*")
            .eq("is_sent", false)
            .lte("remind_at", now);

        let remindersSent = 0;

        if (pendingReminders && pendingReminders.length > 0) {
            for (const reminder of pendingReminders) {
                const reminderMsg = `⏰ 알림!\n📝 ${reminder.reminder_text}\n👤 설정자: ${reminder.user_name}`;

                await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        chat_id: reminder.chat_id,
                        text: reminderMsg,
                    }),
                });

                // Mark as sent
                await supabase
                    .from("reminders")
                    .update({ is_sent: true })
                    .eq("id", reminder.id);

                remindersSent++;
            }
        }

        return NextResponse.json({
            success: true,
            message: "Daily notification sent!",
            remindersSent,
        });
    } catch (error) {
        console.error("Cron error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
