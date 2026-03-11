import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getTodayString, isGroupActiveToday } from "@/lib/rotation";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { userId, missionId, aiResponseSnippet } = body;

        if (!userId || !missionId || !aiResponseSnippet) {
            return NextResponse.json(
                { error: "userId, missionId, aiResponseSnippet are all required" },
                { status: 400 }
            );
        }

        if (aiResponseSnippet.trim().length < 5) {
            return NextResponse.json(
                { error: "AI 답변 내용이 너무 짧습니다. 최소 5자 이상 입력해 주세요." },
                { status: 400 }
            );
        }

        const supabase = createServerClient();

        // Verify user exists
        const { data: user, error: userError } = await supabase
            .from("users")
            .select("*")
            .eq("id", userId)
            .single();

        if (userError || !user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Check if group is active today
        if (!isGroupActiveToday(user.group)) {
            return NextResponse.json(
                { error: "오늘은 활동일이 아닙니다." },
                { status: 403 }
            );
        }

        // Abuse prevention: check if already completed today
        const today = getTodayString();
        const { data: todayLogs } = await supabase
            .from("logs")
            .select("*")
            .eq("user_id", userId)
            .gte("completed_at", `${today}T00:00:00`)
            .lte("completed_at", `${today}T23:59:59`);

        if (todayLogs && todayLogs.length > 0) {
            return NextResponse.json(
                { error: "오늘 이미 미션을 완료했습니다. 내일 다시 시도해 주세요." },
                { status: 429 }
            );
        }

        // Insert log
        const { data: log, error: logError } = await supabase
            .from("logs")
            .insert({
                user_id: userId,
                mission_id: missionId,
                ai_response_snippet: aiResponseSnippet.trim(),
            })
            .select()
            .single();

        if (logError) {
            if (logError.code === "23505") {
                return NextResponse.json(
                    { error: "이 미션은 이미 완료되었습니다." },
                    { status: 409 }
                );
            }
            return NextResponse.json(
                { error: "제출 중 오류가 발생했습니다." },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "미션이 성공적으로 완료되었습니다! 🎉",
            log,
        });
    } catch {
        return NextResponse.json(
            { error: "서버 오류가 발생했습니다." },
            { status: 500 }
        );
    }
}
