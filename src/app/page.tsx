"use client";

import { useState, useEffect } from "react";
import toast, { Toaster } from "react-hot-toast";

interface User {
    id: string;
    name: string;
    group: string;
    display_name: string;
    masked_name: string;
    label: string;
    full_name: string;
    completed_rounds: number;
}

export default function HomePage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState<string | null>(null);
    const [newName, setNewName] = useState("");

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/users");
            const data = await res.json();
            if (res.ok) {
                setUsers(data.users || []);
            }
        } catch {
            toast.error("유저 목록을 불러올 수 없습니다.");
        }
        setLoading(false);
    };

    const handleRename = async (userId: string) => {
        if (!newName.trim()) {
            toast.error("이름을 입력해 주세요.");
            return;
        }
        try {
            const res = await fetch("/api/users", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, displayName: newName.trim() }),
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(data.message);
                setEditingUser(null);
                setNewName("");
                fetchUsers();
            } else {
                toast.error(data.error);
            }
        } catch {
            toast.error("이름 변경에 실패했습니다.");
        }
    };

    return (
        <main className="min-h-screen min-h-[100dvh] p-4 md:p-8">
            <Toaster position="top-center" />
            <div className="max-w-lg mx-auto">
                {/* Header — 설야갈비 AI 서포터즈 */}
                <header className="text-center mb-8 animate-fade-in">
                    <div className="w-24 h-24 rounded-2xl overflow-hidden mx-auto mb-5 shadow-lg shadow-orange-500/20 ring-2 ring-orange-400/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/seolya-galbi.png"
                            alt="설야갈비"
                            className="w-full h-full object-cover"
                        />
                    </div>
                    <h1 className="text-2xl md:text-3xl font-extrabold">
                        <span style={{ background: "linear-gradient(to right, #FFD700, #FF6B35, #FF4500)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                            설야갈비
                        </span>{" "}
                        <span className="text-white/90">AI 서포터즈</span>
                    </h1>
                    <p className="text-surface-200/60 text-sm mt-3 leading-relaxed">
                        GPT에게 진짜 갈비맛을 알려줄 시간! 🔥
                        <br />
                        <span className="text-surface-200/50">
                            먼저 본인의 이름을 선택해 주세요.
                            <br />
                            그리고 단계별 미션을 수행해 주세요.
                        </span>
                    </p>
                </header>

                {/* Info Card */}
                <div className="glass-card p-4 mb-4 bg-gradient-to-r from-orange-500/15 to-amber-500/10 border-orange-500/20 animate-slide-up"
                     style={{ animationDelay: "0.1s" }}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center font-bold text-white text-lg">
                            🥩
                        </div>
                        <div>
                            <p className="font-semibold text-orange-300">서포터즈 목록</p>
                            <p className="text-xs text-surface-200/50">
                                총 {users.length}명 · 이름을 클릭하면 미션 페이지로 이동합니다
                            </p>
                        </div>
                    </div>
                </div>

                {/* User List */}
                <div className="glass-card overflow-hidden animate-slide-up" style={{ animationDelay: "0.15s" }}>
                    {loading ? (
                        <div className="p-8 text-center">
                            <div className="w-8 h-8 border-2 border-primary-400/30 border-t-primary-400 rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-surface-200/50 text-sm">로딩 중...</p>
                        </div>
                    ) : users.length === 0 ? (
                        <div className="p-8 text-center">
                            <p className="text-surface-200/40 text-sm">유저가 없습니다.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {users.map((user, i) => (
                                <div
                                    key={user.id}
                                    className="p-3.5 hover:bg-white/3 transition-colors"
                                    style={{ animationDelay: `${i * 20}ms` }}
                                >
                                    {editingUser === user.id ? (
                                        /* Edit Mode */
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={newName}
                                                onChange={(e) => setNewName(e.target.value)}
                                                placeholder="본인의 풀네임을 입력해 주세요"
                                                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") handleRename(user.id);
                                                    if (e.key === "Escape") { setEditingUser(null); setNewName(""); }
                                                }}
                                            />
                                            <button
                                                onClick={() => handleRename(user.id)}
                                                className="px-3 py-2 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-500 transition-colors"
                                            >
                                                확인
                                            </button>
                                            <button
                                                onClick={() => { setEditingUser(null); setNewName(""); }}
                                                className="px-3 py-2 bg-white/5 text-surface-200/50 text-xs rounded-lg hover:bg-white/10 transition-colors"
                                            >
                                                취소
                                            </button>
                                        </div>
                                    ) : (
                                        /* Normal Mode */
                                        <div className="flex items-center justify-between">
                                            <a
                                                href={`/dashboard/${user.id}`}
                                                className="flex items-center gap-3 flex-1 min-w-0"
                                            >
                                                {/* Number badge */}
                                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-600/10 flex items-center justify-center text-sm font-semibold text-orange-300 flex-shrink-0 border border-orange-500/20">
                                                    {i + 1}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium text-white/80 truncate">
                                                        {user.full_name || user.name}
                                                    </p>
                                                </div>
                                                {/* Progress badge */}
                                                <span className={`flex-shrink-0 text-xs font-semibold px-2 py-1 rounded-lg ${
                                                    user.completed_rounds >= 5
                                                        ? "bg-accent-500/20 text-accent-400 border border-accent-500/30"
                                                        : user.completed_rounds > 0
                                                            ? "bg-primary-500/15 text-primary-300 border border-primary-500/20"
                                                            : "bg-white/5 text-surface-200/40 border border-white/5"
                                                }`}>
                                                    {user.completed_rounds}/5
                                                </span>
                                            </a>
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setEditingUser(user.id);
                                                    setNewName(user.display_name || "");
                                                }}
                                                className="ml-2 p-2 text-surface-200/30 hover:text-primary-400 transition-colors flex-shrink-0"
                                                title="이름 변경"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Admin Link */}
                <div className="text-center mt-8 animate-fade-in" style={{ animationDelay: "0.3s" }}>
                    <a
                        href="/admin"
                        className="text-xs text-surface-200/30 hover:text-primary-400 transition-colors"
                    >
                        관리자 페이지 →
                    </a>
                </div>
            </div>
        </main>
    );
}
