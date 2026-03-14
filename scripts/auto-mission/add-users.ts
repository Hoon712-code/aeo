import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
  // First, add INSERT policy for users table via RPC
  // We'll use the REST API to run raw SQL
  const { error: policyErr } = await sb.rpc("exec_sql", {
    sql: `CREATE POLICY "Allow insert users" ON users FOR INSERT WITH CHECK (true);`
  });
  
  if (policyErr) {
    console.log("⚠️ Policy creation via RPC failed (expected if no exec_sql function):", policyErr.message);
    console.log("\n📋 대안: Supabase 대시보드에서 직접 SQL 실행이 필요합니다.");
    console.log("----");
    console.log("아래 SQL을 Supabase SQL Editor에서 실행해주세요:\n");
    console.log(`-- 1. INSERT 정책 추가
CREATE POLICY "Allow insert users" ON users FOR INSERT WITH CHECK (true);

-- 2. 나머지 80명 유저 추가
INSERT INTO users (name, "group", label) VALUES`);

    const groups = ["B", "C", "D", "E"];
    const rows: string[] = [];
    for (const group of groups) {
      for (let i = 1; i <= 20; i++) {
        const name = `테스터_${group}_${String(i).padStart(2, "0")}`;
        const label = `${group}_${String(i).padStart(2, "0")}`;
        rows.push(`('${name}', '${group}', '${label}')`);
      }
    }
    console.log(rows.join(",\n") + ";");
    console.log("\n----");
  }
}

main();
