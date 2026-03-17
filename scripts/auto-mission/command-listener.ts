#!/usr/bin/env tsx
/**
 * 📡 Command Listener — 텔레그램 명령 큐 폴링 데몬
 *
 * 10초마다 Supabase의 command_queue 테이블에서 pending 명령을 확인하고,
 * 해당 명령에 맞는 미션 스크립트를 child_process로 실행합니다.
 *
 * Usage:
 *   npm run mission:listen
 */

import "./config"; // Load env first
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";
import { spawn } from "child_process";
import path from "path";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const POLL_INTERVAL_MS = 10_000; // 10 seconds
const SCRIPT_PATH = path.resolve(__dirname, "index.ts");

let isRunning = false;
let currentProcess: ReturnType<typeof spawn> | null = null;

// ─── Telegram Helper ────────────────────────────────
async function sendTelegram(chatId: number, text: string) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (e) {
    console.error("텔레그램 전송 실패:", e);
  }
}

// ─── Update command status ──────────────────────────
async function updateCommand(id: number, status: string, result?: string) {
  await supabase
    .from("command_queue")
    .update({ status, result, updated_at: new Date().toISOString() })
    .eq("id", id);
}

// ─── Execute mission command ────────────────────────
async function executeCommand(cmd: {
  id: number;
  command: string;
  args: Record<string, unknown>;
  chat_id: number;
  requested_by: string;
}) {
  const { id, command, args, chat_id, requested_by } = cmd;

  log(`\n📥 명령 수신: ${command} (by ${requested_by})`);
  log(`   인자: ${JSON.stringify(args)}`);

  // Mark as running
  await updateCommand(id, "running");

  if (command === "stop") {
    if (currentProcess) {
      currentProcess.kill("SIGTERM");
      currentProcess = null;
      isRunning = false;
      await updateCommand(id, "done", "미션 실행이 중지되었습니다.");
      await sendTelegram(chat_id, "🛑 미션 실행이 중지되었습니다.");
    } else {
      await updateCommand(id, "done", "현재 실행 중인 미션이 없습니다.");
      await sendTelegram(chat_id, "ℹ️ 현재 실행 중인 미션이 없습니다.");
    }
    return;
  }

  if (isRunning) {
    await updateCommand(id, "error", "이미 다른 미션이 실행 중입니다.");
    await sendTelegram(chat_id, "⚠️ 이미 다른 미션이 실행 중입니다. 먼저 중지하려면 '미션 중지'를 입력하세요.");
    return;
  }

  // Build CLI args
  const cliArgs: string[] = [];
  const round = args.round as number | undefined;
  const maxUsers = (args.maxUsers as number) || 100;
  const concurrency = (args.concurrency as number) || 1;

  if (round) cliArgs.push(`--round=${round}`);
  cliArgs.push(`--max-users=${maxUsers}`);
  cliArgs.push(`--concurrency=${concurrency}`);

  if (command === "dryrun") {
    cliArgs.push("--dry-run");
  }

  const label = command === "dryrun" ? "DRY-RUN" : "실행";
  const roundLabel = round ? `라운드 ${round}` : "전체 라운드";

  // Notify start
  await sendTelegram(
    chat_id,
    `🚀 미션 ${label} 시작!\n` +
      `📋 ${roundLabel} | 최대 ${maxUsers}명 | 동시 ${concurrency}명\n` +
      `👤 요청자: ${requested_by}\n\n` +
      `진행 상황은 '작업 상태'로 확인할 수 있어요.`
  );

  // Spawn child process
  isRunning = true;
  const startTime = Date.now();

  log(`\n🚀 실행: npx tsx ${SCRIPT_PATH} ${cliArgs.join(" ")}`);

  const npmCmd = process.platform === "win32" ? "npx.cmd" : "npx";

  currentProcess = spawn(npmCmd, ["tsx", SCRIPT_PATH, ...cliArgs], {
    cwd: path.resolve(__dirname, "../.."),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PATH: `C:\\Program Files\\nodejs;${process.env.PATH}` },
  });

  let output = "";

  currentProcess.stdout?.on("data", (data: Buffer) => {
    const text = data.toString();
    output += text;
    process.stdout.write(text); // Forward to console
  });

  currentProcess.stderr?.on("data", (data: Buffer) => {
    const text = data.toString();
    output += text;
    process.stderr.write(text); // Forward to console
  });

  currentProcess.on("close", async (code) => {
    isRunning = false;
    currentProcess = null;

    const elapsedMin = Math.round((Date.now() - startTime) / 60000);
    const elapsedHr = Math.floor(elapsedMin / 60);
    const remainMin = elapsedMin % 60;
    const elapsedStr = elapsedHr > 0 ? `${elapsedHr}h ${remainMin}m` : `${elapsedMin}분`;

    if (code === 0) {
      // Extract summary from output
      const summaryMatch = output.match(/✅ 성공: (\d+)건[\s\S]*?❌ 실패: (\d+)건/);
      const success = summaryMatch ? summaryMatch[1] : "?";
      const failed = summaryMatch ? summaryMatch[2] : "?";

      const resultMsg = `✅ 미션 ${label} 완료! (${elapsedStr} 소요)\n성공: ${success}건 / 실패: ${failed}건`;
      await updateCommand(id, "done", resultMsg);

      // Don't send telegram here for "run" — index.ts already sends its own report
      if (command === "dryrun") {
        await sendTelegram(chat_id, resultMsg);
      }

      log(`\n✅ 명령 완료 (exit code: ${code})`);
    } else {
      // Extract last few lines for error context
      const lastLines = output.split("\n").slice(-10).join("\n");
      const resultMsg = `❌ 미션 ${label} 실패 (exit code: ${code}, ${elapsedStr} 소요)\n\n마지막 로그:\n${lastLines.substring(0, 500)}`;
      await updateCommand(id, "error", resultMsg);
      await sendTelegram(chat_id, `❌ 미션 ${label} 실패 (exit code: ${code})\n소요시간: ${elapsedStr}`);

      log(`\n❌ 명령 실패 (exit code: ${code})`);
    }
  });

  currentProcess.on("error", async (err) => {
    isRunning = false;
    currentProcess = null;
    const errMsg = `❌ 프로세스 시작 실패: ${String(err)}`;
    await updateCommand(id, "error", errMsg);
    await sendTelegram(chat_id, errMsg);
    log(`\n❌ ${errMsg}`);
  });
}

// ─── Poll Loop ──────────────────────────────────────
async function pollOnce() {
  try {
    // Get oldest pending command
    const { data, error } = await supabase
      .from("command_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) {
      // Table might not exist yet
      if (error.message.includes("does not exist") || error.code === "42P01") {
        log("⚠️  command_queue 테이블이 없습니다. SQL 파일을 실행해 주세요.");
        return;
      }
      console.error("폴링 오류:", error.message);
      return;
    }

    if (data && data.length > 0) {
      await executeCommand(data[0]);
    }
  } catch (err) {
    console.error("폴링 중 오류:", err);
  }
}

function log(...args: unknown[]) {
  const now = new Date().toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
  console.log(`[${now}]`, ...args);
}

// ─── Main ───────────────────────────────────────────
async function main() {
  console.log("\n");
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   📡 텔레그램 명령 리스너 — Command Listener             ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log("");
  log("🔄 명령 대기 중... (10초 간격 폴링)");
  log(`   Supabase: ${SUPABASE_URL}`);
  log(`   텔레그램 봇: ${TELEGRAM_BOT_TOKEN ? "✅ 설정됨" : "❌ 미설정"}`);
  console.log("");

  // Initial poll
  await pollOnce();

  // Poll loop
  setInterval(pollOnce, POLL_INTERVAL_MS);

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    log("\n⏹️  리스너 종료");
    if (currentProcess) {
      currentProcess.kill("SIGTERM");
    }
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    log("\n⏹️  리스너 종료 (SIGTERM)");
    if (currentProcess) {
      currentProcess.kill("SIGTERM");
    }
    process.exit(0);
  });
}

main().catch(console.error);
