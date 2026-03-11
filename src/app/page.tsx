"use client";

import { useState, useEffect } from "react";
import toast, { Toaster } from "react-hot-toast";

interface User {
    id: string;
    name: string;
    group: string;
    display_name: string;
    label: string;
    full_name: string;
}

const GROUPS = ["A", "B", "C", "D", "E"];
const GROUP_COLORS: Record<string, { bg: string; border: string; text: string; active: string }> = {
    A: { bg: "from-blue-500/20 to-blue-600/10", border: "border-blue-500/30", text: "text-blue-300", active: "bg-blue-500" },
    B: { bg: "from-purple-500/20 to-purple-600/10", border: "border-purple-500/30", text: "text-purple-300", active: "bg-purple-500" },
    C: { bg: "from-emerald-500/20 to-emerald-600/10", border: "border-emerald-500/30", text: "text-emerald-300", active: "bg-emerald-500" },
    D: { bg: "from-amber-500/20 to-amber-600/10", border: "border-amber-500/30", text: "text-amber-300", active: "bg-amber-500" },
    E: { bg: "from-rose-500/20 to-rose-600/10", border: "border-rose-500/30", text: "text-rose-300", active: "bg-rose-500" },
};

const GROUP_DAYS: Record<string, string> = {
    A: "월요일", B: "화요일", C: "수요일", D: "목요일", E: "금요일",
};

export default function HomePage() {
    const [selectedGroup, setSelectedGroup] = useState<string>("A");
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [editingUser, setEditingUser] = useState<string | null>(null);
    const [newName, setNewName] = useState("");

    useEffect(() => {
        fetchUsers(selectedGroup);
    }, [selectedGroup]);

    const fetchUsers = async (group: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/users?group=${group}`);
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
                fetchUsers(selectedGroup);
            } else {
                toast.error(data.error);
            }
        } catch {
            toast.error("이름 변경에 실패했습니다.");
        }
    };

    const colors = GROUP_COLORS[selectedGroup];

    return (
        <main className="min-h-screen min-h-[100dvh] p-4 md:p-8">
            <Toaster position="top-center" />
            <div className="max-w-lg mx-auto">
                {/* Header */}
                <header className="text-center mb-8 animate-fade-in">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl">🎯</span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-extrabold">
                        <span className="gradient-text">AI 훈련</span> 미션
                    </h1>
                    <p className="text-surface-200/60 text-sm mt-2">
                        그룹을 선택하고 본인의 이름을 찾아주세요
                    </p>
                </header>

                {/* Group Tabs */}
                <div className="flex gap-1.5 p-1.5 bg-white/3 rounded-2xl mb-6 animate-slide-up">
                    {GROUPS.map((g) => (
                        <button
                            key={g}
                            onClick={() => setSelectedGroup(g)}
                            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${
                                selectedGroup === g
                                    ? `${GROUP_COLORS[g].active} text-white shadow-lg scale-[1.02]`
                                    : "text-surface-200/50 hover:text-white hover:bg-white/5"
                            }`}
                        >
                            {g}
                            <span className="block text-[10px] font-normal opacity-70 mt-0.5">
                                {GROUP_DAYS[g]}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Group Info */}
                <div className={`glass-card p-4 mb-4 bg-gradient-to-r ${colors.bg} ${colors.border} animate-slide-up`}
                     style={{ animationDelay: "0.1s" }}>
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl ${colors.active} flex items-center justify-center font-bold text-white`}>
                            {selectedGroup}
                        </div>
                        <div>
                            <p className={`font-semibold ${colors.text}`}>{selectedGroup}그룹</p>
                            <p className="text-xs text-surface-200/50">
                                시작일: 매주 {GROUP_DAYS[selectedGroup]} · {users.length}명
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
                                                placeholder="새 이름 입력"
                                                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") handleRename(user.id);
                                                    if (e.key === "Escape") { setEditingUser(null); setNewName(""); }
                                                }}
                                            />
                                            <span className="text-surface-200/30 text-sm">_{user.label}</span>
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
                                                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${colors.bg} flex items-center justify-center text-sm font-semibold ${colors.text} flex-shrink-0`}>
                                                    {(user.display_name || "테")[0]}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-white/80 truncate">
                                                        {user.full_name || user.name}
                                                    </p>
                                                </div>
                                            </a>
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setEditingUser(user.id);
                                                    setNewName(user.display_name || "테스터");
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
