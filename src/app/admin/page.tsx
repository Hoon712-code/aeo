"use client";

import { useState, useEffect, useCallback } from "react";
import toast, { Toaster } from "react-hot-toast";

interface AdminUserData {
    id: string;
    name: string;
    group: string;
    display_name: string;
    label: string;
    full_name: string;
    completed_rounds: number;
    completed_steps: number;
    current_round: number;
    current_step: number;
    total_steps: number;
    completed_today: boolean;
}

interface LogEntry {
    id: string;
    user_name: string;
    mission_round: number;
    mission_step: number;
    ai_response_snippet: string | null;
    completed_at: string;
}

interface AdminData {
    users: AdminUserData[];
    recentLogs: LogEntry[];
}

const GROUP_COLORS: Record<string, string> = {
    A: "text-blue-300",
    B: "text-purple-300",
    C: "text-emerald-300",
    D: "text-amber-300",
    E: "text-rose-300",
};

const GROUP_BG: Record<string, string> = {
    A: "from-blue-500/20 to-blue-600/10 border-blue-500/30",
    B: "from-purple-500/20 to-purple-600/10 border-purple-500/30",
    C: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30",
    D: "from-amber-500/20 to-amber-600/10 border-amber-500/30",
    E: "from-rose-500/20 to-rose-600/10 border-rose-500/30",
};

export default function AdminPage() {
    const [data, setData] = useState<AdminData | null>(null);
    const [loading, setLoading] = useState(true);
    const [filterGroup, setFilterGroup] = useState("ALL");
    const [filterStatus, setFilterStatus] = useState("ALL");
    const [tab, setTab] = useState<"users" | "logs">("users");

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch("/api/admin");
            const result = await res.json();
            if (res.ok) setData(result);
            else toast.error("관리자 데이터를 불러올 수 없습니다.");
        } catch {
            toast.error("서버에 연결할 수 없습니다.");
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    if (loading) {
        return (
            <main className="min-h-screen min-h-[100dvh] flex items-center justify-center">
                <Toaster position="top-center" />
                <div className="text-center animate-fade-in">
                    <div className="w-12 h-12 border-3 border-primary-400/30 border-t-primary-400 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-surface-200/60 text-sm">관리자 데이터를 불러오는 중...</p>
                </div>
            </main>
        );
    }

    if (!data) {
        return (
            <main className="min-h-screen min-h-[100dvh] flex items-center justify-center p-4">
                <Toaster position="top-center" />
                <div className="glass-card p-8 text-center">
                    <p className="text-red-400">데이터를 불러올 수 없습니다.</p>
                </div>
            </main>
        );
    }

    const filteredUsers = data.users.filter((user) => {
        if (filterGroup !== "ALL" && user.group !== filterGroup) return false;
        if (filterStatus === "DONE" && !user.completed_today) return false;
        if (filterStatus === "NOT_DONE" && user.completed_today) return false;
        return true;
    });

    const totalCompleted = data.users.filter((u) => u.completed_today).length;
    const groupCounts: Record<string, { total: number; done: number }> = {};
    data.users.forEach((u) => {
        if (!groupCounts[u.group]) groupCounts[u.group] = { total: 0, done: 0 };
        groupCounts[u.group].total++;
        if (u.completed_today) groupCounts[u.group].done++;
    });

    return (
        <main className="min-h-screen min-h-[100dvh] p-4 md:p-8">
            <Toaster position="top-center" />
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className="mb-6 animate-fade-in">
                    <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
                        <div>
                            <a href="/" className="inline-flex items-center gap-2 text-sm text-surface-200/40 hover:text-primary-400 transition-colors mb-3">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                </svg>
                                홈으로
                            </a>
                            <h1 className="text-xl md:text-2xl font-extrabold">
                                <span className="gradient-text">관리자</span> 대시보드
                            </h1>
                            <p className="text-surface-200/60 text-xs mt-1">전체 테스터 현황 및 인증 모니터링</p>
                        </div>
                        <button
                            onClick={() => { setLoading(true); fetchData(); }}
                            className="gradient-btn text-sm flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            새로고침
                        </button>
                    </div>
                </header>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3 mb-5 animate-slide-up">
                    <div className="glass-card p-3 text-center">
                        <p className="text-xl md:text-2xl font-bold text-white">{data.users.length}</p>
                        <p className="text-[10px] text-surface-200/50 mt-1">전체 유저</p>
                    </div>
                    {["A", "B", "C", "D", "E"].map((g) => (
                        <div key={g} className={`glass-card p-3 text-center bg-gradient-to-b ${GROUP_BG[g]}`}>
                            <p className={`text-xl md:text-2xl font-bold ${GROUP_COLORS[g]}`}>
                                {groupCounts[g]?.done || 0}<span className="text-surface-200/30 text-sm">/{groupCounts[g]?.total || 0}</span>
                            </p>
                            <p className="text-[10px] text-surface-200/50 mt-1">{g}그룹</p>
                        </div>
                    ))}
                </div>

                {/* Summary Bar */}
                <div className="glass-card p-3 mb-5 animate-slide-up" style={{ animationDelay: "0.1s" }}>
                    <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs text-surface-200/60">오늘 전체 완료율</p>
                        <p className="text-xs font-semibold">{totalCompleted}/{data.users.length}</p>
                    </div>
                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full transition-all duration-700"
                            style={{ width: `${data.users.length > 0 ? (totalCompleted / data.users.length) * 100 : 0}%` }}
                        />
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mb-5 p-1 bg-white/3 rounded-xl w-fit animate-slide-up" style={{ animationDelay: "0.15s" }}>
                    <button onClick={() => setTab("users")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "users" ? "bg-primary-600 text-white shadow-lg" : "text-surface-200/50 hover:text-white"}`}>
                        유저 현황
                    </button>
                    <button onClick={() => setTab("logs")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "logs" ? "bg-primary-600 text-white shadow-lg" : "text-surface-200/50 hover:text-white"}`}>
                        인증 로그
                    </button>
                </div>

                {/* Users Tab */}
                {tab === "users" && (
                    <div className="animate-fade-in">
                        <div className="flex flex-wrap gap-2 mb-3">
                            <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50">
                                <option value="ALL" className="bg-surface-900">전체 그룹</option>
                                {["A","B","C","D","E"].map((g) => (
                                    <option key={g} value={g} className="bg-surface-900">{g} 그룹</option>
                                ))}
                            </select>
                            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50">
                                <option value="ALL" className="bg-surface-900">전체 상태</option>
                                <option value="DONE" className="bg-surface-900">오늘 완료</option>
                                <option value="NOT_DONE" className="bg-surface-900">미완료</option>
                            </select>
                            <span className="text-xs text-surface-200/40 self-center ml-2">{filteredUsers.length}명</span>
                        </div>

                        <div className="glass-card overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-white/5">
                                            <th className="text-left text-[10px] font-medium text-surface-200/50 uppercase tracking-wider px-4 py-3">이름</th>
                                            <th className="text-center text-[10px] font-medium text-surface-200/50 uppercase tracking-wider px-3 py-3">그룹</th>
                                            <th className="text-center text-[10px] font-medium text-surface-200/50 uppercase tracking-wider px-3 py-3">진행</th>
                                            <th className="text-center text-[10px] font-medium text-surface-200/50 uppercase tracking-wider px-3 py-3">완료</th>
                                            <th className="text-center text-[10px] font-medium text-surface-200/50 uppercase tracking-wider px-3 py-3">오늘</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredUsers.map((user) => (
                                            <tr key={user.id} className="border-b border-white/3 hover:bg-white/3 transition-colors">
                                                <td className="px-4 py-2.5">
                                                    <span className="text-sm font-medium text-white/80">{user.full_name || user.name}</span>
                                                </td>
                                                <td className="text-center px-3 py-2.5">
                                                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-lg ${GROUP_COLORS[user.group]} bg-white/5`}>{user.group}</span>
                                                </td>
                                                <td className="text-center px-3 py-2.5 text-xs text-surface-200/70">
                                                    {user.completed_steps >= user.total_steps
                                                        ? <span className="text-accent-400 font-semibold">완료</span>
                                                        : `R${user.current_round} S${user.current_step}`
                                                    }
                                                </td>
                                                <td className="text-center px-3 py-2.5 text-xs text-surface-200/70">
                                                    {user.completed_steps}/{user.total_steps}
                                                </td>
                                                <td className="text-center px-3 py-2.5">
                                                    {user.completed_today ? (
                                                        <span className="text-xs text-accent-400 bg-accent-500/10 px-2 py-0.5 rounded-full">O</span>
                                                    ) : (
                                                        <span className="text-xs text-surface-200/30 bg-white/3 px-2 py-0.5 rounded-full">X</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Logs Tab */}
                {tab === "logs" && (
                    <div className="animate-fade-in">
                        <div className="glass-card overflow-hidden">
                            <div className="p-4 border-b border-white/5">
                                <h3 className="font-semibold text-white/90 text-sm">최근 인증 로그</h3>
                                <p className="text-[10px] text-surface-200/40 mt-0.5">최근 50개의 인증 내역</p>
                            </div>
                            {data.recentLogs.length === 0 ? (
                                <div className="p-10 text-center">
                                    <p className="text-surface-200/40 text-sm">아직 인증 기록이 없습니다.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-white/3">
                                    {data.recentLogs.map((log) => (
                                        <div key={log.id} className="p-4 hover:bg-white/3 transition-colors">
                                            <div className="flex items-center justify-between mb-1.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-white/80">{log.user_name}</span>
                                                    <span className="text-[10px] text-surface-200/40 bg-white/3 px-1.5 py-0.5 rounded">
                                                        R{log.mission_round} S{log.mission_step}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] text-surface-200/30">
                                                    {new Date(log.completed_at).toLocaleString("ko-KR")}
                                                </span>
                                            </div>
                                            {log.ai_response_snippet && (
                                                <p className="text-xs text-surface-200/60 bg-white/3 rounded-lg p-2.5 leading-relaxed line-clamp-3">
                                                    &ldquo;{log.ai_response_snippet}&rdquo;
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
