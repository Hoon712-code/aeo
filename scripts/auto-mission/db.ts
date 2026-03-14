import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";
import { log } from "./human-behavior";

// Import prompt generator from existing codebase
import { generatePrompt, labelToIndex } from "../../src/lib/prompt-generator";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface UserInfo {
  id: string;
  name: string;
  group: string;
  label: string;
}

export interface MissionInfo {
  id: number;
  round: number;
  step: number;
  target_ai: string;
  instruction: string;
  prompt_template: string;
}

export interface PendingMission {
  user: UserInfo;
  mission: MissionInfo;
  personalizedPrompt: string;
}

/**
 * Get all users from the database
 */
export async function getAllUsers(): Promise<UserInfo[]> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("label", { ascending: true });

  if (error) throw new Error(`유저 조회 실패: ${error.message}`);
  log(`📋 등록된 유저 ${data.length}명 조회됨`);
  return data;
}

/**
 * Get all missions from the database
 */
export async function getAllMissions(): Promise<MissionInfo[]> {
  const { data, error } = await supabase
    .from("missions")
    .select("*")
    .order("round", { ascending: true })
    .order("step", { ascending: true });

  if (error) throw new Error(`미션 조회 실패: ${error.message}`);
  return data;
}

/**
 * Get completed mission IDs for a specific user
 */
async function getCompletedMissionIds(userId: string): Promise<Set<number>> {
  const { data, error } = await supabase
    .from("logs")
    .select("mission_id")
    .eq("user_id", userId);

  if (error) throw new Error(`로그 조회 실패: ${error.message}`);
  return new Set((data || []).map((l) => l.mission_id));
}

/**
 * Get all pending missions for all users.
 * A mission is "pending" if the user hasn't completed it yet.
 *
 * @param targetRound - Optional: only get missions for a specific round
 * @param targetStep  - Optional: only get missions for a specific step
 * @param maxUsers    - Max number of users to process (default: 20)
 */
export async function getPendingMissions(
  targetRound?: number,
  targetStep?: number,
  maxUsers = 20
): Promise<PendingMission[]> {
  const users = await getAllUsers();
  const missions = await getAllMissions();

  const pendingMissions: PendingMission[] = [];

  for (const user of users.slice(0, maxUsers)) {
    const completedIds = await getCompletedMissionIds(user.id);
    const userIndex = labelToIndex(user.label || `${user.group}_01`);

    for (const mission of missions) {
      // Filter by target round/step if specified
      if (targetRound !== undefined && mission.round !== targetRound) continue;
      if (targetStep !== undefined && mission.step !== targetStep) continue;

      // Only include ChatGPT missions
      if (!mission.target_ai.toLowerCase().includes("chatgpt") &&
          !mission.target_ai.toLowerCase().includes("gpt")) {
        continue;
      }

      // Skip already completed
      if (completedIds.has(mission.id)) continue;

      // Generate personalized prompt
      const personalizedPrompt = generatePrompt(
        mission.round,
        mission.step,
        userIndex,
        mission.prompt_template
      );

      pendingMissions.push({
        user,
        mission,
        personalizedPrompt,
      });
    }
  }

  log(`📌 미수행 미션 ${pendingMissions.length}건 발견 (유저 ${Math.min(users.length, maxUsers)}명)`);
  return pendingMissions;
}

/**
 * Save mission completion result to the logs table.
 */
export async function saveResult(
  userId: string,
  missionId: number,
  aiResponseSnippet: string
): Promise<void> {
  // Truncate response to a reasonable snippet length
  const snippet = aiResponseSnippet.length > 500
    ? aiResponseSnippet.substring(0, 500) + "..."
    : aiResponseSnippet;

  const { error } = await supabase.from("logs").insert({
    user_id: userId,
    mission_id: missionId,
    ai_response_snippet: snippet,
  });

  if (error) {
    // Handle duplicate (already completed)
    if (error.code === "23505") {
      log(`  ⚠️ 이미 완료된 미션 (User: ${userId}, Mission: ${missionId})`);
      return;
    }
    throw new Error(`결과 저장 실패: ${error.message}`);
  }

  log(`  💾 결과 저장 완료 (Mission #${missionId})`);
}

/**
 * Log a work event to the work_log table.
 * This allows the Telegram chatbot to report on auto-mission activity.
 */
export async function logWorkEvent(
  eventType: "batch_start" | "user_progress" | "batch_complete" | "error",
  message: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    await supabase.from("work_log").insert({
      event_type: eventType,
      message,
      details,
    });
  } catch (err) {
    // Don't let logging failures break the mission
    console.error(`⚠️ work_log 기록 실패: ${String(err)}`);
  }
}

/**
 * Clean up old work_log entries (keep last 100).
 */
export async function cleanOldWorkLogs(): Promise<void> {
  try {
    // Get the ID of the 100th newest entry
    const { data } = await supabase
      .from("work_log")
      .select("id")
      .order("created_at", { ascending: false })
      .range(100, 100);

    if (data && data.length > 0) {
      await supabase
        .from("work_log")
        .delete()
        .lt("id", data[0].id);
    }
  } catch (err) {
    console.error(`⚠️ work_log 정리 실패: ${String(err)}`);
  }
}
