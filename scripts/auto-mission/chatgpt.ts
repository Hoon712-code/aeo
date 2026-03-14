import { Page } from "playwright";
import { CHATGPT_URL, TIMING } from "./config";
import {
  randomDelay,
  randomMouseMovement,
  microPause,
  simulateReading,
  idleMouseMovement,
  scrollToReadFully,
  realisticMouseMove,
  log,
  randInt,
} from "./human-behavior";

/**
 * Close the ChatGPT sidebar if it's open (it intercepts click events on the textarea).
 */
async function closeSidebar(page: Page): Promise<void> {
  try {
    const sidebarToggleSelectors = [
      'button[aria-label="사이드바 닫기"]',
      'button[aria-label="Close sidebar"]',
      'button[aria-label*="sidebar"]',
      'button[aria-label*="Sidebar"]',
    ];

    for (const sel of sidebarToggleSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click({ force: true });
        log("  📌 사이드바 닫기 완료");
        await randomDelay(500, 1000);
        return;
      }
    }

    // Alternative: Hide sidebar via JS
    await page.evaluate(() => {
      const sidebar = document.querySelector('nav') as HTMLElement;
      if (sidebar) sidebar.style.display = 'none';
      const overlays = document.querySelectorAll('[class*="sidebar"]');
      overlays.forEach((el) => {
        const htmlEl = el as HTMLElement;
        if (htmlEl.style) htmlEl.style.display = 'none';
      });
    });
    log("  📌 사이드바 CSS로 숨김 처리");
  } catch {
    // Sidebar might not be present
  }
}

/**
 * Navigate to ChatGPT and wait for the page to be ready.
 * Handles Cloudflare challenges, cookie banners, and popups.
 */
export async function navigateToChatGPT(page: Page): Promise<void> {
  log("  📎 ChatGPT 접속 중...");
  await page.goto(CHATGPT_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Wait for initial page to settle
  await randomDelay(...TIMING.pageLoadSettle);

  // Check for Cloudflare challenge page
  const challengeDetected = await page.$('iframe[title*="challenge"]') ||
                            await page.$('#challenge-running') ||
                            await page.$('.challenge-form') ||
                            await page.$('#cf-stage') ||
                            await page.$('[class*="cf-turnstile"]');
  if (challengeDetected) {
    log("  ⏳ Cloudflare 챌린지 감지 — 자동 해결 대기 중 (최대 30초)...");
    for (let i = 0; i < 15; i++) {
      await randomDelay(2000, 3000);
      const stillBlocked = await page.$('iframe[title*="challenge"]') ||
                          await page.$('#challenge-running') ||
                          await page.$('#cf-stage');
      if (!stillBlocked) {
        log("  ✅ Cloudflare 챌린지 통과!");
        await randomDelay(2000, 4000);
        break;
      }
      if (i === 14) {
        throw new Error("Cloudflare 챌린지 해결 실패 — 이 프록시 IP가 차단되었을 수 있습니다.");
      }
    }
  }

  // Dismiss ALL popups and cookie banners aggressively (try multiple rounds)
  for (let round = 0; round < 3; round++) {
    const dismissSelectors = [
      'button:has-text("모두 허용")',
      'button:has-text("Stay logged out")',
      'button:has-text("Continue without account")',
      'button:has-text("Accept")',
      'button:has-text("OK")',
      'button:has-text("동의")',
      'button:has-text("Dismiss")',
      'button[aria-label="Close"]',
    ];

    let dismissed = false;
    for (const sel of dismissSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click({ force: true });
          log(`  📌 팝업/쿠키 닫기: ${sel}`);
          await randomDelay(800, 1500);
          dismissed = true;
        }
      } catch { /* skip */ }
    }
    if (!dismissed) break;
    await randomDelay(500, 1000);
  }

  // Close the sidebar
  await closeSidebar(page);

  // Extra wait for ProseMirror editor to fully mount
  await randomDelay(2000, 4000);

  // Human-like idle behavior while looking at the page
  await randomMouseMovement(page, 2);
  await microPause();

  log("  ✅ ChatGPT 페이지 로드 완료");
}

/**
 * Find and focus the text input area.
 * ChatGPT now uses a contenteditable div#prompt-textarea (ProseMirror editor),
 * NOT a regular <textarea>.
 */
async function focusInputArea(page: Page): Promise<string> {
  const selectors = [
    'div#prompt-textarea',              // Current ChatGPT: contenteditable div
    '#prompt-textarea',                 // ID fallback (div or textarea)
    'div.ProseMirror[role="textbox"]',  // ProseMirror editor
    'div[contenteditable="true"]',      // Generic contenteditable
    'textarea#prompt-textarea',         // Legacy textarea version
    'textarea',                         // Last resort
  ];

  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout: 10000 });
      // Focus via JS to bypass any overlay
      await page.evaluate((s) => {
        const el = document.querySelector(s) as HTMLElement;
        if (el) {
          el.focus();
          el.click();
        }
      }, sel);
      log(`  📝 입력창 포커스: ${sel}`);
      await randomDelay(300, 600);
      return sel;
    } catch {
      // Selector not found, try next one
      continue;
    }
  }

  throw new Error("ChatGPT 입력창을 찾을 수 없습니다. UI가 변경되었을 수 있습니다.");
}

/**
 * Type text into the ProseMirror input using keyboard events.
 * Uses JS focus first, then pure keyboard typing.
 */
async function typePrompt(page: Page, selector: string, text: string): Promise<void> {
  // Re-focus via JS before typing
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement;
    if (el) {
      el.focus();
      el.click();
    }
  }, selector);
  await randomDelay(300, 600);

  // Type character by character with variable speed
  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // 5% chance of a longer "thinking" pause
    if (Math.random() < 0.05) {
      await randomDelay(500, 1500);
    }

    // Slightly faster for spaces and common chars
    const isSimpleChar = char === ' ' || char === '.' || char === ',';
    const minDelay = isSimpleChar ? TIMING.typeMin * 0.7 : TIMING.typeMin;
    const maxDelay = isSimpleChar ? TIMING.typeMax * 0.7 : TIMING.typeMax;

    await page.keyboard.type(char, {
      delay: randInt(Math.round(minDelay), Math.round(maxDelay)),
    });
  }
}

/**
 * Click the send button.
 * ChatGPT's send button is button#composer-submit-button.
 * Retries a few times to wait for the button to become enabled after typing.
 */
async function clickSendButton(page: Page): Promise<void> {
  await randomDelay(500, 1000);

  const selectors = [
    'button#composer-submit-button',
    'button.composer-submit-btn',
    'button[data-testid="send-button"]',
    'button[aria-label="프롬프트 보내기"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label="메시지 보내기"]',
    'form button[type="submit"]',
  ];

  // Retry up to 5 times (button needs a moment to become enabled after typing)
  for (let attempt = 0; attempt < 5; attempt++) {
    for (const sel of selectors) {
      const btn = await page.$(sel);
      if (btn) {
        const isDisabled = await btn.getAttribute("disabled");
        const ariaDisabled = await btn.getAttribute("aria-disabled");
        if (isDisabled === null && ariaDisabled !== "true") {
          await btn.click({ force: true });
          log(`  📤 전송 버튼 클릭: ${sel}`);
          return;
        }
      }
    }
    // Wait a bit and retry
    await randomDelay(500, 1000);
  }

  // Final fallback: Ctrl+Enter
  log("  📤 전송 버튼 미발견, Ctrl+Enter로 전송");
  await page.keyboard.down("Control");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Control");
}

/**
 * Wait for ChatGPT response to complete streaming.
 * Uses multiple detection strategies:
 * 1. Check for .result-streaming class (present while generating)
 * 2. Check composer-submit-button aria-label (changes to stop/send)
 * 3. Content stability (text stops changing)
 * @param prevResponses - Number of assistant responses already on page (skip these)
 */
async function waitForResponse(page: Page, prevResponses: number = 0): Promise<string> {
  log("  ⏳ 응답 대기 중... (마우스 움직이며 대기)");

  const startTime = Date.now();
  let lastContent = "";
  let stableCount = 0;
  const requiredStable = 3; // Reduced from 5 for faster detection
  let checkCount = 0;
  let hasSeenContent = false;

  while (Date.now() - startTime < TIMING.responseTimeout) {
    // --- Human-like idle behavior while waiting ---
    if (checkCount > 2 && checkCount % 3 === 0) {
      // Only do idle movement after initial checks, and less frequently
      await idleMouseMovement(page, randInt(800, 1500));
    } else {
      await randomDelay(1500, 2500);
    }
    checkCount++;

    // --- Check for Cloudflare captcha ---
    const captcha = await page.$('iframe[title*="challenge"]') ||
                    await page.$('#challenge-running') ||
                    await page.$('.challenge-form');
    if (captcha) {
      log("  ⚠️ Cloudflare 캡차 감지! 수동 해결이 필요할 수 있습니다.");
      await randomDelay(10000, 15000); // Wait and hope it resolves
      continue;
    }

    // --- Check if streaming is still in progress ---
    const isStreaming = await page.$('.result-streaming') ||
                       await page.$('[class*="result-streaming"]');

    // --- Check button state: "stop streaming" means still generating ---
    const stopBtn = await page.$('button#composer-submit-button');
    let buttonLabel = "";
    if (stopBtn) {
      buttonLabel = (await stopBtn.getAttribute("aria-label")) || "";
    }
    const isButtonInStopMode = buttonLabel.includes("Stop") ||
                                buttonLabel.includes("중지") ||
                                buttonLabel.includes("stop");

    // --- Get response content (always get the LATEST response) ---
    const responseSelectors = [
      'div[data-message-author-role="assistant"] .markdown',
      'div[data-message-author-role="assistant"]',
      'article[data-testid^="conversation-turn"] div[data-message-author-role="assistant"]',
      '.markdown.prose',
    ];

    let currentContent = "";
    for (const sel of responseSelectors) {
      const elements = await page.$$(sel);
      if (elements.length > 0) {
        // Always get the last element (most recent response)
        const lastEl = elements[elements.length - 1];
        currentContent = (await lastEl.textContent()) || "";
        if (currentContent.trim()) break;
      }
    }

    if (currentContent.trim()) {
      hasSeenContent = true;
    }

    // --- Still generating: reset stability counter ---
    if (isStreaming || isButtonInStopMode) {
      stableCount = 0;
      // Scroll down to follow streaming text
      if (currentContent.length > lastContent.length) {
        await page.mouse.wheel(0, randInt(80, 200));
      }
      lastContent = currentContent;
      continue;
    }

    // --- Content stability check ---
    if (currentContent === lastContent && currentContent.trim()) {
      stableCount++;
      if (stableCount >= requiredStable) {
        log(`  ✅ 응답 완료 (${currentContent.length} 글자)`);
        return currentContent.trim();
      }
    } else {
      stableCount = 0;
      lastContent = currentContent;
    }

    // --- Quick completion: no streaming, has content, button back to send mode ---
    if (!isStreaming && !isButtonInStopMode && hasSeenContent && currentContent.trim()) {
      log(`  ✅ 응답 완료 (스트리밍 종료, ${currentContent.length} 글자)`);
      return currentContent.trim();
    }
  }

  if (lastContent.trim()) {
    log(`  ⏱️ 타임아웃, 현재까지 수집된 응답 반환 (${lastContent.length} 글자)`);
    return lastContent.trim();
  }

  throw new Error("ChatGPT 응답을 받지 못했습니다 (타임아웃)");
}

/**
 * Read the full response by scrolling down to the bottom,
 * like a human reading the entire answer.
 */
async function readFullResponse(page: Page): Promise<void> {
  log("  👀 응답 전체 읽기 (스크롤 다운)...");

  // Scroll up a bit first, then read downward
  await page.mouse.wheel(0, -200);
  await randomDelay(500, 1000);

  // Scroll down gradually, reading the full response
  await scrollToReadFully(page);

  // Idle at the bottom (finished reading)
  await idleMouseMovement(page, randInt(2000, 5000));
  log("  📖 응답 읽기 완료");
}

/**
 * Main function: Ask the FIRST question to ChatGPT.
 * Navigates to ChatGPT, asks the question, and returns the response.
 * Returns [response, responseCount] where responseCount is the number of responses on the page.
 */
export async function askChatGPT(page: Page, prompt: string): Promise<[string, number]> {
  // 1. Navigate to ChatGPT
  await navigateToChatGPT(page);

  // 2. Look around the page (human-like reading)
  await simulateReading(page);

  // 3-9. Type, send, wait, read
  const response = await typeAndSend(page, prompt, 0);

  return [response, 1];
}

/**
 * Ask a FOLLOW-UP question in the same conversation.
 * Does NOT navigate — types directly into the existing chat.
 * @param previousResponseCount - Number of responses already on the page
 */
export async function askFollowUp(
  page: Page,
  prompt: string,
  previousResponseCount: number
): Promise<[string, number]> {
  // Brief pause before asking next question (human-like thinking)
  log(`  💭 다음 질문 준비 중...`);
  await randomDelay(3000, 8000);

  // Idle mouse movement while "thinking about next question"
  await idleMouseMovement(page, randInt(2000, 4000));

  // Type and send
  const response = await typeAndSend(page, prompt, previousResponseCount);

  return [response, previousResponseCount + 1];
}

/**
 * Internal: Focus input, type prompt, click send, wait for response, read it.
 * Used by both askChatGPT and askFollowUp.
 * @param prevResponses - Number of assistant responses already on page (to detect the NEW one)
 */
async function typeAndSend(page: Page, prompt: string, prevResponses: number): Promise<string> {
  // 1. Focus the input area
  const inputSelector = await focusInputArea(page);
  await randomDelay(500, 1500);

  // 2. Type the prompt
  log(`  ⌨️ 프롬프트 입력 시작 (${prompt.length} 글자)...`);
  await typePrompt(page, inputSelector, prompt);

  // 3. Pause before sending (reviewing what was typed)
  await randomDelay(...TIMING.preEnterDelay);

  // 4. Jittery mouse movement before clicking send
  const viewport = page.viewportSize();
  if (viewport) {
    await realisticMouseMove(
      page,
      randInt(viewport.width * 0.6, viewport.width * 0.8),
      randInt(viewport.height * 0.7, viewport.height * 0.9)
    );
  }

  // 5. Click send
  await clickSendButton(page);

  // 6. Wait for the NEW response (skip previous responses)
  const response = await waitForResponse(page, prevResponses);

  // 7. Read full response (scroll to bottom)
  await readFullResponse(page);

  return response;
}

