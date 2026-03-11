"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import toast, { Toaster } from "react-hot-toast";

interface Mission {
    id: number;
    round: number;
    step: number;
    target_ai: string;
    instruction: string;
    prompt_template: string;
    completed: boolean;
    personalizedPrompt: string;
}

interface DashboardData {
    user: { id: string; name: string; group: string; display_name: string; label: string };
    currentRound: number;
    currentStep: number;
    mission: Mission | null;
    personalizedPrompt: string;
    roundAvailableDate: string | null;
    isAvailable: boolean;
    waitMessage: string;
    completedRounds: number;
    completedSteps: number;
    totalSteps: number;
    allComplete: boolean;
    todayCompletedSteps?: number;
    roundMissions?: Mission[];
}

const ROUND_THEMES: Record<number, { emoji: string; label: string; color: string }> = {
    1: { emoji: "🟢", label: "첫인상 — 맛집 탐색", color: "from-green-500/20 to-green-600/10 border-green-500/30" },
    2: { emoji: "🔵", label: "심화 — 구체적 정보", color: "from-blue-500/20 to-blue-600/10 border-blue-500/30" },
    3: { emoji: "🟣", label: "확장 — 코스 구성", color: "from-purple-500/20 to-purple-600/10 border-purple-500/30" },
    4: { emoji: "🟠", label: "평판 — 후기/리뷰", color: "from-amber-500/20 to-amber-600/10 border-amber-500/30" },
    5: { emoji: "🔴", label: "정착 — 추천/재방문", color: "from-rose-500/20 to-rose-600/10 border-rose-500/30" },
};

export default function DashboardPage() {
    const params = useParams();
    const userId = params.userId as string;
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [snippet, setSnippet] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [copied, setCopied] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch(`/api/missions?userId=${userId}`);
            const result = await res.json();
            if (res.ok) setData(result);
            else toast.error(result.error || "데이터를 불러올 수 없습니다.");
        } catch {
            toast.error("서버에 연결할 수 없습니다.");
        }
        setLoading(false);
    }, [userId]);

    useEffect(() => { fetchData(); }, [fetchData]);

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

    const handleSubmit = async (missionId: number, isLastStep: boolean) => {
        if (isLastStep && !snippet.trim()) {
            toast.error("AI 답변을 붙여넣어 주세요.");
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch("/api/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    missionId,
                    aiResponseSnippet: isLastStep ? snippet.trim() : null,
                    isLastStep,
                }),
            });
            const result = await res.json();
            if (res.ok) {
                toast.success(result.message);
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
            <main className="min-h-screen min-h-[100dvh] flex items-center justify-center">
                <Toaster position="top-center" />
                <div className="text-center animate-fade-in">
                    <div className="w-12 h-12 border-3 border-primary-400/30 border-t-primary-400 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-surface-200/60 text-sm">미션 정보를 불러오는 중...</p>
                </div>
            </main>
        );
    }

    if (!data) {
        return (
            <main className="min-h-screen min-h-[100dvh] flex items-center justify-center p-4">
                <Toaster position="top-center" />
                <div className="glass-card p-8 max-w-md text-center animate-slide-up">
                    <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">⚠️</span>
                    </div>
                    <h2 className="text-lg font-bold mb-2">유저를 찾을 수 없습니다</h2>
                    <a href="/" className="gradient-btn inline-block text-sm mt-4">홈으로 돌아가기</a>
                </div>
            </main>
        );
    }

    // Mask the middle character(s) of a name: 홍정의 → 홍*의
    const maskName = (name: string) => {
        if (!name || name.length <= 1) return name;
        if (name.length === 2) return name[0] + "*";
        return name[0] + "*".repeat(name.length - 2) + name[name.length - 1];
    };
    const rawName = data.user.display_name || "테스터";
    const maskedName = rawName === "테스터" ? rawName : maskName(rawName);
    const fullName = data.user.label
        ? `${maskedName}_${data.user.label}`
        : data.user.name;
    const progressPercent = data.totalSteps > 0
        ? Math.round((data.completedSteps / data.totalSteps) * 100)
        : 0;
    const theme = ROUND_THEMES[data.currentRound] || ROUND_THEMES[1];
    const roundMissions = data.roundMissions || [];
    const currentMission = roundMissions.find((m) => !m.completed);
    const isLastStep = currentMission?.step === 3;

    return (
        <main className="min-h-screen min-h-[100dvh] p-4 md:p-8">
            <Toaster position="top-center" />
            <div className="max-w-lg mx-auto">
                {/* Header */}
                <header className="mb-6 animate-fade-in">
                    <a href="/" className="inline-flex items-center gap-2 text-sm text-surface-200/40 hover:text-primary-400 transition-colors mb-4">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                        홈으로
                    </a>
                    <h1 className="text-xl md:text-2xl font-extrabold">
                        안녕하세요, <span className="gradient-text">{fullName}</span>님!
                    </h1>
                </header>

                {/* Progress Card */}
                <div className="glass-card p-4 mb-5 animate-slide-up" style={{ animationDelay: "0.1s" }}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-surface-200/60">전체 진행률</span>
                        </div>
                        <span className="text-sm font-semibold text-white/80">
                            {data.completedSteps}/{data.totalSteps}
                        </span>
                    </div>
                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full transition-all duration-700"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    {/* Round dots */}
                    <div className="flex justify-between mt-3">
                        {[1, 2, 3, 4, 5].map((r) => (
                            <div key={r} className="flex flex-col items-center gap-1">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                    r <= data.completedRounds
                                        ? "bg-accent-500 text-white"
                                        : r === data.currentRound
                                            ? "bg-primary-500/30 text-primary-300 ring-2 ring-primary-500/50"
                                            : "bg-white/5 text-surface-200/30"
                                }`}>
                                    {r <= data.completedRounds ? "✓" : r}
                                </div>
                                <span className="text-[10px] text-surface-200/30">R{r}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* All Complete */}
                {data.allComplete && (
                    <div className="glass-card p-8 text-center animate-slide-up" style={{ animationDelay: "0.2s" }}>
                        <span className="text-5xl block mb-4">🏆</span>
                        <h2 className="text-xl font-bold mb-2 gradient-text">모든 미션을 완료했습니다!</h2>
                        <p className="text-surface-200/60 text-sm">5라운드 15개 미션을 모두 성공적으로 완료했습니다. 감사합니다!</p>
                    </div>
                )}

                {/* Waiting for round */}
                {!data.allComplete && !data.isAvailable && (
                    <div className="glass-card p-8 text-center animate-slide-up" style={{ animationDelay: "0.2s" }}>
                        <span className="text-5xl block mb-4">⏳</span>
                        <h2 className="text-lg font-bold mb-2">다음 라운드 대기 중</h2>
                        <p className="text-surface-200/60 text-sm leading-relaxed mb-4">
                            {data.waitMessage}
                        </p>
                        <div className="inline-flex items-center gap-2 text-xs text-surface-200/30 bg-white/3 px-4 py-2 rounded-xl">
                            완료한 단계: {data.completedSteps}/{data.totalSteps}
                        </div>
                    </div>
                )}

                {/* Active Mission */}
                {!data.allComplete && data.isAvailable && (
                    <div className="space-y-4 animate-slide-up" style={{ animationDelay: "0.2s" }}>
                        {/* Round Header */}
                        <div className={`glass-card p-4 bg-gradient-to-r ${theme.color}`}>
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">{theme.emoji}</span>
                                <div>
                                    <h2 className="font-bold text-white/90">{data.currentRound}라운드</h2>
                                    <p className="text-xs text-surface-200/50">{theme.label}</p>
                                </div>
                            </div>
                        </div>

                        {/* Step Progress Bar */}
                        <div className="glass-card p-4">
                            <p className="text-xs text-surface-200/50 mb-3">오늘의 미션 진행도</p>
                            <div className="flex gap-2">
                                {[1, 2, 3].map((s) => {
                                    const mission = roundMissions.find((m) => m.step === s);
                                    const isDone = mission?.completed;
                                    const isCurrent = !isDone && (!roundMissions.find((m) => m.step === s - 1) || roundMissions.find((m) => m.step === s - 1)?.completed);
                                    return (
                                        <div key={s} className="flex-1">
                                            <div className={`h-2 rounded-full transition-all duration-500 ${
                                                isDone
                                                    ? "bg-accent-500"
                                                    : isCurrent
                                                        ? "bg-primary-500/50 animate-pulse"
                                                        : "bg-white/5"
                                            }`} />
                                            <p className={`text-center text-[10px] mt-1 ${
                                                isDone ? "text-accent-400" : isCurrent ? "text-primary-300" : "text-surface-200/20"
                                            }`}>
                                                {isDone ? "✓ 완료" : `${s}/3`}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Current Mission Card */}
                        {currentMission && (
                            <div className="glass-card p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
                                        <span className="text-sm font-bold">{currentMission.step}/3</span>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white/90">
                                            질문 {currentMission.step}/3
                                        </h3>
                                        <p className="text-xs text-surface-200/50">
                                            {currentMission.step === 3 ? "마지막 질문 — 답변 인증 필요" : "ChatGPT에 질문하세요"}
                                        </p>
                                    </div>
                                </div>

                                {/* Instruction */}
                                <div className="mb-4">
                                    <label className="text-xs font-medium text-surface-200/50 uppercase tracking-wider mb-2 block">
                                        오늘의 지령
                                    </label>
                                    <div className="bg-primary-500/5 border border-primary-500/20 rounded-xl p-3">
                                        <p className="text-sm text-white/80 leading-relaxed">
                                            {currentMission.instruction}
                                        </p>
                                    </div>
                                </div>

                                {/* ChatGPT Link */}
                                <div className="mb-4">
                                    <a
                                        href="https://chat.openai.com"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="gradient-btn inline-flex items-center gap-2 text-sm"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                        ChatGPT 열기
                                    </a>
                                </div>

                                {/* Prompt Template */}
                                <div className="mb-4">
                                    <label className="text-xs font-medium text-surface-200/50 uppercase tracking-wider mb-2 block">
                                        참고 프롬프트
                                    </label>
                                    <div className="relative bg-white/3 border border-white/10 rounded-xl p-3 group">
                                        <p className="text-sm text-white/70 leading-relaxed pr-14">
                                            {currentMission.personalizedPrompt || currentMission.prompt_template}
                                        </p>
                                        <button
                                            onClick={() => handleCopy(currentMission.personalizedPrompt || currentMission.prompt_template)}
                                            className="absolute top-2.5 right-2.5 flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-surface-200/60 hover:text-white transition-all"
                                        >
                                            {copied ? (
                                                <><svg className="w-3.5 h-3.5 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>복사됨</>
                                            ) : (
                                                <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>복사</>
                                            )}
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-surface-200/30 mt-1.5">
                                        💡 위 프롬프트를 복사하여 ChatGPT에 입력하세요. 조금씩 바꿔서 자연스럽게 물어봐도 됩니다.
                                    </p>
                                </div>

                                {/* Submit Section */}
                                {isLastStep ? (
                                    <div className="border-t border-white/5 pt-4">
                                        <h4 className="font-semibold text-white/90 mb-1 text-sm">📋 인증하기</h4>
                                        <p className="text-[11px] text-surface-200/40 mb-3">
                                            ChatGPT의 마지막 답변 하단에 있는 <strong className="text-surface-200/60">📄 복사하기</strong> 버튼을 눌러 전체 답변을 복사한 뒤, 아래 입력란에 붙여넣어 주세요.
                                        </p>
                                        <textarea
                                            value={snippet}
                                            onChange={(e) => setSnippet(e.target.value)}
                                            placeholder="ChatGPT의 답변을 여기에 붙여넣어 주세요..."
                                            rows={4}
                                            className="w-full px-3.5 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-surface-200/30 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all resize-none text-sm"
                                        />
                                        <button
                                            onClick={() => handleSubmit(currentMission.id, true)}
                                            disabled={submitting || !snippet.trim()}
                                            className="gradient-btn success-btn w-full mt-3 flex items-center justify-center gap-2 text-sm"
                                        >
                                            {submitting ? (
                                                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />제출 중...</>
                                            ) : (
                                                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>라운드 완료</>
                                            )}
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleSubmit(currentMission.id, false)}
                                        disabled={submitting}
                                        className="gradient-btn w-full flex items-center justify-center gap-2 text-sm"
                                    >
                                        {submitting ? (
                                            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />처리 중...</>
                                        ) : (
                                            <>질문 완료 → 다음 단계로</>
                                        )}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* All steps in this round are done */}
                        {!currentMission && roundMissions.every((m) => m.completed) && (
                            <div className="glass-card p-8 text-center">
                                <span className="text-4xl block mb-3">✅</span>
                                <h2 className="text-lg font-bold mb-2 text-accent-400">
                                    {data.currentRound}라운드 완료!
                                </h2>
                                <p className="text-surface-200/60 text-sm">
                                    수고하셨습니다. 다음 라운드가 곧 열립니다.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
