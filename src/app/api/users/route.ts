import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    const supabase = createServerClient();

    let usersQuery = supabase.from("users").select("*").order("name");

    if (query && query.trim().length > 0) {
        usersQuery = usersQuery.ilike("name", `%${query.trim()}%`);
    }

    const { data: users, error } = await usersQuery.limit(20);

    if (error) {
        return NextResponse.json({ error: "Failed to search users" }, { status: 500 });
    }

    return NextResponse.json({ users: users || [] });
}
