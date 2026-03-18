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

// ─── Auto-Cycle State ───────────────────────────────
let autoCycleActive = false;
let autoCycleCurrentRound = 0;
const AUTO_CYCLE_MAX_ROUND = 5;
const AUTO_CYCLE_DELAY_MS = 120_000; // 2분 대기 후 다음 라운드
let autoCycleChatId = 0;
let autoCycleRequestedBy = "";

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
    autoCycleActive = false;
    if (currentProcess) {
      currentProcess.kill("SIGTERM");
      currentProcess = null;
      isRunning = false;
      await updateCommand(id, "done", "미션 실행이 중지되었습니다.");
      await sendTelegram(chat_id, "🛑 미션 실행이 중지되었습니다. (자동순환도 중지)");
    } else {
      await updateCommand(id, "done", "현재 실행 중인 미션이 없습니다.");
      await sendTelegram(chat_id, "ℹ️ 현재 실행 중인 미션이 없습니다.");
    }
    return;
  }

  // Auto-cycle stop (graceful — 현재 라운드 끝나면 멈춤)
  if (command === "auto-cycle-stop") {
    autoCycleActive = false;
    await updateCommand(id, "done", "자동순환이 중지 예약되었습니다.");
    await sendTelegram(chat_id, "⏸️ 자동순환 중지 예약! 현재 라운드 끝나면 멈춥니다.");
    return;
  }

  // Auto-cycle start
  if (command === "auto-cycle") {
    const startRound = (args.startRound as number) || 1;
    autoCycleActive = true;
    autoCycleCurrentRound = startRound;
    autoCycleChatId = chat_id;
    autoCycleRequestedBy = requested_by;

    await updateCommand(id, "done", `자동순환 시작: 라운드 ${startRound}~${AUTO_CYCLE_MAX_ROUND}`);
    await sendTelegram(
      chat_id,
      `🔄 자동순환 미션 시작!\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📋 라운드 ${startRound} → ${AUTO_CYCLE_MAX_ROUND} 순차 실행\n` +
        `⏱️ 라운드 간 2분 대기\n` +
        `👤 요청자: ${requested_by}\n\n` +
        `중지: "자동미션 중지" (현재 라운드 끝나면)\n` +
        `즉시중지: "미션 중지"`
    );

    // Queue the first round
    await queueRound(startRound, chat_id, requested_by);
    return;
  }

  // If previous process is still running, kill it and proceed
  if (isRunning && currentProcess) {
    log("⚠️  이전 프로세스 종료 후 새로 시작");
    currentProcess.kill("SIGTERM");
    currentProcess = null;
    isRunning = false;
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

  const projectRoot = path.resolve(__dirname, "../..");
  const tsxCmd = process.platform === "win32"
    ? path.join(projectRoot, "node_modules", ".bin", "tsx.cmd")
    : path.join(projectRoot, "node_modules", ".bin", "tsx");

  log(`\n🚀 실행: ${tsxCmd} ${SCRIPT_PATH} ${cliArgs.join(" ")}`);

  currentProcess = spawn(tsxCmd, [SCRIPT_PATH, ...cliArgs], {
    cwd: projectRoot,
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
      const summaryMatch = output.match(/✅ 성공: (\d+)건[\s\S]*?❌ 실패: (\d+)건/);
      const success = summaryMatch ? summaryMatch[1] : "?";
      const failed = summaryMatch ? summaryMatch[2] : "?";

      const resultMsg = `✅ 미션 ${label} 완료! (${elapsedStr} 소요)\n성공: ${success}건 / 실패: ${failed}건`;
      await updateCommand(id, "done", resultMsg);

      if (command === "dryrun") {
        await sendTelegram(chat_id, resultMsg);
      }

      log(`\n✅ 명령 완료 (exit code: ${code})`);

      // ── Auto-Cycle: queue next round ──
      if (autoCycleActive && round) {
        const nextRound = round + 1;
        if (nextRound <= AUTO_CYCLE_MAX_ROUND) {
          autoCycleCurrentRound = nextRound;
          log(`\n🔄 자동순환: ${AUTO_CYCLE_DELAY_MS / 1000}초 후 라운드 ${nextRound} 시작`);
          await sendTelegram(
            chat_id,
            `🔄 라운드 ${round} 완료! ${AUTO_CYCLE_DELAY_MS / 60000}분 후 라운드 ${nextRound} 자동 시작합니다.\n중지: "자동미션 중지"`
          );
          setTimeout(() => {
            if (autoCycleActive) {
              queueRound(nextRound, autoCycleChatId, autoCycleRequestedBy);
            } else {
              log("⏸️ 자동순환 중지됨 — 다음 라운드 실행 안 함");
              sendTelegram(chat_id, "⏹️ 자동순환이 중지되었습니다.");
            }
          }, AUTO_CYCLE_DELAY_MS);
        } else {
          // Wrap back to round 1
          const nextRound = 1;
          autoCycleCurrentRound = nextRound;
          log(`\n🔄 자동순환: 라운드 ${AUTO_CYCLE_MAX_ROUND} 완료 → ${AUTO_CYCLE_DELAY_MS / 1000}초 후 라운드 1 재시작`);
          await sendTelegram(
            chat_id,
            `🔄 라운드 ${AUTO_CYCLE_MAX_ROUND} 완료! ${AUTO_CYCLE_DELAY_MS / 60000}분 후 라운드 1부터 다시 시작합니다.\n중지: "자동미션 중지"`
          );
          setTimeout(() => {
            if (autoCycleActive) {
              queueRound(nextRound, autoCycleChatId, autoCycleRequestedBy);
            } else {
              log("⏸️ 자동순환 중지됨 — 다음 라운드 실행 안 함");
              sendTelegram(chat_id, "⏹️ 자동순환이 중지되었습니다.");
            }
          }, AUTO_CYCLE_DELAY_MS);
        }
      }
    } else {
      const lastLines = output.split("\n").slice(-10).join("\n");
      const resultMsg = `❌ 미션 ${label} 실패 (exit code: ${code}, ${elapsedStr} 소요)\n\n마지막 로그:\n${lastLines.substring(0, 500)}`;
      await updateCommand(id, "error", resultMsg);
      await sendTelegram(chat_id, `❌ 미션 ${label} 실패 (exit code: ${code})\n소요시간: ${elapsedStr}`);

      log(`\n❌ 명령 실패 (exit code: ${code})`);

      // Auto-cycle: stop on error
      if (autoCycleActive) {
        autoCycleActive = false;
        await sendTelegram(chat_id, `⚠️ 에러로 자동순환이 중지되었습니다.`);
      }
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

// ─── Queue a mission round ──────────────────────────
async function queueRound(round: number, chatId: number, requestedBy: string) {
  log(`📤 라운드 ${round} 명령 큐에 추가`);
  await supabase.from("command_queue").insert({
    command: "run",
    args: { round, maxUsers: 100, concurrency: 1, fromAutoCycle: true },
    status: "pending",
    requested_by: requestedBy,
    chat_id: chatId,
  });
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
