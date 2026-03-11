export interface User {
    id: string;
    name: string;
    group: string;
    created_at: string;
}

export interface Mission {
    id: number;
    week: number;
    step: number;
    target_ai: string;
    instruction: string;
    prompt_template: string;
}

export interface Log {
    id: string;
    user_id: string;
    mission_id: number;
    ai_response_snippet: string;
    completed_at: string;
}

export interface UserDashboardData {
    user: User;
    isActive: boolean;
    nextActiveDay: string;
    mission: Mission | null;
    hasCompletedToday: boolean;
    completedCount: number;
    totalMissions: number;
}

export interface AdminUserData extends User {
    completed_count: number;
    current_week: number;
    current_step: number;
    completed_today: boolean;
    total_missions: number;
}

export interface AdminData {
    users: AdminUserData[];
    recentLogs: (Log & { user_name: string; mission_week: number; mission_step: number })[];
}
