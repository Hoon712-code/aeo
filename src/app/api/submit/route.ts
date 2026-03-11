import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isGroupActiveToday, getTodayString } from "@/lib/rotation";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { userId, missionId, aiResponseSnippet, isLastStep } = body;

        if (!userId || !missionId) {
            return NextResponse.json(
                { error: "userId, missionId are required" },
                { status: 400 }
            );
        }

        // For the last step (step 3), require AI response snippet
        if (isLastStep && (!aiResponseSnippet || aiResponseSnippet.trim().length < 5)) {
            return NextResponse.json(
                { error: "AI 답변 내용을 붙여넣어 주세요. (최소 5자 이상)" },
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

        // Verify mission exists
        const { data: mission, error: missionError } = await supabase
            .from("missions")
            .select("*")
            .eq("id", missionId)
            .single();

        if (missionError || !mission) {
            return NextResponse.json({ error: "Mission not found" }, { status: 404 });
        }

        // Check if already completed this mission
        const { data: existingLog } = await supabase
            .from("logs")
            .select("*")
            .eq("user_id", userId)
            .eq("mission_id", missionId)
            .single();

        if (existingLog) {
            return NextResponse.json(
                { error: "이 미션은 이미 완료되었습니다." },
                { status: 409 }
            );
        }

        // Check previous steps in same round are completed
        if (mission.step > 1) {
            const { data: prevMissions } = await supabase
                .from("missions")
                .select("id")
                .eq("round", mission.round)
                .lt("step", mission.step);

            if (prevMissions) {
                for (const prev of prevMissions) {
                    const { data: prevLog } = await supabase
                        .from("logs")
                        .select("id")
                        .eq("user_id", userId)
                        .eq("mission_id", prev.id)
                        .single();

                    if (!prevLog) {
                        return NextResponse.json(
                            { error: "이전 단계를 먼저 완료해 주세요." },
                            { status: 403 }
                        );
                    }
                }
            }
        }

        // Insert log
        const { data: log, error: logError } = await supabase
            .from("logs")
            .insert({
                user_id: userId,
                mission_id: missionId,
                ai_response_snippet: isLastStep ? aiResponseSnippet?.trim() : null,
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

        const isRoundComplete = mission.step === 3;
        const message = isRoundComplete
            ? `${mission.round}라운드를 완료했습니다! 🎉`
            : `${mission.step}/3 단계 완료! 다음 단계로 진행하세요.`;

        return NextResponse.json({
            success: true,
            message,
            isRoundComplete,
            log,
        });
    } catch {
        return NextResponse.json(
            { error: "서버 오류가 발생했습니다." },
            { status: 500 }
        );
    }
}
