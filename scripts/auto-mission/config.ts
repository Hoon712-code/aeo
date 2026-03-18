import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load .env.local from project root (works from both source and dist)
const envPath1 = path.resolve(__dirname, "../../.env.local");  // from scripts/auto-mission/
const envPath2 = path.resolve(__dirname, "../../../.env.local"); // from scripts/auto-mission/dist/
const envPath = fs.existsSync(envPath1) ? envPath1 : envPath2;
dotenv.config({ path: envPath });

// ─── Supabase ───────────────────────────────────────
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ─── Proxy (Webshare Residential) ───────────────────
export interface ProxyInfo {
  host: string;
  port: number;
  username: string;
  password: string;
}

const PROXY_HOST = process.env.PROXY_HOST || "";
const PROXY_PORT = parseInt(process.env.PROXY_PORT || "0", 10);
const PROXY_USERNAME = process.env.PROXY_USERNAME || "";
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || "";
const PROXY_COUNTRY = process.env.PROXY_COUNTRY || "";
const PROXY_MAX_SLOTS = parseInt(process.env.PROXY_MAX_SLOTS || "100", 10);

export const PROXY_ENABLED = !!(PROXY_HOST && PROXY_PORT && PROXY_USERNAME);

/**
 * Get a proxy for a specific user index.
 * Webshare Residential format: username-COUNTRY-N (e.g., yxbwhbfu-KR-1)
 * Each user gets a unique Korean IP address.
 */
export function getProxyForUser(userIndex: number): ProxyInfo | null {
  if (!PROXY_ENABLED) return null;

  // Slot number 1-based, wraps around if more users than slots
  const slot = (userIndex % PROXY_MAX_SLOTS) + 1;

  // Build username with country and slot suffix
  const username = PROXY_COUNTRY
    ? `${PROXY_USERNAME}-${PROXY_COUNTRY}-${slot}`
    : PROXY_USERNAME;

  return {
    host: PROXY_HOST,
    port: PROXY_PORT,
    username,
    password: PROXY_PASSWORD,
  };
}


// ─── Human Behavior Timing (ms) ─────────────────────
export const TIMING = {
  /** Per-character typing delay range */
  typeMin: 45,
  typeMax: 160,
  /** Pause after typing before pressing Enter */
  preEnterDelay: [800, 2500] as [number, number],
  /** Wait for ChatGPT response streaming to complete */
  responseTimeout: 120_000, // 2 minutes max
  /** Random delay between users */
  interUserDelayMin: 3_000, // 3 seconds
  interUserDelayMax: 7_000, // 7 seconds
  /** Small pauses during interaction */
  microPauseMin: 500,
  microPauseMax: 2000,
  /** Page load settle time */
  pageLoadSettle: [3000, 6000] as [number, number],
};

// ─── Viewport Pools ─────────────────────────────────
export const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 1600, height: 900 },
  { width: 1360, height: 768 },
  { width: 1680, height: 1050 },
];

// ─── User Agent Pool ────────────────────────────────
export const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
];

// ─── Language Pool ──────────────────────────────────
export const LOCALES = ["ko-KR", "ko", "en-US", "en-GB"];
export const TIMEZONES = [
  "Asia/Seoul",
  "Asia/Tokyo",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
];

// ─── ChatGPT ────────────────────────────────────────
export const CHATGPT_URL = "https://chatgpt.com/";
