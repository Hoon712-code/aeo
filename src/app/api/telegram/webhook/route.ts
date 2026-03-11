import { NextResponse } from "next/server";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

interface TelegramMessage {
    message_id: number;
    from: { id: number; first_name: string };
    chat: { id: number; type: string };
    text?: string;
}

interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
}

async function sendTelegramMessage(chatId: number, text: string, replyToMessageId?: number) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            reply_to_message_id: replyToMessageId,
        }),
    });
}

async function askGemini(userMessage: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: `당신은 친절하고 유능한 AI 비서입니다. 한국어로 답변해 주세요. 답변은 간결하고 핵심적으로 해주세요. 텔레그램 메신저에서 대화하고 있으므로 너무 길지 않게 답변해 주세요.\n\n사용자: ${userMessage}`,
                            },
                        ],
                    },
                ],
                generationConfig: {
                    maxOutputTokens: 1024,
                    temperature: 0.7,
                },
            }),
        });

        console.log("Gemini API response status:", res.status);

        if (!res.ok) {
            const errorText = await res.text();
            console.error("Gemini API error response:", errorText);
            return `API 오류 (${res.status}): ${errorText.substring(0, 200)}`;
        }

        const data = await res.json();
        console.log("Gemini API response data:", JSON.stringify(data).substring(0, 500));

        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text;
        }

        return "답변을 생성하지 못했습니다. 응답 형식: " + JSON.stringify(data).substring(0, 200);
    } catch (error) {
        console.error("Gemini fetch error:", error);
        return "API 연결 오류: " + String(error).substring(0, 200);
    }
}

// GET handler for debugging
export async function GET() {
    return NextResponse.json({
        status: "Webhook endpoint is active",
        hasBotToken: !!TELEGRAM_BOT_TOKEN,
        hasGeminiKey: !!GEMINI_API_KEY,
        botTokenPrefix: TELEGRAM_BOT_TOKEN ? TELEGRAM_BOT_TOKEN.substring(0, 5) + "..." : "MISSING",
        geminiKeyPrefix: GEMINI_API_KEY ? GEMINI_API_KEY.substring(0, 5) + "..." : "MISSING",
    });
}

export async function POST(request: Request) {
    // Log env var status for debugging
    console.log("Webhook called. Bot token exists:", !!TELEGRAM_BOT_TOKEN, "Gemini key exists:", !!GEMINI_API_KEY);

    if (!TELEGRAM_BOT_TOKEN || !GEMINI_API_KEY) {
        console.error("Missing credentials - BOT_TOKEN:", !!TELEGRAM_BOT_TOKEN, "GEMINI_KEY:", !!GEMINI_API_KEY);
        // Return 200 to prevent Telegram from retrying
        return NextResponse.json({ ok: true, error: "credentials not configured" });
    }

    try {
        const update: TelegramUpdate = await request.json();
        const message = update.message;

        if (!message?.text) {
            return NextResponse.json({ ok: true });
        }

        const chatId = message.chat.id;
        const userText = message.text;
        console.log("Received message from chat:", chatId, "text:", userText);

        // Ignore commands like /start
        if (userText.startsWith("/start")) {
            await sendTelegramMessage(
                chatId,
                "안녕하세요! 🤖 저는 설야갈비 AI 비서입니다.\n무엇이든 물어보세요!",
                message.message_id
            );
            return NextResponse.json({ ok: true });
        }

        // In group chats, only respond when mentioned
        if (message.chat.type === "group" || message.chat.type === "supergroup") {
            const botMentioned = userText.includes("@GreatAEO_bot");
            if (!botMentioned) {
                return NextResponse.json({ ok: true });
            }
        }

        // Clean up the mention from the message
        const cleanMessage = userText.replace(/@GreatAEO_bot/g, "").trim();

        if (!cleanMessage) {
            await sendTelegramMessage(chatId, "무엇을 도와드릴까요? 😊", message.message_id);
            return NextResponse.json({ ok: true });
        }

        // Send "typing" action
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, action: "typing" }),
        });

        // Ask Gemini
        const reply = await askGemini(cleanMessage);
        await sendTelegramMessage(chatId, reply, message.message_id);

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("Webhook error:", error);
        return NextResponse.json({ ok: true }); // Always return 200 to Telegram
    }
}
