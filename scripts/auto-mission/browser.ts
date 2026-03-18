import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Browser, BrowserContext } from "playwright";
import { getProxyForUser, PROXY_ENABLED, VIEWPORTS, USER_AGENTS, LOCALES, TIMEZONES } from "./config";
import { randInt, log } from "./human-behavior";

// Apply stealth plugin to bypass Cloudflare Turnstile and bot detection
chromium.use(StealthPlugin());

/**
 * Pick a random item from an array
 */
function pickRandom<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

/**
 * Generate a unique browser fingerprint for each user session.
 * Each user gets a different combination of viewport, user agent, locale, etc.
 */
function generateFingerprint(userIndex: number) {
  // Use index to deterministically vary, but add randomness too
  const viewport = VIEWPORTS[(userIndex + randInt(0, 2)) % VIEWPORTS.length];
  const userAgent = USER_AGENTS[(userIndex + randInt(0, 2)) % USER_AGENTS.length];
  const locale = pickRandom(LOCALES);
  const timezone = pickRandom(TIMEZONES);

  return { viewport, userAgent, locale, timezone };
}

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
}

/**
 * Launch a stealthy browser with unique fingerprint and per-user proxy.
 * Uses playwright-extra with stealth plugin to bypass Cloudflare Turnstile.
 *
 * @param userIndex  - Index for fingerprint & proxy variation
 * @param useProxy   - Whether to use proxy (can be disabled for testing)
 */
export async function launchBrowser(
  userIndex: number,
  useProxy = true
): Promise<BrowserSession> {
  const fp = generateFingerprint(userIndex);

  log(
    `🌐 브라우저 시작 [User #${userIndex}] | ` +
      `${fp.viewport.width}x${fp.viewport.height} | ${fp.locale} | ${fp.timezone}`
  );

  const launchOptions: Record<string, unknown> = {
    headless: false, // Set to true for production / server
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-infobars",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      `--window-size=${fp.viewport.width},${fp.viewport.height}`,
    ],
  };

  // Assign a unique proxy from the pool for this user
  const proxy = useProxy ? getProxyForUser(userIndex) : null;
  if (proxy) {
    launchOptions.proxy = {
      server: `http://${proxy.host}:${proxy.port}`,
      username: proxy.username,
      password: proxy.password,
    };
    log(`  🔒 프록시: ${proxy.username} @ ${proxy.host}:${proxy.port}`);
  } else {
    log(`  ⚡ 프록시 없이 직접 접속`);
  }

  const browser = await chromium.launch(launchOptions);

  const context = await browser.newContext({
    viewport: fp.viewport,
    userAgent: fp.userAgent,
    locale: fp.locale,
    timezoneId: fp.timezone,
    // Disable webdriver flag
    javaScriptEnabled: true,
    bypassCSP: true,
    // Additional stealth headers
    extraHTTPHeaders: {
      "Accept-Language": `${fp.locale},en;q=0.9`,
      "sec-ch-ua-platform": '"Windows"',
    },
  });

  // Inject additional stealth scripts (on top of stealth plugin)
  await context.addInitScript(() => {
    // Override navigator.webdriver
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });

    // Override chrome runtime (make it look like a real Chrome)
    (window as unknown as Record<string, unknown>).chrome = {
      runtime: {
        onConnect: undefined,
        onMessage: undefined,
      },
      loadTimes: () => ({}),
      csi: () => ({}),
    };

    // Override permissions query
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: PermissionDescriptor) => {
      if (parameters.name === "notifications") {
        return Promise.resolve({
          state: "denied" as PermissionState,
          onchange: null,
        } as PermissionStatus);
      }
      return originalQuery.call(window.navigator.permissions, parameters);
    };

    // Override plugins (realistic Chrome plugins)
    Object.defineProperty(navigator, "plugins", {
      get: () => {
        const plugins = [
          { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
          { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
          { name: "Native Client", filename: "internal-nacl-plugin" },
        ];
        const arr = Object.create(PluginArray.prototype);
        Object.defineProperty(arr, "length", { get: () => plugins.length });
        plugins.forEach((p, i) => {
          Object.defineProperty(arr, i, { get: () => p });
        });
        return arr;
      },
    });

    // Override languages
    Object.defineProperty(navigator, "languages", {
      get: () => ["ko-KR", "ko", "en-US", "en"],
    });

    // Override connection info
    Object.defineProperty(navigator, "connection", {
      get: () => ({
        effectiveType: "4g",
        rtt: 50,
        downlink: 10,
        saveData: false,
      }),
    });

    // Hide automation-related properties
    Object.defineProperty(navigator, "maxTouchPoints", {
      get: () => 0,
    });

    // Override hardware concurrency (realistic value)
    Object.defineProperty(navigator, "hardwareConcurrency", {
      get: () => 8,
    });

    // Override device memory
    Object.defineProperty(navigator, "deviceMemory", {
      get: () => 8,
    });
  });

  return { browser, context };
}

/**
 * Safely close browser session
 */
export async function closeBrowser(session: BrowserSession): Promise<void> {
  try {
    await session.context.close();
    await session.browser.close();
    log(`  ✅ 브라우저 종료 완료`);
  } catch (err) {
    log(`  ⚠️ 브라우저 종료 중 오류:`, String(err));
  }
}
