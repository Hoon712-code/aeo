import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

async function cleanup() {
  // Check current queue
  const { data } = await supabase.from("command_queue").select("*").order("created_at", { ascending: false }).limit(5);
  console.log("Current queue:", data?.map(d => `${d.id}: ${d.command} (${d.status})`));
  
  // Clear stuck commands
  const { error } = await supabase.from("command_queue").delete().in("status", ["pending", "running"]);
  console.log(error ? `Error: ${error.message}` : "✅ Cleared pending/running commands");
}
cleanup();
