import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getTodayString, getNextRoundAvailableDate, formatDateKR, getRoundName, isGroupActiveToday, getNextActiveDay } from "@/lib/rotation";
import { generatePrompt, labelToIndex } from "@/lib/prompt-generator";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
        return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const supabase = createServerClient();

    // Get user info
    const { data: user, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

    if (userError || !user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get all missions (ordered by round, step)
    const { data: allMissions } = await supabase
        .from("missions")
        .select("*")
        .order("round", { ascending: true })
        .order("step", { ascending: true });

    if (!allMissions || allMissions.length === 0) {
        return NextResponse.json({ error: "No missions found" }, { status: 500 });
    }

    // Get user's completed logs
    const { data: userLogs } = await supabase
        .from("logs")
        .select("*")
        .eq("user_id", userId)
        .order("completed_at", { ascending: true });

    const completedMissionIds = new Set((userLogs || []).map((l) => l.mission_id));
    const totalSteps = allMissions.length; // 15

    // Determine completed rounds + steps
    let completedSteps = completedMissionIds.size;
    let completedRounds = 0;
    const roundCompletionDates: Record<number, string> = {};

    for (let r = 1; r <= 5; r++) {
        const roundMissions = allMissions.filter((m) => m.round === r);
        const allDone = roundMissions.every((m) => completedMissionIds.has(m.id));
        if (allDone) {
            completedRounds = r;
            // Find when the last step of this round was completed
            const step3Mission = roundMissions.find((m) => m.step === 3);
            if (step3Mission) {
                const log = (userLogs || []).find((l) => l.mission_id === step3Mission.id);
                if (log) roundCompletionDates[r] = log.completed_at;
            }
        }
    }

    // All complete?
    if (completedRounds >= 5) {
        return NextResponse.json({
            user,
            currentRound: 5,
            currentStep: 3,
            mission: null,
            personalizedPrompt: "",
            roundAvailableDate: null,
            isAvailable: false,
            waitMessage: "",
            completedRounds: 5,
            completedSteps: 15,
            totalSteps: 15,
            allComplete: true,
        });
    }

    // Current round = completedRounds + 1
    const currentRound = completedRounds + 1;

    // Check round availability based on timing
    let isAvailable = true;
    let waitMessage = "";
    let roundAvailableDate: string | null = null;

    if (currentRound === 1) {
        // Round 1: available on group's start day or any day after
        if (!isGroupActiveToday(user.group) && completedSteps === 0) {
            // Haven't started yet and not their start day
            isAvailable = false;
            waitMessage = `1라운드는 ${getNextActiveDay(user.group)}에 시작됩니다.`;
        }
    } else {
        // Rounds 2-5: check gap from previous round completion
        const prevCompletedAt = roundCompletionDates[currentRound - 1];
        if (prevCompletedAt) {
            const availDate = getNextRoundAvailableDate(currentRound - 1, prevCompletedAt);
            const now = new Date();
            now.setHours(0, 0, 0, 0);

            if (now < availDate) {
                isAvailable = false;
                roundAvailableDate = availDate.toISOString();
                waitMessage = `${getRoundName(currentRound)}는 ${formatDateKR(availDate)}부터 시작할 수 있습니다.`;
            }
        }
    }

    // Find current step within current round
    const roundMissions = allMissions.filter((m) => m.round === currentRound);
    let currentStep = 1;
    for (const m of roundMissions) {
        if (completedMissionIds.has(m.id)) {
            currentStep = m.step + 1;
        }
    }
    if (currentStep > 3) currentStep = 3;

    // Get the current mission
    const currentMission = roundMissions.find((m) => m.step === currentStep) || null;

    // Generate personalized prompt
    const userIndex = labelToIndex(user.label || "A_01");
    const personalizedPrompt = currentMission
        ? generatePrompt(currentMission.round, currentMission.step, userIndex, currentMission.prompt_template)
        : "";

    // Check if today's steps are already done (for showing "already done today" state)
    const today = getTodayString();
    const todayLogs = (userLogs || []).filter((l) => {
        const logDate = new Date(l.completed_at).toISOString().split("T")[0];
        return logDate === today;
    });

    return NextResponse.json({
        user,
        currentRound,
        currentStep,
        mission: currentMission,
        personalizedPrompt,
        roundAvailableDate,
        isAvailable,
        waitMessage,
        completedRounds,
        completedSteps,
        totalSteps,
        allComplete: false,
        todayCompletedSteps: todayLogs.length,
        roundMissions: roundMissions.map((m) => ({
            ...m,
            completed: completedMissionIds.has(m.id),
            personalizedPrompt: generatePrompt(m.round, m.step, userIndex, m.prompt_template),
        })),
    });
}
