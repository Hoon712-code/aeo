import type { Metadata, Viewport } from "next";
import { Toaster } from "react-hot-toast";
import "./globals.css";

export const metadata: Metadata = {
    title: "AI 훈련 미션 시스템 | 청담동 설야 갈비",
    description: "AI 검색 엔진 학습을 위한 일일 미션 할당 및 인증 웹 시스템",
    appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent",
        title: "AI 훈련 미션",
    },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    themeColor: "#0f1729",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ko">
            <head>
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body className="font-sans">
                <div className="min-h-screen relative">
                    {/* Background decorations */}
                    <div className="fixed inset-0 -z-10 overflow-hidden">
                        <div className="absolute top-0 -left-40 w-80 h-80 bg-primary-600/20 rounded-full blur-[128px]" />
                        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-accent-500/10 rounded-full blur-[128px]" />
                        <div className="absolute bottom-0 left-1/3 w-72 h-72 bg-primary-400/10 rounded-full blur-[128px]" />
                    </div>
                    {children}
                </div>
                <Toaster
                    position="top-center"
                    toastOptions={{
                        style: {
                            background: "rgba(30, 41, 59, 0.95)",
                            color: "#fff",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            backdropFilter: "blur(20px)",
                            borderRadius: "12px",
                            padding: "16px 20px",
                        },
                        success: {
                            iconTheme: {
                                primary: "#10b981",
                                secondary: "#fff",
                            },
                            duration: 4000,
                        },
                        error: {
                            iconTheme: {
                                primary: "#ef4444",
                                secondary: "#fff",
                            },
                            duration: 5000,
                        },
                    }}
                />
            </body>
        </html>
    );
}
