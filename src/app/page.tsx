"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/lib/types";

export default function HomePage() {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [initialLoad, setInitialLoad] = useState(true);

    const searchUsers = useCallback(async (searchQuery: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/users?q=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            setUsers(data.users || []);
        } catch {
            setUsers([]);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (initialLoad) {
            searchUsers("");
            setInitialLoad(false);
        }
    }, [initialLoad, searchUsers]);

    useEffect(() => {
        const timer = setTimeout(() => {
            searchUsers(query);
        }, 300);
        return () => clearTimeout(timer);
    }, [query, searchUsers]);

    const handleSelectUser = (userId: string) => {
        router.push(`/dashboard/${userId}`);
    };

    const groupColors: Record<string, string> = {
        A: "bg-blue-500/20 text-blue-300 border-blue-500/30",
        B: "bg-purple-500/20 text-purple-300 border-purple-500/30",
        C: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        D: "bg-amber-500/20 text-amber-300 border-amber-500/30",
        E: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    };

    return (
        <main className="min-h-screen flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-lg animate-slide-up">
                {/* Logo & Title */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 mb-6 shadow-lg shadow-primary-500/25">
                        <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-extrabold gradient-text mb-3">
                        AI 훈련 미션
                    </h1>
                    <p className="text-surface-200/60 text-sm leading-relaxed">
                        오늘의 미션을 확인하고 AI를 훈련시키세요
                    </p>
                </div>

                {/* Search Card */}
                <div className="glass-card p-6">
                    <label className="block text-sm font-medium text-surface-200/80 mb-3">
                        이름으로 검색하여 로그인하세요
                    </label>
                    <div className="relative">
                        <svg
                            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-200/40"
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="테스터 이름 입력..."
                            className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-surface-200/30 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all"
                        />
                    </div>

                    {/* User List */}
                    <div className="mt-4 max-h-72 overflow-y-auto space-y-2">
                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="w-6 h-6 border-2 border-primary-400/30 border-t-primary-400 rounded-full animate-spin" />
                            </div>
                        ) : users.length === 0 ? (
                            <p className="text-center text-surface-200/40 py-8 text-sm">
                                {query ? "검색 결과가 없습니다" : "유저를 불러오는 중..."}
                            </p>
                        ) : (
                            users.map((user, index) => (
                                <button
                                    key={user.id}
                                    onClick={() => handleSelectUser(user.id)}
                                    className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/3 hover:bg-white/8 border border-transparent hover:border-white/10 transition-all duration-200 group"
                                    style={{ animationDelay: `${index * 50}ms` }}
                                >
                                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center border border-white/5">
                                        <span className="text-sm font-bold text-primary-300">
                                            {user.name.charAt(0)}
                                        </span>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-sm font-medium text-white/90 group-hover:text-white transition-colors">
                                            {user.name}
                                        </p>
                                    </div>
                                    <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${groupColors[user.group] || ""}`}>
                                        {user.group}그룹
                                    </span>
                                    <svg className="w-4 h-4 text-white/20 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Admin Link */}
                <div className="mt-6 text-center">
                    <a
                        href="/admin"
                        className="text-sm text-surface-200/40 hover:text-primary-400 transition-colors"
                    >
                        관리자 대시보드 →
                    </a>
                </div>
            </div>
        </main>
    );
}
