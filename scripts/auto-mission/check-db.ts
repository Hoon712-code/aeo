import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
  // Users
  const { data: users } = await sb.from("users").select("id,name,group");
  console.log("=== USERS ===");
  console.log("Total:", users?.length);
  const groups: Record<string, number> = {};
  users?.forEach((u) => {
    groups[u.group] = (groups[u.group] || 0) + 1;
  });
  console.log("By group:", JSON.stringify(groups));

  // Missions
  const { data: missions } = await sb
    .from("missions")
    .select("*")
    .order("round")
    .order("step");
  console.log("\n=== MISSIONS ===");
  console.log("Total:", missions?.length);
  missions?.forEach((m) =>
    console.log(
      `  R${m.round}S${m.step} [${m.target_ai}] - ${m.prompt_template?.substring(0, 60)}`
    )
  );

  // Logs
  const { data: logs } = await sb.from("logs").select("id,user_id,mission_id");
  console.log("\n=== COMPLETED LOGS ===");
  console.log("Total:", logs?.length);
}

main();
