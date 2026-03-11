import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isGroupActiveToday, getNextActiveDay, getTodayString } from "@/lib/rotation";

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

    // Check if group is active today
    const isActive = isGroupActiveToday(user.group);
    const nextActiveDay = isActive ? "" : getNextActiveDay(user.group);

    // Get completed missions count
    const { count: completedCount } = await supabase
        .from("logs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);

    // Get total missions
    const { count: totalMissions } = await supabase
        .from("missions")
        .select("*", { count: "exact", head: true });

    // Check if already completed today
    const today = getTodayString();
    const { data: todayLogs } = await supabase
        .from("logs")
        .select("*")
        .eq("user_id", userId)
        .gte("completed_at", `${today}T00:00:00`)
        .lte("completed_at", `${today}T23:59:59`);

    const hasCompletedToday = (todayLogs && todayLogs.length > 0) || false;

    // Get next mission (based on completed count)
    let mission = null;
    if (isActive && !hasCompletedToday) {
        const { data: allMissions } = await supabase
            .from("missions")
            .select("*")
            .order("week", { ascending: true })
            .order("step", { ascending: true });

        if (allMissions && (completedCount ?? 0) < allMissions.length) {
            mission = allMissions[completedCount ?? 0];
        }
    }

    return NextResponse.json({
        user,
        isActive,
        nextActiveDay,
        mission,
        hasCompletedToday,
        completedCount: completedCount ?? 0,
        totalMissions: totalMissions ?? 0,
    });
}
