import { chromium } from "playwright";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

async function main() {
  const host = process.env.PROXY_HOST || "p.webshare.io";
  const port = process.env.PROXY_PORT || "80";
  const user = process.env.PROXY_USERNAME || "";
  const pass = process.env.PROXY_PASSWORD || "";
  const country = process.env.PROXY_COUNTRY || "KR";
  const username = `${user}-${country}-1`;

  console.log(`\n=== Proxy Quick Test ===`);
  console.log(`Proxy: ${username}@${host}:${port}\n`);

  try {
    const browser = await chromium.launch({
      headless: true,
      proxy: {
        server: `http://${host}:${port}`,
        username,
        password: pass,
      },
    });

    const page = await browser.newPage();

    // Test 1: Simple HTTP
    console.log("1. Testing httpbin.org/ip ...");
    try {
      await page.goto("https://httpbin.org/ip", { timeout: 15000 });
      const text = await page.textContent("body");
      console.log(`   ✅ OK: ${text?.trim()}`);
    } catch (e: any) {
      console.log(`   ❌ FAIL: ${e.message?.split("\n")[0]}`);
    }

    // Test 2: ChatGPT
    console.log("2. Testing chatgpt.com ...");
    try {
      await page.goto("https://chatgpt.com/", { timeout: 20000, waitUntil: "domcontentloaded" });
      console.log(`   ✅ OK: status=${page.url()}, title=${await page.title()}`);
    } catch (e: any) {
      console.log(`   ❌ FAIL: ${e.message?.split("\n")[0]}`);
    }

    await browser.close();
    console.log("\nDone.");
  } catch (e: any) {
    console.log(`\n❌ Browser launch error: ${e.message}`);
  }
}

main();
