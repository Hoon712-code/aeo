import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const group = searchParams.get("group");
    const search = searchParams.get("search");

    const supabase = createServerClient();

    let query = supabase
        .from("users")
        .select("*")
        .order("name", { ascending: true });

    if (group && group !== "ALL") {
        query = query.eq("group", group);
    }

    if (search) {
        query = query.or(`name.ilike.%${search}%,display_name.ilike.%${search}%,label.ilike.%${search}%`);
    }

    const { data: users, error } = await query;

    if (error) {
        return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }

    // Add full_name to each user
    const enrichedUsers = (users || []).map((user) => ({
        ...user,
        full_name: user.label
            ? `${user.display_name || "테스터"}_${user.label}`
            : user.name,
    }));

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

        const { data: user, error } = await supabase
            .from("users")
            .update({
                display_name: displayName.trim(),
                name: `${displayName.trim()}_${(await supabase.from("users").select("label").eq("id", userId).single()).data?.label || ""}`,
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
