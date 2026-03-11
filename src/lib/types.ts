export interface User {
    id: string;
    name: string;
    group: string;
    display_name: string;
    label: string;
    created_at: string;
}

export interface Mission {
    id: number;
    round: number;
    step: number;
    target_ai: string;
    instruction: string;
    prompt_template: string;
}

export interface Log {
    id: string;
    user_id: string;
    mission_id: number;
    ai_response_snippet: string | null;
    completed_at: string;
}

export interface RoundStatus {
    round: number;
    completedSteps: number;   // 0-3
    isComplete: boolean;
    completedAt: string | null; // when step 3 was completed
}

export interface UserDashboardData {
    user: User;
    currentRound: number;         // 1-5
    currentStep: number;          // 1-3 (within current round)
    mission: Mission | null;      // current mission to show
    personalizedPrompt: string;   // varied prompt for this user
    roundAvailableDate: string | null; // when current round becomes available
    isAvailable: boolean;         // can do mission right now?
    waitMessage: string;          // message if not available
    completedRounds: number;      // total completed rounds (0-5)
    completedSteps: number;       // total completed steps across all rounds (0-15)
    totalSteps: number;           // always 15
    allComplete: boolean;
}

export interface AdminUserData extends User {
    completed_rounds: number;
    completed_steps: number;
    current_round: number;
    current_step: number;
    total_steps: number;
    completed_today: boolean;
}

export interface AdminData {
    users: AdminUserData[];
    recentLogs: (Log & { user_name: string; mission_round: number; mission_step: number })[];
}
