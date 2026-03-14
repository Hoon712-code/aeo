/**
 * Debug script: Open ChatGPT via Korean residential proxy and capture what the page looks like.
 * This helps us understand why the proxy page is different from the direct page.
 */
import { chromium } from "playwright";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const PROXY_HOST = process.env.PROXY_HOST || "p.webshare.io";
const PROXY_PORT = parseInt(process.env.PROXY_PORT || "80", 10);
const PROXY_USERNAME = process.env.PROXY_USERNAME || "";
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || "";
const PROXY_COUNTRY = process.env.PROXY_COUNTRY || "KR";

async function main() {
  const username = `${PROXY_USERNAME}-${PROXY_COUNTRY}-1`;
  
  console.log(`🔒 프록시로 ChatGPT 접속 테스트`);
  console.log(`   프록시: ${username} @ ${PROXY_HOST}:${PROXY_PORT}`);
  
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--no-sandbox",
    ],
    proxy: {
      server: `http://${PROXY_HOST}:${PROXY_PORT}`,
      username: username,
      password: PROXY_PASSWORD,
    },
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });

  // Inject stealth scripts
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    (window as unknown as Record<string, unknown>).chrome = { runtime: {} };
  });

  const page = await context.newPage();
  
  console.log(`\n📎 ChatGPT 접속 중...`);
  await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
  
  // Wait for page to settle
  await new Promise(r => setTimeout(r, 8000));
  
  // Take screenshot
  const ssPath = path.resolve(__dirname, "../../debug-proxy-page.png");
  await page.screenshot({ path: ssPath, fullPage: true });
  console.log(`📸 스크린샷 저장: ${ssPath}`);
  
  // Get page title
  const title = await page.title();
  console.log(`📄 페이지 제목: ${title}`);
  
  // Get page URL (might have redirected)
  console.log(`🔗 현재 URL: ${page.url()}`);
  
  // Check key elements
  const checks = [
    { name: "div#prompt-textarea", sel: "div#prompt-textarea" },
    { name: "textarea", sel: "textarea" },
    { name: "#prompt-textarea (any)", sel: "#prompt-textarea" },
    { name: "ProseMirror", sel: ".ProseMirror" },
    { name: "contenteditable", sel: "[contenteditable='true']" },
    { name: "send button (id)", sel: "button#composer-submit-button" },
    { name: "send button (testid)", sel: "button[data-testid='send-button']" },
    { name: "Cloudflare challenge", sel: "iframe[title*='challenge']" },
    { name: "cf-stage", sel: "#cf-stage" },
    { name: "cf-turnstile", sel: "[class*='cf-turnstile']" },
    { name: "login form", sel: "form[action*='auth']" },
    { name: "Stay logged out", sel: "button:has-text('Stay logged out')" },
    { name: "sign up/login button", sel: "button:has-text('Sign up')" },
    { name: "verify human", sel: ":has-text('Verify you are human')" },
  ];
  
  console.log(`\n🔍 DOM 요소 검사:`);
  for (const check of checks) {
    const found = await page.$(check.sel);
    console.log(`  ${found ? "✅" : "❌"} ${check.name} (${check.sel})`);
  }
  
  // Get all visible text (first 500 chars)
  const bodyText = await page.evaluate(() => {
    return document.body?.innerText?.substring(0, 1000) || "(empty)";
  });
  console.log(`\n📝 페이지 텍스트 (미리보기):\n${bodyText}`);
  
  // Keep browser open for 30 seconds for manual inspection
  console.log(`\n⏳ 30초 동안 브라우저 열어두기 (직접 확인 가능)...`);
  await new Promise(r => setTimeout(r, 30000));
  
  await browser.close();
  console.log(`✅ 완료`);
}

main().catch(console.error);
