"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import type { UserDashboardData } from "@/lib/types";

const AI_LINKS: Record<string, string> = {
    ChatGPT: "https://chat.openai.com",
    Gemini: "https://gemini.google.com",
    Claude: "https://claude.ai",
};

export default function DashboardPage() {
    const params = useParams();
    const userId = params.userId as string;
    const [data, setData] = useState<UserDashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [snippet, setSnippet] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [copied, setCopied] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch(`/api/missions?userId=${userId}`);
            const result = await res.json();
            if (res.ok) {
                setData(result);
            } else {
                toast.error(result.error || "데이터를 불러올 수 없습니다.");
            }
        } catch {
            toast.error("서버에 연결할 수 없습니다.");
        }
        setLoading(false);
    }, [userId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCopy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            toast.success("프롬프트가 복사되었습니다!");
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("복사에 실패했습니다.");
        }
    };

    const handleSubmit = async () => {
        if (!snippet.trim()) {
            toast.error("AI 답변 내용을 입력해 주세요.");
            return;
        }
        if (snippet.trim().length < 5) {
            toast.error("AI 답변 내용이 너무 짧습니다. 최소 5자 이상 입력해 주세요.");
            return;
        }
        if (!data?.mission) return;

        setSubmitting(true);
        try {
            const res = await fetch("/api/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    missionId: data.mission.id,
                    aiResponseSnippet: snippet.trim(),
                }),
            });
            const result = await res.json();
            if (res.ok) {
                toast.success(result.message || "미션 완료! 🎉");
                setSnippet("");
                fetchData();
            } else {
                toast.error(result.error || "제출에 실패했습니다.");
            }
        } catch {
            toast.error("서버에 연결할 수 없습니다.");
        }
        setSubmitting(false);
    };

    if (loading) {
        return (
            <main className="min-h-screen flex items-center justify-center">
                <div className="text-center animate-fade-in">
                    <div className="w-12 h-12 border-3 border-primary-400/30 border-t-primary-400 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-surface-200/60 text-sm">미션 정보를 불러오는 중...</p>
                </div>
            </main>
        );
    }

    if (!data) {
        return (
            <main className="min-h-screen flex items-center justify-center p-4">
                <div className="glass-card p-8 max-w-md text-center animate-slide-up">
                    <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                    </div>
                    <h2 className="text-lg font-bold mb-2">유저를 찾을 수 없습니다</h2>
                    <p className="text-surface-200/60 text-sm mb-4">올바른 링크인지 확인해 주세요.</p>
                    <a href="/" className="gradient-btn inline-block text-sm">홈으로 돌아가기</a>
                </div>
            </main>
        );
    }

    const progressPercent = data.totalMissions > 0
        ? Math.round((data.completedCount / data.totalMissions) * 100)
        : 0;

    return (
        <main className="min-h-screen p-4 md:p-8">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <header className="mb-8 animate-fade-in">
                    <a href="/" className="inline-flex items-center gap-2 text-sm text-surface-200/40 hover:text-primary-400 transition-colors mb-6">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                        홈으로
                    </a>
                    <h1 className="text-2xl md:text-3xl font-extrabold">
                        안녕하세요, <span className="gradient-text">{data.user.name}</span>님!
                    </h1>
                    <p className="text-surface-200/60 mt-2">오늘의 AI 훈련 미션입니다.</p>
                </header>

                {/* Progress Card */}
                <div className="glass-card p-5 mb-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-primary-500/20 text-primary-300 border border-primary-500/30">
                                {data.user.group}그룹
                            </span>
                            <span className="text-sm text-surface-200/60">
                                전체 진행률
                            </span>
                        </div>
                        <span className="text-sm font-semibold text-white/80">
                            {data.completedCount}/{data.totalMissions}
                        </span>
                    </div>
                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full transition-all duration-700 ease-out"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </div>

                {/* Rest Day Card */}
                {!data.isActive && (
                    <div className="glass-card p-8 text-center animate-slide-up" style={{ animationDelay: "0.2s" }}>
                        <div className="w-20 h-20 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-5">
                            <span className="text-4xl">☕</span>
                        </div>
                        <h2 className="text-xl font-bold mb-2">오늘은 휴식일입니다</h2>
                        <p className="text-surface-200/60 text-sm leading-relaxed mb-5">
                            다음 활동일은 <span className="text-amber-400 font-semibold">{data.nextActiveDay}</span>입니다.
                            <br />편히 쉬고 다시 접속해 주세요!
                        </p>
                        <div className="inline-flex items-center gap-2 text-xs text-surface-200/30 bg-white/3 px-4 py-2 rounded-xl">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            완료한 미션: {data.completedCount}개
                        </div>
                    </div>
                )}

                {/* Already Completed Today */}
                {data.isActive && data.hasCompletedToday && (
                    <div className="glass-card p-8 text-center animate-slide-up" style={{ animationDelay: "0.2s" }}>
                        <div className="w-20 h-20 rounded-2xl bg-accent-500/10 flex items-center justify-center mx-auto mb-5">
                            <span className="text-4xl">✅</span>
                        </div>
                        <h2 className="text-xl font-bold mb-2 text-accent-400">오늘 미션을 완료했습니다!</h2>
                        <p className="text-surface-200/60 text-sm leading-relaxed">
                            수고하셨습니다. 내일 새로운 미션이 대기하고 있습니다.
                        </p>
                    </div>
                )}

                {/* All Missions Complete */}
                {data.isActive && !data.hasCompletedToday && !data.mission && (
                    <div className="glass-card p-8 text-center animate-slide-up" style={{ animationDelay: "0.2s" }}>
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center mx-auto mb-5">
                            <span className="text-4xl">🏆</span>
                        </div>
                        <h2 className="text-xl font-bold mb-2 gradient-text">모든 미션을 완료했습니다!</h2>
                        <p className="text-surface-200/60 text-sm leading-relaxed">
                            모든 AI 훈련 미션을 성공적으로 완료했습니다. 감사합니다!
                        </p>
                    </div>
                )}

                {/* Active Mission Card */}
                {data.isActive && !data.hasCompletedToday && data.mission && (
                    <div className="space-y-5 animate-slide-up" style={{ animationDelay: "0.2s" }}>
                        {/* Mission Info */}
                        <div className="glass-card p-6">
                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
                                    <span className="text-sm font-bold">{data.mission.week}-{data.mission.step}</span>
                                </div>
                                <div>
                                    <h2 className="font-bold text-white/90">{data.mission.week}주차 {data.mission.step}스텝</h2>
                                    <p className="text-xs text-surface-200/50">미션 카드</p>
                                </div>
                            </div>

                            {/* Target AI */}
                            <div className="mb-5">
                                <label className="text-xs font-medium text-surface-200/50 uppercase tracking-wider mb-2 block">
                                    접속할 AI
                                </label>
                                <a
                                    href={AI_LINKS[data.mission.target_ai] || AI_LINKS.ChatGPT}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="gradient-btn inline-flex items-center gap-2 text-sm"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                    {data.mission.target_ai} 열기
                                </a>
                            </div>

                            {/* Instruction */}
                            <div className="mb-5">
                                <label className="text-xs font-medium text-surface-200/50 uppercase tracking-wider mb-2 block">
                                    오늘의 지령
                                </label>
                                <div className="bg-primary-500/5 border border-primary-500/20 rounded-xl p-4">
                                    <p className="text-sm text-white/80 leading-relaxed">
                                        {data.mission.instruction}
                                    </p>
                                    <p className="text-xs text-surface-200/40 mt-2">
                                        💡 괄호 안의 내용은 본인 상황에 맞게 조금씩 바꿔서 자연스럽게 물어보세요.
                                    </p>
                                </div>
                            </div>

                            {/* Prompt Template */}
                            <div>
                                <label className="text-xs font-medium text-surface-200/50 uppercase tracking-wider mb-2 block">
                                    참고 프롬프트
                                </label>
                                <div className="relative bg-white/3 border border-white/10 rounded-xl p-4 group">
                                    <p className="text-sm text-white/70 leading-relaxed pr-16">
                                        {data.mission.prompt_template}
                                    </p>
                                    <button
                                        onClick={() => handleCopy(data.mission!.prompt_template)}
                                        className="absolute top-3 right-3 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-surface-200/60 hover:text-white transition-all"
                                    >
                                        {copied ? (
                                            <>
                                                <svg className="w-3.5 h-3.5 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                                복사됨
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                                                </svg>
                                                복사
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Submission Form */}
                        <div className="glass-card p-6">
                            <h3 className="font-bold text-white/90 mb-1">인증하기</h3>
                            <p className="text-xs text-surface-200/50 mb-4">
                                AI가 대답한 내용 중 &lsquo;설야 갈비&rsquo;가 포함된 문장을 한 줄만 복사해서 붙여넣어 주세요.
                            </p>
                            <textarea
                                value={snippet}
                                onChange={(e) => setSnippet(e.target.value)}
                                placeholder="AI의 답변 내용을 여기에 붙여넣어 주세요..."
                                rows={4}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-surface-200/30 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all resize-none text-sm"
                            />
                            <button
                                onClick={handleSubmit}
                                disabled={submitting || !snippet.trim()}
                                className="gradient-btn success-btn w-full mt-4 flex items-center justify-center gap-2 text-sm"
                            >
                                {submitting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        제출 중...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        오늘의 임무 완료
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
