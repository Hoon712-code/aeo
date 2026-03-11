import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getTodayString } from "@/lib/rotation";

export async function GET() {
    const supabase = createServerClient();
    const today = getTodayString();

    // Get all users
    const { data: users, error: usersError } = await supabase
        .from("users")
        .select("*")
        .order("group", { ascending: true })
        .order("name", { ascending: true });

    if (usersError) {
        return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }

    // Get all logs
    const { data: allLogs } = await supabase
        .from("logs")
        .select("*")
        .order("completed_at", { ascending: false });

    // Get total missions count
    const { count: totalMissions } = await supabase
        .from("missions")
        .select("*", { count: "exact", head: true });

    // Get all missions for round/step mapping
    const { data: missions } = await supabase
        .from("missions")
        .select("*")
        .order("round", { ascending: true })
        .order("step", { ascending: true });

    // Enrich user data
    const enrichedUsers = (users || []).map((user) => {
        const userLogs = (allLogs || []).filter((log) => log.user_id === user.id);
        const completedSteps = userLogs.length;

        // Determine completed rounds
        let completedRounds = 0;
        if (missions) {
            for (let r = 1; r <= 5; r++) {
                const roundMissions = missions.filter((m) => m.round === r);
                const allDone = roundMissions.every((m) =>
                    userLogs.some((l) => l.mission_id === m.id)
                );
                if (allDone) completedRounds = r;
                else break;
            }
        }

        // Current round/step
        const currentRound = Math.min(completedRounds + 1, 5);
        let currentStep = 1;
        if (missions) {
            const roundMissions = missions.filter((m) => m.round === currentRound);
            for (const m of roundMissions) {
                if (userLogs.some((l) => l.mission_id === m.id)) {
                    currentStep = m.step + 1;
                }
            }
            if (currentStep > 3) currentStep = 3;
        }

        // Check if completed today
        const completedToday = userLogs.some((log) => {
            const logDate = new Date(log.completed_at).toISOString().split("T")[0];
            return logDate === today;
        });

        const displayName = user.display_name || "테스터";
        const label = user.label || "";

        return {
            ...user,
            display_name: displayName,
            label,
            full_name: label ? `${displayName}_${label}` : user.name,
            completed_rounds: completedRounds,
            completed_steps: completedSteps,
            current_round: currentRound,
            current_step: currentStep,
            total_steps: totalMissions ?? 15,
            completed_today: completedToday,
        };
    });

    // Get recent logs with user names and mission info
    const recentLogs = (allLogs || []).slice(0, 50).map((log) => {
        const user = (users || []).find((u) => u.id === log.user_id);
        const mission = (missions || []).find((m) => m.id === log.mission_id);
        const displayName = user?.display_name || "테스터";
        const label = user?.label || "";
        return {
            ...log,
            user_name: label ? `${displayName}_${label}` : (user?.name || "Unknown"),
            mission_round: mission?.round || 0,
            mission_step: mission?.step || 0,
        };
    });

    return NextResponse.json({
        users: enrichedUsers,
        recentLogs,
    });
}
