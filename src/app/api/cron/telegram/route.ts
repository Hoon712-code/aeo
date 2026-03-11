import { NextResponse } from "next/server";

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
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: MESSAGE,
                parse_mode: "HTML",
            }),
        });

        const data = await res.json();

        if (!data.ok) {
            console.error("Telegram API error:", data);
            return NextResponse.json(
                { error: "Failed to send message", details: data },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Telegram notification sent!",
        });
    } catch (error) {
        console.error("Telegram send error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
