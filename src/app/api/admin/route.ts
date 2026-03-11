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

    // Get total missions
    const { count: totalMissions } = await supabase
        .from("missions")
        .select("*", { count: "exact", head: true });

    // Get all missions for week/step mapping
    const { data: missions } = await supabase
        .from("missions")
        .select("*")
        .order("week", { ascending: true })
        .order("step", { ascending: true });

    // Enrich user data
    const enrichedUsers = (users || []).map((user) => {
        const userLogs = (allLogs || []).filter((log) => log.user_id === user.id);
        const completedCount = userLogs.length;

        // Determine current week/step
        let currentWeek = 1;
        let currentStep = 1;
        if (missions && completedCount < missions.length) {
            const nextMission = missions[completedCount];
            currentWeek = nextMission.week;
            currentStep = nextMission.step;
        } else if (missions && completedCount >= missions.length) {
            currentWeek = 4;
            currentStep = 1;
        }

        // Check if completed today
        const completedToday = userLogs.some((log) => {
            const logDate = new Date(log.completed_at).toISOString().split("T")[0];
            return logDate === today;
        });

        return {
            ...user,
            completed_count: completedCount,
            current_week: currentWeek,
            current_step: currentStep,
            completed_today: completedToday,
            total_missions: totalMissions ?? 0,
        };
    });

    // Get recent logs with user names and mission info
    const recentLogs = (allLogs || []).slice(0, 50).map((log) => {
        const user = (users || []).find((u) => u.id === log.user_id);
        const mission = (missions || []).find((m) => m.id === log.mission_id);
        return {
            ...log,
            user_name: user?.name || "Unknown",
            mission_week: mission?.week || 0,
            mission_step: mission?.step || 0,
        };
    });

    return NextResponse.json({
        users: enrichedUsers,
        recentLogs,
    });
}
