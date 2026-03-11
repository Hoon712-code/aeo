import { NextResponse } from "next/server";

// Helper endpoint to find the Telegram group chat ID
// After adding the bot to your group, call this endpoint to get the chat_id
export async function GET() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
    }

    const url = `https://api.telegram.org/bot${token}/getUpdates`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok) {
        return NextResponse.json({ error: "Telegram API error", details: data }, { status: 500 });
    }

    // Extract chat info from updates
    const chats = data.result
        ?.map((update: Record<string, Record<string, Record<string, unknown>>>) => update.message?.chat)
        .filter(Boolean)
        .map((chat: Record<string, unknown>) => ({
            id: chat.id,
            title: chat.title || chat.first_name,
            type: chat.type,
        }));

    // Remove duplicates
    const uniqueChats = Array.from(
        new Map(chats.map((c: Record<string, unknown>) => [c.id, c])).values()
    );

    return NextResponse.json({
        message: "아래에서 그룹 채팅의 chat_id를 찾아 TELEGRAM_CHAT_ID에 설정하세요.",
        chats: uniqueChats,
    });
}
