"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import type { AdminData } from "@/lib/types";

export default function AdminPage() {
    const [data, setData] = useState<AdminData | null>(null);
    const [loading, setLoading] = useState(true);
    const [filterGroup, setFilterGroup] = useState<string>("ALL");
    const [filterStatus, setFilterStatus] = useState<string>("ALL");
    const [tab, setTab] = useState<"users" | "logs">("users");

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch("/api/admin");
            const result = await res.json();
            if (res.ok) {
                setData(result);
            } else {
                toast.error("관리자 데이터를 불러올 수 없습니다.");
            }
        } catch {
            toast.error("서버에 연결할 수 없습니다.");
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    if (loading) {
        return (
            <main className="min-h-screen flex items-center justify-center">
                <div className="text-center animate-fade-in">
                    <div className="w-12 h-12 border-3 border-primary-400/30 border-t-primary-400 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-surface-200/60 text-sm">관리자 데이터를 불러오는 중...</p>
                </div>
            </main>
        );
    }

    if (!data) {
        return (
            <main className="min-h-screen flex items-center justify-center p-4">
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

    const groupColors: Record<string, string> = {
        A: "from-blue-500/20 to-blue-600/10 border-blue-500/30",
        B: "from-purple-500/20 to-purple-600/10 border-purple-500/30",
        C: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30",
        D: "from-amber-500/20 to-amber-600/10 border-amber-500/30",
        E: "from-rose-500/20 to-rose-600/10 border-rose-500/30",
    };

    const groupTextColors: Record<string, string> = {
        A: "text-blue-300",
        B: "text-purple-300",
        C: "text-emerald-300",
        D: "text-amber-300",
        E: "text-rose-300",
    };

    return (
        <main className="min-h-screen p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className="mb-8 animate-fade-in">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <a href="/" className="inline-flex items-center gap-2 text-sm text-surface-200/40 hover:text-primary-400 transition-colors mb-4">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                </svg>
                                홈으로
                            </a>
                            <h1 className="text-2xl md:text-3xl font-extrabold">
                                <span className="gradient-text">관리자</span> 대시보드
                            </h1>
                            <p className="text-surface-200/60 text-sm mt-1">전체 테스터 현황 및 인증 모니터링</p>
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

                {/* Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6 animate-slide-up">
                    <div className="glass-card p-4 text-center">
                        <p className="text-2xl font-bold text-white">{data.users.length}</p>
                        <p className="text-xs text-surface-200/50 mt-1">전체 유저</p>
                    </div>
                    {["A", "B", "C", "D", "E"].map((g) => (
                        <div key={g} className={`glass-card p-4 text-center bg-gradient-to-b ${groupColors[g]}`}>
                            <p className={`text-2xl font-bold ${groupTextColors[g]}`}>
                                {groupCounts[g]?.done || 0}<span className="text-surface-200/30 text-lg">/{groupCounts[g]?.total || 0}</span>
                            </p>
                            <p className="text-xs text-surface-200/50 mt-1">{g}그룹 완료</p>
                        </div>
                    ))}
                </div>

                {/* Summary Bar */}
                <div className="glass-card p-4 mb-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-surface-200/60">오늘 전체 완료율</p>
                        <p className="text-sm font-semibold">{totalCompleted}/{data.users.length}</p>
                    </div>
                    <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full transition-all duration-700"
                            style={{ width: `${data.users.length > 0 ? (totalCompleted / data.users.length) * 100 : 0}%` }}
                        />
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mb-6 p-1 bg-white/3 rounded-xl w-fit animate-slide-up" style={{ animationDelay: "0.15s" }}>
                    <button
                        onClick={() => setTab("users")}
                        className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === "users" ? "bg-primary-600 text-white shadow-lg" : "text-surface-200/50 hover:text-white"}`}
                    >
                        유저 현황
                    </button>
                    <button
                        onClick={() => setTab("logs")}
                        className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === "logs" ? "bg-primary-600 text-white shadow-lg" : "text-surface-200/50 hover:text-white"}`}
                    >
                        인증 로그
                    </button>
                </div>

                {/* Users Tab */}
                {tab === "users" && (
                    <div className="animate-fade-in">
                        {/* Filters */}
                        <div className="flex flex-wrap gap-3 mb-4">
                            <select
                                value={filterGroup}
                                onChange={(e) => setFilterGroup(e.target.value)}
                                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                            >
                                <option value="ALL" className="bg-surface-900">전체 그룹</option>
                                {["A", "B", "C", "D", "E"].map((g) => (
                                    <option key={g} value={g} className="bg-surface-900">{g} 그룹</option>
                                ))}
                            </select>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                            >
                                <option value="ALL" className="bg-surface-900">전체 상태</option>
                                <option value="DONE" className="bg-surface-900">완료</option>
                                <option value="NOT_DONE" className="bg-surface-900">미완료</option>
                            </select>
                            <span className="text-sm text-surface-200/40 self-center ml-2">
                                {filteredUsers.length}명 표시
                            </span>
                        </div>

                        {/* Users Table */}
                        <div className="glass-card overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-white/5">
                                            <th className="text-left text-xs font-medium text-surface-200/50 uppercase tracking-wider px-5 py-4">이름</th>
                                            <th className="text-center text-xs font-medium text-surface-200/50 uppercase tracking-wider px-5 py-4">그룹</th>
                                            <th className="text-center text-xs font-medium text-surface-200/50 uppercase tracking-wider px-5 py-4">진행 주차</th>
                                            <th className="text-center text-xs font-medium text-surface-200/50 uppercase tracking-wider px-5 py-4">완료 수</th>
                                            <th className="text-center text-xs font-medium text-surface-200/50 uppercase tracking-wider px-5 py-4">오늘 완료</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredUsers.map((user, i) => (
                                            <tr
                                                key={user.id}
                                                className="border-b border-white/3 hover:bg-white/3 transition-colors"
                                                style={{ animationDelay: `${i * 20}ms` }}
                                            >
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center text-sm font-semibold text-primary-300">
                                                            {user.name.charAt(0)}
                                                        </div>
                                                        <span className="text-sm font-medium text-white/80">{user.name}</span>
                                                    </div>
                                                </td>
                                                <td className="text-center px-5 py-3.5">
                                                    <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${groupTextColors[user.group]} bg-white/5`}>
                                                        {user.group}
                                                    </span>
                                                </td>
                                                <td className="text-center px-5 py-3.5 text-sm text-surface-200/70">
                                                    {user.completed_count >= user.total_missions
                                                        ? <span className="text-accent-400 font-semibold">완료</span>
                                                        : `${user.current_week}주 ${user.current_step}스텝`
                                                    }
                                                </td>
                                                <td className="text-center px-5 py-3.5 text-sm text-surface-200/70">
                                                    {user.completed_count}
                                                </td>
                                                <td className="text-center px-5 py-3.5">
                                                    {user.completed_today ? (
                                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-400 bg-accent-500/10 px-2.5 py-1 rounded-full">
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                            </svg>
                                                            O
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-surface-200/30 bg-white/3 px-2.5 py-1 rounded-full">
                                                            X
                                                        </span>
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
                            <div className="p-5 border-b border-white/5">
                                <h3 className="font-semibold text-white/90">최근 인증 로그</h3>
                                <p className="text-xs text-surface-200/40 mt-1">최근 50개의 인증 내역</p>
                            </div>
                            {data.recentLogs.length === 0 ? (
                                <div className="p-12 text-center">
                                    <p className="text-surface-200/40 text-sm">아직 인증 기록이 없습니다.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-white/3">
                                    {data.recentLogs.map((log) => (
                                        <div key={log.id} className="p-5 hover:bg-white/3 transition-colors">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm font-medium text-white/80">{log.user_name}</span>
                                                    <span className="text-xs text-surface-200/40 bg-white/3 px-2 py-0.5 rounded">
                                                        {log.mission_week}주 {log.mission_step}스텝
                                                    </span>
                                                </div>
                                                <span className="text-xs text-surface-200/30">
                                                    {new Date(log.completed_at).toLocaleString("ko-KR")}
                                                </span>
                                            </div>
                                            <p className="text-sm text-surface-200/60 bg-white/3 rounded-lg p-3 leading-relaxed">
                                                &ldquo;{log.ai_response_snippet}&rdquo;
                                            </p>
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
