import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// Mask the middle character(s) of a Korean name: 홍정의 → 홍*의
function maskName(name: string): string {
    if (!name || name.length <= 1) return name;
    if (name.length === 2) return name[0] + "*";
    // For 3+ chars, mask all middle characters
    return name[0] + "*".repeat(name.length - 2) + name[name.length - 1];
}

// Extract numeric part from label for sorting: "A_01" → 1, "A_12" → 12
function labelToSortKey(label: string): number {
    const match = label?.match(/(\d+)$/);
    return match ? parseInt(match[1], 10) : 999;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    const supabase = createServerClient();

    let query = supabase
        .from("users")
        .select("*");

    if (search) {
        query = query.or(`name.ilike.%${search}%,display_name.ilike.%${search}%,label.ilike.%${search}%`);
    }

    const { data: users, error } = await query;

    if (error) {
        return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }

    // Get all missions for progress calculation
    const { data: missions } = await supabase
        .from("missions")
        .select("id, round, step")
        .order("round", { ascending: true })
        .order("step", { ascending: true });

    // Get all logs
    const { data: allLogs } = await supabase
        .from("logs")
        .select("user_id, mission_id");

    // Enrich users with masked names, progress, and sort by label number
    const enrichedUsers = (users || [])
        .map((user) => {
            const displayName = user.display_name || "테스터";
            const label = user.label || "";
            const maskedName = displayName === "테스터" ? displayName : maskName(displayName);

            // Calculate completed rounds
            const userLogs = (allLogs || []).filter((l) => l.user_id === user.id);
            const completedMissionIds = new Set(userLogs.map((l) => l.mission_id));
            let completedRounds = 0;
            if (missions) {
                for (let r = 1; r <= 5; r++) {
                    const roundMissions = missions.filter((m) => m.round === r);
                    const allDone = roundMissions.every((m) => completedMissionIds.has(m.id));
                    if (allDone) completedRounds = r;
                    else break;
                }
            }

            return {
                ...user,
                display_name: displayName,
                masked_name: maskedName,
                label,
                full_name: label ? `${maskedName}_${label}` : user.name,
                completed_rounds: completedRounds,
                sort_key: labelToSortKey(label),
            };
        })
        .sort((a, b) => (a.label || "").localeCompare(b.label || ""));

    return NextResponse.json({ users: enrichedUsers });
}

// PATCH: Update user display_name
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { userId, displayName } = body;

        if (!userId || !displayName) {
            return NextResponse.json(
                { error: "userId와 displayName이 필요합니다." },
                { status: 400 }
            );
        }

        if (displayName.trim().length < 1 || displayName.trim().length > 20) {
            return NextResponse.json(
                { error: "이름은 1~20자 사이여야 합니다." },
                { status: 400 }
            );
        }

        const supabase = createServerClient();

        // Get user's label first
        const { data: existingUser } = await supabase
            .from("users")
            .select("label")
            .eq("id", userId)
            .single();

        const label = existingUser?.label || "";

        const { data: user, error } = await supabase
            .from("users")
            .update({
                display_name: displayName.trim(),
                name: label ? `${displayName.trim()}_${label}` : displayName.trim(),
            })
            .eq("id", userId)
            .select()
            .single();

        if (error) {
            return NextResponse.json(
                { error: "이름 변경에 실패했습니다." },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            user,
            message: "이름이 변경되었습니다. ✅",
        });
    } catch {
        return NextResponse.json(
            { error: "서버 오류가 발생했습니다." },
            { status: 500 }
        );
    }
}
