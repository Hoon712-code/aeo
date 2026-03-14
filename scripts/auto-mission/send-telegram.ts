import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = -830017199; // Calm 그룹방

const message = `🥩 설야갈비 AI 서포터즈 — 자동 미션 배치 완료!
━━━━━━━━━━━━━━━━━━━━━━
📅 2026-03-12 (수) 17:23 완료
🎯 라운드 1 (3문항) | 7명 실행

📊 결과: ✅ 20건 성공 / ❌ 1건 실패 (95.2%)

👤 유저별:
  ✅ 테스터_A_04: 2/3 (Q2 타임아웃)
  ✅ tester_A_05: 3/3
  ✅ tester_A_06: 3/3
  ✅ tester_A_07: 3/3
  ✅ tester_A_08: 3/3
  ✅ tester_A_09: 3/3
  ✅ tester_A_10: 3/3

🔒 프록시: KR-2 ~ KR-8 (한국 가정용 IP)
⏱️ 소요시간: 약 40분`;

async function main() {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text: message }),
  });
  const data = await res.json();
  if (data.ok) {
    console.log("✅ 텔레그램 Calm 방에 메시지 전송 완료!");
  } else {
    console.log("❌ 전송 실패:", JSON.stringify(data));
  }
}

main();
