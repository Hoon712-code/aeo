#!/usr/bin/env tsx
/**
 * 설야갈비 AI 서포터즈 — 자동 미션 수행 시스템
 *
 * Usage:
 *   npm run mission                    # 전체 실행 (20명, 프록시 사용)
 *   npm run mission:dry-run            # DB 조회만 (브라우저 없음)
 *   npm run mission -- --no-proxy      # 프록시 없이 실행
 *   npm run mission -- --user=1        # 특정 유저만 실행
 *   npm run mission -- --round=1       # 특정 라운드만
 *   npm run mission -- --step=1        # 특정 스텝만
 *   npm run mission -- --max-users=5   # 처리할 최대 유저 수
 */

import "./config"; // Load env first
import { getPendingMissions, saveResult, PendingMission, logWorkEvent, cleanOldWorkLogs } from "./db";
import { launchBrowser, closeBrowser, BrowserSession } from "./browser";
import { askChatGPT, askFollowUp } from "./chatgpt";
import { randomDelay, log, randInt } from "./human-behavior";
import { TIMING } from "./config";

// ─── Telegram Notification ──────────────────────────
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = -830017199; // Calm 그룹방

interface UserResult {
  name: string;
  group: string;
  success: number;
  failed: number;
  total: number;
  failedSteps: string[];
}

async function sendTelegramReport(
  userResults: UserResult[],
  totalSuccess: number,
  totalFailed: number,
  totalMissions: number,
  elapsedMs: number,
  roundInfo: string
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    log("⚠️  TELEGRAM_BOT_TOKEN이 설정되지 않아 텔레그램 알림을 건너뜁니다.");
    return;
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const timeStr = now.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const successRate = totalMissions > 0
    ? ((totalSuccess / totalMissions) * 100).toFixed(1)
    : "0.0";

  const elapsedMin = Math.round(elapsedMs / 60000);
  const elapsedHr = Math.floor(elapsedMin / 60);
  const remainMin = elapsedMin % 60;
  const elapsedStr = elapsedHr > 0
    ? `약 ${elapsedHr}시간 ${remainMin}분`
    : `약 ${elapsedMin}분`;

  // Build per-user lines
  const userLines = userResults.map((u) => {
    const icon = u.failed > 0 ? "⚠️" : "✅";
    const detail = u.failed > 0 ? ` (${u.failedSteps.join(", ")} 실패)` : "";
    return `  ${icon} ${u.name}: ${u.success}/${u.total}${detail}`;
  });

  // If too many users, show summary + first/last few
  let userSection: string;
  if (userLines.length <= 15) {
    userSection = userLines.join("\n");
  } else {
    const failedUsers = userResults.filter((u) => u.failed > 0);
    const successCount = userResults.filter((u) => u.failed === 0).length;
    userSection = `  ✅ 전원 성공: ${successCount}명`;
    if (failedUsers.length > 0) {
      userSection += "\n  ⚠️ 일부 실패:\n";
      userSection += failedUsers
        .map((u) => `    - ${u.name}: ${u.success}/${u.total} (${u.failedSteps.join(", ")} 실패)`)
        .join("\n");
    }
  }

  const message = `🥩 설야갈비 AI 서포터즈 — 자동 미션 배치 완료!
━━━━━━━━━━━━━━━━━━━━━━
📅 ${dateStr} ${timeStr} 완료
🎯 ${roundInfo} | ${userResults.length}명 실행

📊 결과: ✅ ${totalSuccess}건 성공 / ❌ ${totalFailed}건 실패 (${successRate}%)

👤 유저별:
${userSection}

⏱️ 소요시간: ${elapsedStr}`;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message }),
      }
    );
    const data = await res.json();
    if (data.ok) {
      log("📨 텔레그램 Calm 방에 결과 보고 전송 완료!");
    } else {
      log(`⚠️  텔레그램 전송 실패: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    log(`⚠️  텔레그램 전송 오류: ${String(err)}`);
  }
}

// ─── CLI Args Parsing ───────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const flags: Record<string, string | boolean> = {};

  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, val] = arg.substring(2).split("=");
      flags[key] = val ?? true;
    }
  }

  return {
    dryRun: flags["dry-run"] === true,
    noProxy: flags["no-proxy"] === true,
    userIndex: flags["user"] ? parseInt(flags["user"] as string, 10) : undefined,
    round: flags["round"] ? parseInt(flags["round"] as string, 10) : undefined,
    step: flags["step"] ? parseInt(flags["step"] as string, 10) : undefined,
    maxUsers: flags["max-users"] ? parseInt(flags["max-users"] as string, 10) : 20,
  };
}

// ─── Group missions by user ─────────────────────────
function groupByUser(missions: PendingMission[]): Map<string, PendingMission[]> {
  const grouped = new Map<string, PendingMission[]>();
  for (const m of missions) {
    const userId = m.user.id;
    if (!grouped.has(userId)) grouped.set(userId, []);
    grouped.get(userId)!.push(m);
  }
  // Sort each user's missions by round then step
  for (const [, missions] of grouped) {
    missions.sort((a, b) => {
      if (a.mission.round !== b.mission.round) return a.mission.round - b.mission.round;
      return a.mission.step - b.mission.step;
    });
  }
  return grouped;
}

// ─── Execute missions for a single user (SAME SESSION) ──
async function executeUserMissions(
  userMissions: PendingMission[],
  userIndex: number,
  useProxy: boolean
): Promise<{ success: number; failed: number }> {
  const user = userMissions[0].user;
  let session: BrowserSession | null = null;
  let success = 0;
  let failed = 0;

  try {
    // Launch browser with unique fingerprint
    session = await launchBrowser(userIndex, useProxy);
    const page = await session.context.newPage();

    let responseCount = 0; // Track how many responses are on the page

    for (let i = 0; i < userMissions.length; i++) {
      const mission = userMissions[i];
      const label = `[${user.name} | R${mission.mission.round}S${mission.mission.step}]`;
      const isFirstQuestion = i === 0;

      try {
        log(`\n${label} 미션 시작... ${isFirstQuestion ? "(첫 질문)" : `(이어서 질문 ${i + 1}/${userMissions.length})`}`);
        log(`  📝 프롬프트: ${mission.personalizedPrompt.substring(0, 80)}...`);

        let response: string;

        if (isFirstQuestion) {
          // First question: navigate to ChatGPT and ask
          const [resp, count] = await askChatGPT(page, mission.personalizedPrompt);
          response = resp;
          responseCount = count;
        } else {
          // Follow-up: type in the same conversation
          const [resp, count] = await askFollowUp(page, mission.personalizedPrompt, responseCount);
          response = resp;
          responseCount = count;
        }

        log(`  💬 응답 미리보기: ${response.substring(0, 100)}...`);

        // Save to database
        await saveResult(user.id, mission.mission.id, response);
        success++;

      } catch (err) {
        log(`  ❌ ${label} 미션 실패: ${String(err)}`);
        failed++;
        // If a question fails, try to continue with the next one
        // (the page might still be usable)
      }
    }

    // === After all questions: stare at the page like a real person (~1 min) ===
    if (success > 0) {
      log(`\n  👀 마지막 응답 읽기 완료 — 화면 응시 중 (약 1분)...`);

      // Scroll all the way to the bottom first
      for (let s = 0; s < randInt(3, 6); s++) {
        await page.mouse.wheel(0, randInt(200, 500));
        await randomDelay(800, 2000);
      }

      // Stare at the screen with idle movements for ~60 seconds
      const stareTime = randInt(50000, 70000); // 50~70 seconds
      const startStare = Date.now();

      while (Date.now() - startStare < stareTime) {
        const action = Math.random();
        if (action < 0.3) {
          // Small scroll up/down (re-reading parts)
          await page.mouse.wheel(0, randInt(-150, 150));
          await randomDelay(2000, 5000);
        } else if (action < 0.6) {
          // Idle mouse drift
          const vp = page.viewportSize();
          if (vp) {
            await page.mouse.move(
              randInt(200, vp.width - 200),
              randInt(200, vp.height - 200),
              { steps: randInt(10, 25) }
            );
          }
          await randomDelay(3000, 6000);
        } else {
          // Just sit still (thinking)
          await randomDelay(4000, 8000);
        }
      }

      log(`  ✅ 화면 응시 완료 — 브라우저 종료 준비`);
    }

    return { success, failed };
  } finally {
    if (session) {
      await closeBrowser(session);
    }
  }
}

// ─── Main ───────────────────────────────────────────
async function main() {
  const args = parseArgs();

  console.log("\n");
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   🥩 설야갈비 AI 서포터즈 — 자동 미션 수행 시스템       ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log("");

  if (args.dryRun) {
    log("🔍 DRY-RUN 모드: DB 조회만 수행합니다 (브라우저 실행 없음)\n");
  }

  log(`⚙️  설정: maxUsers=${args.maxUsers}, proxy=${!args.noProxy}, round=${args.round ?? "all"}, step=${args.step ?? "all"}`);
  console.log("");

  // 1. Fetch pending missions from DB
  const pendingMissions = await getPendingMissions(
    args.round,
    args.step,
    args.maxUsers
  );

  if (pendingMissions.length === 0) {
    log("✅ 수행할 미션이 없습니다. 모든 미션이 완료되었거나 대상이 없습니다.");
    return;
  }

  // Group by user
  const userGroups = groupByUser(pendingMissions);

  // Log batch start to work_log (for Telegram status queries)
  const rounds = [...new Set(pendingMissions.map((m) => m.mission.round))].sort();
  const roundLabel = rounds.length === 1 ? `라운드 ${rounds[0]}` : `라운드 ${rounds.join(",")}`;
  await logWorkEvent("batch_start", `🚀 자동 미션 배치 시작: ${userGroups.size}명, ${pendingMissions.length}건 (${roundLabel})`, {
    userCount: userGroups.size,
    missionCount: pendingMissions.length,
    rounds,
    dryRun: args.dryRun,
  });
  log(`👥 대상 유저: ${userGroups.size}명, 총 미션: ${pendingMissions.length}건\n`);

  // Dry-run: just display what would be done
  if (args.dryRun) {
    console.log("─".repeat(60));
    let idx = 0;
    for (const [, missions] of userGroups) {
      idx++;
      const user = missions[0].user;
      console.log(`\n👤 ${idx}. ${user.name} (${user.group}그룹)`);
      for (const m of missions) {
        console.log(`   📋 R${m.mission.round}S${m.mission.step}: ${m.personalizedPrompt.substring(0, 60)}...`);
      }
    }
    console.log("\n" + "─".repeat(60));
    log(`\n✅ DRY-RUN 완료. 위 ${pendingMissions.length}건의 미션이 실행 대기 중입니다.`);
    log(`   실제 실행하려면: npm run mission`);
    return;
  }

  // Filter to specific user if requested
  if (args.userIndex !== undefined) {
    const targetKey = [...userGroups.keys()][args.userIndex - 1];
    if (!targetKey) {
      log(`❌ 유저 인덱스 ${args.userIndex}이 범위를 벗어났습니다 (총 ${userGroups.size}명)`);
      return;
    }
    const singleUser = userGroups.get(targetKey)!;
    userGroups.clear();
    userGroups.set(targetKey, singleUser);
    log(`🎯 유저 #${args.userIndex}만 실행합니다.`);
  }

  // 2. Execute missions for each user
  let totalSuccess = 0;
  let totalFailed = 0;
  let userIdx = 0;
  const userResults: UserResult[] = [];
  const startTime = Date.now();

  // Figure out round info for the report
  const steps = [...new Set(pendingMissions.map((m) => m.mission.step))].sort();
  const roundInfo = rounds.length === 1
    ? `라운드 ${rounds[0]} (${steps.length}문항)`
    : `라운드 ${rounds.join(",")} (${steps.length}문항)`;

  console.log("\n" + "═".repeat(60));
  log("🚀 미션 수행 시작!\n");

  for (const [, missions] of userGroups) {
    userIdx++;
    const user = missions[0].user;
    console.log("─".repeat(60));
    log(`\n👤 [${userIdx}/${userGroups.size}] ${user.name} — 미션 ${missions.length}건`);

    const result = await executeUserMissions(missions, userIdx, !args.noProxy);
    totalSuccess += result.success;
    totalFailed += result.failed;

    // Track per-user results for Telegram report
    userResults.push({
      name: user.name,
      group: user.group,
      success: result.success,
      failed: result.failed,
      total: missions.length,
      failedSteps: [], // TODO: could track specific failed steps if needed
    });

    // Log progress every 10 users
    if (userIdx % 10 === 0 || userIdx === userGroups.size) {
      await logWorkEvent("user_progress", `📊 진행 중: ${userIdx}/${userGroups.size}명 완료 (✅ ${totalSuccess} / ❌ ${totalFailed})`, {
        currentUser: userIdx,
        totalUsers: userGroups.size,
        success: totalSuccess,
        failed: totalFailed,
      });
    }

    // Add delay between users (except for the last one)
    if (userIdx < userGroups.size) {
      const delay = randInt(TIMING.interUserDelayMin, TIMING.interUserDelayMax);
      log(`\n⏳ 다음 유저까지 ${Math.round(delay / 1000)}초 대기...`);
      await randomDelay(delay, delay + 1000);
    }
  }

  const elapsedMs = Date.now() - startTime;

  // 3. Summary
  console.log("\n" + "═".repeat(60));
  console.log("");
  log("📊 === 실행 결과 요약 ===");
  log(`   ✅ 성공: ${totalSuccess}건`);
  log(`   ❌ 실패: ${totalFailed}건`);
  log(`   📋 총합: ${totalSuccess + totalFailed} / ${pendingMissions.length}건`);
  console.log("");
  log("🎉 자동 미션 수행 완료!");

  // Log batch complete to work_log
  const elapsedMin = Math.round(elapsedMs / 60000);
  await logWorkEvent("batch_complete", `✅ 배치 완료: ${totalSuccess}건 성공, ${totalFailed}건 실패 (${userResults.length}명, ${elapsedMin}분 소요)`, {
    success: totalSuccess,
    failed: totalFailed,
    totalMissions: pendingMissions.length,
    userCount: userResults.length,
    elapsedMs,
    roundInfo,
  });

  // Clean up old work_log entries
  await cleanOldWorkLogs();

  // 4. Send Telegram notification to Calm group
  log("\n📨 텔레그램 결과 보고 전송 중...");
  await sendTelegramReport(
    userResults,
    totalSuccess,
    totalFailed,
    pendingMissions.length,
    elapsedMs,
    roundInfo
  );
}

// Run
main().catch(async (err) => {
  console.error("\n❌ 치명적 오류:", err);
  await logWorkEvent("error", `❌ 치명적 오류 발생: ${String(err)}`, { error: String(err) });
  process.exit(1);
});
